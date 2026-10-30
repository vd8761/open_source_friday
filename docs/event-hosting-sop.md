# Open Source Friday Event Hosting SOP

For event coordinators hosts and attendee support

Version 1.0 | 27 October 2026 | All event schedules use India Standard Time

## Before the team starts

The required sequence is invitation to register, application registration, Zoom enrollment, Zoom confirmation email, then attendance. Uploading a CSV creates invitation contacts only. It never registers students or enrolls them in Zoom.

**Release prerequisite:** the scheduling safeguards in this SOP are prepared on the QA branch. The technical owner must deploy and accept the release before the team relies on them.

**Sender status:** the 30 October 2026 one-recipient API pilot reached the approved recipient’s Inbox, confirming the audience-readiness fix. A later 55-recipient campaign paused on API throttling before sending. The request-pacing update spaces and serialises provider requests and honours rate-limit headers. Email batch intervals do not themselves limit API requests. A paused campaign still requires manual Resume after its saved earliest-attempt time, while event registration remains open.

**Automation prerequisite:** the technical owner must confirm always-on backend compute. The Render service was observed on Free compute; a paid workspace alone does not keep its workers running.

| Responsibility | Owner role | Required check |
| --- | --- | --- |
| Schedule and publish | Event coordinator | Application and Zoom dates agree |
| Run the meeting | Zoom host | Correct licensed account and meeting |
| Help participants | Attendee support | Saved registration and Zoom status |
| Close attendance | Attendance owner | Correct session and 30 minute rule |
| Deploy and recover | Technical owner | Both deployments and worker health |

Assign a named person to each role before publishing. One person may hold multiple roles.

**Go or no go:** publish only after the saved date is verified in a fresh page, the Zoom settings are checked, and one approved test registration succeeds. Do not infer readiness from a green deployment alone.

<!-- page -->

## Schedule and publish an event

1. In the correct Zoom account, create a scheduled non-recurring meeting with a licensed host. Use a separate meeting for each real episode. Enable registration, automatic approval and registrant confirmation emails.
2. Set the date, start time and duration in IST. Leave Last Name optional when participants provide a single-word full name. Avoid extra required questions the application does not collect.
3. In the application dashboard, choose Create Episode. Set the title, description, presenter and an episode number that will remain permanent after publishing.
4. In Step 2, enter the event date, start time, end time and the numeric Zoom Meeting ID. The end must be later than the start on the same date. The application does not create or edit a Zoom meeting.
5. In Step 4, choose Silent mode only for samples or intentional quiet updates. Silent means no automatic push announcement or reminder. It does not hide the event, stop Zoom confirmations or prevent an admin from starting a Sender campaign.
6. Save, return to the dashboard, refresh and reopen Edit. Check the persisted date and time. Open the public registration page in a fresh tab and compare it with Zoom.
7. For a real event, have an approved test attendee register through the application. Check the attendees list for Registered with Zoom and ask the attendee to confirm the native Zoom email. Never distribute a student's private join link to everyone.

**Registration closes 30 minutes after the start.** For a 7 PM IST event, the cutoff is 7:30 PM IST. The dashboard Enabled toggle cannot bypass this cutoff. A closed toggle or inactive episode also blocks registration.

**Save rejected:** if Zoom's schedule differs, update Zoom first and save again. If the application says the scheduling update is unavailable, ask the technical owner to deploy the backend before continuing.

<!-- page -->

## Monitor registrations and missing invitations

Use Dashboard, Attendees, then Refresh Data for the correct episode. Confirm the episode number and saved student email before taking action. If the attendees list fails to load, refresh it; do not work from a previous episode's list or an old export.

| Zoom status | Meaning | Team action |
| --- | --- | --- |
| Registered with Zoom | Zoom enrollment exists | Check mailbox then resend in Zoom if needed |
| Zoom registration pending | Saved work is waiting | Refresh and check backend availability |
| Zoom registration failed | Enrollment needs attention | Read error and fix settings before retry |
| Waiting for Zoom limit | Retry cooldown is active | Wait until the recorded retry time |
| Not registered with Zoom | No completed enrollment yet | Verify episode setup then Register with Zoom |
| Zoom not configured | Episode has no linked Zoom meeting | Confirm whether the event needs Zoom |

A successful application registration and successful Zoom enrollment are different states. Registered with Zoom does not prove email delivery or an open. The application does not send an additional SMTP confirmation.

For a missing confirmation:

1. Verify the student's saved email and that the student registered for this episode. Check Inbox, Spam and Promotions.
2. For an enrollment failure, fix the displayed issue, then use Register with Zoom once and refresh. Do not delete and register repeatedly to evade a cooldown.
3. For an existing enrollment, use Resend in Zoom. In Zoom, open the meeting, Registration, Manage Registrants, View, select the approved registrant and choose Resend Confirmation Email.
4. If the saved email is wrong, escalate to the technical owner for an identity-verified correction and Zoom reconciliation. There is no safe profile correction workflow in the current admin UI.

Record the episode, saved email, time, exact status and action in the support log. Keep personal data in the restricted team workspace.

<!-- page -->

## Reschedule or cancel carefully

An application date change does not update Zoom, calendar invitations, previously delivered emails or an old campaign's message text. Treat rescheduling as a coordinated change.

1. Pause any running invitation campaign. Reconcile any batch marked Needs review before deciding whether an email was already submitted.
2. Update the existing meeting's date, start time and duration in Zoom. Keep the meeting identity when students have already registered.
3. Edit the application episode with the matching IST schedule. Save and reopen it. The scheduling release validates Zoom's date, start time and duration and pauses running campaigns when the schedule changes.
4. Verify the public page in a fresh tab. Compare the saved dashboard, reopened editor and Zoom. Do not rely only on the date picker before Save.
5. Review every paused campaign's text. Saved campaign messages cannot currently be edited in the tool. If text is stale, leave the campaign paused and prepare a corrected draft for eligible contacts. Previously submitted recipients remain excluded from another invitation to the same episode.
6. Arrange an approved reschedule announcement for already invited or registered participants. Existing Zoom confirmations are not automatically resent by this application. Use Zoom's confirmed resend workflow where appropriate.

Keep the episode number permanent after registrations or invitation campaigns exist. Do not relabel an old episode as a different event. Episodes with attendance records cannot be rescheduled; create a new episode to preserve history.

For cancellation, disable application registration and pause invitations. Coordinate the Zoom cancellation and attendee communication separately. Deleting an application registration does not cancel its Zoom enrollment or revoke a join link.

**Event retention and cleanup:** On Dashboard, each upcoming event has a visible **Delete** action that moves it to recoverable Trash after a typed confirmation. Once a real event starts it cannot be deleted; after it ends, use **Archive**. Archived registrations and attendance remain available from **Menu → Past events**, filtered to Archived, including attendees list export; dashboard registration totals retain these records. Removing the archive label keeps the event in Past events and registration closed. Past real events cannot be rescheduled into the future or have their registration records deleted.

**Disposable tests:** Select **Test event** when creating a sample. This classification is fixed at creation and allows **Trash test** even after the event ends. Silent mode is a separate notification setting and does not make a real event disposable. Episodes 16 and 17 were owner-designated samples and have already been moved to Trash. Open **Menu → Trash** to restore a deleted event before its number is reused. Restore keeps it inactive, registration closed and campaigns paused. Trash preserves application history in a restricted snapshot; student profiles and external Zoom/Sender records remain. Trashing does not cancel external meetings/campaigns or recall emails. Keep Sender support case drafts until the incident is closed.

<!-- page -->

## Send a bulk registration invitation

Use this procedure only after the Sender API restriction is resolved and the technical owner has cleared the live pilot. From address: info@descienceosclub.com. Keep API keys in Render, never in CSV files or chat.

1. Choose an upcoming active episode with registration enabled and enough time before its 30-minutes-after-start cutoff. Prepare an opted-in audience. Required CSV column: Email. Optional: Full Name, College, Department, Year of Study and Status.
2. Use Email Invitations, choose the episode, upload or paste CSV, apply filters and Preview audience. Review duplicates, invalid addresses, suppressions and prior registrations or invitations. The count can shrink again when Sender subscriber status is checked.
3. First test a small approved audience. Save a draft and review its subject, message, registration link, sender identity and batch settings. Start is a separate action.
4. Keep Pause after the first batch enabled. For a large run, the default is 50 recipients per batch and 15 minutes between submissions. A 600-contact eligible audience requires 12 batches and at least 2 hours 45 minutes between first and last submission, plus review and provider delays. Prefer sending the day before the event.
5. Review actual inbox placement and Sender reports before confirming the pilot and resuming later batches. Batching does not guarantee that messages avoid Spam.
6. Sync Sender reports and export the recipient report. Sent means accepted or reported sent, not delivered. Opens are approximate. Recipient Delivery stays Not reported unless explicit delivery evidence is imported. Use Sender's aggregate delivery report alongside actual recipient confirmation.

**Audience preparation:** a newly created group can need up to two minutes to show its active subscribers. The application checks every five seconds and creates the campaign only when the active count matches the batch. Do not repeatedly press Resume while the worker is running. If the count never becomes ready, the campaign pauses without a send.

**Failure or timeout:** leave the campaign paused. Use Check send outcome in Sender. A confirmed SENT or SENDING batch must be reconciled without resending. An explicitly unsent DRAFT may be rebuilt after review. Unknown or scheduled outcomes remain blocked.

Do not reactivate unsubscribed, bounced, complained or inactive contacts to make a test pass. Stop on a complaint, bounce warning or suspicious result. If someone is globally suppressed, choose another approved test address.

<!-- page -->

## Close attendance after the meeting

Ask participants to register through the application and join with their personal Zoom confirmation link. Sharing a generic link or joining with another account can make attendance unmatched.

1. After the meeting ends, allow Zoom time to prepare its report. Automatic checks begin at least 30 minutes after the scheduled end and run every 15 minutes while the backend is running. This is not a guaranteed completion time.
2. Open Dashboard, Attendance for the correct episode. Keep Minimum minutes for Present at 30 unless the event owner explicitly approves another rule.
3. Choose Sync from Zoom. If an older or incorrect meeting instance is returned, use the correct meeting instance UUID. A numeric meeting ID and a session UUID are different identifiers. The session date must agree with the episode date.
4. Review unmatched guests before finalizing. Matching uses Zoom registrant ID first, then exact normalized email when no registrant ID is supplied. Names alone never establish identity. Match a guest manually only after verifying the person.
5. Review Present, Partial, Absent and Not synced. Present means at least 30 minutes of recorded connection time; Partial means the participant joined for less time. Absence is assigned only after a complete report. Connection time is not proof of attention.
6. Rejoined sessions with timestamps are combined without double-counting overlaps. Duration-only CSV imports cannot identify overlaps across devices, so estimated duration needs review.
7. Export the attendance CSV and review correction history. A manual status correction requires a reason. Recheck guest matches after another sync, especially when the provider changes participant timestamps or duration.

If the API report is unavailable, import a verified Zoom CSV with Email or User Email, Name and Duration (Minutes), or Duration Seconds. Optional Join Time and Leave Time must be ISO timestamps with a timezone. Omit local display timestamps unless converted correctly.

Use the actual Zoom session UUID if a later API sync is expected. Check Complete report only when the file covers the entire session. An arbitrary CSV reference cannot currently be switched to a different UUID in the UI; escalate before replacing the session identity.

<!-- page -->

## Incidents and technical handoff

| Symptom | Immediate action | Escalate to |
| --- | --- | --- |
| Date differs across pages | Refresh and reopen saved episode then compare Zoom | Technical owner |
| Backend unavailable | Wait for a cold start then refresh once | Technical owner |
| Sender HTTP 403 / audience count delay | Keep paused; check the audience-readiness fix and reconcile the send outcome before resuming. Retain the request reference for unexplained errors. | Technical owner / Sender support |
| Zoom HTTP 429 | Honor the retry time and avoid repeated registrations | Technical owner |
| Zoom enrollment succeeds but no email | Check saved email and resend in Zoom | Attendee support |
| Attendance session date differs | Stop and select the correct session UUID | Attendance owner |
| No report or incomplete import | Keep absences unconfirmed | Attendance owner |

The application frontend is on Vercel; its backend is open-source-friday.onrender.com. Zoom and Sender secrets belong on the Render backend. A Vercel environment change does not update Render. After a release, verify both deployments, reopen the admin page and confirm the public page.

The technical owner must verify database backups and a restore drill, always-on service compute, Zoom scope access and worker operation. Do not change a paid plan or credentials as part of routine hosting.

Before the next real event, complete a small host-plus-attendee Zoom drill and verify application registration, Zoom confirmation, the correct session report and attendance matching. For a 30 minute Present test, the attendee must remain for at least 30 minutes; alternatively test a lower threshold on a dedicated sample, then restore 30.

Use a restricted incident log with time in IST, episode and meeting identity, symptom, safe screenshot, provider reference, action taken and owner. Exclude API keys, passwords, passcodes and personal join links. Export only the attendee data needed by the team.

Reference: Zoom managing registration https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0068036

Reference: Render Free compute limits https://render.com/docs/free


## Dashboard and event tables

The dashboard loads a paginated list of upcoming/live workshops and the latest five registrations (episode number, name and college only). Completed events appear automatically in **Menu → Past events**; no manual archive step is required to remove them from the dashboard. Archive is a retained-history label. Totals include completed and archived records. Use Refresh Data for the latest figures; the dashboard does not poll continuously.

Past events supports search by episode/title/presenter, IST event date range, mode, real/test status, archive status, sorting and 10/25/50 rows per page. Select **Apply filters** to query the server. Select **Reset filters** to start over. Event titles open their public page in a new tab; the grouped Edit button edits an event and Delete moves eligible events to Trash after confirmation.

Choose **Attendees** on an event to see its saved registrations. Search by name/email/phone and filter by college, department, year, membership, registration dates (IST) or Zoom status. Filters and pagination run on the server. **Export matching attendees CSV** fetches all matching records only when requested; it is not limited to the current page. Meeting attendance remains a separate view and does not imply that every registered attendee joined.


## Times, attendee status and confirmations

All admin timestamps and attendee CSV signup timestamps display in **12-hour IST**, including AM/PM and the IST label. Zoom enrollment and application signup are separate instants. The Attendees table shows Zoom enrollment time once in the Zoom invitation column; the information icon explains the status and shows the application signup time. A red information icon indicates a returned error. Do not treat successful Zoom enrollment as proof of inbox delivery.

Attendee lists and Meeting attendance default to newest registration first, with serial numbers continuing across pages. Meeting attendance now supports search, college, attendance-status and joined-evidence filters, plus 10/25/50 rows per page. Summary counts always cover the whole episode. “Not synced” remains until a complete report is available. Full attendance CSV exports all registrations.

Sensitive actions use an in-app confirmation: closing/opening registrations, deleting attendee registrations, moving events to Trash, archiving, starting/pausing campaigns, importing/syncing attendance, and saving corrections or participant matches. Please review the named episode/student before confirming. Cancelling keeps the current setting. Event Trash/archive still require the typed episode confirmation.
