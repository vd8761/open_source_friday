import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Container, DataState, Eyebrow, GradientText, SpeakerAvatar, Tag, ToggleChip } from '../ui';
import { heroBackground } from '../utils';
import { DOMAINS } from '../data';
import { useSiteData } from '../api';
import { sitePaths } from '../paths';

export default function SpeakersPage() {
  const [domain, setDomain] = useState('ALL');
  const { speakers, next: ep, stats, loading, error } = useSiteData();
  const list = domain === 'ALL' ? speakers : speakers.filter((s) => s.domains.includes(domain));
  const featured = ep && speakers.find((s) => s.id === ep.speakers[0]?.id);

  return (
    <>
      <section className="border-b border-osf-line bg-osf-mist px-4 pb-16 pt-14 sm:px-6 sm:pt-[72px]" style={heroBackground([['leaf', '15% 40%', 0.18, 30]])}>
        <Container className="flex flex-wrap items-end gap-12">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Eyebrow>/ SPEAKERS</Eyebrow>
            <h1 className="m-0 text-[clamp(44px,6vw,80px)] font-semibold leading-[1.02] tracking-[-0.03em]">The people <GradientText>behind the mic.</GradientText></h1>
            <p className="m-0 max-w-[620px] text-lg leading-[1.55] text-osf-muted sm:text-xl">Delivery leads, principal engineers, researchers and founders — giving an hour of their Friday so you don't have to learn it the hard way.</p>
          </div>
          <div className="grid flex-[1_1_320px] grid-cols-2 gap-3">
            {[[stats?.speakers_count ?? speakers.length, 'SPEAKERS'], [stats?.repeat_speakers ?? speakers.filter((s) => s.isRepeat).length, 'CAME BACK FOR MORE']].map(([v, l]) => (
              <div key={l} className="flex flex-col gap-0.5 rounded-2xl border border-osf-line bg-white p-[18px]"><span className="text-[32px] font-bold">{v}</span><span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">{l}</span></div>
            ))}
          </div>
        </Container>
      </section>

      {featured && (
        <section className="px-4 pt-14 sm:px-6">
          <Container>
            <Card as="article" className="flex flex-wrap items-center gap-9 rounded-[28px] p-6 shadow-osf-card sm:p-9">
              <SpeakerAvatar speaker={featured} tone="gradient" className="h-[220px] w-[200px] max-w-full !rounded-3xl text-7xl" />
              <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5">
                <div className="flex flex-wrap gap-2"><Tag variant="leaf">LIVE THIS {ep.weekday.toUpperCase() === 'FRI' ? 'FRIDAY' : ep.weekday.toUpperCase()} · EP {ep.num}</Tag>{featured.isRepeat && <Tag variant="sky">REPEAT GUEST</Tag>}</div>
                <h2 className="m-0 text-[clamp(32px,3.6vw,44px)] font-semibold leading-[1.05]">{featured.name}</h2>
                {featured.role && <span className="text-lg text-osf-muted">{featured.role}</span>}
                {featured.bio && <p className="m-0 max-w-[640px] text-[17px] leading-relaxed">{featured.bio}</p>}
                <div className="mt-1 flex flex-wrap gap-2.5">
                  {ep.registrationOpen && <Button to={ep.registerPath} size="sm">RESERVE YOUR SEAT FOR EP {ep.num} -&gt;</Button>}
                  {featured.linkedin && <Button href={featured.linkedin} target="_blank" rel="noopener noreferrer" size="sm" variant="outline">LINKEDIN ↗</Button>}
                </div>
              </div>
            </Card>
          </Container>
        </section>
      )}

      <section className="px-4 pb-[104px] pt-[72px] sm:px-6">
        <Container className="flex flex-col gap-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex flex-col gap-3">
              <Eyebrow>/ ALL SPEAKERS</Eyebrow>
              <h2 className="m-0 text-[clamp(32px,3.6vw,48px)] font-semibold leading-[1.05] tracking-[-0.02em]">Find someone in your lane.</h2>
            </div>
            <div role="group" aria-label="Filter by domain" className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => <ToggleChip key={d} pressed={d === domain} onClick={() => setDomain(d)}>{d}</ToggleChip>)}
            </div>
          </div>

          <DataState loading={loading} error={error} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
            {list.map((s, i) => (
              <Card as="article" key={s.id} className="flex flex-col gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <SpeakerAvatar speaker={s} tone={i % 2 ? 'sky' : 'leaf'} className="h-[72px] w-[72px] text-2xl" />
                  {s.episodeCount > 1 && <Tag variant="sky" className="text-[10px]">×{s.episodeCount} EPISODES</Tag>}
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="m-0 text-[21px] font-semibold leading-[1.2]">{s.name}</h3>
                  {s.role && <span className="text-[15px] text-osf-muted">{s.role}</span>}
                </div>
                {s.domains.length > 0 && <div className="flex flex-wrap gap-1.5">{s.domains.map((d) => <Tag key={d} variant="outline" className="text-[10px]">{d}</Tag>)}</div>}
                {s.episodes.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-osf-hairline pt-3.5">
                    {[...s.episodes].sort((a, b) => b.episode_number - a.episode_number).map((e) => (
                      <Link key={e.episode_number} to={sitePaths.episodes} className="flex items-baseline gap-2.5 text-osf-ink no-underline hover:text-osf-leaf">
                        <span className="flex-none font-osf-mono text-[11px] font-bold text-osf-leaf">EP{e.episode_number}</span>
                        <span className="text-sm leading-[1.4]">{e.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            ))}
            <Link to={sitePaths.speak} className="flex min-h-[280px] flex-col justify-center gap-3.5 rounded-3xl border border-dashed border-osf-leaf bg-osf-leaf-soft p-6 text-osf-ink no-underline">
              <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-dashed border-osf-leaf font-osf-mono text-[28px] text-osf-leaf">+</span>
              <span className="text-[22px] font-semibold">Could be you.</span>
              <span className="text-[15px] leading-normal text-osf-muted">Got something worth an hour? We're booking Fridays now.</span>
              <span className="font-osf-mono text-xs font-bold tracking-[0.08em] text-osf-leaf">PITCH A SESSION -&gt;</span>
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
