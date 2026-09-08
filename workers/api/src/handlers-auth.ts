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

interface EnvLike {
  DB: D1Database;
  APP_ENV: string;
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

export async function registerMerchant(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const body = await readJson<{
    email?: string;
    password?: string;
    full_name?: string;
    legal_name?: string;
    trade_name?: string;
    city?: string;
    state_region?: string;
  }>(request);

  const email = normalizeEmail(body?.email || '');
  const password = body?.password || '';
  const fullName = body?.full_name?.trim() || '';
  const legalName = body?.legal_name?.trim() || '';
  const tradeName = body?.trade_name?.trim() || legalName;

  if (!validEmail(email) || password.length < 10 || !fullName || !legalName) {
    return apiError(requestId, 400, 'INVALID_REGISTRATION', 'Completa correo, contraseña de al menos 10 caracteres, responsable y razón social.');
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first();
  if (existing) return apiError(requestId, 409, 'EMAIL_ALREADY_EXISTS', 'Ya existe una cuenta con este correo.');

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).bind(userId, email, passwordHash, fullName, now, now),
    env.DB.prepare(
      `INSERT INTO organizations
        (id, legal_name, trade_name, country_code, state_region, city, status, created_at, updated_at)
       VALUES (?, ?, ?, 'BR', ?, ?, 'ACTIVE', ?, ?)`
    ).bind(organizationId, legalName, tradeName, body?.state_region?.trim() || null, body?.city?.trim() || null, now, now),
    env.DB.prepare(
      `INSERT INTO organization_users (organization_id, user_id, role, created_at)
       VALUES (?, ?, 'MERCHANT_OWNER', ?)`
    ).bind(organizationId, userId, now),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, reason, created_at)
       VALUES (?, 'USER', ?, ?, 'ORGANIZATION_REGISTERED', 'ORGANIZATION', ?, 'SELF_SERVICE_REGISTRATION', ?)`
    ).bind(crypto.randomUUID(), userId, organizationId, organizationId, now)
  ]);

  const session = await createSession(env.DB, request, userId, organizationId, 'MERCHANT_OWNER');
  const response = json({
    user: { id: userId, email, full_name: fullName },
    organization: { id: organizationId, legal_name: legalName, trade_name: tradeName },
    role: 'MERCHANT_OWNER',
    expires_at: session.expiresAt,
    request_id: requestId
  }, requestId, { status: 201 });
  response.headers.append('set-cookie', sessionCookie(session.token, env.APP_ENV === 'production'));
  return response;
}

export async function login(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; organization_id?: string }>(request);
  const email = normalizeEmail(body?.email || '');
  const password = body?.password || '';
  if (!email || !password) return apiError(requestId, 400, 'INVALID_LOGIN', 'Correo y contraseña son obligatorios.');

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, full_name, status FROM users WHERE email = ? LIMIT 1'
  ).bind(email).first<{ id: string; email: string; password_hash: string; full_name: string; status: string }>();

  const ok = !!user && user.status === 'ACTIVE' && await verifyPassword(password, user.password_hash);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO login_attempts (id, email_normalized, user_id, successful, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), email, user?.id || null, ok ? 1 : 0, request.headers.get('user-agent'), now).run();

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
