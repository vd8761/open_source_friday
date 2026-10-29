const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {createAdminEventsRouter,initAdminEvents,eventEndSql}=require('../admin-events');
const {episodeEnd,episodeJsonReplacer}=require('../episode-time');
test('admin event tables page and filter on the server and keep dashboard recent data minimal',async()=>{
 const db=new PGlite();let server;
 try{
  await db.exec(`CREATE TABLE episodes(id INTEGER PRIMARY KEY,episode_number INTEGER,title TEXT,event_date TIMESTAMP,event_time TEXT,presenter_name TEXT,event_mode TEXT,is_active BOOLEAN DEFAULT TRUE,is_registration_open BOOLEAN DEFAULT TRUE,is_test BOOLEAN DEFAULT FALSE,is_silent BOOLEAN DEFAULT FALSE,archived_at TIMESTAMPTZ,zoom_meeting_id TEXT);
  CREATE TABLE students(id INTEGER PRIMARY KEY,full_name TEXT,email TEXT,whatsapp_number TEXT,country_code TEXT,college TEXT,degree TEXT,department TEXT,year_of_study TEXT,gender TEXT,is_dos_club_member TEXT,excited_topic TEXT);
  CREATE TABLE episode_registrations(id INTEGER PRIMARY KEY,episode_id INTEGER REFERENCES episodes(id),student_id INTEGER REFERENCES students(id),registered_at TIMESTAMPTZ);
  CREATE TABLE zoom_registration_jobs(registration_id INTEGER PRIMARY KEY,status TEXT,invitation_status TEXT,meeting_id TEXT,zoom_registered_at TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ,last_error TEXT);
  INSERT INTO episodes(id,episode_number,title,event_date,event_time,presenter_name,event_mode,zoom_meeting_id) VALUES
  (1,1,'Old workshop','2020-01-01','07:00 PM - 8:00 PM','Host A','Online','12345678901'),
  (2,2,'Next workshop','2099-01-01','10:00 AM - 11:00 AM','Host B','Offline',NULL),
  (3,3,'Earlier workshop','2099-01-01','9:00 AM – 10:00 AM','Host C','Online',NULL),
  (4,4,'Unknown schedule','2020-01-01','invalid','Host C','Online',NULL);
  INSERT INTO episodes(id,episode_number,title,event_date,event_time,presenter_name,event_mode,is_test,archived_at) VALUES(5,5,'Archived test','2020-02-01','19:00 - 20:00','Host B','Offline',TRUE,NOW());
  INSERT INTO students SELECT i,'Attendee '||i,i||'@example.com','555'||i,'+91',CASE WHEN i%2=0 THEN 'Alpha College' ELSE 'Beta College' END,'BE','Engineering','2nd Year','Other',CASE WHEN i%2=0 THEN 'Yes' ELSE 'No' END,'AI' FROM generate_series(1,65) i;
  INSERT INTO episode_registrations SELECT i,1,i,'2020-01-01T20:00:00Z'::timestamptz+i*INTERVAL '1 minute' FROM generate_series(1,65) i;
  INSERT INTO zoom_registration_jobs(registration_id,status,invitation_status) VALUES(1,'registered','failed'),(2,'pending','failed');`);
  await initAdminEvents(db);await initAdminEvents(db);
  const app=express();app.set('json replacer',episodeJsonReplacer);app.use('/api/admin',createAdminEventsRouter({pool:db,authenticateToken:(req,res,next)=>req.headers.authorization==='Bearer test'?next():res.status(401).json({success:false})}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/admin`;
  async function get(path,auth=true){const r=await fetch(base+path,{headers:auth?{Authorization:'Bearer test'}:{}});return {status:r.status,body:await r.json()};}
  assert.equal((await get('/dashboard-overview',false)).status,401);
  const overview=(await get('/dashboard-overview')).body;assert.deepEqual(overview.totals,{episodes:5,registrations:65});assert.equal(overview.recent.length,5);assert.equal(overview.recent[0].full_name,'Attendee 65');assert.deepEqual(Object.keys(overview.recent[0]).sort(),['college','episode_number','full_name']);
  const upcoming=await get('/events?period=upcoming');assert.equal(upcoming.status,200);assert.equal(upcoming.body.data[0].event_date,'2099-01-01');assert.deepEqual(upcoming.body.data.map(e=>e.id),[3,2]);assert.ok(!JSON.stringify(upcoming.body).includes('example.com'));
  const past=await get('/events?period=past&page_size=1&page=2&sort=number_asc');assert.equal(past.body.total,3);assert.equal(past.body.data.length,1);assert.equal(past.body.data[0].id,4);
  const filtered=(await get('/events?period=past&archive=archived&type=test&mode=Offline&from=2020-02-01&to=2020-02-01&search=Host%20B')).body;assert.equal(filtered.total,1);assert.equal(filtered.data[0].id,5);
  assert.equal((await get('/events?period=past&search=%25')).body.total,0);
  const first=(await get('/episodes/1/attendees')).body;assert.equal(first.total,65);assert.equal(first.data.length,10);assert.equal(first.data[0].id,65);
  const next=(await get('/episodes/1/attendees?page=2&page_size=50&sort=oldest')).body;assert.equal(next.data.length,15);assert.equal(next.data[0].id,51);
  const match=(await get('/episodes/1/attendees?college=Alpha&department=engineer&year=2&member=Yes&zoom=failed')).body;assert.equal(match.total,1);assert.equal(match.data[0].id,2);
  const registered=(await get('/episodes/1/attendees?zoom=zoom_managed')).body;assert.equal(registered.total,1);assert.equal(registered.data[0].id,1);assert.equal(registered.data[0].invitation_error,null);
  assert.equal((await get('/episodes/1/attendees?from=2020-01-02&to=2020-01-02')).body.total,65);assert.equal((await get('/episodes/1/attendees?from=2020-01-01&to=2020-01-01')).body.total,0);
  assert.equal((await get('/episodes/2/attendees')).body.total,0);assert.equal((await get('/episodes/999/attendees')).status,404);
  for(const path of ['/events?period=all','/events?period=past&page_size=999','/events?period=past&sort=constructor','/events?period=past&from=2026-02-30','/events?period=past&from=2026-10-30&to=2026-10-01','/episodes/1/attendees?zoom=sent','/episodes/1/attendees?page=0','/episodes/bad/attendees'])assert.equal((await get(path)).status,400,path);
  for(const time of ['7:00 PM - 8:00 PM','07:00 PM – 08:00 PM','19:00 - 20:00','11:00 PM - 11:59 PM','12:00 AM - 12:30 AM','invalid','7:00 PM - 8:00 PM - 9:00 PM']){
   const r=await db.query(`SELECT ${eventEndSql} AS ends FROM (SELECT '2026-10-29'::timestamp AS event_date,$1::text AS event_time) e`,[time]);const ends=r.rows[0].ends;assert.equal(ends?new Date(ends).getTime():null,episodeEnd({event_date:'2026-10-29',event_time:time}),time);
  }
  assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM episode_registrations')).rows[0].n,65);
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();}
});
