PRAGMA foreign_keys = ON;

CREATE TABLE payment_installment_allocations (
  payment_id TEXT NOT NULL REFERENCES payments(id),
  installment_id TEXT NOT NULL REFERENCES installments(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (payment_id, installment_id)
);

CREATE INDEX idx_allocations_installment ON payment_installment_allocations(installment_id);

CREATE TABLE risk_cases (
  id TEXT PRIMARY KEY,
  case_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  organization_id TEXT REFERENCES organizations(id),
  person_id TEXT REFERENCES persons(id),
  loan_id TEXT REFERENCES loans(id),
  document_id TEXT REFERENCES person_documents(id),
  title TEXT NOT NULL,
  details_json TEXT NOT NULL,
  assigned_to_user_id TEXT REFERENCES users(id),
  resolved_by_user_id TEXT REFERENCES users(id),
  resolution TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX idx_risk_status_severity ON risk_cases(status, severity, created_at);
CREATE INDEX idx_risk_org ON risk_cases(organization_id, created_at);

CREATE TABLE processed_queue_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
