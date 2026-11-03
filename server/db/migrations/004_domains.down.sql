-- Reverses 004_domains.up.sql. Run manually with the server stopped, and only when no row uses a domain outside the original four.
ALTER TABLE speakers ADD CONSTRAINT speakers_domains_check CHECK (domains <@ ARRAY['ai_engineer','cloud_computing','open_source','digital_skills']::TEXT[]);
ALTER TABLE episodes ADD CONSTRAINT episodes_domain_check CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills'));
ALTER TABLE tips ADD CONSTRAINT tips_domain_check CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills'));
ALTER TABLE speaker_applications ADD CONSTRAINT speaker_applications_domain_check CHECK (domain IS NULL OR domain IN ('ai_engineer','cloud_computing','open_source','digital_skills'));
DROP TABLE IF EXISTS domains;
