import type { Role } from '@clavos/permissions';
import { apiError, json } from './http';
import {
  clearSessionCookie,
  createSession,
  getSessionPrincipal,
  hashPassword,
  normalizeEmail,
  revokeCurrentSession,
  sessionCookie,
  verifyPassword
} from './auth';
import { identityLookupHmac, isValidCpf, normalizeIdentityDocument } from './identifiers';

interface EnvLike {
  DB: D1Database;
  APP_ENV: string;
  CPF_HMAC_SECRET: string;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json<T>();
  } catch {
    return null;
  }
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function accessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

const DOCUMENT_TYPES = new Set(['CPF', 'RNM', 'CEDULA_CO', 'CEDULA_VE']);

export async function registerMerchant(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const body = await readJson<{
    full_name?: string;
    document_type?: string;
    document_number?: string;
    birth_date?: string;
    route_state?: string;
    route_city?: string;
  }>(request);

  const fullName = body?.full_name?.trim() || '';
  const documentType = body?.document_type?.trim().toUpperCase() || '';
  const documentNumber = normalizeIdentityDocument(body?.document_number || '');
  const birthDate = body?.birth_date?.trim() || '';
  const routeState = body?.route_state?.trim() || '';
  const routeCity = body?.route_city?.trim() || '';

  if (!fullName || !DOCUMENT_TYPES.has(documentType) || !documentNumber || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !routeState || !routeCity) {
    return apiError(requestId, 400, 'INVALID_REGISTRATION', 'Completa nombre, documento, fecha de nacimiento, estado y ciudad de la ruta.');
  }
  if (documentType === 'CPF' && !isValidCpf(documentNumber)) {
    return apiError(requestId, 400, 'INVALID_DOCUMENT', 'El CPF informado no es válido.');
  }
  if (documentType !== 'CPF' && documentNumber.length < 5) {
    return apiError(requestId, 400, 'INVALID_DOCUMENT', 'El número de documento informado no es válido.');
  }

  const documentHmac = await identityLookupHmac(documentType, documentNumber, env.CPF_HMAC_SECRET);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE identity_document_hmac = ? LIMIT 1').bind(documentHmac).first();
  if (existing) return apiError(requestId, 409, 'DOCUMENT_ALREADY_EXISTS', 'Ya existe una cuenta registrada con este documento.');

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const generatedAccessCode = accessCode();
  const passwordHash = await hashPassword(generatedAccessCode);
  const internalEmail = `${userId}@accounts.clavos.internal`;
  const routeName = `Ruta ${routeCity} · ${fullName}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
        (id, email, password_hash, full_name, status, identity_document_type, identity_document_hmac, birth_date, route_state, route_city, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, internalEmail, passwordHash, fullName, documentType, documentHmac, birthDate, routeState, routeCity, now, now),
    env.DB.prepare(
      `INSERT INTO organizations
        (id, legal_name, trade_name, country_code, state_region, city, status, created_at, updated_at)
       VALUES (?, ?, ?, 'BR', ?, ?, 'ACTIVE', ?, ?)`
    ).bind(organizationId, routeName, routeName, routeState, routeCity, now, now),
    env.DB.prepare(
      `INSERT INTO organization_users (organization_id, user_id, role, created_at)
       VALUES (?, ?, 'MERCHANT_OWNER', ?)`
    ).bind(organizationId, userId, now),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, reason, created_at)
       VALUES (?, 'USER', ?, ?, 'ORGANIZATION_REGISTERED', 'ORGANIZATION', ?, 'SELF_SERVICE_IDENTITY_REGISTRATION', ?)`
    ).bind(crypto.randomUUID(), userId, organizationId, organizationId, now)
  ]);

  const session = await createSession(env.DB, request, userId, organizationId, 'MERCHANT_OWNER');
  const response = json({
    user: { id: userId, full_name: fullName, document_type: documentType, route_state: routeState, route_city: routeCity },
    organization: { id: organizationId, trade_name: routeName },
    role: 'MERCHANT_OWNER',
    access_code: generatedAccessCode,
    access_code_notice: 'Guarda este código. Lo necesitarás junto con tu documento para volver a ingresar.',
    expires_at: session.expiresAt,
    request_id: requestId
  }, requestId, { status: 201 });
  response.headers.append('set-cookie', sessionCookie(session.token, env.APP_ENV === 'production'));
  return response;
}

export async function login(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const body = await readJson<{
    email?: string;
    password?: string;
    document_type?: string;
    document_number?: string;
    access_code?: string;
    organization_id?: string;
  }>(request);

  const email = normalizeEmail(body?.email || '');
  const password = body?.password || body?.access_code || '';
  const documentType = body?.document_type?.trim().toUpperCase() || '';
  const documentNumber = normalizeIdentityDocument(body?.document_number || '');

  let user: { id: string; email: string; password_hash: string; full_name: string; status: string } | null = null;
  let attemptKey = email;

  if (documentType && documentNumber) {
    if (!DOCUMENT_TYPES.has(documentType)) return apiError(requestId, 400, 'INVALID_LOGIN', 'Selecciona un tipo de documento válido.');
    const documentHmac = await identityLookupHmac(documentType, documentNumber, env.CPF_HMAC_SECRET);
    attemptKey = `DOC:${documentHmac.slice(0, 24)}`;
    user = await env.DB.prepare(
      'SELECT id, email, password_hash, full_name, status FROM users WHERE identity_document_hmac = ? LIMIT 1'
    ).bind(documentHmac).first<typeof user extends infer T ? NonNullable<T> : never>();
  } else if (email) {
    user = await env.DB.prepare(
      'SELECT id, email, password_hash, full_name, status FROM users WHERE email = ? LIMIT 1'
    ).bind(email).first<{ id: string; email: string; password_hash: string; full_name: string; status: string }>();
  } else {
    return apiError(requestId, 400, 'INVALID_LOGIN', 'Informa tu documento y código de acceso.');
  }

  if (!password) return apiError(requestId, 400, 'INVALID_LOGIN', 'El código de acceso o contraseña es obligatorio.');

  const ok = !!user && user.status === 'ACTIVE' && await verifyPassword(password, user.password_hash);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO login_attempts (id, email_normalized, user_id, successful, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), attemptKey, user?.id || null, ok ? 1 : 0, request.headers.get('user-agent'), now).run();

  if (!ok || !user) return apiError(requestId, 401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.');

  const platform = await env.DB.prepare('SELECT role FROM platform_user_roles WHERE user_id = ? LIMIT 1')
    .bind(user.id).first<{ role: Role }>();

  let organizationId: string | null = null;
  let role: Role | null = platform?.role || null;

  if (!role) {
    const membership = body?.organization_id
      ? await env.DB.prepare(
          `SELECT organization_id, role FROM organization_users
           WHERE user_id = ? AND organization_id = ? LIMIT 1`
        ).bind(user.id, body.organization_id).first<{ organization_id: string; role: Role }>()
      : await env.DB.prepare(
          `SELECT organization_id, role FROM organization_users
           WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`
        ).bind(user.id).first<{ organization_id: string; role: Role }>();

    if (!membership) return apiError(requestId, 403, 'NO_ACTIVE_MEMBERSHIP', 'La cuenta no tiene una organización disponible.');
    organizationId = membership.organization_id;
    role = membership.role;
  }

  const session = await createSession(env.DB, request, user.id, organizationId, role);
  const response = json({
    user: { id: user.id, email: user.email, full_name: user.full_name },
    organization_id: organizationId,
    role,
    expires_at: session.expiresAt,
    request_id: requestId
  }, requestId);
  response.headers.append('set-cookie', sessionCookie(session.token, env.APP_ENV === 'production'));
  return response;
}

export async function me(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const principal = await getSessionPrincipal(env.DB, request);
  if (!principal) return apiError(requestId, 401, 'UNAUTHENTICATED', 'No existe una sesión válida.');
  return json({
    user: { id: principal.userId, email: principal.email, full_name: principal.fullName },
    organization_id: principal.organizationId,
    role: principal.role,
    request_id: requestId
  }, requestId);
}

export async function logout(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  await revokeCurrentSession(env.DB, request);
  const response = json({ ok: true, request_id: requestId }, requestId);
  response.headers.append('set-cookie', clearSessionCookie(env.APP_ENV === 'production'));
  return response;
}
