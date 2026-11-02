#!/usr/bin/env node
// Loads the owner-approved speaker list into speakers + episode_speakers.
// Dry run by default: prints the plan and changes nothing. Pass --apply to write.
//   node scripts/backfill-speakers.js ../docs/v2/speakers-approved.csv [--episodes ../docs/v2/episode-domains-approved.csv] [--apply]
// Production also needs --confirm-production, and must only run after a Neon snapshot (release plan step 2).
const fs = require('node:fs');
const { parse } = require('csv-parse/sync');
const { DOMAINS, nameKey, syncPresenterColumns, initV2DB } = require('../v2-data');

const read = file => parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
const numbers = value => String(value || '').split(/[\s,]+/).filter(Boolean).map(Number);

function validate(speakers, episodes = []) {
  const errors = [], seen = new Map();
  speakers.forEach((s, i) => {
    const line = `speakers row ${i + 2}`;
    if (!s.name) errors.push(`${line}: name is required`);
    if (seen.has(nameKey(s.name))) errors.push(`${line}: duplicate of row ${seen.get(nameKey(s.name))}`);
    seen.set(nameKey(s.name), i + 2);
    if (!numbers(s.episodes).length || numbers(s.episodes).some(n => !Number.isInteger(n))) errors.push(`${line}: episodes must list episode numbers`);
    for (const d of String(s.domains || '').split(/\s+/).filter(Boolean)) if (!DOMAINS.includes(d)) errors.push(`${line}: unknown domain ${d}`);
    if (s.bio && s.bio.length > 1200) errors.push(`${line}: bio over 1200 characters`);
  });
  episodes.forEach((e, i) => {
    if (!Number.isInteger(Number(e.episode_number))) errors.push(`episodes row ${i + 2}: episode_number is required`);
    if (e.domain && !DOMAINS.includes(e.domain)) errors.push(`episodes row ${i + 2}: unknown domain ${e.domain}`);
  });
  return errors;
}

// Returns the plan; writes only when apply is true. Runs in one transaction.
async function backfill(db, speakers, episodes = [], { apply = false } = {}) {
  const errors = validate(speakers, episodes);
  if (errors.length) return { errors, plan: [] };
  const plan = [];
  await db.query('BEGIN');
  try {
    const known = new Map((await db.query('SELECT id,episode_number,presenter_name,presenter_photo_url FROM episodes')).rows.map(r => [r.episode_number, r]));
    const linkedEpisodeIds = [];
    for (const s of speakers) {
      const eps = numbers(s.episodes).map(n => known.get(n));
      const missing = numbers(s.episodes).filter((n, i) => !eps[i]);
      if (missing.length) { errors.push(`${s.name}: episode(s) ${missing.join(', ')} not found`); continue; }
      // Photo from the latest listed episode that has one.
      const photo = [...eps].sort((a, b) => b.episode_number - a.episode_number).find(e => e.presenter_photo_url)?.presenter_photo_url || null;
      const existing = (await db.query('SELECT id FROM speakers WHERE lower(btrim(name))=lower(btrim($1))', [s.name])).rows[0];
      plan.push({ speaker: s.name, action: existing ? 'update' : 'create', episodes: eps.map(e => e.episode_number),
        names_on_episodes: [...new Set(eps.map(e => e.presenter_name))], photo: photo ? 'from episode' : 'none' });
      if (!apply) continue;
      const fields = [s.name, s.honorific || null, s.designation || null, s.company || null, s.bio || null, s.linkedin_url || null,
        String(s.domains || '').split(/\s+/).filter(Boolean)];
      const id = existing
        ? (await db.query(`UPDATE speakers SET name=$2,honorific=$3,designation=$4,company=$5,bio=$6,linkedin_url=$7,domains=$8,
            photo_url=COALESCE(photo_url,$9),updated_at=NOW() WHERE id=$1 RETURNING id`, [existing.id, ...fields, photo])).rows[0].id
        : (await db.query(`INSERT INTO speakers(name,honorific,designation,company,bio,linkedin_url,domains,photo_url)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [...fields, photo])).rows[0].id;
      for (const e of eps) {
        const sort = (await db.query('SELECT COUNT(*)::int AS n FROM episode_speakers WHERE episode_id=$1 AND speaker_id<>$2', [e.id, id])).rows[0].n;
        await db.query('INSERT INTO episode_speakers(episode_id,speaker_id,sort) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [e.id, id, sort]);
        linkedEpisodeIds.push(e.id);
      }
    }
    for (const e of episodes) {
      const ep = known.get(Number(e.episode_number));
      if (!ep) { errors.push(`episode ${e.episode_number} not found`); continue; }
      plan.push({ episode: ep.episode_number, domain: e.domain || null, short_blurb: e.short_blurb || null });
      if (apply) await db.query('UPDATE episodes SET domain=$2,short_blurb=$3 WHERE id=$1', [ep.id, e.domain || null, e.short_blurb || null]);
    }
    if (errors.length) { await db.query('ROLLBACK'); return { errors, plan }; }
    if (apply) await syncPresenterColumns(db, linkedEpisodeIds);
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { errors, plan };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function main(argv) {
  const args = argv.slice(2);
  const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--episodes');
  const episodesFile = args.includes('--episodes') ? args[args.indexOf('--episodes') + 1] : null;
  const apply = args.includes('--apply');
  if (!file) { console.error('Usage: backfill-speakers.js <speakers.csv> [--episodes <episodes.csv>] [--apply]'); process.exitCode = 2; return; }
  if (apply && process.env.OSF_ENV === 'production' && !args.includes('--confirm-production')) {
    console.error('Refusing to write to production without --confirm-production (take a Neon snapshot first).'); process.exitCode = 2; return;
  }
  require('dotenv').config();
  const { Client } = require('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await initV2DB(db);
    const { errors, plan } = await backfill(db, read(file), episodesFile ? read(episodesFile) : [], { apply });
    console.table(plan);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log(apply ? 'Applied.' : 'Dry run only. Nothing was written. Re-run with --apply to write.');
  } finally { await db.end(); }
}

if (require.main === module) main(process.argv).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { backfill, validate, read };
