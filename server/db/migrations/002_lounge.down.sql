-- Reverses 002_lounge.up.sql. Deletes lounge content and codes. Run manually, after a snapshot, with the server stopped.
BEGIN;
DROP TABLE IF EXISTS lounge_codes;
ALTER TABLE episodes DROP COLUMN IF EXISTS materials, DROP COLUMN IF EXISTS recording_url, DROP COLUMN IF EXISTS lounge_notes, DROP COLUMN IF EXISTS recap;
COMMIT;
