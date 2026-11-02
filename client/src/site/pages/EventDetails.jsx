import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, Download, Link2, MessageCircle, UserPlus } from 'lucide-react';
import { Button, Card, Container, DateBadge, Eyebrow, GradientText, SpeakerAvatar, Tag } from '../ui';
import { asset, heroBackground } from '../utils';
import { promoRunway } from '../data';
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
      {ep.cover && <Button href={ep.cover} download={`osf-ep${ep.num}-banner.jpg`} target="_blank" rel="noopener noreferrer" size="sm" variant="outline"><Download aria-hidden="true" className="h-4 w-4" />POSTER</Button>}
    </div>
  );
}

// Mock of how the episode link unfurls in WhatsApp (same banner, title and description the real link preview uses).
function WhatsAppPreview({ ep, lead }) {
  return (
    <div className="rounded-[18px] bg-[#E8F0E4] p-3">
      <div className="ml-auto max-w-[340px] rounded-xl rounded-tr-sm bg-[#D9FDD3] p-1.5 shadow-sm">
        <div className="overflow-hidden rounded-lg bg-[#CDEBC6]">
          <img src={ep.cover} alt="" className="block aspect-video w-full object-cover" />
          <div className="flex flex-col gap-0.5 px-2.5 py-2">
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug">Episode {ep.num}: {ep.title} | Open Source Fridays</span>
            {ep.blurb && <span className="line-clamp-2 text-xs leading-snug text-osf-muted">{ep.blurb}</span>}
            <span className="text-[11px] text-osf-muted">osf.descienceosclub.com</span>
          </div>
        </div>
        <p className="m-0 px-1.5 pb-1 pt-2 text-[13px] leading-snug">Hey everyone! This {ep.weekday === 'Fri' ? 'Friday' : ep.weekday}{lead ? `, ${lead.name} breaks down…` : '…'}</p>
      </div>
    </div>
  );
}

// Mock LinkedIn post: the club posts, the speaker is named and tagged.
function LinkedInPreview({ ep, lead }) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-osf-line bg-white">
      <div className="flex items-center gap-2.5 p-3">
        <img src={asset('dos_logo.png')} alt="" className="h-9 w-9 flex-none object-contain" />
        <span className="flex flex-col leading-tight"><span className="text-[13px] font-semibold">Descience Open Source Club</span><span className="text-[11px] text-osf-muted">Promoted to followers</span></span>
      </div>
      <p className="m-0 px-3 pb-2.5 text-[13px] leading-snug">Proud to host {lead ? <><span className="font-semibold text-osf-sky-dark">{lead.name}</span>{lead.role && `, ${lead.role},`} </> : ''}on OSF Ep {ep.num}.</p>
      {ep.cover && <img src={ep.cover} alt="" className="block aspect-video w-full object-cover" />}
      <div className="flex gap-4 border-t border-osf-hairline px-3 py-2 font-osf-mono text-[10px] tracking-[0.06em] text-osf-muted"><span>LIKE</span><span>COMMENT</span><span>REPOST</span></div>
    </div>
  );
}

// 1:1 square for Instagram and WhatsApp status: speaker first, from the same records.
function SquarePreview({ ep, lead }) {
  return (
    <div className="osf-grid-dark flex aspect-square flex-col justify-between rounded-[18px] bg-osf-ink p-5 text-white">
      <div className="flex items-center justify-between font-osf-mono text-[10px] tracking-[0.1em] text-osf-mint"><span>OSF · EP {ep.num}</span><span>{Number(ep.day)} {ep.mon}{ep.start ? ` · ${ep.start}` : ''}</span></div>
      {lead && (
        <div className="flex items-end gap-4">
          <span className="block w-[42%] flex-none rounded-[28%] bg-linear-135 from-osf-sky to-osf-mint p-[5px]"><SpeakerAvatar speaker={lead} tone="gradient" className="aspect-square h-auto w-full !rounded-[26%] text-3xl" /></span>
          <span className="flex min-w-0 flex-col gap-1 pb-1">
            <span className="font-osf-mono text-[10px] tracking-[0.1em] text-osf-fog">SPEAKER</span>
            <span className="text-lg font-semibold leading-tight">{lead.name}</span>
            {lead.role && <span className="text-xs text-osf-fog">{lead.role}</span>}
          </span>
        </div>
      )}
      <span className="line-clamp-3 text-[15px] font-semibold leading-snug"><GradientText>{ep.title}</GradientText></span>
    </div>
  );
}

// How OSF features its speakers, shown with this episode's own banner, title and speaker.
function SpeakerPromise({ ep, lead }) {
  const kit = [
    ep.cover && { label: 'EVENT BANNER · 16:9', use: 'Site hero, YouTube thumbnail, LinkedIn event cover', el: <img src={ep.cover} alt={`Episode ${ep.num} banner`} className="block aspect-video w-full rounded-[18px] border border-osf-line object-cover" /> },
    ep.cover && { label: 'WHATSAPP LINK PREVIEW', use: 'Shared into every OSF community group', el: <WhatsAppPreview ep={ep} lead={lead} /> },
    { label: 'LINKEDIN POST', use: 'Club page post with you named and tagged', el: <LinkedInPreview ep={ep} lead={lead} /> },
    lead && { label: 'SPEAKER SQUARE · 1:1', use: 'Instagram, WhatsApp status — for you to repost', el: <SquarePreview ep={ep} lead={lead} /> },
  ].filter(Boolean);
  return (
    <section className="border-t border-osf-line bg-white px-4 py-16 sm:px-6 sm:py-24">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[760px] flex-col gap-3.5">
            <Eyebrow>/ HOW WE FEATURE OUR SPEAKERS</Eyebrow>
            <h2 className="m-0 text-[clamp(32px,4vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em]">You bring the insight. <GradientText>We put your name everywhere.</GradientText></h2>
            <p className="m-0 text-lg leading-[1.55] text-osf-muted">Every OSF speaker gets a designed launch kit and a week-long promotion run.{lead ? ` This is what goes out for ${lead.name}.` : ''}</p>
          </div>
          <Button to={sitePaths.speak} variant="outline">PITCH A SESSION -&gt;</Button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] items-start gap-6">
          {kit.map((k) => (
            <figure key={k.label} className="m-0 flex min-w-0 flex-col gap-3">
              {k.el}
              <figcaption className="flex flex-col gap-0.5">
                <span className="font-osf-mono text-[11px] font-bold tracking-[0.1em] text-osf-leaf">{k.label}</span>
                <span className="text-sm text-osf-muted">{k.use}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-3 p-0">
          {promoRunway.map((s) => (
            <li key={s.when} className="flex flex-col gap-2 rounded-[20px] border border-osf-line bg-osf-mist p-6">
              <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-sky-dark">{s.when}</span>
              <span className="text-xl font-semibold">{s.title}</span>
              <span className="text-[15px] leading-relaxed text-osf-muted">{s.body}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
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

      <SpeakerPromise ep={ep} lead={lead} />

      {ep.registrationOpen && (
        <section className="px-4 py-20 sm:px-6">
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
