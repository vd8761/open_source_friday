# v1.0 admin flow — regression checklist for the v2.0 restyle

Source: code on `v2.0-main` at `71561a1` (same as `main`). Static audit only. It has not been walked against a running server yet, because the dev Neon branch does not exist yet (see phase0-report.md).

All admin calls go through `client/src/utils/adminApi.js` → `${VITE_API_URL}/api/admin…` with `Authorization: Bearer <adminToken>` from localStorage. A 401/403 clears the token and sends the browser to `/login`.

Side-effect key: **Zoom** = Zoom API call, **Sender** = Sender.net email API, **Push** = web push to every subscriber, **DB** = database write only.

| Route | Screen (component) | Purpose | API calls | Side-effects |
|---|---|---|---|---|
| `/login` | `Login.jsx` | Admin sign-in | `POST /api/login` (JWT, 24h) | DB read. No lockout, no reCAPTCHA. |
| `/dashboard` | `Dashboard.jsx` + `EventList`, `EventActions` | Upcoming episodes, open/close registration, manual push, push history | `GET /api/episodes`, `PUT /api/episodes/:id/toggle-registration`, `GET /api/admin/push/stats`, `GET /api/admin/push/history`, `POST /api/admin/push/send` | **Push** to all subscribers on send. DB on toggle. |
| (dashboard row actions) | `EventActions.jsx` | Archive / move to trash | `GET /api/admin/episodes/:id/trash-preview`, `POST /api/admin/episodes/:id/archive`, `POST /api/admin/episodes/:id/trash` | DB (soft delete with snapshot) |
| `/admin/episodes/new` | `AdminEpisodeForm.jsx` | Multi-step create: details, schedule, Zoom Meeting ID, silent mode, test flag, cover/presenter photo with crop | `GET /api/admin/episode-capabilities`, `POST /api/episodes` | **Zoom** `validateMeeting` when a Meeting ID is set. **Push** "new episode" to all subscribers unless silent (server.js:420). |
| `/admin/episodes/edit/:id` | `AdminEpisodeForm.jsx` | Edit the same fields | `GET /api/admin/episodes/:id`, `PUT /api/episodes/:id` | **Zoom** `validateMeeting` when Meeting ID or schedule changes. |
| `/admin/episodes/:id/attendees` | `AttendeesPage.jsx` | Registrations, Zoom link status, retry Zoom invite, delete registration, record WhatsApp withdrawal | `GET /api/admin/episodes/:id/attendees`, `POST …/registrations/:studentId/zoom-invitation`, `DELETE …/registrations/:studentId`, `POST …/attendees/:registrationId/whatsapp-withdrawal` | **Zoom** registrant on retry (Zoom then emails the student). DB. |
| `/admin/episodes/:id/attendance` | `AttendanceTool.jsx` | Zoom report sync, CSV import, match, duplicates, overrides, audit, export | `GET/POST /api/admin/episodes/:id/attendance[/sync|/import|/match|/duplicate|/override|/export]` | **Zoom** report read on sync. DB. |
| `/admin/past-events` | `PastEventsPage.jsx` | Finished episodes | `GET /api/admin/events` | none |
| `/admin/archived-events` | `PastEventsPage` (archivedOnly) | Archived episodes, unarchive | `GET /api/admin/archived-episodes`, `POST /api/admin/episodes/:id/unarchive` | DB |
| `/admin/trash` | `EventHistoryPage` (trash) | Restore or purge trashed episodes | `GET /api/admin/episode-trash`, `POST …/:trashId/restore`, `DELETE …/:trashId` | DB (purge is permanent) |
| `/admin/contacts` | `ContactsPage.jsx` | Searchable student directory with event filters | `GET /api/admin/contacts` | none |
| `/admin/students/:studentId` | `StudentActivityPage.jsx` | One student's registrations and attendance | `GET /api/admin/contacts/:studentId` | none |
| `/admin/invitations` (+ `/new`, `/trash`, `/:campaignId`, `/:campaignId/edit`) | `OutreachTool.jsx` | Sender email campaigns from CSV: preview, create, edit, start, pause, sync, reconcile, delivery import, export, trash/restore/delete | `/api/admin/outreach/config`, `/outreach/preview`, `/outreach/campaigns[...]` | **Sender**: Start creates group, contacts and campaign, then sends. Background worker continues sending every minute. |
| account dialog | `AdminAccount.jsx` | Change password | `POST /api/change-password` | DB |

## Background jobs (server.js:822–831, in-process node-cron)

| Schedule | Job | Side-effect |
|---|---|---|
| every minute | `sendEpisodeReminders` | **Push** reminder and "starting now" to all subscribers (skips silent episodes) |
| every minute + at boot | `runZoomWorker` → `processZoomJobs` | **Zoom** registrant creation for queued registrations (Zoom emails the student) |
| every minute + at boot | `runInviteWorker` → `processInviteBatch` | **Sender** campaign sending |
| every 15 min | `syncRecentInviteReports`, `syncRecentAttendance` | Sender report read, Zoom attendance read |

## Public flows that also cause side-effects

- `POST /api/register` → verifies reCAPTCHA (score ≥ 0.5, no action check) → inserts registration → `enqueueZoomRegistrations` (**Zoom** via worker).
- `POST /api/push/subscribe` → stores subscription and sends a one-time **Push** welcome.
