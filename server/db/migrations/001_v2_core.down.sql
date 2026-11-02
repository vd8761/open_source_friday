-- Reverses 001_v2_core.up.sql. Deletes all v2.0 speakers, tips, pitches and settings data.
-- v1.0 keeps working: presenter_* columns on episodes are untouched.
-- Run manually only, after a Neon snapshot. Stop the server first: it re-applies the up migration on start.
BEGIN;
DROP TABLE IF EXISTS speaker_applications;
DROP TABLE IF EXISTS tips;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS episode_speakers;
DROP TABLE IF EXISTS speakers;
ALTER TABLE episodes DROP COLUMN IF EXISTS short_blurb, DROP COLUMN IF EXISTS agenda, DROP COLUMN IF EXISTS domain;
COMMIT;
