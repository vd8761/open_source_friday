import React, { useEffect, useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';

// Club-level numbers come from the parent club, so they are edited here. Episode, speaker and
// repeat-speaker counts are computed from the data and cannot be edited.
export default function SiteSettingsPage() {
  const [stats, setStats] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { adminApi('/site-settings').then(r => setStats(r.settings.club_stats || [])).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const change = (i, key, value) => setStats(stats.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await adminApi('/site-settings/club_stats', { method: 'PUT', body: { value: stats } }); setNotice('Club numbers saved. The website shows them within a minute.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-8">
    <div><h1 className="text-2xl font-bold">Site settings</h1><p className="mt-2 text-sm text-slate-500">Club numbers shown on the home page and the Speak at OSF page. The first one also appears under the home page headline.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-busy={loading}>
      <h2 className="text-lg font-bold">Club numbers</h2>
      {stats.map((s, i) => <div key={i} className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_auto]">
        <label className="block text-xs font-semibold text-slate-600">Value<input className={fieldClass} value={s.value} maxLength={20} required placeholder="6000+" onChange={e => change(i, 'value', e.target.value)}/></label>
        <label className="block text-xs font-semibold text-slate-600">Label<input className={fieldClass} value={s.label} maxLength={40} required placeholder="in the DOS community" onChange={e => change(i, 'label', e.target.value)}/></label>
        <button type="button" className="admin-danger" onClick={() => setStats(stats.filter((_, j) => j !== i))}>Remove</button>
      </div>)}
      {!loading && !stats.length && <p className="text-sm text-slate-500">No club numbers yet. Nothing is shown on the website until you add some.</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className="admin-action" disabled={stats.length >= 8} onClick={() => setStats([...stats, { value: '', label: '' }])}>Add number</button><button className="admin-primary" disabled={busy || loading}>{busy ? 'Saving…' : 'Save club numbers'}</button></div>
    </form>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 sm:p-6"><h2 className="text-lg font-bold text-slate-900">Computed automatically</h2><p className="mt-2">Episodes shipped, upcoming episodes, speakers, returning speakers and per-domain counts are calculated from episodes and speakers. Test events are left out.</p></section>
  </main>;
}
