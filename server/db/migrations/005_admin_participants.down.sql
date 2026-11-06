-- Reverses 005_admin_participants.up.sql. Run manually with the server stopped.
ALTER TABLE episode_registrations DROP COLUMN IF EXISTS added_by_admin_id;
