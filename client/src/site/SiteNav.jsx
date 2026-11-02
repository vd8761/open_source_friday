import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { asset, cx } from './utils';
import { CLUB_URL } from './data';
import { sitePaths } from './paths';
import { useSiteData } from './api';

const links = [
  [sitePaths.episodes, 'Episodes'],
  [sitePaths.speakers, 'Speakers'],
  [sitePaths.who, "Who it's for"],
  [sitePaths.speak, 'Speak at OSF']
];

const linkClass = ({ isActive }) => cx(
  'block border-b-2 px-3 py-3 font-osf-mono text-[13px] uppercase tracking-[0.08em] no-underline',
  isActive ? 'border-osf-leaf font-bold text-osf-leaf' : 'border-transparent font-medium text-osf-ink hover:text-osf-leaf'
);

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { next } = useSiteData();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-osf-line bg-white/[0.92] backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-6 sm:px-6 sm:py-3.5">
        <Link to={sitePaths.home} aria-label="Open Source Fridays — home" className="flex min-w-0 items-center gap-3 text-osf-ink no-underline">
          <img src={asset('dos_logo.png')} alt="Descience Open Source Club" className="block h-8 w-auto sm:h-[42px]" />
          <span className="hidden rounded-full bg-osf-leaf-soft px-2.5 py-1.5 font-osf-mono text-[11px] font-bold leading-none tracking-[0.08em] text-osf-leaf sm:inline">OSF</span>
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          {links.map(([to, label]) => <NavLink key={to} to={to} className={linkClass}>{label}</NavLink>)}
        </div>

        <div className="flex flex-none items-center gap-2">
          <a href={CLUB_URL} target="_blank" rel="noopener noreferrer" className="hidden min-h-11 items-center rounded-full border border-osf-line-strong px-4 font-osf-mono text-xs font-bold tracking-[0.08em] text-osf-ink no-underline hover:border-osf-ink sm:inline-flex">
            DOS CLUB ↗<span className="sr-only"> (opens in a new tab)</span>
          </a>
          {next?.registrationOpen && <Link to={next.registerPath} className="inline-flex min-h-11 items-center rounded-full bg-osf-leaf px-3.5 font-osf-mono sm:px-[18px] text-xs font-bold tracking-[0.08em] text-white no-underline hover:bg-osf-leaf-dark">RESERVE<span className="hidden min-[400px]:inline">&nbsp;YOUR SEAT</span><span className="hidden sm:inline">&nbsp;-&gt;</span></Link>}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="osf-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-osf-line-strong bg-white text-osf-ink lg:hidden">
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        {open && (
          <div id="osf-mobile-menu" className="w-full border-t border-osf-line pt-2 lg:hidden">
            {links.map(([to, label]) => <NavLink key={to} to={to} className={linkClass}>{label}</NavLink>)}
            <a href={CLUB_URL} target="_blank" rel="noopener noreferrer" className="block px-3 py-3 font-osf-mono text-[13px] font-medium uppercase tracking-[0.08em] text-osf-ink no-underline sm:hidden">DOS Club ↗</a>
          </div>
        )}
      </nav>
    </header>
  );
}
