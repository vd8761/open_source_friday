-- Participants added by an admin (searched contact or a direct Zoom registrant). Additive; v1.0 ignores the column.
-- Reverse with 005_admin_participants.down.sql.
DO $$
BEGIN
  IF to_regclass('episode_registrations') IS NOT NULL THEN
    ALTER TABLE episode_registrations ADD COLUMN IF NOT EXISTS added_by_admin_id INTEGER;
  END IF;
END $$;
