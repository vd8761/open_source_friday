import React from 'react';
import { Link, NavLink } from 'react-router-dom';
export function AdminBreadcrumb({items}){
  return <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500"><ol className="flex flex-wrap items-center gap-2">{items.map(([label,to],i)=><li key={i} className="flex items-center gap-2">{i>0&&<span aria-hidden="true" className="text-slate-300">/</span>}{to?<Link to={to} className="hover:text-dos">{label}</Link>:<span aria-current="page">{label}</span>}</li>)}</ol></nav>;
}
export function EventTabs({id}){
  const style=({isActive})=>`border-b-2 px-1 py-3 text-sm font-semibold ${isActive?'border-dos text-dos':'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`;
  return <nav aria-label="Event sections" className="flex gap-6 border-b border-slate-200"><NavLink to={`/admin/episodes/${id}/attendees`} className={style}>Attendees</NavLink><NavLink to={`/admin/episodes/${id}/attendance`} className={style}>Meeting attendance</NavLink></nav>;
}
