import React, { useState } from 'react';
import { fieldClass } from '../utils/adminApi';
export function TablePager({table,compact=false}) {
  const {result,loading,error,page,pageSize,setPage,setPageSize}=table,total=result.total || 0;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  if(compact && total<=pageSize) return null;
  const numbers=[...new Set([1,page-1,page,page+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
  const buttonClass="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-dos hover:text-dos focus-visible:outline-2 focus-visible:outline-dos disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300";
  return <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
    <p className="text-xs text-slate-500" aria-live="polite">{loading?'Loading…':error?'Results unavailable':total?<>Showing <strong className="font-semibold text-slate-700">{(page-1)*pageSize+1}–{Math.min(page*pageSize,total)}</strong> of <strong className="font-semibold text-slate-700">{total}</strong></>:'No results'}</p>
    <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-500">Per page<select aria-label="Rows per page" value={pageSize} disabled={loading} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-dos focus:ring-2 focus:ring-dos/10 disabled:opacity-50" onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[10,25,50].map(n=><option key={n}>{n}</option>)}</select></label>
      {pages>1&&<nav aria-label="Table pagination" className="flex flex-wrap items-center gap-1"><button className={buttonClass} disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button>
        {numbers.map((n,i)=><React.Fragment key={n}>{i>0&&n-numbers[i-1]>1&&<span className="px-1 text-xs text-slate-400">…</span>}<button aria-label={`Go to page ${n}`} aria-current={n===page?'page':undefined} disabled={loading} className={`${buttonClass} ${n===page?'!border-dos !bg-dos !text-white':''}`} onClick={()=>setPage(n)}>{n}</button></React.Fragment>)}
        <button className={buttonClass} disabled={loading||page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></nav>}
    </div>
  </footer>;
}
export function TableFilters({fields,defaults,onApply}) {
  const [draft,setDraft]=useState(defaults);
  const first=fields[0],advanced=fields.slice(1),count=advanced.filter(f=>Boolean(draft[f.key])).length;
  function field(f){return <label key={f.key} className="block text-xs font-semibold text-slate-600">{f.label}{f.options?<select className={fieldClass} value={draft[f.key]||''} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}>{f.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<input className={fieldClass} type={f.type||'text'} maxLength={150} placeholder={f.placeholder} value={draft[f.key]||''} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>}</label>;}
  return <form className="rounded-xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={e=>{e.preventDefault();onApply(draft);}}>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1">{first&&field(first)}</div><button className="admin-primary">Apply filters</button><button type="button" className="admin-action" onClick={()=>{setDraft(defaults);onApply(defaults);}}>Reset filters</button></div>
    {advanced.length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">More filters{count>0?` · ${count} selected`:''}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{advanced.map(field)}</div></details>}
  </form>;
}

export function SortHeader({label,values,sort,onSort,className='p-4'}) {
  const active=values?.includes(sort),descending=active&&sort===values[1];
  return <th scope="col" className={className} aria-sort={active?(descending?'descending':'ascending'):undefined}>{values&&onSort?<button type="button" className="inline-flex items-center gap-2 text-left font-inherit hover:text-dos" onClick={()=>onSort(active&&!descending?values[1]:values[0])} title={`Sort by ${label}`}><span>{label}</span><span aria-hidden="true" className={active?'text-dos':'text-slate-400'}>{active?(descending?'↓':'↑'):'↕'}</span></button>:label}</th>;
}
