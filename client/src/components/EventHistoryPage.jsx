import { formatIST } from '../utils/dateTime';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, fieldClass } from '../utils/adminApi';
import ConfirmDialog from './ConfirmDialog';
export default function EventHistoryPage() {
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [purging,setPurging]=useState(null),[phrase,setPhrase]=useState('');
  async function load(){const r=await adminApi('/episode-trash');setRows(r.data);}
  useEffect(()=>{const controller=new AbortController();adminApi('/episode-trash',{signal:controller.signal}).then(r=>setRows(r.data)).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[]);
  async function work(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <main className="mx-auto max-w-6xl p-6 space-y-6"><Link to="/dashboard" className="font-semibold text-dos">← Dashboard</Link>
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Trash</h1><button disabled={busy} className="text-dos underline" onClick={()=>work(load)}>Refresh</button></div>
    <p>Deleted upcoming events and disposable tests are stored here with related history. Restore before reusing the episode number, or resolve the number conflict first. Restoration leaves the event inactive, registration closed and campaigns paused. Completed restored events appear in Past events.</p>
    {error&&<p role="alert" className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}{message&&<p role="status" className="rounded bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {busy&&<p role="status">Loading…</p>}{!busy&&!error&&!rows.length&&<p>Trash is empty.</p>}
    <div className="space-y-3">{rows.map(e=><article key={e.id} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold">Episode {e.episode_number} · {e.title}</h2><p className="mt-1 text-sm text-slate-500">Moved to Trash {formatIST(e.deleted_at)}</p><button disabled={busy} className="mt-3 text-sm text-dos underline" onClick={()=>work(async()=>{await adminApi(`/episode-trash/${e.id}/restore`,{method:'POST'});await load();setMessage(`Episode ${e.episode_number} restored inactive. No notification or campaign was started.`);})}>Restore Episode {e.episode_number}</button><button disabled={busy} className="ml-5 text-sm text-rose-700 underline" onClick={()=>{setPurging(e);setPhrase('');setError('');}}>Delete permanently</button></article>)}</div>
    {purging&&<ConfirmDialog title="Permanently delete this trashed event?" confirmLabel="Delete permanently" danger busy={busy} error={error} disabled={phrase!=='DELETE PERMANENTLY'} onCancel={()=>setPurging(null)} onConfirm={()=>work(async()=>{const r=await adminApi(`/episode-trash/${purging.id}`,{method:'DELETE',body:{confirmation:phrase}});setPurging(null);await load();setMessage(r.message);})}><p>Would you like to permanently remove the saved snapshot of Episode {purging.episode_number} · {purging.title}, including its related records? This cannot be undone. Active events and their records are unaffected.</p><label className="block font-semibold">Type DELETE PERMANENTLY<input className={fieldClass} value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off"/></label></ConfirmDialog>}
  </main>;
}
