const { syncInviteReports } = require("./invite-service");
const { syncEpisodeAttendance } = require("./attendance");
const { SenderError } = require("./sender");
const { ZoomError } = require("./zoom");
const { InputError } = require("./outreach-csv");
const { episodeEnd } = require("./episode-time");
async function syncRecentInviteReports(pool, sender) {
  if (!sender.configured()) return;
  const db = await pool.connect();
  let locked = false;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(7410627) AS locked"))
      .rows[0].locked;
    if (!locked) return;
    const rows = (
      await db.query(`SELECT c.id FROM invite_campaigns c WHERE c.created_at>NOW()-INTERVAL '30 days'
      AND EXISTS(SELECT 1 FROM invite_batches b WHERE b.campaign_id=c.id AND b.status='submitted' AND b.provider_campaign_id IS NOT NULL)
      ORDER BY c.reports_synced_at NULLS FIRST LIMIT 5`)
    ).rows;
    for (const row of rows) {
      try {
        await syncInviteReports(db, sender, row.id);
      } catch (error) {
        if (error instanceof SenderError && error.status === 429) return;
      }
    }
  } finally {
    try {
      if (locked) await db.query("SELECT pg_advisory_unlock(7410627)");
    } catch (error) {
      db.release(error);
      throw error;
    }
    db.release();
  }
}
async function syncRecentAttendance(pool, zoom, now = Date.now()) {
  if (!zoom.configured()) return;
  const db = await pool.connect();
  let locked = false;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(7410628) AS locked"))
      .rows[0].locked;
    if (!locked) return;
    const episodes = (
      await db.query(`SELECT e.* FROM episodes e WHERE e.zoom_meeting_id IS NOT NULL
      AND e.event_date>=CURRENT_DATE-INTERVAL '7 days' AND e.event_date<=CURRENT_DATE
      AND NOT EXISTS(SELECT 1 FROM attendance_syncs s WHERE s.episode_id=e.id AND s.report_complete=TRUE)`)
    ).rows;
    for (const e of episodes) {
      const end = episodeEnd(e);
      if (end && end + 30 * 60 * 1000 <= now)
        await db.query(
          "INSERT INTO attendance_tasks(episode_id) VALUES($1) ON CONFLICT(episode_id) DO NOTHING",
          [e.id],
        );
    }
    const pending = (
      await db.query(`SELECT e.*,t.attempts FROM attendance_tasks t JOIN episodes e ON e.id=t.episode_id
      WHERE t.status='pending' AND t.next_attempt_at<=NOW()
      AND NOT EXISTS(SELECT 1 FROM attendance_syncs s WHERE s.episode_id=e.id AND s.report_complete=TRUE) ORDER BY t.next_attempt_at LIMIT 5`)
    ).rows;
    for (const e of pending) {
      try {
        await db.query("BEGIN");
        await syncEpisodeAttendance(db, zoom, e);
        await db.query(
          "UPDATE attendance_tasks SET status='done',attempts=attempts+1,last_error=NULL WHERE episode_id=$1",
          [e.id],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        const safe = error instanceof ZoomError || error instanceof InputError;
        const delay =
          error.retryAfterSeconds ||
          Math.min(86400, 1800 * 2 ** Math.min(e.attempts, 5));
        await db.query(
          `UPDATE attendance_tasks SET attempts=attempts+1,last_error=$2,next_attempt_at=NOW()+$3*INTERVAL '1 second' WHERE episode_id=$1`,
          [
            e.id,
            safe
              ? error.message
              : "Automatic attendance sync could not complete. Try a manual sync.",
            delay,
          ],
        );
        if (error.status === 429) return;
      }
    }
  } finally {
    try {
      if (locked) await db.query("SELECT pg_advisory_unlock(7410628)");
    } catch (error) {
      db.release(error);
      throw error;
    }
    db.release();
  }
}
module.exports = { syncRecentInviteReports, syncRecentAttendance, episodeEnd };
