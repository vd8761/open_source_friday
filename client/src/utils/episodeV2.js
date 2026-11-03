import { adminApi } from './adminApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const emptyEpisodeV2 = { speaker_ids: [], domain: '', agenda: [], short_blurb: '' };

// Loads the v2.0 fields of an existing episode (speakers in display order, domain, agenda, blurb).
export async function loadEpisodeV2(episodeNumber) {
  const res = await fetch(`${API_URL}/api/v2/episodes/${episodeNumber}`);
  const data = await res.json();
  if (!data.success) return emptyEpisodeV2;
  const e = data.episode;
  return { speaker_ids: e.speakers.filter(s => s.id).map(s => s.id), domain: e.domain || '', agenda: e.agenda || [], short_blurb: e.short_blurb || '' };
}

// Saves them after the v1.0 episode save. Linking speakers also rewrites the v1.0 presenter fields.
export async function saveEpisodeV2(episodeId, v2) {
  await adminApi(`/episodes/${episodeId}/speakers`, { method: 'PUT', body: { speaker_ids: v2.speaker_ids } });
  await adminApi(`/episodes/${episodeId}/v2-details`, { method: 'PUT', body: { domain: v2.domain || null, agenda: v2.agenda.map(a => a.trim()).filter(Boolean), short_blurb: v2.short_blurb } });
}

// Past-episode lounge: public recap plus attendee-only notes, links and recording.
export const emptyLounge = { recap: '', lounge_notes: '', recording_url: '', materials: [] };
export const loadLounge = async (episodeId) => (await adminApi(`/episodes/${episodeId}/lounge`)).lounge;
export const saveLounge = (episodeId, lounge) => adminApi(`/episodes/${episodeId}/lounge`, { method: 'PUT', body: lounge });
