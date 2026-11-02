// Share and calendar links for one episode. All OSF times are IST (UTC+05:30).
// Shared links open the episode's details page, which carries the same banner link preview.
export function episodeUrl(ep) {
  return `${window.location.origin}${ep.recapPath}`;
}
export const whatsappShareUrl = (ep) => `https://wa.me/?text=${encodeURIComponent(`Open Source Fridays · Episode ${ep.num}: ${ep.title} — ${episodeUrl(ep)}`)}`;
export const linkedinShareUrl = (ep) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(episodeUrl(ep))}`;

// "20261030T133000Z" from the episode's IST start/end clock.
function utcStamp(ep, clock) {
  const t = Date.parse(`${ep.isoDay}T${clock}:00+05:30`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function span(ep) {
  const [start, end] = (ep.time24 || '').replace(' IST', '').split(' – ');
  const s = start && utcStamp(ep, start), e = end && utcStamp(ep, end);
  return s && e ? [s, e] : null;
}
export function googleCalendarUrl(ep) {
  const times = span(ep);
  if (!times) return null;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: `Open Source Fridays · EP ${ep.num}: ${ep.title}`, dates: times.join('/'), details: `Zoom will email your personal meeting link.\n${episodeUrl(ep)}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}
export function downloadIcs(ep) {
  const times = span(ep);
  if (!times) return;
  const esc = (v) => v.replace(/[\\,;]/g, (c) => `\\${c}`);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Descience Open Source Club//OSF//EN', 'BEGIN:VEVENT',
    `UID:osf-ep${ep.num}@descienceosclub.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${times[0]}`, `DTEND:${times[1]}`, `SUMMARY:${esc(`Open Source Fridays · EP ${ep.num}: ${ep.title}`)}`,
    `DESCRIPTION:${esc(`Zoom will email your personal meeting link. ${episodeUrl(ep)}`)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `osf-episode-${ep.num}.ics` });
  a.click();
  URL.revokeObjectURL(url);
}
export async function copyEpisodeLink(ep) {
  try { await navigator.clipboard.writeText(episodeUrl(ep)); return true; } catch { return false; }
}
