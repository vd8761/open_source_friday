const { episodeStart, episodeEnd } = require('./episode-time');
function eventPolicy(episode, now = Date.now()) {
  const start = episodeStart(episode), end = episodeEnd(episode);
  const is_test = episode.is_test === true, archived = Boolean(episode.archived_at);
  const upcoming = start !== null && start > now, past = end !== null && end <= now;
  return { is_test, upcoming, past, archived, can_delete: is_test || (!archived && upcoming), can_archive: !archived && past };
}
module.exports = { eventPolicy };
