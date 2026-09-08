PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  tax_id_hash TEXT,
  country_code TEXT NOT NULL DEFAULT 'BR',
  state_region TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE organization_users (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE persons (
  id TEXT PRIMARY KEY,
  cpf_lookup_hmac TEXT NOT NULL UNIQUE,
  cpf_encrypted TEXT NOT NULL,
  full_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  city TEXT,
  state_region TEXT,
  identity_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE person_documents (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id),
  document_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  reviewed_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE loans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  person_id TEXT NOT NULL REFERENCES persons(id),
  principal_minor INTEGER NOT NULL,
  contractual_total_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  disbursed_at TEXT NOT NULL,
  first_due_date TEXT NOT NULL,
  installment_count INTEGER NOT NULL,
  frequency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE installments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id),
  installment_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  expected_minor INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'FUTURE',
  created_at TEXT NOT NULL,
  UNIQUE (loan_id, installment_number)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id),
  amount_minor INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL,
  received_by_user_id TEXT REFERENCES users(id),
  external_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE scores (
  person_id TEXT PRIMARY KEY REFERENCES persons(id),
  score INTEGER NOT NULL,
  rating TEXT NOT NULL,
  confidence TEXT NOT NULL,
  model_version TEXT NOT NULL,
  calculated_at TEXT NOT NULL
);

CREATE TABLE score_history (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id),
  score INTEGER NOT NULL,
  rating TEXT NOT NULL,
  confidence TEXT NOT NULL,
  model_version TEXT NOT NULL,
  factors_json TEXT NOT NULL,
  calculated_at TEXT NOT NULL
);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id),
  loan_id TEXT REFERENCES loans(id),
  organization_id TEXT REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  reason TEXT NOT NULL,
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  organization_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_loans_org_status ON loans(organization_id, status);
CREATE INDEX idx_loans_person ON loans(person_id);
CREATE INDEX idx_installments_due ON installments(due_date, status);
CREATE INDEX idx_payments_loan_paid ON payments(loan_id, paid_at);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id, created_at);
CREATE INDEX idx_documents_review ON person_documents(review_status, created_at);
