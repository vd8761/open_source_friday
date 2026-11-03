-- Domains become admin-managed. Additive and idempotent. Reverse with 004_domains.down.sql.
CREATE TABLE IF NOT EXISTS domains (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,40}$'),
  label TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  sort SMALLINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS domains_label_unique ON domains (lower(btrim(label)));
INSERT INTO domains (key, label, sort) VALUES
  ('ai_engineer', 'AI Engineer', 1), ('cloud_computing', 'Cloud Computing', 2),
  ('open_source', 'Open Source', 3), ('digital_skills', 'Digital Skills', 4)
ON CONFLICT (key) DO NOTHING;

-- The fixed four-domain CHECKs from 001 would reject new domains; the API now validates against this table.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
    WHERE contype = 'c' AND conrelid IN ('speakers'::regclass, 'episodes'::regclass, 'tips'::regclass, 'speaker_applications'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%ai_engineer%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
