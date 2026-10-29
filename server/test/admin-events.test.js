const {initOutreachDB}=require('../outreach-schema');
const {createOutreachRouter}=require('../outreach-routes');
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
  await db.exec('CREATE TABLE admins(id INTEGER PRIMARY KEY)');await initOutreachDB(db);
  const app=express();app.use(express.json());app.set('json replacer',episodeJsonReplacer);app.use('/api/admin',createAdminEventsRouter({pool:db,authenticateToken:(req,res,next)=>req.headers.authorization==='Bearer test'?(req.user={id:1},next()):res.status(401).json({success:false})}));
  app.use('/api/admin',createOutreachRouter({pool:{connect:async()=>({query:(...args)=>db.query(...args),release(){}})},sender:{},zoom:{},authenticateToken:(req,res,next)=>req.headers.authorization==='Bearer test'?(req.user={id:1},next()):res.status(401).json({success:false})}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/admin`;
  async function get(path,auth=true){const r=await fetch(base+path,{headers:auth?{Authorization:'Bearer test'}:{}});return {status:r.status,body:await r.json()};}
  assert.equal((await get('/dashboard-overview',false)).status,401);
  const overview=(await get('/dashboard-overview')).body;assert.deepEqual(overview.totals,{episodes:5,registrations:65});assert.equal(overview.recent.length,5);assert.equal(overview.recent[0].full_name,'Attendee 65');assert.deepEqual(Object.keys(overview.recent[0]).sort(),['college','episode_number','full_name']);
  const upcoming=await get('/events?period=upcoming');assert.equal(upcoming.status,200);assert.equal(upcoming.body.data[0].event_date,'2099-01-01');assert.deepEqual(upcoming.body.data.map(e=>e.id),[3,2]);assert.ok(!JSON.stringify(upcoming.body).includes('example.com'));
  const past=await get('/events?period=past&page_size=1&page=2&sort=number_asc');assert.equal(past.body.total,3);assert.equal(past.body.data.length,1);assert.equal(past.body.data[0].id,4);
  const filtered=(await get('/events?period=past&archive=archived&type=test&mode=Offline&from=2020-02-01&to=2020-02-01&search=Host%20B')).body;assert.equal(filtered.total,1);assert.equal(filtered.data[0].id,5);
  assert.equal((await get('/events?period=past&search=%25')).body.total,0);
  assert.equal((await get('/episodes/1/attendees?whatsapp=not_recorded')).body.total,65);
  await db.exec("UPDATE episode_registrations SET whatsapp_opt_in=TRUE,whatsapp_consent_at=NOW(),whatsapp_notice_version='event-whatsapp-2026-10-29',whatsapp_notice_text='Original notice',whatsapp_consent_number='+91 55565',whatsapp_consent_source='public_registration_form' WHERE id=65; UPDATE episode_registrations SET whatsapp_opt_in=FALSE WHERE id=64");
  assert.equal((await get('/episodes/1/attendees?whatsapp=opted_in')).body.total,1);
  assert.equal((await get('/episodes/1/attendees?whatsapp=declined')).body.total,1);
  assert.equal((await get('/episodes/1/attendees?whatsapp=not_recorded')).body.total,63);
  const withdraw=async(ep,registration,body,auth=true)=>fetch(base+`/episodes/${ep}/attendees/${registration}/whatsapp-withdrawal`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
  assert.equal((await withdraw(1,65,{confirmation:'WITHDRAW WHATSAPP'},false)).status,401);
  assert.equal((await withdraw(1,65,{})).status,400);
  assert.equal((await withdraw(2,65,{confirmation:'WITHDRAW WHATSAPP'})).status,404);
  assert.equal((await withdraw(1,65,{confirmation:'WITHDRAW WHATSAPP'})).status,200);
  const withdrawn=(await get('/episodes/1/attendees?whatsapp=withdrawn')).body;
  assert.equal(withdrawn.total,1);assert.equal(withdrawn.data[0].id,65);
  assert.equal(withdrawn.data[0].whatsapp_opt_in,true);assert.equal(withdrawn.data[0].whatsapp_notice_text,'Original notice');
  assert.equal((await get('/episodes/1/attendees?whatsapp=opted_in')).body.total,0);
  const timestamp=withdrawn.data[0].whatsapp_withdrawn_at;
  assert.equal((await withdraw(1,65,{confirmation:'WITHDRAW WHATSAPP',whatsapp_opt_in:true})).status,200);
  assert.equal((await get('/episodes/1/attendees?whatsapp=withdrawn')).body.data[0].whatsapp_withdrawn_at,timestamp);
  // Legacy and declined records can also be suppressed following an off-platform STOP request.
  assert.equal((await withdraw(1,63,{confirmation:'WITHDRAW WHATSAPP'})).status,200);
  assert.equal((await get('/episodes/1/attendees?whatsapp=withdrawn')).body.total,2);
  assert.equal((await get('/episodes/1/attendees?whatsapp=unknown')).status,400);
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
  let attendance=await get('/episodes/1/attendance?page=1&page_size=10');assert.equal(attendance.status,200);assert.equal(attendance.body.total,65);assert.equal(attendance.body.data.length,10);assert.equal(attendance.body.data[0].registration_id,65);assert.equal(attendance.body.counts.not_synced,65);assert.ok(attendance.body.data.every(r=>r.status==='not_synced'));
  await db.exec("INSERT INTO attendance_syncs(episode_id,meeting_uuid,source,report_complete) VALUES(1,'test-session','zoom_api',FALSE); INSERT INTO attendance_participants(id,episode_id,registration_id,duration_seconds) VALUES('present',1,65,2000),('partial',1,64,1200),('unmatched',1,NULL,300)");
  attendance=await get('/episodes/1/attendance?page=2&page_size=10');assert.equal(attendance.body.data[0].registration_id,55);assert.equal(attendance.body.counts.present,1);assert.equal(attendance.body.counts.partial,1);assert.equal(attendance.body.counts.not_synced,63);assert.equal(attendance.body.unmatched.length,1);assert.equal(attendance.body.registration_options.length,65);
  const partial=(await get('/episodes/1/attendance?page=1&search=Attendee%2064&college=Alpha&status=partial&joined=yes')).body;assert.equal(partial.total,1);assert.equal(partial.data[0].registration_id,64);assert.equal(partial.counts.not_synced,63);
  await db.exec('UPDATE attendance_syncs SET report_complete=TRUE');
  const absent=(await get('/episodes/1/attendance?page=1&status=absent&joined=no')).body;assert.equal(absent.total,63);assert.equal(absent.counts.absent,63);assert.equal(absent.data.length,10);
  for(const path of ['/episodes/1/attendance?page=0','/episodes/1/attendance?page_size=51','/episodes/1/attendance?page=1&status=unknown','/episodes/1/attendance?page=1&joined=maybe'])assert.equal((await get(path)).status,400,path);
  assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM episode_registrations')).rows[0].n,65);
 }finally{if(server)await new Promise(r=>server.close(r));await db.close();}
});
