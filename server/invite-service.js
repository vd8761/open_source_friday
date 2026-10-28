const { randomUUID } = require("node:crypto");
const {
  contactImport,
  InputError,
  normalizeEmail,
  readCsv,
  validEmail,
} = require("./outreach-csv");
const { episodeEnd, registrationIsOpen } = require("./episode-time");
const { SenderError } = require("./sender");
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
function registrationUrl(episodeNumber, env = process.env) {
  let base;
  try {
    base = new URL(env.PUBLIC_APP_URL);
  } catch {
    throw new InputError("Set PUBLIC_APP_URL on the backend.", 503);
  }
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new InputError(
      "PUBLIC_APP_URL must be an http(s) application URL.",
      503,
    );
  return new URL(`/register/episode-${Number(episodeNumber)}`, base.origin)
    .href;
}
function invitationHtml(campaign, env = process.env) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>${escapeHtml(campaign.subject)}</h1><p>${escapeHtml(campaign.body).replace(/\n/g, "<br>")}</p><p><a href="${escapeHtml(registrationUrl(campaign.episode_number, env))}">Register for this episode</a></p><p>Complete your registration in our application. Zoom will then email your personal meeting link.</p><hr><p>You are receiving this invitation because you opted in to Open Source Friday episode invitations. Reply to this email for help.</p><p>${escapeHtml(env.SENDER_FROM_NAME || "")}<br>${escapeHtml(env.SENDER_POSTAL_ADDRESS || "")}</p><p><a href="{{ unsubscribe_link }}">Unsubscribe from invitations</a></p></body></html>`;
}
async function previewImport(db, episodeId, csv, filters = {}) {
  const episode = (
    await db.query("SELECT * FROM episodes WHERE id = $1", [episodeId])
  ).rows[0];
  if (!episode) throw new InputError("Episode not found.", 404);
  const parsed = contactImport(csv, filters);
  const { rows } = await db.query(
    `SELECT LOWER(TRIM(s.email)) AS email, 'Already registered for this episode' AS reason
    FROM students s JOIN episode_registrations er ON er.student_id=s.id WHERE er.episode_id=$1
    UNION ALL SELECT email, reason FROM invite_suppressions
    UNION ALL SELECT r.email, 'Already invited for this episode' AS reason FROM invite_recipients r
    JOIN invite_campaigns c ON c.id=r.campaign_id JOIN invite_batches b ON b.id=r.batch_id
    WHERE c.episode_id=$1 AND b.status IN ('sending','submitted','review')`,
    [episodeId],
  );
  const excluded = new Map(rows.map((row) => [row.email, row.reason]));
  const contacts = parsed.contacts.filter(
    (contact) => !excluded.has(contact.email),
  );
  return {
    ...parsed,
    contacts,
    excluded: parsed.contacts
      .filter((c) => excluded.has(c.email))
      .map((c) => ({ email: c.email, reason: excluded.get(c.email) })),
    episode,
  };
}
async function createInviteCampaign(db, input, adminId, env = process.env) {
  if (input.consent_confirmed !== true)
    throw new InputError(
      "Confirm that the selected contacts opted in to episode invitations.",
    );
  const subject = String(input.subject || "").trim(),
    body = String(input.body || "").trim();
  if (!subject || subject.length > 200 || !body || body.length > 10000)
    throw new InputError(
      "Enter a subject (up to 200 characters) and message (up to 10,000 characters).",
    );
  const batchSize = Number(input.batch_size ?? 50),
    interval = Number(input.interval_minutes ?? 15);
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 200 ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 1440
  )
    throw new InputError(
      "Use 1–200 recipients per batch and a 1–1440 minute interval.",
    );
  if (
    input.pause_after_first_batch !== undefined &&
    typeof input.pause_after_first_batch !== "boolean"
  )
    throw new InputError("First-batch review must be true or false.");
  const preview = await previewImport(
    db,
    input.episode_id,
    input.csv,
    input.filters,
  );
  if (
    !preview.episode.is_active ||
    preview.episode.is_registration_open === false
  )
    throw new InputError("Choose an active episode with registration open.");
  if (episodeEnd(preview.episode) && episodeEnd(preview.episode) < Date.now())
    throw new InputError(
      "This episode has already ended. Choose an upcoming episode.",
    );
  if (!registrationIsOpen(preview.episode)) throw new InputError("Registration closes one hour before the episode starts (IST). Choose an upcoming episode.");
  if (!preview.contacts.length)
    throw new InputError(
      "No eligible recipients remain after validation and exclusions.",
    );
  // Validate the public registration destination before a campaign can be started.
  registrationUrl(preview.episode.episode_number, env);
  const id = randomUUID();
  await db.query(
    `INSERT INTO invite_campaigns(id,episode_id,subject,body,batch_size,interval_minutes,created_by,pause_after_first_batch)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.episode_id,
      subject,
      body,
      batchSize,
      interval,
      adminId,
      input.pause_after_first_batch !== false,
    ],
  );
  await db.query(
    `INSERT INTO invite_recipients(campaign_id,email,full_name,college,department,year)
    SELECT $1,email,full_name,college,department,year FROM jsonb_to_recordset($2::jsonb)
    AS contacts(email TEXT,full_name TEXT,college TEXT,department TEXT,year TEXT)`,
    [id, JSON.stringify(preview.contacts)],
  );
  for (const email of preview.suppressed_emails)
    await suppress(db, email, "Opt-out or suppression in imported CSV");
  return { id, recipients: preview.contacts.length };
}
async function suppress(db, email, reason) {
  await db.query(
    `INSERT INTO invite_suppressions(email,reason) VALUES($1,$2) ON CONFLICT(email) DO NOTHING`,
    [normalizeEmail(email), reason],
  );
}
async function skipIneligible(db, campaignId, episodeId) {
  await db.query(
    `UPDATE invite_recipients r SET send_status='skipped',skip_reason='Already registered, previously invited, or suppressed'
    WHERE r.campaign_id=$1 AND r.send_status='queued' AND (
      EXISTS(SELECT 1 FROM invite_suppressions x WHERE x.email=r.email)
      OR EXISTS(SELECT 1 FROM episode_registrations er JOIN students s ON s.id=er.student_id WHERE er.episode_id=$2 AND LOWER(TRIM(s.email))=r.email)
      OR EXISTS(SELECT 1 FROM invite_recipients other JOIN invite_campaigns c ON c.id=other.campaign_id
        JOIN invite_batches b ON b.id=other.batch_id WHERE other.campaign_id<>$1 AND c.episode_id=$2 AND other.email=r.email AND b.status IN ('sending','submitted','review'))
    )`,
    [campaignId, episodeId],
  );
}
// Session advisory lock coordinates workers across backend instances. State is committed
// before the send request, so an uncertain response or restart cannot auto-send twice.
async function processInviteBatch(pool, sender, env = process.env) {
  if (!sender.configured()) return;
  const db = await pool.connect();
  let locked = false,
    campaign,
    batch;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(7410626) AS locked"))
      .rows[0].locked;
    if (!locked) return;
    campaign = (
      await db.query(`SELECT c.*, e.episode_number,e.event_date,e.event_time,e.is_active,e.is_registration_open FROM invite_campaigns c
      JOIN episodes e ON e.id=c.episode_id WHERE c.status='running' AND c.next_batch_at<=NOW() ORDER BY c.next_batch_at,c.created_at LIMIT 1`)
    ).rows[0];
    if (!campaign) return;
    if (episodeEnd(campaign) && episodeEnd(campaign) < Date.now())
      throw new InputError("This episode has ended. Campaign paused.");
    if (!campaign.is_active || campaign.is_registration_open === false)
      throw new InputError("Episode registration is closed. Campaign paused.");
    if (!registrationIsOpen(campaign)) throw new InputError("Registration has reached its closing time. Campaign paused.");
    batch = (
      await db.query(
        `SELECT * FROM invite_batches WHERE campaign_id=$1 AND status IN ('preparing','ready','sending','review') ORDER BY created_at LIMIT 1`,
        [campaign.id],
      )
    ).rows[0];
    if (batch && ["sending", "review"].includes(batch.status))
      throw new InputError(
        "A send outcome needs review. Reconcile it with Sender before resuming.",
      );
    const submitted = (
      await db.query(
        "SELECT COUNT(*)::integer AS count FROM invite_batches WHERE campaign_id=$1 AND status='submitted' AND provider_campaign_id IS NOT NULL",
        [campaign.id],
      )
    ).rows[0].count;
    if (
      campaign.pause_after_first_batch &&
      !campaign.pilot_reviewed_at &&
      submitted > 0
    )
      throw new InputError(
        "First batch submitted. Review inbox placement and Sender reports, then confirm review before resuming.",
      );
    if (submitted > 0) {
      // Refresh complaints/bounces before permitting another batch. If reports
      // cannot be read, the catch below pauses sending rather than ignoring them.
      await syncInviteReports(db, sender, campaign.id);
      const reason = await campaignDeliveryIssue(db, campaign.id);
      if (reason) throw new InputError(reason);
    }
    await skipIneligible(db, campaign.id, campaign.episode_id);
    if (!batch) {
      batch = { id: randomUUID() };
      const recipients = (
        await db.query(
          "SELECT id FROM invite_recipients WHERE campaign_id=$1 AND send_status='queued' AND batch_id IS NULL ORDER BY id LIMIT $2",
          [campaign.id, campaign.batch_size],
        )
      ).rows;
      if (!recipients.length) {
        await db.query(
          "UPDATE invite_campaigns SET status='completed' WHERE id=$1",
          [campaign.id],
        );
        return;
      }
      await db.query(
        "INSERT INTO invite_batches(id,campaign_id) VALUES($1,$2)",
        [batch.id, campaign.id],
      );
      await db.query(
        "UPDATE invite_recipients SET batch_id=$1 WHERE id=ANY($2::integer[])",
        [batch.id, recipients.map((r) => r.id)],
      );
    }
    {
      // A fresh private group prevents stale membership after a pause or restart.
      batch.group_id = await sender.createGroup(
        `OSF ${batch.id} ${randomUUID()}`,
      );
      await db.query("UPDATE invite_batches SET group_id=$2 WHERE id=$1", [
        batch.id,
        batch.group_id,
      ]);
    }
    const recipients = (
      await db.query(
        "SELECT * FROM invite_recipients WHERE batch_id=$1 AND send_status='queued' ORDER BY id",
        [batch.id],
      )
    ).rows;
    const eligible = [];
    for (const contact of recipients) {
      let subscriber = await sender.subscriber(contact.email);
      if (!subscriber) {
        await sender.addContact(contact);
        subscriber = await sender.subscriber(contact.email);
      }
      // Never change subscriber status or reactivate an opted-out address.
      if (subscriber?.status?.email !== "active") {
        await suppress(db, contact.email, "Sender subscriber is not active");
        await db.query(
          "UPDATE invite_recipients SET send_status='skipped',skip_reason='Not active in Sender' WHERE id=$1",
          [contact.id],
        );
      } else eligible.push(contact);
    }
    if (!eligible.length) {
      await db.query(
        "UPDATE invite_batches SET status='submitted',submitted_at=NOW() WHERE id=$1",
        [batch.id],
      );
    } else {
      await sender.addToGroup(
        batch.group_id,
        eligible.map((c) => c.email),
      );
      {
        // Replacing an unsent draft is safe; sending/review batches never reach here.
        batch.provider_campaign_id = await sender.createCampaign(
          `OSF ${campaign.id} batch ${batch.id}`,
          campaign.subject,
          invitationHtml(campaign, env),
          batch.group_id,
        );
        await db.query(
          "UPDATE invite_batches SET provider_campaign_id=$2,status='ready' WHERE id=$1",
          [batch.id, batch.provider_campaign_id],
        );
      }
      // Recheck pause/closure immediately before submitting a batch.
      const state = (
        await db.query(
          `SELECT c.status,e.is_active,e.is_registration_open,e.event_date,e.event_time FROM invite_campaigns c JOIN episodes e ON e.id=c.episode_id WHERE c.id=$1`,
          [campaign.id],
        )
      ).rows[0];
      if (state.status !== "running") return;
      if (!registrationIsOpen(state))
        throw new InputError(
          "Episode registration is closed. Campaign paused.",
        );
      await db.query("UPDATE invite_batches SET status='sending' WHERE id=$1", [
        batch.id,
      ]);
      batch.status = "sending";
      await sender.send(batch.provider_campaign_id);
      await db.query(
        "UPDATE invite_batches SET status='submitted',submitted_at=NOW(),last_error=NULL WHERE id=$1",
        [batch.id],
      );
      await db.query(
        "UPDATE invite_recipients SET send_status='submitted' WHERE batch_id=$1 AND send_status='queued'",
        [batch.id],
      );
    }
    const remaining = (
      await db.query(
        "SELECT COUNT(*)::integer AS count FROM invite_recipients WHERE campaign_id=$1 AND send_status='queued'",
        [campaign.id],
      )
    ).rows[0].count;
    if (!remaining) {
      await db.query(
        "UPDATE invite_campaigns SET status='completed',last_error=NULL WHERE id=$1",
        [campaign.id],
      );
    } else {
      const needsReview =
        campaign.pause_after_first_batch &&
        !campaign.pilot_reviewed_at &&
        eligible.length > 0;
      await db.query(
        `UPDATE invite_campaigns SET status=$2,next_batch_at=NOW()+interval_minutes*INTERVAL '1 minute',last_error=$3 WHERE id=$1`,
        [
          campaign.id,
          needsReview ? "paused" : "running",
          needsReview
            ? "First batch submitted. Review inbox placement and Sender reports, then confirm review before resuming."
            : null,
        ],
      );
    }
  } catch (error) {
    const message =
      error instanceof SenderError || error instanceof InputError
        ? error.message
        : "Campaign paused after a processing error. Check Sender before resuming.";
    if (batch?.status === "sending")
      await db.query(
        "UPDATE invite_batches SET status='review',last_error=$2,provider_diagnostic=COALESCE($3::jsonb,provider_diagnostic) WHERE id=$1",
        [batch.id, message, error instanceof SenderError && error.providerDiagnostic ? JSON.stringify(error.providerDiagnostic) : null],
      );
    if (campaign)
      await db.query(
        `UPDATE invite_campaigns SET status='paused',last_error=$2,next_batch_at=GREATEST(next_batch_at,NOW()+$3*INTERVAL '1 second') WHERE id=$1`,
        [campaign.id, message, error.retryAfterSeconds || 60],
      );
  } finally {
    try {
      if (locked) await db.query("SELECT pg_advisory_unlock(7410626)");
    } catch (error) {
      db.release(error);
      throw error;
    }
    db.release();
  }
}
async function campaignDeliveryIssue(db, campaignId) {
  const metrics = (
    await db.query(
      `SELECT COUNT(*) FILTER(WHERE send_status='submitted')::integer AS submitted,
    COUNT(*) FILTER(WHERE complained_at IS NOT NULL)::integer AS complaints,
    COUNT(*) FILTER(WHERE hard_bounced_at IS NOT NULL)::integer AS hard,
    COUNT(*) FILTER(WHERE hard_bounced_at IS NOT NULL OR soft_bounced_at IS NOT NULL)::integer AS bounced
    FROM invite_recipients WHERE campaign_id=$1`,
      [campaignId],
    )
  ).rows[0];
  if (metrics.complaints > 0)
    return "Campaign paused: Sender reported a spam complaint. Review the audience before sending more invitations.";
  if (metrics.submitted >= 20 && metrics.hard / metrics.submitted >= 0.005)
    return `Campaign paused: ${metrics.hard} hard bounce(s) among ${metrics.submitted} submitted recipients. Review list quality before continuing.`;
  if (metrics.submitted >= 20 && metrics.bounced / metrics.submitted >= 0.02)
    return `Campaign paused: ${metrics.bounced} bounce(s) among ${metrics.submitted} submitted recipients. Review list quality before continuing.`;
  return null;
}
const reports = {
  "emails-sent": "sent_at",
  opens: "opened_at",
  clicks: "clicked_at",
  hard_bounces: "hard_bounced_at",
  soft_bounces: "soft_bounced_at",
  unsubscribes: "unsubscribed_at",
  complaints: "complained_at",
};
async function completeSubmittedCampaign(db, campaignId) {
  await db.query(
    `UPDATE invite_campaigns c SET status='completed',last_error=NULL WHERE c.id=$1
      AND EXISTS(SELECT 1 FROM invite_batches b WHERE b.campaign_id=c.id AND b.status='submitted' AND b.provider_campaign_id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM invite_recipients r WHERE r.campaign_id=c.id AND r.send_status='queued')
      AND NOT EXISTS(SELECT 1 FROM invite_batches b WHERE b.campaign_id=c.id AND b.status IN ('sending','review'))`,
    [campaignId],
  );
}
async function syncInviteReports(db, sender, campaignId) {
  const batches = (
    await db.query(
      "SELECT * FROM invite_batches WHERE campaign_id=$1 AND provider_campaign_id IS NOT NULL",
      [campaignId],
    )
  ).rows;
  for (const batch of batches) {
    for (const [kind, column] of Object.entries(reports)) {
      const events = await sender.report(batch.provider_campaign_id, kind);
      for (const event of events) {
        const email = normalizeEmail(event.email);
        if (!validEmail(email)) continue;
        // Sender can return account-local times without a timezone. Use the
        // first observation time rather than incorrectly labelling those UTC.
        const timestamp = String(event.created_at || "").replace(" ", "T");
        const time = /(?:Z|[+-]\d\d:\d\d)$/.test(timestamp)
          ? Date.parse(timestamp)
          : NaN;
        const result = await db.query(
          `UPDATE invite_recipients SET ${column}=CASE WHEN ${column} IS NULL OR ${column}>NOW()+INTERVAL '5 minutes'
            THEN COALESCE($3::timestamptz,NOW()) ELSE ${column} END WHERE batch_id=$1 AND email=$2 RETURNING id`,
          [
            batch.id,
            email,
            Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000
              ? new Date(time).toISOString()
              : null,
          ],
        );
        if (
          result.rows.length &&
          ["hard_bounces", "unsubscribes", "complaints"].includes(kind)
        )
          await suppress(db, email, kind);
      }
    }
  }
  await db.query(
    "UPDATE invite_campaigns SET reports_synced_at=NOW() WHERE id=$1",
    [campaignId],
  );
  await completeSubmittedCampaign(db, campaignId);
  const issue = await campaignDeliveryIssue(db, campaignId);
  if (issue)
    await db.query(
      "UPDATE invite_campaigns SET status='paused',last_error=$2 WHERE id=$1 AND status='running'",
      [campaignId, issue],
    );
}
async function reconcileBatch(db, sender, batchId) {
  const batch = (
    await db.query("SELECT * FROM invite_batches WHERE id=$1", [batchId])
  ).rows[0];
  if (!batch?.provider_campaign_id)
    throw new InputError("No Sender campaign is linked to this batch.");
  const provider = await sender.campaign(batch.provider_campaign_id);
  if (
    provider &&
    String(provider.status).toUpperCase() === "DRAFT" &&
    !provider.sent_time
  ) {
    // Explicit provider confirmation that the draft was not dispatched permits
    // rebuilding an audience. Unknown/scheduled statuses are never retried.
    await db.query(
      "UPDATE invite_batches SET status='preparing',provider_campaign_id=NULL,last_error=NULL WHERE id=$1",
      [batch.id],
    );
    return "unsent";
  }
  if (
    !provider ||
    !["SENT", "SENDING", "FINISHED", "COMPLETED"].includes(
      String(provider.status).toUpperCase(),
    )
  )
    throw new InputError(
      "Sender has not confirmed whether this campaign was sent. Check its status in Sender; this tool will not resend an uncertain batch.",
    );
  await db.query(
    "UPDATE invite_batches SET status='submitted',submitted_at=COALESCE(submitted_at,NOW()),last_error=NULL WHERE id=$1",
    [batch.id],
  );
  await db.query(
    "UPDATE invite_recipients SET send_status='submitted' WHERE batch_id=$1 AND send_status='queued'",
    [batch.id],
  );
  await db.query(
    "UPDATE invite_campaigns SET last_error=NULL WHERE id=$1",
    [batch.campaign_id],
  );
  await completeSubmittedCampaign(db, batch.campaign_id);
  return "submitted";
}
async function importDeliveryReport(db, campaignId, csv, adminId) {
  const { rows, columns } = readCsv(csv);
  if (!["email", "status", "timestamp"].every((k) => columns.includes(k)))
    throw new InputError(
      "Delivery report needs Email, Status and Timestamp columns.",
    );
  let updated = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email),
      timestamp = new Date(row.timestamp);
    if (
      !validEmail(email) ||
      row.status.toLowerCase() !== "delivered" ||
      !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(row.timestamp) ||
      !Number.isFinite(timestamp.getTime())
    )
      throw new InputError(
        "Each row must contain a valid email, delivered status and ISO timestamp with timezone.",
      );
    const result = await db.query(
      `UPDATE invite_recipients SET delivered_at=COALESCE(delivered_at,$3),delivery_source='admin_imported_sender_report'
      WHERE campaign_id=$1 AND email=$2 AND send_status='submitted' RETURNING id`,
      [campaignId, email, timestamp.toISOString()],
    );
    updated += result.rows.length;
  }
  await db.query(
    "INSERT INTO invite_delivery_imports(campaign_id,imported_by,row_count) VALUES($1,$2,$3)",
    [campaignId, adminId, updated],
  );
  return updated;
}
module.exports = {
  campaignDeliveryIssue,
  previewImport,
  createInviteCampaign,
  processInviteBatch,
  syncInviteReports,
  reconcileBatch,
  invitationHtml,
  importDeliveryReport,
};
