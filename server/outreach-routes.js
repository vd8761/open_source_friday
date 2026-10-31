const express = require("express");
const { episodeEnd, registrationIsOpen } = require("./episode-time");
const { InputError, csvExport } = require("./outreach-csv");
const { SenderError } = require("./sender");
const { ZoomError } = require("./zoom");
const {
  previewImport,
  createInviteCampaign,
  syncInviteReports,
  reconcileBatch,
  importDeliveryReport,
} = require("./invite-service");
const {
  attendanceCsv,
  saveAttendance,
  attendanceReport,
  syncEpisodeAttendance,
} = require("./attendance");
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const numberId = (value) =>
  /^\d+$/.test(String(value)) &&
  Number(value) > 0 &&
  Number(value) <= 2147483647;
function createOutreachRouter({
  pool,
  sender,
  zoom,
  authenticateToken,
  env = process.env,
}) {
  const router = express.Router();
  router.use(authenticateToken);
  const admin = (req) => req.user.id;
  const route =
    (handler, transaction = false) =>
    async (req, res) => {
      const db = await pool.connect();
      try {
        if (transaction) await db.query("BEGIN");
        const result = await handler(req, db);
        if (transaction) await db.query("COMMIT");
        if (result?.csv !== undefined) {
          res.type("text/csv").attachment(result.filename).send(result.csv);
          return;
        }
        res.json({ success: true, ...result });
      } catch (error) {
        if (transaction) await db.query("ROLLBACK");
        const safe =
          error instanceof InputError ||
          error instanceof SenderError ||
          error instanceof ZoomError;
        res.status(safe ? error.status : 500).json({
          success: false,
          error: safe
            ? error.message
            : "Unable to complete this operation. No uncertain email send will be retried automatically.",
        });
      } finally {
        db.release();
      }
    };
  router.param("campaignId", (req, res, next, value) =>
    uuid(value)
      ? next()
      : res.status(400).json({ success: false, error: "Invalid campaign ID." }),
  );
  router.param("episodeId", (req, res, next, value) =>
    numberId(value)
      ? next()
      : res.status(400).json({ success: false, error: "Invalid episode ID." }),
  );
  const campaign = async (db, id, includeDeleted = false) => {
    const result = (
      await db.query("SELECT * FROM invite_campaigns WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!result || (result.deleted_at && !includeDeleted)) throw new InputError("Campaign not found. Please check Campaign trash.", 404);
    return result;
  };
  const episode = async (db, id) => {
    const result = (await db.query("SELECT * FROM episodes WHERE id=$1", [id]))
      .rows[0];
    if (!result) throw new InputError("Episode not found.", 404);
    return result;
  };
  router.get(
    "/outreach/config",
    route(async () => ({
      sender: sender.identity(),
      zoom_configured: zoom.configured(),
      attendance_threshold_minutes: 30,
      delivery_tracking:
        "Provider delivery events are not assumed. Import a Sender delivery report for explicit delivery confirmation.",
    })),
  );
  router.post(
    "/outreach/preview",
    route(async (req, db) => {
      if (!numberId(req.body.episode_id))
        throw new InputError("Choose an episode.");
      const result = await previewImport(
        db,
        req.body.episode_id,
        req.body.csv,
        req.body.filters,
      );
      return {
        total: result.total,
        eligible: result.contacts.length,
        duplicates: result.duplicates,
        filtered: result.filtered,
        rejected: result.rejected,
        excluded: result.excluded,
        preview: result.contacts.slice(0, 100),
      };
    }),
  );
  router.post(
    "/outreach/campaigns",
    route(async (req, db) => {
      if (!numberId(req.body.episode_id))
        throw new InputError("Choose an episode.");
      return createInviteCampaign(db, req.body, admin(req), env);
    }, true),
  );
  router.get(
    "/outreach/campaigns",
    route(async (req, db) => ({
      data: (
        await db.query(`SELECT c.*,e.episode_number,
    (SELECT COUNT(*)::integer FROM invite_recipients r WHERE r.campaign_id=c.id) AS recipients,
    (SELECT COUNT(*)::integer FROM invite_recipients r WHERE r.campaign_id=c.id AND r.sent_at IS NOT NULL) AS sent,
    (SELECT COUNT(*)::integer FROM invite_recipients r WHERE r.campaign_id=c.id AND r.opened_at IS NOT NULL) AS opened,
    (SELECT COUNT(*)::integer FROM invite_recipients r WHERE r.campaign_id=c.id AND r.delivered_at IS NOT NULL) AS delivered
    FROM invite_campaigns c JOIN episodes e ON e.id=c.episode_id WHERE (c.deleted_at IS NOT NULL)=$1 ORDER BY c.created_at DESC LIMIT 100`, [req.query.trash === "true"])
      ).rows,
    })),
  );
  async function campaignRecipients(db, id) {
    return (
      await db.query(
        `SELECT r.*,(SELECT s.id FROM students s WHERE LOWER(TRIM(s.email))=r.email AND EXISTS(SELECT 1 FROM episode_registrations er WHERE er.student_id=s.id) ORDER BY s.id LIMIT 1) AS student_id,EXISTS(SELECT 1 FROM episode_registrations er JOIN students s ON s.id=er.student_id
      JOIN invite_campaigns c ON c.episode_id=er.episode_id WHERE c.id=r.campaign_id AND LOWER(TRIM(s.email))=r.email) AS registered
      FROM invite_recipients r WHERE r.campaign_id=$1 ORDER BY r.id`,
        [id],
      )
    ).rows;
  }
  router.get(
    "/outreach/campaigns/:campaignId",
    route(async (req, db) => ({
      campaign: await campaign(db, req.params.campaignId, true),
      data: await campaignRecipients(db, req.params.campaignId),
      batches: (
        await db.query(
          "SELECT * FROM invite_batches WHERE campaign_id=$1 ORDER BY created_at",
          [req.params.campaignId],
        )
      ).rows,
    })),
  );
  router.get(
    "/outreach/campaigns/:campaignId/export",
    route(async (req, db) => ({
      csv: csvExport(
        await campaignRecipients(db, req.params.campaignId),
        [
          ["email", "Email"],
          ["full_name", "Full Name"],
          ["college", "College"],
          ["department", "Department"],
          ["year", "Year"],
          ["send_status", "Queue Status"],
          ["skip_reason", "Skip Reason"],
          ["sent_at", "Sent At"],
          ["delivered_at", "Delivered At"],
          ["delivery_source", "Delivery Evidence"],
          ["opened_at", "Open Detected At"],
          ["clicked_at", "Click Detected At"],
          ["hard_bounced_at", "Hard Bounced At"],
          ["soft_bounced_at", "Soft Bounced At"],
          ["unsubscribed_at", "Unsubscribed At"],
          ["complained_at", "Complaint At"],
          ["registered", "Registered"],
        ].map(([key, label]) => ({ key, label })),
      ),
      filename: `invitation_${req.params.campaignId}.csv`,
    })),
  );
  router.post(
    "/outreach/campaigns/:campaignId/trash",
    route(async (req, db) => {
      // Coordinate with the send worker so deletion cannot race an API submission.
      const lock = (await db.query("SELECT pg_try_advisory_xact_lock(7410626) AS locked")).rows[0];
      if (!lock.locked) throw new InputError("An invitation batch is being processed. Please pause it and try again once processing finishes.", 409);
      const c = await campaign(db, req.params.campaignId);
      const uncertain = await db.query("SELECT id FROM invite_batches WHERE campaign_id=$1 AND status IN ('sending','review')", [c.id]);
      if (uncertain.rows.length) throw new InputError("Please check the uncertain batch outcome with Sender before deleting this campaign.", 409);
      await db.query("UPDATE invite_campaigns SET deleted_at=NOW(),deleted_by=$2,status='paused' WHERE id=$1", [c.id, admin(req)]);
      return { message: "Campaign, imported recipient list and reports moved to Campaign trash. Student registrations and attendance are unchanged. Sender records and emails already submitted are not removed." };
    }, true),
  );
  router.post(
    "/outreach/campaigns/:campaignId/restore",
    route(async (req, db) => {
      const c = await campaign(db, req.params.campaignId, true);
      if (!c.deleted_at) throw new InputError("This campaign is not in trash.", 409);
      await db.query("UPDATE invite_campaigns SET deleted_at=NULL,deleted_by=NULL,status='paused' WHERE id=$1", [c.id]);
      return { message: "Campaign and imported records restored in paused status. Restoring does not send invitations; the event must still accept registrations before you can resume." };
    }, true),
  );
  router.patch('/outreach/campaigns/:campaignId',route(async(req,db)=>{
    const c=await campaign(db,req.params.campaignId);
    const batches=await db.query('SELECT id FROM invite_batches WHERE campaign_id=$1 LIMIT 1',[c.id]);
    if(c.status!=='draft'||c.started_at||batches.rows.length)throw new InputError('Only a draft that has never started can be edited. Please create a new campaign.',409);
    const subject=String(req.body.subject||'').trim(),body=String(req.body.body||'').trim();
    const size=Number(req.body.batch_size),interval=Number(req.body.interval_minutes);
    if(!subject||subject.length>200||!body||body.length>10000)throw new InputError('Enter a subject (up to 200 characters) and message (up to 10,000 characters).');
    if(!Number.isInteger(size)||size<1||size>200||!Number.isInteger(interval)||interval<1||interval>1440||typeof req.body.pause_after_first_batch!=='boolean')throw new InputError('Use 1–200 recipients per batch, a 1–1440 minute interval and a valid first-batch review choice.');
    await db.query('UPDATE invite_campaigns SET subject=$2,body=$3,batch_size=$4,interval_minutes=$5,pause_after_first_batch=$6 WHERE id=$1',[c.id,subject,body,size,interval,req.body.pause_after_first_batch]);
    return {message:'Draft updated. Its episode and imported audience are unchanged; eligibility is checked again before sending.'};
  },true));
  router.delete('/outreach/campaigns/:campaignId',route(async(req,db)=>{
    const lock=(await db.query('SELECT pg_try_advisory_xact_lock(7410626) AS locked')).rows[0];
    if(!lock.locked)throw new InputError('An invitation batch is processing. Please try again once it finishes.',409);
    const c=await campaign(db,req.params.campaignId,true);
    if(!c.deleted_at)throw new InputError('Move this campaign to trash before permanently deleting it.',409);
    if(req.body?.confirmation!=='DELETE PERMANENTLY')throw new InputError('Please type DELETE PERMANENTLY to confirm.');
    if((await db.query("SELECT id FROM invite_batches WHERE campaign_id=$1 AND status IN ('sending','review')",[c.id])).rows.length)throw new InputError('Please resolve the uncertain send outcome before permanently deleting.',409);
    // Keep only the minimum send exclusion; purging must not enable duplicate invitations.
    await db.query(`INSERT INTO invite_sent_history(episode_id,email)
      SELECT $2,r.email FROM invite_recipients r LEFT JOIN invite_batches b ON b.id=r.batch_id
      WHERE r.campaign_id=$1 AND (r.sent_at IS NOT NULL OR b.status='submitted') ON CONFLICT DO NOTHING`,[c.id,c.episode_id]);
    await db.query('DELETE FROM invite_delivery_imports WHERE campaign_id=$1',[c.id]);
    await db.query('DELETE FROM invite_recipients WHERE campaign_id=$1',[c.id]);
    await db.query('DELETE FROM invite_batches WHERE campaign_id=$1',[c.id]);
    await db.query('DELETE FROM invite_campaigns WHERE id=$1',[c.id]);
    return {message:'Campaign and imported reports permanently deleted from OSF. Student registrations, attendance, suppression preferences and minimal duplicate-send exclusions remain. Sender records are unchanged.'};
  },true));
  router.post(
    "/outreach/campaigns/:campaignId/start",
    route(async (req, db) => {
      const c = await campaign(db, req.params.campaignId);
      if (!sender.configured())
        throw new InputError(
          "Configure Sender and the public application URL on the backend before starting.",
          503,
        );
      if (!["draft", "paused"].includes(c.status))
        throw new InputError("Only draft or paused campaigns can be started.");
      const e = await episode(db, c.episode_id);
      if (episodeEnd(e) && episodeEnd(e) < Date.now())
        throw new InputError(
          "This episode has ended. Choose an upcoming episode.",
        );
      if (!e.is_active || e.is_registration_open === false)
        throw new InputError("Episode registration must be open.");
      if (!registrationIsOpen(e)) throw new InputError("Registration closes 30 minutes after the episode starts (IST). Choose an episode with registration open.");
      const blocked = await db.query(
        "SELECT id FROM invite_batches WHERE campaign_id=$1 AND status IN ('sending','review')",
        [c.id],
      );
      if (blocked.rows.length)
        throw new InputError(
          "Reconcile the uncertain batch with Sender before resuming.",
          409,
        );
      const submitted = (
        await db.query(
          "SELECT COUNT(*)::integer AS count FROM invite_batches WHERE campaign_id=$1 AND status='submitted' AND provider_campaign_id IS NOT NULL",
          [c.id],
        )
      ).rows[0].count;
      if (c.pause_after_first_batch && !c.pilot_reviewed_at && submitted > 0) {
        if (req.body?.reviewed_first_batch !== true)
          throw new InputError(
            "Confirm you reviewed the first batch inbox placement and Sender reports before resuming.",
          );
        await db.query(
          "UPDATE invite_campaigns SET pilot_reviewed_at=NOW() WHERE id=$1",
          [c.id],
        );
      }
      // Preserve any rate-limit cooldown recorded by the worker.
      await db.query(
        "UPDATE invite_campaigns SET status='running',started_at=COALESCE(started_at,NOW()),last_error=NULL WHERE id=$1",
        [c.id],
      );
      return {
        message:
          "Campaign started. The background worker will send the next batch when due.",
      };
    }, true),
  );
  router.post(
    "/outreach/campaigns/:campaignId/pause",
    route(async (req, db) => {
      await campaign(db, req.params.campaignId);
      await db.query(
        "UPDATE invite_campaigns SET status='paused' WHERE id=$1 AND status<>'completed'",
        [req.params.campaignId],
      );
      return {
        message:
          "Campaign paused. A batch already submitted to Sender cannot be recalled here.",
      };
    }),
  );
  router.post(
    "/outreach/campaigns/:campaignId/sync",
    route(async (req, db) => {
      await campaign(db, req.params.campaignId);
      await syncInviteReports(db, sender, req.params.campaignId);
      return {
        message:
          "Sender reports synchronized. Sent emails without delivery evidence remain unconfirmed.",
      };
    }),
  );
  router.post(
    "/outreach/campaigns/:campaignId/reconcile/:batchId",
    route(async (req, db) => {
      if (!uuid(req.params.batchId)) throw new InputError("Invalid batch ID.");
      await db.query("SELECT pg_advisory_xact_lock(7410626)");
      await campaign(db, req.params.campaignId);
      const batch = (
        await db.query(
          "SELECT id FROM invite_batches WHERE id=$1 AND campaign_id=$2 AND status IN ('sending','review')",
          [req.params.batchId, req.params.campaignId],
        )
      ).rows[0];
      if (!batch)
        throw new InputError(
          "No uncertain batch was found for this campaign.",
          404,
        );
      const result = await reconcileBatch(db, sender, batch.id);
      return {
        message:
          result === "unsent"
            ? "Sender confirmed the draft was not sent. Resume to rebuild and submit this batch."
            : "Sender confirmed this batch was submitted. It will not be resent. Campaigns with no queued recipients are complete.",
      };
    }, true),
  );
  router.post(
    "/outreach/campaigns/:campaignId/delivery-import",
    route(async (req, db) => {
      await campaign(db, req.params.campaignId);
      return {
        updated: await importDeliveryReport(
          db,
          req.params.campaignId,
          req.body.csv,
          admin(req),
        ),
        message: "Delivery evidence imported from the supplied report.",
      };
    }, true),
  );
  router.get(
    "/episodes/:episodeId/attendance",
    route(async (req, db) => {
      await episode(db, req.params.episodeId);
      return attendanceReport(db, req.params.episodeId, Object.keys(req.query).length?req.query:undefined);
    }),
  );
  router.post(
    "/episodes/:episodeId/attendance/sync",
    route(async (req, db) => {
      const e = await episode(db, req.params.episodeId);
      if (!e.zoom_meeting_id)
        throw new InputError("Link a Zoom meeting to this episode first.");
      await syncEpisodeAttendance(db, zoom, e, {
        meetingUuid: req.body.meeting_uuid,
        threshold: req.body.threshold_minutes,
        adminId: admin(req),
      });
      return {
        message: "Zoom attendance synchronized.",
        ...(await attendanceReport(db, e.id)),
      };
    }, true),
  );
  router.post(
    "/episodes/:episodeId/attendance/import",
    route(async (req, db) => {
      await episode(db, req.params.episodeId);
      await saveAttendance(db, {
        episodeId: req.params.episodeId,
        meetingUuid: req.body.meeting_uuid,
        participants: attendanceCsv(req.body.csv),
        threshold: req.body.threshold_minutes ?? 30,
        source: "zoom_csv",
        adminId: admin(req),
        complete: req.body.report_complete === true,
      });
      return {
        message: "Attendance CSV imported.",
        ...(await attendanceReport(db, req.params.episodeId)),
      };
    }, true),
  );
  router.post(
    "/episodes/:episodeId/attendance/match",
    route(async (req, db) => {
      await db.query("SELECT id FROM episodes WHERE id=$1 FOR UPDATE", [
        req.params.episodeId,
      ]);
      if (
        !numberId(req.body.registration_id) ||
        !/^[a-f\d]{64}$/.test(req.body.participant_id || "")
      )
        throw new InputError("Choose a participant and registration.");
      const registration = (
        await db.query(
          "SELECT id FROM episode_registrations WHERE episode_id=$1 AND id=$2",
          [req.params.episodeId, req.body.registration_id],
        )
      ).rows[0];
      if (!registration)
        throw new InputError("Registration not found in this episode.", 404);
      const result = await db.query(
        "UPDATE attendance_participants SET registration_id=$3,match_method='manual' WHERE episode_id=$1 AND id=$2 RETURNING id",
        [req.params.episodeId, req.body.participant_id, registration.id],
      );
      if (!result.rows.length)
        throw new InputError("Participant not found.", 404);
      await db.query(
        "INSERT INTO attendance_audit(episode_id,registration_id,action,detail,admin_id) VALUES($1,$2,$3,$4,$5)",
        [
          req.params.episodeId,
          registration.id,
          "manual_match",
          req.body.participant_id,
          admin(req),
        ],
      );
      return { message: "Participant matched to the selected registration." };
    }, true),
  );
  router.post(
    "/episodes/:episodeId/attendance/override",
    route(async (req, db) => {
      await db.query("SELECT id FROM episodes WHERE id=$1 FOR UPDATE", [
        req.params.episodeId,
      ]);
      const { registration_id, status } = req.body;
      const note = String(req.body.note || "").trim();
      if (
        !numberId(registration_id) ||
        !["present", "absent", "partial", "clear"].includes(status) ||
        note.length < 3 ||
        note.length > 1000
      )
        throw new InputError(
          "Choose a valid registration, status, and a reason (3–1000 characters).",
        );
      if (
        !(
          await db.query(
            "SELECT id FROM episode_registrations WHERE episode_id=$1 AND id=$2",
            [req.params.episodeId, registration_id],
          )
        ).rows.length
      )
        throw new InputError("Registration not found.", 404);
      if (status === "clear")
        await db.query(
          "DELETE FROM attendance_overrides WHERE registration_id=$1",
          [registration_id],
        );
      else
        await db.query(
          `INSERT INTO attendance_overrides(registration_id,status,note,updated_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(registration_id) DO UPDATE SET status=$2,note=$3,updated_by=$4,updated_at=NOW()`,
          [registration_id, status, note, admin(req)],
        );
      await db.query(
        "INSERT INTO attendance_audit(episode_id,registration_id,action,detail,admin_id) VALUES($1,$2,$3,$4,$5)",
        [
          req.params.episodeId,
          registration_id,
          "override",
          `${status}: ${note}`,
          admin(req),
        ],
      );
      return { message: "Attendance correction saved with an audit entry." };
    }, true),
  );
  router.get(
    "/episodes/:episodeId/attendance/export",
    route(async (req, db) => ({
      csv: csvExport(
        (await attendanceReport(db, req.params.episodeId, req.query, {all:true})).data,
        [
          ["full_name", "Full Name"],
          ["email", "Email"],
          ["joined", "Joined"],
          ["status", "Attendance"],
          ["minutes", "Minutes"],
          ["sessions", "Sessions"],
          ["duration_estimated", "Duration Estimated"],
          ["override_note", "Correction Reason"],
        ].map(([key, label]) => ({ key, label })),
      ),
      filename: `episode_${req.params.episodeId}_attendance.csv`,
    })),
  );
  return router;
}
module.exports = { createOutreachRouter };
