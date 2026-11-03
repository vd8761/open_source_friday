import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Container, DataState, DateBadge, Eyebrow, GradientText, Tag, ToggleChip } from '../ui';
import { heroBackground } from '../utils';
import { useSiteData } from '../api';
import { sitePaths } from '../paths';

export default function EpisodesPage() {
  const [domain, setDomain] = useState('ALL');
  const { episodes: all, past, upcoming, next: ep, stats, domains, loading, error } = useSiteData();
  const total = all.length;
  const countFor = (d) => (d === 'ALL' ? total : all.filter((e) => e.domain === d).length);
  const episodes = domain === 'ALL' ? past : past.filter((e) => e.domain === domain);
  const later = upcoming.slice(1);
  const lead = ep?.speakers[0];
  const heroStats = [[total, 'EPISODES'], [stats?.speakers_count ?? '—', 'SPEAKERS'], [domains.length || '—', 'DOMAINS'], ['₹0', 'TO JOIN']];

  return (
    <>
      <section className="border-b border-osf-line bg-osf-mist px-4 pb-14 pt-14 sm:px-6 sm:pt-[72px]" style={heroBackground([['sky', '85% 30%', 0.14, 30]])}>
        <Container className="flex flex-col gap-7">
          <Eyebrow>/ EPISODES — THE FULL TIMELINE</Eyebrow>
          <h1 className="m-0 max-w-[960px] text-[clamp(44px,6vw,80px)] font-semibold leading-[1.02] tracking-[-0.03em]">{total || ''} Fridays. <GradientText>Zero theory dumps.</GradientText></h1>
          <p className="m-0 max-w-[640px] text-lg leading-[1.55] text-osf-muted sm:text-xl">Raw conversations, code tear-downs and career truth from people doing the work. Catch the next one live — every Friday, 7 PM IST.</p>
          <div className="grid max-w-[760px] grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            {heroStats.map(([value, label]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-2xl border border-osf-line bg-white px-[18px] py-4">
                <span className="text-[30px] font-bold">{value}</span>
                <span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">{label}</span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="px-4 pt-14 sm:px-6">
        <Container className="flex flex-col gap-4">
          <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">NEXT UP</span>
          <DataState loading={loading} error={error} />
          {ep && <article className="osf-grid-dark flex flex-wrap items-center gap-8 rounded-[28px] bg-osf-ink p-6 text-white sm:p-9">
            <DateBadge day={ep.day} mon={ep.mon} size="xl" />
            <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5">
              <div className="flex flex-wrap gap-2"><Tag variant="mint">#OSF-EP{ep.num} · UPCOMING</Tag>{ep.domain && <Tag variant="outlineDark">{ep.domain}</Tag>}</div>
              <h2 className="m-0 text-[clamp(26px,3vw,38px)] font-semibold leading-[1.1]">{ep.title}</h2>
              {ep.blurb && <p className="m-0 text-[17px] leading-relaxed text-osf-fog">{ep.blurb}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-2 font-osf-mono text-[13px] text-osf-fog">
                {ep.time && <span>{ep.weekday.toUpperCase()} {ep.time.toUpperCase()}</span>}<span>{ep.mode.toUpperCase()}</span>
                {lead && <span>{ep.speakers.map((s) => s.name).join(' & ').toUpperCase()}{lead.company && ` · ${lead.company.toUpperCase()}`}</span>}
              </div>
            </div>
            <div className="flex flex-[1_1_200px] flex-col gap-2.5">
              {ep.registrationOpen && <Button to={ep.registerPath} size="lg">BOOK MY SEAT</Button>}
              <Button to={ep.recapPath} size="sm" variant="outlineDark">AGENDA &amp; DETAILS</Button>
            </div>
          </article>}
          {!loading && !error && <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {later.map((c) => (
              <Link key={c.num} to={c.recapPath} className="flex items-center gap-4 rounded-[20px] border border-osf-line bg-white p-5 text-osf-ink no-underline hover:border-osf-leaf">
                <span className="w-14 flex-none text-center leading-[1.1]"><span className="block text-2xl font-bold">{c.day}</span><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-muted">{c.mon}</span></span>
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-muted">EP {c.num} · UPCOMING</span><span className="text-base font-semibold">{c.title}</span></span>
              </Link>
            ))}
            {!ep && (
              <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-osf-dash p-5">
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-muted">EP {total + 1} · ANNOUNCING SOON</span><span className="text-base font-semibold">The next speaker is being confirmed.</span></span>
              </div>
            )}
            <Link to={sitePaths.speak} className="flex items-center gap-4 rounded-[20px] border border-dashed border-osf-leaf bg-osf-leaf-soft p-5 text-osf-ink no-underline">
              <span aria-hidden="true" className="flex h-12 w-14 flex-none items-center justify-center font-osf-mono text-[22px] font-bold text-osf-leaf">+</span>
              <span className="flex min-w-0 flex-col gap-0.5"><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-leaf">EP {total + (ep ? 1 : 2)}+ · OPEN SLOT</span><span className="text-base font-semibold">Your session could go here</span></span>
            </Link>
          </div>}
        </Container>
      </section>

      <section className="px-4 pb-[104px] pt-[72px] sm:px-6">
        <Container className="flex flex-col gap-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex flex-col gap-3">
              <Eyebrow>/ ARCHIVE</Eyebrow>
              <h2 className="m-0 text-[clamp(32px,3.6vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">Every episode, by domain.</h2>
            </div>
            <span aria-live="polite" className="font-osf-mono text-[13px] text-osf-muted">SHOWING {countFor(domain)} OF {total}</span>
          </div>

          <div role="group" aria-label="Filter by domain" className="flex flex-wrap gap-2">
            {['ALL', ...domains.map((x) => x.label)].map((d) => <ToggleChip key={d} pressed={d === domain} onClick={() => setDomain(d)} className="px-[18px]">{d} · {countFor(d)}</ToggleChip>)}
          </div>

          <div className="flex flex-col gap-3">
            {episodes.map((e) => (
              <Card as="article" key={e.num} className="flex flex-wrap items-center gap-x-7 gap-y-5 rounded-[20px] p-5 sm:p-6">
                <div className="flex h-[76px] w-[72px] flex-none flex-col items-center justify-center rounded-[14px] border border-osf-line bg-osf-mist leading-[1.05]">
                  <span className="text-[28px] font-bold">{e.day}</span>
                  <span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">{e.mon}</span>
                </div>
                <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5"><Tag>#OSF-EP{e.num}</Tag>{e.domain && <Tag variant="outline">{e.domain}</Tag>}<Tag variant="muted">COMPLETED</Tag></div>
                  <h3 className="m-0 text-[21px] font-semibold leading-tight"><Link to={e.recapPath} className="text-osf-ink no-underline hover:text-osf-leaf">{e.title}</Link></h3>
                  {e.blurb && <p className="m-0 text-[15px] leading-[1.55] text-osf-muted">{e.blurb}</p>}
                </div>
                <div className="flex flex-[1_1_220px] flex-col gap-1">
                  <span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">{e.speakers.length > 1 ? 'SPEAKERS' : 'SPEAKER'}</span>
                  {e.speakers.map((sp) => <Link key={sp.id ?? sp.name} to={sitePaths.speakers} className="text-base font-semibold text-osf-ink underline underline-offset-4 hover:text-osf-leaf">{sp.name}</Link>)}
                  <span className="font-osf-mono text-xs text-osf-muted">{[e.timeShort?.toUpperCase(), e.mode.toUpperCase()].filter(Boolean).join(' · ')}</span>
                </div>
              </Card>
            ))}
            {episodes.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-osf-dash p-10 text-center text-osf-muted">Nothing here yet — <Link to={sitePaths.speak} className="osf-link">pitch the first session</Link>.</div>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
