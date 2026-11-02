import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import useRegistration from '../../hooks/useRegistration';
import WhatsAppConsent from '../../components/WhatsAppConsent';
import { countries } from '../../utils/countries';
import { formatEpisodeDate, isEpisodeConcluded, isRegistrationOpen } from '../../utils/episodeTime';
import { Button, Card, Container, DateBadge, Field, GradientText, SpeakerAvatar, StepProgress, Tag, ToggleChip } from '../ui';
import { cx } from '../utils';
import { CONTACT_EMAIL, interestChips } from '../data';
import { episodeView, useSiteData } from '../api';
import { copyEpisodeLink, downloadIcs, googleCalendarUrl, linkedinShareUrl, whatsappShareUrl } from '../share';
import { sitePaths } from '../paths';

const pageBg = 'osf-grid-light min-h-full';
const backLink = 'osf-link self-start py-2.5 font-osf-mono text-xs font-bold tracking-[0.08em] no-underline';
const policyLink = 'osf-link underline underline-offset-2';
const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb6yhyh5Ui2YyHbIL117';
// Same per-country digit limits as the v1.0 form.
const phoneMaxLen = (code) => ({ '+91': 10, '+1': 10, '+44': 10, '+61': 9, '+971': 9, '+94': 9, '+65': 8 })[code] || 15;
const looksLikePhone = (v) => v.length > 0 && !v.includes('@') && !/[a-zA-Z]/.test(v);

function CopyLinkButton({ ep }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    if (await copyEpisodeLink(ep)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return <Button variant="ghostDark" size="sm" onClick={onClick} aria-live="polite">{copied ? 'COPIED ✓' : 'COPY LINK'}</Button>;
}

function SpeakerLine({ ep, dark = true, size = 'md' }) {
  return ep.speakers.map((s) => (
    <div key={s.id ?? s.name} className="flex items-center gap-3.5">
      <SpeakerAvatar speaker={s} tone="gradient" className={size === 'md' ? 'h-[52px] w-[52px] text-lg' : 'h-11 w-11 text-base'} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link to={sitePaths.speakers} className={cx('font-semibold no-underline', size === 'md' ? 'text-base' : 'text-[15px]', dark ? 'text-white' : 'text-osf-ink')}>{s.fullName}</Link>
        {s.role && <span className={cx(size === 'md' ? 'text-sm' : 'text-[13px]', dark ? 'text-osf-fog' : 'text-osf-muted')}>{s.role}</span>}
      </div>
    </div>
  ));
}

/* Left column on step 1: the episode itself. */
function EpisodePanel({ ep, details }) {
  return (
    <Card as="article" className="flex min-w-0 max-w-[480px] flex-[1_1_400px] flex-col overflow-hidden rounded-[28px]">
      {/* The admin-uploaded banner (also used for WhatsApp/LinkedIn previews); status comes from the schedule, not the image. */}
      {ep.cover && (
        <div className="relative aspect-video bg-osf-ink">
          <img src={ep.cover} alt={`Episode ${ep.num} banner`} className="block h-full w-full object-cover" />
          <Tag variant={ep.upcoming ? 'leaf' : 'dark'} className="absolute left-4 top-4">{ep.upcoming ? 'UPCOMING' : 'COMPLETED'} · EP {ep.num}</Tag>
        </div>
      )}
      <div className="osf-grid-dark osf-grid-dark-sm flex flex-col gap-[18px] bg-osf-ink p-6 text-white sm:p-7">
        <div className="flex items-center gap-4">
          <DateBadge day={ep.day} mon={ep.mon} />
          <div className="flex flex-wrap gap-1.5"><Tag variant="mint">#OSF-EP{ep.num}</Tag><Tag variant="outlineDark">{ep.upcoming ? 'UPCOMING' : 'COMPLETED'} · {ep.mode.toUpperCase()} · FREE</Tag></div>
        </div>
        <h1 className="m-0 text-[clamp(26px,2.6vw,32px)] font-semibold leading-[1.1] tracking-[-0.01em]">{ep.title}</h1>
        <SpeakerLine ep={ep} />
        <Link to={ep.recapPath} className="self-start py-1 font-osf-mono text-xs font-bold tracking-[0.08em] text-osf-mint no-underline">FULL DETAILS &amp; AGENDA -&gt;</Link>
      </div>
      <div className="flex flex-col gap-6 p-6 sm:p-7">
        <div className="grid grid-cols-2 gap-2.5">
          {[['DATE', ep.dateLong], ['TIME', ep.time]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 rounded-[14px] border border-osf-line bg-osf-mist p-3.5">
              <span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-muted">{k}</span><span className="text-base font-semibold">{v}</span>
            </div>
          ))}
        </div>
        {details.description && (
          <div className="flex flex-col gap-3">
            <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ ABOUT THIS EPISODE</span>
            {/* Admin-authored rich text, rendered the same way as v1.0. */}
            <div className="osf-prose text-base leading-[1.65]" dangerouslySetInnerHTML={{ __html: details.description.replace(/&nbsp;/g, ' ') }} />
          </div>
        )}
        {ep.agenda.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ WHAT WE'LL COVER</span>
            {ep.agenda.map((item, i) => (
              <div key={item} className="flex items-start gap-3.5 rounded-2xl border border-osf-line px-4 py-3.5">
                <span className="flex-none pt-0.5 font-osf-mono text-[13px] font-bold text-osf-leaf">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-base font-semibold">{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ClosedNotice({ details, concluded }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="m-0 text-[clamp(30px,3.2vw,40px)] font-semibold leading-[1.05] tracking-[-0.02em]">{concluded ? 'Episode Concluded' : 'Registration Closed'}</h2>
      {concluded
        ? <p className="m-0 text-[17px] leading-[1.55] text-osf-muted">Registration is closed because this episode has already been completed. Thank you for your interest!</p>
        : <>
            <p className="m-0 text-[17px] leading-[1.55] text-osf-muted">Registration is currently <strong className="text-osf-danger">disabled</strong> for this event.</p>
            <p className="m-0 text-[17px] leading-[1.55] text-osf-muted">This episode is scheduled for <strong className="text-osf-ink">{formatEpisodeDate(details.event_date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {details.event_time}</strong>.</p>
          </>}
      <div className="flex flex-wrap gap-2.5">
        {concluded && <Button to={`/episodes/${details.episode_number}`} className="self-start">SEE WHAT HAPPENED -&gt;</Button>}
        <Button to={sitePaths.episodes} variant="outline" className="self-start">BROWSE UPCOMING EPISODES</Button>
      </div>
      <div className="flex flex-col gap-2 rounded-[20px] border border-osf-leaf-edge bg-osf-leaf-wash p-5">
        <span className="text-[15px] font-semibold">Have a query? Contact us on WhatsApp</span>
        <span className="text-sm leading-[1.55] text-osf-muted">Follow our WhatsApp channel to stay updated on upcoming episodes and get your questions answered.</span>
        <a href={WHATSAPP_CHANNEL} target="_blank" rel="noopener noreferrer" className="osf-link self-start py-2 font-osf-mono text-xs font-bold tracking-[0.08em] no-underline">FOLLOW OUR WHATSAPP CHANNEL ↗</a>
      </div>
    </div>
  );
}

function IdentifyStep({ ep, reg }) {
  const { identifier, setIdentifier, countryCode, setCountryCode, isSubmitting, lookupError, handleLookup, returnToLookup } = reg;
  const phone = looksLikePhone(identifier);
  const max = phoneMaxLen(countryCode);
  const already = lookupError === 'You are already registered for this episode!';
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <span className="font-osf-mono text-[13px] text-osf-muted"><span className="text-osf-leaf">~/osf ❯</span> ./register --ep {ep.num}</span>
        <h2 id="reg-h" className="m-0 text-[clamp(34px,3.6vw,48px)] font-semibold leading-[1.02] tracking-[-0.02em]">Let's get you in.</h2>
        <p className="m-0 text-[17px] leading-[1.55] text-osf-muted">Drop your email or WhatsApp number to start. Registered before? Use the same one and we'll fill in what we know.</p>
      </div>
      {already ? (
        <div role="status" className="flex flex-col gap-4 rounded-[20px] border border-osf-leaf-edge bg-osf-leaf-wash p-5">
          <span className="text-lg font-semibold">You are already registered for this episode!</span>
          <span className="text-[15px] leading-[1.55] text-osf-muted">Zoom emails your personal meeting link. Not there? Check spam, then write to <a className={policyLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</span>
          <div className="flex flex-wrap gap-2.5">
            <Button to={sitePaths.episodes} size="sm">BACK TO EPISODES</Button>
            <Button variant="outline" size="sm" onClick={() => { returnToLookup(); setIdentifier(''); }}>USE A DIFFERENT EMAIL</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleLookup} className="flex flex-col gap-4">
          <Field id="r1-id" label="Email or WhatsApp number">
            <div className="flex gap-2">
              {phone && (
                <>
                  <label htmlFor="r1-cc" className="sr-only">Country code</label>
                  <select id="r1-cc" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} disabled={isSubmitting} className="osf-field !w-[110px] flex-none !pl-3">
                    {countries.map((c) => <option key={c.code} value={c.dial}>{c.dial} · {c.name}</option>)}
                  </select>
                </>
              )}
              <input id="r1-id" name="identifier" type="text" required disabled={isSubmitting} value={identifier} maxLength={phone ? max : 255}
                onChange={(e) => { const v = e.target.value; if (!looksLikePhone(v) || v.length <= max) setIdentifier(v); }}
                autoComplete="email" placeholder="you@example.com or 98765 43210" aria-describedby={lookupError ? 'r1-err' : undefined} className="osf-field min-w-0 flex-auto py-4 text-[17px]" />
            </div>
            {phone && <span className="text-[13px] text-osf-muted">{identifier.length}/{max} digits</span>}
          </Field>
          {lookupError && <p id="r1-err" role="alert" className="m-0 text-[15px] font-semibold text-osf-danger">{lookupError}</p>}
          <Button type="submit" block disabled={isSubmitting} className="py-[18px] disabled:opacity-60">{isSubmitting ? 'CHECKING…' : 'CONTINUE ->'}</Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {['FREE TO JOIN', 'ZOOM LINK BY EMAIL', 'LIVE Q&A'].map((t) => <Tag key={t} className="px-3 py-2">✓ {t}</Tag>)}
      </div>
    </>
  );
}

// Interest chips fill the v1.0 "excited_topic" text field; an existing free-text answer stays editable below.
function InterestPicker({ value, onChange, error }) {
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  const picked = new Set(parts.filter((p) => interestChips.includes(p)));
  const other = parts.filter((p) => !interestChips.includes(p)).join(', ');
  const emit = (chips, rest) => onChange([...interestChips.filter((c) => chips.has(c)), rest.trim()].filter(Boolean).join(', '));
  return (
    <fieldset id="r2-interests" aria-describedby="r2-interests-help" className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="mb-3 p-0 text-[15px] font-semibold">What tech are you most hyped about right now?<span className="text-osf-danger"> *</span></legend>
      <span id="r2-interests-help" className={cx('text-sm', error ? 'font-semibold text-osf-danger' : 'text-osf-muted')}>
        {error ? 'Pick at least one so we can plan future episodes.' : 'Tap all that apply — it helps us pick future episodes.'}
      </span>
      <div className="flex flex-wrap gap-2">
        {interestChips.map((c) => (
          <ToggleChip key={c} variant="check" pressed={picked.has(c)} onClick={() => { const next = new Set(picked); if (!next.delete(c)) next.add(c); emit(next, other); }}>{c}</ToggleChip>
        ))}
      </div>
      <label htmlFor="r2-other" className="sr-only">Anything else</label>
      <input id="r2-other" type="text" value={other} onChange={(e) => emit(picked, e.target.value)} placeholder="Anything else? e.g. Rust, Web3, game dev" className="osf-field" />
    </fieldset>
  );
}

function DetailsStep({ reg }) {
  const { studentFound, studentData, needsProfileDetails, showField, showGroup, countryCode, setCountryCode, validationErrors, setValidationErrors,
    whatsappOptIn, setWhatsappOptIn, isSubmitting, checkingEmail, registerError, handleFormChange, handleRegister, checkEnteredEmail, returnToLookup } = reg;
  const err = (k) => validationErrors[k] && <span className="text-[13px] font-semibold text-osf-danger">{validationErrors[k]}</span>;
  const field = (k) => cx('osf-field', validationErrors[k] && '!border-osf-danger');
  const select = (name, options) => (
    <select id={`r2-${name}`} name={name} value={studentData[name]} onChange={handleFormChange} className={field(name)}>
      <option value="">Select…</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const consent = <WhatsAppConsent tone="osf" number={studentData.whatsapp_number ? `${countryCode} ${studentData.whatsapp_number}` : ''} checked={whatsappOptIn} onChange={setWhatsappOptIn} disabled={isSubmitting} />;
  const actions = (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={returnToLookup} disabled={isSubmitting} className="flex-[1_1_140px] py-[17px]">GO BACK</Button>
      <Button type="submit" disabled={isSubmitting || checkingEmail} className="flex-[999_1_260px] py-[18px] disabled:opacity-60">{isSubmitting ? 'RESERVING…' : 'RESERVE YOUR SEAT ->'}</Button>
    </div>
  );
  const errorBox = registerError && <p role="alert" className="m-0 rounded-2xl border border-osf-danger/40 bg-red-50 p-4 text-[15px] text-osf-danger">{registerError}</p>;

  if (!needsProfileDetails) {
    return (
      <form onSubmit={handleRegister} className="flex flex-col gap-7">
        <div className="flex flex-col gap-2.5">
          <h2 id="r2-h" className="m-0 text-[clamp(32px,3.4vw,44px)] font-semibold leading-[1.02] tracking-[-0.02em]">Welcome back, {studentData.full_name}!</h2>
          <p className="m-0 text-base leading-[1.55] text-osf-muted">We found your profile. Please confirm your registration for this upcoming episode.</p>
        </div>
        {consent}
        {errorBox}
        {actions}
      </form>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h2 id="r2-h" className="m-0 text-[clamp(32px,3.4vw,44px)] font-semibold leading-[1.02] tracking-[-0.02em]">{studentFound ? 'Complete your profile' : 'Tell us about you.'}</h2>
        <p className="m-0 text-base leading-[1.55] text-osf-muted">
          {studentFound
            ? `Welcome back${studentData.full_name ? `, ${studentData.full_name}` : ''}! Please add the missing details below before confirming your registration. Your saved details will be kept.`
            : 'We need a few details to complete your profile. If you joined before with a different contact number, please use your existing email so we can keep your event history together.'}
          {' '}Fields marked <span className="font-bold text-osf-danger">*</span> are required.
        </p>
      </div>
      <form onSubmit={handleRegister} noValidate className="flex flex-col gap-7">
        {showGroup('full_name', 'email', 'whatsapp_number', 'country_code', 'gender', 'is_dos_club_member') && (
          <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
            <legend className="mb-4 p-0 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ ABOUT YOU</legend>
            {showField('full_name') && <Field id="r2-full_name" label="Full name" required hint={err('full_name')}>
              <input id="r2-full_name" name="full_name" type="text" autoComplete="name" value={studentData.full_name} onChange={handleFormChange} placeholder="As you'd like it on your attendance record" className={field('full_name')} />
            </Field>}
            {showGroup('email', 'whatsapp_number', 'country_code') && <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              {showField('email') && <Field id="r2-email" label="Email" required hint={err('email') || (checkingEmail && <span className="text-[13px] text-osf-muted">Checking for a saved profile…</span>)}>
                <input id="r2-email" name="email" type="email" autoComplete="email" value={studentData.email} onChange={handleFormChange} onBlur={checkEnteredEmail} disabled={checkingEmail} placeholder="you@example.com" className={field('email')} />
              </Field>}
              {showGroup('whatsapp_number', 'country_code') && <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="r2-wa" className="text-[15px] font-semibold">WhatsApp number<span className="text-osf-danger"> *</span></label>
                <div className="flex gap-2">
                  <label htmlFor="r2-cc" className="sr-only">WhatsApp country code</label>
                  <select id="r2-cc" value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setWhatsappOptIn(false); setValidationErrors((prev) => ({ ...prev, country_code: null })); }} className="osf-field !w-[110px] flex-none !pl-3">
                    {countries.map((c) => <option key={c.code} value={c.dial}>{c.dial} · {c.name}</option>)}
                  </select>
                  <input id="r2-wa" name="whatsapp_number" type="tel" inputMode="tel" autoComplete="tel-national" value={studentData.whatsapp_number} onChange={handleFormChange} readOnly={studentFound && !showField('whatsapp_number')} placeholder="98765 43210" className={cx(field('whatsapp_number'), 'min-w-0 flex-auto')} />
                </div>
                {err('whatsapp_number')}{err('country_code')}
              </div>}
            </div>}
            {showGroup('gender', 'is_dos_club_member') && <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              {showField('gender') && <Field id="r2-gender" label="Gender" required hint={err('gender')}>{select('gender', ['Male', 'Female', 'Other'])}</Field>}
              {showField('is_dos_club_member') && <Field id="r2-is_dos_club_member" label="Are you a DOS Club member?" required hint={err('is_dos_club_member')}>{select('is_dos_club_member', ['Yes', 'No'])}</Field>}
            </div>}
          </fieldset>
        )}
        {showGroup('college', 'degree', 'department', 'year_of_study') && (
          <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
            <legend className="mb-4 p-0 font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ WHERE YOU STUDY</legend>
            {showField('college') && <Field id="r2-college" label="College name" required hint={err('college')}>
              <input id="r2-college" name="college" type="text" value={studentData.college} onChange={handleFormChange} placeholder="e.g. Descience Institute of Technology" className={field('college')} />
            </Field>}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-4">
              {showField('degree') && <Field id="r2-degree" label="Degree" required hint={err('degree')}><input id="r2-degree" name="degree" type="text" value={studentData.degree} onChange={handleFormChange} placeholder="e.g. B.Tech" className={field('degree')} /></Field>}
              {showField('department') && <Field id="r2-department" label="Department / branch" required hint={err('department')}><input id="r2-department" name="department" type="text" value={studentData.department} onChange={handleFormChange} placeholder="e.g. Computer Science" className={field('department')} /></Field>}
              {showField('year_of_study') && <Field id="r2-year_of_study" label="Year of study" required hint={err('year_of_study')}>{select('year_of_study', ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Passed Out'])}</Field>}
            </div>
          </fieldset>
        )}
        {showField('excited_topic') && (
          <InterestPicker value={studentData.excited_topic} error={validationErrors.excited_topic}
            onChange={(v) => handleFormChange({ target: { name: 'excited_topic', value: v } })} />
        )}
        {consent}
        {errorBox}
        {actions}
      </form>
    </>
  );
}

const beforeFriday = [
  ['Watch your inbox', <>Zoom sends the meeting email. Not there? Check spam, then write to <a className={policyLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>],
  ['Bring your questions', 'Bring questions to the live Q&A. Come back next Friday.'],
  ['Stay 30+ minutes', 'Attendance comes from the Zoom report — 30 minutes is the default threshold to be marked present.']
];

function DoneStep({ ep, reg }) {
  const { next, episodes } = useSiteData();
  const following = next && next.num !== ep.num ? next : episodes.filter((e) => e.upcoming && e.num > ep.num).sort((a, b) => a.num - b.num)[0];
  const lead = ep.speakers[0];
  const calendar = googleCalendarUrl(ep);
  return (
    <div className="min-h-full bg-osf-mist" style={{ backgroundImage: 'radial-gradient(circle at 50% 12%, rgba(76,175,80,0.18), transparent 28%), linear-gradient(rgba(16,34,43,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,34,43,0.04) 1px, transparent 1px)', backgroundSize: '100% 100%, 64px 64px, 64px 64px' }}>
      <main className="mx-auto flex max-w-[1040px] flex-col gap-10 px-4 pb-24 pt-14 sm:px-6">
        <div className="w-full max-w-[560px] self-center"><StepProgress current={2} /></div>

        <div className="flex flex-col items-center gap-[18px] text-center">
          <span className="font-osf-mono text-[13px] text-osf-muted"><span className="text-osf-leaf">~/osf ❯</span> ./register --ep {ep.num} <span className="text-osf-leaf">✓ success</span></span>
          <h1 className="m-0 text-[clamp(48px,6.4vw,88px)] font-semibold leading-none tracking-[-0.03em]">You're in.<br /><GradientText>See you {ep.weekday === 'Fri' ? 'Friday' : 'there'}.</GradientText></h1>
          <p className="m-0 max-w-[600px] text-[19px] leading-[1.55] text-osf-muted">Your seat for Episode {ep.num} is saved. Zoom will email your personal meeting link — keep it private, it's yours.</p>
          {reg.zoomPending && <p className="m-0 max-w-[600px] text-[15px] leading-[1.55] text-osf-muted">Your Zoom registration is being processed. Zoom will email your personal meeting link once confirmed.</p>}
          <p className="m-0 max-w-[600px] text-[15px] leading-[1.55] text-osf-muted">
            {reg.savedWhatsappChoice === null ? 'Your WhatsApp preference could not be confirmed. Please contact the event team at' : `WhatsApp event updates: ${reg.savedWhatsappChoice ? 'opted in' : 'not opted in'}. You can request a change at`} <a className={policyLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>

        <div className="osf-grid-dark osf-grid-dark-sm flex flex-wrap overflow-hidden rounded-[28px] bg-osf-ink text-white shadow-[0_30px_70px_-30px_rgba(16,34,43,0.5)]">
          <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-[18px] p-6 sm:p-8">
            <div className="flex flex-wrap gap-2"><Tag variant="mint">#OSF-EP{ep.num} · CONFIRMED</Tag><Tag variant="outlineDark">{ep.mode.toUpperCase()} · ZOOM</Tag></div>
            <h2 className="m-0 text-[clamp(24px,2.6vw,30px)] font-semibold leading-[1.1]">{ep.title}</h2>
            {lead && <span className="text-base text-osf-fog">with <strong className="text-white">{ep.speakers.map((s) => s.name).join(' & ')}</strong>{lead.role && ` · ${lead.role}`}</span>}
          </div>
          {/* Dashed tear line sits on the left on wide screens and on top once the stub wraps below. */}
          <div className="relative flex flex-[1_1_260px] flex-col justify-center gap-4 border-t-2 border-dashed border-osf-slate p-6 sm:p-8 min-[740px]:border-l-2 min-[740px]:border-t-0">
            {[['DATE', ep.dateLong], ['TIME', ep.time]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5"><span className="font-osf-mono text-[11px] tracking-[0.1em] text-osf-faint">{k}</span><span className="text-2xl font-semibold">{v}</span></div>
            ))}
          </div>
        </div>

        {calendar && (
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button href={calendar} target="_blank" rel="noopener noreferrer" size="sm">ADD TO GOOGLE CALENDAR</Button>
            <Button variant="frost" size="sm" onClick={() => downloadIcs(ep)} className="bg-white">DOWNLOAD .ICS</Button>
          </div>
        )}

        <section aria-labelledby="next-h" className="flex flex-col gap-5">
          <span className="font-osf-mono text-xs font-bold tracking-[0.1em] text-osf-leaf">/ BEFORE {ep.weekday === 'Fri' ? 'FRIDAY' : 'THE EPISODE'}</span>
          <h2 id="next-h" className="m-0 text-[32px] font-semibold leading-none">Three quick things.</h2>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
            {beforeFriday.map(([title, body], i) => (
              <Card as="li" key={title} className="flex flex-col gap-2.5 p-6">
                <span className="font-osf-mono text-[13px] font-bold text-osf-leaf">0{i + 1}</span>
                <span className="text-[19px] font-semibold">{title}</span>
                <span className="text-[15px] leading-[1.55] text-osf-muted">{body}</span>
              </Card>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-osf-night p-6 text-white sm:p-8">
          <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-1.5">
            <span className="text-[28px] font-semibold leading-[1.1]">Better with your squad.</span>
            <span className="text-base text-osf-fog">Send this episode to a friend.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href={whatsappShareUrl(ep)} target="_blank" rel="noopener noreferrer" variant="light" size="sm">WHATSAPP</Button>
            <Button href={linkedinShareUrl(ep)} target="_blank" rel="noopener noreferrer" variant="ghostDark" size="sm">LINKEDIN</Button>
            <CopyLinkButton ep={ep} />
          </div>
        </div>

        <Link to={following ? following.registerPath : sitePaths.episodes} className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-3xl border border-dashed border-osf-dash bg-white/70 px-7 py-6 text-osf-ink no-underline hover:border-osf-leaf">
          {following
            ? <><span className="font-osf-mono text-xs font-bold tracking-[0.08em] text-osf-leaf">UP NEXT · EP {following.num} · {following.weekday.toUpperCase()} {Number(following.day)} {following.mon}</span>
                <span className="flex-[999_1_240px] text-lg font-semibold">{following.title}{following.speakers[0] && ` — ${following.speakers.map((s) => s.name).join(' & ')}`}</span></>
            : <span className="flex-[999_1_240px] text-lg font-semibold">Catch up on past episodes</span>}
          <span className="font-osf-mono text-xs font-bold tracking-[0.08em] text-osf-leaf">ALL EPISODES -&gt;</span>
        </Link>
      </main>
    </div>
  );
}

// /register/:episode_number — all three steps on one URL, as in v1.0.
export default function RegisterPage() {
  const { episode_number: param } = useParams();
  const { state } = useLocation();
  const reg = useRegistration(param);
  const { episodeDetails: details, loading, error, step, identifier, setIdentifier } = reg;
  const prefilled = useRef(false);

  // An email or number typed on the home page carries over into step 1.
  useEffect(() => {
    if (!prefilled.current && state?.identifier && !identifier) { prefilled.current = true; setIdentifier(String(state.identifier)); }
  }, [state, identifier, setIdentifier]);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  if (loading) return <div className={pageBg}><Container as="main" className="px-4 py-24 sm:px-6"><p role="status" className="m-0 text-osf-muted">Loading episode details…</p></Container></div>;
  if (error) {
    return (
      <div className={pageBg}>
        <Container as="main" className="flex flex-col items-start gap-5 px-4 py-24 sm:px-6">
          <h1 className="m-0 text-[clamp(32px,4vw,48px)] font-semibold">Oops!</h1>
          <p role="alert" className="m-0 text-lg text-osf-muted">{error}</p>
          <Button to={sitePaths.home} variant="outline">BACK TO HOME</Button>
        </Container>
      </div>
    );
  }

  const ep = episodeView(details);
  if (step === 3) return <DoneStep ep={ep} reg={reg} />;
  const open = isRegistrationOpen(details);
  const concluded = isEpisodeConcluded(details) && !open;

  if (step === 2) {
    return (
      <div className={pageBg}>
        <Container as="main" className="flex flex-col gap-6 px-4 pb-24 pt-10 sm:px-6">
          <button type="button" onClick={reg.returnToLookup} className={cx(backLink, 'cursor-pointer border-0 bg-transparent p-0')}>&lt;- BACK TO STEP 1</button>
          <div className="flex flex-wrap items-start gap-7">
            <aside className="flex min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-4">
              <div className="osf-grid-dark osf-grid-dark-sm flex flex-col gap-[18px] rounded-[28px] bg-osf-ink p-6 text-white sm:p-7">
                <Tag variant="mint" className="self-start">YOU'RE REGISTERING FOR · EP {ep.num}</Tag>
                <h1 className="m-0 text-[26px] font-semibold leading-[1.12]">{ep.title}</h1>
                <SpeakerLine ep={ep} size="sm" />
                <div className="flex flex-col gap-2 border-t border-osf-rule pt-4 font-osf-mono text-[13px] text-osf-cloud">
                  {ep.dateLong && <span><span className="text-osf-mint">date</span> {ep.dateLong}</span>}
                  {ep.time24 && <span><span className="text-osf-mint">time</span> {ep.time24}</span>}
                  <span><span className="text-osf-mint">where</span> {ep.mode.toLowerCase()} · zoom · free</span>
                </div>
              </div>
              <Card className="flex items-start gap-3 rounded-[20px] p-5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-osf-leaf" />
                <p className="m-0 text-sm leading-[1.55] text-osf-muted">We only use these details to manage your registration, Zoom access and attendance. The attendee list is never shown publicly.</p>
              </Card>
            </aside>
            <section aria-labelledby="r2-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 rounded-[28px] border border-osf-line bg-white p-6 shadow-osf-card sm:p-10">
              <StepProgress current={1} />
              <DetailsStep reg={reg} />
            </section>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className={pageBg}>
      <Container as="main" className="flex flex-col gap-6 px-4 pb-24 pt-10 sm:px-6">
        <Link to={sitePaths.episodes} className={backLink}>&lt;- ALL EPISODES</Link>
        <div className="flex flex-wrap items-start gap-7">
          <EpisodePanel ep={ep} details={details} />
          <section aria-labelledby="reg-h" className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
            <Card className="flex flex-col gap-8 rounded-[28px] p-6 shadow-osf-card sm:p-10">
              {open ? <><StepProgress current={0} /><IdentifyStep ep={ep} reg={reg} /></> : <ClosedNotice details={details} concluded={concluded} />}
            </Card>
            {open && <p className="m-0 px-2 text-[13px] leading-normal text-osf-muted">Protected by reCAPTCHA. By continuing you agree to our <Link className={policyLink} to="/terms-of-service">Terms of Service</Link> and <Link className={policyLink} to="/code-of-conduct">Code of Conduct</Link>. See how we use your details in our <Link className={policyLink} to="/privacy-policy">Privacy Policy</Link>.</p>}
            {ep.upcoming && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-osf-night px-6 py-6 text-white sm:px-7">
                <div className="flex min-w-0 flex-[999_1_260px] flex-col gap-1">
                  <span className="text-[21px] font-semibold">Better with your squad.</span>
                  <span className="text-[15px] text-osf-fog">Send this episode to a friend.</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button href={whatsappShareUrl(ep)} target="_blank" rel="noopener noreferrer" variant="light" size="sm">SHARE ON WHATSAPP</Button>
                  <CopyLinkButton ep={ep} />
                </div>
              </div>
            )}
          </section>
        </div>
      </Container>
    </div>
  );
}
