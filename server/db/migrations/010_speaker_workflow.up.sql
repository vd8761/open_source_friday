-- Preserve existing pitches without guessing separate roles or companies.
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS speaker_role TEXT CHECK (speaker_role IS NULL OR length(speaker_role) <= 160);
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS company TEXT CHECK (company IS NULL OR length(company) <= 160);
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS mobile_dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS speaker_pitch_dedupe_idx ON speaker_applications(dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS speaker_pitch_mobile_dedupe_idx ON speaker_applications(mobile_dedupe_key);
CREATE INDEX IF NOT EXISTS speaker_pitch_active_idx ON speaker_applications(status,created_at DESC) WHERE deleted_at IS NULL;
