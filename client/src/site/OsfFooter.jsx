import { Link } from 'react-router-dom';
import { policyLinks } from '../utils/policyLinks';
import { Button } from './ui';
import { asset } from './utils';
import { CLUB_URL, CONTACT_EMAIL, socialLinks } from './data';
import { sitePaths } from './paths';
import { useSiteData } from './api';

const osfLinks = [
  [sitePaths.episodes, 'Episodes'],
  [sitePaths.speakers, 'Speakers'],
  [sitePaths.who, "Who it's for"],
  [sitePaths.speak, 'Speak at OSF']
];

const colHeading = 'mb-2.5 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-mint';
const colLink = 'block py-2 text-base text-osf-cloud no-underline hover:text-white';

export default function OsfFooter() {
  const { next } = useSiteData();
  return (
    <footer className="bg-osf-ink px-4 pb-8 pt-[72px] text-[#B9C8CF] sm:px-6">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-14">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-osf-rule pb-12">
          <div className="flex max-w-[700px] flex-col gap-3.5">
            <span className="font-osf-mono text-[13px] font-bold tracking-[0.08em] text-osf-mint">~/osf ❯ see_you_friday</span>
            <h2 className="m-0 text-[clamp(32px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">Learn. Build.<br /><span className="text-osf-mint">Ship in the open.</span></h2>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {next?.registrationOpen && <Button to={next.registerPath}>BOOK MY SEAT</Button>}
            <Button href={CLUB_URL} target="_blank" rel="noopener noreferrer" variant="outlineDark">JOIN THE CLUB ↗</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-12">
          <div className="flex min-w-0 max-w-[420px] flex-[999_1_320px] flex-col gap-4">
            <div className="self-start rounded-2xl bg-white px-4 py-3">
              <img src={asset('dos_logo.png')} alt="Descience Open Source Club" className="block h-[42px] w-auto" />
            </div>
            <p className="m-0 text-base leading-relaxed">Open Source Fridays, workshops and community learning — live every Friday, 7 PM IST.</p>
            <p className="m-0 text-sm text-osf-faint">An initiative of Touchmark Descience Pvt Ltd.</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="self-start text-base font-semibold text-white">{CONTACT_EMAIL}</a>
          </div>

          <nav aria-label="Open Source Fridays" className="flex flex-[1_1_170px] flex-col">
            <h2 className={colHeading}>/ OSF</h2>
            {osfLinks.map(([to, label]) => <Link key={to} to={to} className={colLink}>{label}</Link>)}
            <a href={CLUB_URL} target="_blank" rel="noopener noreferrer" className={colLink}>DOS Club website ↗<span className="sr-only"> (opens in a new tab)</span></a>
          </nav>

          <nav aria-label="Policies" className="flex flex-[1_1_170px] flex-col">
            <h2 className={colHeading}>/ POLICIES</h2>
            {policyLinks.map(([url, label]) => <Link key={url} to={url} className={colLink}>{label}</Link>)}
          </nav>

          <div className="flex flex-[1_1_260px] flex-col gap-3">
            <h2 className={colHeading}>/ FOLLOW THE CLUB</h2>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {socialLinks.map(([url, label]) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-osf-slate px-3.5 text-sm font-medium text-white no-underline hover:border-white">
                    {label}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-3 border-t border-osf-rule pt-6 text-sm text-osf-faint">
          <span>© {new Date().getFullYear()} Descience Open Source Club.</span>
          <span className="font-osf-mono text-xs tracking-[0.08em]">BUILT IN THE OPEN · ONE COMMIT AT A TIME</span>
        </div>
      </div>
    </footer>
  );
}
