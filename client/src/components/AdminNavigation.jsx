import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import AdminAccount from './AdminAccount';
import { adminApi } from '../utils/adminApi';

// v2.0 look: mono uppercase links with a green underline for the active section, as on the public site.
// Email invitations, Site settings, Domains and Event trash live in the Account menu (AdminAccount).
const links = [
  ['/dashboard', 'Dashboard', true],
  ['/admin/past-events', 'Past events'],
  ['/admin/speakers', 'Speakers'],
  ['/admin/contacts', 'Attendee contacts'],
  ['/admin/speaker-applications', 'Speaker pitches'],
  ['/admin/tips', 'Tips'],
];

export default function AdminNavigation(){
  const {pathname}=useLocation();
  // New speaker pitches show as a count badge; refreshed on every admin page change.
  const [newPitches,setNewPitches]=useState(0);
  useEffect(()=>{adminApi('/speaker-applications/new-count').then(r=>setNewPitches(r.count)).catch(()=>{});},[pathname]);
  const item=({isActive})=>`whitespace-nowrap border-b-2 px-2.5 py-2.5 font-mono text-xs uppercase tracking-[0.08em] no-underline ${isActive?'border-dos font-bold text-dos':'border-transparent font-medium text-slate-900 hover:text-dos'}`;
  return <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/[0.92] backdrop-blur-md">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-8">
      <NavLink to="/dashboard" aria-label="Open Source Fridays admin home" className="flex shrink-0 items-center gap-3 no-underline">
        <img src="/dos_logo.png" alt="Descience Open Source Club" className="h-9 w-auto"/>
        <span className="rounded-full bg-dos/10 px-2.5 py-1.5 font-mono text-[11px] font-bold leading-none tracking-[0.08em] text-dos">OSF ADMIN</span>
      </NavLink>
      <nav aria-label="Admin navigation" className="order-3 flex w-full gap-1 overflow-x-auto xl:order-none xl:w-auto">
        {links.map(([to,label,end])=><NavLink key={to} to={to} end={end} className={({isActive})=>item({isActive:isActive||(to==='/admin/contacts'&&pathname.startsWith('/admin/students/'))})}>{label}{to==='/admin/speaker-applications'&&newPitches>0&&<span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 font-sans text-[10px] font-bold text-white" aria-label={`${newPitches} new`}>{newPitches}</span>}</NavLink>)}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-4"><AdminAccount/></div>
    </div>
  </header>;
}
