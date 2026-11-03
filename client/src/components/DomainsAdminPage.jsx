import React, { useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';
import { addDomain, useAdminDomains } from '../utils/domains';

function DomainRow({ domain, onSaved }) {
  const [label, setLabel] = useState(domain.label), [active, setActive] = useState(domain.is_active), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const changed = label.trim() !== domain.label || active !== domain.is_active;
  async function save() {
    setBusy(true); setError('');
    try { await adminApi(`/domains/${domain.key}`, { method: 'PUT', body: { label, is_active: active } }); onSaved(`${label.trim()} saved.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <tr className="border-t border-slate-100 align-top">
    <td className="p-4"><input aria-label={`Name for ${domain.label}`} className={`${fieldClass} !mt-0`} value={label} maxLength={40} onChange={e => setLabel(e.target.value)}/>{error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}</td>
    <td className="p-4 pt-6 whitespace-nowrap text-slate-600">{domain.speaker_count} speaker{domain.speaker_count === 1 ? '' : 's'} · {domain.episode_count} episode{domain.episode_count === 1 ? '' : 's'}</td>
    <td className="p-4 pt-6"><label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" className="h-4 w-4 accent-dos" checked={active} onChange={e => setActive(e.target.checked)}/>Shown</label></td>
    <td className="p-4 text-right"><button className="admin-action" disabled={!changed || !label.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></td>
  </tr>;
}

// Domains used for speakers, episodes, tips and speaker pitches. Hidden domains stay on existing records
// but are no longer offered on the website or in new pitches.
export default function DomainsAdminPage() {
  const { domains, reload, error } = useAdminDomains();
  const [label, setLabel] = useState(''), [busy, setBusy] = useState(false), [addError, setAddError] = useState(''), [notice, setNotice] = useState('');
  async function add(e) {
    e.preventDefault(); setBusy(true); setAddError(''); setNotice('');
    try { const d = await addDomain(label); setLabel(''); setNotice(`${d.label} added.`); reload(); }
    catch (err) { setAddError(err.message); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
    <div><h1 className="text-2xl font-bold">Domains</h1><p className="mt-2 text-sm text-slate-500">Topics used to group speakers and episodes on the website. Renaming a domain updates it everywhere. Uncheck “Shown” to hide a domain from the website filters and the Speak at OSF form; records that already use it keep it.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <label className="block min-w-[14rem] flex-1 text-xs font-semibold text-slate-600">New domain<input className={fieldClass} value={label} maxLength={40} required placeholder="e.g. Data & Analytics" onChange={e => setLabel(e.target.value)}/></label>
      <button className="admin-primary" disabled={busy || !label.trim()}>{busy ? 'Adding…' : 'Add domain'}</button>
      {addError && <p role="alert" className="w-full text-sm text-rose-700">{addError}</p>}
    </form>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Domains</caption>
      <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Name', 'Used by', 'Website', ''].map(h => <th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead>
      <tbody>{domains.map(d => <DomainRow key={`${d.key}:${d.label}:${d.is_active}`} domain={d} onSaved={(msg) => { setNotice(msg); reload(); }}/>)}</tbody>
    </table></div></div>
  </main>;
}
