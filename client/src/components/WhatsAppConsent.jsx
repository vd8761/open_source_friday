import { Link } from 'react-router-dom';
export const WHATSAPP_NOTICE_VERSION = 'event-whatsapp-2026-10-29';
export default function WhatsAppConsent({checked,onChange,number,disabled=false}) {
  return <div className="my-5 space-y-3 text-left">
    <fieldset disabled={disabled} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <legend className="px-1 text-sm font-bold text-slate-800">Event updates on WhatsApp <span className="font-normal text-slate-500">(optional)</span></legend>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" aria-describedby="whatsapp-consent-help"/>
        <span>I agree to receive WhatsApp updates from Descience Open Source Club about this event, including reminders and schedule changes.</span>
      </label>
      {number&&<p className="mt-3 text-xs font-semibold text-slate-600">Number for these updates: {number}</p>}
      <p id="whatsapp-consent-help" className="mt-3 text-xs leading-relaxed text-slate-600">You can register without opting in. This choice does not include future event promotions, calls, or adding you to groups. To stop updates, ask the event team on WhatsApp or email <a className="underline" href="mailto:info@descienceosclub.com?subject=Stop%20WhatsApp%20event%20updates">info@descienceosclub.com</a> with the event and your number.</p>
    </fieldset>
    <p className="text-xs leading-relaxed text-slate-500">We use your details to manage registration, Zoom access and attendance. Please read our <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-dos underline">Privacy Policy</Link>, <Link to="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-dos underline">Terms of Service</Link> and <Link to="/code-of-conduct" target="_blank" rel="noopener noreferrer" className="text-dos underline">Code of Conduct</Link> before registering.</p>
  </div>;
}
