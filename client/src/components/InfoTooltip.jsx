import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
export default function InfoTooltip({label,children,error=false}) {
  const id=useId(),anchor=useRef(null),[open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0});
  useEffect(()=>{
    if(!open) return;
    const place=()=>{const r=anchor.current.getBoundingClientRect();const width=Math.min(320,window.innerWidth-24);setPosition({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:r.bottom+8,width,above:window.innerHeight-r.bottom<180});};
    const close=e=>{if(e.type==='keydown'&&e.key!=='Escape')return;setOpen(false);};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',close,true);window.addEventListener('keydown',close);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',close,true);window.removeEventListener('keydown',close);};
  },[open]);
  return <><button ref={anchor} type="button" aria-label={label} aria-describedby={open?id:undefined} aria-expanded={open} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-dos ${error?'text-rose-600 hover:bg-rose-50':'text-slate-400 hover:bg-slate-100 hover:text-dos'}`}><Info aria-hidden="true" className="h-4 w-4"/></button>
    {open&&createPortal(<div role="tooltip" id={id} className={`pointer-events-none fixed z-[100] rounded-xl border bg-white p-3 text-left text-xs font-normal leading-relaxed shadow-xl ${error?'border-rose-200 text-rose-800':'border-slate-200 text-slate-600'}`} style={{left:position.left,top:position.top,width:position.width,transform:position.above?'translateY(calc(-100% - 36px))':undefined}}>{children}</div>,document.body)}
  </>;
}
