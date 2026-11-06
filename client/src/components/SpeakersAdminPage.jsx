import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';
import PhotoCropper from './PhotoCropper';
import { addDomain, domainLabel, domainOptions, useAdminDomains } from '../utils/domains';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const empty = { name: '', honorific: '', designation: '', company: '', bio: '', linkedin_url: '', domains: [], is_published: true };

function SpeakerForm({ speaker, domains, reloadDomains, onSaved, onCancel }) {
  const [form, setForm] = useState(speaker ? { ...empty, ...Object.fromEntries(Object.entries(speaker).map(([k, v]) => [k, v ?? ''])), domains: speaker.domains || [] } : empty);
  const [photo, setPhoto] = useState(undefined), [cropSrc, setCropSrc] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleDomain = (d) => setForm({ ...form, domains: form.domains.includes(d) ? form.domains.filter(x => x !== d) : [...form.domains, d] });
  const [newDomain, setNewDomain] = useState(null), [domainError, setDomainError] = useState('');
  // A new domain is saved straight away and ticked for this speaker; it is also listed under Account > Domains.
  async function createDomain() {
    setDomainError('');
    try { const d = await addDomain(newDomain); await reloadDomains(); setForm(f => ({ ...f, domains: [...f.domains, d.key] })); setNewDomain(null); }
    catch (err) { setDomainError(err.message); }
  }
  function choose(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader(); reader.addEventListener('load', () => setCropSrc(reader.result)); reader.readAsDataURL(file);
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    // Omitting photo_url on edit keeps the stored photo; every page that shows this speaker reads it from here.
    const body = { name: form.name, honorific: form.honorific, designation: form.designation, company: form.company, bio: form.bio, linkedin_url: form.linkedin_url, domains: form.domains, is_published: form.is_published, ...(photo !== undefined ? { photo_url: photo } : {}) };
    try { await adminApi(speaker ? `/speakers/${speaker.id}` : '/speakers', { method: speaker ? 'PUT' : 'POST', body }); onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const preview = photo || (speaker?.has_photo && speaker.is_published ? `${API_URL}/api/speakers/${speaker.id}/photo?v=${new Date(speaker.updated_at).getTime()}` : null);
  return <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-bold">{speaker ? `Edit ${speaker.name}` : 'New speaker'}</h2>
    <div className="flex flex-wrap items-center gap-4">
      {preview ? <img src={preview} alt="" className="h-20 w-20 rounded-full object-cover"/> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">{speaker?.has_photo ? 'Hidden' : 'No photo'}</span>}
      <label className="admin-action cursor-pointer">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choose}/></label>
      {preview && <button type="button" className="admin-danger" onClick={() => setPhoto(null)}>Remove photo</button>}
    </div>
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      <label className="block text-xs font-semibold text-slate-600">Honorific<input className={fieldClass} value={form.honorific} onChange={set('honorific')} placeholder="Mr., Dr." maxLength={20}/></label>
      <label className="block text-xs font-semibold text-slate-600">Name *<input className={fieldClass} value={form.name} onChange={set('name')} required maxLength={120}/></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-slate-600">Designation<input className={fieldClass} value={form.designation} onChange={set('designation')} maxLength={160}/></label>
      <label className="block text-xs font-semibold text-slate-600">Company<input className={fieldClass} value={form.company} onChange={set('company')} maxLength={160}/></label>
    </div>
    <label className="block text-xs font-semibold text-slate-600">Bio <span className="font-normal text-slate-500">({form.bio.length}/1200)</span><textarea className={fieldClass} rows={4} value={form.bio} onChange={set('bio')} maxLength={1200}/></label>
    <label className="block text-xs font-semibold text-slate-600">LinkedIn URL<input type="url" className={fieldClass} value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…"/></label>
    <fieldset><legend className="text-xs font-semibold text-slate-600">Domains</legend><div className="mt-2 flex flex-wrap items-center gap-2">
      {domainOptions(domains, form.domains).map(d => <label key={d.key} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${form.domains.includes(d.key) ? 'border-dos bg-dos/10 font-semibold text-dos' : 'border-slate-300'}`}><input type="checkbox" className="accent-dos" checked={form.domains.includes(d.key)} onChange={() => toggleDomain(d.key)}/>{d.label}</label>)}
      {newDomain === null
        ? <button type="button" className="admin-action" onClick={() => setNewDomain('')}>+ Add domain</button>
        : <span className="inline-flex flex-wrap items-center gap-2"><input aria-label="New domain name" autoFocus className={`${fieldClass} !mt-0 w-56`} value={newDomain} maxLength={40} placeholder="e.g. Data & Analytics" onChange={e => setNewDomain(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newDomain.trim()) createDomain(); } if (e.key === 'Escape') setNewDomain(null); }}/><button type="button" className="admin-primary" disabled={!newDomain.trim()} onClick={createDomain}>Add</button><button type="button" className="admin-action" onClick={() => { setNewDomain(null); setDomainError(''); }}>Cancel</button></span>}
    </div>{domainError && <p role="alert" className="mt-2 text-xs text-rose-700">{domainError}</p>}</fieldset>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dos" checked={form.is_published} onChange={set('is_published')}/>Show on the public website</label>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save speaker'}</button><button type="button" className="admin-action" onClick={onCancel} disabled={busy}>Cancel</button></div>
    {cropSrc && <PhotoCropper src={cropSrc} onCancel={() => setCropSrc(null)} onDone={(img) => { setPhoto(img); setCropSrc(null); }}/>}
  </form>;
}

export default function SpeakersAdminPage() {
  const { domains, reload: reloadDomains } = useAdminDomains();
  const [speakers, setSpeakers] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [editing, setEditing] = useState(null), [notice, setNotice] = useState('');
  const load = useCallback(() => { setLoading(true); adminApi('/speakers').then(r => setSpeakers(r.speakers)).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  useEffect(load, [load]);
  const saved = () => { setNotice(editing === 'new' ? 'Speaker added.' : 'Speaker updated. Every page that shows this speaker now uses the new details.'); setEditing(null); load(); };
  const current = editing && editing !== 'new' ? speakers.find(s => s.id === editing) : null;
  // Starred speakers are shown first, in random order, on the home page.
  async function toggleFeatured(s) {
    setSpeakers(list => list.map(x => x.id === s.id ? { ...x, is_featured: !s.is_featured } : x));
    try { await adminApi(`/speakers/${s.id}/featured`, { method: 'PUT', body: { is_featured: !s.is_featured } }); }
    catch (e) { setError(e.message); load(); }
  }
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Speakers</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">One record per speaker. A change here, including the photo, updates the home page, episodes, speakers page and registration panel. Speakers are never deleted; hide them from the website instead. Star a speaker to show them first (in random order) on the home page.</p></div><button className="admin-primary" onClick={() => { setNotice(''); setEditing('new'); }}>New speaker</button></div>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {editing && <SpeakerForm key={editing} speaker={current} domains={domains} reloadDomains={reloadDomains} onSaved={saved} onCancel={() => setEditing(null)}/>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-busy={loading}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Speakers</caption>
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Photo', 'Name', 'Role', 'Domains', 'Website', ''].map(h => <th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead>
      <tbody>{speakers.map(s => <tr key={s.id} className="border-t border-slate-100">
        <td className="p-4">{s.has_photo && s.is_published ? <img src={`${API_URL}/api/speakers/${s.id}/photo?v=${new Date(s.updated_at).getTime()}`} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover"/> : <span className="text-xs text-slate-500">{s.has_photo ? 'Saved' : '—'}</span>}</td>
        <td className="p-4 font-semibold"><span className="inline-flex items-center gap-2"><button type="button" aria-pressed={s.is_featured} aria-label={`${s.is_featured ? 'Remove' : 'Mark'} ${s.name} as featured`} title={s.is_featured ? 'Featured on the home page. Click to remove.' : 'Feature on the home page'} onClick={() => toggleFeatured(s)} className={`text-xl leading-none ${s.is_featured ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}>{s.is_featured ? '★' : '☆'}</button>{[s.honorific, s.name].filter(Boolean).join(' ')}</span></td>
        <td className="p-4">{[s.designation, s.company].filter(Boolean).join(', ') || '—'}</td>
        <td className="p-4">{s.domains.map(d => domainLabel(domains, d)).join(', ') || '—'}</td>
        <td className="p-4">{s.is_published ? 'Shown' : 'Hidden'}</td>
        <td className="p-4 text-right"><button className="admin-action" onClick={() => { setNotice(''); setEditing(s.id); window.scrollTo(0, 0); }}>Edit</button></td>
      </tr>)}
      {(loading || !speakers.length) && <tr><td colSpan="6" className="p-10 text-center text-slate-500">{loading ? 'Loading speakers…' : 'No speakers yet.'}</td></tr>}</tbody>
    </table></div></div>
  </main>;
}
