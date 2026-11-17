const { createHash } = require('node:crypto');
const { InputError, csvExport } = require('./outreach-csv');
const { pageOptions } = require('./table-query');
const STATUSES = ['new', 'contacted', 'scheduled', 'declined'];
const normal = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const fingerprint = (contact, title) => createHash('sha256').update(JSON.stringify([contact, title])).digest('hex');

// Unique keys are kept in Trash too: retrying a trashed pitch must not recreate it or send alerts.
async function saveSpeakerPitch(pool, pitch) {
  const email = normal(pitch.email), mobile = pitch.mobile_number;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const prior = await db.query(`SELECT id FROM speaker_applications
      WHERE lower(btrim(email))=$1 OR (mobile_number IS NOT NULL AND regexp_replace(mobile_number,'[^0-9+]','','g')=$2) LIMIT 1`, [email, mobile]);
    if (prior.rows.length) { await db.query('COMMIT'); return null; }
    const { rows } = await db.query(`INSERT INTO speaker_applications
      (name,email,role_company,link,title,domain,abstract,preferred_fridays,mobile_number,preferred_call_time,speaker_role,company,dedupe_key,mobile_dedupe_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::date[],$9,$10,$11,$12,$13,$14)
      ON CONFLICT DO NOTHING RETURNING id`, [pitch.name, email, pitch.role_company, pitch.link, pitch.title, pitch.domain,
      pitch.abstract, pitch.preferred_fridays, mobile, pitch.preferred_call_time, pitch.speaker_role, pitch.company,
      fingerprint(email, 'speaker'), fingerprint(mobile, 'speaker')]);
    await db.query('COMMIT');
    return rows[0]?.id || null;
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
  finally { db.release(); }
}

function pitchFilters(q) {
  const values = [], clauses = [q.trash === 'true' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  const status = q.status === undefined ? 'new' : q.status;
  if (status) { if (!STATUSES.includes(status)) throw new InputError('Invalid status filter.', 400); add('status=?', status); }
  if (q.domain) add('domain=?', String(q.domain).slice(0, 40));
  if (q.search) {
    values.push(`%${String(q.search).trim().slice(0, 150).replace(/[\\%_]/g, '\\$&')}%`);
    clauses.push(`concat_ws(' ',name,email,mobile_number,title,speaker_role,company,role_company) ILIKE $${values.length}`);
  }
  for (const [key, operator] of [['from', '>='], ['to', '<']]) if (q[key]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q[key]) || !Number.isFinite(Date.parse(`${q[key]}T00:00:00Z`)) || new Date(`${q[key]}T00:00:00Z`).toISOString().slice(0, 10) !== q[key]) throw new InputError('Choose a valid received date.', 400);
    add(`created_at ${operator} ((?::date${key === 'to' ? " + 1" : ''})::timestamp AT TIME ZONE 'Asia/Kolkata')`, q[key]);
  }
  const sorts = { newest: 'created_at DESC,id DESC', oldest: 'created_at ASC,id ASC', name: 'lower(name),id', name_desc: 'lower(name) DESC,id DESC', title: 'lower(title),id', title_desc: 'lower(title) DESC,id DESC', company: 'lower(company) NULLS LAST,id', company_desc: 'lower(company) DESC NULLS LAST,id DESC' };
  if (q.sort && !sorts[q.sort]) throw new InputError('Invalid sort.', 400);
  return { values, where: `WHERE ${clauses.join(' AND ')}`, order: sorts[q.sort || 'newest'] };
}

function registerSpeakerAdminRoutes(router, { pool, route, intId }) {
  router.get('/speaker-applications', route(async req => {
    const { page, page_size } = pageOptions(req.query), { values, where, order } = pitchFilters(req.query);
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM speaker_applications ${where}`, values)).rows[0].n;
    const data = (await pool.query(`SELECT id,name,email,mobile_number,title,domain,speaker_role,company,role_company,status,created_at,deleted_at
      FROM speaker_applications ${where} ORDER BY ${order} LIMIT ${page_size} OFFSET ${(page - 1) * page_size}`, values)).rows;
    return { data, total, page, page_size };
  }));
  router.get('/speaker-applications/export', async (req, res, next) => {
    try {
      const { values, where, order } = pitchFilters(req.query);
      const rows = (await pool.query(`SELECT a.*,d.label AS domain_label FROM (SELECT * FROM speaker_applications ${where}) a
        LEFT JOIN domains d ON d.key=a.domain ORDER BY ${order.split(',').map(s => 'a.' + s).join(',').replaceAll('a.lower(', 'lower(a.')}`, values)).rows;
      const columns = [['name','Name'],['speaker_role','Role'],['company','Company'],['role_company','Original role & company'],['mobile_number','Mobile number'],['email','Email'],['link','LinkedIn / legacy submitted link'],['domain_label','Domain'],['title','Session title'],['preferred_call_time','Callback window (IST)'],['status','Status'],['created_at','Received (UTC)']].map(([key,label])=>({key,label}));
      res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="speaker-pitches.csv"').send('\uFEFF' + csvExport(rows.map(r=>({...r,created_at:new Date(r.created_at).toISOString()})),columns));
    } catch (e) { if (e instanceof InputError) res.status(e.status).json({success:false,error:e.message}); else next(e); }
  });
  router.get('/speaker-applications/new-count', route(async () => ({ count: (await pool.query("SELECT COUNT(*)::int AS n FROM speaker_applications WHERE status='new' AND deleted_at IS NULL")).rows[0].n })));
  router.get('/speaker-applications/trash-ids', route(async () => ({ ids: (await pool.query('SELECT id FROM speaker_applications WHERE deleted_at IS NOT NULL ORDER BY id LIMIT 10000')).rows.map(r=>r.id) })));
  router.get('/speaker-applications/:id', route(async req => {
    const { rows } = await pool.query('SELECT * FROM speaker_applications WHERE id=$1', [intId(req.params.id)]);
    if (!rows.length) throw new InputError('Enquiry not found.', 404);
    return { application: rows[0] };
  }));
  router.patch('/speaker-applications/:id', route(async req => {
    if (!STATUSES.includes(req.body?.status)) throw new InputError('Choose a valid status.', 400);
    const { rows } = await pool.query('UPDATE speaker_applications SET status=$2,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id,status', [intId(req.params.id), req.body.status]);
    if (!rows.length) throw new InputError('Active enquiry not found.', 404);
    return rows[0];
  }));
  router.delete('/speaker-applications/:id', route(async req => {
    const { rows } = await pool.query('UPDATE speaker_applications SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id', [intId(req.params.id)]);
    if (!rows.length) throw new InputError('Active enquiry not found.', 404);
    return rows[0];
  }));
  router.post('/speaker-applications/:id/restore', route(async req => {
    const { rows } = await pool.query('UPDATE speaker_applications SET deleted_at=NULL,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id', [intId(req.params.id)]);
    if (!rows.length) throw new InputError('Trashed enquiry not found.', 404);
    return rows[0];
  }));
  router.delete('/speaker-applications/:id/permanent', route(async req => {
    if (req.body?.confirm !== 'DELETE') throw new InputError('Please confirm permanent deletion.', 400);
    const { rows } = await pool.query('DELETE FROM speaker_applications WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id', [intId(req.params.id)]);
    if (!rows.length) throw new InputError('Trashed enquiry not found.', 404);
    return rows[0];
  }));
  router.post('/speaker-applications/empty-trash', route(async req => {
    if (req.body?.confirm !== 'EMPTY TRASH' || !Array.isArray(req.body.ids) || req.body.ids.length > 10000 || req.body.ids.some(id=>!Number.isInteger(id)||id<1)) throw new InputError('Please confirm the enquiries to permanently delete.', 400);
    // Only delete the snapshot the admin reviewed, never newly trashed items from another admin.
    const { rows } = await pool.query('DELETE FROM speaker_applications WHERE deleted_at IS NOT NULL AND id=ANY($1::int[]) RETURNING id', [req.body.ids]);
    return { deleted: rows.length };
  }));
}
module.exports = { saveSpeakerPitch, pitchFilters, registerSpeakerAdminRoutes };
