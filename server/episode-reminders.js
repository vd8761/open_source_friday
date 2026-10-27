const { episodeDate, episodeStart } = require('./episode-time');
async function processEpisodeReminders(pool, sendPush, now = Date.now()) {
  const { rows } = await pool.query('SELECT * FROM episodes WHERE is_active = true AND is_silent = false');
  for (const episode of rows) {
    if (episode.is_silent) continue;
    const start = episodeStart(episode);
    if (start === null) continue;
    const minutesAway = (start - now) / 60000;
    const kind = !episode.reminder_sent && minutesAway >= 29 && minutesAway <= 31 ? 'reminder'
      : !episode.starting_now_sent && minutesAway >= -2 && minutesAway <= 2 ? 'starting' : null;
    if (!kind) continue;
    const flag = kind === 'reminder' ? 'reminder_sent' : 'starting_now_sent';
    // Claim this notification attempt atomically across overlapping cron runs/instances.
    // Recheck the schedule and silent flag in case an admin edited the fetched row.
    const claimed = await pool.query(`UPDATE episodes SET ${flag} = true
      WHERE id = $1 AND ${flag} = false AND is_active = true AND is_silent = false
      AND event_date = $2::date AND event_time = $3 RETURNING id`,
      [episode.id, episodeDate(episode), episode.event_time]);
    if (!claimed.rows.length) continue;
    await sendPush({
      title: kind === 'reminder' ? '⏰ Starting in 30 Minutes!' : '🚀 Episode Starting Now!',
      body: kind === 'reminder' ? `"${episode.title}" by ${episode.presenter_name} begins soon. Join now!`
        : `"${episode.title}" by ${episode.presenter_name} is live! Open the app to join.`,
      icon: episode.cover_photo_url?.startsWith('http') ? episode.cover_photo_url : '/favicon.png',
      badge: '/favicon.png', url: `/register/episode-${episode.episode_number}`,
      tag: `${kind === 'reminder' ? 'reminder-30' : 'live'}-ep-${episode.episode_number}`,
    });
  }
}
module.exports = { processEpisodeReminders };
