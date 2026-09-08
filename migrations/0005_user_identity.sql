PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN identity_document_type TEXT;
ALTER TABLE users ADD COLUMN identity_document_hmac TEXT;
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN route_state TEXT;
ALTER TABLE users ADD COLUMN route_city TEXT;

CREATE UNIQUE INDEX idx_users_identity_document_hmac
  ON users(identity_document_hmac)
  WHERE identity_document_hmac IS NOT NULL;
