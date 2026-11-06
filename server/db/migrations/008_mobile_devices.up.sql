-- Phones running the OSF app, for Firebase Cloud Messaging. Additive and idempotent. Reverse with 008_mobile_devices.down.sql.
CREATE TABLE IF NOT EXISTS mobile_devices (
  id SERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL CHECK (length(token) BETWEEN 20 AND 4096),
  platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
