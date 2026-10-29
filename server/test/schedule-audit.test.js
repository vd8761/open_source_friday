const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { processEpisodeReminders } = require('../episode-reminders');
const { episodeStart, validSchedule, registrationIsOpen, registrationClosesAt } = require('../episode-time');
const { databaseTypes } = require('../database-types');
const episode = { event_date: '2026-10-27', event_time: '7:00 PM – 8:00 PM', is_active: true, is_registration_open: true };
test('schedule preserves the PostgreSQL calendar date and agrees with the frontend cutoff', async () => {
  const { types } = require('pg');
  assert.equal(databaseTypes.getTypeParser(1082)('2026-10-27'), '2026-10-27');
  assert.equal(databaseTypes.getTypeParser(23)('42'), types.getTypeParser(23)('42'));
  const ui = await import('../../client/src/utils/episodeTime.js');
  const start = episodeStart(episode);
  assert.equal(new Date(start).toISOString(), '2026-10-27T13:30:00.000Z');
  const cutoff=start+30*60000;
  assert.equal(registrationClosesAt(episode),cutoff);
  for (const now of [start-3600001,start-3600000,start-1,start,start+1,cutoff-1,cutoff,cutoff+1]) {
    const expected=now<=cutoff;
    assert.equal(registrationIsOpen(episode,now),expected);
    assert.equal(ui.isRegistrationOpen(episode,now),expected);
  }
  for(const flags of [{is_registration_open:false},{is_active:false}]) {
    assert.equal(registrationIsOpen({...episode,...flags},start+15*60000),false);
    assert.equal(ui.isRegistrationOpen({...episode,...flags},start+15*60000),false);
  }
  assert.equal(registrationIsOpen({ ...episode, event_time: 'invalid' }, start), false);
  for (const date of ['2026-02-30', 'invalid']) assert.equal(validSchedule({ ...episode, event_date: date }), false);
});
test('a range schedule sends one reminder and one starting alert despite overlapping runs and restarts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY, episode_number INTEGER, title TEXT, presenter_name TEXT, cover_photo_url TEXT,
      event_date DATE,event_time TEXT,is_active BOOLEAN,is_silent BOOLEAN,reminder_sent BOOLEAN DEFAULT FALSE,starting_now_sent BOOLEAN DEFAULT FALSE);
      INSERT INTO episodes(id,episode_number,title,presenter_name,event_date,event_time,is_active,is_silent)
      VALUES(1,16,'OSF','Host','2026-10-27','7:00 PM - 8:00 PM',TRUE,FALSE),
        (2,17,'Silent','Host','2026-10-27','7:00 PM - 8:00 PM',TRUE,TRUE);`);
    const sent = [], send = async payload => sent.push(payload);
    const start = episodeStart(episode);
    await Promise.all([processEpisodeReminders(db,send,start - 30*60000), processEpisodeReminders(db,send,start - 30*60000)]);
    await processEpisodeReminders(db,send,start - 29*60000);
    assert.equal(sent.length,1);
    await Promise.all([processEpisodeReminders(db,send,start), processEpisodeReminders(db,send,start)]);
    await processEpisodeReminders(db,send,start + 60000);
    assert.equal(sent.length,2);
    assert.ok(sent.every(p => p.url === '/register/episode-16'));
    assert.notEqual(sent[0].tag,sent[1].tag);
  } finally { await db.close(); }
});

test('roster CSV preserves quotes and commas while disabling spreadsheet formulas', async () => {
  const { rosterCsv } = await import('../../client/src/utils/rosterCsv.js');
  const { parse } = require('csv-parse/sync');
  const parsed = parse(rosterCsv([{ full_name: 'Ada "A", Lovelace', email: 'a@example.com', college: ' =1+1', excited_topic: '@SUM(1,2)' }]), { columns: true });
  assert.equal(parsed[0]['Full Name'], 'Ada "A", Lovelace');
  assert.equal(parsed[0].College, "' =1+1");
  assert.equal(parsed[0].Topic, "'@SUM(1,2)");
});

test('episode update SQL works with both DATE and legacy TIMESTAMP columns', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
  const sql = source.match(/UPDATE episodes\s+SET episode_number = \$1[\s\S]*?RETURNING \*/)[0];
  for (const type of ['DATE','TIMESTAMP WITHOUT TIME ZONE']) {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY,episode_number INTEGER,title TEXT,description TEXT,meta_description TEXT,
        event_date ${type},event_time VARCHAR(50),presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT,cover_photo_url TEXT,
        past_cover_photo_url TEXT,event_mode TEXT,is_registration_open BOOLEAN,reminder_sent BOOLEAN,starting_now_sent BOOLEAN,zoom_meeting_id TEXT,is_silent BOOLEAN);
        INSERT INTO episodes(id,event_date,event_time,reminder_sent,starting_now_sent) VALUES(1,'2026-10-28','7:00 PM - 8:00 PM',TRUE,TRUE);`);
      const values=[17,'Sample','Description','Preview','2026-10-29','7:00 PM - 8:00 PM','Host','Test','','','','Online',true,1,null,true];
      const saved = (await db.query(sql,values)).rows[0];
      assert.equal(saved.reminder_sent,false); assert.equal(saved.starting_now_sent,false);
      await db.exec('UPDATE episodes SET reminder_sent=TRUE,starting_now_sent=TRUE');
      const unchanged = (await db.query(sql,values)).rows[0];
      assert.equal(unchanged.reminder_sent,true); assert.equal(unchanged.starting_now_sent,true);
    } finally { await db.close(); }
  }
});
