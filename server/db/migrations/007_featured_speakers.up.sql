-- Speakers the admin stars are shown first (in random order) on the home page. Additive; reverse with 007_featured_speakers.down.sql.
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
