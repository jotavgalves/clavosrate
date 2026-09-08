export async function reconcileLoanVerificationFromDocument(
  db: D1Database,
  documentId: string
): Promise<{ loanId: string | null; personId: string | null; verificationStatus: string | null }> {
  const doc = await db.prepare(
    `SELECT loan_id, person_id FROM person_documents WHERE id = ? LIMIT 1`
  ).bind(documentId).first<{ loan_id: string | null; person_id: string }>();

  if (!doc) return { loanId: null, personId: null, verificationStatus: null };
  if (!doc.loan_id) return { loanId: null, personId: doc.person_id, verificationStatus: null };

  const rows = (await db.prepare(
    `SELECT document_role, review_status
       FROM person_documents
      WHERE loan_id = ?`
  ).bind(doc.loan_id).all<{ document_role: string; review_status: string }>()).results;

  const identityApproved = rows.some((row) => row.document_role === 'IDENTITY' && row.review_status === 'APPROVED');
  const evidenceApproved = rows.some((row) => row.document_role === 'LOAN_EVIDENCE' && row.review_status === 'APPROVED');
  const finalRejection = rows.some((row) =>
    ['IDENTITY', 'LOAN_EVIDENCE'].includes(row.document_role) && row.review_status === 'REJECTED'
  );

  let verificationStatus = 'PENDING';
  let loanStatus = 'PENDING_REVIEW';

  if (finalRejection) {
    verificationStatus = 'REJECTED';
    loanStatus = 'REJECTED';
  } else if (identityApproved && evidenceApproved) {
    verificationStatus = 'VERIFIED';
    loanStatus = 'ACTIVE';
  }

  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE loans SET verification_status = ?, status = ?, updated_at = ? WHERE id = ?`
  ).bind(verificationStatus, loanStatus, now, doc.loan_id).run();

  return { loanId: doc.loan_id, personId: doc.person_id, verificationStatus };
}
