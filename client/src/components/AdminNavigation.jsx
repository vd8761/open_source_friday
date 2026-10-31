import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
export default function AdminNavigation(){
  const {pathname}=useLocation();
  const episode=pathname.match(/\/admin\/episodes\/(\d+)\/(attendees|attendance)/)?.[1];
  const item=({isActive})=>`rounded-lg px-3 py-2 text-sm font-semibold ${isActive?'bg-dos/10 text-dos':'text-slate-600 hover:bg-slate-100'}`;
  return <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3"><NavLink to="/dashboard" className="mr-3 font-bold text-slate-900">DOS Club · Admin</NavLink><nav aria-label="Admin navigation" className="flex flex-wrap items-center gap-1"><NavLink to="/dashboard" end className={item}>Dashboard</NavLink><NavLink to="/admin/past-events" className={item}>Past events</NavLink><NavLink to="/admin/invitations" className={item}>Email invitations</NavLink><NavLink to="/admin/episodes/new" className={item}>Create event</NavLink></nav><NavLink to="/admin/trash" className="ml-auto px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Event trash</NavLink></div>{episode&&<nav aria-label="Event navigation" className="mx-auto flex max-w-7xl gap-2 px-4 pb-3"><NavLink to={`/admin/episodes/${episode}/attendees`} className={item}>Attendees</NavLink><NavLink to={`/admin/episodes/${episode}/attendance`} className={item}>Meeting attendance</NavLink></nav>}</header>;
}
