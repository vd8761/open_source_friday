DROP INDEX IF EXISTS speaker_receipt_pending_idx;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS thank_you_error;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS thank_you_message_id;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS thank_you_sent_at;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS thank_you_attempted_at;
ALTER TABLE speaker_applications DROP COLUMN IF EXISTS thank_you_status;
