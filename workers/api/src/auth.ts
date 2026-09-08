import type { Role } from '@clavos/permissions';

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export interface SessionPrincipal {
  sessionId: string;
  userId: string;
  organizationId: string | null;
  role: Role;
  email: string;
  fullName: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = encoded.split('$');
  if (scheme !== 'pbkdf2_sha256' || !iterationsRaw || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 500_000) return false;
  const actual = await derivePassword(password, base64UrlToBytes(saltRaw), iterations);
  return timingSafeEqual(actual, base64UrlToBytes(hashRaw));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function createSession(
  db: D1Database,
  request: Request,
  userId: string,
  organizationId: string | null,
  role: Role
): Promise<{ token: string; expiresAt: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(raw);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ipHash = ip ? await sha256(ip) : null;

  await db.prepare(
    `INSERT INTO sessions
      (id, token_hash, user_id, organization_id, role, user_agent, ip_hash, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    tokenHash,
    userId,
    organizationId,
    role,
    request.headers.get('user-agent'),
    ipHash,
    now.toISOString(),
    now.toISOString(),
    expires.toISOString()
  ).run();

  return { token, expiresAt: expires.toISOString() };
}

export function sessionCookie(token: string, production: boolean): string {
  const secure = production ? '; Secure' : '';
  return `clavos_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`;
}

export function clearSessionCookie(production: boolean): string {
  const secure = production ? '; Secure' : '';
  return `clavos_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function revokeCurrentSession(db: D1Database, request: Request): Promise<void> {
  const token = parseCookie(request, 'clavos_session');
  if (!token) return;
  const tokenHash = await sha256(token);
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

export async function getSessionPrincipal(db: D1Database, request: Request): Promise<SessionPrincipal | null> {
  const token = parseCookie(request, 'clavos_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();

  const row = await db.prepare(
    `SELECT s.id AS session_id, s.user_id, s.organization_id, s.role,
            u.email, u.full_name, u.status AS user_status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
      LIMIT 1`
  ).bind(tokenHash, now).first<{
    session_id: string;
    user_id: string;
    organization_id: string | null;
    role: Role;
    email: string;
    full_name: string;
    user_status: string;
  }>();

  if (!row || row.user_status !== 'ACTIVE') return null;

  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, row.session_id).run();

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    email: row.email,
    fullName: row.full_name
  };
}
