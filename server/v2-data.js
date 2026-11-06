const fs = require('node:fs');
const path = require('node:path');
const { episodeStart, episodeEnd } = require('./episode-time');
const { InputError } = require('./outreach-csv');

// The four original domains. Admins can add more; the domains table is the list in use (see domainKeys).
const DOMAINS = ['ai_engineer', 'cloud_computing', 'open_source', 'digital_skills'];
async function domainKeys(db, { activeOnly = false } = {}) {
  return (await db.query(`SELECT key FROM domains${activeOnly ? ' WHERE is_active' : ''}`)).rows.map(r => r.key);
}
// "Data & Analytics" -> "data_and_analytics"
const domainKey = label => String(label).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const migrationDir = path.join(__dirname, 'db/migrations');
// Every *.up.sql in order (001_, 002_, …). Each is idempotent, so running them on every start is safe.
const migrations = fs.readdirSync(migrationDir).filter(f => f.endsWith('.up.sql')).sort().map(f => fs.readFileSync(path.join(migrationDir, f), 'utf8'));

// PGlite runs multi-statement SQL through exec(); node-postgres accepts it in query() without parameters.
async function initV2DB(db) {
  for (const sql of migrations) await (db.exec ? db.exec(sql) : db.query(sql));
}

// Speaker name keys used to de-duplicate legacy presenter_name values ("Mr. A B" = "A B").
const nameKey = name => String(name || '').replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, '').replace(/,\s*ph\.?d\.?$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

const isDataImage = value => typeof value === 'string' && value.startsWith('data:image/');
// Never send embedded base64 images in lists; serve them from their own cacheable URL instead.
const imageUrl = (value, route) => !value ? null : isDataImage(value) ? route : value;

function sendDataImage(res, value) {
  const match = String(value || '').match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/);
  if (match) {
    res.set('Content-Type', `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}`);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(match[2], 'base64'));
  }
  if (/^https:\/\//.test(value || '')) return res.redirect(value);
  res.status(404).json({ success: false, error: 'Photo not found' });
}

function publicSpeaker(row) {
  const version = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  return {
    id: row.id, name: row.name, honorific: row.honorific || null, designation: row.designation || null,
    company: row.company || null, bio: row.bio || null, linkedin_url: row.linkedin_url || null, domains: row.domains || [], is_featured: row.is_featured === true,
    photo_url: imageUrl(row.photo_url, `/api/speakers/${row.id}/photo?v=${version}`),
  };
}

const episodeColumns = `e.id,e.episode_number,e.title,e.event_date,e.event_time,e.event_mode,e.is_active,e.is_registration_open,
  e.is_test,e.archived_at,e.domain,e.agenda,e.short_blurb,e.presenter_name,e.presenter_designation,
  (e.cover_photo_url IS NOT NULL AND e.cover_photo_url <> '') AS has_cover,
  (e.presenter_photo_url IS NOT NULL AND e.presenter_photo_url <> '') AS has_presenter_photo`;

// Episodes with their speakers. Episodes not yet linked to speakers fall back to the v1.0 presenter_* columns.
async function loadEpisodes(db, { episodeNumber, withDescription = false } = {}) {
  const values = episodeNumber == null ? [] : [episodeNumber];
  // The detail view adds the public recap and counts of what the attendee lounge holds (never its links).
  const detail = withDescription ? `,e.description,e.recap,(e.lounge_notes IS NOT NULL AND e.lounge_notes <> '') AS has_notes,
    jsonb_array_length(e.materials) AS materials_count,(e.recording_url IS NOT NULL) AS has_recording` : '';
  const { rows } = await db.query(`SELECT ${episodeColumns}${detail} FROM episodes e
    ${values.length ? 'WHERE e.episode_number=$1' : ''} ORDER BY e.episode_number DESC`, values);
  if (!rows.length) return [];
  const links = (await db.query(`SELECT es.episode_id,es.sort,s.* FROM episode_speakers es JOIN speakers s ON s.id=es.speaker_id
    WHERE es.episode_id = ANY($1::int[]) ORDER BY es.episode_id,es.sort,s.id`, [rows.map(r => r.id)])).rows;
  return rows.map(e => {
    const linked = links.filter(l => l.episode_id === e.id).map(publicSpeaker);
    const speakers = linked.length ? linked : e.presenter_name ? [{
      id: null, name: e.presenter_name, designation: e.presenter_designation || null, company: null, legacy: true,
      photo_url: e.has_presenter_photo ? `/api/episodes/${e.episode_number}/presenter-photo` : null,
    }] : [];
    return {
      id: e.id, episode_number: e.episode_number, title: e.title, event_date: e.event_date, event_time: e.event_time,
      event_mode: e.event_mode, is_active: e.is_active, is_registration_open: e.is_registration_open, is_test: e.is_test === true,
      archived: Boolean(e.archived_at), domain: e.domain || null, agenda: e.agenda || [], short_blurb: e.short_blurb || null,
      cover_url: e.has_cover ? `/api/episodes/${e.episode_number}/cover` : null, speakers,
      speaker_keys: linked.length ? links.filter(l => l.episode_id === e.id).map(l => `id:${l.id}`) : e.presenter_name ? [`name:${nameKey(e.presenter_name)}`] : [],
      ...(withDescription ? { description: e.description, recap: e.recap || null, lounge: { has_notes: e.has_notes, materials_count: e.materials_count, has_recording: e.has_recording } } : {}),
    };
  });
}

// Every number shown on the site is computed from episodes and speakers; nothing is hand-edited.
function computeStats(episodes, now = Date.now(), keys = DOMAINS) {
  // Past episodes count even when deactivated (v1.0 deactivates old episodes); only test events are excluded.
  const counted = episodes.filter(e => !e.is_test);
  const shipped = counted.filter(e => episodeEnd(e) !== null && episodeEnd(e) <= now);
  const upcoming = counted.filter(e => e.is_active !== false && !e.archived && episodeEnd(e) !== null && episodeEnd(e) > now)
    .sort((a, b) => episodeStart(a) - episodeStart(b));
  const appearances = new Map();
  for (const e of [...shipped, ...upcoming]) for (const key of new Set(e.speaker_keys)) appearances.set(key, (appearances.get(key) || 0) + 1);
  const domains = Object.fromEntries([...keys, 'unassigned'].map(d => [d, 0]));
  for (const e of shipped) domains[e.domain || 'unassigned'] = (domains[e.domain || 'unassigned'] || 0) + 1;
  const next = upcoming[0];
  return {
    episodes_shipped: shipped.length,
    upcoming_count: upcoming.length,
    speakers_count: appearances.size,
    repeat_speakers: [...appearances.values()].filter(n => n > 1).length,
    episodes_by_domain: domains,
    next_episode: next ? (({ speaker_keys, ...rest }) => rest)(next) : null,
  };
}

// Writes the v1.0 presenter_* columns from the linked speakers so v1.0 pages stay correct until v2.0 is live.
async function syncPresenterColumns(db, episodeIds) {
  for (const id of new Set(episodeIds)) {
    const { rows } = await db.query(`SELECT s.* FROM episode_speakers es JOIN speakers s ON s.id=es.speaker_id
      WHERE es.episode_id=$1 ORDER BY es.sort,s.id`, [id]);
    if (!rows.length) continue;
    const lead = rows[0];
    const name = rows.map(s => [s.honorific, s.name].filter(Boolean).join(' ')).join(' & ');
    const designation = [lead.designation, lead.company].filter(Boolean).join(', ') || null;
    await db.query('UPDATE episodes SET presenter_name=$2,presenter_designation=$3,presenter_photo_url=COALESCE($4,presenter_photo_url) WHERE id=$1',
      [id, name, designation, lead.photo_url || null]);
  }
}

// Input validation shared by admin and public endpoints.
const text = (value, label, max, { required = false } = {}) => {
  if (value == null || value === '') { if (required) throw new InputError(`${label} is required.`, 400); return null; }
  if (typeof value !== 'string' || value.trim().length > max) throw new InputError(`${label} must be ${max} characters or fewer.`, 400);
  const trimmed = value.trim();
  if (required && !trimmed) throw new InputError(`${label} is required.`, 400);
  return trimmed || null;
};
const domain = (value, keys = DOMAINS) => {
  if (value == null || value === '') return null;
  if (!keys.includes(value)) throw new InputError('Choose a valid domain.', 400);
  return value;
};
const photo = value => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new InputError('Photo must be an image upload or https URL.', 400);
  if (/^https:\/\//.test(value) && value.length <= 1000) return value;
  // About 2 MB of image data once base64-encoded.
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 2_800_000) return value;
  throw new InputError('Photo must be a JPEG, PNG or WebP under 2 MB, or an https URL.', 400);
};

module.exports = {
  DOMAINS, domainKeys, domainKey, initV2DB, nameKey, loadEpisodes, computeStats, syncPresenterColumns, publicSpeaker, sendDataImage,
  validate: { text, domain, photo },
};
