function episodeDate(episode) {
  const value = episode.event_date;
  // Legacy callers may still hold a pg DATE parsed at local midnight.
  if (value instanceof Date)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value || '').slice(0, 10);
}
function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const instant = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === day;
}
function clockMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (match[3]) hour = hour % 12 + (/PM/i.test(match[3]) ? 12 : 0);
  return hour * 60 + minute;
}
function episodeInstant(episode, end = false) {
  const day = episodeDate(episode);
  const parts = String(episode.event_time || '').split(/\s*[-–]\s*/);
  const minutes = clockMinutes(end ? (parts.length === 2 ? parts[1] : '') : parts[0]);
  if (!validDay(day) || parts.length > 2 || minutes === null) return null;
  return Date.parse(`${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+05:30`);
}
const episodeStart = episode => episodeInstant(episode);
const episodeEnd = episode => episodeInstant(episode, true);
function validSchedule(episode) {
  const start = episodeStart(episode), end = episodeEnd(episode);
  return start !== null && end !== null && end > start;
}
function registrationClosesAt(episode) {
  const start = episodeStart(episode);
  return start === null ? null : start + 30 * 60 * 1000;
}
function registrationIsOpen(episode, now = Date.now()) {
  const close = registrationClosesAt(episode);
  return episode.is_active !== false && episode.is_registration_open !== false && close !== null && now <= close;
}
// Legacy databases store event_date as TIMESTAMP. Date.toJSON otherwise shifts
// local midnight to the preceding UTC day before Express sends the response.
function episodeJsonReplacer(key, value) {
  return key === 'event_date' && this[key] instanceof Date ? episodeDate({ event_date: this[key] }) : value;
}
module.exports = { episodeDate, episodeStart, episodeEnd, validSchedule, registrationClosesAt, registrationIsOpen, episodeJsonReplacer };
