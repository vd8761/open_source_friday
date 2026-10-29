const express = require('express');
const { randomUUID, createHash } = require('node:crypto');
const { InputError } = require('./outreach-csv');
const { eventPolicy } = require('./event-policy');
const tables = [
  ['episodes', 'id=$1'],
  ['episode_registrations', 'episode_id=$1'],
  ['zoom_registration_jobs', 'registration_id IN (SELECT id FROM episode_registrations WHERE episode_id=$1)'],
  ['invite_campaigns', 'episode_id=$1'],
  ['invite_batches', 'campaign_id IN (SELECT id FROM invite_campaigns WHERE episode_id=$1)'],
  ['invite_recipients', 'campaign_id IN (SELECT id FROM invite_campaigns WHERE episode_id=$1)'],
  ['invite_delivery_imports', 'campaign_id IN (SELECT id FROM invite_campaigns WHERE episode_id=$1)'],
  ['attendance_syncs', 'episode_id=$1'],
  ['attendance_participants', 'episode_id=$1'],
  ['attendance_overrides', 'registration_id IN (SELECT id FROM episode_registrations WHERE episode_id=$1)'],
  ['attendance_audit', 'episode_id=$1'],
  ['attendance_tasks', 'episode_id=$1'],
];
async function initEpisodeTrash(db) {
  await db.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await db.query(`CREATE TABLE IF NOT EXISTS episode_trash (
    id UUID PRIMARY KEY, episode_id INTEGER NOT NULL, episode_number INTEGER NOT NULL,
    title TEXT NOT NULL, snapshot JSONB NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_by INTEGER REFERENCES admins(id), restored_at TIMESTAMPTZ, restored_by INTEGER REFERENCES admins(id)
  )`);
}
const fingerprint = snapshot => createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
async function snapshotEpisode(db, id, lock = false) {
  const snapshot = {};
  for (const [table, condition] of tables) {
    snapshot[table] = (await db.query(`SELECT to_jsonb(t) AS record FROM ${table} t WHERE ${condition} ORDER BY to_jsonb(t)::text${lock ? ' FOR UPDATE' : ''}`, [id])).rows.map(r => r.record);
  }
  const ep = snapshot.episodes[0];
  if (!ep) throw new InputError('Episode not found.', 404);
  if (!eventPolicy(ep).can_delete) throw new InputError('Past or started real events cannot be deleted. Archive completed events to keep their registration records.', 409);
  return snapshot;
}
function preview(snapshot) {
  const ep = snapshot.episodes[0];
  return { episode: { id: ep.id, episode_number: ep.episode_number, title: ep.title, is_test: ep.is_test === true },
    counts: Object.fromEntries(tables.map(([name]) => [name, snapshot[name].length])),
    fingerprint: fingerprint(snapshot) };
}
async function moveToTrash(db, id, input = {}, adminId) {
  const unexpected = await db.query(`SELECT conrelid::regclass::text AS dependent_table FROM pg_constraint
    WHERE contype='f' AND confrelid=ANY($1::regclass[]) AND NOT conrelid=ANY($1::regclass[])`, [tables.map(([name]) => name)]);
  if (unexpected.rows.length) throw new InputError('Additional related tables require a reviewed cleanup. This event was not removed.', 409);
  // Coordinate with invitation send/reconciliation, report sync and attendance workers.
  for (const key of [7410626, 7410627, 7410628]) await db.query('SELECT pg_advisory_xact_lock($1)', [key]);
  const snapshot = await snapshotEpisode(db, id, true);
  const ep = snapshot.episodes[0];
  if (input.confirmation !== `TRASH EPISODE ${ep.episode_number}` || input.fingerprint !== fingerprint(snapshot))
    throw new InputError('Event records changed or confirmation does not match. Refresh the preview before removing it.', 409);
  const trashId = randomUUID();
  await db.query('INSERT INTO episode_trash(id,episode_id,episode_number,title,snapshot,deleted_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
    [trashId, ep.id, ep.episode_number, ep.title, JSON.stringify(snapshot), adminId]);
  for (const [table, condition] of [...tables].reverse()) await db.query(`DELETE FROM ${table} WHERE ${condition}`, [id]);
  return { trash_id: trashId, ...preview(snapshot) };
}
async function restoreFromTrash(db, trashId, adminId) {
  const row = (await db.query('SELECT * FROM episode_trash WHERE id=$1 FOR UPDATE', [trashId])).rows[0];
  if (!row || row.restored_at) throw new InputError('This event is not in Trash.', 404);
  if ((await db.query('SELECT id FROM episodes WHERE id=$1 OR episode_number=$2', [row.episode_id,row.episode_number])).rows.length)
    throw new InputError('An existing episode uses this ID or episode number. Resolve that conflict before restoring the event.', 409);
  const snapshot = row.snapshot;
  // Restoring records must never restart an invitation campaign or send notifications.
  const legacyTest = (row.episode_number === 16 && row.title === 'Zoom Self-Registration Link') || (row.episode_number === 17 && row.title === 'Sender API invitation test (silent)');
  snapshot.episodes[0] = { ...snapshot.episodes[0], is_test: snapshot.episodes[0].is_test ?? legacyTest, is_active: false, is_registration_open: false, is_silent: true };
  snapshot.invite_campaigns = snapshot.invite_campaigns.map(c => c.status === 'running' ? { ...c, status: 'paused' } : c);
  snapshot.attendance_tasks = snapshot.attendance_tasks.map(t => ({ ...t, status: 'paused' }));
  for (const [table] of tables) if (snapshot[table].length)
    await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`, [JSON.stringify(snapshot[table])]);
  await db.query('UPDATE episode_trash SET restored_at=NOW(),restored_by=$2 WHERE id=$1', [trashId,adminId]);
  return { episode_number: row.episode_number };
}
function createEpisodeTrashRouter({ pool, authenticateToken }) {
  const router = express.Router(); router.use(authenticateToken);
  const route = (handler, transaction = false) => async (req,res) => {
    const db = await pool.connect();
    try {
      if (transaction) await db.query('BEGIN');
      const result = await handler(req,db);
      if (transaction) await db.query('COMMIT');
      res.json({ success: true, ...result });
    } catch (error) {
      if (transaction) await db.query('ROLLBACK');
      res.status(error instanceof InputError ? error.status : 500).json({ success: false,
        error: error instanceof InputError ? error.message : 'Event management failed. No partial changes were saved.' });
    } finally { db.release(); }
  };
  router.param('episodeId',(req,res,next,value) => /^[1-9]\d{0,9}$/.test(value) && Number(value)<=2147483647 ? next() : res.status(400).json({ success:false,error:'Invalid episode ID.' }));
  router.param('trashId',(req,res,next,value) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ? next() : res.status(400).json({ success:false,error:'Invalid Trash ID.' }));
  router.get('/archived-episodes',route(async (req,db) => ({ data:(await db.query(`SELECT e.id,e.episode_number,e.title,e.event_date,e.event_time,e.is_test,e.is_silent,e.is_active,e.is_registration_open,e.archived_at,COUNT(er.id)::integer AS registration_count FROM episodes e LEFT JOIN episode_registrations er ON er.episode_id=e.id WHERE e.archived_at IS NOT NULL GROUP BY e.id ORDER BY e.episode_number DESC`)).rows })));
  router.post('/episodes/:episodeId/archive',route(async (req,db) => {
    await db.query('SELECT pg_advisory_xact_lock(7410626)');
    const ep=(await db.query('SELECT * FROM episodes WHERE id=$1 FOR UPDATE',[req.params.episodeId])).rows[0];
    if (!ep) throw new InputError('Episode not found.',404);
    if (!eventPolicy(ep).can_archive) throw new InputError('Only completed, unarchived events can be archived.',409);
    if (req.body?.confirmation !== `ARCHIVE EPISODE ${ep.episode_number}`) throw new InputError('Archive confirmation does not match.',400);
    await db.query('UPDATE episodes SET archived_at=NOW(),is_active=FALSE,is_registration_open=FALSE WHERE id=$1',[ep.id]);
    await db.query("UPDATE invite_campaigns SET status='paused',last_error='Event archived. Registration history is retained.' WHERE episode_id=$1 AND status='running'",[ep.id]);
    return {message:'Event archived. Registrations and attendance are retained.'};
  },true));
  router.post('/episodes/:episodeId/unarchive',route(async (req,db) => {
    const result=await db.query('UPDATE episodes SET archived_at=NULL WHERE id=$1 AND archived_at IS NOT NULL RETURNING id',[req.params.episodeId]);
    if (!result.rows.length) throw new InputError('Archived event not found.',404);
    return {message:'Event returned to the dashboard. Registration remains closed.'};
  },true));
  router.get('/episode-trash',route(async (req,db) => ({ data:(await db.query(`SELECT id,episode_number,title,deleted_at FROM episode_trash WHERE restored_at IS NULL ORDER BY deleted_at DESC`)).rows })));
  router.get('/episodes/:episodeId/trash-preview',route(async (req,db) => preview(await snapshotEpisode(db,req.params.episodeId))));
  router.post('/episodes/:episodeId/trash',route(async (req,db) => moveToTrash(db,req.params.episodeId,req.body,req.user.id),true));
  router.post('/episode-trash/:trashId/restore',route(async (req,db) => restoreFromTrash(db,req.params.trashId,req.user.id),true));
  return router;
}
module.exports = { initEpisodeTrash, createEpisodeTrashRouter, snapshotEpisode, preview, moveToTrash, restoreFromTrash };
