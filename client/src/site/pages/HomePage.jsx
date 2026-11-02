import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLink, Button, Card, Container, DataState, DateBadge, Eyebrow, GradientText, SectionHeading, SpeakerAvatar, Tag, Terminal } from '../ui';
import { heroBackground } from '../utils';
import { audiences, howItWorks, tickerItems } from '../data';
import { useSiteData } from '../api';
import { sitePaths } from '../paths';

const joinNames = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

function Hero() {
  const { next: ep, stats, clubStats, episodes } = useSiteData();
  const lead = ep?.speakers[0];
  return (
    <section id="top" className="relative overflow-hidden bg-osf-mist px-4 pb-24 pt-14 sm:px-6 sm:pt-[72px]" style={heroBackground([['leaf', '18% 45%', 0.2, 32], ['sky', '78% 40%', 0.16, 30]])}>
      <Container className="flex flex-wrap items-center gap-14">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-7">
          {ep ? (
            <Link to={ep.registerPath} className="flex max-w-full items-center gap-3.5 self-start rounded-2xl border border-osf-line bg-white/90 py-2 pl-2 pr-[18px] text-osf-ink no-underline hover:border-osf-leaf">
              <DateBadge day={ep.day} mon={ep.mon} size="sm" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-osf-mono text-[11px] font-bold tracking-[0.1em] text-osf-leaf">NEXT UP · EP {ep.num} · {ep.weekday.toUpperCase()} {ep.start} IST</span>
                <span className="text-[15px] font-semibold">{ep.title}</span>
              </span>
              <span aria-hidden="true" className="font-osf-mono text-osf-leaf">-&gt;</span>
            </Link>
          ) : episodes.length > 0 && (
            <Link to={sitePaths.episodes} className="flex max-w-full items-center gap-3.5 self-start rounded-2xl border border-osf-line bg-white/90 px-[18px] py-3 text-osf-ink no-underline hover:border-osf-leaf">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-osf-mono text-[11px] font-bold tracking-[0.1em] text-osf-leaf">NEXT EPISODE · ANNOUNCING SOON</span>
                <span className="text-[15px] font-semibold">Catch up on all {episodes.length} episodes</span>
              </span>
              <span aria-hidden="true" className="font-osf-mono text-osf-leaf">-&gt;</span>
            </Link>
          )}
          <h1 className="m-0 text-[clamp(44px,6.2vw,84px)] font-semibold leading-[1.02] tracking-[-0.03em]">Your Friday night just got a <GradientText>commit history.</GradientText></h1>
          <p className="m-0 max-w-[580px] text-lg leading-[1.55] text-osf-muted sm:text-xl">One hour, every Friday. Working engineers and leads show you how they build, ship and get hired — then take your questions live. Free, online, and built for students and aspirants.</p>
          <div className="flex flex-wrap gap-3">
            {ep && <Button to={ep.registerPath} size="lg">RESERVE YOUR SEAT -&gt;</Button>}
            <Button to={sitePaths.episodes} size="lg" variant={ep ? 'frost' : 'primary'}>BROWSE ALL {episodes.length || ''} EPISODES</Button>
          </div>
          {stats && (
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[15px] text-osf-muted">
              <span><strong className="text-lg text-osf-ink">{stats.episodes_shipped}</strong> episodes shipped</span>
              <span><strong className="text-lg text-osf-ink">{stats.speakers_count}</strong> speakers</span>
              {clubStats[0] && <span><strong className="text-lg text-osf-ink">{clubStats[0].value}</strong> {clubStats[0].label}</span>}
            </div>
          )}
        </div>

        <Terminal title="~/open-source-fridays" className="max-w-[520px] flex-[1_1_400px]"
          footer={<div className="flex items-center justify-between border-t border-osf-line px-[18px] py-3 font-osf-mono text-[11px] tracking-[0.08em] text-osf-muted"><span><span className="text-[#4CAF50]">●</span> LIVE EVERY FRIDAY</span><span>EP {ep ? ep.num : episodes.length || '—'} / ∞</span></div>}>
          <div className="flex flex-col p-5 font-osf-mono text-[13px] leading-[1.9] text-osf-ink sm:p-6 sm:text-sm">
            <span><span className="text-osf-leaf">~/osf ❯</span> ./next_episode.sh</span>
            <span className="text-osf-muted">&gt; fetching friday lineup… <span className="text-osf-leaf">done</span></span>
            {ep ? (
              <>
                <span className="truncate">&gt; ep: <strong>{ep.num}</strong> — {ep.title}</span>
                {lead && <span className="truncate">&gt; speaker: {lead.name} {lead.company && <span className="text-osf-muted">({lead.company})</span>}</span>}
                <span>&gt; when: {ep.weekday} {Number(ep.day)} {ep.mon[0]}{ep.mon.slice(1).toLowerCase()} · {ep.start24} IST</span>
                <span>&gt; where: {ep.mode.toLowerCase()} · zoom</span>
                <span>&gt; price: <span className="text-osf-leaf">free</span></span>
                <span>&gt; seats: <span className="text-osf-leaf">{ep.registrationOpen ? 'open ✓' : 'closed'}</span></span>
              </>
            ) : (
              <span>&gt; next: <span className="text-osf-leaf">announcing soon</span></span>
            )}
            <span className="mt-2"><span className="text-osf-leaf">~/osf ❯</span> <span className="bg-osf-ink text-osf-ink">_</span></span>
          </div>
        </Terminal>
      </Container>
    </section>
  );
}

function Ticker() {
  const run = (key) => tickerItems.map(([word, glyph], i) => (
    <Fragment key={`${key}-${word}`}>
      <span>{word}</span>
      <span className={`font-osf-mono ${i % 2 ? 'text-osf-sky' : 'text-osf-leaf'}`}>{glyph}</span>
    </Fragment>
  ));
  return (
    <div aria-hidden="true" className="overflow-hidden border-y border-osf-line bg-white py-[18px]">
      <div className="osf-ticker whitespace-nowrap text-[22px] font-semibold text-osf-ink">{run('a')}{run('b')}</div>
    </div>
  );
}

function WhoSection() {
  return (
    <section id="who" className="px-4 py-20 sm:px-6 sm:py-[104px]">
      <Container className="flex flex-col gap-11">
        <SectionHeading eyebrow="/ 01 — WHO IT'S FOR" title="Wherever you are in the grind, there's a seat for you." action={<ArrowLink to={sitePaths.who}>FIND YOUR PATH -&gt;</ArrowLink>} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
          {audiences.map((a) => (
            <Link key={a.num} to={sitePaths.who} className="flex flex-col gap-3.5 rounded-3xl border border-osf-line bg-white p-7 text-osf-ink no-underline transition-colors hover:border-osf-leaf">
              <span className="font-osf-mono text-[13px] text-osf-faint">{a.num}</span>
              <span className="text-2xl font-semibold">{a.label}</span>
              <span className="text-base leading-relaxed text-osf-muted">{a.body}</span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}

function EpisodesSection() {
  const { next: ep, past, episodes, loading, error } = useSiteData();
  const recent = past.slice(0, 3);
  const lead = ep?.speakers[0];
  return (
    <section id="episodes" className="px-4 pb-20 sm:px-6 sm:pb-[104px]">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow="/ 02 — EPISODES" title="The Friday lineup." action={<ArrowLink to={sitePaths.episodes}>VIEW ALL {episodes.length || ''} EPISODES -&gt;</ArrowLink>} />
        <DataState loading={loading} error={error} />
        {!loading && !error && <div className="flex flex-wrap items-stretch gap-5">
          {ep ? <Card as="article" className="flex min-w-0 flex-[999_1_520px] flex-wrap gap-7 p-6 sm:p-8">
            <DateBadge day={ep.day} mon={ep.mon} size="lg" />
            <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-3.5">
              <div className="flex flex-wrap gap-2">
                <Tag>#OSF-EP{ep.num}</Tag><Tag variant="dark">UPCOMING</Tag>{ep.domain && <Tag variant="outline">{ep.domain}</Tag>}
              </div>
              <h3 className="m-0 text-[clamp(24px,2.4vw,30px)] font-semibold leading-[1.12]">{ep.title}</h3>
              {ep.blurb && <p className="m-0 text-base leading-relaxed text-osf-muted">{ep.blurb}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-2 font-osf-mono text-[13px] text-osf-muted">
                {ep.time && <span>{ep.time}</span>}<span>{ep.mode}</span>{lead && <span>{ep.speakers.map((s) => s.name).join(' & ')}{lead.company && ` · ${lead.company}`}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                {ep.registrationOpen && <Button to={ep.registerPath} size="sm">RESERVE YOUR SEAT -&gt;</Button>}
                <Button to={ep.registerPath} size="sm" variant="outline">AGENDA &amp; DETAILS</Button>
              </div>
            </div>
          </Card> : (
            <Card as="article" className="flex min-w-0 flex-[999_1_520px] flex-col justify-center gap-3 border-dashed p-6 sm:p-8">
              <Tag variant="outline" className="self-start">EP {episodes.length + 1} · ANNOUNCING SOON</Tag>
              <h3 className="m-0 text-[clamp(24px,2.4vw,30px)] font-semibold leading-[1.12]">The next Friday is being lined up.</h3>
              <p className="m-0 text-base leading-relaxed text-osf-muted">Catch up on past episodes while the next speaker is confirmed.</p>
            </Card>
          )}
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5">
            <span className="px-1 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">RECENTLY SHIPPED</span>
            {recent.map((e) => (
              <Link key={e.num} to={sitePaths.episodes} className="flex items-center gap-3.5 rounded-2xl border border-osf-line bg-white/70 p-3.5 text-osf-ink no-underline hover:border-osf-leaf">
                <span className="w-[52px] flex-none text-center leading-[1.1]"><span className="block text-[22px] font-bold">{e.day}</span><span className="font-osf-mono text-[10px] text-osf-muted">{e.mon}</span></span>
                <span className="flex min-w-0 flex-col gap-0.5"><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-muted">EP {e.num} · COMPLETED</span><span className="text-[15px] font-semibold">{e.title}</span></span>
              </Link>
            ))}
            {past.length > recent.length && <Link to={sitePaths.episodes} className="osf-link rounded-2xl border border-dashed border-osf-line-strong p-3.5 text-center font-osf-mono text-xs font-bold tracking-[0.08em] no-underline">{past.length - recent.length} MORE ON THE FULL TIMELINE -&gt;</Link>}
          </div>
        </div>}
      </Container>
    </section>
  );
}

// Four faces: the next episode's speaker first, then the most recent speakers.
function SpeakersSection() {
  const { speakers, next } = useSiteData();
  if (!speakers.length) return null;
  const nextIds = new Set(next?.speakers.map((s) => s.id));
  const latest = (s) => Math.max(...s.episodes.map((e) => e.episode_number), 0);
  const picked = [...speakers].sort((a, b) => Number(nextIds.has(b.id)) - Number(nextIds.has(a.id)) || latest(b) - latest(a)).slice(0, 4);
  const companies = [...new Set(picked.map((s) => s.company).filter(Boolean))].slice(0, 3);
  const tones = ['sky', 'leaf'];
  return (
    <section id="speakers" className="border-y border-osf-line bg-white px-4 py-20 sm:px-6 sm:py-[104px]">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow="/ 03 — SPEAKERS" title="The people behind the mic." intro={companies.length ? `Engineers and leads from teams like ${joinNames(companies)} — sharing what they wish they'd known earlier.` : null} action={<ArrowLink to={sitePaths.speakers}>MEET ALL {speakers.length} SPEAKERS -&gt;</ArrowLink>} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {picked.map((s, i) => {
            const highlight = nextIds.has(s.id);
            const eps = s.episodes.map((e) => `EP ${e.episode_number}`).join(' · ');
            return (
              <Link key={s.id} to={sitePaths.speakers} className="flex flex-col gap-3.5 rounded-3xl border border-osf-line bg-osf-mist p-6 text-osf-ink no-underline hover:border-osf-leaf">
                <SpeakerAvatar speaker={s} tone={highlight ? 'solid' : tones[i % 2]} className="h-16 w-16 text-[22px]" />
                <span className={`font-osf-mono text-[11px] font-bold tracking-[0.08em] ${highlight ? 'text-osf-leaf' : 'text-osf-muted'}`}>{highlight ? `THIS FRIDAY · EP ${next.num}` : eps}</span>
                <span className="text-[19px] font-semibold leading-[1.2]">{s.name}</span>
                {s.role && <span className="text-[15px] text-osf-muted">{s.role}</span>}
              </Link>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

function RegisterSection() {
  const navigate = useNavigate();
  const { next: ep } = useSiteData();
  const onSubmit = (e) => {
    e.preventDefault();
    navigate(ep.registerPath, { state: { identifier: new FormData(e.currentTarget).get('identifier') } });
  };
  return (
    <section id="register" className="px-4 py-20 sm:px-6 sm:py-[104px]">
      <Container className="flex flex-wrap gap-12">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-7">
          <Eyebrow>/ 04 — HOW IT WORKS</Eyebrow>
          <h2 className="m-0 text-[clamp(36px,4.4vw,56px)] font-semibold leading-[1.05] tracking-[-0.02em]">Three steps. Zero gatekeeping.</h2>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {howItWorks.map((s, i) => (
              <li key={s.title} className="flex items-start gap-[18px] rounded-[20px] border border-osf-line bg-white p-5">
                <span className="flex-none pt-[3px] font-osf-mono text-sm font-bold text-osf-leaf">0{i + 1}</span>
                <div className="flex flex-col gap-1"><span className="text-[19px] font-semibold">{s.title}</span><span className="text-base text-osf-muted">{s.body}</span></div>
              </li>
            ))}
          </ol>
        </div>

        {ep?.registrationOpen && <form onSubmit={onSubmit} className="flex min-w-0 flex-[1_1_380px] flex-col gap-[18px] self-start rounded-3xl border border-osf-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(16,34,43,0.3)] sm:p-8">
          <Tag className="self-start">EP {ep.num} · {ep.weekday.toUpperCase()} {Number(ep.day)} {ep.mon} · FREE</Tag>
          <h3 className="m-0 text-[30px] font-semibold leading-[1.05]">Save your seat</h3>
          <p className="m-0 text-[15px] leading-normal text-osf-muted">Start with your email or WhatsApp number — we'll take it from there.</p>
          <div className="flex flex-col gap-2">
            <label htmlFor="osf-id" className="text-sm font-semibold">Email or WhatsApp number</label>
            <input id="osf-id" name="identifier" type="text" required autoComplete="email" placeholder="you@example.com or 98765 43210" className="osf-field" />
          </div>
          <Button type="submit" block className="py-[17px]">CONTINUE -&gt;</Button>
        </form>}
      </Container>
    </section>
  );
}

function SpeakBanner() {
  return (
    <section id="speak" className="px-4 pb-20 sm:px-6 sm:pb-[104px]">
      <Container className="osf-grid-dark flex flex-wrap items-center justify-between gap-7 rounded-[32px] bg-osf-night p-8 text-white sm:p-14">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5">
          <Eyebrow tone="mint">/ 05 — SPEAK AT OSF</Eyebrow>
          <h2 className="m-0 text-[clamp(32px,3.8vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">Got an hour of real-world experience? Bring it to Friday.</h2>
          <p className="m-0 text-lg leading-[1.55] text-osf-fog">Engineers, maintainers, recruiters, founders — pitch a session for a room full of people who want to learn.</p>
        </div>
        <Button to={sitePaths.speak} variant="light" size="lg">PITCH A SESSION -&gt;</Button>
      </Container>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Ticker />
      <WhoSection />
      <EpisodesSection />
      <SpeakersSection />
      <RegisterSection />
      <SpeakBanner />
    </>
  );
}
