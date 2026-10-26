# Open Source Friday

React/Vite frontend and Express/PostgreSQL backend for episode registration and the admin roster.

## Zoom invitation workflow

1. A student registers for an episode. The application saves the registration and a durable invitation job in the same PostgreSQL transaction.
2. After the registration commits, the application attempts its registration confirmation email, then starts the Zoom invitation worker. Failed invitation work never removes the student's confirmed registration.
3. The worker registers the saved student name/email with that episode's Zoom meeting. It saves the personal Zoom join link and sends a separate invitation email through the application's SMTP service.
4. The admin episode roster shows **Invitation pending**, **Invitation failed**, **Invitation sent**, or **Invitation not sent**, with the last sent time and actionable error. **Send invitation / Resend invitation** works only for students already registered for that episode, including manually sending for inactive episodes. Use the roster's existing refresh button to update status.
5. Failures retry every minute with exponential backoff from one minute to one hour while the episode is active. Admin sends bypass that waiting period. The worker processes up to ten jobs per run; pending jobs persist across restarts.

**Invitation sent** means the SMTP service accepted the recipient. It does not establish inbox delivery or that the student read the email. A later bounce/spam placement requires checking your provider logs; delivery/bounce webhooks are not implemented. The SMTP message ID is stored and returned in the authenticated roster API for investigation.

## Server configuration

Use Node.js 20 or later. Copy `server/.env.example` to `server/.env` and populate your existing PostgreSQL, admin/JWT, reCAPTCHA, SMTP and VAPID settings. Never commit `.env`.

The repository assumes the existing application schema (`students`, `episodes`, and `episode_registrations`) already exists. It does not include the original base schema. On startup the server adds `episodes.zoom_meeting_id` and the `zoom_registration_jobs` table, including invitation status, timestamp, message ID and retry metadata. The database role must have schema migration permissions. Back up the database before deploying schema changes.

Create and activate a Server-to-Server OAuth app under [Zoom Marketplace → Developers → Created apps](https://marketplace.zoom.us/user/build) in the Zoom account that owns the meetings. Set these values in **server/.env**:

```dotenv
ZOOM_ACCOUNT_ID=...
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
```

Add these [granular admin scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/):

- `meeting:read:meeting:admin` — validate the linked meeting.
- `meeting:write:registrant:admin` — register a student.
- `meeting:read:list_registrants:admin` — reconcile existing registrations before creating a registrant, including after a timeout or process crash.

Credentials and OAuth tokens remain server-side. Do not add them to `VITE_` variables. Server-to-server access covers meetings in your own Zoom account; meetings hosted in unrelated accounts need a separate OAuth design.

## Admin setup and operation

1. In Zoom, schedule a non-recurring meeting with a licensed host, registration required and automatic approval. Match its schedule to the application episode. First Name and Email are supported. For students with a single-word name, make Last Name optional in Zoom → Registration → Edit → Questions, or collect the student’s real surname. The integration does not invent surnames. Extra required Zoom questions are not mapped by this integration.
2. In **Create/Edit Episode → schedule step**, enter the 9–11 digit **Zoom Meeting ID** without spaces or a URL. Save. The server validates the Zoom meeting before accepting the association. Leave blank for events without Zoom.
3. Linking a meeting to an episode with existing registered students queues those students too. A meeting cannot be replaced/removed once students have registered to avoid invitations pointing to different meetings. Use a new episode for a different meeting.
4. In the episode roster, review **Zoom Invitation**. Click **Send invitation** or **Resend invitation** after a student reports a missing email. Fix credentials, SMTP or meeting settings if status reports a failure, then retry. Invitations always use the student's saved email, not an arbitrary recipient supplied to the send endpoint.
5. Verify sender/domain authentication with your email provider and inspect its logs using the stored message ID if a student still cannot find the invitation.

The application sends the invitation itself; Zoom's own registration confirmation email is optional. Disable Zoom's native confirmation email if you want to avoid two invitation emails. No meeting creation, calendar attendee sync, webinar/recurring-meeting integration, cancellation sync, or email delivery webhooks are included. Deleting an application registration does not revoke a Zoom registration that was already created.

## Silent episodes

In **Create/Edit Episode → Step 4**, enable **Silent mode (no push notifications)** before saving. Silent mode suppresses the new-episode subscriber announcement and automatic 30-minute/starting-now push alerts. The dashboard marks these episodes with a Silent badge. Registration confirmations, Zoom enrollment, invitation emails and admin resend continue normally. Silent episodes remain visible on the public website; this option does not make an episode private.

The setting defaults to off for normal episodes and persists on edits. Turning it on later suppresses future automated episode pushes; it cannot retract an announcement that was already sent. Manually composed push broadcasts remain under admin control.

Deploy **both backend and frontend**, restart the backend to add `episodes.is_silent BOOLEAN NOT NULL DEFAULT FALSE`, then reload the dashboard before recreating Episode 16. The frontend checks the authenticated `/api/admin/episode-capabilities` endpoint before saving a silent episode and blocks the save if the server does not support silent mode. Use Zoom Meeting ID `97640410908` for the test meeting scheduled for October 26, 2026, 8:00–9:00 PM IST.

## Run and check

Run backend commands from `server/` so dotenv loads `server/.env`:

```sh
cd server
npm ci
npm start
```

For the frontend, set `VITE_API_URL` and the existing reCAPTCHA site key, then run from `client/`:

```sh
npm ci
npm run dev
```

Checks from the repository root:

```sh
npm test --prefix server
npm run build --prefix client
npm run lint --prefix client
```

Tests use mocked PostgreSQL, Zoom and SMTP services. They exercise the HTTP registration/admin endpoints, transactional enqueue/rollback behavior, OAuth, reconciliation, retry behavior, invitation rejection and manual resend. They do not verify a live database migration, real Zoom enrollment or real inbox delivery. Run a staging smoke test with your own database, a test Zoom meeting and a mailbox before production.

## Authenticated administration APIs

- `GET /api/admin/episodes/:episode_id/registrations` includes invitation state, last sent time, SMTP message ID and latest error.
- `POST /api/admin/episodes/:episode_id/registrations/:student_id/zoom-invitation` sends/resends only for a confirmed registration; returns `200` after SMTP acceptance or `202` if queued/failed and awaiting retry. Requires the existing admin bearer token.
- `GET /api/admin/episodes/:id/zoom-registrations` exposes Zoom job state for troubleshooting, without personal join links.

Private join links are stored in the database and sent only to the registered student's email. Restrict database access appropriately. Before registering again, the worker reconciles approved Zoom registrations by email. There is no distributed transaction with Zoom/SMTP: a crash after email acceptance but before database commit can produce a duplicate invitation on retry. Rows use PostgreSQL locking to prevent concurrent workers from handling the same job.
