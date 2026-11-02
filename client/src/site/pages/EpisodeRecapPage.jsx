import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { Lock, PlayCircle, FileText, Link2, X } from 'lucide-react';
import { Button, Card, Container, Field, GradientText, SpeakerAvatar, Tag } from '../ui';
import { cx } from '../utils';
import { API_URL, episodeView, postJson } from '../api';
import { sitePaths } from '../paths';
import EventDetails from './EventDetails';

// Each episode is unlocked separately and remembered on this browser for 14 days, keyed by episode number.
const STORE = 'osf-lounge';
const readAll = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } };
const readSession = (n) => { const s = readAll()[n]; return s && s.exp > Date.now() ? s : null; };
const writeSession = (n, s) => {
  try {
    const all = Object.fromEntries(Object.entries(readAll()).filter(([, v]) => v?.exp > Date.now()));
    if (s) all[n] = s; else delete all[n];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* private mode: the unlock lasts for this visit only */ }
};
const paragraphs = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function UnlockDialog({ episode, onClose, onUnlocked }) {
  const [step, setStep] = useState('email'), [email, setEmail] = useState(''), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const { executeRecaptcha } = useGoogleReCaptcha();
  useEffect(() => { const esc = (e) => e.key === 'Escape' && !busy && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [busy, onClose]);
  async function requestCode(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (!executeRecaptcha) throw new Error('Security check not ready. Please wait a moment and try again.');
      const r = await postJson('/api/lounge/request-code', { email, episode, recaptcha_token: await executeRecaptcha('lounge_code') });
      // Only attendees marked present are emailed a code; everyone else sees the reason here.
      setNote(r.message); setStep(r.sent ? 'code' : 'denied');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await postJson('/api/lounge/verify', { email, code, episode });
      const session = { token: r.token, name: r.name, exp: Date.now() + r.expires_in_days * 86400000 };
      writeSession(episode, session); onUnlocked(session);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-osf-ink/55 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="unlock-h" className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-osf-card sm:p-8">
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-osf-muted hover:bg-osf-mist"><X className="h-5 w-5" /></button>
        <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ ATTENDEE LOUNGE</span>
        <h2 id="unlock-h" className="mb-2 mt-2 text-[28px] font-semibold leading-tight">{step === 'email' ? `Unlock the Episode ${episode} lounge` : step === 'code' ? 'Check your inbox' : 'Not this time'}</h2>
        {step === 'email' ? (
          <form onSubmit={requestCode} className="flex flex-col gap-4">
            <p className="m-0 text-[15px] leading-normal text-osf-muted">Use the email you registered with. If you joined this episode live, we'll send a 6-digit code to confirm it's you. Each episode's lounge is unlocked separately.</p>
            <Field id="lounge-email" label="Email"><input id="lounge-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="osf-field" placeholder="you@example.com" /></Field>
            {error && <p role="alert" className="m-0 text-[15px] font-semibold text-osf-danger">{error}</p>}
            <Button type="submit" block disabled={busy} className="disabled:opacity-60">{busy ? 'SENDING…' : 'SEND MY CODE ->'}</Button>
            <p className="m-0 text-xs text-osf-muted">Protected by reCAPTCHA.</p>
          </form>
        ) : step === 'denied' ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="m-0 flex gap-3 rounded-2xl border border-osf-leaf-edge bg-osf-leaf-wash p-4 text-[16px] leading-normal"><Lock aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-osf-leaf" />{note}</p>
            <Button to={sitePaths.episodes} block onClick={onClose}>SEE UPCOMING EPISODES -&gt;</Button>
            <button type="button" onClick={() => { setStep('email'); setNote(''); }} className="osf-link cursor-pointer self-start border-0 bg-transparent p-0 py-2 font-osf-mono text-xs font-bold tracking-[0.08em]">TRY A DIFFERENT EMAIL</button>
          </div>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <p className="m-0 text-[15px] leading-normal text-osf-muted">{note}</p>
            <Field id="lounge-code" label="6-digit code"><input id="lounge-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="osf-field text-center font-osf-mono text-2xl tracking-[0.4em]" /></Field>
            {error && <p role="alert" className="m-0 text-[15px] font-semibold text-osf-danger">{error}</p>}
            <Button type="submit" block disabled={busy || code.length !== 6} className="disabled:opacity-60">{busy ? 'CHECKING…' : 'UNLOCK ->'}</Button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="osf-link cursor-pointer self-start border-0 bg-transparent p-0 py-2 font-osf-mono text-xs font-bold tracking-[0.08em]">USE A DIFFERENT EMAIL</button>
          </form>
        )}
      </section>
    </div>
  );
}

function LoungeContent({ data }) {
  return (
    <div className="flex flex-col gap-6">
      {data.recording_url && <Button href={data.recording_url} target="_blank" rel="noopener noreferrer" className="self-start"><PlayCircle aria-hidden="true" className="h-4 w-4" />WATCH THE RECORDING ↗</Button>}
      {data.notes && <div className="flex flex-col gap-3"><h3 className="m-0 text-xl font-semibold">Speaker notes and takeaways</h3>{paragraphs(data.notes).map((p, i) => <p key={i} className="m-0 whitespace-pre-line text-[17px] leading-relaxed">{p}</p>)}</div>}
      {data.materials.length > 0 && (
        <div className="flex flex-col gap-2.5"><h3 className="m-0 text-xl font-semibold">Materials</h3>
          {data.materials.map((m) => <a key={m.url} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-osf-line bg-white px-4 py-3.5 text-osf-ink no-underline hover:border-osf-leaf"><Link2 aria-hidden="true" className="h-4 w-4 flex-none text-osf-leaf" /><span className="flex-1 font-semibold">{m.title}</span><span className="font-osf-mono text-xs text-osf-leaf">OPEN ↗</span></a>)}
        </div>
      )}
    </div>
  );
}

export default function EpisodeRecapPage() {
  const { episode_number: param } = useParams();
  const [ep, setEp] = useState(null), [error, setError] = useState(''), [tips, setTips] = useState([]);
  const [session, setSession] = useState(null), [lounge, setLounge] = useState(null), [dialog, setDialog] = useState(false), [showPill, setShowPill] = useState(false);
  const recapEnd = useRef(null), gate = useRef(null);
  const n = String(param || '').replace(/^episode-/, '');
  useEffect(() => { setSession(readSession(n)); setLounge(null); }, [n]);

  useEffect(() => {
    fetch(`${API_URL}/api/v2/episodes/${n}`).then((r) => r.json()).then((d) => { if (!d.success) throw new Error(d.error || 'Episode not found.'); setEp({ ...episodeView(d.episode), recap: d.episode.recap, lounge: d.episode.lounge }); }).catch((e) => setError(e.message));
    fetch(`${API_URL}/api/tips`).then((r) => r.json()).then((d) => setTips((d.tips || []).filter((t) => String(t.episode_number) === n))).catch(() => {});
  }, [n]);
  useEffect(() => {
    if (!session || !ep) return;
    fetch(`${API_URL}/api/lounge/episodes/${n}`, { headers: { Authorization: `Bearer ${session.token}` } }).then(async (r) => {
      if (r.status === 401) { writeSession(n, null); setSession(null); return; }
      setLounge(await r.json());
    }).catch(() => {});
  }, [session, ep, n]);
  // Medium-style: once the reader passes the public recap, a floating Unlock button appears until the gate is in view.
  useEffect(() => {
    if (!recapEnd.current || !gate.current || !('IntersectionObserver' in window)) return;
    let passed = false, gateVisible = false;
    const update = () => setShowPill(passed && !gateVisible);
    const o1 = new IntersectionObserver(([e]) => { passed = e.boundingClientRect.top < 0; update(); });
    const o2 = new IntersectionObserver(([e]) => { gateVisible = e.isIntersecting; update(); });
    o1.observe(recapEnd.current); o2.observe(gate.current);
    return () => { o1.disconnect(); o2.disconnect(); };
  }, [ep, lounge]);

  if (error) return <Container as="main" className="flex flex-col items-start gap-5 px-4 py-24 sm:px-6"><h1 className="m-0 text-4xl font-semibold">Episode not found</h1><Button to={sitePaths.episodes} variant="outline">ALL EPISODES</Button></Container>;
  if (!ep) return <Container as="main" className="px-4 py-24 sm:px-6"><p role="status" className="m-0 text-osf-muted">Loading episode…</p></Container>;
  // One page per episode: details and agenda before it runs, recap and attendee lounge after.
  if (ep.upcoming) return <EventDetails ep={ep} />;

  const hasLounge = ep.lounge && (ep.lounge.has_notes || ep.lounge.materials_count > 0 || ep.lounge.has_recording);
  const unlocked = lounge?.access === 'granted';
  const teaser = [ep.lounge?.has_recording && [PlayCircle, 'Session recording'], ep.lounge?.has_notes && [FileText, 'Speaker notes and takeaways'], ep.lounge?.materials_count > 0 && [Link2, `${ep.lounge.materials_count} material${ep.lounge.materials_count > 1 ? 's' : ''} from the speaker`]].filter(Boolean);

  return (
    <div className="osf-grid-light min-h-full">
      <Container as="main" className="flex max-w-[880px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6">
        <Link to={sitePaths.episodes} className="osf-link self-start py-2.5 font-osf-mono text-xs font-bold tracking-[0.08em] no-underline">&lt;- ALL EPISODES</Link>
        {ep.cover && <div className="relative overflow-hidden rounded-[28px] border border-osf-line bg-osf-ink"><img src={ep.cover} alt={`Episode ${ep.num} banner`} className="block aspect-video w-full object-cover" /><Tag variant="dark" className="absolute left-4 top-4">COMPLETED · EP {ep.num}</Tag></div>}
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2"><Tag>#OSF-EP{ep.num}</Tag>{ep.domain && <Tag variant="outline">{ep.domain}</Tag>}<Tag variant="muted">{ep.dateLong}</Tag></div>
          <h1 className="m-0 text-[clamp(32px,4.4vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em]">{ep.title}</h1>
          <div className="flex flex-wrap gap-5">{ep.speakers.map((s) => (
            <div key={s.id ?? s.name} className="flex items-center gap-3.5"><SpeakerAvatar speaker={s} tone="gradient" className="h-14 w-14 text-lg" /><div className="flex flex-col gap-0.5"><Link to={sitePaths.speakers} className="font-semibold text-osf-ink no-underline">{s.name}</Link>{s.role && <span className="text-sm text-osf-muted">{s.role}</span>}</div></div>
          ))}</div>
        </header>

        <section className="flex flex-col gap-4">
          <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ WHAT HAPPENED</span>
          {ep.recap ? paragraphs(ep.recap).map((p, i) => <p key={i} className="m-0 whitespace-pre-line text-lg leading-relaxed">{p}</p>)
            : <p className="m-0 text-lg leading-relaxed text-osf-muted">The recap for this episode is on its way.</p>}
          {ep.speakers.filter((s) => s.bio).map((s) => <p key={s.id} className="m-0 rounded-2xl border border-osf-line bg-white p-5 text-[15px] leading-relaxed text-osf-muted"><strong className="text-osf-ink">About {s.name}.</strong> {s.bio}</p>)}
          {tips.length > 0 && <div className="flex flex-col gap-2.5"><span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ TAKEAWAYS</span>{tips.map((t) => <p key={t.id} className="m-0 rounded-2xl border border-osf-leaf-edge bg-osf-leaf-wash p-4 text-[17px] leading-normal">“{t.text}”</p>)}</div>}
          <span ref={recapEnd} aria-hidden="true" />
        </section>

        {hasLounge && (
          <section ref={gate} aria-labelledby="lounge-h" className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="lounge-h" className="m-0 text-[clamp(26px,3vw,34px)] font-semibold">The <GradientText>attendee lounge</GradientText></h2>
              {session && <span className="text-sm text-osf-muted">Unlocked as {session.name} · <button type="button" onClick={() => { writeSession(n, null); setSession(null); setLounge(null); }} className="osf-link cursor-pointer border-0 bg-transparent p-0 text-sm underline">not you?</button></span>}</div>
            {unlocked ? <Card className="p-6 sm:p-8"><LoungeContent data={lounge} /></Card>
              : lounge?.access === 'denied' ? <Card className="flex flex-col gap-3 p-6 sm:p-8"><Lock aria-hidden="true" className="h-6 w-6 text-osf-leaf" /><p className="m-0 text-lg leading-relaxed">{lounge.message}</p><Button to={sitePaths.episodes} variant="outline" size="sm" className="self-start">SEE WHAT'S NEXT</Button></Card>
              : (
                <div className="relative overflow-hidden rounded-[28px] border border-osf-line bg-white">
                  <ul aria-hidden="true" className="m-0 flex list-none flex-col gap-3 p-6 opacity-60 blur-[3px] sm:p-8">{teaser.map(([Icon, label]) => <li key={label} className="flex items-center gap-3 rounded-2xl border border-osf-line px-4 py-4"><Icon className="h-5 w-5 text-osf-leaf" /><span className="font-semibold">{label}</span></li>)}<li className="h-16 rounded-2xl bg-osf-mist" /></ul>
                  <div className="absolute inset-0 flex flex-col items-center justify-end gap-3 bg-linear-to-b from-white/10 via-white/80 to-white p-6 text-center sm:p-8">
                    <Lock aria-hidden="true" className="h-6 w-6 text-osf-leaf" />
                    <p className="m-0 max-w-md text-[17px] leading-normal"><strong>For members who joined Episode {ep.num} live.</strong> {teaser.map(([, l]) => l.toLowerCase()).join(', ')}.</p>
                    <Button onClick={() => setDialog(true)}>UNLOCK THE LOUNGE -&gt;</Button>
                  </div>
                </div>
              )}
          </section>
        )}
      </Container>
      {hasLounge && !unlocked && !lounge && showPill && (
        <button type="button" onClick={() => setDialog(true)} className={cx('fixed bottom-5 left-1/2 z-50 inline-flex min-h-12 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border-0 bg-osf-ink px-6 font-osf-mono text-xs font-bold tracking-[0.08em] text-white shadow-[0_18px_40px_-18px_rgba(16,34,43,0.6)]')}><Lock aria-hidden="true" className="h-4 w-4 text-osf-mint" />UNLOCK THE ATTENDEE LOUNGE</button>
      )}
      {dialog && <UnlockDialog episode={Number(n)} onClose={() => setDialog(false)} onUnlocked={(s) => { setSession(s); setDialog(false); }} />}
    </div>
  );
}
