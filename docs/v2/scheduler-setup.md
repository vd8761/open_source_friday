# Background jobs on Render Free (option B, chosen 2 Nov 2026)

Render Free spins the API down after 15 minutes without traffic, and in-process node-cron stops while it sleeps. v2.0 therefore lets a free external scheduler run each job over HTTP.

## Endpoints

All take `Authorization: Bearer <CRON_SECRET>` and accept GET or POST.

| Job | URL | Suggested schedule |
|---|---|---|
| Push reminders (30 min before, starting now) | `/api/cron/reminders` | every minute |
| Zoom enrollment queue | `/api/cron/zoom-worker` | every minute |
| Sender invitation campaigns | `/api/cron/invite-worker` | every minute |
| Sender reports + Zoom attendance sync | `/api/cron/sync` | every 15 minutes |

- Wrong or missing secret → `401`. Unknown job → `404`.
- With `ENABLE_WORKERS` off, the endpoints answer `{ "success": true, "skipped": true }` and run nothing, which is the default outside production.
- `CRON_GRACE_MINUTES` (default `10`) lets a late scheduler call still send a reminder. Each notice is still sent once only: the database claim flag is unchanged. The in-process per-minute cron keeps the v1.0 windows (29–31 min and ±2 min).

## Why not GitHub Actions or Vercel Cron

- **Vercel Cron on Hobby** runs at most once a day (Vercel docs).
- **GitHub Actions** runs scheduled workflows only from the default branch (`main`), so it would need a change on `main`. Its schedules also run every 5 minutes at best and are often delayed.

## Recommended: cron-job.org (free)

cron-job.org is free, runs as often as every minute, and supports custom headers. Its request timeout is 30 seconds. A job keeps running on the server if the scheduler times out, and the worker guards prevent overlapping runs.

**Owner action:** create the cron-job.org account. Claude must not create accounts. Then add one cron job per row above, with header `Authorization: Bearer <CRON_SECRET>`.

## Costs and limits to know

- **Instance hours:** calling the API every minute keeps the Render Free service awake all month, about 744 hours. Render gives each workspace **750 free instance hours per month**, so another Free service in the same workspace would run both out early.
- **Render's position on pings:** Render's Free docs neither allow nor forbid keep-alive pings.
- **Preview environment:** keep `ENABLE_WORKERS=false` unless a specific test needs it. When it does, point the scheduler at the preview API only, with its own `CRON_SECRET`.

## Env vars (names only)

- `OSF_ENV`
- `CRON_SECRET`
- `CRON_GRACE_MINUTES`
- `ENABLE_WORKERS`, `ENABLE_ZOOM`, `ENABLE_SENDER`, `ENABLE_PUSH`
- `ZOOM_TEST_ALLOWLIST`, `PUSH_TEST_ALLOWLIST`

**Production must set `OSF_ENV=production`** when v2.0 is released, or every integration stays off.
