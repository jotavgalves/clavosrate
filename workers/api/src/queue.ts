interface QueueEnv {
  DB: D1Database;
}

type QueueEvent = {
  event_id?: string;
  type: string;
  loan_id?: string;
  payment_id?: string;
  person_id?: string;
  organization_id?: string;
  document_id?: string;
  decision?: string;
};

function daysBetween(a: string, b: string): number {
  const left = new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  const right = new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((right - left) / 86_400_000));
}

async function recalculateLoan(db: D1Database, loanId: string): Promise<string | null> {
  const loan = await db.prepare('SELECT id, person_id, verification_status FROM loans WHERE id = ? LIMIT 1')
    .bind(loanId)
    .first<{ id: string; person_id: string; verification_status: string }>();
  if (!loan) return null;

  const installments = (await db.prepare(
    `SELECT id, installment_number, due_date, expected_minor
       FROM installments WHERE loan_id = ? ORDER BY installment_number ASC`
  ).bind(loanId).all<{ id: string; installment_number: number; due_date: string; expected_minor: number }>()).results;

  const payments = (await db.prepare(
    `SELECT id, amount_minor, paid_at FROM payments WHERE loan_id = ? ORDER BY paid_at ASC, created_at ASC, id ASC`
  ).bind(loanId).all<{ id: string; amount_minor: number; paid_at: string }>()).results;

  const remaining = new Map<string, number>();
  for (const installment of installments) remaining.set(installment.id, installment.expected_minor);

  const allocationRows: Array<{ paymentId: string; installmentId: string; amount: number; paidAt: string }> = [];
  let installmentIndex = 0;

  for (const payment of payments) {
    let available = payment.amount_minor;
    while (available > 0 && installmentIndex < installments.length) {
      const installment = installments[installmentIndex];
      const left = remaining.get(installment.id) || 0;
      if (left <= 0) { installmentIndex++; continue; }
      const amount = Math.min(left, available);
      allocationRows.push({ paymentId: payment.id, installmentId: installment.id, amount, paidAt: payment.paid_at });
      remaining.set(installment.id, left - amount);
      available -= amount;
      if ((remaining.get(installment.id) || 0) <= 0) installmentIndex++;
    }
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM payment_installment_allocations WHERE installment_id IN (SELECT id FROM installments WHERE loan_id = ?)').bind(loanId)
  ];

  for (const row of allocationRows) {
    statements.push(db.prepare(
      `INSERT INTO payment_installment_allocations (payment_id, installment_id, amount_minor, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(row.paymentId, row.installmentId, row.amount, now));
  }

  let paidCount = 0;
  for (const installment of installments) {
    const left = remaining.get(installment.id) || 0;
    const allocated = installment.expected_minor - left;
    const related = allocationRows.filter((row) => row.installmentId === installment.id);
    let status = 'FUTURE';
    if (left <= 0) {
      paidCount++;
      const finalPaidAt = related.reduce((latest, row) => row.paidAt > latest ? row.paidAt : latest, '');
      status = finalPaidAt.slice(0, 10) <= installment.due_date ? 'PAID_ON_TIME' : 'PAID_LATE';
    } else if (allocated > 0) {
      status = installment.due_date < today ? 'PARTIAL_OVERDUE' : 'PARTIAL';
    } else if (installment.due_date < today) status = 'OVERDUE';
    else if (installment.due_date === today) status = 'DUE';

    statements.push(db.prepare('UPDATE installments SET status = ? WHERE id = ?').bind(status, installment.id));
  }

  const loanStatus = installments.length > 0 && paidCount === installments.length
    ? 'COMPLETED'
    : (loan.verification_status === 'VERIFIED' ? 'ACTIVE' : 'PENDING_REVIEW');
  statements.push(db.prepare('UPDATE loans SET status = ?, updated_at = ? WHERE id = ?').bind(loanStatus, now, loanId));
  await db.batch(statements);
  return loan.person_id;
}

async function recalculateScore(db: D1Database, personId: string): Promise<void> {
  const stats = await db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN i.status = 'PAID_ON_TIME' THEN 1 ELSE 0 END) AS on_time,
       SUM(CASE WHEN i.status = 'PAID_LATE' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN i.status IN ('OVERDUE','PARTIAL_OVERDUE') THEN 1 ELSE 0 END) AS overdue
     FROM installments i
     JOIN loans l ON l.id = i.loan_id
     WHERE l.person_id = ? AND l.verification_status = 'VERIFIED'`
  ).bind(personId).first<{ total: number; on_time: number; late: number; overdue: number }>();

  const completed = await db.prepare(
    `SELECT COUNT(*) AS n FROM loans WHERE person_id = ? AND verification_status = 'VERIFIED' AND status = 'COMPLETED'`
  ).bind(personId).first<{ n: number }>();

  const total = Number(stats?.total || 0);
  const onTime = Number(stats?.on_time || 0);
  const late = Number(stats?.late || 0);
  const overdue = Number(stats?.overdue || 0);
  const finishedLoans = Number(completed?.n || 0);

  if (total === 0) {
    await db.prepare('DELETE FROM scores WHERE person_id = ?').bind(personId).run();
    return;
  }

  const settled = onTime + late;
  const punctuality = settled > 0 ? onTime / settled : 0;
  let score = 500;
  score += Math.round(punctuality * 300);
  score += Math.min(finishedLoans * 25, 100);
  score -= Math.min(late * 8, 120);
  score -= Math.min(overdue * 55, 330);
  score = Math.max(0, Math.min(1000, score));

  const rating = score >= 700 ? 'LIMPIO' : score >= 500 ? 'ATENCION' : 'CLAVO';
  const confidence = total >= 30 ? 'HIGH' : total >= 10 ? 'MEDIUM' : 'LOW';
  const now = new Date().toISOString();
  const factors = { total_installments: total, paid_on_time: onTime, paid_late: late, overdue, completed_loans: finishedLoans, punctuality };

  await db.batch([
    db.prepare(
      `INSERT INTO scores (person_id, score, rating, confidence, model_version, calculated_at)
       VALUES (?, ?, ?, ?, '0.1.0', ?)
       ON CONFLICT(person_id) DO UPDATE SET score=excluded.score, rating=excluded.rating,
         confidence=excluded.confidence, model_version=excluded.model_version, calculated_at=excluded.calculated_at`
    ).bind(personId, score, rating, confidence, now),
    db.prepare(
      `INSERT INTO score_history (id, person_id, score, rating, confidence, model_version, factors_json, calculated_at)
       VALUES (?, ?, ?, ?, ?, '0.1.0', ?, ?)`
    ).bind(crypto.randomUUID(), personId, score, rating, confidence, JSON.stringify(factors), now)
  ]);
}

async function detectDuplicateDocument(db: D1Database, documentId: string): Promise<void> {
  const doc = await db.prepare(
    `SELECT id, sha256, person_id, organization_id, loan_id FROM person_documents WHERE id = ? LIMIT 1`
  ).bind(documentId).first<{ id: string; sha256: string | null; person_id: string; organization_id: string | null; loan_id: string | null }>();
  if (!doc?.sha256) return;

  const duplicate = await db.prepare(
    `SELECT COUNT(DISTINCT person_id) AS people, COUNT(*) AS documents
       FROM person_documents WHERE sha256 = ?`
  ).bind(doc.sha256).first<{ people: number; documents: number }>();
  if (Number(duplicate?.people || 0) < 2) return;

  const already = await db.prepare(
    `SELECT id FROM risk_cases WHERE case_type = 'DUPLICATE_DOCUMENT' AND document_id = ? AND status IN ('OPEN','INVESTIGATING') LIMIT 1`
  ).bind(documentId).first();
  if (already) return;

  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO risk_cases
      (id, case_type, severity, status, organization_id, person_id, loan_id, document_id, title, details_json, created_at, updated_at)
     VALUES (?, 'DUPLICATE_DOCUMENT', 'HIGH', 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), doc.organization_id, doc.person_id, doc.loan_id, doc.id,
    'Documento reutilizado en perfiles diferentes',
    JSON.stringify({ sha256: doc.sha256, distinct_people: duplicate?.people || 0, documents: duplicate?.documents || 0 }),
    now, now
  ).run();
}

async function processEvent(db: D1Database, event: QueueEvent): Promise<void> {
  const eventId = event.event_id || crypto.randomUUID();
  const processed = await db.prepare('SELECT event_id FROM processed_queue_events WHERE event_id = ? LIMIT 1').bind(eventId).first();
  if (processed) return;

  let personId = event.person_id || null;
  if (event.type === 'PAYMENT_RECORDED' && event.loan_id) personId = await recalculateLoan(db, event.loan_id);
  if (event.type === 'LOAN_CREATED' && event.loan_id) personId = await recalculateLoan(db, event.loan_id);
  if (event.type === 'DOCUMENT_REVIEW_REQUESTED' && event.document_id) await detectDuplicateDocument(db, event.document_id);
  if (event.type === 'DOCUMENT_REVIEW_COMPLETED' && personId) await recalculateScore(db, personId);
  if ((event.type === 'PAYMENT_RECORDED' || event.type === 'LOAN_CREATED') && personId) await recalculateScore(db, personId);

  await db.prepare(
    'INSERT OR IGNORE INTO processed_queue_events (event_id, event_type, processed_at) VALUES (?, ?, ?)'
  ).bind(eventId, event.type, new Date().toISOString()).run();
}

export async function processQueue(batch: MessageBatch<QueueEvent>, env: QueueEnv): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processEvent(env.DB, message.body);
      message.ack();
    } catch (error) {
      console.error('queue_event_failed', { message_id: message.id, body: message.body, error });
      message.retry();
    }
  }
}
