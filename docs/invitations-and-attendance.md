# Bulk invitations and Zoom attendance

## Workflow

CSV audience → Sender registration invitation → application registration → Zoom enrollment and Zoom confirmation → attendance sync.

CSV imports create invitation contacts only. They do not create students, episode registrations or Zoom registrants. The existing registration flow continues to use Zoom for its only confirmation email. Bulk invitations are separate, admin-started Sender marketing campaigns with unsubscribe links. No application SMTP sender is used.

## Dependencies and activation

1. An existing Sender account with marketing campaign API access and enough subscriber/send allowance. Its public free plan advertises 2,500 subscribers and 15,000 emails/month; confirm the actual account allowance before sending. Account webhooks are not required by this implementation.
2. A Sender API access token with subscriber, group, campaign and campaign-report access. Create it in Sender Settings → API access tokens. Add it to Render; never paste it into chat or a VITE variable.
3. Verify `descienceosclub.com` in Sender, including its SPF, DKIM and DMARC configuration. Confirm `info@descienceosclub.com` is an authorized sending address. Supply the real organization mailing address for the footer.
4. Configure these variables on the **Render backend**:

   ```dotenv
   PUBLIC_APP_URL=https://osf.descienceosclub.com
   SENDER_API_TOKEN=<secret token entered directly in Render>
   SENDER_FROM_EMAIL=info@descienceosclub.com
   SENDER_FROM_NAME=Descience Open Source Club
   SENDER_POSTAL_ADDRESS=<real organization mailing address>
   ```

5. Keep the existing `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET`. On the Zoom Server-to-Server OAuth app, add these reporting scopes and reactivate/reauthorize if Zoom requests it:
   - `report:read:meeting:admin` — validates the meeting instance and date.
   - `report:read:list_meeting_participants:admin` — retrieves participant attendance.
   The host needs an eligible paid Zoom account with a licensed Meetings user and report access. The plan on Render does not determine Zoom reporting availability.
6. Keep Vercel's `VITE_API_URL` pointed at the backend. No Sender secret belongs on Vercel's frontend.
7. Backend Node.js >=20 and PostgreSQL are already required. Run `npm ci --omit=dev` in `server/`. New runtime package: `csv-parse`; `@electric-sql/pglite` is a development-only PostgreSQL test runtime. Existing server dependencies received compatible security patches.
8. Run the backend continuously so its minute/15-minute workers can run. The production service was observed on Free compute on 27 October 2026. Free compute sleeps and cannot provide dependable in-process scheduling. Confirm always-on service compute before relying on workers; no plan change is included in this release. PostgreSQL advisory locks coordinate multiple instances.

Deploy the backend first and the frontend second from `qa-zoom-integration`. Startup adds tables and indexes without replacing registrations. All campaigns start as drafts and require an authenticated admin to click Start. Restarting a server cannot start a draft. Do not run a production bulk campaign until the single-recipient test is verified.

## Admin workflow

Dashboard → **Email Invitations**:

1. Choose an upcoming active episode with registration open. Campaigns cannot start or continue after the 30-minutes-after-start registration cutoff.
2. Upload CSV (up to 5 MB / 10,000 rows), or paste CSV. Required `Email`; optional `Full Name`, `College`, `Department`, `Year of Study`, `Status`.
3. Optionally filter college, department or year. Preview shows valid count, duplicates, exclusions and up to 100 eligible contacts.
4. Enter subject/message and batch settings. Default: 50 contacts every 15 minutes, with a pause after the first non-empty batch for delivery review. This controls pacing, not inbox placement. Existing Sender subscriber suppression is checked again while processing each batch. This check can further reduce the preview count.
5. Confirm the contacts opted in to episode invitations; save a draft. Review the draft and use **Start sending** separately. For testing, use a CSV containing a single opted-in address you control that is not already registered for the selected episode.
6. First-batch review is enabled by default. If recipients remain, sending pauses after the first batch. Inspect recipient inbox placement and Sender reports, then explicitly confirm review before Resume. Campaigns that fit in one batch complete immediately. You may disable first-batch review when preparing an established, tested campaign. Pause/resume as needed. A batch already submitted to Sender cannot be recalled by this tool. Sender dispatch of that batch is asynchronous; the interval controls submissions.
7. Use **Sync Sender reports** or allow the 15-minute worker to update recent campaigns. Export the recipient report as CSV.

The worker excludes current episode registrations, known suppressions, and contacts already invited in another campaign for the same episode. Reusing a CSV does not reactivate Sender subscribers. New contact/group membership creation disables automatic Sender workflow triggering. Subject/message are escaped and rendered as text with an application registration button, postal address and Sender unsubscribe link.

### Uncertain sends

Before the send API request, the batch records `sending` durably. A timeout, generic error or crash leaves it paused or requiring review, never automatically resubmitted. The sole bounded exception is an exact “No subscribers selected” send rejection: after Sender confirms an unsent DRAFT, the same worker waits one minute, rechecks readiness, local eligibility and draft status, then retries that same draft once. Longer provider cooldowns are preserved for manual resumption. A second rejection stops for review. The durable sending fence remains in place throughout the wait, so a restart requires reconciliation. Use **Check send outcome in Sender**:

- If Sender confirms SENT/SENDING, the batch is reconciled without resending.
- If Sender explicitly confirms an unsent DRAFT without a sent timestamp, it can be rebuilt and submitted after Resume.
- Unknown/scheduled/other outcomes stay blocked for review.

Pausing or restarting cannot bypass a rate-limit cooldown. Sender groups/drafts created for interrupted preparations are retained in Sender; unused drafts are never sent by this tool.

## Sending-quality protections

Before later batches, the worker refreshes Sender reports. It pauses on a reported complaint, on a hard-bounce rate of at least 0.5% after 20 submitted recipients, or on a combined hard/soft bounce rate of at least 2% after 20 submitted recipients. These are application guardrails, not guarantees or provider acceptance thresholds. Missing/unavailable reports pause subsequent sending. Reports can be delayed and do not report every recipient spam-folder placement.

CSV opt-outs take precedence over active duplicate rows, regardless of row order, and are retained in the application's suppression list when a draft is created. Invitations include a clear organization identity, opt-in explanation, help-by-reply guidance, mailing address and unsubscribe link. Sender remains responsible for generating compliant email headers; verify those in a real application campaign test.

## Delivery and open evidence

Campaign API reports synchronize sent, open, click, hard/soft bounce, unsubscribe and complaint events. Hard bounces, unsubscribes and complaints also enter the application's suppression list. Events are idempotent, and reports paginate without following arbitrary provider URLs.

**A sent event does not prove delivery.** The documented marketing API does not establish a recipient delivery endpoint. This tool therefore displays **Not reported** instead of inferring delivery from sent/open events. Real-time per-recipient delivery tracking remains dependent on a verified delivery-event/report capability in the actual Sender account. If the account supplies a delivery export, use **Import explicit delivery evidence** with this campaign's report:

```csv
Email,Status,Timestamp
student@example.com,delivered,2026-10-26T13:30:00Z
```

The import only updates recipients already submitted in that campaign. It records admin, time and source (`admin_imported_sender_report`); the UI labels this evidence as imported. It does not claim to authenticate a manually uploaded file as a signed provider event. Invalid imports roll back completely.

Delivered means accepted by the recipient's mail server, not confirmed inbox placement. Open detection is approximate because images can be blocked or preloaded. Clicks can include security scanners. Registration is measured from the application's confirmed registration, independently of email opens. Sender tracking applies only to Sender invitations, not Zoom's confirmation emails.

## Attendance

Dashboard → episode **Attendance** (also accessible from the roster):

- Default minimum for Present is **30 minutes**, as agreed. It is editable per report import/sync.
- Present: at least 30 minutes. Partial: joined but less than the threshold. Absent: no matched session in a complete report. Not synced: no evidence from a complete report yet.
- Join/leave intervals are merged across reconnects and simultaneous devices before totaling time. Duration-only rows are labeled estimated because overlap cannot be established.
- Matching uses the saved Zoom registrant ID first, then an unambiguous normalized email. A supplied unknown registrant ID is not overridden by email. Names alone are never matched.
- Review unidentified participants and match them to the correct registration. Host/guest participants may legitimately remain unmatched. An absent record can require review if an unidentified participant might be that student.
- Manual Present/Partial/Absent corrections require a reason. Corrections are audited, can be cleared, and survive later syncs.
- Syncs replace a snapshot idempotently and preserve manually matched identical participant rows. A different meeting UUID cannot silently replace an episode's session.

### Automatic sync

Every 15 minutes, the backend checks episodes in the past seven days with a Zoom meeting and a parseable start–end time. It first requests attendance at least 30 minutes after the configured end, and retries delayed/failed reports with backoff. A successful complete report is not automatically overwritten later; use manual Sync for a refresh. It validates the report's meeting ID and IST date against the episode, and stores the actual session UUID. Empty/all-zero reports do not mark students absent. The page shows the last automatic failure and next retry time.

Attendance reporting scopes are additional to enrollment scopes. The API method is `GET /report/meetings/{meetingUUID}/participants?include_fields=registrant_id`, with report detail validation and pagination. Use the correct meeting UUID when a meeting ID has been reused. Zoom may omit identifying information for guests, so unmatched review is necessary. A forwarded personal join link is not identity verification.

### CSV fallback

Export participant data from Zoom's Meeting and webinar history report. Import columns:

```csv
User Email,Name,Duration (Minutes),Registrant ID
student@example.com,Example Student,40,known-registrant-id
```

`Duration Seconds` is also supported. Optional `Join Time`/`Leave Time` must be ISO values with explicit timezone; convert local display timestamps or omit those columns and use durations. Supply the session UUID/reference. Use the actual Zoom UUID if a later API sync is intended. Only check **complete report** after confirming the file represents the entire session. Otherwise absent is not inferred. Export attendance and review the audit history in the tool.

## Verification and operational limits

Automated tests use an isolated in-process PostgreSQL database and fake provider responses, with no real emails or Zoom registrations. They cover CSV validation, 600+ audience processing, consent and authentication, cross-campaign duplicates, opt-outs, paced batches, uncertain send recovery, report synchronization, delivery-import rollback, meeting UUIDs, attendance duration/matching, corrections and background sync.

Before the first bulk run, test a single real Sender invitation and a short Zoom session with two participants (host + test attendee). Confirm sender authentication, application registration, native Zoom confirmation, and report matching. Configure attendance minimum for a test as needed, then restore 30 minutes. Live account validation remains required; API payloads/permissions and actual delivery behavior cannot be established from local tests alone.

References:
- [Sender API](https://api.sender.net/)
- [Sender campaign creation](https://api.sender.net/campaigns/create-campaign/)
- [Sender subscriber status](https://api.sender.net/subscribers/get-one/)
- [Sender sent campaign emails](https://api.sender.net/statistics/sents/)
- [Sender domain requirements](https://www.sender.net/help/transactional-emails/sender-identity-and-domain-requirements/)
- [Sender pricing](https://www.sender.net/pricing/)
- [Zoom reporting requirements](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0073594)
- [Zoom reporting scopes](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/)

## Morning production test and readiness

Code is prepared for a controlled production test. A full 600+ recipient rollout remains pending live verification of the application integration and inbox placement.

1. Deploy the latest branch to Render, then Vercel. Confirm Email Invitations and Attendance appear in the dashboard. Adding variables does not start draft campaigns.
2. Set the five Sender/public-URL variables above, including `SENDER_FROM_EMAIL=info@descienceosclub.com`. Keep secrets on Render.
3. Create an upcoming silent test episode. Import only a few opted-in test addresses you control; use one recipient per batch and keep first-batch review enabled. Existing registrations are excluded, so use an episode these recipients have not registered for.
4. Save the draft, review it and Start. Verify the first application-generated message's From address, registration URL, working unsubscribe URL, and list-unsubscribe headers. Confirm SPF/DKIM/DMARC in the received original message. Do not interpret a sent/open event as proof of inbox placement.
5. Check actual placement in the test mailboxes. Only confirm first-batch review and Resume when the results are acceptable. If mail is placed in Spam, investigate sender/content/engagement reputation with Sender support before expanding the audience. Authentication alone does not guarantee inbox placement.
6. Complete application registration, confirm the native Zoom email, and run a small Zoom meeting (host plus test attendee). After reports are available, verify matching and duration in Attendance. The agreed production default is 30 minutes.
7. Increase sending gradually to recently engaged, opted-in contacts. Keep pause/review available. Avoid switching domains/IPs to evade filtering; address the underlying deliverability issue.

The direct Sender test on 26 October 2026 reached `descienceosclub@gmail.com` at 11:36 PM IST but was placed in Spam. SPF, DKIM and DMARC passed. That test confirms receipt only; it does not establish reliable inbox placement or validate the application API worker. No further live email was sent while adding these protections.

Deliverability references: [Sender guidance](https://www.sender.net/help/deliverability-compliance/email-deliverability-best-practices/), [Sender delivery metrics](https://www.sender.net/help/deliverability-compliance/how-email-deliverability-works/), [Gmail sender guidelines](https://support.google.com/mail/answer/81126).

## Current testing status on 27 October 2026

Two approved test recipients confirmed Inbox placement after sending through Sender’s interface. API campaign sends still return HTTP 403 and are paused pending Sender developer support. No successful automated bulk pilot has been established. Follow the [hosting SOP](event-hosting-sop.md); do not treat the earlier morning checklist as activation approval.

## Sender support response evidence

For a new HTTP 403 from campaign submission, the authenticated campaign detail now retains a redacted provider response. Open **Sender response evidence** and use **Download response evidence**. The JSON records UTC capture time, endpoint, method, status, allowlisted response headers, response text and truncation/read-error flags. The body is capped at 32 KiB before redaction. No request headers or payload are stored; redacted text is not a byte-for-byte original. Review the download before privately sharing it with Sender support. Old failures have no recoverable raw body. Downloading never retries sending; keep outcome reconciliation and a small approved test audience in place.


## Sender group readiness fix — 30 October 2026

Sender support traced the earlier send failure to eventual consistency: a group was created, recipients added and the send attempted within about two seconds, before the background audience count updated. Group assignment in campaign creation was already correct. This was not evidence of a missing audience field or a need to change API credentials.

The worker now follows this order:

1. Create a fresh private batch group, check subscriber status and add only eligible contacts, with automation disabled.
2. Poll `GET /v2/groups/{id}` every five seconds, for up to two minutes. Require exactly the expected `active_subscribers` count and no reported recalculation still in progress. Missing, malformed, wrong-group or oversized counts stop preparation; a count mismatch never authorises a send.
3. Create the campaign with that group only after readiness, then recheck registration closure, pause and local suppressions/registrations before submitting.
4. Apply the single verified-draft retry described above only for the exact audience rejection. Other HTTP 403 responses, network failures, unknown statuses and scheduled/sent campaigns remain review-only.

Existing paused drafts are not automatically resumed by deployment. For the support-named `KrQN6z`, inspect its actual audience, linked event, registration cutoff and provider status before choosing **Check send outcome in Sender** and **Resume**. A known-unsent old draft is rebuilt with fresh eligibility checks; do not bypass event closure or restore a sample just to send it. Do not start all paused campaigns together. Run one approved recipient pilot after deployment, check actual delivery, then consider the bulk queue.

No new environment variables, permissions or database migration are required for this fix. Deploy the Render backend. Zoom confirmation remains independent of Sender campaigns.

Primary API reference: https://api.sender.net/groups/get-group/ (`active_subscribers`, `is_recalculating_subscribers`). The provider support explanation above is owner-supplied incident evidence; live delivery still needs verification.


## Sender API request pacing — 30 October 2026

Email batch pacing and API request pacing are separate. A batch of 50 entirely new contacts can require 155 API requests (contact checks/creation/rechecks, a private group, readiness check, draft and send). The Sender client now serialises preparation, submission and report calls through one queue per backend process. Starts are at least two seconds apart by default; a lower reported `X-RateLimit-Limit` slows them further. Zero `X-RateLimit-Remaining` waits for a valid `X-RateLimit-Reset`, or a conservative minute when missing/invalid. HTTP 429 honours `Retry-After`; a long cooldown pauses rather than holding a backend request indefinitely.

No transport or send retry is hidden in the pacing queue. A 429 still pauses the application campaign, and restarting the backend does not automatically resume it. The paused rate-limit message now shows the saved **earliest next attempt** time in IST and explicitly requires manual Resume. This is not a guarantee that the provider has reset. Other applications using the same Sender account or other backend instances can consume API allowance, so reported limits remain authoritative.

Contact preparation can take several minutes. The worker checks pauses and event registration cutoff between contacts, as well as before sending. Do not increase batch size to get around throttling. Registration for Episode 16 on 30 October 2026 closes at 7:30 PM IST under the existing rule; a paused invitation campaign cannot resume after that cutoff even when the Sender cooldown expires. No cutoff is extended by this fix.
