PRAGMA foreign_keys = ON;

CREATE TABLE platform_user_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  organization_id TEXT REFERENCES organizations(id),
  role TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  successful INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_token_active ON sessions(token_hash, revoked_at, expires_at);
CREATE INDEX idx_sessions_user_active ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email_normalized, created_at);
