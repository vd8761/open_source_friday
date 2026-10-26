function episodeEnd(episode) {
  const parts = String(episode.event_time || "").split(/\s*[-–]\s*/);
  if (parts.length < 2) return null;
  const match = parts
    .at(-1)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3]) hour = (hour % 12) + (/PM/i.test(match[3]) ? 12 : 0);
  if (hour > 23 || minutes > 59) return null;
  const day = String(
    episode.event_date instanceof Date
      ? episode.event_date.toISOString()
      : episode.event_date,
  ).slice(0, 10);
  return Date.parse(
    `${day}T${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00+05:30`,
  );
}
module.exports = { episodeEnd };
