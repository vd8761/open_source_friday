import React, { useEffect, useState } from 'react';
import { adminApi, fieldClass } from '../utils/adminApi';
import ConfirmDialog from './ConfirmDialog';

// Adds someone to an event. Search the contact list, or (for a Zoom participant who registered directly in Zoom)
// create a contact from the name and email Zoom reported. A Zoom participant's session is linked in the same step.
export default function AddParticipantDialog({ episode, participant, upcoming, onClose, onSaved }) {
  const [query, setQuery] = useState(participant?.email || participant?.name || ''), [results, setResults] = useState([]), [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null), [mode, setMode] = useState('existing'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [newContact, setNewContact] = useState({ full_name: participant?.name || '', email: participant?.email || '' });
  useEffect(() => {
    if (mode !== 'existing') return;
    const q = query.trim(); if (q.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      adminApi(`/students/search?${new URLSearchParams({ q, episode_id: episode.id })}`, { signal: controller.signal })
        .then(r => setResults(r.students)).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, mode, episode.id]);
  async function save() {
    setBusy(true); setError('');
    const body = { ...(participant ? { participant_id: participant.id } : {}), ...(mode === 'existing' ? { student_id: picked.id } : newContact) };
    try { const r = await adminApi(`/episodes/${episode.id}/participants`, { method: 'POST', body }); onSaved(r.message); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const ready = mode === 'existing' ? Boolean(picked) : newContact.full_name.trim() && newContact.email.trim();
  return <ConfirmDialog title={participant ? `Add ${participant.name || 'this Zoom participant'} as a participant` : `Add participant · Episode ${episode.episode_number}`}
    confirmLabel={participant ? 'Add and link session' : 'Add participant'} cancelLabel="Cancel" busy={busy} error={error} disabled={!ready} onCancel={onClose} onConfirm={save}>
    {participant && <p>Zoom reported <strong>{participant.name || 'an unnamed participant'}</strong> ({participant.email || 'no email'}, {Math.round(participant.duration_seconds / 60)} min) but they are not registered for this event. Add them, and this session counts as their attendance.</p>}
    <div role="radiogroup" aria-label="Who to add" className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" className="accent-dos" checked={mode === 'existing'} onChange={() => setMode('existing')}/>Existing contact</label>
      <label className="flex items-center gap-2"><input type="radio" className="accent-dos" checked={mode === 'new'} onChange={() => setMode('new')}/>New contact</label>
    </div>
    {mode === 'existing' ? <>
      <label className="block">Search contacts<input autoFocus className={fieldClass} value={query} maxLength={150} placeholder="Name, email or phone" onChange={e => { setQuery(e.target.value); setPicked(null); }}/></label>
      <ul className="max-h-64 space-y-1 overflow-y-auto" aria-busy={searching} aria-label="Matching contacts">
        {results.map(s => <li key={s.id}><button type="button" disabled={s.already_registered && !participant} onClick={() => setPicked(s)}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 ${picked?.id === s.id ? 'border-dos bg-dos/10' : 'border-slate-200 hover:bg-slate-50'}`}>
          <span className="font-semibold">{s.full_name || 'No name'}</span>{s.already_registered && <span className="ml-2 text-xs text-slate-500">{participant ? '· registered, will link the session' : '· already registered'}</span>}
          <span className="block text-xs text-slate-500">{[s.email, s.whatsapp_number && `${s.country_code || ''} ${s.whatsapp_number}`, s.college].filter(Boolean).join(' · ')}</span>
        </button></li>)}
        {!searching && query.trim().length >= 2 && !results.length && <li className="text-sm text-slate-500">No contact matches. Choose “New contact” to create one.</li>}
        {query.trim().length < 2 && <li className="text-sm text-slate-500">Type at least 2 letters.</li>}
      </ul>
    </> : <>
      <label className="block">Full name<input className={fieldClass} value={newContact.full_name} maxLength={120} onChange={e => setNewContact({ ...newContact, full_name: e.target.value })}/></label>
      <label className="block">Email<input type="email" className={fieldClass} value={newContact.email} maxLength={254} onChange={e => setNewContact({ ...newContact, email: e.target.value })}/></label>
      <p className="text-xs text-slate-500">If this email already belongs to a contact, that contact is used. Other details can be filled in later from Attendee contacts.</p>
    </>}
    {!participant && <p className="text-xs text-slate-500">{upcoming && episode.zoom_meeting_id && episode.event_mode !== 'Offline' ? 'Zoom will register them and email the join link, as for a normal registration.' : 'This event has ended, so nothing is sent; they are only added to the list.'}</p>}
  </ConfirmDialog>;
}
