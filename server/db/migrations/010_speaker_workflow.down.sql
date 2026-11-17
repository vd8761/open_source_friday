DROP INDEX IF EXISTS speaker_pitch_active_idx;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS mobile_dedupe_key;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS dedupe_key;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS company;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS speaker_role;
