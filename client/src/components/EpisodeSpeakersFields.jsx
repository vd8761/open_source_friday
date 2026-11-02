import React, { useEffect, useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';
import { DOMAIN_OPTIONS } from '../utils/episodeV2';

export default function EpisodeSpeakersFields({ value, onChange, onPresenter }) {
  const [speakers, setSpeakers] = useState([]), [error, setError] = useState(''), [pick, setPick] = useState('');
  useEffect(() => { adminApi('/speakers').then(r => setSpeakers(r.speakers)).catch(e => setError(e.message)); }, []);
  const byId = (id) => speakers.find(s => s.id === id);
  const setIds = (ids) => {
    onChange({ ...value, speaker_ids: ids });
    // Keep the v1.0 presenter fields in step with the chosen speakers (the server writes the same values).
    const chosen = ids.map(byId).filter(Boolean);
    if (chosen.length) onPresenter({ presenter_name: chosen.map(s => [s.honorific, s.name].filter(Boolean).join(' ')).join(' & '), presenter_designation: [chosen[0].designation, chosen[0].company].filter(Boolean).join(', ') });
  };
  const move = (i, d) => { const ids = [...value.speaker_ids]; [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; setIds(ids); };
  const agenda = value.agenda.length ? value.agenda : [''];
  const setAgenda = (list) => onChange({ ...value, agenda: list });
  return <section className="mb-8 space-y-5 rounded-2xl border border-dos/30 bg-dos/5 p-5">
    <div><h3 className="text-base font-bold text-slate-900">Speakers and website details</h3><p className="mt-1 text-xs text-slate-500">Pick speakers from Admin → Speakers so their photo and role stay the same on every page. The first speaker leads. Choosing speakers fills the presenter fields below.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="space-y-2">
      {value.speaker_ids.map((id, i) => <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <span className="font-mono text-xs font-bold text-dos">{i === 0 ? 'LEAD' : `CO ${i}`}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold">{byId(id)?.name || `Speaker ${id}`}<span className="font-normal text-slate-500">{byId(id) && ` · ${[byId(id).designation, byId(id).company].filter(Boolean).join(', ')}`}</span></span>
        <button type="button" className="admin-action" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
        <button type="button" className="admin-action" disabled={i === value.speaker_ids.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
        <button type="button" className="admin-danger" onClick={() => setIds(value.speaker_ids.filter(x => x !== id))}>Remove</button>
      </div>)}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-60 flex-1 text-xs font-semibold text-slate-600">Add speaker<select className={fieldClass} value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose…</option>{speakers.filter(s => !value.speaker_ids.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}{s.company ? ` · ${s.company}` : ''}</option>)}</select></label>
        <button type="button" className="admin-action" disabled={!pick || value.speaker_ids.length >= 8} onClick={() => { setIds([...value.speaker_ids, Number(pick)]); setPick(''); }}>Add</button>
        <a href="/admin/speakers" target="_blank" rel="noopener noreferrer" className="admin-action">New speaker ↗</a>
      </div>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block text-xs font-semibold text-slate-600">Domain<select className={fieldClass} value={value.domain} onChange={e => onChange({ ...value, domain: e.target.value })}><option value="">Not set</option>{DOMAIN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="block text-xs font-semibold text-slate-600">One-line blurb for cards <span className="font-normal text-slate-500">({value.short_blurb.length}/200)</span><input className={fieldClass} maxLength={200} value={value.short_blurb} onChange={e => onChange({ ...value, short_blurb: e.target.value })}/></label>
    </div>
    <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-600">What we'll cover <span className="font-normal text-slate-500">(up to 12 points)</span></legend>
      {agenda.map((item, i) => <div key={i} className="flex gap-2"><input className={fieldClass + ' !mt-0'} maxLength={200} value={item} placeholder={`Point ${i + 1}`} onChange={e => setAgenda(agenda.map((a, j) => (j === i ? e.target.value : a)))}/>{agenda.length > 1 && <button type="button" className="admin-danger" onClick={() => setAgenda(agenda.filter((_, j) => j !== i))}>Remove</button>}</div>)}
      <button type="button" className="admin-action" disabled={agenda.length >= 12} onClick={() => setAgenda([...agenda, ''])}>Add point</button>
    </fieldset>
  </section>;
}
