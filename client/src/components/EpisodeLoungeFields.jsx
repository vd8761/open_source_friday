import React from 'react';
import { fieldClass } from '../utils/adminApi';

// "After the episode": the public recap, plus what only attendees marked present can open (links only).
export default function EpisodeLoungeFields({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const materials = value.materials.length ? value.materials : [{ title: '', url: '' }];
  const setMaterial = (i, k, v) => onChange({ ...value, materials: materials.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
    <div><h3 className="text-base font-bold text-slate-900">Public recap</h3><p className="mt-1 text-xs text-slate-500">Shown to everyone on the episode page after it ends. Plain text; blank lines start a new paragraph.</p></div>
    <label className="block text-xs font-semibold text-slate-600">What happened <span className="font-normal text-slate-500">({value.recap.length}/4000)</span><textarea className={fieldClass} rows={4} maxLength={4000} value={value.recap} onChange={set('recap')}/></label>
    <div className="border-t border-slate-200 pt-4"><h3 className="text-base font-bold text-slate-900">Attendee lounge</h3><p className="mt-1 text-xs text-slate-500">Only students marked present for this episode can open this, after confirming their email with a one-time code. Use share links from Google Drive, YouTube (unlisted), GitHub and similar; no file uploads.</p></div>
    <label className="block text-xs font-semibold text-slate-600">Speaker notes and takeaways <span className="font-normal text-slate-500">({value.lounge_notes.length}/20000)</span><textarea className={fieldClass} rows={5} maxLength={20000} value={value.lounge_notes} onChange={set('lounge_notes')}/></label>
    <label className="block text-xs font-semibold text-slate-600">Recording link<input type="url" className={fieldClass} value={value.recording_url} onChange={set('recording_url')} placeholder="https://youtu.be/…"/></label>
    <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-600">Materials <span className="font-normal text-slate-500">(up to 20 links)</span></legend>
      {materials.map((m, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input className={fieldClass + ' !mt-0'} maxLength={120} placeholder="Title, e.g. Slides" value={m.title} onChange={e => setMaterial(i, 'title', e.target.value)}/>
        <input type="url" className={fieldClass + ' !mt-0'} placeholder="https://drive.google.com/…" value={m.url} onChange={e => setMaterial(i, 'url', e.target.value)}/>
        {materials.length > 1 ? <button type="button" className="admin-danger" onClick={() => onChange({ ...value, materials: materials.filter((_, j) => j !== i) })}>Remove</button> : <span/>}
      </div>)}
      <button type="button" className="admin-action" disabled={materials.length >= 20} onClick={() => onChange({ ...value, materials: [...materials, { title: '', url: '' }] })}>Add link</button>
    </fieldset>
  </section>;
}
