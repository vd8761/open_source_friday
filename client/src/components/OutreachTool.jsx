import { AdminBreadcrumb } from './AdminPageChrome';
import ConfirmDialog from './ConfirmDialog';
import { formatIST } from '../utils/dateTime';
import { isRegistrationOpen } from '../utils/episodeTime';
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { SortHeader } from "./AdminDataTable";
import { exportRows } from "../utils/tableExport";
import {
  adminApi,
  downloadAdminCsv,
  downloadFile,
  fieldClass,
  buttonClass,
} from "../utils/adminApi";
const date = formatIST;
export default function OutreachTool() {
  const navigate=useNavigate(),{pathname}=useLocation(),{campaignId}=useParams();
  const creating=pathname.endsWith('/new'),editing=pathname.endsWith('/edit'),listView=!campaignId&&!creating;
  const trashView=pathname.endsWith('/trash');
  const [deletePhrase,setDeletePhrase]=useState('');
  const [listSort,setListSort]=useState('created_desc'),[recipientSort,setRecipientSort]=useState('full_name');
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
  const showTrash=trashView;
  const [csvInputKey,setCsvInputKey]=useState(0);
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
  async function refresh(trash = showTrash) {
    const [e, c, cfg] = await Promise.all([
      adminApi("/dashboard"),
      adminApi(`/outreach/campaigns${trash ? "?trash=true" : ""}`),
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
      adminApi(`/outreach/campaigns${trashView ? "?trash=true" : ""}`),
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
  }, [trashView]);
  useEffect(()=>{if(!campaignId){setDetail(null);setSelected('');return;}let active=true;setError('');adminApi(`/outreach/campaigns/${campaignId}`).then(r=>{if(!active)return;setSelected(campaignId);setDetail(r);if(editing){if(r.campaign.status!=='draft'||r.campaign.started_at||r.batches.length){setError('Only drafts that have never started can be edited.');return;}setForm(r.campaign);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[campaignId,editing]);
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
      const result = await adminApi(`/outreach/campaigns/${selected}${kind==='purge'?'':`/${kind}`}`, {
        method: kind==='purge' ? 'DELETE' : "POST",
        ...(kind==='purge'?{body:{confirmation:deletePhrase}}:{}),
        ...(kind === "start" && needsPilotReview
          ? { body: { reviewed_first_batch: reviewedCampaign === selected } }
          : {}),
      });
      setMessage(result.message);
      await refresh();
      if (['trash','restore','purge'].includes(kind)) { setSelected(''); setDetail(null);navigate(kind==='restore'?'/admin/invitations':'/admin/invitations/trash'); }
      else await load(selected);
    });
  }
  const recipients = (detail?.data || []).filter((row) =>
    `${row.email} ${row.full_name} ${row.college}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const sortedRecipients=[...recipients].sort((a,b)=>{const key=recipientSort.replace(/_desc$/,'');const result=String(a[key]||'').localeCompare(String(b[key]||''),undefined,{numeric:true,sensitivity:'base'});return recipientSort.endsWith('_desc')?-result:result;});
  const sortedCampaigns=[...campaigns].sort((a,b)=>{const key=listSort.replace(/_desc$/,'').replace('created','created_at');const result=typeof a[key]==='number'?a[key]-b[key]:String(a[key]||'').localeCompare(String(b[key]||''),undefined,{numeric:true,sensitivity:'base'});return listSort.endsWith('_desc')?-result:result;});
  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6 text-slate-800">
      {(creating||campaignId||showTrash)&&<AdminBreadcrumb items={[["Email invitations","/admin/invitations"],[creating?"Create campaign":editing?"Edit draft":showTrash?"Campaign trash":"Campaign details"]]}/>}
      <div>
        <h1 className="text-2xl font-bold">{creating?"Create campaign":editing?"Edit draft campaign":campaignId?(detail?.campaign.subject||"Campaign details"):showTrash?"Campaign trash":"Email invitations"}</h1>
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
      <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium">{config===null?'Checking Sender…':config.sender.configured?`Sender connected · ${config.sender.from_email}`:'Sender not configured'} · Delivery notes</summary>
        <p className="mt-2">Sent does not confirm inbox delivery. Opens are approximate. Batching controls pace; it does not guarantee inbox placement.</p>
        {config&&!config.sender.configured&&<p className="mt-2">You can prepare drafts; configure Sender on the backend before sending.</p>}
      </details>
      {(creating||editing)&&<section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <h2 className="sr-only">{editing?'Edit invitation details':'Prepare an invitation'}</h2>
        {editing&&<p className="text-sm text-slate-500">The episode and imported audience are fixed for this draft. You can edit its subject, message and sending pace. To change the audience, create a new campaign.</p>}
        {!editing&&<>
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
                .filter((e) => isRegistrationOpen(e))
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
              key={csvInputKey}
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
        {csv && <button className="text-sm text-rose-700 underline" disabled={busy} onClick={()=>setCampaignConfirmation('clear-csv')}>Clear imported CSV</button>}
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
        </>}
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
        {!editing&&<label className="flex gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I confirm these contacts opted in to receive episode invitations.
        </label>}
        <button
          className={buttonClass}
          disabled={
            busy ||
            (editing?(!detail||detail.campaign.status!=='draft'||Boolean(detail.campaign.started_at)||detail.batches.length>0):(!consent||!preview?.eligible)) ||
            !form.subject.trim() ||
            !form.body.trim()
          }
          onClick={() =>
            action(async () => {
              if(editing){const result=await adminApi(`/outreach/campaigns/${campaignId}`,{method:'PATCH',body:form});setMessage(result.message);navigate(`/admin/invitations/${campaignId}`);return;}
              const result = await adminApi("/outreach/campaigns", {
                method: "POST",
                body: { ...form, csv, filters, consent_confirmed: consent },
              });
              setMessage(
                `Draft saved with ${result.recipients} recipients. Review it below before starting.`,
              );
              await refresh();
              navigate(`/admin/invitations/${result.id}`);
            })
          }
        >
          {editing?'Save changes':'Save draft'}
        </button>
      </section>}
      {listView&&<section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="sr-only">{showTrash ? 'Campaign trash' : 'Campaigns'}</h2>
          {!showTrash&&<Link to="/admin/invitations/new" className="admin-primary">Create campaign</Link>}
          <div className="ml-auto flex flex-wrap items-center gap-4">
          <button disabled={busy||!campaigns.length} className="admin-action" onClick={()=>exportRows(sortedCampaigns,[['Subject','subject'],['Episode','episode_number'],['Status','status'],['Recipients','recipients'],['Sent','sent'],['Created','created_at']],'campaigns.csv')}>Download list CSV</button>
          <button
            disabled={busy}
            className="admin-action"
            onClick={() =>
              action(async () => {
                await refresh();
                if (selected) await load(selected);
              })
            }
          >
            Refresh
          </button>
          {!showTrash&&<Link to="/admin/invitations/trash" className="text-sm text-slate-500 hover:text-slate-700">Campaign trash</Link>}
          </div>
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
                  "Created (IST)",
                  "Actions",
                ].map((h,i) => <SortHeader key={h} className="p-3 bg-slate-50" label={h} values={i<8?[["subject","subject_desc"],["episode_number","episode_number_desc"],["status","status_desc"],["recipients","recipients_desc"],["sent","sent_desc"],["delivered","delivered_desc"],["opened","opened_desc"],["created","created_desc"]][i]:undefined} sort={listSort} onSort={setListSort}/>)}
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <Link className="text-dos font-semibold underline text-left" to={`/admin/invitations/${c.id}`}>{c.subject}</Link>
                  </td>
                  <td className="p-3">{c.episode_number}</td>
                  <td className="p-3 capitalize">{showTrash ? "In trash" : c.status}</td>
                  <td className="p-3">{c.recipients}</td>
                  <td className="p-3">{c.sent}</td>
                  <td className="p-3">{c.delivered}</td>
                  <td className="p-3">{c.opened}</td><td className="p-3 whitespace-nowrap">{date(c.created_at)}</td>
                  <td className="p-3"><div className="flex flex-wrap items-center gap-2"><button disabled={busy} className={showTrash?'admin-action':'admin-danger'} aria-label={`${showTrash ? 'Restore' : 'Delete'} campaign: ${c.subject}`} onClick={()=>action(async()=>{await load(c.id);setCampaignConfirmation(showTrash ? 'restore' : 'trash');})}>{showTrash ? 'Restore' : 'Delete'}</button>{showTrash&&<button disabled={busy} className="admin-danger" onClick={()=>action(async()=>{await load(c.id);setDeletePhrase('');setCampaignConfirmation('purge');})}>Delete permanently</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!campaigns.length && (
          <p className="text-slate-500">{config===null?"Loading campaigns…":showTrash ? "Campaign trash is empty." : "No campaigns yet."}</p>
        )}
      </section>}
      {!listView&&!editing&&detail && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="sr-only">Campaign information</h2>
          <p className="whitespace-pre-wrap text-sm">{detail.campaign.body}</p>
          {campaignEpisode&&<p className="text-sm text-slate-600">Episode {campaignEpisode.episode_number} · <a className="text-dos underline" href={`/register/episode-${campaignEpisode.episode_number}`} target="_blank" rel="noopener noreferrer">{campaignEpisode.title}</a> · {String(campaignEpisode.event_date).slice(0,10)} · {campaignEpisode.event_time} IST</p>}
          <p className="text-sm">
            Status: <strong>{detail.campaign.deleted_at ? "In trash" : detail.campaign.status}</strong> ·{" "}
            {detail.campaign.batch_size} per batch ·{" "}
            {detail.campaign.interval_minutes} minutes apart
          </p>
          {detail.campaign.last_error && (
            <p className="text-rose-700 text-sm">
              {detail.campaign.last_error}
            </p>
          )}
          {!detail.campaign.deleted_at&&campaignClosed&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This event’s registration window has closed. Its invitation campaign cannot be started or resumed.</p>}
          {!detail.campaign.deleted_at&&detail.campaign.status==='paused'&&detail.campaign.last_error?.includes('Sender rate limit')&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Earliest next attempt: {date(detail.campaign.next_batch_at)}. This is a saved retry time, not a guarantee that Sender's limit has reset. The campaign stays paused until you click Resume; the event must still be open for registration.</p>}
          <p className="text-sm text-slate-500">
            {detail.campaign.pause_after_first_batch
              ? "First-batch review is enabled. Later batches are checked for reported bounces and complaints."
              : "Automatic pacing enabled. Bounces and complaints are checked before later batches."}
          </p>
          {!detail.campaign.deleted_at && needsPilotReview && (
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
            {!detail.campaign.deleted_at&&detail.campaign.status==='draft'&&!detail.campaign.started_at&&!detail.batches.length&&<Link className={buttonClass} to={`/admin/invitations/${selected}/edit`}>Edit draft</Link>}
            {detail.campaign.deleted_at&&<button disabled={busy} className="admin-danger" onClick={()=>{setDeletePhrase('');setCampaignConfirmation('purge');}}>Delete permanently</button>}
            {!detail.campaign.deleted_at && ["draft", "paused"].includes(detail.campaign.status) && (
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
            {!detail.campaign.deleted_at && detail.campaign.status === "running" && (
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => setCampaignConfirmation("pause")}
              >
                Pause
              </button>
            )}
            <button
              disabled={busy || Boolean(detail.campaign.deleted_at) || !config?.sender.configured}
              className={buttonClass}
              onClick={() => campaignAction("sync")}
            >
              Sync Sender reports
            </button>
            <button disabled={busy} className={detail.campaign.deleted_at?'admin-action':'admin-danger'} onClick={()=>setCampaignConfirmation(detail.campaign.deleted_at ? 'restore' : 'trash')}>{detail.campaign.deleted_at ? 'Restore campaign' : 'Delete campaign'}</button>
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
          {detail.campaign.deleted_at && <p className="rounded-lg bg-slate-50 p-3 text-sm">Deleted {date(detail.campaign.deleted_at)}. The imported recipient list and reports are kept here for recovery. Restoring will keep sending paused. Sender records and previously submitted emails are unchanged.</p>}
          {!detail.campaign.deleted_at && <details>
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
          </details>}
          <label className="block text-sm font-semibold">
            Search recipients
            <input
              className={fieldClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button disabled={busy||!recipients.length} className="admin-action" onClick={()=>exportRows(sortedRecipients,[['Name','full_name'],['Email','email'],['Queue','send_status'],['Sent','sent_at'],['Delivered','delivered_at'],['Opened','opened_at'],['Registered','registered']],'filtered-invitation-recipients.csv')}>Download filtered recipients CSV</button>
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
                  ].map((h,i) => <SortHeader key={h} className="p-3 bg-slate-50" label={h} values={[["full_name","full_name_desc"],["send_status","send_status_desc"],["sent_at","sent_at_desc"],["delivered_at","delivered_at_desc"],["opened_at","opened_at_desc"],["clicked_at","clicked_at_desc"],["registered","registered_desc"]][i]} sort={recipientSort} onSort={setRecipientSort}/>)}
                </tr>
              </thead>
              <tbody>
                {sortedRecipients.map((r) => (
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
      {campaignConfirmation&&<ConfirmDialog
        title={{start:'Send invitation campaign?',pause:'Pause invitation campaign?',trash:'Delete campaign and imported records?',restore:'Restore campaign?',purge:'Permanently delete campaign?', 'clear-csv':'Clear imported CSV?'}[campaignConfirmation]}
        confirmLabel={{start:'Start sending',pause:'Pause sending',trash:'Move to trash',restore:'Restore campaign',purge:'Delete permanently','clear-csv':'Clear CSV'}[campaignConfirmation]}
        disabled={campaignConfirmation==='purge'&&deletePhrase!=='DELETE PERMANENTLY'} danger={['trash','clear-csv','purge'].includes(campaignConfirmation)} busy={busy} onCancel={()=>setCampaignConfirmation(null)}
        onConfirm={()=>{const kind=campaignConfirmation;setCampaignConfirmation(null);if(kind==='clear-csv'){setCsv('');setFileName('');setPreview(null);setConsent(false);setCsvInputKey(k=>k+1);}else campaignAction(kind);}}>
        <p>{({start:`Please confirm that you would like to send this invitation campaign to ${detail?.data.length||0} contacts. Sender will deliver it in paced batches.`,pause:'Would you like to pause future batches? Invitations already sent cannot be recalled.',trash:'Would you like to move this campaign, its imported recipient list and reports to Campaign trash? You can restore them later. Student registrations and attendance will remain unchanged. This does not delete records from Sender or recall emails already submitted.',restore:'Would you like to restore this campaign and its imported records? Sending will stay paused until you choose Resume, and the event must still accept registrations.',purge:'Please confirm that you want to permanently delete this campaign, imported audience and reports from OSF. This cannot be undone. Registrations, attendance, suppression preferences and minimal duplicate-send exclusions remain. Records in Sender are unchanged.','clear-csv':'Would you like to clear this uploaded CSV and its preview? Saved campaigns, student registrations and attendance will remain unchanged.'})[campaignConfirmation]}</p>
        {campaignConfirmation==='purge'&&<label className="block font-semibold">Type DELETE PERMANENTLY<input className={fieldClass} value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)} autoComplete="off"/></label>}
      </ConfirmDialog>}
    </main>
  );
}
