import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, Link2, MessageCircle, UserPlus } from 'lucide-react';
import { Button, Card, Container, DateBadge, Eyebrow, GradientText, SpeakerAvatar, Tag } from '../ui';
import { heroBackground } from '../utils';
import { copyEpisodeLink, googleCalendarUrl, linkedinShareUrl, whatsappShareUrl } from '../share';
import { sitePaths } from '../paths';

function ShareRow({ ep }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { if (await copyEpisodeLink(ep)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  return (
    <div className="flex flex-wrap gap-2">
      <Button href={whatsappShareUrl(ep)} target="_blank" rel="noopener noreferrer" size="sm" variant="outline"><MessageCircle aria-hidden="true" className="h-4 w-4" />WHATSAPP</Button>
      <Button href={linkedinShareUrl(ep)} target="_blank" rel="noopener noreferrer" size="sm" variant="outline">LINKEDIN</Button>
      <Button onClick={copy} size="sm" variant="outline" aria-live="polite"><Link2 aria-hidden="true" className="h-4 w-4" />{copied ? 'COPIED ✓' : 'COPY LINK'}</Button>
    </div>
  );
}

// Event details for an upcoming episode: the shared banner, the essentials, the speaker and the agenda.
// Every value comes from the episode and speaker records; elements with no data are left out.
export default function EventDetails({ ep }) {
  const calendar = googleCalendarUrl(ep);
  const lead = ep.speakers[0];
  const reserve = ep.registrationOpen && <Button to={ep.registerPath} size="lg" block>RESERVE YOUR SEAT -&gt;</Button>;
  return (
    <>
      <section className="border-b border-osf-line bg-osf-mist px-4 pb-14 pt-8 sm:px-6 sm:pt-10" style={heroBackground([['sky', '85% 20%', 0.14, 30], ['leaf', '10% 90%', 0.12, 30]])}>
        <Container className="flex flex-col gap-6">
          <nav aria-label="Breadcrumb" className="font-osf-mono text-xs tracking-[0.08em] text-osf-muted">
            <Link to={sitePaths.episodes} className="text-osf-muted no-underline hover:text-osf-ink">EPISODES</Link> / <span className="text-osf-ink">EP {ep.num}</span>
          </nav>
          <div className="flex flex-wrap items-start gap-8 lg:gap-12">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
              {ep.cover && <img src={ep.cover} alt={`Open Source Fridays Episode ${ep.num}: ${ep.title}`} className="block aspect-video w-full rounded-[24px] border border-osf-line bg-white object-cover shadow-osf-card" />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">SHARE THIS EPISODE</span>
                <ShareRow ep={ep} />
              </div>
            </div>
            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
              <div className="flex flex-wrap gap-2"><Tag variant="leaf">#OSF-EP{ep.num} · UPCOMING</Tag>{ep.domain && <Tag variant="outline">{ep.domain}</Tag>}</div>
              <h1 className="m-0 text-[clamp(30px,3.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">{ep.title}</h1>
              {ep.blurb && <p className="m-0 text-lg leading-relaxed text-osf-muted">{ep.blurb}</p>}
              <div className="flex items-center gap-4">
                <DateBadge day={ep.day} mon={ep.mon} />
                <span className="flex flex-col gap-1 font-osf-mono text-[13px] leading-snug text-osf-muted"><span className="font-bold text-osf-ink">{ep.dateLong.toUpperCase()}</span>{ep.time && <span>{ep.time.toUpperCase()}</span>}<span>{ep.mode.toUpperCase()} · ZOOM · FREE</span></span>
              </div>
              {ep.speakers.map((s) => (
                <a key={s.id ?? s.name} href="#speaker" onClick={(e) => { e.preventDefault(); document.getElementById('speaker')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="flex items-center gap-3.5 rounded-[20px] border border-osf-line bg-white p-3 pr-4 text-osf-ink no-underline hover:border-osf-leaf">
                  <SpeakerAvatar speaker={s} tone="gradient" className="h-16 w-16 text-xl" />
                  <span className="flex min-w-0 flex-col gap-0.5"><span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-leaf">{ep.speakers.length > 1 ? 'SPEAKER' : 'YOUR SPEAKER'}</span><span className="text-base font-semibold leading-tight">{s.fullName}</span>{s.role && <span className="text-sm text-osf-muted">{s.role}</span>}</span>
                </a>
              ))}
              <div className="flex flex-col gap-2.5">
                {reserve || <p className="m-0 rounded-2xl border border-osf-line bg-white p-4 text-[15px] text-osf-muted">Registration is closed for this episode.</p>}
                {calendar && <Button href={calendar} target="_blank" rel="noopener noreferrer" size="sm" variant="outline" block><CalendarPlus aria-hidden="true" className="h-4 w-4" />ADD TO CALENDAR</Button>}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {ep.speakers.length > 0 && (
        <section id="speaker" className="osf-grid-dark scroll-mt-20 bg-osf-ink px-4 py-16 text-white sm:px-6 sm:py-24">
          <Container className="flex flex-col gap-16">
            {ep.speakers.map((s) => (
              <div key={s.id ?? s.name} className="flex flex-wrap items-center gap-10 lg:gap-16">
                <div className="flex flex-[1_1_260px] justify-center">
                  <div className="relative w-full max-w-[340px]">
                    <SpeakerAvatar speaker={s} tone="gradient" className="aspect-square h-auto w-full !rounded-[28%] text-7xl shadow-[0_40px_80px_-30px_rgba(139,208,142,0.45)]" />
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-osf-mint px-4 py-2 font-osf-mono text-[11px] font-bold tracking-[0.1em] text-osf-ink">SPEAKER · EP {ep.num}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
                  <Eyebrow tone="mint">/ IN THE SPOTLIGHT</Eyebrow>
                  <h2 className="m-0 text-[clamp(36px,4.6vw,60px)] font-semibold leading-[1.02] tracking-[-0.03em]"><GradientText>{s.fullName}</GradientText></h2>
                  {s.role && <p className="m-0 font-osf-mono text-sm tracking-[0.06em] text-osf-fog">{s.role.toUpperCase()}</p>}
                  {s.bio && <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-osf-cloud">{s.bio}</p>}
                  {s.domains.length > 0 && <div className="flex flex-wrap gap-2">{s.domains.map((d) => <Tag key={d} variant="outlineDark">{d}</Tag>)}</div>}
                  {s.linkedin && <Button href={s.linkedin} target="_blank" rel="noopener noreferrer" variant="light" size="sm" className="self-start"><UserPlus aria-hidden="true" className="h-4 w-4" />CONNECT ON LINKEDIN</Button>}
                </div>
              </div>
            ))}
          </Container>
        </section>
      )}

      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <Container className="flex flex-wrap items-start gap-10">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-8">
            {ep.description && (
              <div className="flex flex-col gap-4">
                <Eyebrow>/ ABOUT THIS SESSION</Eyebrow>
                {/* Admin-authored rich text, rendered the same way as v1.0. */}
                <div className="osf-prose max-w-[68ch] text-lg leading-relaxed text-osf-muted" dangerouslySetInnerHTML={{ __html: ep.description.replace(/&nbsp;/g, ' ') }} />
              </div>
            )}
            {ep.agenda.length > 0 && (
              <Card className="flex flex-col gap-4 p-6 sm:p-8">
                <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ WHAT WE'LL COVER</span>
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {ep.agenda.map((item, i) => <li key={item} className="flex items-start gap-3 text-[17px] leading-normal"><span className="flex-none pt-0.5 font-osf-mono text-[13px] font-bold text-osf-leaf">{String(i + 1).padStart(2, '0')}</span><span>{item}</span></li>)}
                </ol>
              </Card>
            )}
            <Card className="flex flex-col gap-3 p-6 sm:p-8">
              <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">HOW IT WORKS</span>
              {['Reserve your seat — it takes under a minute.', 'Zoom emails your personal meeting link. Keep it private, it\'s yours.', 'Join live and bring your questions to the Q&A.'].map((t) => (
                <span key={t} className="flex items-start gap-3 text-[16px] leading-normal"><Check aria-hidden="true" className="mt-1 h-[18px] w-[18px] flex-none text-osf-leaf" strokeWidth={2.6} />{t}</span>
              ))}
            </Card>
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:sticky lg:top-24">
            <Card className="flex flex-col gap-4 p-6 shadow-osf-card">
              <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">SAVE YOUR SEAT</span>
              <span className="text-xl font-semibold leading-snug">{ep.dateLong}{ep.time && ` · ${ep.time}`}</span>
              <span className="text-[15px] text-osf-muted">Free and online. Zoom emails your personal link after you reserve.</span>
              {reserve}
            </Card>
          </aside>
        </Container>
      </section>

      {ep.registrationOpen && (
        <section className="px-4 pb-20 sm:px-6">
          <Container className="osf-grid-dark flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-osf-ink p-8 text-white sm:p-12">
            <div className="flex min-w-0 items-center gap-5">
              {lead && <SpeakerAvatar speaker={lead} tone="gradient" className="hidden h-20 w-20 text-2xl sm:flex" />}
              <span className="flex flex-col gap-1"><span className="text-[clamp(24px,3vw,34px)] font-semibold leading-tight">{lead ? `Learn from ${lead.name.replace(/^(dr|prof)\.?\s+/i, '').split(' ')[0]} live.` : 'Join us live.'}</span><span className="font-osf-mono text-[13px] text-osf-fog">{ep.dateLong.toUpperCase()}{ep.start ? ` · ${ep.start} IST` : ''} · FREE</span></span>
            </div>
            <Button to={ep.registerPath} variant="light" size="lg">RESERVE YOUR SEAT -&gt;</Button>
          </Container>
        </section>
      )}
    </>
  );
}
