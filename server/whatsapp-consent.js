const { InputError } = require('./outreach-csv');

const NOTICE_VERSION = 'event-whatsapp-2026-10-29';
const NOTICE_TEXT = 'I agree to receive WhatsApp updates from Descience Open Source Club about this event, including reminders and schedule changes.';

async function initWhatsAppConsent(db) {
  // NULL means no choice was recorded. Never backfill old registrations as opted in.
  await db.query(`ALTER TABLE episode_registrations
    ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN,
    ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_notice_version TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_notice_text TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_consent_number TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_consent_source TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_withdrawn_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_withdrawn_by INTEGER,
    ADD COLUMN IF NOT EXISTS whatsapp_withdrawal_source TEXT`);
}

function registrationConsent(body) {
  if (body.whatsapp_opt_in === undefined) return null; // Older clients remain compatible.
  if (typeof body.whatsapp_opt_in !== 'boolean' || body.whatsapp_notice_version !== NOTICE_VERSION) {
    throw new InputError('Please refresh the registration page and choose your WhatsApp preference again.', 400);
  }
  return body.whatsapp_opt_in;
}

// A permission applies to the supplied number for one event. It is not phone verification.
const eligibleSql = `er.whatsapp_opt_in IS TRUE AND er.whatsapp_withdrawn_at IS NULL
  AND er.whatsapp_notice_version IS NOT NULL AND er.whatsapp_consent_number IS NOT NULL`;
const statusSql = `CASE WHEN er.whatsapp_withdrawn_at IS NOT NULL THEN 'withdrawn'
  WHEN ${eligibleSql} THEN 'opted_in'
  WHEN er.whatsapp_opt_in IS FALSE THEN 'declined' ELSE 'not_recorded' END`;

module.exports = { NOTICE_VERSION, NOTICE_TEXT, initWhatsAppConsent, registrationConsent, eligibleSql, statusSql };
