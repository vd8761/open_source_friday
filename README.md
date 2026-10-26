# Open Source Friday

React/Vite frontend and Express/PostgreSQL backend for student episode registration and the admin roster.

## Zoom-only email workflow

1. A student registers for an episode. The application confirms the registration and saves a durable Zoom enrollment job in the same PostgreSQL transaction.
2. After that transaction commits, the worker registers the saved student name/email with the episode's Zoom meeting.
3. Zoom sends its own registration confirmation email with the personal join link. **The application sends no emails**: it has no SMTP transport, registration confirmation email, or separate invitation email.
4. The admin roster shows **Registered with Zoom**, **Zoom registration pending**, **Zoom registration failed**, or **Not registered with Zoom**. This tracks enrollment, not inbox delivery. The application does not claim that a Zoom email was delivered or read.
5. Failed Zoom enrollment retries every minute with exponential backoff from one minute to one hour while the episode is active. Admin **Register with Zoom** retries enrollment immediately and can enroll a registered student for an inactive episode too. Already-enrolled students are not re-registered.
6. For an enrolled student, **Resend in Zoom** opens the meeting management page. In Zoom, open **Registration → Manage Registrants → View**, select the student, and click **Resend Confirmation Email**. See [Zoom's documented resend workflow](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068036). The application does not use an undocumented resend endpoint or send an email itself.

The worker processes up to ten jobs per run. Work persists across restarts. On startup, students already marked registered with Zoom are switched from obsolete application-email states to Zoom-managed confirmation, clearing old SMTP failures without re-registering them or sending another email.

## Production configuration

Use Node.js 20 or later. The deployed frontend uses Vercel; its `VITE_API_URL` points to the separate Render backend. Configure `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` on **Render**, then redeploy the backend. Vercel frontend environment variables do not propagate to Render.

For local development, copy `server/.env.example` to `server/.env` and populate PostgreSQL, admin/JWT, reCAPTCHA, VAPID and Zoom settings. Never commit `.env`. SMTP settings are not needed and are not used.

Create and activate a Server-to-Server OAuth app under [Zoom Marketplace → Developers → Created apps](https://marketplace.zoom.us/user/build) in the Zoom account that owns the meetings. Add these [granular admin scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/):

- `meeting:read:meeting:admin` — validate linked meetings and their confirmation-email settings.
- `meeting:write:registrant:admin` — register a student.
- `meeting:read:list_registrants:admin` — reconcile approved registrations before creating a registrant, including after a timeout or process crash.

Credentials and OAuth tokens remain server-side. Do not add them to `VITE_` variables. Server-to-server access covers meetings in your own Zoom account; unrelated host accounts need a separate OAuth design.

The repository assumes the existing base schema (`students`, `episodes`, `episode_registrations`) already exists; it does not include that original schema. Startup adds the Zoom job table and any missing integration columns, including `episodes.zoom_meeting_id`, `episodes.is_silent` and `zoom_registration_jobs.zoom_registered_at`. The database role needs migration permissions. Existing application-email timestamp/message-ID columns are retained for history but are no longer used as Zoom email-delivery evidence. Existing Zoom enrollment timestamps remain unknown when the original registration time was not recorded.

## Admin setup

1. Schedule a non-recurring Zoom meeting with a licensed host, registration required and automatic approval. Match its schedule to the application episode.
2. Under Zoom **Email Settings**, enable registrant confirmation emails. The application validates this when linking a meeting.
3. Under Zoom **Registration → Edit → Questions**, leave Last Name optional for students with a single-word full name, or collect their real surname. The application does not invent surnames. First Name and Email are supported; extra required registration questions are not mapped.
4. In the application **Create/Edit Episode → Step 2**, enter the 9–11 digit Zoom Meeting ID without spaces or a URL. Leave blank for events without Zoom. Linking a meeting to an episode with existing registrations queues those students too.
5. A linked meeting cannot be changed/removed after students have registered, to avoid invitations pointing to different meetings. Create a new episode for a different meeting.
6. Review **Zoom Invitation** in the episode roster. Use **Register with Zoom** to retry a failed enrollment and **Resend in Zoom** for confirmation email resends. Use the roster refresh button to update state.

No meeting creation, calendar-attendee synchronization, webinar/recurring-meeting integration, cancellation sync, or email-delivery webhooks are included. Deleting an application registration does not revoke a Zoom registration already created. Approved registrants are reconciled by email before enrollment; there is no distributed transaction between PostgreSQL and Zoom.

## Silent episodes

In **Create/Edit Episode → Step 4**, enable **Silent mode (no push notifications)** before saving. It suppresses the new-episode subscriber announcement and automatic 30-minute/starting-now push alerts. The dashboard marks these episodes with a Silent badge. Zoom enrollment and Zoom confirmation emails continue normally. Silent episodes remain visible on the public website; this option does not make them private.

Silent mode defaults to off and persists on edits. Turning it on later suppresses future automated episode pushes; it cannot retract an announcement already sent. Manually composed broadcasts remain under admin control.

Deploy **both backend and frontend**, then reload the dashboard before creating a silent episode. The frontend checks `/api/admin/episode-capabilities` before saving and blocks the save if the backend does not support silent mode.

## Run and check

Run backend commands from `server/` so dotenv loads `server/.env`:

```sh
cd server
npm ci
npm start
```

Set `VITE_API_URL` and the existing reCAPTCHA site key for the frontend, then run from `client/`:

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

Tests use mocked PostgreSQL and Zoom services. They exercise HTTP registration/admin endpoints, transactional queueing/rollback, OAuth, reconciliation, retries, single-word names, silent mode, migration of old SMTP failures and Zoom-only confirmation. Tests also reject any attempt to load an application email sender. They do not verify live database migrations, actual Zoom enrollment or inbox delivery. Run a staging smoke test with a test Zoom meeting and mailbox before production.

## Authenticated administration APIs

- `GET /api/admin/episodes/:episode_id/registrations` includes Zoom enrollment state, meeting ID, recorded enrollment time and the latest enrollment error. Successful Zoom registrations never display an obsolete SMTP failure.
- `POST /api/admin/episodes/:episode_id/registrations/:student_id/zoom-invitation` enrolls/retries only a confirmed application registration. Returns `200` and `zoom_managed` after successful enrollment, or `202` while pending/failed and awaiting retry. It does not resend an email for an existing registrant. Requires the existing admin bearer token.
- `GET /api/admin/episodes/:id/zoom-registrations` exposes job diagnostics without personal join links.

Private join links remain in the database for reconciliation. They are not returned by the public student lookup or admin roster. Restrict database access appropriately.
