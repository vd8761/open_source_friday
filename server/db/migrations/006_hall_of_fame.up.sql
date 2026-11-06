-- Student Hall of Fame: up to three awards per episode, shown on the home page once the student has agreed.
-- Additive and idempotent. Reverse with 006_hall_of_fame.down.sql.
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  award TEXT NOT NULL CHECK (award IN ('first_to_register', 'stayed_longest', 'most_interactive')),
  registration_id INTEGER, -- the winner's registration, checked by the API; kept as a plain link so v1.0 deletes are unaffected
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  college TEXT CHECK (college IS NULL OR length(college) <= 160),
  stat TEXT CHECK (stat IS NULL OR length(stat) <= 80),
  photo_url TEXT,
  consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT is_published OR consent_confirmed),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (episode_id, award)
);
