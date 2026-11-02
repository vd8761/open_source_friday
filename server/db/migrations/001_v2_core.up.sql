-- v2.0 core data. Additive and idempotent: safe to run on every start, never alters v1.0 columns.
-- Reverse with 001_v2_core.down.sql.

-- Speakers are one record each; every page reads name, role and photo from here.
CREATE TABLE IF NOT EXISTS speakers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  honorific TEXT CHECK (honorific IS NULL OR length(honorific) <= 20),
  designation TEXT CHECK (designation IS NULL OR length(designation) <= 160),
  company TEXT CHECK (company IS NULL OR length(company) <= 160),
  bio TEXT CHECK (bio IS NULL OR length(bio) <= 1200),
  photo_url TEXT,
  linkedin_url TEXT CHECK (linkedin_url IS NULL OR linkedin_url ~ '^https://([a-z]+\.)?linkedin\.com/'),
  domains TEXT[] NOT NULL DEFAULT '{}'
    CHECK (domains <@ ARRAY['ai_engineer','cloud_computing','open_source','digital_skills']::TEXT[]),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS speakers_name_unique ON speakers (lower(btrim(name)));

-- An episode can have several speakers; sort 0 is the lead shown first.
CREATE TABLE IF NOT EXISTS episode_speakers (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  speaker_id INTEGER NOT NULL REFERENCES speakers(id) ON DELETE RESTRICT,
  sort SMALLINT NOT NULL DEFAULT 0 CHECK (sort BETWEEN 0 AND 20),
  PRIMARY KEY (episode_id, speaker_id)
);
CREATE INDEX IF NOT EXISTS episode_speakers_speaker_idx ON episode_speakers (speaker_id);

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS domain TEXT
    CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills')),
  ADD COLUMN IF NOT EXISTS agenda JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agenda) = 'array'),
  ADD COLUMN IF NOT EXISTS short_blurb TEXT CHECK (short_blurb IS NULL OR length(short_blurb) <= 200);

-- Editable values that are not computed from data (club-level marketing numbers, registration mode).
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER
);
INSERT INTO site_settings (key, value) VALUES
  ('registration_mode', '"open"'::jsonb),
  ('club_stats', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS tips (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 500),
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  speaker_id INTEGER REFERENCES speakers(id) ON DELETE SET NULL,
  domain TEXT CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills')),
  is_tip_of_week BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tips_single_tip_of_week ON tips (is_tip_of_week) WHERE is_tip_of_week;

-- "Speak at OSF" pitches. No emails are sent from these in v2.0.
CREATE TABLE IF NOT EXISTS speaker_applications (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK (length(email) <= 254),
  role_company TEXT NOT NULL CHECK (length(btrim(role_company)) BETWEEN 1 AND 160),
  link TEXT CHECK (link IS NULL OR length(link) <= 300),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  domain TEXT CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills')),
  abstract TEXT NOT NULL CHECK (length(btrim(abstract)) BETWEEN 1 AND 2000),
  preferred_fridays DATE[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','scheduled','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS speaker_applications_status_idx ON speaker_applications (status, created_at DESC);
