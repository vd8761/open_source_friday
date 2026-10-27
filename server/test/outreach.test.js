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
    "DELETE FROM invite_delivery_imports; DELETE FROM invite_recipients; DELETE FROM invite_batches; DELETE FROM invite_campaigns; DELETE FROM invite_suppressions;",
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
    /\{\$unsubscribe_link\}/,
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
  assert.equal(report.data[0].sessions, 2);
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
  assert.match(html, /\{\$unsubscribe_link\}/);
});
