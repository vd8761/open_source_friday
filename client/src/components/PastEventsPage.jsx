import { useAdminPage } from '../utils/useAdminPage';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatEpisodeDate } from '../utils/episodeTime';
import { adminApi } from '../utils/adminApi';
import { TableFilters, TablePager } from './AdminDataTable';
import { EventTitle, EventControls } from './EventList';
const defaults={period:'past',sort:'date_desc'};
const fields=[{key:'search',label:'Search events',placeholder:'Episode, title or presenter'},{key:'from',label:'Event date from (IST)',type:'date'},{key:'to',label:'Event date to (IST)',type:'date'},
  {key:'mode',label:'Event mode',options:[['','All modes'],['Online','Online'],['Offline','Offline'],['Hybrid','Hybrid']]},
  {key:'type',label:'Event type',options:[['','All events'],['real','Real events'],['test','Test events']]},
  {key:'archive',label:'Archive status',options:[['','All past events'],['archived','Archived'],['unarchived','Not archived']]},
  {key:'sort',label:'Sort by',options:[['date_desc','Newest event first'],['date_asc','Oldest event first'],['number_desc','Episode number descending'],['number_asc','Episode number ascending'],['title','Title A–Z']]}];
export default function PastEventsPage({archivedOnly=false}) {
  const initial=archivedOnly?{...defaults,archive:'archived'}:defaults;
  const [filters,setFilters]=useState(initial),[message,setMessage]=useState(''),[actionError,setActionError]=useState(''),[working,setWorking]=useState(false);
  const table=useAdminPage('/events',filters);
  async function unarchive(e){setWorking(true);setActionError('');try{await adminApi(`/episodes/${e.id}/unarchive`,{method:'POST'});setMessage(`Episode ${e.episode_number} is no longer archived. Its records remain in Past events; registration stays closed.`);table.refresh();}catch(err){setActionError(err.message);}finally{setWorking(false);}}
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8"><Link to="/dashboard" className="font-semibold text-dos">← Dashboard</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Past events</h1><p className="mt-1 text-sm text-slate-500">Completed workshops, saved registrations and attendance. Past real events cannot be deleted.</p></div><Link to="/admin/trash" className="text-sm text-dos underline">Trash</Link></div>
    <TableFilters fields={fields} defaults={initial} onApply={f=>{table.setPage(1);setFilters(f);}}/>
    {(table.error||actionError)&&<p role="alert" className="rounded bg-rose-50 p-3 text-rose-800">{table.error||actionError} <button className="underline" onClick={table.refresh}>Retry</button></p>}{message&&<p role="status" className="text-emerald-700">{message}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto" aria-busy={table.loading}><table className="w-full text-left text-sm"><caption className="sr-only">Past events matching the selected filters</caption><thead className="bg-slate-50 text-slate-600"><tr>{['Episode','Workshop','Date / time (IST)','Registrations','Status','Actions'].map(c=><th key={c} scope="col" className="p-4">{c}</th>)}</tr></thead><tbody>
    {!table.loading&&!table.error&&table.result.data.map(e=><tr key={e.id} className="border-t border-slate-100"><td className="p-4">#{e.episode_number}{e.is_test&&<p className="text-xs text-amber-700">Test</p>}</td><td className="p-4 min-w-[220px] max-w-md"><EventTitle episode={e}/><p className="mt-1 text-xs text-slate-500">{e.presenter_name} · {e.event_mode}</p></td><td className="p-4 min-w-[170px]">{formatEpisodeDate(e.event_date,{day:'numeric',month:'short',year:'numeric'})}<p className="text-xs text-slate-500">{e.event_time}</p>{!e.ends_at&&<p className="text-amber-700">Check schedule</p>}</td><td className="p-4">{e.registration_count}</td><td className="p-4">{e.archived_at?'Archived':'Completed'}</td><td className="p-4 min-w-[340px]"><EventControls episode={e} onChanged={m=>{setMessage(m);table.refresh();}}/>{e.archived_at&&<button disabled={working} onClick={()=>unarchive(e)} className="mt-2 text-xs text-dos underline">Remove archive label</button>}</td></tr>)}
    {(table.loading||!table.result.data.length||table.error)&&<tr><td colSpan="6" className="p-10 text-center text-slate-500">{table.loading?'Loading past events…':table.error?'Past events could not be loaded.':'No past events match these filters.'}</td></tr>}
    </tbody></table></div><TablePager table={table}/></div>
  </main>;
}
