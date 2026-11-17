-- Additive and nullable so existing pitches remain readable. New submissions require these in the API.
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS mobile_number TEXT CHECK (mobile_number IS NULL OR mobile_number ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE speaker_applications ADD COLUMN IF NOT EXISTS preferred_call_time TEXT CHECK (preferred_call_time IS NULL OR preferred_call_time IN ('9 AM–12 PM','1 PM–4 PM','5 PM–8 PM'));
