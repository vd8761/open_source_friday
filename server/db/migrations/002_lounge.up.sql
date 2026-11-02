-- Past-episode lounge: a public recap plus attendee-only notes, materials (links only) and recording.
-- Additive and idempotent. Reverse with 002_lounge.down.sql.
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS recap TEXT CHECK (recap IS NULL OR length(recap) <= 4000),
  ADD COLUMN IF NOT EXISTS lounge_notes TEXT CHECK (lounge_notes IS NULL OR length(lounge_notes) <= 20000),
  ADD COLUMN IF NOT EXISTS recording_url TEXT CHECK (recording_url IS NULL OR recording_url ~ '^https://'),
  ADD COLUMN IF NOT EXISTS materials JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(materials) = 'array');

-- One-time email codes. Only a keyed hash of the code is stored.
CREATE TABLE IF NOT EXISTS lounge_codes (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lounge_codes_student_idx ON lounge_codes (student_id, created_at DESC);
-- Each code unlocks one episode only; attending one episode never opens another's lounge.
ALTER TABLE lounge_codes ADD COLUMN IF NOT EXISTS episode_number INTEGER;
