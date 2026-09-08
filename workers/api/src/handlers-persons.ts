import { requireOrganization, requirePermission } from './access';
import { apiError, json } from './http';
import { cpfLookupHmac, encryptCpf, isValidCpf, normalizeCpf } from './identifiers';

interface EnvLike {
  DB: D1Database;
  CPF_HMAC_SECRET: string;
  CPF_ENCRYPTION_KEY_B64: string;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json<T>();
  } catch {
    return null;
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

function maskCpf(cpf: string): string {
  const digits = normalizeCpf(cpf);
  return digits.length === 11 ? `***.${digits.slice(3, 6)}.***-${digits.slice(-2)}` : '***';
}

export async function createPerson(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.person.create');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;

  const body = await readJson<{
    cpf?: string;
    full_name?: string;
    birth_date?: string;
    city?: string;
    state_region?: string;
  }>(request);

  const cpf = body?.cpf || '';
  const fullName = body?.full_name?.trim() || '';
  const birthDate = body?.birth_date || '';
  if (!isValidCpf(cpf) || !fullName || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return apiError(requestId, 400, 'INVALID_PERSON', 'Revisa CPF, nombre completo y fecha de nacimiento.');
  }

  const lookup = await cpfLookupHmac(cpf, env.CPF_HMAC_SECRET);
  const existing = await env.DB.prepare(
    `SELECT id, full_name, birth_date, identity_status FROM persons WHERE cpf_lookup_hmac = ? LIMIT 1`
  ).bind(lookup).first<{ id: string; full_name: string; birth_date: string; identity_status: string }>();

  if (existing) {
    return json({
      id: existing.id,
      full_name: existing.full_name,
      birth_date: existing.birth_date,
      identity_status: existing.identity_status,
      already_exists: true,
      request_id: requestId
    }, requestId, { status: 200 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const encryptedCpf = await encryptCpf(cpf, env.CPF_ENCRYPTION_KEY_B64);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO persons
        (id, cpf_lookup_hmac, cpf_encrypted, full_name, birth_date, city, state_region, identity_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED', ?, ?)`
    ).bind(id, lookup, encryptedCpf, fullName, birthDate, body?.city?.trim() || null, body?.state_region?.trim() || null, now, now),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, after_json, created_at)
       VALUES (?, 'USER', ?, ?, 'PERSON_CREATED', 'PERSON', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      auth.principal.userId,
      auth.principal.organizationId,
      id,
      JSON.stringify({ full_name: fullName, birth_date: birthDate, cpf_masked: maskCpf(cpf) }),
      now
    )
  ]);

  return json({
    id,
    full_name: fullName,
    birth_date: birthDate,
    identity_status: 'UNVERIFIED',
    already_exists: false,
    request_id: requestId
  }, requestId, { status: 201 });
}

export async function searchPerson(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.person.search');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;

  const body = await readJson<{ cpf?: string; full_name?: string; birth_date?: string; reason?: string }>(request);
  const cpf = body?.cpf || '';
  const fullName = body?.full_name?.trim() || '';
  const birthDate = body?.birth_date || '';
  const reason = body?.reason?.trim() || '';

  if (!isValidCpf(cpf) || !fullName || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || reason.length < 3) {
    return apiError(requestId, 400, 'INVALID_SEARCH', 'CPF, nombre, fecha de nacimiento y motivo son obligatorios.');
  }

  const lookup = await cpfLookupHmac(cpf, env.CPF_HMAC_SECRET);
  const row = await env.DB.prepare(
    `SELECT p.id, p.full_name, p.birth_date, p.city, p.state_region, p.identity_status,
            s.score, s.rating, s.confidence, s.calculated_at
       FROM persons p
       LEFT JOIN scores s ON s.person_id = p.id
      WHERE p.cpf_lookup_hmac = ?
      LIMIT 1`
  ).bind(lookup).first<{
    id: string;
    full_name: string;
    birth_date: string;
    city: string | null;
    state_region: string | null;
    identity_status: string;
    score: number | null;
    rating: string | null;
    confidence: string | null;
    calculated_at: string | null;
  }>();

  const identityMatches = !!row && normalizeName(row.full_name) === normalizeName(fullName) && row.birth_date === birthDate;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_type, actor_id, organization_id, action, target_type, target_id, reason, after_json, created_at)
     VALUES (?, 'USER', ?, ?, 'PERSON_SEARCHED', 'PERSON', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    auth.principal.userId,
    auth.principal.organizationId,
    identityMatches ? row!.id : null,
    reason,
    JSON.stringify({ found: !!row, identity_match: identityMatches, cpf_masked: maskCpf(cpf) }),
    now
  ).run();

  if (!row || !identityMatches) {
    return json({ found: false, request_id: requestId }, requestId);
  }

  return json({
    found: true,
    person: {
      id: row.id,
      full_name: row.full_name,
      birth_date: row.birth_date,
      city: row.city,
      state_region: row.state_region,
      identity_status: row.identity_status,
      cpf_masked: maskCpf(cpf)
    },
    score: row.score === null ? null : {
      value: row.score,
      rating: row.rating,
      confidence: row.confidence,
      calculated_at: row.calculated_at
    },
    request_id: requestId
  }, requestId);
}
