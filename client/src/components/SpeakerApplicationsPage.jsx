import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAdminPage } from '../utils/useAdminPage';
import { adminApi, downloadAdminCsv, fieldClass } from '../utils/adminApi';
import { formatIST } from '../utils/dateTime';
import { SortHeader, TableFilters, TablePager } from './AdminDataTable';
import { domainLabel, useAdminDomains } from '../utils/domains';
import ConfirmDialog from './ConfirmDialog';

const ROOT = '/admin/speaker-applications';
const STATUSES = [['new', 'New'], ['contacted', 'Contacted'], ['scheduled', 'Scheduled'], ['declined', 'Declined']];
// SQL DATE values must remain calendar dates; never shift them through the browser timezone.
const day = d => new Date(`${String(d).slice(0,10)}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const profileUrl = value => { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

function usePitchActions(onDone) {
  const [dialog,setDialog]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function ask(kind, row) {
    setError('');
    if (kind === 'empty') {
      try { const { ids } = await adminApi('/speaker-applications/trash-ids'); setDialog({kind,ids}); }
      catch(e) { setError(e.message); }
    } else setDialog({kind,row});
  }
  async function confirm() {
    setBusy(true);setError('');
    try {
      const {kind,row,ids}=dialog;
      const path = kind==='empty' ? '/speaker-applications/empty-trash' : `/speaker-applications/${row.id}${kind==='restore'?'/restore':kind==='permanent'?'/permanent':''}`;
      await adminApi(path,{method:['restore','empty'].includes(kind)?'POST':'DELETE', ...(kind==='permanent'?{body:{confirm:'DELETE'}}:kind==='empty'?{body:{confirm:'EMPTY TRASH',ids}}:{})});
      setDialog(null);onDone();
    } catch(e) { setError(e.message); } finally {setBusy(false);}
  }
  return {ask,error,modal:dialog&&<ConfirmDialog title={dialog.kind==='empty'?'Empty enquiry trash?':dialog.kind==='permanent'?'Permanently delete this enquiry?':dialog.kind==='restore'?'Restore this enquiry?':'Move this enquiry to Trash?'}
    danger={dialog.kind!=='restore'} confirmLabel={dialog.kind==='empty'?'Empty trash':dialog.kind==='permanent'?'Delete permanently':dialog.kind==='restore'?'Restore enquiry':'Move to trash'}
    busy={busy} disabled={dialog.kind==='empty'&&!dialog.ids.length} error={error} onCancel={()=>{if(!busy){setDialog(null);setError('');}}} onConfirm={confirm}>
    {dialog.kind==='empty'?<p>Please review carefully. This permanently deletes {dialog.ids.length} trashed enquiries and their contact details. This cannot be undone. Active enquiries are kept.</p>
      :dialog.kind==='permanent'?<p>Please confirm you no longer need “{dialog.row.title}”. Its contact details and enquiry will be permanently deleted. This cannot be undone.</p>
      :dialog.kind==='restore'?<p>Restore “{dialog.row.title}” with its previous status? You can find it using the status filter.</p>
      :<p>Would you like to move “{dialog.row.title}” to Trash? You can restore it later; nothing is permanently deleted.</p>}
    </ConfirmDialog>};
}

export default function SpeakerApplicationsPage({trash=false}) {
  const {domains}=useAdminDomains(),[params,setParams]=useSearchParams(),[error,setError]=useState(''),[exporting,setExporting]=useState(false);
  const defaults={search:'',status:trash?'':'new',domain:'',from:'',to:''};
  const filters=Object.fromEntries(Object.keys(defaults).map(k=>[k,params.get(k)??defaults[k]]));
  const sort=params.get('sort')||'newest';
  const query={...filters,sort,trash:String(trash)};
  const table=useAdminPage('/speaker-applications',query);
  const actions=usePitchActions(table.refresh);
  function apply(next) {table.setPage(1);setParams({...next,sort});}
  async function exportCsv() {
    setExporting(true);setError('');
    try {await downloadAdminCsv(`/speaker-applications/export?${new URLSearchParams(query)}`,trash?'trashed-speaker-enquiries.csv':'speaker-enquiries.csv');}
    catch(e){setError(e.message);}finally{setExporting(false);}
  }
  const sortBy=next=>{table.setPage(1);setParams({...filters,sort:next});};
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
    {trash&&<nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link to={ROOT} className="text-dos">Speaker pitches</Link> / Trash</nav>}
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{trash?'Enquiry trash':'Speaker pitches'}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">{trash?'Restore enquiries or permanently remove them when you no longer need their details.':'Review incoming enquiries. New enquiries are shown by default; open a title to see the full enquiry.'}</p></div>
      <div className="flex flex-wrap gap-2"><button className="admin-action" disabled={exporting||table.loading} onClick={exportCsv}>{exporting?'Exporting…':'Export filtered CSV'}</button><button className="admin-action" disabled={table.loading} onClick={table.refresh}>Refresh</button>{trash?<button className="admin-danger" onClick={()=>actions.ask('empty')}>Empty trash</button>:<Link className="admin-action text-slate-500" to={`${ROOT}/trash`}>Trash</Link>}</div></div>
    <TableFilters key={String(trash)} defaults={defaults} initialValues={filters} fields={[
      {key:'search',label:'Search enquiries',placeholder:'Name, email, mobile, company or session'},
      {key:'status',label:'Status',options:[['','All statuses'],...STATUSES]},
      {key:'domain',label:'Domain',options:[['','All domains'],...domains.map(d=>[d.key,d.label])]},
      {key:'from',label:'Received from (IST)',type:'date'},{key:'to',label:'Received through (IST)',type:'date'},
    ]} onApply={apply}/>
    {(error||table.error||actions.error)&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error||table.error||actions.error}</p>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-busy={table.loading}>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>
        <th scope="col" className="p-4">S.No.</th><SortHeader label="Speaker" values={['name','name_desc']} sort={sort} onSort={sortBy}/><SortHeader label="Session" values={['title','title_desc']} sort={sort} onSort={sortBy}/><SortHeader label="Company" values={['company','company_desc']} sort={sort} onSort={sortBy}/><th scope="col" className="p-4">Domain</th><th scope="col" className="p-4">Status</th><SortHeader label="Received (IST)" values={['oldest','newest']} sort={sort} onSort={sortBy}/><th scope="col" className="p-4">Actions</th>
      </tr></thead><tbody className="divide-y divide-slate-100">{!table.loading&&table.result.data.map((a,i)=><tr key={a.id}>
        <td className="p-4 text-slate-500">{(table.page-1)*table.pageSize+i+1}</td><td className="p-4"><Link className="font-semibold text-dos" to={`${ROOT}/${a.id}`}>{a.name}</Link><a className="mt-1 block text-xs text-slate-500" href={`mailto:${a.email}`}>{a.email}</a>{a.mobile_number&&<a className="mt-1 block text-xs text-slate-500" href={`tel:${a.mobile_number}`}>{a.mobile_number}</a>}</td>
        <td className="min-w-48 p-4"><Link className="text-dos" to={`${ROOT}/${a.id}`}>{a.title}</Link></td><td className="p-4">{a.company||'—'}<span className="mt-1 block text-xs text-slate-500">{a.speaker_role||a.role_company}</span></td><td className="p-4">{domainLabel(domains,a.domain)||'—'}</td><td className="p-4">{STATUSES.find(([v])=>v===a.status)?.[1]}</td><td className="whitespace-nowrap p-4 text-xs text-slate-500">{formatIST(a.created_at)}</td>
        <td className="p-4"><div className="flex flex-wrap gap-2">{trash?<><button className="admin-action" onClick={()=>actions.ask('restore',a)}>Restore</button><button className="admin-danger" onClick={()=>actions.ask('permanent',a)}>Delete permanently</button></>:<button className="admin-danger" onClick={()=>actions.ask('trash',a)}>Trash</button>}</div></td>
      </tr>)}{(table.loading||!table.result.data.length)&&<tr><td colSpan={8} className="p-10 text-center text-slate-500">{table.loading?'Loading enquiries…':table.error?'Unable to load enquiries. Please refresh.':'No enquiries match these filters.'}</td></tr>}</tbody></table></div>
      <TablePager table={table}/>
    </div>{actions.modal}
  </main>;
}

export function SpeakerApplicationPreview() {
  const {id}=useParams(),navigate=useNavigate(),{domains}=useAdminDomains();
  const [application,setApplication]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{const controller=new AbortController();setApplication(null);setError('');adminApi(`/speaker-applications/${id}`,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)setApplication(r.application);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[id]);
  const actions=usePitchActions(()=>navigate(application?.deleted_at?`${ROOT}/trash`:ROOT));
  async function status(next) {setSaving(true);setError('');try{await adminApi(`/speaker-applications/${id}`,{method:'PATCH',body:{status:next}});setApplication(a=>({...a,status:next}));}catch(e){setError(e.message);}finally{setSaving(false);}}
  const a=application,link=a&&profileUrl(a.link);
  const details=a?[
    ['Full name',a.name],['Email',<a key="email" className="text-dos" href={`mailto:${a.email}`}>{a.email}</a>],['Mobile number',a.mobile_number?<a key="mobile" className="text-dos" href={`tel:${a.mobile_number}`}>{a.mobile_number}</a>:'Not provided'],
    ['Role',a.speaker_role||'Not separately recorded'],['Company / organisation',a.company||'Not separately recorded'],
    ...(!a.speaker_role&&!a.company?[['Role & company (original submission)',a.role_company]]:[]),
    ['LinkedIn / submitted profile',link?<a key="profile" className="break-all text-dos" href={link} target="_blank" rel="noopener noreferrer">{a.link} ↗</a>:'Not provided'],
    ['Domain',domainLabel(domains,a.domain)||'Not provided'],['Best time to call (IST)',a.preferred_call_time||'Not provided'],['Preferred Fridays',a.preferred_fridays?.length?a.preferred_fridays.map(day).join(' · '):'Flexible'],
    ['Received',formatIST(a.created_at)],['Last updated',formatIST(a.updated_at)],...(a.deleted_at?[['Moved to trash',formatIST(a.deleted_at)]]:[]),
  ]:[];
  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8"><nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link className="text-dos" to={a?.deleted_at?`${ROOT}/trash`:ROOT}>{a?.deleted_at?'Enquiry trash':'Speaker pitches'}</Link> / Enquiry preview</nav>
    {(error||actions.error)&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error||actions.error}</p>}
    {!a&&!error&&<p>Loading enquiry…</p>}{a&&<>
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Enquiry #{a.id}{a.deleted_at?' · In trash':''}</p><h1 className="text-2xl font-bold">{a.title}</h1></div><div className="flex flex-wrap items-end gap-2">{a.deleted_at?<><button className="admin-action" onClick={()=>actions.ask('restore',a)}>Restore</button><button className="admin-danger" onClick={()=>actions.ask('permanent',a)}>Delete permanently</button></>:<><label className="text-xs font-semibold">Status<select className={fieldClass} value={a.status} disabled={saving} onChange={e=>status(e.target.value)}>{STATUSES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="admin-danger" onClick={()=>actions.ask('trash',a)}>Move to trash</button></>}</div></header>
      <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="mb-5 text-lg font-bold">Speaker & contact details</h2><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{details.map(([label,value])=><div key={label}><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-sm">{value||'Not provided'}</dd></div>)}</dl></section>
      <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="mb-3 text-lg font-bold">What participants will walk away with</h2><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{a.abstract}</p></section>
    </>}{actions.modal}</main>;
}
