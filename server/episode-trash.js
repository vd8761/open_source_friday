const express = require('express');
const { randomUUID, createHash } = require('node:crypto');
const { InputError } = require('./outreach-csv');
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
  if (ep.is_silent !== true) throw new InputError('Only silent sample episodes can be moved to Trash.', 409);
  return snapshot;
}
function preview(snapshot) {
  const ep = snapshot.episodes[0];
  return { episode: { id: ep.id, episode_number: ep.episode_number, title: ep.title },
    counts: Object.fromEntries(tables.map(([name]) => [name, snapshot[name].length])),
    fingerprint: fingerprint(snapshot) };
}
async function moveToTrash(db, id, input = {}, adminId) {
  const unexpected = await db.query(`SELECT conrelid::regclass::text AS dependent_table FROM pg_constraint
    WHERE contype='f' AND confrelid=ANY($1::regclass[]) AND NOT conrelid=ANY($1::regclass[])`, [tables.map(([name]) => name)]);
  if (unexpected.rows.length) throw new InputError('Additional related tables require a reviewed cleanup. This sample was not removed.', 409);
  // Coordinate with invitation send/reconciliation, report sync and attendance workers.
  for (const key of [7410626, 7410627, 7410628]) await db.query('SELECT pg_advisory_xact_lock($1)', [key]);
  const snapshot = await snapshotEpisode(db, id, true);
  const ep = snapshot.episodes[0];
  if (input.confirmation !== `TRASH EPISODE ${ep.episode_number}` || input.fingerprint !== fingerprint(snapshot))
    throw new InputError('Sample records changed or confirmation does not match. Refresh the preview before removing it.', 409);
  const trashId = randomUUID();
  await db.query('INSERT INTO episode_trash(id,episode_id,episode_number,title,snapshot,deleted_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
    [trashId, ep.id, ep.episode_number, ep.title, JSON.stringify(snapshot), adminId]);
  for (const [table, condition] of [...tables].reverse()) await db.query(`DELETE FROM ${table} WHERE ${condition}`, [id]);
  return { trash_id: trashId, ...preview(snapshot) };
}
async function restoreFromTrash(db, trashId, adminId) {
  const row = (await db.query('SELECT * FROM episode_trash WHERE id=$1 FOR UPDATE', [trashId])).rows[0];
  if (!row || row.restored_at) throw new InputError('This sample is not in Trash.', 404);
  if ((await db.query('SELECT id FROM episodes WHERE id=$1 OR episode_number=$2', [row.episode_id,row.episode_number])).rows.length)
    throw new InputError('An existing episode uses this ID or episode number. Resolve that conflict before restoring the sample.', 409);
  const snapshot = row.snapshot;
  // Restoring records must never restart an invitation campaign or send notifications.
  snapshot.episodes[0] = { ...snapshot.episodes[0], is_active: false, is_registration_open: false, is_silent: true };
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
        error: error instanceof InputError ? error.message : 'Sample removal or restore failed. No partial changes were saved.' });
    } finally { db.release(); }
  };
  router.param('episodeId',(req,res,next,value) => /^[1-9]\d{0,9}$/.test(value) && Number(value)<=2147483647 ? next() : res.status(400).json({ success:false,error:'Invalid episode ID.' }));
  router.param('trashId',(req,res,next,value) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ? next() : res.status(400).json({ success:false,error:'Invalid Trash ID.' }));
  router.get('/episode-trash',route(async (req,db) => ({ data:(await db.query(`SELECT id,episode_number,title,deleted_at FROM episode_trash WHERE restored_at IS NULL ORDER BY deleted_at DESC`)).rows })));
  router.get('/episodes/:episodeId/trash-preview',route(async (req,db) => preview(await snapshotEpisode(db,req.params.episodeId))));
  router.post('/episodes/:episodeId/trash',route(async (req,db) => moveToTrash(db,req.params.episodeId,req.body,req.user.id),true));
  router.post('/episode-trash/:trashId/restore',route(async (req,db) => restoreFromTrash(db,req.params.trashId,req.user.id),true));
  return router;
}
module.exports = { initEpisodeTrash, createEpisodeTrashRouter, snapshotEpisode, preview, moveToTrash, restoreFromTrash };
