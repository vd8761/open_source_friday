import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';
export default function ConfirmDialog({title,children,onConfirm,onCancel,confirmLabel='Confirm',cancelLabel='Not now',busy=false,disabled=false,error='',danger=false}) {
  const titleId=useId(),contentId=useId(),panel=useRef(null),cancel=useRef(null);
  useEffect(()=>{const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';cancel.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus?.();};},[]);
  function keydown(e){if(e.key==='Escape'&&!busy){e.preventDefault();onCancel();}if(e.key==='Tab'){const nodes=Array.from(panel.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
  return createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onKeyDown={keydown} onClick={e=>{if(e.target===e.currentTarget&&!busy)onCancel();}}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={contentId} aria-busy={busy} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-2xl">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${danger?'bg-rose-50 text-rose-600':'bg-amber-50 text-amber-600'}`}>{danger?<AlertTriangle aria-hidden="true" className="h-5 w-5"/>:<Info aria-hidden="true" className="h-5 w-5"/>}</div>
      <h2 id={titleId} className="text-xl font-bold text-slate-900">{title}</h2><div id={contentId} className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
      {error&&<p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4"><button ref={cancel} type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{cancelLabel}</button><button type="button" disabled={busy||disabled} onClick={onConfirm} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${danger?'bg-rose-600 hover:bg-rose-700':'bg-dos hover:bg-dos-dark'}`}>{busy?'Please wait…':confirmLabel}</button></div>
    </section>
  </div>,document.body);
}
