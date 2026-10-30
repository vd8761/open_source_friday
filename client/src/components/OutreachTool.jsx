import ConfirmDialog from './ConfirmDialog';
import { formatIST } from '../utils/dateTime';
import { isRegistrationOpen } from '../utils/episodeTime';
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  downloadAdminCsv,
  downloadFile,
  fieldClass,
  buttonClass,
} from "../utils/adminApi";
const date = formatIST;
export default function OutreachTool() {
  const [episodes, setEpisodes] = useState([]),
    [config, setConfig] = useState(null),
    [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(""),
    [detail, setDetail] = useState(null),
    [preview, setPreview] = useState(null);
  const [csv, setCsv] = useState(""),
    [fileName, setFileName] = useState(""),
    [consent, setConsent] = useState(false);
  const [form, setForm] = useState({
    episode_id: "",
    subject: "",
    body: "Join our next Open Source Friday session. Please register to receive your personal Zoom meeting link.",
    batch_size: 50,
    interval_minutes: 15,
    pause_after_first_batch: true,
  });
  const [filters, setFilters] = useState({
    college: "",
    department: "",
    year: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [campaignConfirmation,setCampaignConfirmation]=useState(null);
  const [reviewedCampaign, setReviewedCampaign] = useState("");
  const needsPilotReview = Boolean(
    detail?.campaign.pause_after_first_batch &&
    !detail.campaign.pilot_reviewed_at &&
    detail.batches.some(
      (b) => b.status === "submitted" && b.provider_campaign_id,
    ),
  );
  const campaignEpisode=detail?episodes.find(e=>Number(e.id)===Number(detail.campaign.episode_id)):null;
  const campaignClosed=Boolean(campaignEpisode&&!isRegistrationOpen(campaignEpisode));
  async function refresh() {
    const [e, c, cfg] = await Promise.all([
      adminApi("/dashboard"),
      adminApi("/outreach/campaigns"),
      adminApi("/outreach/config"),
    ]);
    setEpisodes(e.data);
    setCampaigns(c.data);
    setConfig(cfg);
  }
  async function load(id) {
    setSelected(id);
    setDetail(await adminApi(`/outreach/campaigns/${id}`));
  }
  async function action(work) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    Promise.all([
      adminApi("/dashboard"),
      adminApi("/outreach/campaigns"),
      adminApi("/outreach/config"),
    ])
      .then(([e, c, cfg]) => {
        if (live) {
          setEpisodes(e.data);
          setCampaigns(c.data);
          setConfig(cfg);
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, []);
  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "episode_id") setPreview(null);
  }
  async function readFile(file, delivery = false) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a CSV file up to 5 MB.");
      return;
    }
    await action(async () => {
      const text = await file.text();
      if (delivery) {
        const result = await adminApi(
          `/outreach/campaigns/${selected}/delivery-import`,
          { method: "POST", body: { csv: text } },
        );
        setMessage(`${result.updated} delivery records imported.`);
        await load(selected);
      } else {
        setCsv(text);
        setFileName(file.name);
        setPreview(null);
      }
    });
  }
  async function campaignAction(kind) {
    await action(async () => {
      const result = await adminApi(`/outreach/campaigns/${selected}/${kind}`, {
        method: "POST",
        ...(kind === "start" && needsPilotReview
          ? { body: { reviewed_first_batch: reviewedCampaign === selected } }
          : {}),
      });
      setMessage(result.message);
      await refresh();
      await load(selected);
    });
  }
  const recipients = (detail?.data || []).filter((row) =>
    `${row.email} ${row.full_name} ${row.college}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6 text-slate-800">
      <Link to="/dashboard" className="text-dos font-semibold">
        ← Dashboard
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">Email invitations</h1>
        <p className="mt-2 text-slate-500">
          Invite students to register in the application. Zoom emails the
          meeting link after registration.
        </p>
      </div>
      {error && (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-emerald-800"
        >
          {message}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p>
          <strong>Sender:</strong>{" "}
          {config?.sender.configured
            ? `Configured · ${config.sender.from_name} <${config.sender.from_email}>`
            : "Not configured on backend. You can prepare drafts; sending stays disabled."}
        </p>
        <p className="mt-1 text-slate-500">
          Sent does not confirm inbox delivery. Opens are approximate. Batching
          controls pace; it does not guarantee inbox placement.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <h2 className="text-xl font-bold">Prepare an invitation</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm font-semibold">
            Episode
            <select
              className={fieldClass}
              value={form.episode_id}
              onChange={(e) => update("episode_id", e.target.value)}
            >
              <option value="">Choose episode</option>
              {episodes
                .filter((e) => e.is_active && e.is_registration_open !== false)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    Episode {e.episode_number} · {e.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Recipient CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className={fieldClass}
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          {fileName ||
            "Required column: Email. Optional: Full Name, College, Department, Year of Study, Status."}{" "}
          <button
            className="text-dos underline"
            onClick={() =>
              downloadFile(
                new Blob(
                  [
                    "Email,Full Name,College,Department,Year of Study\nstudent@example.com,Example Student,Example College,Computer Science,3\n",
                  ],
                  { type: "text/csv" },
                ),
                "invitation_template.csv",
              )
            }
          >
            Download template
          </button>
        </p>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Paste CSV instead
          </summary>
          <label className="block mt-2 text-sm">
            CSV content
            <textarea
              rows={5}
              className={fieldClass}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setFileName("Pasted CSV");
                setPreview(null);
              }}
              placeholder="Email,Full Name,College,Department,Year of Study"
            />
          </label>
        </details>
        <div className="grid sm:grid-cols-3 gap-4">
          {Object.keys(filters).map((key) => (
            <label key={key} className="text-sm font-semibold capitalize">
              {key} filter
              <input
                className={fieldClass}
                placeholder="All"
                value={filters[key]}
                onChange={(e) => {
                  setFilters({ ...filters, [key]: e.target.value });
                  setPreview(null);
                }}
              />
            </label>
          ))}
        </div>
        <button
          disabled={busy || !csv || !form.episode_id}
          className={buttonClass}
          onClick={() =>
            action(async () =>
              setPreview(
                await adminApi("/outreach/preview", {
                  method: "POST",
                  body: { episode_id: form.episode_id, csv, filters },
                }),
              ),
            )
          }
        >
          Preview audience
        </button>
        {preview && (
          <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-2">
            <p className="font-bold">
              {preview.eligible} eligible · {preview.duplicates} duplicates ·{" "}
              {preview.filtered} filtered · {preview.rejected.length}{" "}
              invalid/suppressed · {preview.excluded.length} already
              registered/invited/suppressed
            </p>
            {preview.rejected.length > 0 && (
              <details>
                <summary>Review CSV issues</summary>
                {preview.rejected.slice(0, 50).map((r) => (
                  <p key={r.row}>
                    Row {r.row}: {r.reason}
                  </p>
                ))}
              </details>
            )}
            {preview.excluded.length > 0 && (
              <details>
                <summary>Review exclusions</summary>
                {preview.excluded.slice(0, 50).map((r) => (
                  <p key={r.email}>
                    {r.email}: {r.reason}
                  </p>
                ))}
              </details>
            )}
            <div className="max-h-48 overflow-auto">
              {preview.preview.map((r) => (
                <p key={r.email}>
                  {r.full_name || "—"} · {r.email} · {r.college || "—"}
                </p>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Preview shows up to 100 contacts. Eligibility is checked again
              before sending. CSV import creates invitation contacts, not
              episode registrations.
            </p>
          </div>
        )}
        <label className="block text-sm font-semibold">
          Subject
          <input
            maxLength={200}
            className={fieldClass}
            value={form.subject}
            onChange={(e) => update("subject", e.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Message
          <textarea
            maxLength={10000}
            rows={4}
            className={fieldClass}
            value={form.body}
            onChange={(e) => update("body", e.target.value)}
          />
        </label>
        <p className="text-xs text-slate-500">
          The application adds a registration button, sender details and an
          unsubscribe link. To test first, use a CSV containing one opted-in
          email you control.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm font-semibold">
            Recipients per batch
            <input
              type="number"
              min="1"
              max="200"
              className={fieldClass}
              value={form.batch_size}
              onChange={(e) => update("batch_size", e.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Minutes between batches
            <input
              type="number"
              min="1"
              max="1440"
              className={fieldClass}
              value={form.interval_minutes}
              onChange={(e) => update("interval_minutes", e.target.value)}
            />
          </label>
        </div>
        <label className="flex gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.pause_after_first_batch}
            onChange={(e) =>
              update("pause_after_first_batch", e.target.checked)
            }
          />
          Pause after the first batch so I can review inbox placement and Sender
          reports.
        </label>
        <label className="flex gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I confirm these contacts opted in to receive episode invitations.
        </label>
        <button
          className={buttonClass}
          disabled={
            busy ||
            !consent ||
            !preview?.eligible ||
            !form.subject.trim() ||
            !form.body.trim()
          }
          onClick={() =>
            action(async () => {
              const result = await adminApi("/outreach/campaigns", {
                method: "POST",
                body: { ...form, csv, filters, consent_confirmed: consent },
              });
              setMessage(
                `Draft saved with ${result.recipients} recipients. Review it below before starting.`,
              );
              await refresh();
              await load(result.id);
            })
          }
        >
          Save draft
        </button>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-xl font-bold">Campaigns</h2>
          <button
            disabled={busy}
            className="text-dos font-semibold"
            onClick={() =>
              action(async () => {
                await refresh();
                if (selected) await load(selected);
              })
            }
          >
            Refresh
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Subject",
                  "Episode",
                  "Status",
                  "Recipients",
                  "Sent",
                  "Delivery confirmed",
                  "Open detected",
                ].map((h) => (
                  <th key={h} className="p-3 bg-slate-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <button
                      className="text-dos font-semibold text-left"
                      onClick={() => action(() => load(c.id))}
                    >
                      {c.subject}
                    </button>
                  </td>
                  <td className="p-3">{c.episode_number}</td>
                  <td className="p-3 capitalize">{c.status}</td>
                  <td className="p-3">{c.recipients}</td>
                  <td className="p-3">{c.sent}</td>
                  <td className="p-3">{c.delivered}</td>
                  <td className="p-3">{c.opened}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!campaigns.length && (
          <p className="text-slate-500">No campaigns yet.</p>
        )}
      </section>
      {detail && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-xl font-bold">{detail.campaign.subject}</h2>
          <p className="whitespace-pre-wrap text-sm">{detail.campaign.body}</p>
          <p className="text-sm">
            Status: <strong>{detail.campaign.status}</strong> ·{" "}
            {detail.campaign.batch_size} per batch ·{" "}
            {detail.campaign.interval_minutes} minutes apart
          </p>
          {detail.campaign.last_error && (
            <p className="text-rose-700 text-sm">
              {detail.campaign.last_error}
            </p>
          )}
          {campaignClosed&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This event’s registration window has closed. Its invitation campaign cannot be started or resumed.</p>}
          {detail.campaign.status==='paused'&&detail.campaign.last_error?.includes('Sender rate limit')&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Earliest next attempt: {date(detail.campaign.next_batch_at)}. This is a saved retry time, not a guarantee that Sender's limit has reset. The campaign stays paused until you click Resume; the event must still be open for registration.</p>}
          <p className="text-sm text-slate-500">
            {detail.campaign.pause_after_first_batch
              ? "First-batch review is enabled. Later batches are checked for reported bounces and complaints."
              : "Automatic pacing enabled. Bounces and complaints are checked before later batches."}
          </p>
          {needsPilotReview && (
            <label className="flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={reviewedCampaign === selected}
                onChange={(e) =>
                  setReviewedCampaign(e.target.checked ? selected : "")
                }
              />
              I reviewed the first batch in recipient inboxes and Sender
              reports, and I want to continue.
            </label>
          )}
          <div className="flex gap-3 flex-wrap">
            {["draft", "paused"].includes(detail.campaign.status) && (
              <button
                disabled={
                  busy ||
                  campaignClosed ||
                  !config?.sender.configured ||
                  (needsPilotReview && reviewedCampaign !== selected)
                }
                className={buttonClass}
                onClick={() => setCampaignConfirmation("start")}
              >
                {detail.campaign.status === "draft"
                  ? "Start sending"
                  : "Resume"}
              </button>
            )}
            {detail.campaign.status === "running" && (
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => setCampaignConfirmation("pause")}
              >
                Pause
              </button>
            )}
            <button
              disabled={busy || !config?.sender.configured}
              className={buttonClass}
              onClick={() => campaignAction("sync")}
            >
              Sync Sender reports
            </button>
            <button
              disabled={busy}
              className={buttonClass}
              onClick={() =>
                action(() =>
                  downloadAdminCsv(
                    `/outreach/campaigns/${selected}/export`,
                    "invitation_report.csv",
                  ),
                )
              }
            >
              Export report
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Last report sync: {date(detail.campaign.reports_synced_at)}. A
            submitted batch is accepted for sending, not confirmed delivered.
            Pausing cannot recall a batch already submitted.
          </p>
          {detail.batches
            .filter((b) => ["sending", "review"].includes(b.status))
            .map((b) => (
              <div key={b.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                <p>
                  Batch needs review. Sender campaign ID:{" "}
                  {b.provider_campaign_id || "Unknown"}. Check its status in
                  Sender.
                </p>
                <button
                  disabled={busy}
                  className="mt-2 text-dos underline"
                  onClick={() => campaignAction(`reconcile/${b.id}`)}
                >
                  Check send outcome in Sender
                </button>
              </div>
            ))}
          {detail.batches.filter(b => b.provider_diagnostic).map(b => (
            <details key={`diagnostic-${b.id}`} className="rounded-lg border border-slate-200 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Sender response evidence ({b.provider_diagnostic.http_status})</summary>
              <p className="mt-2">Redacted provider response for support. Downloading does not retry sending. Review the file before sharing.</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(b.provider_diagnostic, null, 2)}</pre>
              <button className="mt-2 text-dos underline" onClick={() => downloadFile(new Blob([JSON.stringify(b.provider_diagnostic, null, 2)], { type: 'application/json' }), `sender-response-${b.id}.json`)}>Download response evidence</button>
            </details>
          ))}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Import explicit delivery evidence
            </summary>
            <p className="text-xs text-slate-500 mt-2">
              Use a delivery report from Sender for this campaign, containing
              Email, Status (delivered), Timestamp (ISO with timezone). These
              entries are labeled as admin-imported evidence. Sent/open events
              are never converted to delivery confirmation.
            </p>
            <input
              type="file"
              accept=".csv"
              aria-label="Sender delivery report CSV"
              className={fieldClass}
              onChange={(e) => readFile(e.target.files?.[0], true)}
            />
          </details>
          <label className="block text-sm font-semibold">
            Search recipients
            <input
              className={fieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {[
                    "Recipient",
                    "Queue",
                    "Sent",
                    "Delivery",
                    "Open detected",
                    "Click detected",
                    "Registered",
                  ].map((h) => (
                    <th className="p-3 bg-slate-50" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-3">
                      {r.full_name}
                      <br />
                      {r.email}
                    </td>
                    <td className="p-3">
                      {r.send_status}
                      {r.skip_reason && (
                        <p className="text-xs text-slate-500">
                          {r.skip_reason}
                        </p>
                      )}
                      {r.hard_bounced_at && (
                        <p className="text-rose-700">Hard bounce</p>
                      )}
                      {r.soft_bounced_at && (
                        <p className="text-amber-700">Soft bounce</p>
                      )}
                      {r.unsubscribed_at && <p>Unsubscribed</p>}
                      {r.complained_at && <p>Complaint</p>}
                    </td>
                    <td className="p-3">{date(r.sent_at)}</td>
                    <td className="p-3">
                      {r.delivered_at
                        ? `${date(r.delivered_at)} (imported report)`
                        : "Not reported"}
                    </td>
                    <td className="p-3">
                      {r.opened_at ? date(r.opened_at) : "Not detected"}
                    </td>
                    <td className="p-3">
                      {r.clicked_at ? date(r.clicked_at) : "Not detected"}
                    </td>
                    <td className="p-3">{r.registered ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Working…
        </p>
      )}
      {campaignConfirmation&&<ConfirmDialog title={campaignConfirmation==='start'?'Send invitation campaign?':'Pause invitation campaign?'} confirmLabel={campaignConfirmation==='start'?'Start sending':'Pause sending'} busy={busy} onCancel={()=>setCampaignConfirmation(null)} onConfirm={()=>{const kind=campaignConfirmation;setCampaignConfirmation(null);campaignAction(kind);}}><p>{campaignConfirmation==='start'?`Please confirm that you would like to send this invitation campaign to ${detail?.data.length||0} contacts. Sender will deliver it in paced batches.`:'Would you like to pause future batches? Invitations already sent cannot be recalled.'}</p></ConfirmDialog>}
    </main>
  );
}
