import React, { useState } from 'react';
import { adminApi, downloadAdminCsv, fieldClass } from '../utils/adminApi';
import { countries } from '../utils/countries';
import ConfirmDialog from './ConfirmDialog';

// Adds old student records to the master list. Not linked to any episode; nothing is sent to students.
// A match on email or WhatsApp number only fills that student's blank details.
const empty = { full_name: '', email: '', country_code: '+91', whatsapp_number: '', gender: '', college: '', degree: '', department: '', year_of_study: '', is_dos_club_member: '', excited_topic: '' };
const result = (r) => r.status === 'new' ? 'Added a new student.' : r.status === 'update' ? `Matched an existing student and filled: ${r.fills.join(', ').replaceAll('_', ' ')}.` : 'Matched an existing student; nothing new to fill.';

export function AddAttendeeDialog({ onClose, onSaved }) {
  const [form, setForm] = useState(empty), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const select = (k, label, options) => <label className="block text-xs font-semibold text-slate-600">{label}<select className={fieldClass} value={form[k]} onChange={set(k)}><option value="">Not known</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>;
  async function save() {
    setBusy(true); setError('');
    try { const r = await adminApi('/contacts', { method: 'POST', body: form }); setDone(result(r)); onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (done) return <ConfirmDialog title="Attendee saved" confirmLabel="Add another" cancelLabel="Close" onCancel={onClose} onConfirm={() => { setDone(''); setForm(empty); }}><p>{done}</p></ConfirmDialog>;
  return <ConfirmDialog title="Add attendee" confirmLabel="Save attendee" cancelLabel="Cancel" busy={busy} error={error} disabled={!form.full_name.trim() || (!form.email.trim() && !form.whatsapp_number.trim())} onCancel={onClose} onConfirm={save}>
    <p>Adds a student to the master list. Name and an email or WhatsApp number are required. If the student already exists, only their blank details are filled.</p>
    <label className="block text-xs font-semibold text-slate-600">Full name *<input className={fieldClass} value={form.full_name} onChange={set('full_name')} maxLength={255}/></label>
    <label className="block text-xs font-semibold text-slate-600">Email<input type="email" className={fieldClass} value={form.email} onChange={set('email')} maxLength={255}/></label>
    <div className="grid grid-cols-[7rem_1fr] gap-2"><label className="block text-xs font-semibold text-slate-600">Code<select className={fieldClass} value={form.country_code} onChange={set('country_code')}>{countries.map(c => <option key={c.code} value={c.dial}>{c.dial} · {c.name}</option>)}</select></label>
      <label className="block text-xs font-semibold text-slate-600">WhatsApp number<input type="tel" className={fieldClass} value={form.whatsapp_number} onChange={set('whatsapp_number')} maxLength={15}/></label></div>
    <div className="grid gap-2 sm:grid-cols-2">{select('gender', 'Gender', ['Male', 'Female', 'Other'])}{select('is_dos_club_member', 'DOS Club member', ['Yes', 'No'])}</div>
    <label className="block text-xs font-semibold text-slate-600">College<input className={fieldClass} value={form.college} onChange={set('college')} maxLength={255}/></label>
    <div className="grid gap-2 sm:grid-cols-3"><label className="block text-xs font-semibold text-slate-600">Degree<input className={fieldClass} value={form.degree} onChange={set('degree')} maxLength={255}/></label><label className="block text-xs font-semibold text-slate-600">Department<input className={fieldClass} value={form.department} onChange={set('department')} maxLength={255}/></label>{select('year_of_study', 'Year', ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Passed Out'])}</div>
    <label className="block text-xs font-semibold text-slate-600">Topic of interest<input className={fieldClass} value={form.excited_topic} onChange={set('excited_topic')} maxLength={2000}/></label>
  </ConfirmDialog>;
}

const badge = { new: 'bg-emerald-50 text-emerald-800', update: 'bg-sky-50 text-sky-800', unchanged: 'bg-slate-100 text-slate-600', error: 'bg-rose-50 text-rose-800' };
const label = { new: 'New', update: 'Fill blanks', unchanged: 'No change', error: 'Error' };

export function ImportContactsPanel({ onClose, onImported }) {
  const [csv, setCsv] = useState(''), [file, setFile] = useState(''), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(null);
  async function choose(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setError(''); setPreview(null); setDone(null); setFile(f.name);
    const text = await f.text(); setCsv(text); setBusy(true);
    try { setPreview(await adminApi('/contacts/import', { method: 'POST', body: { csv: text } })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try { const r = await adminApi('/contacts/import', { method: 'POST', body: { csv, dry_run: false } }); setDone(r.summary); setPreview(null); onImported(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const s = preview?.summary;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Import students from CSV</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">For old student records. You'll see a preview before anything is saved. Rows matching an existing student only fill that student's blank details; nothing is overwritten and nobody is contacted.</p></div><button className="admin-action" onClick={onClose}>Close</button></div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="admin-primary cursor-pointer">{file ? 'Choose another file' : 'Choose CSV file'}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={choose}/></label>
      <button className="admin-action" onClick={() => downloadAdminCsv('/contacts/import-template', 'student-import-template.csv').catch(e => setError(e.message))}>Download template</button>
      {file && <span className="text-sm text-slate-500">{file}</span>}
    </div>
    <p className="text-xs text-slate-500">Columns: full_name, email, whatsapp_number, country_code, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic. Only a name plus an email or WhatsApp number are required. A missing country code is taken as +91.</p>
    {busy && <p role="status" className="text-sm text-slate-500">Working…</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {done && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Imported: {done.new} new, {done.update} filled in, {done.unchanged} unchanged.</p>}
    {s && <>
      <div className="flex flex-wrap gap-2 text-sm">{['new', 'update', 'unchanged', 'error'].map(k => <span key={k} className={`rounded-full px-3 py-1 font-semibold ${badge[k]}`}>{label[k]}: {s[k]}</span>)}</div>
      <div className="max-h-96 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><caption className="sr-only">Import preview</caption>
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr>{['Row', 'Result', 'Name', 'Email', 'WhatsApp', 'Details'].map(h => <th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead>
        <tbody>{preview.rows.map(r => <tr key={r.line} className="border-t border-slate-100"><td className="p-3 text-slate-500">{r.line}</td><td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge[r.status]}`}>{label[r.status]}</span></td><td className="p-3">{r.name || '—'}</td><td className="p-3">{r.email || '—'}</td><td className="p-3 whitespace-nowrap">{r.whatsapp || '—'}</td>
          <td className="p-3 text-xs">{r.errors ? Object.values(r.errors).join('; ') : r.fills?.length ? `Fills ${r.fills.join(', ').replaceAll('_', ' ')}` : ''}{r.notes?.length ? ` ${r.notes.join('; ')}` : ''}</td></tr>)}</tbody>
      </table></div>
      {s.error > 0 ? <p className="text-sm font-semibold text-rose-800">Fix or remove the {s.error} row(s) with errors in your file, then choose it again.</p>
        : <button className="admin-primary" disabled={busy || !(s.new + s.update)} onClick={confirm}>Import {s.new + s.update} student record(s)</button>}
    </>}
  </section>;
}
