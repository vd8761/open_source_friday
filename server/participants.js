const { InputError } = require('./outreach-csv');
const { episodeEnd } = require('./episode-time');
const { enqueueZoomRegistrations } = require('./zoom-jobs');

const id = (value, label) => {
  if (!/^[1-9]\d{0,9}$/.test(String(value ?? '')) || Number(value) > 2147483647) throw new InputError(`Choose a valid ${label}.`, 400);
  return Number(value);
};
const like = q => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

// Admin-added participants: pick an existing contact (any student record), or create one from a Zoom
// participant's name and email. Optionally links that Zoom participant's session in the same step.
function registerParticipantRoutes(router, { pool, route, onZoomQueued = () => {}, now = Date.now }) {
  router.get('/students/search', route(async req => {
    const q = String(req.query.q || '').trim();
    if (q.length > 150) throw new InputError('Please use a search up to 150 characters.', 400);
    const episodeId = req.query.episode_id ? id(req.query.episode_id, 'event') : null;
    const values = [like(q), episodeId];
    const { rows } = await pool.query(`SELECT s.id,s.full_name,s.email,s.college,s.country_code,s.whatsapp_number,
        EXISTS(SELECT 1 FROM episode_registrations er WHERE er.student_id=s.id AND er.episode_id=$2) AS already_registered
      FROM students s WHERE $1='%%' OR s.full_name ILIKE $1 OR s.email ILIKE $1 OR CONCAT(s.country_code,s.whatsapp_number) ILIKE $1
      ORDER BY LOWER(s.full_name),s.id LIMIT 20`, values);
    return { students: rows };
  }));

  router.post('/episodes/:episodeId/participants', route(async req => {
    const episodeId = id(req.params.episodeId, 'event'), b = req.body || {};
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const episode = (await db.query('SELECT * FROM episodes WHERE id=$1 FOR UPDATE', [episodeId])).rows[0];
      if (!episode) throw new InputError('Event not found.', 404);
      const participant = b.participant_id ? (await db.query(
        'SELECT * FROM attendance_participants WHERE episode_id=$1 AND id=$2 AND duplicate_of IS NULL FOR UPDATE', [episodeId, String(b.participant_id)])).rows[0] : null;
      if (b.participant_id && !participant) throw new InputError('That Zoom participant is no longer waiting for review. Refresh the page.', 404);
      if (participant?.registration_id) throw new InputError('That Zoom participant is already linked to an attendee.', 409);

      let student;
      if (b.student_id) {
        student = (await db.query('SELECT id,full_name,email FROM students WHERE id=$1', [id(b.student_id, 'contact')])).rows[0];
        if (!student) throw new InputError('Contact not found.', 404);
      } else {
        const name = String(b.full_name || participant?.name || '').trim(), email = String(b.email || participant?.email || '').trim().toLowerCase();
        if (!name || name.length > 120) throw new InputError('Enter the participant’s name (up to 120 characters).', 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new InputError('A valid email is needed to create a new contact.', 400);
        student = (await db.query('SELECT id,full_name,email FROM students WHERE LOWER(TRIM(email))=$1 ORDER BY id LIMIT 1', [email])).rows[0]
          || (await db.query('INSERT INTO students(full_name,email) VALUES($1,$2) RETURNING id,full_name,email', [name, email])).rows[0];
      }

      let registration = (await db.query('SELECT id FROM episode_registrations WHERE episode_id=$1 AND student_id=$2 ORDER BY id LIMIT 1', [episodeId, student.id])).rows[0];
      const created = !registration;
      if (created) registration = (await db.query('INSERT INTO episode_registrations(student_id,episode_id,added_by_admin_id) VALUES($1,$2,$3) RETURNING id',
        [student.id, episodeId, req.user?.id ?? null])).rows[0];
      else if (!participant) throw new InputError(`${student.full_name} is already registered for this event.`, 409);

      // Upcoming online events with a Zoom meeting: Zoom registers them and sends the join link, as for a normal registration.
      const upcoming = (episodeEnd(episode) ?? 0) > now();
      const zoomQueued = created && !participant && upcoming && episode.event_mode === 'Online' && Boolean(episode.zoom_meeting_id);
      if (zoomQueued) await enqueueZoomRegistrations(db, episodeId);

      if (participant) {
        await db.query("UPDATE attendance_participants SET registration_id=$3,match_method='manual' WHERE episode_id=$1 AND id=$2", [episodeId, participant.id, registration.id]);
        await db.query('INSERT INTO attendance_audit(episode_id,registration_id,action,detail,admin_id) VALUES($1,$2,$3,$4,$5)',
          [episodeId, registration.id, 'manual_match', `${participant.id} (added as participant)`, req.user?.id ?? null]);
      }
      await db.query('COMMIT');
      if (zoomQueued) onZoomQueued();
      const message = participant ? `${student.full_name} added and their Zoom session linked.`
        : zoomQueued ? `${student.full_name} added. Zoom will email them the join link.`
        : `${student.full_name} added to this event.`;
      return { registration_id: registration.id, student_id: student.id, created, zoom_queued: zoomQueued, message };
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; } finally { db.release(); }
  }));
}

module.exports = { registerParticipantRoutes };
