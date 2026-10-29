import React, { useState } from 'react';
import { adminApi } from '../utils/adminApi';
import { eventPolicy } from '../utils/episodeTime';
import ConfirmDialog from './ConfirmDialog';
export default function EventActions({episode,onChanged,buttonClass='rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold'}) {
  const policy=eventPolicy(episode);
  const [dialog,setDialog]=useState(null),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function work(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function reviewDelete(){await work(async()=>{const preview=await adminApi(`/episodes/${episode.id}/trash-preview`);setDialog({type:'delete',preview});setConfirmation('');});}
  const deleting=dialog?.type==='delete',phrase=`${deleting?'DELETE':'ARCHIVE'} EPISODE ${episode.episode_number}`;
  async function confirm(){await work(async()=>{await adminApi(`/episodes/${episode.id}/${deleting?'trash':'archive'}`,{method:'POST',body:deleting?{confirmation:`TRASH EPISODE ${episode.episode_number}`,fingerprint:dialog.preview.fingerprint}:{confirmation}});setDialog(null);await onChanged(deleting?'Event moved to Trash. Restore is available from Menu → Trash.':'Event archived. Registration records are retained.');});}
  return <>
    {policy.can_delete&&<button aria-label={`${policy.is_test?'Trash test':'Delete'} Episode ${episode.episode_number}`} className={`${buttonClass} text-rose-700 hover:bg-rose-50`} disabled={busy} onClick={reviewDelete}>{policy.is_test?'Trash test':'Delete'}</button>}
    {policy.can_archive&&<button className={`${buttonClass} text-amber-800 hover:bg-amber-50`} disabled={busy} onClick={()=>{setDialog({type:'archive'});setConfirmation('');setError('');}}>Archive</button>}
    {dialog&&<ConfirmDialog title={`${deleting?'Move':'Archive'} Episode ${episode.episode_number}${deleting?' to Trash':''}?`} confirmLabel={deleting?'Move to Trash':'Archive event'} cancelLabel="Keep event" danger={deleting} busy={busy} disabled={confirmation!==phrase} error={error} onConfirm={confirm} onCancel={()=>{setDialog(null);setError('');}}>
      <p>Would you like to {deleting?'move':'archive'} <strong>{episode.title}</strong>{deleting?' in Trash':' in Past events'}?</p>
      {deleting?<><p>Please review the linked records: {dialog.preview.counts.episode_registrations} registrations and {dialog.preview.counts.invite_campaigns} invitation campaigns. A restore snapshot is retained, and the episode number becomes available again.</p><p>Zoom meetings and Sender campaigns are not cancelled, and sent emails cannot be recalled. Please coordinate any participant communication separately.</p></>:<p>All registrations and attendance will remain available in Past events. The episode number stays reserved. No notification will be sent.</p>}
      <label className="block font-semibold text-slate-700">Please type {phrase} to confirm<input className="mt-2 block w-full rounded-lg border border-slate-300 p-2 font-normal" value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>
    </ConfirmDialog>}
    {!dialog&&error&&<span role="alert" className="text-sm text-rose-700">{error}</span>}
  </>;
}
