const { ZoomError } = require('./zoom');

// Commit application registration first, then enroll in Zoom. Zoom sends the only email.
async function enqueueZoomRegistrations(db, episodeId) {
  await db.query(`INSERT INTO zoom_registration_jobs (registration_id, meeting_id)
    SELECT er.id, e.zoom_meeting_id FROM episode_registrations er
    JOIN episodes e ON e.id = er.episode_id
    WHERE e.id = $1 AND e.event_mode = 'Online' AND e.zoom_meeting_id IS NOT NULL
    ON CONFLICT (registration_id) DO NOTHING`, [episodeId]);
}
async function processZoomJobs(pool, zoom, limit = 10, registrationId = null) {
  if (!zoom.configured()) return;
  for (let i = 0; i < limit; i++) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows } = await db.query(`SELECT j.*, s.email, s.full_name
        FROM zoom_registration_jobs j
        JOIN episode_registrations er ON er.id = j.registration_id
        JOIN students s ON s.id = er.student_id
        JOIN episodes e ON e.id = er.episode_id
        WHERE j.status = 'pending' AND j.next_attempt_at <= NOW()
          AND ($1::integer IS NOT NULL OR e.is_active = TRUE)
          AND ($1::integer IS NULL OR j.registration_id = $1)
        ORDER BY j.next_attempt_at, j.registration_id
        LIMIT 1 FOR UPDATE OF j SKIP LOCKED`, [registrationId]);
      if (!rows.length) { await db.query('COMMIT'); return; }
      const job = rows[0];
      let result;
      let failure;
      let rateLimit;
      try { result = await zoom.addRegistrant(job.meeting_id, job); }
      catch (error) {
        if (error instanceof ZoomError && error.status === 429) rateLimit = error;
        failure = error instanceof ZoomError
          ? `Zoom registration failed. ${error.message}`
          : 'Zoom registration failed. Check Zoom credentials, meeting settings and API availability.';
      }
      if (failure) {
        const delaySeconds = rateLimit?.retryAfterSeconds || Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6));
        await db.query(`UPDATE zoom_registration_jobs SET attempts = attempts + 1,
          invitation_status = $4, last_error = $2,
          next_attempt_at = NOW() + $3 * INTERVAL '1 second' WHERE registration_id = $1`,
          [job.registration_id, failure, delaySeconds, rateLimit ? 'rate_limited' : 'failed']);
        console.error('[Zoom] Registration pending; retry scheduled:', job.registration_id, failure);
      } else {
        await db.query(`UPDATE zoom_registration_jobs SET status = 'registered', registrant_id = $2,
          join_url = $3, invitation_status = 'zoom_managed', zoom_registered_at = NOW(),
          attempts = attempts + 1, last_error = NULL WHERE registration_id = $1`,
          [job.registration_id, result.registrantId, result.joinUrl]);
      }
      await db.query('COMMIT');
      // Stop this batch when Zoom asks us to wait.
      if (rateLimit) return;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  }
}
module.exports = { enqueueZoomRegistrations, processZoomJobs };
