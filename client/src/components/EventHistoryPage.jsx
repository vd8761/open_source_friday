import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, downloadFile } from '../utils/adminApi';
import { formatEpisodeDate } from '../utils/episodeTime';
import { rosterCsv } from '../utils/rosterCsv';
import EventActions from './EventActions';
export default function EventHistoryPage({ mode }) {
  const trash=mode==='trash';
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(null),[roster,setRoster]=useState([]),[rosterLoaded,setRosterLoaded]=useState(false); const generation=useRef(0);
  async function load(){const r=await adminApi(trash?'/episode-trash':'/archived-episodes');setRows(r.data);}
  useEffect(()=>{const g=++generation.current;setSelected(null);setRoster([]);setRosterLoaded(false);setRows([]);setError('');setMessage('');setBusy(true);
    adminApi(trash?'/episode-trash':'/archived-episodes').then(r=>{if(g===generation.current)setRows(r.data);}).catch(e=>{if(g===generation.current)setError(e.message);}).finally(()=>{if(g===generation.current)setBusy(false);});
    // This counter invalidates outstanding requests; it is not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return ()=>{generation.current++;};
  },[trash]);
  async function work(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="mx-auto max-w-6xl p-6 space-y-6">
    <Link to="/dashboard" className="font-semibold text-dos">← Dashboard</Link>
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">{trash?'Trash':'Archived events'}</h1><button disabled={busy} className="text-dos underline" onClick={()=>work(load)}>Refresh</button></div>
    <p>{trash?'Deleted upcoming events and disposable tests are stored here with related history. Restore before reusing the episode number, or resolve the number conflict first. Restoration leaves the event inactive, registration closed and campaigns paused.':'Past events are archived without deleting registrations or attendance. View the roster, export it or open Attendance. Past real events cannot be deleted.'}</p>
    {error && <p role="alert" className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}{message && <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {busy && <p role="status">Loading…</p>}{!busy && !rows.length && <p>{trash?'Trash is empty.':'No archived events.'}</p>}
    <div className="space-y-3">{rows.map(e=><article key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Episode {e.episode_number} · {e.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{trash?`Moved to Trash ${new Date(e.deleted_at).toLocaleString()}`:`${formatEpisodeDate(e.event_date,{day:'numeric',month:'short',year:'numeric'})} · ${e.event_time} IST · ${e.registration_count} registrations`}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        {trash?<button disabled={busy} className="text-dos underline" onClick={()=>work(async()=>{await adminApi(`/episode-trash/${e.id}/restore`,{method:'POST'});await load();setMessage(`Episode ${e.episode_number} restored inactive. No notification or campaign was started.`);})}>Restore Episode {e.episode_number}</button>:<>
          <button disabled={busy} className="text-dos underline" onClick={()=>work(async()=>{setSelected(e);setRoster([]);setRosterLoaded(false);const g=generation.current;const r=await adminApi(`/episodes/${e.id}/registrations`);if(g===generation.current){setRoster(r.data);setRosterLoaded(true);}})}>View registrations for Episode {e.episode_number}</button>
          <Link className="text-dos underline" to={`/admin/episodes/${e.id}/attendance`}>Attendance</Link>
          <button disabled={busy} className="text-dos underline" onClick={()=>work(async()=>{await adminApi(`/episodes/${e.id}/unarchive`,{method:'POST'});await load();setMessage(`Episode ${e.episode_number} returned to the dashboard. Registration remains closed.`);})}>Return to dashboard</button>
          <EventActions episode={e} onChanged={async m=>{await load();setMessage(m);}} />
        </>}
      </div>
    </article>)}</div>
    {!trash && selected && <section className="rounded-xl border border-slate-200 p-4 space-y-3"><h2 className="text-lg font-bold">Episode {selected.episode_number} registration records</h2>
      <p>Read-only history. {rosterLoaded ? `${roster.length} saved registrations.` : 'Registration records have not loaded yet.'}</p>
      <button disabled={busy || !rosterLoaded || !roster.length} className="text-dos underline" onClick={()=>downloadFile(new Blob([rosterCsv(roster)],{type:'text/csv'}),`episode-${selected.episode_number}-registrations.csv`)}>Download registrations CSV</button>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Name</th><th>Email</th><th>College</th><th>Registered</th></tr></thead><tbody>{roster.map((r,i)=><tr key={r.id || i} className="border-t border-slate-100"><td className="p-2">{r.full_name}</td><td>{r.email}</td><td>{r.college}</td><td>{r.registered_at?new Date(r.registered_at).toLocaleString():''}</td></tr>)}</tbody></table></div>
    </section>}
  </main>;
}
