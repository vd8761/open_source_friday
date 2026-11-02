import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';
import { formatIST } from '../utils/dateTime';
import { DOMAIN_OPTIONS } from '../utils/episodeV2';
import ConfirmDialog from './ConfirmDialog';

const empty = { text: '', episode_id: '', speaker_id: '', domain: '', is_tip_of_week: false, published: false };

// Tips appear on the website and app only once published. Marking a tip of the week replaces the previous one.
export default function TipsAdminPage() {
  const [tips, setTips] = useState([]), [episodes, setEpisodes] = useState([]), [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(null);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adminApi('/tips'), adminApi('/speakers'), fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/v2/episodes`).then(r => r.json())])
      .then(([t, s, e]) => { setTips(t.tips); setSpeakers(s.speakers); setEpisodes(e.episodes || []); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    const body = { text: form.text, episode_id: form.episode_id || null, speaker_id: form.speaker_id || null, domain: form.domain || null, is_tip_of_week: form.is_tip_of_week,
      published_at: form.published ? (form.published_at || new Date().toISOString()) : null };
    try { await adminApi(form.id ? `/tips/${form.id}` : '/tips', { method: form.id ? 'PUT' : 'POST', body }); setForm(null); load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await adminApi(`/tips/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const edit = (t) => setForm({ id: t.id, text: t.text, episode_id: t.episode_id ? String(t.episode_id) : '', speaker_id: t.speaker_id ? String(t.speaker_id) : '', domain: t.domain || '', is_tip_of_week: t.is_tip_of_week, published: Boolean(t.published_at), published_at: t.published_at });
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Tips</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Short takeaways from episodes. Only published tips are shown on the website and in the app.</p></div><button className="admin-primary" onClick={() => setForm({ ...empty })}>New tip</button></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {form && <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{form.id ? 'Edit tip' : 'New tip'}</h2>
      <label className="block text-xs font-semibold text-slate-600">Tip * <span className="font-normal text-slate-500">({form.text.length}/500)</span><textarea className={fieldClass} rows={3} required maxLength={500} value={form.text} onChange={set('text')}/></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-600">From episode<select className={fieldClass} value={form.episode_id} onChange={set('episode_id')}><option value="">None</option>{episodes.map(e => <option key={e.id} value={e.id}>EP {e.episode_number} · {e.title}</option>)}</select></label>
        <label className="block text-xs font-semibold text-slate-600">Speaker<select className={fieldClass} value={form.speaker_id} onChange={set('speaker_id')}><option value="">None</option>{speakers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block text-xs font-semibold text-slate-600">Domain<select className={fieldClass} value={form.domain} onChange={set('domain')}><option value="">None</option>{DOMAIN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dos" checked={form.published} onChange={set('published')}/>Published</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-dos" checked={form.is_tip_of_week} onChange={set('is_tip_of_week')}/>Tip of the week (replaces the current one)</label>
      <div className="flex flex-wrap gap-2"><button className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save tip'}</button><button type="button" className="admin-action" onClick={() => setForm(null)} disabled={busy}>Cancel</button></div>
    </form>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-busy={loading}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Tips</caption>
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Tip', 'Episode', 'Speaker', 'Status', ''].map(h => <th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead>
      <tbody>{tips.map(t => <tr key={t.id} className="border-t border-slate-100">
        <td className="max-w-md p-4">{t.text}{t.is_tip_of_week && <span className="ml-2 rounded-full bg-dos/10 px-2 py-0.5 text-xs font-bold text-dos">Tip of the week</span>}</td>
        <td className="p-4 whitespace-nowrap">{t.episode_number ? `EP ${t.episode_number}` : '—'}</td>
        <td className="p-4">{t.speaker_name || '—'}</td>
        <td className="p-4 whitespace-nowrap">{t.published_at ? `Published ${formatIST(t.published_at)}` : 'Draft'}</td>
        <td className="p-4 text-right whitespace-nowrap"><button className="admin-action" onClick={() => edit(t)}>Edit</button> <button className="admin-danger" onClick={() => setDeleting(t)}>Delete</button></td>
      </tr>)}
      {(loading || !tips.length) && <tr><td colSpan="5" className="p-10 text-center text-slate-500">{loading ? 'Loading tips…' : 'No tips yet.'}</td></tr>}</tbody>
    </table></div></div>
    {deleting && <ConfirmDialog danger title="Delete this tip?" confirmLabel="Delete tip" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove}><p>“{deleting.text}”</p><p>This permanently removes the tip from the website and app.</p></ConfirmDialog>}
  </main>;
}
