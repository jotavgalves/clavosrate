import { requirePermission } from './access';
import { json } from './http';

interface EnvLike {
  DB: D1Database;
}

export async function adminRiskCases(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const access = await requirePermission(env.DB, request, requestId, 'admin.risk.read');
  if ('response' in access) return access.response;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get('limit') || '50');
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const status = (url.searchParams.get('status') || '').toUpperCase();
  const allowedStatus = new Set(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']);

  const sql = `SELECT r.id, r.case_type, r.severity, r.status, r.organization_id,
                      o.trade_name AS organization_name, r.person_id, p.full_name AS person_name,
                      r.loan_id, r.document_id, r.title, r.details_json,
                      r.assigned_to_user_id, r.resolved_by_user_id, r.resolution,
                      r.created_at, r.updated_at, r.resolved_at
                 FROM risk_cases r
                 LEFT JOIN organizations o ON o.id = r.organization_id
                 LEFT JOIN persons p ON p.id = r.person_id
                ${allowedStatus.has(status) ? 'WHERE r.status = ?' : ''}
                ORDER BY CASE r.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                         r.created_at DESC
                LIMIT ?`;

  const result = allowedStatus.has(status)
    ? await env.DB.prepare(sql).bind(status, limit).all()
    : await env.DB.prepare(sql).bind(limit).all();

  return json({ items: result.results, request_id: requestId }, requestId);
}
