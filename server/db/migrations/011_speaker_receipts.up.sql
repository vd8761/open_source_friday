-- Old enquiries are never automatically mailed. Only new submissions queue a receipt.
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS thank_you_status TEXT NOT NULL DEFAULT 'not_requested'
  CHECK (thank_you_status IN ('not_requested','pending','sending','sent','failed','unknown','skipped'));
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS thank_you_attempted_at TIMESTAMPTZ;
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS thank_you_sent_at TIMESTAMPTZ;
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS thank_you_message_id TEXT;
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS thank_you_error TEXT;
CREATE INDEX IF NOT EXISTS speaker_receipt_pending_idx ON speaker_applications(id) WHERE thank_you_status='pending';
