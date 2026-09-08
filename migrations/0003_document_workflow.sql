PRAGMA foreign_keys = ON;

ALTER TABLE person_documents ADD COLUMN organization_id TEXT REFERENCES organizations(id);
ALTER TABLE person_documents ADD COLUMN loan_id TEXT REFERENCES loans(id);
ALTER TABLE person_documents ADD COLUMN document_role TEXT NOT NULL DEFAULT 'IDENTITY';
ALTER TABLE person_documents ADD COLUMN original_filename TEXT;
ALTER TABLE person_documents ADD COLUMN mime_type TEXT;
ALTER TABLE person_documents ADD COLUMN size_bytes INTEGER;
ALTER TABLE person_documents ADD COLUMN sha256 TEXT;
ALTER TABLE person_documents ADD COLUMN review_reason TEXT;
ALTER TABLE person_documents ADD COLUMN updated_at TEXT;

CREATE INDEX idx_documents_org_created ON person_documents(organization_id, created_at);
CREATE INDEX idx_documents_person_role ON person_documents(person_id, document_role, review_status);
CREATE INDEX idx_documents_sha256 ON person_documents(sha256);
