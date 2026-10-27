const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { processEpisodeReminders } = require('../episode-reminders');
const { episodeStart, validSchedule, registrationIsOpen } = require('../episode-time');
const { databaseTypes } = require('../database-types');
const episode = { event_date: '2026-10-27', event_time: '7:00 PM – 8:00 PM', is_active: true, is_registration_open: true };
test('schedule preserves the PostgreSQL calendar date and agrees with the frontend cutoff', async () => {
  const { types } = require('pg');
  assert.equal(databaseTypes.getTypeParser(1082)('2026-10-27'), '2026-10-27');
  assert.equal(databaseTypes.getTypeParser(23)('42'), types.getTypeParser(23)('42'));
  const ui = await import('../../client/src/utils/episodeTime.js');
  const start = episodeStart(episode);
  assert.equal(new Date(start).toISOString(), '2026-10-27T13:30:00.000Z');
  for (const now of [start - 3600001, start - 3600000, start - 3599999, start + 1])
    assert.equal(ui.isRegistrationOpen(episode, now), registrationIsOpen(episode, now));
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
