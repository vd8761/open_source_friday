const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const express = require("express");
const jwt = require("jsonwebtoken");
const { initOutreachDB } = require("../outreach-schema");
const { contactImport, csvExport } = require("../outreach-csv");
const {
  previewImport,
  createInviteCampaign,
  processInviteBatch,
  syncInviteReports,
} = require("../invite-service");
const {
  attendanceCsv,
  saveAttendance,
  attendanceReport,
} = require("../attendance");
const { createOutreachRouter } = require("../outreach-routes");
const { SenderError } = require("../sender");
const { episodeEnd, syncRecentAttendance } = require("../outreach-workers");
let db, pool, server, base;
const env = {
  PUBLIC_APP_URL: "https://osf.example.com",
  SENDER_FROM_NAME: "OSF",
  SENDER_POSTAL_ADDRESS: "Example postal address",
};
const input = (csv, extra = {}) => ({
  episode_id: 1,
  subject: "Join OSF",
  body: "Please register.",
  batch_size: 2,
  interval_minutes: 15,
  csv,
  consent_confirmed: true,
  pause_after_first_batch: false,
  ...extra,
});
function senderStub(options = {}) {
  const calls = [];
  return {
    calls,
    configured: () => true,
    identity: () => ({
      configured: true,
      from_email: "test@example.com",
      from_name: "OSF",
    }),
    createGroup: async (title) => {
      calls.push(["group", title]);
      return "group1";
    },
    subscriber: async (email) => ({
      status: {
        email: email === "optout@example.com" ? "unsubscribed" : "active",
      },
    }),
    addContact: async () => {},
    addToGroup: async (id, emails) => calls.push(["audience", emails]),
    waitForGroup: async (id, count, beforePoll) => {
      calls.push(['ready',id,count]);
      await beforePoll?.();
    },
    createCampaign: async (title, subject, html, id) => {
      calls.push(["create", html, id]);
      return "provider1";
    },
    send: async (id) => {
      calls.push(["send", id]);
      if (options.fail) throw new SenderError("Uncertain send");
    },
    campaign: async () => ({ status: "SENT" }),
    report: async (id, kind) => options.events?.[kind] || [],
  };
}
before(async () => {
  db = new PGlite();
  pool = {
    connect: async () => ({ query: (...a) => db.query(...a), release() {} }),
  };
  await db.exec(`CREATE TABLE admins(id SERIAL PRIMARY KEY); INSERT INTO admins VALUES(1);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER,title TEXT,event_date DATE,event_time TEXT,is_active BOOLEAN,is_registration_open BOOLEAN,zoom_meeting_id TEXT);
    INSERT INTO episodes VALUES(1,16,'OSF','2099-10-26','7:00 PM - 8:00 PM',TRUE,TRUE,'12345678901');
    CREATE TABLE students(id SERIAL PRIMARY KEY,email TEXT,full_name TEXT);
    CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,episode_id INTEGER REFERENCES episodes(id),student_id INTEGER REFERENCES students(id));
    CREATE TABLE zoom_registration_jobs(registration_id INTEGER REFERENCES episode_registrations(id),registrant_id TEXT);
    INSERT INTO students VALUES(1,'registered@example.com','Registered Student'),(2,'second@example.com','Second Student');
    INSERT INTO episode_registrations VALUES(1,1,1),(2,1,2);
    INSERT INTO zoom_registration_jobs VALUES(1,'zoom1'),(2,'zoom2');`);
  await db.exec("ALTER TABLE students ADD COLUMN IF NOT EXISTS college TEXT; ALTER TABLE episode_registrations ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ DEFAULT NOW();");
  await initOutreachDB(db);
  await initOutreachDB(db);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createOutreachRouter({
      pool,
      sender: senderStub(),
      zoom: { configured: () => true },
      env,
      authenticateToken: (req, res, next) => {
        try {
          req.user = jwt.verify(
            (req.headers.authorization || "").replace("Bearer ", ""),
            "test-secret",
          );
          next();
        } catch {
          res.status(401).json({ success: false });
        }
      },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${jwt.sign({ id: 1 }, "test-secret")}`,
});
const request = async (path, method = "GET", body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: headers(),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
};
async function resetCampaigns() {
  await db.exec(
    "DELETE FROM invite_sent_history; DELETE FROM invite_delivery_imports; DELETE FROM invite_recipients; DELETE FROM invite_batches; DELETE FROM invite_campaigns; DELETE FROM invite_suppressions;",
  );
}
async function makeCampaign(
  csv = "Email,Full Name\none@example.com,One\ntwo@example.com,Two\nthree@example.com,Three",
  extra = {},
) {
  return createInviteCampaign(db, input(csv, extra), 1, env);
}
test("CSV handles BOM, quoted names, case duplicates, malformed rows and opt-outs", () => {
  const result = contactImport(
    '\uFEFFEmail,Full Name,College,Status\nADA@EXAMPLE.COM,"Ada, Lovelace",Alpha,active\nada@example.com,Duplicate,Alpha,active\nbad,Invalid,Alpha,active\noptout@example.com,Optout,Alpha,unsubscribed',
  );
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].full_name, "Ada, Lovelace");
  assert.equal(result.duplicates, 1);
  assert.equal(result.rejected.length, 2);
  assert.throws(() =>
    contactImport("Email,Email\none@example.com,two@example.com"),
  );
  assert.throws(() => contactImport("Email,Name\none@example.com"));
  assert.equal(
    contactImport(
      "Email,College\none@example.com,Alpha\ntwo@example.com,Beta",
      { college: "alpha" },
    ).contacts.length,
    1,
  );
  assert.match(
    csvExport([{ value: '=RUN("bad")' }], [{ key: "value", label: "Value" }]),
    /"'=RUN/,
  );
});
test("preview excludes existing registrations and suppressions without registering CSV contacts", async () => {
  await resetCampaigns();
  await db.query(
    "INSERT INTO invite_suppressions(email,reason) VALUES('blocked@example.com','hard bounce')",
  );
  const result = await previewImport(
    db,
    1,
    "Email\nregistered@example.com\nblocked@example.com\nnew@example.com",
  );
  assert.equal(result.contacts.length, 1);
  assert.equal(result.excluded.length, 2);
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*)::integer AS count FROM episode_registrations",
      )
    ).rows[0].count,
    2,
  );
});
test("draft, pacing, opt-out suppression and cross-campaign deduplication use real PostgreSQL queries", async () => {
  await resetCampaigns();
  const c = await makeCampaign(
    "Email,Full Name\none@example.com,One\noptout@example.com,Optout\nthree@example.com,Three",
  );
  const sender = senderStub();
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.length, 0);
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
  assert.deepEqual(sender.calls.find((c) => c[0] === "audience")[1], [
    "one@example.com",
  ]);
  assert.match(
    sender.calls.find((c) => c[0] === "create")[1],
    /https:\/\/osf.example.com\/register\/episode-16/,
  );
  assert.match(
    sender.calls.find((c) => c[0] === "create")[1],
    /href="\{\{ unsubscribe_link \}\}"/,
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
  await db.query(
    "UPDATE invite_campaigns SET next_batch_at=NOW() WHERE id=$1",
    [c.id],
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 2);
  const other = await previewImport(
    db,
    1,
    "Email\none@example.com\nthree@example.com",
  );
  assert.equal(other.contacts.length, 0);
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*)::integer AS count FROM episode_registrations",
      )
    ).rows[0].count,
    2,
  );
});
test("uncertain send pauses and can be reconciled without a second send", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  const sender = senderStub({ fail: true });
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  assert.equal(
    (await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id]))
      .rows[0].status,
    "paused",
  );
  const batch = (
    await db.query("SELECT * FROM invite_batches WHERE campaign_id=$1", [c.id])
  ).rows[0];
  assert.equal(batch.status, "review");
  assert.equal(
    (await request(`/outreach/campaigns/${c.id}/start`, "POST")).status,
    409,
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
  const reconciled = await request(
    `/outreach/campaigns/${c.id}/reconcile/${batch.id}`,
    "POST",
  );
  assert.equal(reconciled.status, 200);
});
test("provider tracking is idempotent, suppresses bounces and never infers delivery", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  const sender = senderStub();
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  const tracked = senderStub({
    events: {
      "emails-sent": [{ email: "one@example.com" }],
      opens: [{ email: "one@example.com" }],
      clicks: [{ email: "one@example.com" }],
      hard_bounces: [{ email: "two@example.com" }],
    },
  });
  await syncInviteReports(db, tracked, c.id);
  await syncInviteReports(db, tracked, c.id);
  const r = (
    await db.query(
      "SELECT * FROM invite_recipients WHERE campaign_id=$1 AND email=$2",
      [c.id, "one@example.com"],
    )
  ).rows[0];
  assert.ok(r.sent_at && r.opened_at && r.clicked_at);
  assert.equal(r.delivered_at, null);
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*)::integer AS count FROM invite_suppressions WHERE email='two@example.com'",
      )
    ).rows[0].count,
    1,
  );
  const invalid = await request(
    `/outreach/campaigns/${c.id}/delivery-import`,
    "POST",
    {
      csv: "Email,Status,Timestamp\none@example.com,delivered,2026-10-26T10:00:00Z\ntwo@example.com,bad,invalid",
    },
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (
      await db.query(
        "SELECT delivered_at FROM invite_recipients WHERE email='one@example.com'",
      )
    ).rows[0].delivered_at,
    null,
  );
});
test("admin endpoints require authentication, validate input, and keep closed episodes from sending", async () => {
  assert.equal((await fetch(`${base}/outreach/campaigns`)).status, 401);
  assert.equal((await request("/outreach/campaigns/not-a-uuid")).status, 400);
  assert.equal(
    (
      await request(
        "/outreach/campaigns",
        "POST",
        input("Email\nx@example.com", { consent_confirmed: false }),
      )
    ).status,
    400,
  );
  await resetCampaigns();
  const c = await makeCampaign();
  await db.query("UPDATE episodes SET is_registration_open=FALSE WHERE id=1");
  assert.equal(
    (await request(`/outreach/campaigns/${c.id}/start`, "POST")).status,
    400,
  );
  await db.query("UPDATE episodes SET is_registration_open=TRUE WHERE id=1");
});
test("attendance combines overlapping/rejoined sessions, matches IDs before emails, and keeps unknown guests for review", async () => {
  const rows = [
    {
      registrant_id: "zoom1",
      user_email: "wrong@example.com",
      name: "Registered",
      join_time: "2026-10-26T13:30:00Z",
      leave_time: "2026-10-26T13:50:00Z",
      duration: 1200,
    },
    {
      registrant_id: "zoom1",
      name: "Registered second device",
      join_time: "2026-10-26T13:40:00Z",
      leave_time: "2026-10-26T14:05:00Z",
      duration: 1500,
    },
    { user_email: "second@example.com", name: "Second Student", duration: 300 },
    { name: "Unknown guest", duration: 600 },
  ];
  await db.query("BEGIN");
  await saveAttendance(db, {
    episodeId: 1,
    meetingUuid: "instance-1",
    participants: rows,
    source: "zoom_api",
    adminId: 1,
    complete: true,
  });
  await db.query("COMMIT");
  let report = await attendanceReport(db, 1);
  assert.equal(
    report.data.find((r) => r.registration_id === 1).duration_seconds,
    2100,
  );
  assert.equal(
    report.data.find((r) => r.registration_id === 1).status,
    "present",
  );
  assert.equal(
    report.data.find((r) => r.registration_id === 2).status,
    "partial",
  );
  assert.equal(report.unmatched.length, 1);
  await saveAttendance(db, {
    episodeId: 1,
    meetingUuid: "instance-1",
    participants: rows,
    source: "zoom_api",
    adminId: 1,
    complete: true,
  });
  report = await attendanceReport(db, 1);
  assert.equal(report.data.find(r=>r.registration_id===1).sessions, 2);
  await assert.rejects(
    saveAttendance(db, {
      episodeId: 1,
      meetingUuid: "other-instance",
      participants: [],
      source: "zoom_api",
      adminId: 1,
    }),
    /different meeting instance/,
  );
});
test("manual attendance corrections and guest matches are audited and survive resync", async () => {
  let report = await attendanceReport(db, 1);
  const participant = report.unmatched[0];
  assert.equal(
    (
      await request("/episodes/1/attendance/match", "POST", {
        participant_id: participant.id,
        registration_id: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/episodes/1/attendance/override", "POST", {
        registration_id: 2,
        status: "present",
        note: "Verified by host",
      })
    ).status,
    200,
  );
  await saveAttendance(db, {
    episodeId: 1,
    meetingUuid: "instance-1",
    participants: [{ name: "Unknown guest", duration: 600 }],
    source: "zoom_api",
    adminId: 1,
    complete: true,
  });
  report = await attendanceReport(db, 1);
  assert.equal(report.unmatched.length, 0);
  assert.equal(
    report.data.find((r) => r.registration_id === 2).status,
    "present",
  );
  assert.ok(report.audit.some((a) => a.action === "override"));
});
test("CSV attendance converts minutes, rejects ambiguous timestamps, and does not infer absences for incomplete imports", async () => {
  const parsed = attendanceCsv(
    "User Email,Name,Duration (Minutes)\nregistered@example.com,Student,35",
  );
  assert.equal(parsed[0].duration_seconds, 2100);
  assert.throws(() =>
    attendanceCsv(
      "Email,Join Time,Leave Time\nx@example.com,10/26/2026 8PM,10/26/2026 9PM",
    ),
  );
  await saveAttendance(db, {
    episodeId: 1,
    meetingUuid: "instance-1",
    participants: [],
    source: "zoom_csv",
    adminId: 1,
    complete: false,
  });
  const report = await attendanceReport(db, 1);
  assert.equal(
    report.data.find((r) => r.registration_id === 1).status,
    "not_synced",
  );
});
test("automatic attendance waits until after the episode ends and the report is available", async () => {
  assert.equal(
    new Date(
      episodeEnd({ event_date: "2026-10-26", event_time: "7:00 PM - 8:00 PM" }),
    ).toISOString(),
    "2026-10-26T14:30:00.000Z",
  );
  await db.exec("DELETE FROM attendance_syncs; DELETE FROM attendance_tasks;");
  await db.query("UPDATE episodes SET event_date='2026-10-26' WHERE id=1");
  let requests = 0;
  const zoom = {
    configured: () => true,
    attendance: async () => {
      requests++;
      return {
        meetingUuid: "instance-1",
        startTime: "2026-10-26T13:30:00Z",
        participants: [{ registrant_id: "zoom1", duration: 2100 }],
      };
    },
  };
  await syncRecentAttendance(pool, zoom, Date.parse("2026-10-26T14:40:00Z"));
  assert.equal(requests, 0);
  await syncRecentAttendance(pool, zoom, Date.parse("2026-10-26T15:10:00Z"));
  assert.equal(requests, 1);
  await syncRecentAttendance(pool, zoom, Date.parse("2026-10-26T15:30:00Z"));
  assert.equal(requests, 1);
  await db.query("UPDATE episodes SET event_date='2099-10-26' WHERE id=1");
});

test("601-contact import sends exactly 598 eligible contacts across 12 paced batches, without duplicates", async () => {
  await resetCampaigns();
  const csv =
    "Email,Full Name\n" +
    Array.from(
      { length: 601 },
      (_, i) =>
        `${i === 0 ? "registered@example.com" : i === 1 ? "second@example.com" : i === 2 ? "blocked@example.com" : `bulk${i}@example.com`},Example ${i}`,
    ).join("\n");
  await db.query(
    "INSERT INTO invite_suppressions(email,reason) VALUES('blocked@example.com','unsubscribed')",
  );
  const c = await makeCampaign(csv, { batch_size: 50, interval_minutes: 15 });
  assert.equal(c.recipients, 598);
  const sender = senderStub();
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  for (let i = 0; i < 13; i++) {
    await processInviteBatch(pool, sender, env);
    await db.query(
      "UPDATE invite_campaigns SET next_batch_at=NOW() WHERE id=$1",
      [c.id],
    );
  }
  const audiences = sender.calls
    .filter((c) => c[0] === "audience")
    .flatMap((c) => c[1]);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 12);
  assert.equal(audiences.length, 598);
  assert.equal(new Set(audiences).size, 598);
  assert.equal(
    (await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id]))
      .rows[0].status,
    "completed",
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 12);
});

test("reconciliation only retries an explicitly unsent provider draft and honors cooldowns", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  const sender = senderStub({ fail: true });
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  const { reconcileBatch } = require("../invite-service");
  const batch = (
    await db.query("SELECT * FROM invite_batches WHERE campaign_id=$1", [c.id])
  ).rows[0];
  await assert.rejects(
    reconcileBatch(
      db,
      { campaign: async () => ({ status: "UNKNOWN" }) },
      batch.id,
    ),
    /has not confirmed/,
  );
  assert.equal(
    await reconcileBatch(
      db,
      { campaign: async () => ({ status: "DRAFT", sent_time: null }) },
      batch.id,
    ),
    "unsent",
  );
  assert.equal(
    (
      await db.query("SELECT status FROM invite_batches WHERE id=$1", [
        batch.id,
      ])
    ).rows[0].status,
    "preparing",
  );
  await db.query(
    "UPDATE invite_campaigns SET next_batch_at=NOW()+INTERVAL '1 hour' WHERE id=$1",
    [c.id],
  );
  assert.equal(
    (await request(`/outreach/campaigns/${c.id}/start`, "POST")).status,
    200,
  );
  const before = sender.calls.length;
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.length, before);
});

test("resuming failed preparation uses a new group name without duplicate sends", async () => {
  await resetCampaigns();
  const c = await makeCampaign("Email\none@example.com\ntwo@example.com");
  const sender = senderStub();
  const groups = new Set();
  sender.createGroup = async title => {
    if (groups.has(title)) throw new SenderError("Group title already exists");
    groups.add(title);
    return `group${groups.size}`;
  };
  const assign = sender.addToGroup;
  let attempts = 0;
  sender.addToGroup = async (...args) => {
    if (++attempts === 1) throw new SenderError("Audience preparation failed");
    await assign(...args);
  };
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [c.id]);
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter(call => call[0] === "send").length, 0);
  await db.query("UPDATE invite_campaigns SET status='running',next_batch_at=NOW() WHERE id=$1", [c.id]);
  await processInviteBatch(pool, sender, env);
  assert.equal(groups.size, 2);
  assert.equal(sender.calls.filter(call => call[0] === "send").length, 1);
  assert.equal((await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id])).rows[0].status, "completed");
});

test("expired episodes cannot start a campaign or continue a queued batch", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  const sender = senderStub();
  try {
    await db.query("UPDATE episodes SET event_date='2000-01-01' WHERE id=1");
    assert.equal(
      (await request(`/outreach/campaigns/${c.id}/start`, "POST")).status,
      400,
    );
    await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
      c.id,
    ]);
    await processInviteBatch(pool, sender, env);
    assert.equal(sender.calls.length, 0);
    assert.equal(
      (
        await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [
          c.id,
        ])
      ).rows[0].status,
      "paused",
    );
  } finally {
    await db.query("UPDATE episodes SET event_date='2099-10-26' WHERE id=1");
  }
});

test("CSV opt-outs win over active duplicates in either order and persist across later imports", async () => {
  await resetCampaigns();
  for (const rows of [
    "mixed@example.com,active\nMIXED@example.com,unsubscribed",
    "mixed@example.com,unsubscribed\nMIXED@example.com,active",
  ]) {
    const parsed = contactImport(
      `Email,Status\n${rows}\neligible@example.com,active`,
    );
    assert.deepEqual(
      parsed.contacts.map((c) => c.email),
      ["eligible@example.com"],
    );
    assert.deepEqual(parsed.suppressed_emails, ["mixed@example.com"]);
  }
  await makeCampaign(
    "Email,Status\nmixed@example.com,active\nMIXED@example.com,unsubscribed\neligible@example.com,active",
  );
  const next = await previewImport(
    db,
    1,
    "Email\nmixed@example.com\nanother@example.com",
  );
  assert.deepEqual(
    next.contacts.map((c) => c.email),
    ["another@example.com"],
  );
  assert.throws(() => contactImport("Email\none@example.com", null), /filters/);
});

test("first-batch review defaults on and requires explicit review before further batches", async () => {
  await resetCampaigns();
  const c = await makeCampaign(undefined, {
    pause_after_first_batch: undefined,
  });
  assert.equal(
    (
      await db.query(
        "SELECT pause_after_first_batch FROM invite_campaigns WHERE id=$1",
        [c.id],
      )
    ).rows[0].pause_after_first_batch,
    true,
  );
  const sender = senderStub();
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
  assert.equal(
    (await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id]))
      .rows[0].status,
    "paused",
  );
  await db.query(
    "UPDATE invite_campaigns SET next_batch_at=NOW() WHERE id=$1",
    [c.id],
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
  assert.equal(
    (await request(`/outreach/campaigns/${c.id}/start`, "POST")).status,
    400,
  );
  assert.equal(
    (
      await request(`/outreach/campaigns/${c.id}/start`, "POST", {
        reviewed_first_batch: true,
      })
    ).status,
    200,
  );
  assert.ok(
    (
      await db.query(
        "SELECT pilot_reviewed_at FROM invite_campaigns WHERE id=$1",
        [c.id],
      )
    ).rows[0].pilot_reviewed_at,
  );
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 2);
  assert.equal(
    (await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id]))
      .rows[0].status,
    "completed",
  );
});

test("reports pause subsequent batches on a complaint or elevated bounces", async () => {
  const csv =
    "Email\n" +
    Array.from({ length: 25 }, (_, i) => `quality${i}@example.com`).join("\n");
  for (const [kind, expected] of [
    ["complaints", /spam complaint/],
    ["hard_bounces", /hard bounce/],
    ["soft_bounces", /bounce\(s\)/],
  ]) {
    await resetCampaigns();
    const c = await makeCampaign(csv, { batch_size: 20 });
    const sender = senderStub({
      events: { [kind]: [{ email: "quality0@example.com" }] },
    });
    await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
      c.id,
    ]);
    await processInviteBatch(pool, sender, env);
    await db.query(
      "UPDATE invite_campaigns SET next_batch_at=NOW() WHERE id=$1",
      [c.id],
    );
    await processInviteBatch(pool, sender, env);
    const state = (
      await db.query("SELECT * FROM invite_campaigns WHERE id=$1", [c.id])
    ).rows[0];
    assert.equal(state.status, "paused");
    assert.match(state.last_error, expected);
    assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
    assert.equal(sender.calls.filter((c) => c[0] === "group").length, 1);
  }
});

test("missing provider reports pause rather than permit a later batch", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  const sender = senderStub();
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  await processInviteBatch(pool, sender, env);
  sender.report = async () => {
    throw new SenderError("Sender report unavailable.");
  };
  await db.query(
    "UPDATE invite_campaigns SET next_batch_at=NOW() WHERE id=$1",
    [c.id],
  );
  await processInviteBatch(pool, sender, env);
  const state = (
    await db.query("SELECT * FROM invite_campaigns WHERE id=$1", [c.id])
  ).rows[0];
  assert.equal(state.status, "paused");
  assert.match(state.last_error, /report unavailable/);
  assert.equal(sender.calls.filter((c) => c[0] === "send").length, 1);
});

test("a single-batch campaign completes without an unnecessary pilot review", async () => {
  await resetCampaigns();
  const c = await makeCampaign("Email\nsingle@example.com", {
    pause_after_first_batch: true,
  });
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [
    c.id,
  ]);
  const sender = senderStub();
  await processInviteBatch(pool, sender, env);
  assert.equal(
    (await db.query("SELECT status FROM invite_campaigns WHERE id=$1", [c.id]))
      .rows[0].status,
    "completed",
  );
  const html = sender.calls.find((c) => c[0] === "create")[1];
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /opted in to Open Source Friday/);
  assert.match(html, /href="\{\{ unsubscribe_link \}\}"/);
});

test("reconciling a sent final batch clears the failure and completes without another send", async () => {
  await resetCampaigns();
  const c = await makeCampaign("Email\none@example.com", { pause_after_first_batch: true });
  const sender = senderStub({ fail: true });
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [c.id]);
  await processInviteBatch(pool, sender, env);
  const batch = (await db.query("SELECT * FROM invite_batches WHERE campaign_id=$1", [c.id])).rows[0];
  const { reconcileBatch } = require("../invite-service");
  await reconcileBatch(db, sender, batch.id);
  const saved = (await db.query("SELECT * FROM invite_campaigns WHERE id=$1", [c.id])).rows[0];
  assert.equal(saved.status, "completed");
  assert.equal(saved.last_error, null);
  await processInviteBatch(pool, sender, env);
  assert.equal(sender.calls.filter(call => call[0] === "send").length, 1);
});

test("tracking uses observation time for timezone-less events and repairs future timestamps", async () => {
  await resetCampaigns();
  const c = await makeCampaign("Email\none@example.com");
  const sender = senderStub();
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [c.id]);
  await processInviteBatch(pool, sender, env);
  await db.query("UPDATE invite_recipients SET sent_at=NOW()+INTERVAL '6 hours' WHERE campaign_id=$1", [c.id]);
  await db.query("UPDATE invite_campaigns SET status='paused',last_error='Old submission error' WHERE id=$1", [c.id]);
  sender.report = async (id, kind) => kind === "emails-sent"
    ? [{ email: "one@example.com", created_at: "2099-10-27 08:46:29" }]
    : kind === "opens" ? [{ email: "one@example.com", created_at: "2026-10-26T10:00:00Z" }] : [];
  const before = Date.now();
  await syncInviteReports(db, sender, c.id);
  const first = (await db.query("SELECT sent_at,opened_at FROM invite_recipients WHERE campaign_id=$1", [c.id])).rows[0];
  assert.ok(new Date(first.sent_at).getTime() >= before - 1000);
  assert.ok(new Date(first.sent_at).getTime() <= Date.now() + 1000);
  assert.equal(new Date(first.opened_at).toISOString(), "2026-10-26T10:00:00.000Z");
  const saved = (await db.query("SELECT status,last_error FROM invite_campaigns WHERE id=$1", [c.id])).rows[0];
  assert.equal(saved.status, "completed");
  assert.equal(saved.last_error, null);
  await syncInviteReports(db, sender, c.id);
  const again = (await db.query("SELECT sent_at FROM invite_recipients WHERE campaign_id=$1", [c.id])).rows[0];
  assert.equal(new Date(again.sent_at).getTime(), new Date(first.sent_at).getTime());
});

test('invitation start and worker honor the same 30-minutes-after-start registration cutoff as the student form', async () => {
  await resetCampaigns();
  const campaign = await makeCampaign('Email\ncutoff@example.com');
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-10-27T14:00:00.001Z');
    await db.query("UPDATE episodes SET event_date='2026-10-27',event_time='7:00 PM - 8:00 PM' WHERE id=1");
    const response = await request(`/outreach/campaigns/${campaign.id}/start`, 'POST', {});
    assert.equal(response.status,400);
    assert.match(response.body.error, /30 minutes after/);
    await db.query("UPDATE invite_campaigns SET status='running',next_batch_at='2000-01-01' WHERE id=$1", [campaign.id]);
    const sender = senderStub();
    await processInviteBatch(pool,sender,env);
    assert.equal(sender.calls.length,0);
    assert.equal((await db.query('SELECT status FROM invite_campaigns WHERE id=$1',[campaign.id])).rows[0].status,'paused');
  } finally {
    Date.now = originalNow;
    await db.query("UPDATE episodes SET event_date='2099-10-26',event_time='7:00 PM - 8:00 PM' WHERE id=1");
  }
});

test('failed send evidence persists on the authenticated batch and survives reconciliation', async () => {
  await resetCampaigns(); const c = await makeCampaign();
  const diagnostic = { http_status: 403, response_body: '<h1>Forbidden</h1>', captured_at: '2026-10-28T01:00:00Z', note: 'redacted' };
  const sender = senderStub(); let sends = 0;
  sender.send = async () => { sends++; const e = new SenderError('Forbidden'); e.providerDiagnostic = diagnostic; throw e; };
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1", [c.id]);
  await processInviteBatch(pool, sender, env);
  const batch = (await db.query('SELECT * FROM invite_batches WHERE campaign_id=$1', [c.id])).rows[0];
  assert.equal(batch.status, 'review'); assert.deepEqual(batch.provider_diagnostic, diagnostic);
  const response = await request(`/outreach/campaigns/${c.id}`);
  assert.deepEqual(response.body.batches[0].provider_diagnostic, diagnostic);
  await request(`/outreach/campaigns/${c.id}/reconcile/${batch.id}`, 'POST', {});
  assert.deepEqual((await db.query('SELECT provider_diagnostic FROM invite_batches WHERE id=$1', [batch.id])).rows[0].provider_diagnostic, diagnostic);
  assert.equal(sends, 1);
});

test('batch waits for Sender audience readiness before creating or sending a campaign',async()=>{
  await resetCampaigns();const c=await makeCampaign('Email\none@example.com\ntwo@example.com');
  const sender=senderStub();
  sender.waitForGroup=async(id,count,guard)=>{
    sender.calls.push(['ready',id,count]);
    assert.equal(count,2);assert.equal(sender.calls.filter(c=>['create','send'].includes(c[0])).length,0);
    await guard();
  };
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env);
  assert.deepEqual(sender.calls.map(c=>c[0]),['group','audience','ready','create','send']);
});

test('audience timeout pauses before creating a campaign and resumes with a freshly checked group',async()=>{
  await resetCampaigns();const c=await makeCampaign('Email\none@example.com\ntwo@example.com');const sender=senderStub();
  const wait=sender.waitForGroup;sender.waitForGroup=async()=>{throw new SenderError('Sender is still calculating the batch audience after two minutes. No campaign was sent. Please resume later.');};
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env);
  assert.equal(sender.calls.filter(c=>['create','send'].includes(c[0])).length,0);
  const paused=(await db.query('SELECT * FROM invite_campaigns WHERE id=$1',[c.id])).rows[0];assert.equal(paused.status,'paused');assert.match(paused.last_error,/two minutes/);
  sender.waitForGroup=wait;await db.query("UPDATE invite_campaigns SET status='running',next_batch_at=NOW() WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env);assert.equal(sender.calls.filter(c=>c[0]==='send').length,1);
});

test('pauses, event closure and new suppressions during readiness prevent a stale audience send',async()=>{
  for(const change of ['pause','close','suppress']) {
    await resetCampaigns();const c=await makeCampaign('Email\none@example.com\ntwo@example.com');const sender=senderStub();
    sender.waitForGroup=async(id,count,guard)=>{
      if(change==='pause')await db.query("UPDATE invite_campaigns SET status='paused' WHERE id=$1",[c.id]);
      if(change==='close')await db.query('UPDATE episodes SET is_registration_open=FALSE WHERE id=1');
      if(change==='suppress')await db.query("INSERT INTO invite_suppressions(email,reason) VALUES('one@example.com','STOP during readiness')");
      await guard();
    };
    try {
      await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);await processInviteBatch(pool,sender,env);
      assert.equal(sender.calls.filter(c=>['create','send'].includes(c[0])).length,0,change);
      assert.equal((await db.query('SELECT status FROM invite_campaigns WHERE id=$1',[c.id])).rows[0].status,'paused');
    }finally{await db.query('UPDATE episodes SET is_registration_open=TRUE WHERE id=1');}
  }
});

function audienceRejection(){const error=new SenderError('Sender audience is not ready.');error.audienceNotReady=true;return error;}

test('an explicit no-subscribers rejection retries the same verified unsent draft once after a minute',async()=>{
  await resetCampaigns();const c=await makeCampaign('Email\none@example.com\ntwo@example.com');const sender=senderStub();let sends=0;const waits=[];
  sender.campaign=async()=>({status:'DRAFT',sent_time:null});
  sender.send=async id=>{sender.calls.push(['send',id]);if(++sends===1)throw audienceRejection();};
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env,{sleep:async ms=>{
    waits.push(ms);assert.equal((await db.query('SELECT status FROM invite_batches WHERE campaign_id=$1',[c.id])).rows[0].status,'sending');
  }});
  assert.deepEqual(waits,[60000]);assert.equal(sends,2);assert.equal(sender.calls.filter(c=>c[0]==='create').length,1);
  assert.deepEqual(sender.calls.filter(c=>c[0]==='send').map(c=>c[1]),['provider1','provider1']);
  assert.equal((await db.query('SELECT status FROM invite_campaigns WHERE id=$1',[c.id])).rows[0].status,'completed');
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM invite_recipients WHERE campaign_id=$1 AND send_status='submitted'",[c.id])).rows[0].n,2);
});

test('audience errors never retry sent, scheduled, unknown or already dispatched drafts',async()=>{
  for(const provider of [{status:'SENT'},{status:'SCHEDULED'},{status:'UNKNOWN'},{status:'DRAFT',sent_time:'2026-10-30T12:00:00Z'},null]) {
    await resetCampaigns();const c=await makeCampaign('Email\none@example.com');const sender=senderStub();let sends=0;
    sender.campaign=async()=>provider;sender.send=async()=>{sends++;throw audienceRejection();};
    await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
    await processInviteBatch(pool,sender,env,{sleep:async()=>assert.fail('No wait or retry allowed')});
    assert.equal(sends,1);assert.equal((await db.query('SELECT status FROM invite_batches WHERE campaign_id=$1',[c.id])).rows[0].status,'review');
  }
});

test('second audience rejection stops after one retry and remains fenced for reconciliation',async()=>{
  await resetCampaigns();const c=await makeCampaign('Email\none@example.com');const sender=senderStub();let sends=0,waits=0;
  sender.campaign=async()=>({status:'DRAFT'});sender.send=async()=>{sends++;throw audienceRejection();};
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env,{sleep:async()=>{waits++;}});
  assert.equal(sends,2);assert.equal(waits,1);assert.equal((await db.query('SELECT status FROM invite_batches WHERE campaign_id=$1',[c.id])).rows[0].status,'review');
  await db.query("UPDATE invite_campaigns SET status='running',next_batch_at=NOW() WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env);assert.equal(sends,2);
});

test('a manual pause or external Sender send during the one-minute wait prevents the retry',async()=>{
  for(const change of ['pause','external_send']) {
    await resetCampaigns();const c=await makeCampaign('Email\none@example.com');const sender=senderStub();let sends=0,changed=false;
    sender.campaign=async()=>({status:changed&&change==='external_send'?'SENT':'DRAFT'});sender.send=async()=>{sends++;throw audienceRejection();};
    await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
    await processInviteBatch(pool,sender,env,{sleep:async()=>{changed=true;if(change==='pause')await db.query("UPDATE invite_campaigns SET status='paused' WHERE id=$1",[c.id]);}});
    assert.equal(sends,1);assert.equal((await db.query('SELECT status FROM invite_batches WHERE campaign_id=$1',[c.id])).rows[0].status,'review');
  }
});


test('an audience rejection with a longer provider cooldown never takes the one-minute retry path',async()=>{
  await resetCampaigns();const c=await makeCampaign('Email\none@example.com');const sender=senderStub();let sends=0;
  sender.campaign=async()=>({status:'DRAFT'});sender.send=async()=>{sends++;const e=audienceRejection();e.retryAfterSeconds=600;throw e;};
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  await processInviteBatch(pool,sender,env,{sleep:async()=>assert.fail('Long cooldown must stay paused')});
  assert.equal(sends,1);const saved=(await db.query('SELECT * FROM invite_campaigns WHERE id=$1',[c.id])).rows[0];assert.equal(saved.status,'paused');assert.ok(new Date(saved.next_batch_at).getTime()>Date.now()+500000);
});

test('a full 50-new-contact batch paces all preparation requests and submits exactly one campaign',async()=>{
 await resetCampaigns();
 const c=await makeCampaign('Email,Full Name\n'+Array.from({length:50},(_,i)=>`paced${i}@example.com,Test ${i}`).join('\n'),{batch_size:50});
 const contacts=new Map(),calls=[];let clock=Date.now(),audience=0;
 const sender=require('../sender').createSenderClient({env:{...env,SENDER_API_TOKEN:'test-token',SENDER_FROM_EMAIL:'test@example.com'},now:()=>clock,sleep:async ms=>{clock+=ms;},fetchImpl:async(url,init)=>{
  const path=new URL(url).pathname;calls.push({path,method:init.method,at:clock});let status=200,body={};
  if(path==='/v2/groups')body={data:{id:'paced-group'}};
  else if(path==='/v2/subscribers'&&init.method==='POST'){const c=JSON.parse(init.body);contacts.set(c.email,{status:{email:'active'}});body={data:{id:c.email}};}
  else if(path.startsWith('/v2/subscribers/groups/')){audience=JSON.parse(init.body).subscribers.length;}
  else if(path.startsWith('/v2/subscribers/')){const email=decodeURIComponent(path.slice('/v2/subscribers/'.length));status=contacts.has(email)?200:404;body={data:contacts.get(email)};}
  else if(path==='/v2/groups/paced-group')body={data:{id:'paced-group',active_subscribers:audience}};
  else if(path==='/v2/campaigns')body={data:{id:'paced-campaign'}};
  else if(path!=='/v2/campaigns/paced-campaign/send')assert.fail('Unexpected provider operation');
  return {status,ok:status<400,headers:{get:()=>null},json:async()=>body};
 }});
 await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);await processInviteBatch(pool,sender,env);
 assert.equal(calls.length,155);for(let i=1;i<calls.length;i++)assert.ok(calls[i].at-calls[i-1].at>=2000);
 assert.equal(calls.filter(c=>c.path.endsWith('/send')).length,1);assert.equal(audience,50);
 assert.equal((await db.query('SELECT status FROM invite_campaigns WHERE id=$1',[c.id])).rows[0].status,'completed');
});


test("campaign trash preserves imported evidence and registrations, blocks sends and restores paused", async () => {
  await resetCampaigns();
  const c = await makeCampaign();
  await db.query("INSERT INTO invite_delivery_imports(campaign_id,imported_by,row_count) VALUES($1,1,2)",[c.id]);
  const before = (await db.query("SELECT COUNT(*)::integer AS n FROM episode_registrations")).rows[0].n;
  let result=await request(`/outreach/campaigns/${c.id}/trash`,'POST');
  assert.equal(result.status,200);
  assert.equal((await request('/outreach/campaigns')).body.data.length,0);
  assert.equal((await request('/outreach/campaigns?trash=true')).body.data.length,1);
  const saved=(await request(`/outreach/campaigns/${c.id}`)).body;
  assert.ok(saved.campaign.deleted_at);
  assert.equal(saved.data.length,3);
  assert.equal((await db.query("SELECT COUNT(*)::integer AS n FROM invite_delivery_imports WHERE campaign_id=$1",[c.id])).rows[0].n,1);
  assert.equal((await db.query("SELECT COUNT(*)::integer AS n FROM episode_registrations")).rows[0].n,before);
  for(const action of ['start','sync','delivery-import']) assert.equal((await request(`/outreach/campaigns/${c.id}/${action}`,'POST',{csv:'Email,Status,Timestamp\none@example.com,delivered,2026-01-01T12:00:00Z'})).status,404);
  // Even an accidental status update cannot make a trashed campaign send.
  await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);
  const sender=senderStub();await processInviteBatch(pool,sender,env);assert.equal(sender.calls.length,0);
  result=await request(`/outreach/campaigns/${c.id}/restore`,'POST');assert.equal(result.status,200);
  const restored=(await request(`/outreach/campaigns/${c.id}`)).body;
  assert.equal(restored.campaign.deleted_at,null);assert.equal(restored.campaign.status,'paused');assert.equal(restored.data.length,3);
  assert.equal((await request('/outreach/campaigns')).body.data.length,1);
  assert.equal((await request('/outreach/campaigns?trash=true')).body.data.length,0);
});

test("campaign trash refuses uncertain sends and keeps historical invitation exclusions",async()=>{
  await resetCampaigns();const c=await makeCampaign();
  const sender=senderStub({fail:true});await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);await processInviteBatch(pool,sender,env);
  assert.equal((await request(`/outreach/campaigns/${c.id}/trash`,'POST')).status,409);
  assert.equal((await request('/outreach/campaigns')).body.data.length,1);
  await db.query("UPDATE invite_batches SET status='submitted' WHERE campaign_id=$1",[c.id]);
  assert.equal((await request(`/outreach/campaigns/${c.id}/trash`,'POST')).status,200);
  const preview=await previewImport(db,1,'Email\none@example.com');assert.equal(preview.contacts.length,0);assert.match(preview.excluded[0].reason,/Already invited/);
});


test('draft editing locks after first start and validates settings',async()=>{
 await resetCampaigns();const c=await makeCampaign();
 const body={subject:'Updated draft',body:'Updated message',batch_size:10,interval_minutes:20,pause_after_first_batch:true};
 assert.equal((await request(`/outreach/campaigns/${c.id}`,'PATCH',body)).status,200);
 const saved=(await request(`/outreach/campaigns/${c.id}`)).body;assert.equal(saved.campaign.subject,'Updated draft');assert.equal(saved.data.length,3);
 assert.equal((await request(`/outreach/campaigns/${c.id}`,'PATCH',{...body,batch_size:0})).status,400);
 assert.equal((await request(`/outreach/campaigns/${c.id}/start`,'POST')).status,200);
 assert.ok((await request(`/outreach/campaigns/${c.id}`)).body.campaign.started_at);
 assert.equal((await request(`/outreach/campaigns/${c.id}`,'PATCH',body)).status,409);
 await request(`/outreach/campaigns/${c.id}/pause`,'POST');assert.equal((await request(`/outreach/campaigns/${c.id}`,'PATCH',body)).status,409);
});

test('permanent campaign deletion requires trash and confirmation and preserves duplicate-send protection',async()=>{
 await resetCampaigns();const c=await makeCampaign();
 const path=`/outreach/campaigns/${c.id}`;
 assert.equal((await request(path,'DELETE',{confirmation:'DELETE PERMANENTLY'})).status,409);
 await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[c.id]);await processInviteBatch(pool,senderStub(),env);
 const sent=(await db.query("SELECT email FROM invite_recipients WHERE campaign_id=$1 AND send_status='submitted'",[c.id])).rows;
 assert.ok(sent.length);
 await db.query("INSERT INTO invite_suppressions(email,reason) VALUES('optout@example.com','Unsubscribed')");
 assert.equal((await request(path+'/trash','POST')).status,200);
 assert.equal((await request(path,'DELETE',{confirmation:'wrong'})).status,400);
 assert.equal((await request(path,'DELETE',{confirmation:'DELETE PERMANENTLY'})).status,200);
 assert.equal((await request(path)).status,404);
 for(const table of ['invite_batches','invite_recipients','invite_delivery_imports'])assert.equal((await db.query(`SELECT COUNT(*)::integer AS n FROM ${table}`)).rows[0].n,0);
 assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM invite_suppressions')).rows[0].n,1);
 assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM episode_registrations')).rows[0].n,2);
 const csv='Email\n'+sent.map(r=>r.email).join('\n');assert.equal((await previewImport(db,1,csv)).contacts.length,0);
 // A previously queued draft must also exclude addresses purged after submission elsewhere.
 const other=await makeCampaign('Email\nthree@example.com');
 await db.query("INSERT INTO invite_sent_history(episode_id,email) VALUES(1,'three@example.com') ON CONFLICT DO NOTHING");
 await db.query("UPDATE invite_campaigns SET status='running' WHERE id=$1",[other.id]);const sender=senderStub();await processInviteBatch(pool,sender,env);assert.equal(sender.calls.filter(c=>c[0]==='send').length,0);
});
