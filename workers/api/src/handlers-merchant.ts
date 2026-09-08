import { requireOrganization, requirePermission } from './access';
import { apiError, json } from './http';

interface EnvLike {
  DB: D1Database;
  JOBS: Queue;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json<T>();
  } catch {
    return null;
  }
}

export async function merchantDashboard(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.dashboard.read');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;
  const organizationId = auth.principal.organizationId!;
  const today = new Date().toISOString().slice(0, 10);

  const [loanTotals, dueToday, paidToday] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS active_loans,
              COALESCE(SUM(principal_minor), 0) AS principal_minor,
              COALESCE(SUM(contractual_total_minor), 0) AS contractual_total_minor
         FROM loans
        WHERE organization_id = ? AND status IN ('ACTIVE','PENDING_REVIEW')`
    ).bind(organizationId).first<{ active_loans: number; principal_minor: number; contractual_total_minor: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS installments_due,
              COALESCE(SUM(i.expected_minor), 0) AS expected_minor
         FROM installments i
         JOIN loans l ON l.id = i.loan_id
        WHERE l.organization_id = ? AND i.due_date = ? AND i.status NOT IN ('PAID','CANCELLED')`
    ).bind(organizationId, today).first<{ installments_due: number; expected_minor: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS payments_count,
              COALESCE(SUM(p.amount_minor), 0) AS received_minor
         FROM payments p
         JOIN loans l ON l.id = p.loan_id
        WHERE l.organization_id = ? AND substr(p.paid_at, 1, 10) = ?`
    ).bind(organizationId, today).first<{ payments_count: number; received_minor: number }>()
  ]);

  return json({
    organization_id: organizationId,
    date: today,
    portfolio: loanTotals || { active_loans: 0, principal_minor: 0, contractual_total_minor: 0 },
    collections_today: {
      installments_due: dueToday?.installments_due || 0,
      expected_minor: dueToday?.expected_minor || 0,
      payments_count: paidToday?.payments_count || 0,
      received_minor: paidToday?.received_minor || 0
    },
    request_id: requestId
  }, requestId);
}

export async function listLoans(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.loan.read');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;
  const organizationId = auth.principal.organizationId!;

  const rows = await env.DB.prepare(
    `SELECT l.id, l.person_id, p.full_name AS person_name,
            l.principal_minor, l.contractual_total_minor, l.currency,
            l.disbursed_at, l.first_due_date, l.installment_count,
            l.frequency, l.status, l.verification_status, l.created_at
       FROM loans l
       JOIN persons p ON p.id = l.person_id
      WHERE l.organization_id = ?
      ORDER BY l.created_at DESC
      LIMIT 100`
  ).bind(organizationId).all();

  return json({ items: rows.results, request_id: requestId }, requestId);
}

export async function createLoan(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.loan.create');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;
  const organizationId = auth.principal.organizationId!;

  const body = await readJson<{
    person_id?: string;
    principal_minor?: number;
    contractual_total_minor?: number;
    disbursed_at?: string;
    first_due_date?: string;
    installment_count?: number;
    frequency?: string;
  }>(request);

  const principal = Number(body?.principal_minor);
  const total = Number(body?.contractual_total_minor);
  const count = Number(body?.installment_count);
  const frequency = body?.frequency || '';

  if (!body?.person_id || !Number.isInteger(principal) || principal <= 0 || !Number.isInteger(total) || total < principal || !Number.isInteger(count) || count <= 0 || count > 366 || !['DAILY','WEEKLY','MONTHLY'].includes(frequency) || !body?.disbursed_at || !body?.first_due_date) {
    return apiError(requestId, 400, 'INVALID_LOAN', 'Revisa persona, valores, fechas, número de cuotas y periodicidad.');
  }

  const person = await env.DB.prepare('SELECT id FROM persons WHERE id = ? LIMIT 1').bind(body.person_id).first();
  if (!person) return apiError(requestId, 404, 'PERSON_NOT_FOUND', 'La persona indicada no existe.');

  const loanId = crypto.randomUUID();
  const now = new Date().toISOString();
  const base = Math.floor(total / count);
  let remainder = total - (base * count);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO loans
        (id, organization_id, person_id, principal_minor, contractual_total_minor, currency,
         disbursed_at, first_due_date, installment_count, frequency, status, verification_status,
         created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'BRL', ?, ?, ?, ?, 'PENDING_REVIEW', 'PENDING', ?, ?, ?)`
    ).bind(loanId, organizationId, body.person_id, principal, total, body.disbursed_at, body.first_due_date, count, frequency, auth.principal.userId, now, now)
  ];

  const start = new Date(`${body.first_due_date}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    const due = new Date(start);
    if (frequency === 'DAILY') due.setUTCDate(due.getUTCDate() + i);
    if (frequency === 'WEEKLY') due.setUTCDate(due.getUTCDate() + (i * 7));
    if (frequency === 'MONTHLY') due.setUTCMonth(due.getUTCMonth() + i);
    const expected = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    statements.push(
      env.DB.prepare(
        `INSERT INTO installments
          (id, loan_id, installment_number, due_date, expected_minor, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'FUTURE', ?)`
      ).bind(crypto.randomUUID(), loanId, i + 1, due.toISOString().slice(0, 10), expected, now)
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, after_json, created_at)
       VALUES (?, 'USER', ?, ?, 'LOAN_CREATED', 'LOAN', ?, ?, ?)`
    ).bind(crypto.randomUUID(), auth.principal.userId, organizationId, loanId, JSON.stringify({ principal_minor: principal, contractual_total_minor: total, installment_count: count, frequency }), now)
  );

  await env.DB.batch(statements);
  await env.JOBS.send({ type: 'LOAN_CREATED', loan_id: loanId, person_id: body.person_id, organization_id: organizationId });

  return json({ id: loanId, status: 'PENDING_REVIEW', request_id: requestId }, requestId, { status: 201 });
}

export async function createPayment(request: Request, env: EnvLike, requestId: string, loanId: string): Promise<Response> {
  const auth = await requirePermission(env.DB, request, requestId, 'merchant.payment.create');
  if ('response' in auth) return auth.response;
  const organizationError = requireOrganization(auth.principal, requestId);
  if (organizationError) return organizationError;
  const organizationId = auth.principal.organizationId!;

  const loan = await env.DB.prepare('SELECT id, person_id FROM loans WHERE id = ? AND organization_id = ? LIMIT 1')
    .bind(loanId, organizationId).first<{ id: string; person_id: string }>();
  if (!loan) return apiError(requestId, 404, 'LOAN_NOT_FOUND', 'El crédito no existe en esta organización.');

  const body = await readJson<{ amount_minor?: number; paid_at?: string; method?: string; external_reference?: string }>(request);
  const amount = Number(body?.amount_minor);
  const method = body?.method || '';
  if (!Number.isInteger(amount) || amount <= 0 || !body?.paid_at || !['PIX','CASH','TRANSFER','OTHER'].includes(method)) {
    return apiError(requestId, 400, 'INVALID_PAYMENT', 'Revisa valor, fecha y método del pago.');
  }

  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payments
        (id, loan_id, amount_minor, paid_at, method, received_by_user_id, external_reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(paymentId, loanId, amount, body.paid_at, method, auth.principal.userId, body.external_reference?.trim() || null, now),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, after_json, created_at)
       VALUES (?, 'USER', ?, ?, 'PAYMENT_RECORDED', 'PAYMENT', ?, ?, ?)`
    ).bind(crypto.randomUUID(), auth.principal.userId, organizationId, paymentId, JSON.stringify({ loan_id: loanId, amount_minor: amount, paid_at: body.paid_at, method }), now)
  ]);

  await env.JOBS.send({ type: 'PAYMENT_RECORDED', payment_id: paymentId, loan_id: loanId, person_id: loan.person_id, organization_id: organizationId });
  return json({ id: paymentId, loan_id: loanId, request_id: requestId }, requestId, { status: 201 });
}
