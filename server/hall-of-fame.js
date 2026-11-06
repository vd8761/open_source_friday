const { InputError } = require('./outreach-csv');
const { attendanceReport } = require('./attendance');
const { sendDataImage, validate: v } = require('./v2-data');

const AWARDS = { first_to_register: 'First to register', stayed_longest: 'Stayed the longest', most_interactive: 'Interacted the most' };
const id = value => {
  if (!/^[1-9]\d{0,9}$/.test(String(value ?? '')) || Number(value) > 2147483647) throw new InputError('Not found.', 404);
  return Number(value);
};
const award = value => { if (!Object.hasOwn(AWARDS, value)) throw new InputError('Choose a valid award.', 400); return value; };
// "24 Oct, 9:12 AM" in IST; built from parts so the AM/PM case does not depend on the server's ICU data.
const ist = date => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(new Date(date)).map(x => [x.type, x.value]));
  return `${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
};
const publicEntry = row => ({
  award: row.award, label: AWARDS[row.award], display_name: row.display_name, college: row.college || null, stat: row.stat || null,
  photo_url: row.has_photo ? `/api/hall-of-fame/${row.id}/photo?v=${new Date(row.updated_at).getTime()}` : null,
});

// Suggestions only: the admin confirms each winner. Admin-added registrations never count as "first to register".
async function suggestions(db, episodeId) {
  const first = (await db.query(`SELECT er.id AS registration_id,s.full_name,s.college,er.registered_at::timestamptz AS registered_at
    FROM episode_registrations er JOIN students s ON s.id=er.student_id
    WHERE er.episode_id=$1 AND er.added_by_admin_id IS NULL ORDER BY er.registered_at ASC,er.id ASC LIMIT 1`, [episodeId])).rows[0];
  const report = await attendanceReport(db, episodeId);
  const longest = report.data.filter(r => r.duration_seconds > 0).sort((a, b) => b.duration_seconds - a.duration_seconds)[0];
  return {
    first_to_register: first ? { registration_id: first.registration_id, display_name: first.full_name, college: first.college, stat: `Registered ${ist(first.registered_at)} IST` } : null,
    stayed_longest: longest ? { registration_id: longest.registration_id, display_name: longest.full_name, college: longest.college, stat: `${Math.round(longest.duration_seconds / 60)} min on the call` } : null,
    most_interactive: null,
  };
}

function registerHallOfFameAdminRoutes(router, { pool, route }) {
  router.get('/episodes/:id/hall-of-fame', route(async req => {
    const episodeId = id(req.params.id);
    if (!(await pool.query('SELECT 1 FROM episodes WHERE id=$1', [episodeId])).rows.length) throw new InputError('Episode not found.', 404);
    // Photos come inline here (at most three, cropped): an <img> request cannot carry the admin token,
    // and unpublished student photos must not be served publicly.
    const awards = (await pool.query(`SELECT id,award,registration_id,display_name,college,stat,consent_confirmed,is_published,updated_at,photo_url
      FROM hall_of_fame WHERE episode_id=$1`, [episodeId])).rows;
    const attendees = (await pool.query(`SELECT er.id AS registration_id,s.full_name,s.email,s.college FROM episode_registrations er
      JOIN students s ON s.id=er.student_id WHERE er.episode_id=$1 ORDER BY LOWER(s.full_name),er.id`, [episodeId])).rows;
    return { award_names: AWARDS, awards, suggestions: await suggestions(pool, episodeId), attendees };
  }));
  router.put('/episodes/:id/hall-of-fame/:award', route(async req => {
    const episodeId = id(req.params.id), key = award(req.params.award), b = req.body || {};
    const registrationId = b.registration_id == null || b.registration_id === '' ? null : id(b.registration_id);
    if (registrationId && !(await pool.query('SELECT 1 FROM episode_registrations WHERE id=$1 AND episode_id=$2', [registrationId, episodeId])).rows.length)
      throw new InputError('Choose a student registered for this episode.', 400);
    const consent = b.consent_confirmed === true, published = b.is_published === true;
    if (published && !consent) throw new InputError('Confirm the student agreed to be featured before showing them on the website.', 400);
    const keepPhoto = b.photo_url === undefined;
    const values = [episodeId, key, registrationId, v.text(b.display_name, 'Name', 120, { required: true }), v.text(b.college, 'College', 160),
      v.text(b.stat, 'Highlight', 80), keepPhoto ? null : v.photo(b.photo_url), consent, published, keepPhoto];
    const { rows } = await pool.query(`INSERT INTO hall_of_fame(episode_id,award,registration_id,display_name,college,stat,photo_url,consent_confirmed,is_published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(episode_id,award) DO UPDATE SET registration_id=$3,display_name=$4,college=$5,stat=$6,
        photo_url=CASE WHEN $10 THEN hall_of_fame.photo_url ELSE $7 END,consent_confirmed=$8,is_published=$9,updated_at=NOW()
      RETURNING id`, values).catch(e => { if (e.code === '23503') throw new InputError('Episode not found.', 404); throw e; });
    return { id: rows[0].id };
  }));
  router.delete('/episodes/:id/hall-of-fame/:award', route(async req => {
    await pool.query('DELETE FROM hall_of_fame WHERE episode_id=$1 AND award=$2', [id(req.params.id), award(req.params.award)]);
    return {};
  }));
}

// Public: the most recent episode that has at least one published award.
function registerHallOfFamePublicRoutes(router, { pool, route }) {
  router.get('/hall-of-fame', route(async () => {
    const episode = (await pool.query(`SELECT e.id,e.episode_number,to_char(e.event_date,'YYYY-MM-DD') AS event_date FROM episodes e
      WHERE e.is_test IS NOT TRUE AND EXISTS(SELECT 1 FROM hall_of_fame h WHERE h.episode_id=e.id AND h.is_published)
      ORDER BY e.event_date DESC,e.episode_number DESC LIMIT 1`)).rows[0];
    if (!episode) return { hall_of_fame: null };
    const rows = (await pool.query(`SELECT id,award,display_name,college,stat,updated_at,(photo_url IS NOT NULL) AS has_photo
      FROM hall_of_fame WHERE episode_id=$1 AND is_published`, [episode.id])).rows;
    const order = Object.keys(AWARDS);
    return { hall_of_fame: { episode_number: episode.episode_number, event_date: episode.event_date,
      awards: rows.sort((a, b) => order.indexOf(a.award) - order.indexOf(b.award)).map(publicEntry) } };
  }));
  router.get('/hall-of-fame/:entryId/photo', async (req, res) => {
    try { sendDataImage(res, (await pool.query('SELECT photo_url FROM hall_of_fame WHERE id=$1 AND is_published', [id(req.params.entryId)])).rows[0]?.photo_url); }
    catch { res.status(404).json({ success: false, error: 'Photo not found' }); }
  });
}

module.exports = { registerHallOfFameAdminRoutes, registerHallOfFamePublicRoutes, AWARDS };
