import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi, fieldClass } from '../utils/adminApi';
import { AdminBreadcrumb, EventTabs } from './AdminPageChrome';
import PhotoCropper from './PhotoCropper';
import SearchSelect from './SearchSelect';

const AWARDS = [
  ['first_to_register', 'Suggested from the earliest registration. Registrations you added from the admin are not counted.'],
  ['stayed_longest', 'Suggested from the Zoom attendance report (longest combined time on the call).'],
  ['most_interactive', 'Zoom does not report chat or questions, so choose this student yourself.'],
];
const blank = { registration_id: '', display_name: '', college: '', stat: '', consent_confirmed: false, is_published: false };

function AwardCard({ episodeId, award, help, name, saved, suggestion, attendees, onChanged }) {
  const fromSaved = saved ? { ...blank, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v ?? ''])), registration_id: saved.registration_id ? String(saved.registration_id) : '' } : blank;
  const [form, setForm] = useState(fromSaved), [photo, setPhoto] = useState(undefined), [cropSrc, setCropSrc] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const pickStudent = (registrationId) => {
    const a = attendees.find((x) => String(x.registration_id) === String(registrationId));
    setForm({ ...form, registration_id: registrationId, display_name: a?.full_name || form.display_name, college: a?.college || '' });
  };
  const useSuggestion = () => setForm({ ...form, registration_id: String(suggestion.registration_id), display_name: suggestion.display_name, college: suggestion.college || '', stat: suggestion.stat });
  function choose(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader(); reader.addEventListener('load', () => setCropSrc(reader.result)); reader.readAsDataURL(file);
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    // Omitting photo_url keeps the stored photo.
    const body = { ...form, is_published: form.consent_confirmed && form.is_published, ...(photo !== undefined ? { photo_url: photo } : {}) };
    try { await adminApi(`/episodes/${episodeId}/hall-of-fame/${award}`, { method: 'PUT', body }); setNotice(body.is_published ? 'Saved. It shows on the home page within a minute.' : 'Saved. Not shown on the website yet.'); onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await adminApi(`/episodes/${episodeId}/hall-of-fame/${award}`, { method: 'DELETE' }); onChanged(); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  const preview = photo === undefined ? saved?.photo_url : photo;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-bold">{name}</h2><p className="text-xs text-slate-500">{help}</p></div>
      {saved && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${saved.is_published ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{saved.is_published ? 'On the website' : 'Not shown'}</span>}</div>
    {suggestion && String(suggestion.registration_id) !== form.registration_id && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Suggested: <strong>{suggestion.display_name}</strong>{suggestion.college ? `, ${suggestion.college}` : ''} · {suggestion.stat} <button type="button" className="ml-2 font-semibold text-dos" onClick={useSuggestion}>Use this</button></p>}
    <label className="block text-xs font-semibold text-slate-600">Student<div className="mt-1"><SearchSelect ariaLabel={`Student for ${name}`} placeholder="Search attendees by name or email" value={form.registration_id} onChange={pickStudent}
      options={attendees.map((a) => ({ value: a.registration_id, label: a.full_name, detail: [a.email, a.college].filter(Boolean).join(' · ') }))}/></div></label>
    <div className="flex flex-wrap items-center gap-4">
      {preview ? <img src={preview} alt="" className="h-20 w-20 rounded-2xl object-cover"/> : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-xs text-slate-500">No photo</span>}
      <label className="admin-action cursor-pointer">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choose}/></label>
      {preview && <button type="button" className="admin-danger" onClick={() => setPhoto(null)}>Remove photo</button>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-semibold text-slate-600">Name shown *<input className={fieldClass} value={form.display_name} maxLength={120} onChange={set('display_name')}/></label>
      <label className="block text-xs font-semibold text-slate-600">College<input className={fieldClass} value={form.college} maxLength={160} onChange={set('college')}/></label>
    </div>
    <label className="block text-xs font-semibold text-slate-600">Highlight<input className={fieldClass} value={form.stat} maxLength={80} placeholder={award === 'most_interactive' ? 'e.g. Asked 4 questions in the Q&A' : ''} onChange={set('stat')}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-dos" checked={form.consent_confirmed} onChange={(e) => setForm({ ...form, consent_confirmed: e.target.checked, is_published: e.target.checked && form.is_published })}/>The student agreed to be featured, with this photo, on the website</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dos" disabled={!form.consent_confirmed} checked={form.is_published} onChange={set('is_published')}/>Show on the home page</label>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className="admin-primary" disabled={busy || !form.display_name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>{saved && <button type="button" className="admin-danger" disabled={busy} onClick={remove}>Remove award</button>}</div>
    {cropSrc && <PhotoCropper src={cropSrc} title="Crop student photo" round={false} onCancel={() => setCropSrc(null)} onDone={(img) => { setPhoto(img); setCropSrc(null); }}/>}
  </section>;
}

// Student Hall of Fame for one episode. The home page shows the latest episode with a published award.
export default function HallOfFamePage() {
  const { id } = useParams();
  const [data, setData] = useState(null), [episode, setEpisode] = useState(null), [error, setError] = useState(''), [version, setVersion] = useState(0);
  const load = useCallback(() => adminApi(`/episodes/${id}/hall-of-fame`).then((r) => { setData(r); setVersion((v) => v + 1); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); adminApi(`/episodes/${id}`).then((r) => setEpisode(r.episode)).catch(() => {}); }, [id, load]);
  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
    <AdminBreadcrumb items={[['Past events', '/admin/past-events'], ['Hall of fame']]}/>
    <div><h1 className="text-2xl font-bold">{episode ? `Episode ${episode.episode_number} · Hall of fame` : 'Hall of fame'}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Three students are celebrated for each episode. Pick each student, add their photo and confirm they agreed to be featured. The home page shows the most recent episode that has at least one award switched on.</p></div>
    <EventTabs id={id}/>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
    {data && AWARDS.map(([award, help]) => <AwardCard key={`${award}:${version}`} episodeId={id} award={award} help={help} name={data.award_names[award]}
      saved={data.awards.find((a) => a.award === award)} suggestion={data.suggestions[award]} attendees={data.attendees} onChanged={load}/>)}
  </main>;
}
