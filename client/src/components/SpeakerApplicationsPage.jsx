import React, { useState } from 'react';
import { useAdminPage } from '../utils/useAdminPage';
import { adminApi, fieldClass } from '../utils/adminApi';
import { formatIST } from '../utils/dateTime';
import { TablePager } from './AdminDataTable';
import { domainLabel, useAdminDomains } from '../utils/domains';

const STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['scheduled', 'Scheduled'], ['declined', 'Declined']];
const day = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// "Speak at OSF" pitches. No emails are sent from here; reply from the club inbox.
export default function SpeakerApplicationsPage() {
  const { domains } = useAdminDomains();
  const [status, setStatus] = useState(''), [saving, setSaving] = useState(null), [error, setError] = useState('');
  const table = useAdminPage('/speaker-applications', status ? { status } : {});
  async function update(id, next) {
    setSaving(id); setError('');
    try { await adminApi(`/speaker-applications/${id}`, { method: 'PATCH', body: { status: next } }); table.refresh(); }
    catch (e) { setError(e.message); } finally { setSaving(null); }
  }
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Speaker pitches</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Sessions pitched through the Speak at OSF form. Nothing is emailed automatically; reply from info@descienceosclub.com and update the status here.</p></div>
      <div className="flex flex-wrap items-end gap-2"><label className="block text-xs font-semibold text-slate-600">Status<select className={fieldClass} value={status} onChange={e => { table.setPage(1); setStatus(e.target.value); }}><option value="">All</option>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><button className="admin-action" disabled={table.loading} onClick={table.refresh}>Refresh</button></div></div>
    {(error || table.error) && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error || table.error}</p>}
    <div className="space-y-3" aria-busy={table.loading}>
      {table.result.data.map(a => <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1"><h2 className="text-lg font-bold">{a.title}</h2>
            <p className="text-sm text-slate-600"><strong className="text-slate-900">{a.name}</strong> · {a.role_company} · <a className="text-dos" href={`mailto:${a.email}`}>{a.email}</a>{a.link && <> · <a className="text-dos" href={a.link} target="_blank" rel="noopener noreferrer">Submitted profile ↗</a></>}</p>
            <p className="text-sm text-slate-600">Mobile: {a.mobile_number ? <a className="text-dos" href={`tel:${a.mobile_number}`}>{a.mobile_number}</a> : 'Not provided'} · Best time to call: {a.preferred_call_time ? `${a.preferred_call_time} IST` : 'Not provided'}</p>
            <p className="text-xs text-slate-500">Received {formatIST(a.created_at)}{a.domain && ` · ${domainLabel(domains, a.domain)}`}{a.preferred_fridays.length > 0 && ` · Prefers ${a.preferred_fridays.map(day).join(', ')}`}</p></div>
          <label className="block text-xs font-semibold text-slate-600">Status<select className={fieldClass} value={a.status} disabled={saving === a.id} onChange={e => update(a.id, e.target.value)}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{a.abstract}</p>
      </article>)}
      {(table.loading || !table.result.data.length) && <p className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{table.loading ? 'Loading pitches…' : 'No pitches yet.'}</p>}
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><TablePager table={table} compact/></div>
  </main>;
}
