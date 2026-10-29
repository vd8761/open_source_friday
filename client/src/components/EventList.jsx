import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { formatEpisodeDate, eventPolicy } from '../utils/episodeTime';
import EventActions from './EventActions';
export function EventTitle({episode}) {
  return <a href={`/register/episode-${episode.episode_number}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-dos hover:underline inline-flex items-start gap-1" title="Open public event in a new tab">{episode.title}<ExternalLink aria-hidden="true" className="mt-1 h-3 w-3 shrink-0"/><span className="sr-only"> (opens in a new tab)</span></a>;
}
export function EventControls({episode,onChanged}) {
  const actionClass="inline-flex min-h-9 items-center justify-center whitespace-nowrap border-r border-slate-200 px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-100 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-dos last:border-r-0";
  return <div role="group" aria-label={`Episode ${episode.episode_number} actions`} className="inline-flex w-fit max-w-full flex-nowrap rounded-lg border border-slate-200 bg-white shadow-sm">
    <Link className={`${actionClass} text-dos`} to={`/admin/episodes/${episode.id}/attendees`}>Attendees</Link>
    <Link className={`${actionClass} text-slate-700`} to={`/admin/episodes/${episode.id}/attendance`}>Attendance</Link>
    {!episode.archived_at&&<Link aria-label={`Edit Episode ${episode.episode_number}`} className={`${actionClass} text-slate-700`} to={`/admin/episodes/edit/${episode.id}`}>Edit</Link>}
    <EventActions episode={episode} onChanged={onChanged} buttonClass={actionClass}/>
  </div>;
}
export function UpcomingEvents({rows,onChanged,onToggle}) {
  return <div className="divide-y divide-slate-100">{rows.map(e=><article key={e.id} className="p-5 space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1 font-bold">Episode {e.episode_number}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{eventPolicy(e).upcoming?'Upcoming':'Live now'}</span>{e.is_test&&<span className="text-amber-700">Test event</span>}{e.is_silent&&<span className="text-slate-500">Silent</span>}{e.is_active===false&&<span className="text-amber-700">Inactive</span>}</div>
    <h3><EventTitle episode={e}/></h3><p className="text-sm text-slate-600">{formatEpisodeDate(e.event_date,{day:'numeric',month:'short',year:'numeric'})} · {e.event_time} IST · {e.event_mode}</p><p className="text-sm text-slate-600">{e.presenter_name} · <strong>{e.registration_count}</strong> registered</p>
    <div className="flex flex-wrap items-center justify-between gap-3"><EventControls episode={e} onChanged={onChanged}/><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={e.is_registration_open!==false} onChange={()=>onToggle(e.id,e.is_registration_open!==false)}/>Registration enabled</label></div>
  </article>)}</div>;
}
