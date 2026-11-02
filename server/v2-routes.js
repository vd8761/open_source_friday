const express = require('express');
const { InputError } = require('./outreach-csv');
const { pageOptions } = require('./table-query');
const { registerStudentImportRoutes } = require('./student-import');
const { registerLoungeAdminRoutes } = require('./lounge');
const { DOMAINS, loadEpisodes, computeStats, syncPresenterColumns, publicSpeaker, sendDataImage, validate: v } = require('./v2-data');

const route = (fn, message = 'Unable to complete this request. Please try again.') => async (req, res) => {
  try { res.json({ success: true, ...await fn(req, res) }); }
  catch (e) {
    if (!(e instanceof InputError)) console.error('[v2]', e);
    res.status(e instanceof InputError ? e.status : 500).json({ success: false, error: e instanceof InputError ? e.message : message });
  }
};
const intId = value => {
  if (!/^\d{1,9}$/.test(String(value))) throw new InputError('Not found.', 404);
  return Number(value);
};
const episodeNumber = value => intId(String(value).replace(/^episode-/, ''));

// Small fixed-window limiter per client IP. Render runs one instance, so memory is enough here.
function rateLimit({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now(), key = req.ip;
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) hits.set(key, { start: t, count: 1 });
    else if (++entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - t) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many submissions. Please try again later.' });
    }
    if (hits.size > 10000) for (const [k, e] of hits) if (t - e.start >= windowMs) hits.delete(k);
    next();
  };
}

const futureFridays = (value, now = Date.now()) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 4) throw new InputError('Choose up to 4 preferred Fridays.', 400);
  const today = new Date(now + 330 * 60000).toISOString().slice(0, 10);
  return [...new Set(value)].map(day => {
    const parsed = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day || parsed.getUTCDay() !== 5 || day < today)
      throw new InputError('Preferred dates must be upcoming Fridays.', 400);
    return day;
  });
};

function createV2PublicRouter({ pool, verifyRecaptcha, now = Date.now, applicationLimit = rateLimit({ limit: 5, windowMs: 3600000 }) }) {
  const router = express.Router();
  let statsCache = null;

  router.get('/v2/episodes', route(async () => ({ episodes: (await loadEpisodes(pool)).map(({ speaker_keys, ...e }) => e) })));
  router.get('/v2/episodes/:episode_number', route(async req => {
    const [episode] = await loadEpisodes(pool, { episodeNumber: episodeNumber(req.params.episode_number), withDescription: true });
    if (!episode) throw new InputError('Episode not found.', 404);
    const { speaker_keys, ...rest } = episode;
    return { episode: rest };
  }));
  router.get('/episodes/:episode_number/presenter-photo', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT presenter_photo_url FROM episodes WHERE episode_number=$1', [episodeNumber(req.params.episode_number)]);
      sendDataImage(res, rows[0]?.presenter_photo_url);
    } catch { res.status(404).json({ success: false, error: 'Photo not found' }); }
  });

  router.get('/speakers', route(async () => {
    const { rows } = await pool.query(`SELECT s.*, COALESCE(json_agg(json_build_object('episode_number',e.episode_number,'title',e.title,
        'event_date',e.event_date::date,'domain',e.domain) ORDER BY e.episode_number) FILTER (WHERE e.id IS NOT NULL), '[]') AS episodes
      FROM speakers s LEFT JOIN episode_speakers es ON es.speaker_id=s.id
      LEFT JOIN episodes e ON e.id=es.episode_id AND e.is_test IS NOT TRUE
      WHERE s.is_published GROUP BY s.id ORDER BY s.name`);
    return { speakers: rows.map(s => ({ ...publicSpeaker(s), episodes: s.episodes, episode_count: s.episodes.length, is_repeat: s.episodes.length > 1 })) };
  }));
  router.get('/speakers/:id/photo', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT photo_url FROM speakers WHERE id=$1 AND is_published', [intId(req.params.id)]);
      sendDataImage(res, rows[0]?.photo_url);
    } catch { res.status(404).json({ success: false, error: 'Photo not found' }); }
  });

  router.get('/stats', route(async () => {
    if (!statsCache || now() - statsCache.at > 60000) {
      const settings = (await pool.query("SELECT value FROM site_settings WHERE key='club_stats'")).rows[0];
      statsCache = { at: now(), stats: { ...computeStats(await loadEpisodes(pool), now()), club_stats: settings?.value || [] } };
    }
    return { stats: statsCache.stats };
  }));

  router.get('/tips', route(async () => ({ tips: (await pool.query(`SELECT t.id,t.text,t.domain,t.is_tip_of_week,t.published_at,
      e.episode_number,s.id AS speaker_id,s.name AS speaker_name
    FROM tips t LEFT JOIN episodes e ON e.id=t.episode_id LEFT JOIN speakers s ON s.id=t.speaker_id AND s.is_published
    WHERE t.published_at IS NOT NULL AND t.published_at<=NOW() ORDER BY t.is_tip_of_week DESC,t.published_at DESC LIMIT 100`)).rows })));

  router.get('/site-settings', route(async () => {
    const rows = (await pool.query("SELECT key,value FROM site_settings WHERE key IN ('club_stats')")).rows;
    return { settings: Object.fromEntries(rows.map(r => [r.key, r.value])) };
  }));

  router.post('/speaker-applications', applicationLimit, route(async req => {
    const b = req.body || {};
    if (!await verifyRecaptcha(b.recaptcha_token, 'speaker_application'))
      throw new InputError('Security check failed. Please refresh the page and try again.', 400);
    const email = v.text(b.email, 'Email', 254, { required: true }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Enter a valid email address.', 400);
    const link = v.text(b.link, 'Link', 300);
    if (link && !/^https?:\/\/\S+$/.test(link)) throw new InputError('Link must start with http:// or https://.', 400);
    const row = [v.text(b.name, 'Name', 120, { required: true }), email, v.text(b.role_company, 'Role and company', 160, { required: true }),
      link, v.text(b.title, 'Session title', 160, { required: true }), v.domain(b.domain), v.text(b.abstract, 'Abstract', 2000, { required: true }),
      futureFridays(b.preferred_fridays, now())];
    await pool.query(`INSERT INTO speaker_applications(name,email,role_company,link,title,domain,abstract,preferred_fridays)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::date[])`, row);
    return { message: 'Thanks. Your pitch reached the OSF team.' };
  }, 'Unable to send your pitch. Please try again.'));

  return router;
}

function createV2AdminRouter({ pool, authenticateToken }) {
  const router = express.Router();
  router.use(['/speakers', '/episodes/:id/speakers', '/episodes/:id/v2-details', '/episodes/:id/lounge', '/tips', '/speaker-applications', '/site-settings', '/contacts'], authenticateToken);
  const transaction = async fn => {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
    catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
    finally { db.release(); }
  };
  const speakerFields = b => {
    const domains = b.domains == null ? [] : b.domains;
    if (!Array.isArray(domains) || domains.some(d => !DOMAINS.includes(d))) throw new InputError('Choose valid domains.', 400);
    const linkedin = v.text(b.linkedin_url, 'LinkedIn URL', 300);
    if (linkedin && !/^https:\/\/([a-z]+\.)?linkedin\.com\//.test(linkedin)) throw new InputError('LinkedIn URL must start with https://www.linkedin.com/.', 400);
    return [v.text(b.name, 'Name', 120, { required: true }), v.text(b.honorific, 'Honorific', 20), v.text(b.designation, 'Designation', 160),
      v.text(b.company, 'Company', 160), v.text(b.bio, 'Bio', 1200), v.photo(b.photo_url), linkedin, [...new Set(domains)], b.is_published !== false];
  };
  const duplicateName = e => { if (e.code === '23505') throw new InputError('A speaker with this name already exists.', 409); throw e; };

  router.get('/speakers', route(async () => ({ speakers: (await pool.query(`SELECT s.id,s.name,s.honorific,s.designation,s.company,s.bio,s.linkedin_url,
      s.domains,s.is_published,s.updated_at,(s.photo_url IS NOT NULL) AS has_photo,
      COALESCE(array_agg(e.episode_number ORDER BY e.episode_number) FILTER (WHERE e.id IS NOT NULL),'{}') AS episode_numbers
    FROM speakers s LEFT JOIN episode_speakers es ON es.speaker_id=s.id LEFT JOIN episodes e ON e.id=es.episode_id
    GROUP BY s.id ORDER BY s.name`)).rows })));
  router.post('/speakers', route(async req => {
    const { rows } = await pool.query(`INSERT INTO speakers(name,honorific,designation,company,bio,photo_url,linkedin_url,domains,is_published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, speakerFields(req.body || {})).catch(duplicateName);
    return { id: rows[0].id };
  }));
  // A photo change here updates every page, and is written through to linked episodes for v1.0.
  router.put('/speakers/:id', route(async req => transaction(async db => {
    const fields = speakerFields(req.body || {});
    const keepPhoto = req.body?.photo_url === undefined;
    const { rows } = await db.query(`UPDATE speakers SET name=$2,honorific=$3,designation=$4,company=$5,bio=$6,
        photo_url=CASE WHEN $11 THEN photo_url ELSE $7 END,linkedin_url=$8,domains=$9,is_published=$10,updated_at=NOW()
      WHERE id=$1 RETURNING id`, [intId(req.params.id), ...fields, keepPhoto]).catch(duplicateName);
    if (!rows.length) throw new InputError('Speaker not found.', 404);
    const linked = await db.query('SELECT episode_id FROM episode_speakers WHERE speaker_id=$1', [rows[0].id]);
    await syncPresenterColumns(db, linked.rows.map(r => r.episode_id));
    return { id: rows[0].id };
  })));

  router.put('/episodes/:id/speakers', route(async req => transaction(async db => {
    const episodeId = intId(req.params.id);
    const ids = req.body?.speaker_ids;
    if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => !Number.isInteger(id)) || new Set(ids).size !== ids.length)
      throw new InputError('Choose up to 8 different speakers.', 400);
    if (!(await db.query('SELECT 1 FROM episodes WHERE id=$1 FOR UPDATE', [episodeId])).rows.length) throw new InputError('Episode not found.', 404);
    if (ids.length && (await db.query('SELECT COUNT(*)::int AS n FROM speakers WHERE id=ANY($1::int[])', [ids])).rows[0].n !== ids.length)
      throw new InputError('One or more speakers do not exist.', 400);
    await db.query('DELETE FROM episode_speakers WHERE episode_id=$1', [episodeId]);
    for (const [sort, id] of ids.entries()) await db.query('INSERT INTO episode_speakers(episode_id,speaker_id,sort) VALUES($1,$2,$3)', [episodeId, id, sort]);
    await syncPresenterColumns(db, [episodeId]);
    return { episode_id: episodeId, speaker_ids: ids };
  })));

  router.put('/episodes/:id/v2-details', route(async req => {
    const b = req.body || {};
    const agenda = b.agenda == null ? [] : b.agenda;
    if (!Array.isArray(agenda) || agenda.length > 12 || agenda.some(item => typeof item !== 'string' || !item.trim() || item.length > 200))
      throw new InputError('Agenda must be up to 12 items of 200 characters or fewer.', 400);
    const { rows } = await pool.query('UPDATE episodes SET domain=$2,agenda=$3::jsonb,short_blurb=$4 WHERE id=$1 RETURNING id',
      [intId(req.params.id), v.domain(b.domain), JSON.stringify(agenda.map(s => s.trim())), v.text(b.short_blurb, 'Short blurb', 200)]);
    if (!rows.length) throw new InputError('Episode not found.', 404);
    return { id: rows[0].id };
  }));

  const tipFields = b => {
    const publishedAt = b.published_at == null || b.published_at === '' ? null : new Date(b.published_at);
    if (publishedAt && Number.isNaN(publishedAt.getTime())) throw new InputError('Use a valid publish date.', 400);
    const optionalId = value => value == null || value === '' ? null : intId(value);
    return [v.text(b.text, 'Tip', 500, { required: true }), optionalId(b.episode_id), optionalId(b.speaker_id), v.domain(b.domain),
      b.is_tip_of_week === true, publishedAt];
  };
  const tipRefs = e => { if (e.code === '23503') throw new InputError('The linked episode or speaker does not exist.', 400); throw e; };
  router.get('/tips', route(async () => ({ tips: (await pool.query(`SELECT t.*,e.episode_number,s.name AS speaker_name FROM tips t
    LEFT JOIN episodes e ON e.id=t.episode_id LEFT JOIN speakers s ON s.id=t.speaker_id ORDER BY t.created_at DESC`)).rows })));
  // Marking a tip of the week clears the previous one in the same transaction.
  const saveTip = (sql, values, id) => transaction(async db => {
    if (values[4]) await db.query('UPDATE tips SET is_tip_of_week=FALSE WHERE is_tip_of_week AND id IS DISTINCT FROM $1', [id ?? null]);
    const { rows } = await db.query(sql, id == null ? values : [id, ...values]).catch(tipRefs);
    if (!rows.length) throw new InputError('Tip not found.', 404);
    return { id: rows[0].id };
  });
  router.post('/tips', route(async req => saveTip(`INSERT INTO tips(text,episode_id,speaker_id,domain,is_tip_of_week,published_at)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, tipFields(req.body || {}))));
  router.put('/tips/:id', route(async req => saveTip(`UPDATE tips SET text=$2,episode_id=$3,speaker_id=$4,domain=$5,is_tip_of_week=$6,
    published_at=$7,updated_at=NOW() WHERE id=$1 RETURNING id`, tipFields(req.body || {}), intId(req.params.id))));
  router.delete('/tips/:id', route(async req => {
    const { rows } = await pool.query('DELETE FROM tips WHERE id=$1 RETURNING id', [intId(req.params.id)]);
    if (!rows.length) throw new InputError('Tip not found.', 404);
    return { id: rows[0].id };
  }));

  const STATUSES = ['new', 'contacted', 'scheduled', 'declined'];
  router.get('/speaker-applications', route(async req => {
    const { page, page_size } = pageOptions(req.query);
    if (req.query.status && !STATUSES.includes(req.query.status)) throw new InputError('Invalid status filter.', 400);
    const values = req.query.status ? [req.query.status] : [];
    const where = values.length ? 'WHERE status=$1' : '';
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM speaker_applications ${where}`, values)).rows[0].n;
    const data = (await pool.query(`SELECT * FROM speaker_applications ${where} ORDER BY created_at DESC,id DESC
      LIMIT ${page_size} OFFSET ${(page - 1) * page_size}`, values)).rows;
    return { data, total, page, page_size };
  }));
  router.patch('/speaker-applications/:id', route(async req => {
    if (!STATUSES.includes(req.body?.status)) throw new InputError('Choose a valid status.', 400);
    const { rows } = await pool.query('UPDATE speaker_applications SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id,status',
      [intId(req.params.id), req.body.status]);
    if (!rows.length) throw new InputError('Application not found.', 404);
    return rows[0];
  }));

  router.get('/site-settings', route(async () => ({ settings: Object.fromEntries((await pool.query('SELECT key,value FROM site_settings')).rows.map(r => [r.key, r.value])) })));
  router.put('/site-settings/club_stats', route(async req => {
    const value = req.body?.value;
    if (!Array.isArray(value) || value.length > 8 || value.some(s => !s || typeof s.label !== 'string' || typeof s.value !== 'string'
      || !s.label.trim() || !s.value.trim() || s.label.length > 40 || s.value.length > 20))
      throw new InputError('Club stats must be up to 8 label/value pairs.', 400);
    await pool.query(`UPDATE site_settings SET value=$1::jsonb,updated_at=NOW(),updated_by=$2 WHERE key='club_stats'`,
      [JSON.stringify(value.map(s => ({ label: s.label.trim(), value: s.value.trim() }))), req.user?.id ?? null]);
    return {};
  }));
  registerStudentImportRoutes(router, { pool, route });
  registerLoungeAdminRoutes(router, { pool, route });
  return router;
}

module.exports = { createV2PublicRouter, createV2AdminRouter, rateLimit, futureFridays };
