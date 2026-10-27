const { createHash } = require("node:crypto");
const { readCsv, InputError, normalizeEmail } = require("./outreach-csv");
const { episodeDate } = require("./episode-time");
function normalizeParticipant(row) {
  const join = Date.parse(row.join_time || ""),
    leave = Date.parse(row.leave_time || "");
  const duration = Number(row.duration_seconds ?? row.duration ?? 0);
  if (!Number.isFinite(duration) || duration < 0 || duration > 86400 * 7)
    throw new InputError("Invalid participant duration.");
  if (
    (row.join_time && !Number.isFinite(join)) ||
    (row.leave_time && !Number.isFinite(leave)) ||
    (Number.isFinite(join) && Number.isFinite(leave) && leave < join)
  )
    throw new InputError(
      "Invalid join/leave timestamps. Use ISO timestamps with timezone for CSV imports.",
    );
  return {
    registrant_id: String(row.registrant_id || ""),
    email: normalizeEmail(row.user_email || row.email),
    name: String(row.name || row.user_name || "").slice(0, 255),
    join_time: Number.isFinite(join) ? new Date(join).toISOString() : null,
    leave_time: Number.isFinite(leave) ? new Date(leave).toISOString() : null,
    duration_seconds:
      Number.isFinite(join) && Number.isFinite(leave)
        ? Math.floor((leave - join) / 1000)
        : Math.floor(duration),
  };
}
function attendanceCsv(csv) {
  const { rows, columns } = readCsv(csv);
  if (
    !columns.some((c) => ["email", "user_email", "registrant_id"].includes(c))
  )
    throw new InputError(
      "Attendance CSV needs Email, User Email or Registrant ID.",
    );
  if (
    !columns.some((c) =>
      [
        "duration_minutes",
        "duration",
        "duration_seconds",
        "duration_minutes_",
      ].includes(c),
    )
  ) {
    if (!columns.includes("join_time") || !columns.includes("leave_time"))
      throw new InputError(
        "Include Duration (Minutes), Duration Seconds, or ISO Join Time and Leave Time columns.",
      );
  }
  return rows.map((row) => {
    const join = row.join_time,
      leave = row.leave_time;
    for (const timestamp of [join, leave])
      if (timestamp && !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(timestamp))
        throw new InputError(
          "Convert Join Time and Leave Time to ISO timestamps with timezone, or import duration columns only.",
        );
    // Zoom portal CSV durations are minutes; Zoom REST API durations are seconds.
    return normalizeParticipant({
      ...row,
      duration_seconds:
        row.duration_seconds ||
        Number(row.duration_minutes || row.duration || 0) * 60,
    });
  });
}
function matchParticipant(participant, registrations) {
  if (participant.registrant_id) {
    const matches = registrations.filter(
      (r) => r.registrant_id === participant.registrant_id,
    );
    if (matches.length === 1)
      return {
        registration_id: matches[0].registration_id,
        match_method: "registrant_id",
      };
    // A supplied but unknown ID must not be silently attributed to another registration.
    return { registration_id: null, match_method: "unmatched" };
  }
  if (participant.email) {
    const matches = registrations.filter(
      (r) => normalizeEmail(r.email) === participant.email,
    );
    if (matches.length === 1)
      return {
        registration_id: matches[0].registration_id,
        match_method: "email",
      };
  }
  return { registration_id: null, match_method: "unmatched" };
}
function combinedSeconds(rows) {
  const intervals = [],
    withoutTimes = new Set();
  let duration = 0;
  for (const row of rows) {
    if (row.join_time && row.leave_time)
      intervals.push([Date.parse(row.join_time), Date.parse(row.leave_time)]);
    else {
      // Idempotent snapshots are deduplicated by row ID. Without intervals, overlap
      // cannot be established; surface this limitation in the attendance report.
      const key = row.id || JSON.stringify(row);
      if (!withoutTimes.has(key)) {
        duration += Number(row.duration_seconds);
        withoutTimes.add(key);
      }
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let start, end;
  for (const [a, b] of intervals) {
    if (start === undefined) {
      start = a;
      end = b;
    } else if (a <= end) end = Math.max(end, b);
    else {
      duration += (end - start) / 1000;
      start = a;
      end = b;
    }
  }
  if (start !== undefined) duration += (end - start) / 1000;
  return Math.floor(duration);
}
async function saveAttendance(
  db,
  {
    episodeId,
    meetingUuid,
    participants,
    threshold = 30,
    source,
    adminId,
    complete = false,
  },
) {
  if (
    !Number.isInteger(Number(threshold)) ||
    Number(threshold) < 1 ||
    Number(threshold) > 1440
  )
    throw new InputError("Attendance threshold must be 1–1440 minutes.");
  if (
    typeof meetingUuid !== "string" ||
    !meetingUuid.trim() ||
    meetingUuid.length > 200
  )
    throw new InputError(
      "Provide the meeting instance UUID or an identifiable CSV session reference.",
    );
  // Serialize snapshot imports and manual changes for the same episode.
  await db.query("SELECT id FROM episodes WHERE id=$1 FOR UPDATE", [episodeId]);
  const registrations = (
    await db.query(
      `SELECT er.id AS registration_id,s.email,j.registrant_id FROM episode_registrations er
    JOIN students s ON s.id=er.student_id LEFT JOIN zoom_registration_jobs j ON j.registration_id=er.id WHERE er.episode_id=$1`,
      [episodeId],
    )
  ).rows;
  const oldSync = (
    await db.query("SELECT * FROM attendance_syncs WHERE episode_id=$1", [
      episodeId,
    ])
  ).rows[0];
  if (oldSync && oldSync.meeting_uuid !== meetingUuid)
    throw new InputError(
      "This episode already has a different meeting instance. Review it before importing another session.",
      409,
    );
  const oldMatches = new Map(
    (
      await db.query(
        "SELECT id,registration_id FROM attendance_participants WHERE episode_id=$1 AND match_method='manual'",
        [episodeId],
      )
    ).rows.map((row) => [row.id, row.registration_id]),
  );
  const normalized = participants.map(normalizeParticipant);
  await db.query("DELETE FROM attendance_participants WHERE episode_id=$1", [
    episodeId,
  ]);
  for (const row of normalized) {
    const id = createHash("sha256")
      .update(JSON.stringify([String(episodeId), meetingUuid, row]))
      .digest("hex");
    const match = oldMatches.has(id)
      ? { registration_id: oldMatches.get(id), match_method: "manual" }
      : matchParticipant(row, registrations);
    await db.query(
      `INSERT INTO attendance_participants(id,episode_id,registration_id,registrant_id,email,name,join_time,leave_time,duration_seconds,match_method)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
      [
        id,
        episodeId,
        match.registration_id,
        row.registrant_id,
        row.email,
        row.name,
        row.join_time,
        row.leave_time,
        row.duration_seconds,
        match.match_method,
      ],
    );
  }
  await db.query(
    `INSERT INTO attendance_syncs(episode_id,meeting_uuid,threshold_minutes,source,synced_by,report_complete)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(episode_id) DO UPDATE SET threshold_minutes=$3,source=$4,synced_by=$5,synced_at=NOW(),report_complete=$6`,
    [episodeId, meetingUuid, threshold, source, adminId, complete],
  );
  if (complete)
    await db.query(
      "UPDATE attendance_tasks SET status='done',last_error=NULL WHERE episode_id=$1",
      [episodeId],
    );
  await db.query(
    "INSERT INTO attendance_audit(episode_id,action,detail,admin_id) VALUES($1,$2,$3,$4)",
    [
      episodeId,
      "sync",
      `${source}: ${normalized.length} participant rows; complete=${complete}; minimum=${threshold} minutes`,
      adminId,
    ],
  );
}
async function attendanceReport(db, episodeId) {
  const sync =
    (
      await db.query("SELECT * FROM attendance_syncs WHERE episode_id=$1", [
        episodeId,
      ])
    ).rows[0] || null;
  const participants = (
    await db.query(
      "SELECT * FROM attendance_participants WHERE episode_id=$1 ORDER BY name,id",
      [episodeId],
    )
  ).rows;
  const registrations = (
    await db.query(
      `SELECT er.id AS registration_id,s.full_name,s.email,o.status AS override_status,o.note AS override_note
    FROM episode_registrations er JOIN students s ON s.id=er.student_id LEFT JOIN attendance_overrides o ON o.registration_id=er.id
    WHERE er.episode_id=$1 ORDER BY s.full_name,er.id`,
      [episodeId],
    )
  ).rows;
  const data = registrations.map((row) => {
    const sessions = participants.filter(
      (p) => p.registration_id === row.registration_id,
    );
    const seconds = combinedSeconds(sessions);
    return {
      ...row,
      duration_seconds: seconds,
      minutes: Math.round((seconds / 60) * 10) / 10,
      joined: sessions.length > 0,
      sessions: sessions.length,
      status:
        row.override_status ||
        (sessions.length
          ? seconds >= (sync?.threshold_minutes || 30) * 60
            ? "present"
            : "partial"
          : sync?.report_complete
            ? "absent"
            : "not_synced"),
      duration_estimated: sessions.some((s) => !s.join_time || !s.leave_time),
    };
  });
  return {
    sync,
    automatic_sync:
      (
        await db.query("SELECT * FROM attendance_tasks WHERE episode_id=$1", [
          episodeId,
        ])
      ).rows[0] || null,
    data,
    unmatched: participants.filter((p) => !p.registration_id),
    audit: (
      await db.query(
        "SELECT * FROM attendance_audit WHERE episode_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50",
        [episodeId],
      )
    ).rows,
  };
}
async function syncEpisodeAttendance(
  db,
  zoom,
  episode,
  { meetingUuid, threshold, adminId = null } = {},
) {
  const previous = (
    await db.query("SELECT * FROM attendance_syncs WHERE episode_id=$1", [
      episode.id,
    ])
  ).rows[0];
  const report = await zoom.attendance(
    episode.zoom_meeting_id,
    previous?.meeting_uuid || meetingUuid,
  );
  const expected = episodeDate(episode);
  const actual = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(report.startTime));
  if (actual !== expected)
    throw new InputError(
      "The Zoom session date does not match this episode. Select the correct meeting instance UUID.",
      409,
    );
  await saveAttendance(db, {
    episodeId: episode.id,
    meetingUuid: report.meetingUuid,
    participants: report.participants,
    threshold: threshold ?? previous?.threshold_minutes ?? 30,
    source: "zoom_api",
    adminId,
    complete: true,
  });
}
module.exports = {
  syncEpisodeAttendance,
  normalizeParticipant,
  attendanceCsv,
  matchParticipant,
  combinedSeconds,
  saveAttendance,
  attendanceReport,
};
