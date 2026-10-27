const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

for (const timeZone of ["Asia/Kolkata", "UTC", "America/New_York"]) {
  test(`PostgreSQL dates keep the episode day for invitations and attendance in ${timeZone}`, () => {
    execFileSync(process.execPath, ["-e", `
      const assert = require("node:assert/strict");
      const { types } = require("pg");
      const { episodeDate, episodeEnd } = require("./episode-time");
      const { syncEpisodeAttendance } = require("./attendance");
      const episode = {
        id: 1,
        event_date: types.getTypeParser(1082)("2026-10-27"),
        event_time: "7:00 PM - 8:00 PM",
        zoom_meeting_id: "12345678901",
      };
      assert.equal(episodeDate(episode), "2026-10-27");
      assert.equal(episodeDate({ event_date: "2026-10-27" }), "2026-10-27");
      assert.equal(new Date(episodeEnd(episode)).toISOString(), "2026-10-27T14:30:00.000Z");
      const writes = [];
      const db = { query: async (sql, params) => {
        if (sql.startsWith("INSERT INTO attendance_syncs")) writes.push(params);
        return { rows: [] };
      }};
      const report = { meetingUuid: "session-27", startTime: "2026-10-27T13:30:00Z", participants: [] };
      (async () => {
        await syncEpisodeAttendance(db, { attendance: async () => report }, episode);
        assert.equal(writes.length, 1);
        await assert.rejects(
          syncEpisodeAttendance(db, { attendance: async () => ({ ...report, startTime: "2026-10-26T13:30:00Z" }) }, episode),
          /session date does not match/,
        );
        assert.equal(writes.length, 1);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, TZ: timeZone },
      stdio: "pipe",
    });
  });
}
