// All OSF schedules are India Standard Time, regardless of the viewer's timezone.
export function calendarDay(value) { return String(value || '').slice(0, 10); }
export function calendarInputDate(value) {
  const [year, month, day] = calendarDay(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}
export function formatEpisodeDate(value, options) {
  return new Date(`${calendarDay(value)}T00:00:00+05:30`).toLocaleDateString(undefined, { ...options, timeZone: 'Asia/Kolkata' });
}
function instant(episode, end = false) {
  const day = calendarDay(episode?.event_date);
  const date = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== day) return null;
  const parts = String(episode.event_time || '').split(/\s*[-–]\s*/);
  if (parts.length > 2) return null;
  const text = end ? (parts.length === 2 ? parts[1] : '23:59') : parts[0];
  const match = String(text).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (/PM/i.test(match[3]) ? 12 : 0);
  return Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`);
}
export function isEpisodeConcluded(episode, now = Date.now()) {
  return Boolean(episode && (episode.is_active === false || (instant(episode, true) !== null && now > instant(episode, true))));
}
export function isRegistrationOpen(episode, now = Date.now()) {
  const start = episode ? instant(episode) : null;
  return Boolean(episode && episode.is_active !== false && episode.is_registration_open !== false && start !== null && now <= start + 30 * 60 * 1000);
}
export function eventPolicy(episode, now = Date.now()) {
  const start = instant(episode), end = String(episode.event_time || '').split(/\s*[-–]\s*/).length === 2 ? instant(episode, true) : null;
  const is_test = episode.is_test === true, archived = Boolean(episode.archived_at);
  const upcoming = start !== null && start > now, past = end !== null && end <= now;
  return { is_test, archived, upcoming, past, can_delete: is_test || (!archived && upcoming), can_archive: !archived && past };
}
