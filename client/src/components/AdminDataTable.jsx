import React, { useState } from 'react';
import { fieldClass } from '../utils/adminApi';
export function TablePager({table}) {
  const {result,loading,page,pageSize,setPage,setPageSize}=table,total=result.total || 0;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm">
    <p aria-live="polite">{loading?'Loading…':total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} of ${total}`:'0 results'}</p>
    <div className="flex flex-wrap items-center gap-3"><label>Rows per page <select aria-label="Rows per page" value={pageSize} disabled={loading} className="rounded border p-1" onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(n=><option key={n}>{n}</option>)}</select></label>
      <button className="rounded border px-3 py-1 disabled:opacity-40" disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(total/pageSize))}</span><button className="rounded border px-3 py-1 disabled:opacity-40" disabled={loading||page*pageSize>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </div>;
}
export function TableFilters({fields,defaults,onApply}) {
  const [draft,setDraft]=useState(defaults);
  return <form className="rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={e=>{e.preventDefault();onApply(draft);}}>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(f=><label key={f.key} className="text-xs font-semibold text-slate-600">{f.label}{f.options?<select className={fieldClass} value={draft[f.key]||''} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}>{f.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<input className={fieldClass} type={f.type||'text'} maxLength={150} placeholder={f.placeholder} value={draft[f.key]||''} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>}</label>)}</div>
    <div className="mt-3 flex gap-4 text-sm"><button className="rounded-lg bg-dos px-4 py-2 font-semibold text-white">Apply filters</button><button type="button" className="underline" onClick={()=>{setDraft(defaults);onApply(defaults);}}>Reset filters</button></div>
  </form>;
}
