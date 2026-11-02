import { Link } from 'react-router-dom';
export const WHATSAPP_NOTICE_VERSION = 'event-whatsapp-2026-10-29';
// The notice text is versioned (WHATSAPP_NOTICE_VERSION); only the look may change between tones.
const tones = {
  v1: { wrap: 'my-5 space-y-3 text-left', box: 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-4', legend: 'px-1 text-sm font-bold text-slate-800', optional: 'font-normal text-slate-500', label: 'flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700', box2: 'mt-1 h-4 w-4 shrink-0 accent-emerald-600', number: 'mt-3 text-xs font-semibold text-slate-600', help: 'mt-3 text-xs leading-relaxed text-slate-600', link: 'underline', policy: 'text-xs leading-relaxed text-slate-500', policyLink: 'text-dos underline' },
  osf: { wrap: 'flex flex-col gap-4 text-left', box: 'm-0 flex flex-col gap-3 rounded-[20px] border border-osf-leaf-edge bg-osf-leaf-wash p-5', legend: 'px-2 text-[15px] font-semibold', optional: 'font-normal text-osf-muted', label: 'flex cursor-pointer items-start gap-3 text-[15px] leading-normal', box2: 'mt-0.5 h-[22px] w-[22px] flex-none accent-osf-leaf', number: 'm-0 text-[13px] font-semibold text-osf-ink', help: 'm-0 text-[13px] leading-[1.55] text-osf-muted', link: 'osf-link underline underline-offset-2', policy: 'm-0 text-[13px] leading-[1.55] text-osf-muted', policyLink: 'osf-link underline underline-offset-2' },
};
export default function WhatsAppConsent({checked,onChange,number,disabled=false,tone='v1'}) {
  const t = tones[tone];
  return <div className={t.wrap}>
    <fieldset disabled={disabled} className={t.box}>
      <legend className={t.legend}>Event updates on WhatsApp <span className={t.optional}>(optional)</span></legend>
      <label className={t.label}>
        <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className={t.box2} aria-describedby="whatsapp-consent-help"/>
        <span>I agree to receive WhatsApp updates from Descience Open Source Club about this event, including reminders and schedule changes.</span>
      </label>
      {number&&<p className={t.number}>Number for these updates: {number}</p>}
      <p id="whatsapp-consent-help" className={t.help}>You can register without opting in. This choice does not include future event promotions, calls, or adding you to groups. To stop updates, ask the event team on WhatsApp or email <a className={t.link} href="mailto:info@descienceosclub.com?subject=Stop%20WhatsApp%20event%20updates">info@descienceosclub.com</a> with the event and your number.</p>
    </fieldset>
    <p className={t.policy}>We use your details to manage registration, Zoom access and attendance. Please read our <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className={t.policyLink}>Privacy Policy</Link>, <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className={t.policyLink}>Terms of Service</Link> and <Link to="/code-of-conduct" target="_blank" rel="noopener noreferrer" className={t.policyLink}>Code of Conduct</Link> before registering.</p>
  </div>;
}
