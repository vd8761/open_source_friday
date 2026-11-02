# v2.0 API additions

v1.0 endpoints are unchanged. List responses never embed base64 images; photos have their own cacheable URLs.

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v2/episodes` | All episodes with `speakers[]`, `domain`, `agenda`, `short_blurb`, `cover_url`. No description, no embedded images. Episodes not yet linked to speakers fall back to the v1 presenter fields (`legacy: true`). |
| GET | `/api/v2/episodes/:n` | One episode including `description`. `:n` accepts `16` or `episode-16`. |
| GET | `/api/episodes/:n/presenter-photo` | v1 presenter photo as an image (fallback before backfill). |
| GET | `/api/speakers` | Published speakers with their episodes, `episode_count`, `is_repeat`. |
| GET | `/api/speakers/:id/photo` | Speaker photo (published speakers only). |
| GET | `/api/stats` | Computed, cached 60 s: `episodes_shipped`, `upcoming_count`, `speakers_count`, `repeat_speakers`, `episodes_by_domain`, `next_episode`, plus editable `club_stats`. Test events are excluded. |
| GET | `/api/tips` | Published tips; tip of the week first. |
| GET | `/api/site-settings` | `club_stats`, `registration_mode`. |
| POST | `/api/speaker-applications` | Speak at OSF pitch. reCAPTCHA v3 action `speaker_application`, 5 per hour per IP. Preferred dates must be upcoming Fridays (up to 4). No emails are sent. |

## Admin (`Authorization: Bearer <admin JWT>`)

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/admin/speakers` | List all (incl. unpublished) / create. Names are unique, ignoring case. |
| PUT | `/api/admin/speakers/:id` | Full update; omit `photo_url` to keep the photo. Writes through to linked episodes' `presenter_*`. Speakers are never deleted; set `is_published: false`. |
| PUT | `/api/admin/episodes/:id/speakers` | `{ speaker_ids: [lead, ...] }`, up to 8, in display order. |
| PUT | `/api/admin/episodes/:id/v2-details` | `{ domain, agenda: [string], short_blurb }` |
| GET / POST / PUT / DELETE | `/api/admin/tips[/:id]` | Marking a tip of the week clears the previous one. |
| GET / PATCH | `/api/admin/speaker-applications[/:id]` | Filter `?status=`; status is `new`, `contacted`, `scheduled` or `declined`. |
| GET | `/api/admin/site-settings` | All settings. |
| PUT | `/api/admin/site-settings/club_stats` | `{ value: [{ label, value }] }`, up to 8. |
| PUT | `/api/admin/site-settings/registration_mode` | Only `open` is accepted in v2.0. |

## Domains

`ai_engineer`, `cloud_computing`, `open_source`, `digital_skills`

## Migration

`server/db/migrations/001_v2_core.up.sql` runs on every server start (idempotent, additive). `001_v2_core.down.sql` reverses it; run it manually, after a snapshot, with the server stopped.

## Speaker backfill

```sh
node server/scripts/backfill-speakers.js docs/v2/speakers-approved-draft.csv --episodes docs/v2/episode-domains-draft.csv
```

This is a dry run that prints the plan. Add `--apply` only after the owner approves the CSV. Production also needs `--confirm-production` and a Neon snapshot first.
