-- Reverses 007_featured_speakers.up.sql. Run manually with the server stopped.
ALTER TABLE speakers DROP COLUMN IF EXISTS is_featured;
