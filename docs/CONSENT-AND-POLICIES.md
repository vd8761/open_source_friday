# Event communication and policy operations

Updated 29 October 2026.

## Event team workflow

1. Registration remains required. The WhatsApp checkbox is optional and starts unchecked for each event, including returning students. Confirmed application registrations continue to the Zoom queue regardless of that choice.
2. In **Attendees**, filter **WhatsApp event updates → Opted in**, or use **Export WhatsApp opt-ins**. This export includes only current event permissions and the number to which they apply. The full attendee roster is not a messaging permission list.
3. Use this permission only for the registered event's reminders and schedule changes. It does not permit future-event marketing, calls or adding students to groups. The application does not send WhatsApp messages or connect to the WhatsApp Business API.
4. Monitor info@descienceosclub.com and any WhatsApp account used to contact attendees. Verify requests proportionately. On a STOP/withdrawal request, find the registration and choose **Record WhatsApp withdrawal**. Remove the number from exported lists and external sending tools as well. For an all-events request, apply the withdrawal across all relevant registrations and external contact lists. This is a manual process, not an automated STOP handler.
5. Re-export immediately before use. A previously downloaded CSV cannot reflect later withdrawals. Do not send from a stale list. Keep exports accessible only to the event team and remove unnecessary copies after use.
6. Requests for access, correction and erasure go to the same mailbox. Verify ownership before sharing records. Review live records, recoverable Trash snapshots, exports, Zoom and Sender as appropriate; archiving or trashing an event does not erase participant data. Keep a restricted record of handling and explain any information retained. No automatic identity verification, data download or erasure workflow is provided.

## Deployment

Deploy the backend first so the additive nullable-column migration completes before publishing the frontend. The API echoes the saved choice after the transaction commits. The new frontend does not claim a saved preference if an older backend omits that confirmation. Existing cached clients can still register; omitted consent is stored as unknown, not permission. No new environment variables, SMTP or WhatsApp credentials are needed.

## Stored evidence and limits

Each registration stores the nullable choice, server timestamp, server-authoritative notice version and text, source and saved profile number. Historical records stay NULL / **Not recorded**. There is no inferred or retroactive consent. Withdrawal preserves original evidence and records time, authenticated admin ID and source; the endpoint cannot grant permission. Restoring an event from Trash suppresses any restored affirmative permissions, so snapshots cannot revive permission.

This is a declaration on the existing public registration form, **not verified ownership of the phone**. The existing lookup/registration flow has no student OTP authentication. Do not describe these choices as verified or use them to grant access to sensitive information.

## Footer and policy scope

Public Home, registration and the five policy pages share only **Policies** and **Social Media** navigation groups. Policy pages are original DOS Club text scoped to this application, not copies of FOSS United's policies or brand licence. No refund footer entry is added. The confirmed privacy contact is info@descienceosclub.com.

The organiser supplied the exact Twitter/X, YouTube channel, LinkedIn, Instagram, Facebook, Threads and GitHub links. These are all included under Social Media. Do not substitute FOSS United accounts or guess handles. The confirmed organisation is Touchmark Descience Pvt Ltd; DOS Club is its initiative.

## Owner decisions before final policy sign-off

- Legal entity confirmed: Touchmark Descience Pvt Ltd. Confirm any additional organisation/address disclosures needed for paid events.
- Confirm under-18 participation and any necessary guardian process. No new age gate or parental-consent mechanism has been implemented.
- Confirm recording practice and provide recording notices/permissions before recording or publication. WhatsApp permission is not recording/publication permission.
- Establish an actual retention schedule and a request-handling owner. The public notice explicitly does not promise a fixed retention period or automatic deletion.
- Before paid tickets launch in January 2027, approve pricing, invoicing/tax, cancellation, transfer and refund terms and show them before payment. Current events are free. No payment/refund feature is introduced here.
- Have the final policies reviewed for the actual organisation and activities. These pages are not a certification of legal compliance.

Reference reviewed: https://whatsappbusiness.com/policy/ (updated 23 September 2026), which addresses recipient permission, clear business identity, privacy notices and respecting opt-outs. If automated WhatsApp sending is introduced later, implement the applicable Business Platform template, messaging and opt-out requirements separately.
