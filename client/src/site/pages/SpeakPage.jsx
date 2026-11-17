import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { Button, Card, Container, Eyebrow, Field, Terminal, ToggleChip } from '../ui';
import { cx } from '../utils';
import { CONTACT_EMAIL, speakDomains, speakFormats, speakProcess } from '../data';
import { postJson, useSiteData } from '../api';
import { sitePaths } from '../paths';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// The next six Fridays in IST, as YYYY-MM-DD plus a chip label like "FRI 13 NOV".
function upcomingFridays(count = 6, now = Date.now()) {
  const ist = new Date(now + 330 * 60000);
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + ((5 - day.getUTCDay() + 7) % 7 || 7));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(day.getTime() + i * 7 * 86400000);
    return { value: d.toISOString().slice(0, 10), label: `FRI ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
  });
}

const h2 = 'm-0 text-[clamp(32px,3.8vw,52px)] font-semibold leading-[1.05] tracking-[-0.02em]';
const specRows = [['slot', '"Friday, 19:00–20:00 IST"'], ['length', '"~45 min talk + Q&A"'], ['where', '"Online · Zoom"'], ['slides', '"optional"'], ['audience', '["students", "aspirants", "early devs"]'], ['vibe', '"no theory dumps"']];

function PitchForm() {
  const { domains } = useSiteData();
  const [fridays] = useState(() => upcomingFridays());
  const [picked, setPicked] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const { executeRecaptcha } = useGoogleReCaptcha();
  const onSubmit = async (e) => {
    e.preventDefault();
    if (status.state === 'sending') return;
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setStatus({ state: 'sending', message: '' });
    try {
      if (!executeRecaptcha) throw new Error('Security check not ready. Please wait a moment and try again.');
      const recaptcha_token = await executeRecaptcha('speaker_application');
      const result = await postJson('/api/speaker-applications', {
        name: data.name, email: data.email, role_company: data.role, link: data.link, mobile_number: data.mobile_number, preferred_call_time: data.preferred_call_time, title: data.title,
        domain: data.domain, abstract: data.abstract, preferred_fridays: fridays.filter((f) => picked[f.value]).map((f) => f.value), recaptcha_token,
      });
      form.reset();
      setPicked({});
      setStatus({ state: 'sent', message: result.message });
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  };
  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-[28px] border border-osf-line bg-white p-6 shadow-osf-card sm:p-9">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
        <Field id="sp-name" label="Full name"><input id="sp-name" name="name" type="text" required autoComplete="name" className="osf-field" /></Field>
        <Field id="sp-email" label="Email"><input id="sp-email" name="email" type="email" required autoComplete="email" className="osf-field" /></Field>
        <Field id="sp-role" label="Role & company"><input id="sp-role" name="role" type="text" required maxLength={160} placeholder="e.g. Principal Engineer, Fidelity" className="osf-field" /></Field>
        <Field id="sp-li" label="LinkedIn profile URL"><input id="sp-li" name="link" type="url" required pattern="https://(www[.])?linkedin[.]com/in/[^/?#]+/?([?#].*)?" title="Please enter your LinkedIn profile URL" maxLength={300} placeholder="https://www.linkedin.com/in/your-name/" className="osf-field" /></Field>
        <Field id="sp-mobile" label="Mobile number (with country code)"><input id="sp-mobile" name="mobile_number" type="tel" required autoComplete="tel" maxLength={32} title="Include your country code, for example +919876543210" placeholder="+91 98765 43210" className="osf-field" /></Field>
        <Field id="sp-call" label="Best time to call (IST)"><select id="sp-call" name="preferred_call_time" required defaultValue="" className="osf-field"><option value="" disabled>Select a time window…</option>{['9 AM–12 PM', '1 PM–4 PM', '5 PM–8 PM'].map(time => <option key={time} value={time}>{time}</option>)}</select></Field>
      </div>
      <p className="m-0 text-xs leading-relaxed text-osf-muted">We'll use these contact details to discuss your speaker pitch. Callback windows are in India Standard Time (IST).</p>
      <Field id="sp-title" label="Session title"><input id="sp-title" name="title" type="text" required maxLength={160} placeholder="Make it something you'd click on" className="osf-field" /></Field>
      <Field id="sp-domain" label="Domain">
        <select id="sp-domain" name="domain" required defaultValue="" className="osf-field">
          <option value="" disabled>Select…</option>
          {domains.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </select>
      </Field>
      <Field id="sp-abs" label="What will people walk away with?"><textarea id="sp-abs" name="abstract" rows={4} required maxLength={2000} placeholder="3–5 lines is perfect" className="osf-field resize-y" /></Field>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[15px] font-semibold">Fridays that work for you</legend>
        <div className="flex flex-wrap gap-2">
          {fridays.map((d) => <ToggleChip key={d.value} variant="check" pressed={!!picked[d.value]} onClick={() => setPicked({ ...picked, [d.value]: !picked[d.value] })}>{d.label}</ToggleChip>)}
          <ToggleChip variant="check" pressed={!Object.values(picked).some(Boolean)} onClick={() => setPicked({})}>FLEXIBLE</ToggleChip>
        </div>
      </fieldset>
      <p className="m-0 text-xs leading-relaxed text-osf-muted">Up to four Fridays; leave them unselected if you're flexible. Protected by reCAPTCHA.</p>
      <Button type="submit" block disabled={status.state === 'sending'} className="min-h-[52px] py-[18px] disabled:opacity-60">{status.state === 'sending' ? 'SENDING…' : 'SEND MY PITCH'}</Button>
      {status.state === 'sent' && <p role="status" className="m-0 rounded-2xl border border-osf-leaf-edge bg-osf-leaf-wash p-4 text-[15px]">{status.message} We'll reply from <a className="osf-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>}
      {status.state === 'error' && <p role="alert" className="m-0 rounded-2xl border border-osf-danger/40 bg-red-50 p-4 text-[15px] text-osf-danger">{status.message}</p>}
    </form>
  );
}

export default function SpeakPage() {
  const { clubStats, speakers } = useSiteData();
  const companies = [...new Set(speakers.map((s) => s.company).filter(Boolean))].slice(0, 3);
  return (
    <>
      <section className="bg-osf-night px-4 pb-[88px] pt-16 text-white sm:px-6 sm:pt-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, rgba(76,175,80,0.28), transparent 32%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100% 100%, 64px 64px, 64px 64px' }}>
        <Container className="flex flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Eyebrow tone="mint">/ SPEAK AT OSF</Eyebrow>
            <h1 className="m-0 text-[clamp(44px,6vw,80px)] font-semibold leading-[1.02] tracking-[-0.03em]">Got an hour of real-world experience? <span className="text-osf-mint">Bring it to Friday.</span></h1>
            <p className="m-0 max-w-[620px] text-lg leading-[1.55] text-osf-fog sm:text-xl">Engineers, maintainers, researchers, recruiters and founders — teach what you wish someone had taught you, to a room full of people who actually want to learn.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="light" size="lg" onClick={() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })}>PITCH A SESSION</Button>
              <Button to={sitePaths.speakers} variant="ghostDark" size="lg">SEE PAST SPEAKERS</Button>
            </div>
          </div>
          <Terminal dark title="speaker.config.json" className="max-w-[480px] flex-[1_1_380px]">
            <div className="flex flex-col overflow-x-auto px-6 py-[22px] font-osf-mono text-[13px] leading-loose text-osf-cloud sm:text-sm">
              <span>{'{'}</span>
              {specRows.map(([k, v], i) => <span key={k} className="whitespace-nowrap pl-4"><span className="text-osf-mint">"{k}"</span>: {v}{i < specRows.length - 1 ? ',' : ''}</span>)}
              <span>{'}'}</span>
            </div>
          </Terminal>
        </Container>
      </section>

      <section className="px-4 py-24 sm:px-6">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-[760px] flex-col gap-3"><Eyebrow>/ 01 — WHY SPEAK</Eyebrow><h2 className={h2}>Your hour goes a long way here.</h2></div>
          {clubStats.length > 0 && <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {clubStats.map((s) => (
              <Card key={s.label} className="flex flex-col gap-1.5 p-7"><span className="text-[44px] font-bold tracking-[-0.02em]">{s.value}</span><span className="font-osf-mono text-[11px] uppercase tracking-[0.1em] text-osf-muted">{s.label}</span></Card>
            ))}
          </div>}
          {companies.length > 0 && <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[20px] border border-dashed border-osf-dash px-6 py-5">
            <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">PAST SPEAKERS CAME FROM</span>
            {companies.map((c) => <span key={c} className="flex items-center gap-6"><span className="text-xl font-semibold">{c}</span><span aria-hidden="true" className="text-osf-faint">/</span></span>)}
            <span className="text-base text-osf-muted">…and independent builders &amp; founders</span>
          </div>}
        </Container>
      </section>

      <section className="border-y border-osf-line bg-white px-4 py-24 sm:px-6">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-[760px] flex-col gap-3"><Eyebrow>/ 02 — WHAT WE'RE LOOKING FOR</Eyebrow><h2 className={h2}>Four domains. Any format that isn't boring.</h2></div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
            {speakDomains.map((d) => (
              <div key={d.title} className="flex flex-col gap-3 rounded-3xl border border-osf-line bg-osf-mist p-[26px]">
                <span className={cx('font-osf-mono text-xs', d.tone === 'sky' ? 'text-osf-sky-dark' : 'text-osf-leaf')}>{d.code}</span>
                <span className="text-[22px] font-semibold">{d.title}</span>
                <span className="text-[15px] leading-[1.55] text-osf-muted">{d.body}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-1.5 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-muted">FORMATS THAT WORKED</span>
            {speakFormats.map((f) => <span key={f} className="rounded-full border border-osf-line-strong px-4 py-2.5 text-[15px] font-medium">{f}</span>)}
          </div>
        </Container>
      </section>

      <section className="px-4 pb-12 pt-24 sm:px-6">
        <Container className="flex flex-col gap-9">
          <div className="flex max-w-[760px] flex-col gap-3"><Eyebrow>/ 03 — HOW IT WORKS</Eyebrow><h2 className={h2}>Pitch to live in four commits.</h2></div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
            {speakProcess.map((s) => (
              <Card as="li" key={s.title} className="flex flex-col gap-2.5 p-[26px]">
                <span className="font-osf-mono text-xs text-osf-muted"><span className="text-osf-leaf">{s.cmd}</span> {s.arg}</span>
                <span className="text-[21px] font-semibold">{s.title}</span>
                <span className="text-[15px] leading-[1.55] text-osf-muted">{s.body}</span>
              </Card>
            ))}
          </ol>
        </Container>
      </section>

      <section id="apply" className="scroll-mt-24 px-4 pb-[104px] pt-12 sm:px-6">
        <Container className="flex flex-wrap items-start gap-10">
          <div className="flex flex-[1_1_320px] flex-col gap-4">
            <Eyebrow>/ 04 — PITCH A SESSION</Eyebrow>
            <h2 className={h2}>Tell us what you'd teach.</h2>
            <p className="m-0 text-[17px] leading-relaxed text-osf-muted">Rough ideas welcome — we'll help shape it. Prefer email? Write to <a className="osf-link break-all" href={`mailto:${CONTACT_EMAIL}?subject=Speak%20at%20OSF`}>{CONTACT_EMAIL}</a>.</p>
            <p className="m-0 text-sm leading-relaxed text-osf-muted">All sessions follow the club's <Link className="osf-link" to="/code-of-conduct">Code of Conduct</Link>.</p>
          </div>
          <PitchForm />
        </Container>
      </section>
    </>
  );
}
