import { requireOrganization, requirePermission } from './access';
import { apiError, json } from './http';

interface EnvLike {
  DB: D1Database;
  PRIVATE_DOCUMENTS: R2Bucket;
  JOBS: Queue;
}

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)));
}

function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'document';
}

export async function uploadDocument(request: Request, env: EnvLike, requestId: string): Promise<Response> {
  const access = await requirePermission(env.DB, request, requestId, 'merchant.document.upload');
  if ('response' in access) return access.response;
  const missingOrg = requireOrganization(access.principal, requestId);
  if (missingOrg) return missingOrg;

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return apiError(requestId, 415, 'MULTIPART_REQUIRED', 'Envía el documento como multipart/form-data.');
  }

  const form = await request.formData();
  const file = form.get('file');
  const personId = String(form.get('person_id') || '').trim();
  const documentType = String(form.get('document_type') || '').trim().toUpperCase();
  const documentRole = String(form.get('document_role') || 'IDENTITY').trim().toUpperCase();
  const loanId = String(form.get('loan_id') || '').trim() || null;

  if (!(file instanceof File) || !personId || !documentType) {
    return apiError(requestId, 400, 'INVALID_DOCUMENT_UPLOAD', 'Archivo, persona y tipo de documento son obligatorios.');
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return apiError(requestId, 415, 'UNSUPPORTED_DOCUMENT_TYPE', 'Solo se aceptan PDF, JPEG, PNG o WEBP.');
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return apiError(requestId, 413, 'DOCUMENT_TOO_LARGE', 'El archivo debe tener un tamaño máximo de 8 MB.');
  }
  if (!['IDENTITY', 'LOAN_EVIDENCE', 'PAYMENT_EVIDENCE'].includes(documentRole)) {
    return apiError(requestId, 400, 'INVALID_DOCUMENT_ROLE', 'La función del documento no es válida.');
  }

  const person = await env.DB.prepare('SELECT id FROM persons WHERE id = ? LIMIT 1').bind(personId).first();
  if (!person) return apiError(requestId, 404, 'PERSON_NOT_FOUND', 'La persona no existe.');

  if (loanId) {
    const loan = await env.DB.prepare('SELECT id FROM loans WHERE id = ? AND organization_id = ? LIMIT 1')
      .bind(loanId, access.principal.organizationId)
      .first();
    if (!loan) return apiError(requestId, 404, 'LOAN_NOT_FOUND', 'El crédito no pertenece a tu organización.');
  }

  const bytes = await file.arrayBuffer();
  const digest = await sha256(bytes);
  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const storageKey = [
    'organizations', access.principal.organizationId,
    'persons', personId,
    documentId,
    safeFileName(file.name)
  ].join('/');

  await env.PRIVATE_DOCUMENTS.put(storageKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      documentId,
      organizationId: access.principal.organizationId!,
      personId,
      documentRole,
      sha256: digest
    }
  });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO person_documents
          (id, person_id, document_type, storage_key, review_status, uploaded_by_user_id,
           created_at, organization_id, loan_id, document_role, original_filename, mime_type,
           size_bytes, sha256, updated_at)
         VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        documentId, personId, documentType, storageKey, access.principal.userId, now,
        access.principal.organizationId, loanId, documentRole, file.name, file.type, file.size, digest, now
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, actor_type, actor_id, organization_id, action, target_type, target_id, after_json, created_at)
         VALUES (?, 'USER', ?, ?, 'DOCUMENT_UPLOADED', 'DOCUMENT', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), access.principal.userId, access.principal.organizationId, documentId,
        JSON.stringify({ person_id: personId, loan_id: loanId, role: documentRole, sha256: digest }), now
      )
    ]);
  } catch (error) {
    await env.PRIVATE_DOCUMENTS.delete(storageKey);
    throw error;
  }

  await env.JOBS.send({ type: 'DOCUMENT_REVIEW_REQUESTED', document_id: documentId, organization_id: access.principal.organizationId });

  return json({
    document: {
      id: documentId,
      person_id: personId,
      loan_id: loanId,
      document_type: documentType,
      document_role: documentRole,
      review_status: 'PENDING',
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size
    },
    request_id: requestId
  }, requestId, { status: 201 });
}

export async function getAdminDocumentContent(request: Request, env: EnvLike, requestId: string, documentId: string): Promise<Response> {
  const access = await requirePermission(env.DB, request, requestId, 'admin.document.read');
  if ('response' in access) return access.response;

  const row = await env.DB.prepare(
    `SELECT id, storage_key, original_filename, mime_type FROM person_documents WHERE id = ? LIMIT 1`
  ).bind(documentId).first<{ id: string; storage_key: string; original_filename: string | null; mime_type: string | null }>();
  if (!row) return apiError(requestId, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');

  const object = await env.PRIVATE_DOCUMENTS.get(row.storage_key);
  if (!object) return apiError(requestId, 404, 'DOCUMENT_OBJECT_MISSING', 'El archivo del documento no está disponible.');

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_type, actor_id, action, target_type, target_id, reason, created_at)
     VALUES (?, 'ADMIN', ?, 'DOCUMENT_VIEWED', 'DOCUMENT', ?, 'ADMIN_REVIEW', ?)`
  ).bind(crypto.randomUUID(), access.principal.userId, documentId, now).run();

  const headers = new Headers();
  headers.set('content-type', row.mime_type || object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('cache-control', 'private, no-store');
  headers.set('content-security-policy', "default-src 'none'; sandbox");
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-request-id', requestId);
  headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.original_filename || 'document')}`);
  if (object.size) headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}

export async function reviewDocument(request: Request, env: EnvLike, requestId: string, documentId: string): Promise<Response> {
  const access = await requirePermission(env.DB, request, requestId, 'admin.document.review');
  if ('response' in access) return access.response;

  let body: {
    decision?: string;
    reason?: string;
    corrected_full_name?: string;
    corrected_birth_date?: string;
  } | null = null;
  try { body = await request.json(); } catch { body = null; }

  const decision = String(body?.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'].includes(decision)) {
    return apiError(requestId, 400, 'INVALID_REVIEW_DECISION', 'La decisión debe ser APPROVED, REJECTED o NEEDS_CORRECTION.');
  }

  const doc = await env.DB.prepare(
    `SELECT id, person_id, document_role, review_status, organization_id FROM person_documents WHERE id = ? LIMIT 1`
  ).bind(documentId).first<{
    id: string;
    person_id: string;
    document_role: string;
    review_status: string;
    organization_id: string | null;
  }>();
  if (!doc) return apiError(requestId, 404, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.');
  if (doc.review_status !== 'PENDING' && doc.review_status !== 'NEEDS_CORRECTION') {
    return apiError(requestId, 409, 'DOCUMENT_ALREADY_REVIEWED', 'Este documento ya tiene una decisión final.');
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE person_documents
          SET review_status = ?, review_reason = ?, reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?`
    ).bind(decision, body?.reason?.trim() || null, access.principal.userId, now, now, documentId),
    env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_type, actor_id, organization_id, action, target_type, target_id, before_json, after_json, reason, created_at)
       VALUES (?, 'ADMIN', ?, ?, 'DOCUMENT_REVIEWED', 'DOCUMENT', ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), access.principal.userId, doc.organization_id, documentId,
      JSON.stringify({ review_status: doc.review_status }), JSON.stringify({ review_status: decision }), body?.reason?.trim() || null, now
    )
  ];

  if (decision === 'APPROVED' && doc.document_role === 'IDENTITY') {
    const name = body?.corrected_full_name?.trim() || null;
    const birth = body?.corrected_birth_date?.trim() || null;
    statements.push(
      env.DB.prepare(
        `UPDATE persons
            SET full_name = COALESCE(?, full_name),
                birth_date = COALESCE(?, birth_date),
                identity_status = 'VERIFIED',
                updated_at = ?
          WHERE id = ?`
      ).bind(name, birth, now, doc.person_id)
    );
  }

  if (decision === 'REJECTED' && doc.document_role === 'IDENTITY') {
    statements.push(
      env.DB.prepare(`UPDATE persons SET identity_status = 'UNVERIFIED', updated_at = ? WHERE id = ?`).bind(now, doc.person_id)
    );
  }

  await env.DB.batch(statements);
  await env.JOBS.send({ type: 'DOCUMENT_REVIEW_COMPLETED', document_id: documentId, decision, person_id: doc.person_id });

  return json({ document_id: documentId, review_status: decision, request_id: requestId }, requestId);
}
