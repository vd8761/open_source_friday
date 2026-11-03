-- Admin login lockout. Additive and idempotent. Reverse with 003_security.down.sql.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  username_key TEXT PRIMARY KEY,
  failures SMALLINT NOT NULL DEFAULT 0,
  first_failure_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);
