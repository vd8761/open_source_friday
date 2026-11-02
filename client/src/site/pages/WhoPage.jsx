import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Container, Eyebrow, GradientText } from '../ui';
import { heroBackground, cx } from '../utils';
import { CONTACT_EMAIL, faqs, pathSteps, personas } from '../data';
import { useSiteData } from '../api';
import { sitePaths } from '../paths';

export default function WhoPage() {
  const [who, setWho] = useState('aspirant');
  const [openFaq, setOpenFaq] = useState(0);
  const { next, byNumber } = useSiteData();
  const p = personas.find((x) => x.id === who);
  // Recommended episodes are picked by number; their titles and status come from the API.
  const picks = p.eps.map(byNumber).filter(Boolean);

  return (
    <>
      <section className="border-b border-osf-line bg-osf-mist px-4 pb-16 pt-14 sm:px-6 sm:pt-[72px]" style={heroBackground([['leaf', '80% 35%', 0.16, 30], ['sky', '20% 80%', 0.12, 30]])}>
        <Container className="flex flex-col gap-6">
          <Eyebrow>/ WHO IT'S FOR</Eyebrow>
          <h1 className="m-0 max-w-[1000px] text-[clamp(44px,6vw,80px)] font-semibold leading-[1.02] tracking-[-0.03em]">Built for the ones <GradientText>still figuring it out.</GradientText></h1>
          <p className="m-0 max-w-[640px] text-lg leading-[1.55] text-osf-muted sm:text-xl">No prerequisites. No gatekeeping. Pick where you are right now and we'll point you to the episodes worth your Friday.</p>
        </Container>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <Container className="flex flex-col gap-6">
          <span id="who-picker" className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">I'M A…</span>
          <div role="group" aria-labelledby="who-picker" className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
            {personas.map((x) => {
              const on = x.id === who;
              return (
                <button key={x.id} type="button" aria-pressed={on} aria-controls="who-panel" onClick={() => setWho(x.id)}
                  className={cx('flex min-h-[88px] cursor-pointer flex-col gap-1.5 rounded-[20px] border px-[22px] py-5 text-left font-osf transition-colors', on ? 'border-osf-ink bg-osf-ink text-white' : 'border-osf-line bg-white text-osf-ink hover:border-osf-ink')}>
                  <span className={cx('font-osf-mono text-[11px] tracking-[0.1em]', on ? 'text-osf-mint' : 'text-osf-faint')}>{x.num}</span>
                  <span className="text-xl font-semibold">{x.label}</span>
                </button>
              );
            })}
          </div>

          <Card id="who-panel" aria-live="polite" className="flex flex-wrap gap-10 rounded-[28px] p-6 shadow-osf-card sm:p-10">
            <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-[22px]">
              <span className="font-osf-mono text-[13px] text-osf-muted">~/osf ❯ whoami <span className="text-osf-leaf">--{p.slug}</span></span>
              <h2 className="m-0 text-[clamp(30px,3.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">{p.hook}</h2>
              <p className="m-0 text-lg leading-relaxed text-osf-muted">{p.body}</p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {p.gets.map((g) => (
                  <li key={g} className="flex items-start gap-3 text-[17px] leading-normal">
                    <span aria-hidden="true" className="flex-none font-osf-mono font-bold text-osf-leaf">-&gt;</span><span>{g}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex flex-wrap gap-2.5">
                {next?.registrationOpen && <Button to={next.registerPath}>RESERVE YOUR SEAT -&gt;</Button>}
                <Button to={sitePaths.episodes} variant="outline">ALL EPISODES</Button>
              </div>
            </div>
            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
              <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">START WITH THESE</span>
              {picks.map((e) => (
                <Link key={e.num} to={e.recapPath} className="flex flex-col gap-1.5 rounded-[18px] border border-osf-line bg-osf-mist px-5 py-[18px] text-osf-ink no-underline hover:border-osf-leaf">
                  <span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">EP {e.num}{e.upcoming ? ` · UPCOMING · ${e.weekday.toUpperCase()} ${Number(e.day)} ${e.mon}` : e.domain ? ` · ${e.domain}` : ''}</span>
                  <span className="text-[17px] font-semibold leading-[1.3]">{e.title}</span>
                </Link>
              ))}
            </div>
          </Card>
        </Container>
      </section>

      <section className="px-4 pb-24 pt-8 sm:px-6">
        <Container className="flex flex-col gap-9">
          <div className="flex max-w-[720px] flex-col gap-3">
            <Eyebrow>/ YOUR PATH</Eyebrow>
            <h2 className="m-0 text-[clamp(32px,3.6vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">From first Friday to first commit.</h2>
            <p className="m-0 text-lg text-osf-muted">Four simple steps. No prerequisites, no pressure — just momentum.</p>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
            {pathSteps.map((s, i) => (
              <Card as="li" key={s.title} className="flex flex-col gap-3 p-7">
                <span className="font-osf-mono text-[13px] font-bold text-osf-leaf">0{i + 1}</span>
                <span className="text-[22px] font-semibold">{s.title}</span>
                <span className="text-base leading-relaxed text-osf-muted">{s.body}</span>
              </Card>
            ))}
          </ol>
        </Container>
      </section>

      <section className="border-t border-osf-line bg-white px-4 py-24 sm:px-6">
        <Container className="flex flex-wrap gap-12">
          <div className="flex flex-[1_1_320px] flex-col gap-3.5">
            <Eyebrow>/ FAQ</Eyebrow>
            <h2 className="m-0 text-[clamp(32px,3.6vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">Questions?<br />Answered.</h2>
            <p className="m-0 text-[17px] text-osf-muted">Still stuck? <a href={`mailto:${CONTACT_EMAIL}`} className="osf-link break-all">{CONTACT_EMAIL}</a></p>
          </div>
          <div className="flex min-w-0 flex-[999_1_560px] flex-col">
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="border-b border-osf-line">
                  <h3 className="m-0">
                    <button type="button" aria-expanded={open} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpenFaq(open ? -1 : i)}
                      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 border-0 bg-transparent py-[22px] text-left font-osf text-[19px] font-semibold text-osf-ink">
                      <span>{f.q}</span>
                      <span aria-hidden="true" className="flex-none font-osf-mono text-xl text-osf-leaf">{open ? '−' : '+'}</span>
                    </button>
                  </h3>
                  <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!open}>
                    <p className="m-0 mb-[22px] max-w-[68ch] text-base leading-[1.65] text-osf-muted">{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>
    </>
  );
}
