import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { adminApi } from '../utils/adminApi';
import { eventPolicy } from '../utils/episodeTime';
export default function EventActions({ episode, onChanged }) {
  const policy=eventPolicy(episode);
  const [dialog,setDialog]=useState(null),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function work(fn) {setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function reviewDelete(){await work(async()=>{const p=await adminApi(`/episodes/${episode.id}/trash-preview`);setDialog({type:'delete',preview:p});setConfirmation('');});}
  const deleting=dialog?.type==='delete';
  const phrase=`${deleting?'DELETE':'ARCHIVE'} EPISODE ${episode.episode_number}`;
  return <>
    {policy.can_delete && <button aria-label={`${policy.is_test?'Trash test':'Delete'} Episode ${episode.episode_number}`} title={policy.is_test?'Trash test event':'Delete event'} className="rounded-lg bg-rose-50 p-2 text-rose-700" disabled={busy} onClick={reviewDelete}><Trash2 aria-hidden="true" className="h-4 w-4"/></button>}
    {policy.can_archive && <button className="rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-800" disabled={busy} onClick={()=>{setDialog({type:'archive'});setConfirmation('');setError('');}}>Archive</button>}
    {dialog && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-left whitespace-normal">
      <div role="dialog" aria-modal="true" aria-label={`${deleting?'Delete':'Archive'} Episode ${episode.episode_number}`} className="w-full max-w-lg rounded-2xl bg-white p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold">{deleting?'Delete':'Archive'} Episode {episode.episode_number}</h3><p>{episode.title}</p>
        {deleting ? <><p>This moves the event to the separate Trash menu. The preview includes {dialog.preview.counts.episode_registrations} registrations and {dialog.preview.counts.invite_campaigns} invitation campaigns. Records are retained in a restore snapshot. Its episode number becomes available again.</p><p>Zoom meetings and Sender campaigns are not cancelled. Already sent emails cannot be recalled; coordinate participant communication separately.</p></> : <p>Archive this completed event. Find it in Menu → Past events using the Archive status filter. All registrations and attendance remain available there, and totals are preserved. The episode number stays reserved. This does not delete records or send notifications.</p>}
        <label className="block text-sm font-semibold">Type {phrase}<input className="mt-2 block w-full rounded-lg border border-slate-300 p-2" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" /></label>
        {error && <p role="alert" className="text-rose-700">{error}</p>}
        <div className="flex gap-3"><button className="rounded-lg bg-dos px-4 py-2 text-white disabled:opacity-40" disabled={busy || confirmation!==phrase} onClick={()=>work(async()=>{
          await adminApi(`/episodes/${episode.id}/${deleting?'trash':'archive'}`,{method:'POST',body:deleting?{confirmation:`TRASH EPISODE ${episode.episode_number}`,fingerprint:dialog.preview.fingerprint}:{confirmation}});
          setDialog(null);await onChanged(deleting?'Event moved to Trash. Restore is available from Menu → Trash.':'Event archived. Registration records are retained.');
        })}>{busy?'Saving…':deleting?'Move to Trash':'Archive event'}</button><button disabled={busy} className="underline" onClick={()=>{setDialog(null);setError('');}}>Cancel</button></div>
      </div>
    </div>}
    {!dialog && error && <span role="alert" className="text-sm text-rose-700">{error}</span>}
  </>;
}
