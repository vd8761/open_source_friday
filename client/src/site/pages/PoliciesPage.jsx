import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { sections } from '../../components/PolicyPage';
import { policyLinks } from '../../utils/policyLinks';
import { Button, Container, Eyebrow, GradientText } from '../ui';
import { cx, heroBackground } from '../utils';
import { CONTACT_EMAIL, policyTldr } from '../data';

// Policy text is shared with the live PolicyPage so legal copy has one source; this page only restyles it.
const bodyStyles = cx(
  'text-base leading-[1.75] text-osf-ink max-w-[72ch]',
  '[&_a]:text-osf-leaf-dark [&_a]:underline [&_a]:underline-offset-4',
  '[&_a.bg-dos]:mt-4 [&_a.bg-dos]:inline-flex [&_a.bg-dos]:rounded-full [&_a.bg-dos]:bg-osf-leaf [&_a.bg-dos]:px-[22px] [&_a.bg-dos]:py-[15px] [&_a.bg-dos]:font-osf-mono [&_a.bg-dos]:text-xs [&_a.bg-dos]:font-bold [&_a.bg-dos]:uppercase [&_a.bg-dos]:tracking-[0.08em]',
  '[&_img]:mx-auto [&_.rounded-xl]:rounded-[20px] [&_.rounded-lg]:rounded-[20px] [&_code]:font-osf-mono [&_code]:text-osf-muted'
);

export default function PoliciesPage({ slug }) {
  const content = sections[slug];
  useEffect(() => {
    const previous = document.title;
    document.title = `${content.title} · DOS Club`;
    return () => { document.title = previous; };
  }, [content]);

  return (
    <>
      <section className="border-b border-osf-line bg-osf-mist px-4 py-14 sm:px-6 sm:py-16" style={heroBackground([['sky', '85% 30%', 0.12, 30]])}>
        <Container className="flex flex-col gap-[18px]">
          <Eyebrow>/ POLICIES</Eyebrow>
          <p className="m-0 max-w-[880px] text-[clamp(40px,5.4vw,72px)] font-semibold leading-[1.02] tracking-[-0.03em]">The fine print, <GradientText>minus the headache.</GradientText></p>
          <p className="m-0 max-w-[640px] text-lg leading-[1.55] text-osf-muted">Every policy starts with a quick “in short” summary. The full text sits right below it — that's the version that counts.</p>
        </Container>
      </section>

      <Container as="main" className="flex flex-wrap items-start gap-8 px-4 pb-24 pt-12 sm:px-6">
        <nav aria-label="Policy pages" className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 md:sticky md:top-24 md:max-w-[300px]">
          <span className="mb-2 ml-1 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">ALL POLICIES</span>
          <div className="flex flex-wrap gap-1.5 md:flex-col">
            {policyLinks.map(([url, label]) => {
              const active = url === `/${slug}`;
              return (
                <Link key={url} to={url} aria-current={active ? 'page' : undefined}
                  className={cx('flex min-h-12 items-center justify-between gap-2 rounded-[14px] border px-[18px] py-3.5 text-base text-osf-ink no-underline', active ? 'border-osf-leaf-edge bg-osf-leaf-soft font-semibold' : 'border-transparent font-medium hover:bg-white')}>
                  {label}{active && <span aria-hidden="true" className="font-osf-mono text-osf-leaf">-&gt;</span>}
                </Link>
              );
            })}
          </div>
          <div className="mt-5 flex flex-col gap-1.5 rounded-[18px] border border-osf-line bg-white p-[18px]">
            <span className="text-[15px] font-semibold">Questions?</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="osf-link break-all text-[15px]">{CONTACT_EMAIL}</a>
          </div>
        </nav>

        <article className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 rounded-[28px] border border-osf-line bg-white p-6 shadow-osf-card sm:p-12">
          <div className="flex flex-col gap-3">
            <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">DESCIENCE OPEN SOURCE CLUB</span>
            <h1 className="m-0 text-[clamp(36px,4vw,52px)] font-semibold leading-[1.02] tracking-[-0.02em]">{content.title}</h1>
            <p className="m-0 text-lg leading-[1.55] text-osf-muted">{content.intro}</p>
            <span className="font-osf-mono text-xs text-osf-muted">Updated 29 Oct 2026 · Applies to the OSF event application</span>
          </div>

          <div className="osf-grid-dark osf-grid-dark-sm flex flex-col gap-3.5 rounded-[20px] bg-osf-ink px-6 py-6 text-white sm:px-7">
            <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-mint">~/policy ❯ tl;dr</span>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {policyTldr[slug].map((t) => (
                <li key={t} className="flex items-start gap-3 text-base leading-normal">
                  <Check aria-hidden="true" className="mt-[3px] h-[18px] w-[18px] flex-none text-osf-mint" strokeWidth={2.6} /><span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-7">
            {content.items.map(([heading, body]) => (
              <section key={heading} className="flex flex-col gap-2.5">
                <h2 className="m-0 text-2xl font-semibold leading-[1.15]">{heading}</h2>
                <div className={bodyStyles}>{body()}</div>
              </section>
            ))}
          </div>
          {slug === 'request-data' && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-osf-leaf-edge bg-osf-leaf-wash p-6">
              <span className="text-[17px] font-semibold">Ready to send a request?</span>
              <Button href={`mailto:${CONTACT_EMAIL}?subject=Data%20request`} size="sm">EMAIL A REQUEST -&gt;</Button>
            </div>
          )}
        </article>
      </Container>
    </>
  );
}
