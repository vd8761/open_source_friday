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
        const { databaseTypes } = require('./database-types');
        const { episodeJsonReplacer } = require('./episode-time');
        const legacy = types.getTypeParser(1114)('2026-10-29 00:00:00');
        const registered = new Date('2026-10-28T14:30:00Z');
        const api = JSON.parse(JSON.stringify({ nested: [{ event_date: legacy, registered_at: registered }] }, episodeJsonReplacer));
        assert.equal(api.nested[0].event_date, '2026-10-29');
        assert.equal(api.nested[0].registered_at, registered.toISOString());
        assert.equal(JSON.stringify({ event_date: databaseTypes.getTypeParser(1082)('2026-10-27') }), '{"event_date":"2026-10-27"}');
        const {formatIST}=await import('../client/src/utils/dateTime.js');
        const {PGlite}=require('@electric-sql/pglite');
        const timestamps=new PGlite();
        try {
          await timestamps.exec("SET TIME ZONE 'UTC'; CREATE TABLE legacy_times(signup TIMESTAMP,zoom TIMESTAMPTZ); INSERT INTO legacy_times VALUES('2026-10-29 12:07:29','2026-10-29T12:07:29Z');");
          const row=(await timestamps.query('SELECT signup::timestamptz AS signup,zoom FROM legacy_times')).rows[0];
          assert.equal(row.signup.toISOString(),'2026-10-29T12:07:29.000Z');
          for(const value of [row.signup.toISOString(),row.zoom.toISOString(),'2026-10-29T17:37:29+05:30'])assert.equal(formatIST(value),'29 Oct 2026, 5:37:29 PM IST');
          assert.equal(formatIST('2026-10-29T18:30:00Z'),'30 Oct 2026, 12:00:00 AM IST');
          assert.equal(formatIST('2026-10-29T06:30:00Z'),'29 Oct 2026, 12:00:00 PM IST');
          assert.equal(formatIST('2026-10-29 12:07:29'),'—');
          assert.equal(formatIST('invalid'),'—');
        } finally {await timestamps.close();}
        const ui = await import('../client/src/utils/episodeTime.js');
        assert.equal(ui.calendarInputDate('2026-10-27').getDate(), 27);
        assert.equal(ui.formatEpisodeDate('2026-10-27', { day: '2-digit' }), '27');
        assert.equal(ui.isRegistrationOpen({ ...episode, event_date: '2026-10-27' }, Date.parse('2026-10-27T12:00:00Z')), true);
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
