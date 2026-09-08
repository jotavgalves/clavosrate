import { requirePermission } from './access';
import { json } from './http';

interface EnvLike {
  DB: D1Database;
}

function limitFrom(url: URL): number {
  const value = Number(url.searchParams.get('limit') || '50');
  if (!Number.isInteger(value)) return 50;
  return Math.min(Math.max(value, 1), 200);
}

export async function adminDashboard(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.dashboard.read');
  if ('response' in auth) return auth.response;

  const today = new Date().toISOString().slice(0, 10);
  const [orgs, users, persons, loans, documents, disputes, money] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM organizations WHERE status = 'ACTIVE'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'ACTIVE'").first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM persons').first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM loans WHERE status IN ('ACTIVE','PENDING_REVIEW')").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM person_documents WHERE review_status = 'PENDING'").first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM disputes WHERE status = 'OPEN'").first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(principal_minor), 0) AS principal_minor,
              COALESCE(SUM(contractual_total_minor), 0) AS contractual_total_minor
         FROM loans
        WHERE status IN ('ACTIVE','PENDING_REVIEW')`
    ).first<{ principal_minor: number; contractual_total_minor: number }>()
  ]);

  const todayPayments = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS amount_minor
       FROM payments WHERE substr(paid_at, 1, 10) = ?`
  ).bind(today).first<{ n: number; amount_minor: number }>();

  return json({
    counts: {
      active_organizations: orgs?.n || 0,
      active_users: users?.n || 0,
      persons: persons?.n || 0,
      active_loans: loans?.n || 0,
      pending_documents: documents?.n || 0,
      open_disputes: disputes?.n || 0
    },
    portfolio: money || { principal_minor: 0, contractual_total_minor: 0 },
    today: { date: today, payments_count: todayPayments?.n || 0, received_minor: todayPayments?.amount_minor || 0 },
    request_id: requestId
  }, requestId);
}

export async function adminOrganizations(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.organization.read');
  if ('response' in auth) return auth.response;
  const url = new URL(request.url);
  const limit = limitFrom(url);

  const result = await env.DB.prepare(
    `SELECT o.id, o.legal_name, o.trade_name, o.country_code, o.state_region, o.city, o.status, o.created_at,
            COUNT(DISTINCT ou.user_id) AS users_count,
            COUNT(DISTINCT l.id) AS loans_count,
            COALESCE(SUM(l.principal_minor), 0) AS principal_minor
       FROM organizations o
       LEFT JOIN organization_users ou ON ou.organization_id = o.id
       LEFT JOIN loans l ON l.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}

export async function adminUsers(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.user.read');
  if ('response' in auth) return auth.response;
  const limit = limitFrom(new URL(request.url));

  const result = await env.DB.prepare(
    `SELECT u.id, u.email, u.full_name, u.status, u.created_at,
            pur.role AS platform_role,
            COUNT(DISTINCT ou.organization_id) AS organizations_count,
            MAX(s.last_seen_at) AS last_seen_at
       FROM users u
       LEFT JOIN platform_user_roles pur ON pur.user_id = u.id
       LEFT JOIN organization_users ou ON ou.user_id = u.id
       LEFT JOIN sessions s ON s.user_id = u.id AND s.revoked_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}

export async function adminLoans(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.loan.read');
  if ('response' in auth) return auth.response;
  const limit = limitFrom(new URL(request.url));

  const result = await env.DB.prepare(
    `SELECT l.id, l.organization_id, o.trade_name AS organization_name,
            l.person_id, p.full_name AS person_name,
            l.principal_minor, l.contractual_total_minor, l.currency,
            l.frequency, l.installment_count, l.status, l.verification_status,
            l.disbursed_at, l.first_due_date, l.created_at,
            COALESCE(SUM(pay.amount_minor), 0) AS paid_minor
       FROM loans l
       JOIN organizations o ON o.id = l.organization_id
       JOIN persons p ON p.id = l.person_id
       LEFT JOIN payments pay ON pay.loan_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}

export async function adminDocuments(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.document.read');
  if ('response' in auth) return auth.response;
  const limit = limitFrom(new URL(request.url));

  const result = await env.DB.prepare(
    `SELECT d.id, d.person_id, p.full_name AS person_name, p.birth_date, p.identity_status,
            d.organization_id, o.trade_name AS organization_name, d.loan_id,
            d.document_type, d.document_role, d.review_status, d.review_reason,
            d.original_filename, d.mime_type, d.size_bytes, d.sha256,
            d.uploaded_by_user_id, d.reviewed_by_user_id, d.created_at, d.reviewed_at
       FROM person_documents d
       JOIN persons p ON p.id = d.person_id
       LEFT JOIN organizations o ON o.id = d.organization_id
      ORDER BY CASE d.review_status WHEN 'PENDING' THEN 0 WHEN 'NEEDS_CORRECTION' THEN 1 ELSE 2 END, d.created_at ASC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}

export async function adminDisputes(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.dispute.read');
  if ('response' in auth) return auth.response;
  const limit = limitFrom(new URL(request.url));

  const result = await env.DB.prepare(
    `SELECT d.id, d.person_id, p.full_name AS person_name, d.loan_id,
            d.organization_id, o.trade_name AS organization_name,
            d.status, d.reason, d.resolution, d.created_at, d.updated_at
       FROM disputes d
       JOIN persons p ON p.id = d.person_id
       LEFT JOIN organizations o ON o.id = d.organization_id
      ORDER BY CASE d.status WHEN 'OPEN' THEN 0 ELSE 1 END, d.created_at ASC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}

export async function adminAudit(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'admin.audit.read');
  if ('response' in auth) return auth.response;
  const limit = limitFrom(new URL(request.url));

  const result = await env.DB.prepare(
    `SELECT id, actor_type, actor_id, organization_id, action, target_type, target_id,
            reason, created_at
       FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ?`
  ).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}
