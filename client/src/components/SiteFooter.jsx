import { Link } from 'react-router-dom';
import { policyLinks } from '../utils/policyLinks';
// Club accounts supplied by the organiser.
const socialLinks = [
  ['https://x.com/descienceosclub','Twitter / X'],
  ['https://www.youtube.com/channel/UCvF5jATxekeLcFvjLrMGjpA','YouTube'],
  ['https://www.linkedin.com/company/descience-open-source-club/','LinkedIn'],
  ['https://www.instagram.com/descienceopensourceclub/','Instagram'],
  ['https://www.facebook.com/descienceosclub','Facebook'],
  ['https://www.threads.net/@descienceosclub','Threads'],
  ['https://github.com/descienceosclub','GitHub']
];
export default function SiteFooter() {
  return <footer className="mt-auto border-t border-slate-800 bg-slate-900 text-slate-300">
    <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><a href="https://descienceosclub.com" className="text-lg font-bold text-white">Descience Open Source Club</a><p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">Learn together. Build in the open.<br/>Open Source Fridays, workshops and community learning.</p><p className="mt-3 text-xs text-slate-400">An initiative of Touchmark Descience Pvt Ltd.</p><a className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-white" href="mailto:info@descienceosclub.com">info@descienceosclub.com</a></div>
      <nav aria-label="Policies"><h2 className="mb-4 text-xs font-bold tracking-widest text-white">POLICIES</h2><ul className="space-y-3 text-sm">{policyLinks.map(([url,label])=><li key={url}><Link className="hover:text-white hover:underline underline-offset-4" to={url}>{label}</Link></li>)}</ul></nav>
      <nav aria-label="Social media"><h2 className="mb-4 text-xs font-bold tracking-widest text-white">SOCIAL MEDIA</h2><ul className="space-y-3 text-sm">{socialLinks.map(([url,label])=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline underline-offset-4">{label}<span className="sr-only"> (opens in a new tab)</span></a></li>)}</ul></nav>
    </div><div className="mx-auto max-w-7xl border-t border-slate-800 px-6 py-5 text-xs text-slate-400">© {new Date().getFullYear()} Descience Open Source Club.</div>
  </footer>;
}
