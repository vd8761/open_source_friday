const express = require('express');
const {studentActivities}=require('./student-activity');
const {pageOptions}=require('./table-query');
const { InputError } = require('./outreach-csv');
const { initWhatsAppConsent, statusSql } = require('./whatsapp-consent');
// Keep the calendar date for legacy TIMESTAMP columns, and interpret times in IST.
const eventClockSql = part => {
  const clock=`btrim(split_part(replace(e.event_time,'–','-'),'-',${part}))`;
  return `CASE WHEN array_length(string_to_array(replace(e.event_time,'–','-'),'-'),1)=2 AND ${clock} ~* '^((0?[1-9]|1[0-2]):[0-5][0-9][[:space:]]*[AP]M|([01]?[0-9]|2[0-3]):[0-5][0-9])$' THEN (e.event_date::date + ${clock}::time) AT TIME ZONE 'Asia/Kolkata' END`;
};
const eventEndSql=eventClockSql(2),eventStartSql=eventClockSql(1);
const eventFields = 'e.id,e.episode_number,e.title,e.event_date,e.event_time,e.presenter_name,e.event_mode,e.is_active,e.is_registration_open,e.is_test,e.is_silent,e.archived_at';
async function initAdminEvents(db) {
  await initWhatsAppConsent(db);
  await db.query('CREATE INDEX IF NOT EXISTS students_email_normalized_idx ON students(LOWER(TRIM(email)))');
  await db.query('CREATE INDEX IF NOT EXISTS er_student_activity_idx ON episode_registrations(student_id,registered_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS er_recent_idx ON episode_registrations(registered_at DESC,id DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS er_episode_recent_idx ON episode_registrations(episode_id,registered_at DESC,id DESC)');
}
function filters(q, kind, episodeId) {
  const values=[], clauses=[];
  const add=(sql,value)=>{values.push(value);clauses.push(sql.replaceAll('?',`$${values.length}`));};
  const text = (key,columns) => {if(q[key]) {if(typeof q[key]!=='string'||q[key].length>150)throw new InputError('Filter is too long.',400);add(`(${columns.map(c=>`${c} ILIKE ? ESCAPE '\\'`).join(' OR ')})`,`%${q[key].trim().replace(/[\\%_]/g,'\\$&')}%`);}};
  const choice=(key,column,options)=>{if(q[key]) {if(!options.includes(q[key]))throw new InputError(`Invalid ${key} filter.`,400);add(`${column}=?`,q[key]);}};
  const dates=(column)=>{for(const [key,op] of [['from','>='],['to','<=']])if(q[key]){
    if(typeof q[key]!=='string'||Number(q[key].slice(0,4))<1||!/^\d{4}-\d{2}-\d{2}$/.test(q[key])||Number.isNaN(Date.parse(q[key]))||new Date(q[key]).toISOString().slice(0,10)!==q[key])throw new InputError('Use valid filter dates.',400);
    add(`${column} ${op} ?::date`,q[key]);
  }if(q.from&&q.to&&q.from>q.to)throw new InputError('Start date must be before end date.',400);};
  if(kind==='events') {
    if(!['upcoming','past'].includes(q.period))throw new InputError('Choose upcoming or past events.',400);
    clauses.push(q.period==='upcoming'?`e.archived_at IS NULL AND ${eventEndSql}>NOW()`:`(${eventEndSql}<=NOW() OR ${eventEndSql} IS NULL)`);
    text('search',['e.title','e.presenter_name','e.episode_number::text']);
    choice('mode','e.event_mode',['Online','Offline','Hybrid']);
    if(q.type){if(!['test','real'].includes(q.type))throw new InputError('Invalid event type.',400);clauses.push(`e.is_test=${q.type==='test'?'TRUE':'FALSE'}`);}
    if(q.archive){if(!['archived','unarchived'].includes(q.archive))throw new InputError('Invalid archive filter.',400);clauses.push(`e.archived_at IS ${q.archive==='archived'?'NOT ':''}NULL`);}
    dates('e.event_date::date');
  } else {
    add('er.episode_id=?',episodeId);text('search',['s.full_name','s.email','s.whatsapp_number']);text('college',['s.college']);text('department',['s.department']);
    choice('member','s.is_dos_club_member',['Yes','No']);choice('year',"CASE WHEN s.year_of_study ~ '^[1-6]' THEN substring(s.year_of_study from '^[1-6]') ELSE s.year_of_study END",['1','2','3','4','5','6','Passed Out']);
    choice('zoom',"CASE WHEN j.status='registered' THEN 'zoom_managed' ELSE COALESCE(j.invitation_status,'not_sent') END",['zoom_managed','pending','rate_limited','failed','not_sent']);
    choice('whatsapp',`(${statusSql})`,['opted_in','declined','not_recorded','withdrawn']);
    dates("(er.registered_at::timestamptz AT TIME ZONE 'Asia/Kolkata')::date");
  }
  return {values,where:clauses.join(' AND ')};
}
const attendeeFrom='FROM episode_registrations er JOIN students s ON s.id=er.student_id JOIN episodes e ON e.id=er.episode_id LEFT JOIN zoom_registration_jobs j ON j.registration_id=er.id';
function createAdminEventsRouter({pool,authenticateToken}) {
  const router=express.Router();router.use(authenticateToken);
  const route=fn=>async(req,res)=>{try{res.json({success:true,...await fn(req)});}catch(e){res.status(e instanceof InputError?e.status:500).json({success:false,error:e instanceof InputError?e.message:'Unable to load event data. Please try again.'});}};
  router.get('/dashboard-overview',route(async()=>{
    const [totals,recent]=await Promise.all([
      pool.query('SELECT (SELECT COUNT(*)::integer FROM episodes) AS episodes,(SELECT COUNT(*)::integer FROM episode_registrations) AS registrations'),
      pool.query('SELECT e.episode_number,s.id AS student_id,s.full_name,s.college FROM episode_registrations er JOIN episodes e ON e.id=er.episode_id JOIN students s ON s.id=er.student_id ORDER BY er.registered_at DESC,er.id DESC LIMIT 5')
    ]);return {totals:totals.rows[0],recent:recent.rows};
  }));
  router.get('/events',route(async req=>{
    const {page,page_size}=pageOptions(req.query),{where,values}=filters(req.query,'events');
    const orders={date_desc:'e.event_date DESC,e.id DESC',date_asc:`${eventStartSql} ASC NULLS LAST,e.id ASC`,number_desc:'e.episode_number DESC',number_asc:'e.episode_number ASC',title:'LOWER(e.title) ASC,e.id ASC',title_desc:'LOWER(e.title) DESC,e.id DESC',registrations_asc:'registration_count ASC,e.id ASC',registrations_desc:'registration_count DESC,e.id DESC'};
    const sort=req.query.sort || (req.query.period==='upcoming'?'date_asc':'date_desc');if(!Object.hasOwn(orders,sort))throw new InputError('Invalid sort order.',400);
    const count=await pool.query(`SELECT COUNT(*)::integer AS total FROM episodes e WHERE ${where}`,values);
    const rows=await pool.query(`SELECT ${eventFields},(${eventEndSql}) AS ends_at,(SELECT COUNT(*)::integer FROM episode_registrations er WHERE er.episode_id=e.id) AS registration_count FROM episodes e WHERE ${where} ORDER BY ${orders[sort]} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,page_size,(page-1)*page_size]);
    return {data:rows.rows,total:count.rows[0].total,page,page_size};
  }));
  router.get('/contacts',route(async req=>{
    const {page,page_size}=pageOptions(req.query),values=[],clauses=[];
    const contains=(key,columns)=>{if(!req.query[key])return;if(typeof req.query[key]!=='string'||req.query[key].length>150)throw new InputError('Please use a search up to 150 characters.',400);values.push('%'+req.query[key].trim().replace(/[\\%_]/g,'\\$&')+'%');clauses.push('('+columns.map(c=>`${c} ILIKE $${values.length}`).join(' OR ')+')');};
    contains('search',['s.full_name','s.email',"CONCAT(s.country_code,s.whatsapp_number)"]);contains('college',['s.college']);
    if(req.query.episode_id){if(!/^[1-9]\d{0,9}$/.test(req.query.episode_id)||Number(req.query.episode_id)>2147483647)throw new InputError('Invalid event filter.',400);values.push(req.query.episode_id);clauses.push(`EXISTS(SELECT 1 FROM episode_registrations selected WHERE selected.student_id=s.id AND selected.episode_id=$${values.length})`);}
    const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
    const from='FROM students s JOIN episode_registrations er ON er.student_id=s.id JOIN episodes e ON e.id=er.episode_id';
    const orders={newest:'last_registered_at DESC,s.id DESC',oldest:'last_registered_at ASC,s.id ASC',name:'LOWER(s.full_name) ASC,s.id ASC',name_desc:'LOWER(s.full_name) DESC,s.id DESC',email:'LOWER(s.email) ASC,s.id ASC',email_desc:'LOWER(s.email) DESC,s.id DESC',college:'LOWER(s.college) ASC NULLS LAST,s.id ASC',college_desc:'LOWER(s.college) DESC NULLS LAST,s.id DESC'};
    const sort=req.query.sort||'newest';if(!Object.hasOwn(orders,sort))throw new InputError('Invalid contact sort.',400);
    const count=await pool.query(`SELECT COUNT(DISTINCT s.id)::integer AS total ${from} ${where}`,values);
    const rows=await pool.query(`SELECT s.id,s.full_name,s.email,s.country_code,s.whatsapp_number,s.college,s.year_of_study,s.department,
      COUNT(DISTINCT er.id)::integer AS registration_count,MAX(er.registered_at::timestamptz) AS last_registered_at,
      array_agg(DISTINCT e.episode_number ORDER BY e.episode_number) AS episode_numbers
      ${from} ${where} GROUP BY s.id ORDER BY ${orders[sort]} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,page_size,(page-1)*page_size]);
    const events=await pool.query('SELECT id,episode_number,title FROM episodes WHERE EXISTS(SELECT 1 FROM episode_registrations er WHERE er.episode_id=episodes.id) ORDER BY episode_number DESC');
    const activities=await studentActivities(pool,rows.rows.map(r=>r.id));
    return {data:rows.rows.map(r=>({...r,activity_summary:activities.get(r.id).summary,latest_attended:activities.get(r.id).latest_attended})),total:count.rows[0].total,page,page_size,events:events.rows};
  }));
  router.get('/contacts/:studentId',route(async req=>{
    if(!/^[1-9]\d{0,9}$/.test(req.params.studentId)||Number(req.params.studentId)>2147483647)throw new InputError('Invalid student.',400);
    const id=Number(req.params.studentId);
    const student=(await pool.query(`SELECT s.id,s.full_name,s.email,s.country_code,s.whatsapp_number,s.college,s.degree,s.department,s.year_of_study,s.is_dos_club_member FROM students s WHERE s.id=$1 AND EXISTS(SELECT 1 FROM episode_registrations er WHERE er.student_id=s.id)`,[id])).rows[0];
    if(!student)throw new InputError('Registered student not found.',404);
    return {student,...(await studentActivities(pool,[id])).get(id)};
  }));
  router.get('/episodes/:episodeId/attendees',route(async req=>{
    if(!/^[1-9]\d{0,9}$/.test(req.params.episodeId)||Number(req.params.episodeId)>2147483647)throw new InputError('Invalid episode.',400);
    const {page,page_size}=pageOptions(req.query),{where,values}=filters(req.query,'attendees',req.params.episodeId);
    const orders={newest:'er.registered_at DESC,er.id DESC',oldest:'er.registered_at ASC,er.id ASC',name:'LOWER(s.full_name) ASC,er.id ASC',name_desc:'LOWER(s.full_name) DESC,er.id DESC',college:'LOWER(s.college) ASC,s.full_name ASC,er.id ASC',college_desc:'LOWER(s.college) DESC,s.full_name DESC,er.id DESC',email:'LOWER(s.email) ASC,er.id ASC',email_desc:'LOWER(s.email) DESC,er.id DESC',zoom:'j.zoom_registered_at ASC NULLS LAST,er.id ASC',zoom_desc:'j.zoom_registered_at DESC NULLS LAST,er.id DESC'};
    const sort=req.query.sort||'newest';if(!Object.hasOwn(orders,sort))throw new InputError('Invalid sort order.',400);
    const ep=await pool.query(`SELECT ${eventFields} FROM episodes e WHERE e.id=$1`,[req.params.episodeId]);if(!ep.rows.length)throw new InputError('Episode not found.',404);
    const count=await pool.query(`SELECT COUNT(*)::integer AS total ${attendeeFrom} WHERE ${where}`,values);
    const rows=await pool.query(`SELECT s.id,s.full_name,s.email,s.whatsapp_number,s.country_code,s.college,s.degree,s.department,s.year_of_study,s.gender,s.is_dos_club_member,s.excited_topic,er.registered_at::timestamptz AS registered_at,er.id AS registration_id,
      er.whatsapp_opt_in,er.whatsapp_consent_at,er.whatsapp_notice_version,er.whatsapp_notice_text,er.whatsapp_consent_source,
      er.whatsapp_consent_number,er.whatsapp_withdrawn_at,(${statusSql}) AS whatsapp_status,
      e.zoom_meeting_id IS NOT NULL AND e.event_mode='Online' AS zoom_enabled,
      CASE WHEN j.status='registered' THEN 'zoom_managed' ELSE COALESCE(j.invitation_status,'not_sent') END AS invitation_status,
      j.meeting_id AS zoom_meeting_id,j.zoom_registered_at,j.next_attempt_at AS zoom_next_attempt_at,CASE WHEN j.status='registered' THEN NULL ELSE j.last_error END AS invitation_error
      ${attendeeFrom} WHERE ${where} ORDER BY ${orders[sort]} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,page_size,(page-1)*page_size]);
    return {episode:ep.rows[0],data:rows.rows,total:count.rows[0].total,page,page_size};
  }));
  router.post('/episodes/:episodeId/attendees/:registrationId/whatsapp-withdrawal',route(async req=>{
    for (const value of [req.params.episodeId,req.params.registrationId])
      if(!/^[1-9]\d{0,9}$/.test(value)||Number(value)>2147483647)throw new InputError('Invalid registration.',400);
    if(req.body?.confirmation!=='WITHDRAW WHATSAPP')throw new InputError('Please confirm the WhatsApp withdrawal.',400);
    // Withdraw-only: administrators cannot grant consent on a participant's behalf.
    const result=await pool.query(`UPDATE episode_registrations SET whatsapp_withdrawn_at=COALESCE(whatsapp_withdrawn_at,NOW()),
      whatsapp_withdrawn_by=COALESCE(whatsapp_withdrawn_by,$3),
      whatsapp_withdrawal_source=COALESCE(whatsapp_withdrawal_source,'admin_recorded_request')
      WHERE id=$1 AND episode_id=$2 RETURNING id`,[req.params.registrationId,req.params.episodeId,req.user.id]);
    if(!result.rows.length)throw new InputError('Registration not found.',404);
    return {message:'WhatsApp updates stopped for this event. Registration and Zoom access are unchanged.'};
  }));
  return router;
}
module.exports={initAdminEvents,createAdminEventsRouter,eventEndSql};
