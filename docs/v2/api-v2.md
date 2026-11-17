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
| GET | `/api/site-settings` | `club_stats`. |
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

## Domains

`ai_engineer`, `cloud_computing`, `open_source`, `digital_skills`

## Migration

`server/db/migrations/001_v2_core.up.sql` runs on every server start (idempotent, additive). `001_v2_core.down.sql` reverses it; run it manually, after a snapshot, with the server stopped.

## Speaker backfill

```sh
node server/scripts/backfill-speakers.js docs/v2/speakers-approved.csv --episodes docs/v2/episode-domains-approved.csv
```

This is a dry run that prints the plan. Add `--apply` only (owner approved both CSVs on 2 Nov 2026; loaded into v2-dev the same day). Production also needs `--confirm-production` and a Neon snapshot first.

## Local development

- `server/.env` (git-ignored) points only at the Neon `opensourcefriday-v2-dev` copy, with every integration off.
- Run the API on **port 5050**: macOS AirPlay Receiver holds port 5000.
- Point the client at it with `VITE_API_URL=http://localhost:5050`.
- The dev copy has its own admin login, so production credentials do not work there.

## Environments (set up 2 Nov 2026)

| | Website (Vercel) | API (Render) | Database (Neon) |
|---|---|---|---|
| Production | `osf.descienceosclub.com` from `main` | `open-source-friday` (free) from `main` | project "Open Source Friday" |
| v2 preview | `open-source-friday-git-v20-main-…vercel.app` (Vercel login required) | `osf-v2-dev-api.onrender.com` (free) from `v2.0-main` | project `opensourcefriday-v2-dev` (copy of production) |

- **Preview variables in Vercel.** These are set for **Preview, branch `v2.0-main` only**: `VITE_API_URL`, `VITE_RECAPTCHA_SITE_KEY` (a separate test key for `localhost` and `vercel.app`) and `VITE_SHOW_TEST_EVENTS=true`. Production variables are unchanged.
- **Dev API settings.** The dev API runs with `OSF_ENV=preview` and all `ENABLE_*` flags off, so Zoom, Sender, push and workers are dry-runs. It has its own admin login and secrets; none are shared with production.
- **Render free hours.** Render's 750 free hours a month are counted **per workspace**. Before an external scheduler starts calling the production API every minute, move the dev API to its own workspace or delete it. Otherwise production can run out of hours near month end.


### Speaker enquiries

`POST /api/speaker-applications` collects `name`, `email`, `speaker_role`, `company`, `title`, `domain`, `abstract`, `preferred_fridays`, mandatory `mobile_number` (international format including `+`), optional `link` (HTTPS LinkedIn `/in/` profile), and `preferred_call_time` (`9 AM–12 PM`, `1 PM–4 PM`, or `5 PM–8 PM`, IST). Cached clients may still send `role_company`; that original text is retained without inferring separate fields. LinkedIn is optional on both the form and API.

The server normalizes email and mobile formatting, then rejects a second enquiry matching **either email OR mobile**, regardless of session title or status. A duplicate returns success with `duplicate: true` and a polite acknowledgement, without updating the original or sending another team alert. Trashed enquiries also block repeat submissions until permanently removed. Unique hashed contact keys protect new submissions against concurrent retries. Historical duplicates are preserved; a lookup also checks historical rows without keys. The form displays its success state instead of offering a second submission.

Admin endpoints (all require authentication):

- `GET /api/admin/speaker-applications`: paginated compact rows; default status `new`. Pass `status=` for all statuses. Filters: `search` (name, contact, company, session), `status`, `domain`, `from` and `to` (inclusive IST calendar dates), `trash=true`. Sorts: `newest`, `oldest`, `name`, `name_desc`, `title`, `title_desc`, `company`, `company_desc`.
- `GET /api/admin/speaker-applications/:id`: complete submitted enquiry for its separate preview page, including legacy combined role/company, optional profile, callback window, preferred Fridays, abstract and timestamps.
- `GET /api/admin/speaker-applications/export`: same filters and sorting, exports **all matching rows**, not just the visible page. Includes name, role, company, original combined field, mobile, email, LinkedIn/legacy profile link, domain, session, callback window, status and received UTC timestamp. Spreadsheet formulas are escaped. Exports do not confer marketing consent.
- `PATCH /api/admin/speaker-applications/:id`: change active enquiry status.
- `DELETE /api/admin/speaker-applications/:id`: soft-delete into Trash.
- `POST /api/admin/speaker-applications/:id/restore`: restore its previous status.
- `DELETE /api/admin/speaker-applications/:id/permanent` with `{ "confirm": "DELETE" }`: only deletes already-trashed enquiries.
- `GET /api/admin/speaker-applications/trash-ids`, then `POST /api/admin/speaker-applications/empty-trash` with `{ "confirm": "EMPTY TRASH", "ids": [...] }`: permanently delete the reviewed trash snapshot, retaining active rows and items newly trashed by another admin. Permanent actions have explicit confirmation dialogs. No automatic trash cleanup runs.

Deploy frontend and backend from `v2.0-main` together. Startup migrations 009 and 010 are additive and idempotent; existing data stays intact. Team alerts link directly to the saved enquiry preview and include separate role/company for new enquiries. No new environment variables are needed for these changes.

### Speaker thank-you email — review draft only

The application currently sends team alerts, **not speaker acknowledgement emails**. `server/speaker-thank-you.js` renders a branded HTML/plain-text draft. View `docs/email-previews/speaker-thank-you.html`. It thanks the speaker, summarizes the proposal, explains the review process and links the club social pages. It does not imply a confirmed speaker slot, subscribe anyone to marketing or WhatsApp, or promise a response deadline.

The draft is not connected to the sending path; no speaker receipts are enabled or sent by this change. Approve the design/copy before adding automatic sending. Existing notifications are not changed or resent.
