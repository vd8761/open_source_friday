const { combinedSeconds, attendanceStatus } = require('./attendance');
const { episodeStart } = require('./episode-time');
const { statusSql } = require('./whatsapp-consent');
async function studentActivities(db, ids) {
  if (!ids.length) return new Map();
  const registrations=(await db.query(`SELECT er.id AS registration_id,er.student_id,er.registered_at::timestamptz AS registered_at,
    e.id AS episode_id,e.episode_number,e.title,e.event_date::date AS event_date,e.event_time,e.event_mode,
    a.report_complete,a.threshold_minutes,a.source AS attendance_source,o.status AS override_status,
    j.status AS zoom_status,(${statusSql}) AS whatsapp_status
    FROM episode_registrations er JOIN students s ON s.id=er.student_id JOIN episodes e ON e.id=er.episode_id
    LEFT JOIN attendance_syncs a ON a.episode_id=e.id LEFT JOIN attendance_overrides o ON o.registration_id=er.id
    LEFT JOIN zoom_registration_jobs j ON j.registration_id=er.id
    WHERE er.student_id=ANY($1::integer[]) ORDER BY e.event_date DESC,e.id DESC,er.id DESC`,[ids])).rows;
  const participants=(await db.query(`SELECT p.* FROM attendance_participants p JOIN episode_registrations er ON er.id=p.registration_id WHERE er.student_id=ANY($1::integer[])`,[ids])).rows;
  const sessions=new Map();for(const p of participants){if(!sessions.has(p.registration_id))sessions.set(p.registration_id,[]);sessions.get(p.registration_id).push(p);}
  const result=new Map(ids.map(id=>[id,{events:[],summary:{registrations:0,attended:0,present:0,partial:0,absent:0,not_synced:0,zoom_minutes:0},latest_attended:null,latest_registration:null}]));
  for(const r of registrations){
    const rows=sessions.get(r.registration_id)||[],seconds=combinedSeconds(rows);
    const status=attendanceStatus({overrideStatus:r.override_status,sessionCount:rows.length,seconds,thresholdMinutes:r.threshold_minutes||30,reportComplete:r.report_complete});
    const event={...r,attendance_status:status,minutes:Math.round(seconds/60*10)/10,joined:rows.length>0,duration_estimated:rows.some(p=>!p.join_time||!p.leave_time),manually_adjusted:Boolean(r.override_status)};
    const activity=result.get(r.student_id);activity.events.push(event);activity.summary.registrations++;activity.summary[status]++;
    activity.summary.zoom_minutes+=event.minutes;
    if(['present','partial'].includes(status)){activity.summary.attended++;if(!activity.latest_attended)activity.latest_attended=event;}
    if(!activity.latest_registration||new Date(r.registered_at)>new Date(activity.latest_registration.registered_at))activity.latest_registration=event;
  }
  for(const activity of result.values()){activity.events.sort((a,b)=>(episodeStart(b)??new Date(b.event_date).getTime())-(episodeStart(a)??new Date(a.event_date).getTime())||b.episode_id-a.episode_id);activity.latest_attended=activity.events.find(e=>['present','partial'].includes(e.attendance_status))||null;activity.summary.zoom_minutes=Math.round(activity.summary.zoom_minutes*10)/10;}
  return result;
}
module.exports={studentActivities};
