import React, { useState } from 'react';
import { adminApi } from '../utils/adminApi';
export default function SampleEpisodeTrash({ episodes, onChanged }) {
  const [trash,setTrash] = useState([]), [open,setOpen] = useState(false), [preview,setPreview] = useState(null);
  const [confirmation,setConfirmation] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  async function work(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function refreshTrash() { setTrash((await adminApi('/episode-trash')).data); }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <button className="font-semibold text-dos" disabled={busy} onClick={() => work(async () => { await refreshTrash(); setOpen(!open); })}>{open ? 'Close sample cleanup' : 'Manage sample episodes and Trash'}</button>
    {error && <p role="alert" className="mt-3 text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-emerald-700">{message}</p>}
    {open && <div className="mt-3 space-y-3">
      <p>Move silent samples to Trash to remove them from the public site and dashboard and free their episode numbers. Student profiles, other episodes, Zoom meetings and Sender records are retained. Related application history is kept in a restricted restore snapshot.</p>
      {episodes.filter(e => e.is_silent).map(e => <div key={e.id} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
        <span>Episode {e.episode_number} · {e.title}</span>
        <button disabled={busy} className="shrink-0 text-rose-700 underline" onClick={() => work(async () => { setPreview(await adminApi(`/episodes/${e.id}/trash-preview`)); setConfirmation(''); })}>Review removal of Episode {e.episode_number}</button>
      </div>)}
      {preview && <div role="dialog" aria-label={`Remove sample episode ${preview.episode.episode_number}`} className="rounded-lg border border-rose-200 p-4 space-y-3">
        <h3 className="font-bold">Move Episode {preview.episode.episode_number} to Trash</h3>
        <p>{preview.episode.title}</p>
        <p>Includes {preview.counts.episode_registrations} registrations, {preview.counts.zoom_registration_jobs} Zoom jobs, {preview.counts.invite_campaigns} invitation campaigns and {preview.counts.attendance_participants} attendance rows. Their application records will leave the active lists and workers. Already submitted emails cannot be recalled.</p>
        <p>Restore is available below. Restoration keeps the sample inactive and campaigns paused; it will not send notifications. Restore before reusing its episode number, or resolve the number conflict first.</p>
        <label className="block">Type TRASH EPISODE {preview.episode.episode_number}<input className="mt-1 block w-full rounded border border-slate-300 p-2" value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label>
        <button disabled={busy || confirmation !== `TRASH EPISODE ${preview.episode.episode_number}`} className="rounded bg-rose-700 px-3 py-2 text-white disabled:opacity-40" onClick={() => work(async () => {
          const n=preview.episode.episode_number;
          await adminApi(`/episodes/${preview.episode.id}/trash`, { method:'POST',body:{confirmation,fingerprint:preview.fingerprint} });
          setPreview(null);setConfirmation('');await onChanged();await refreshTrash();setMessage(`Episode ${n} moved to Trash. Related history is retained for restoration.`);
        })}>Move sample to Trash</button>
        <button disabled={busy} className="ml-3 underline" onClick={()=>setPreview(null)}>Cancel removal</button>
      </div>}
      <h3 className="font-semibold">Trashed sample episodes</h3>
      {!trash.length && <p>No sample episodes in Trash.</p>}
      {trash.map(t=><div key={t.id} className="flex justify-between gap-3 border-t border-slate-100 pt-2"><span>Episode {t.episode_number} · {t.title}</span>
        <button disabled={busy} className="text-dos underline" onClick={()=>work(async()=>{ await adminApi(`/episode-trash/${t.id}/restore`,{method:'POST'});await onChanged();await refreshTrash();setMessage(`Episode ${t.episode_number} restored inactive. No campaign or notification was started.`); })}>Restore Episode {t.episode_number}</button>
      </div>)}
    </div>}
  </section>;
}
