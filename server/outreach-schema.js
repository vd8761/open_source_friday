async function initOutreachDB(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS invite_campaigns (
    id UUID PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id),
    subject TEXT NOT NULL, body TEXT NOT NULL, batch_size INTEGER NOT NULL CHECK(batch_size BETWEEN 1 AND 200),
    interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 1 AND 1440),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','paused','completed')),
    next_batch_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER REFERENCES admins(id), last_error TEXT, reports_synced_at TIMESTAMPTZ
  )`);
  await db.query(`ALTER TABLE invite_campaigns
    ADD COLUMN IF NOT EXISTS pause_after_first_batch BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS pilot_reviewed_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE invite_campaigns
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES admins(id)`);
  await db.query(`CREATE TABLE IF NOT EXISTS invite_batches (
    id UUID PRIMARY KEY, campaign_id UUID NOT NULL REFERENCES invite_campaigns(id) ON DELETE CASCADE,
    group_id TEXT, provider_campaign_id TEXT, status TEXT NOT NULL DEFAULT 'preparing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), submitted_at TIMESTAMPTZ, last_error TEXT
  )`);
  await db.query(`ALTER TABLE invite_batches ADD COLUMN IF NOT EXISTS provider_diagnostic JSONB`);
  await db.query(`CREATE TABLE IF NOT EXISTS invite_recipients (
    id SERIAL PRIMARY KEY, campaign_id UUID NOT NULL REFERENCES invite_campaigns(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES invite_batches(id), email TEXT NOT NULL, full_name TEXT NOT NULL DEFAULT '',
    college TEXT NOT NULL DEFAULT '', department TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
    send_status TEXT NOT NULL DEFAULT 'queued', skip_reason TEXT, sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ, hard_bounced_at TIMESTAMPTZ,
    soft_bounced_at TIMESTAMPTZ, unsubscribed_at TIMESTAMPTZ, complained_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ, delivery_source TEXT, UNIQUE(campaign_id,email)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS invite_suppressions (
    email TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS invite_delivery_imports (
    id SERIAL PRIMARY KEY, campaign_id UUID REFERENCES invite_campaigns(id), imported_by INTEGER REFERENCES admins(id),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), row_count INTEGER NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_syncs (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id), meeting_uuid TEXT NOT NULL,
    threshold_minutes INTEGER NOT NULL DEFAULT 30, source TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), synced_by INTEGER REFERENCES admins(id),
    report_complete BOOLEAN NOT NULL DEFAULT FALSE
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_participants (
    id TEXT PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id),
    registration_id INTEGER REFERENCES episode_registrations(id) ON DELETE SET NULL,
    registrant_id TEXT, email TEXT, name TEXT NOT NULL DEFAULT '',
    join_time TIMESTAMPTZ, leave_time TIMESTAMPTZ, duration_seconds INTEGER NOT NULL,
    match_method TEXT NOT NULL DEFAULT 'unmatched'
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_overrides (
    registration_id INTEGER PRIMARY KEY REFERENCES episode_registrations(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('present','absent','partial')), note TEXT NOT NULL,
    updated_by INTEGER REFERENCES admins(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_audit (
    id SERIAL PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id), registration_id INTEGER,
    action TEXT NOT NULL, detail TEXT NOT NULL, admin_id INTEGER REFERENCES admins(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS attendance_tasks (
    episode_id INTEGER PRIMARY KEY REFERENCES episodes(id), status TEXT NOT NULL DEFAULT 'pending',
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT
  )`);
  await db.query(
    "CREATE INDEX IF NOT EXISTS invite_recipients_campaign_idx ON invite_recipients(campaign_id,send_status)",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS attendance_participants_episode_idx ON attendance_participants(episode_id)",
  );
}
module.exports = { initOutreachDB };
