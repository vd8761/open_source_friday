import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  adminApi,
  downloadAdminCsv,
  fieldClass,
  buttonClass,
} from "../utils/adminApi";
export default function AttendanceTool() {
  const { id } = useParams();
  const [episode, setEpisode] = useState(null),
    [report, setReport] = useState(null),
    [threshold, setThreshold] = useState(30),
    [instance, setInstance] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [csv, setCsv] = useState(""),
    [complete, setComplete] = useState(false);
  const [matches, setMatches] = useState({}),
    [correction, setCorrection] = useState({
      registration_id: "",
      status: "present",
      note: "",
    });
  const [filter, setFilter] = useState("all");
  const endpoint = `/episodes/${id}/attendance`;
  async function refresh() {
    const r = await adminApi(endpoint);
    setReport(r);
    if (r.sync) {
      setThreshold(r.sync.threshold_minutes);
      setInstance(r.sync.meeting_uuid);
    }
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
      adminApi(`/episodes/${id}`),
      adminApi(`/episodes/${id}/attendance`),
    ])
      .then(([e, r]) => {
        if (live) {
          setEpisode(e.episode);
          setReport(r);
          if (r.sync) {
            setThreshold(r.sync.threshold_minutes);
            setInstance(r.sync.meeting_uuid);
          }
        }
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  const rows = (report?.data || []).filter(
    (r) => filter === "all" || r.status === filter,
  );
  const counts = (report?.data || []).reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {},
  );
  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-6 text-slate-800">
      <Link to="/dashboard" className="text-dos font-semibold">
        ← Dashboard
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">
          Episode {episode?.episode_number || ""} attendance
        </h1>
        <p className="mt-2 text-slate-500">{episode?.title}</p>
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
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-xl font-bold">Import attendance from Zoom</h2>
        <p className="text-sm text-slate-500">
          Present means at least {threshold} minutes. Partial means the student
          joined for less time. Unmatched guests require review. Missing
          students remain “Not synced” until a complete report is available.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm font-semibold">
            Minimum minutes for Present
            <input
              type="number"
              min="1"
              max="1440"
              className={fieldClass}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <label className="text-sm font-semibold">
            Meeting instance UUID / CSV session reference
            <input
              className={fieldClass}
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              placeholder="Optional for first Zoom sync; required for CSV"
              disabled={Boolean(report?.sync)}
            />
          </label>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            className={buttonClass}
            disabled={busy || !episode?.zoom_meeting_id}
            onClick={() =>
              action(async () => {
                const result = await adminApi(`${endpoint}/sync`, {
                  method: "POST",
                  body: {
                    threshold_minutes: Number(threshold),
                    meeting_uuid: instance || undefined,
                  },
                });
                setReport(result);
                setInstance(result.sync.meeting_uuid);
                setMessage(result.message);
              })
            }
          >
            Sync from Zoom
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={() => action(refresh)}
          >
            Refresh
          </button>
          <button
            className={buttonClass}
            disabled={busy || !report?.data.length}
            onClick={() =>
              action(() =>
                downloadAdminCsv(`${endpoint}/export`, "attendance_report.csv"),
              )
            }
          >
            Export attendance CSV
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Reports require Zoom reporting permissions and an eligible paid Zoom
          account. They may take time to process after the meeting ends. Joined
          time is evidence of connection, not attention or identity
          verification.
        </p>
        <details>
          <summary className="font-semibold cursor-pointer text-sm">
            Import a Zoom participant CSV instead
          </summary>
          <div className="space-y-3 mt-3">
            <p className="text-xs text-slate-500">
              Columns: Email or User Email, Name, Duration (Minutes). Optional:
              Registrant ID, Join Time, Leave Time. Times must be ISO with
              timezone; omit time columns if the export uses a local display
              format. Repeated imports replace the same session snapshot.
              Without time intervals, overlapping device sessions cannot be
              detected.
            </p>
            <input
              aria-label="Zoom participant CSV"
              className={fieldClass}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    setError("Choose a CSV up to 5 MB.");
                    return;
                  }
                  action(async () => setCsv(await file.text()));
                }
              }}
            />
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              This is the complete report for this episode/session; unmatched
              registrations may be marked absent.
            </label>
            <button
              className={buttonClass}
              disabled={busy || !csv || !instance.trim()}
              onClick={() =>
                action(async () => {
                  const result = await adminApi(`${endpoint}/import`, {
                    method: "POST",
                    body: {
                      csv,
                      meeting_uuid: instance,
                      threshold_minutes: Number(threshold),
                      report_complete: complete,
                    },
                  });
                  setReport(result);
                  setMessage(result.message);
                })
              }
            >
              Import participant report
            </button>
          </div>
        </details>
        {report?.automatic_sync?.last_error && (
          <p className="text-sm text-amber-700">
            Automatic sync: {report.automatic_sync.last_error} Next attempt:{" "}
            {new Date(report.automatic_sync.next_attempt_at).toLocaleString()}
          </p>
        )}
        {report?.sync && (
          <p className="text-xs text-slate-500">
            Last sync: {new Date(report.sync.synced_at).toLocaleString()} ·{" "}
            {report.sync.source} ·{" "}
            {report.sync.report_complete
              ? "Complete report"
              : "Incomplete report"}{" "}
            · Session {report.sync.meeting_uuid}
          </p>
        )}
      </section>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          ["present", "Present"],
          ["partial", "Partial"],
          ["absent", "Absent"],
          ["not_synced", "Not synced"],
        ].map(([key, label]) => (
          <div
            key={key}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-bold">{counts[key] || 0}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex justify-between gap-4">
          <h2 className="text-xl font-bold">Registered students</h2>
          <label className="text-sm">
            Show
            <select
              className={fieldClass}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {["all", "present", "partial", "absent", "not_synced"].map(
                (k) => (
                  <option key={k} value={k}>
                    {k.replace("_", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Student",
                  "Joined",
                  "Attendance",
                  "Minutes",
                  "Sessions",
                  "Action",
                ].map((h) => (
                  <th key={h} className="p-3 bg-slate-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.registration_id}
                  className="border-t border-slate-100"
                >
                  <td className="p-3">
                    {row.full_name}
                    <br />
                    {row.email}
                  </td>
                  <td className="p-3">{row.joined ? "Yes" : "No evidence"}</td>
                  <td className="p-3 capitalize">
                    {row.status.replace("_", " ")}
                    {row.override_status && (
                      <p className="text-xs text-slate-500">
                        Admin correction: {row.override_note}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    {row.minutes}
                    {row.duration_estimated && (
                      <p className="text-xs text-amber-700">
                        Estimated; no full intervals
                      </p>
                    )}
                  </td>
                  <td className="p-3">{row.sessions}</td>
                  <td className="p-3">
                    <button
                      className="text-dos underline"
                      onClick={() =>
                        setCorrection({
                          registration_id: String(row.registration_id),
                          status:
                            row.status === "not_synced"
                              ? "present"
                              : row.status,
                          note: "",
                        })
                      }
                    >
                      Correct
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="text-slate-500">No matching registrations.</p>
        )}
        {correction.registration_id && (
          <div className="rounded-xl bg-slate-50 p-4 space-y-3">
            <h3 className="font-bold">
              Correct attendance for{" "}
              {
                report?.data.find(
                  (r) =>
                    String(r.registration_id) === correction.registration_id,
                )?.full_name
              }
            </h3>
            <select
              aria-label="Attendance correction status"
              className={fieldClass}
              value={correction.status}
              onChange={(e) =>
                setCorrection({ ...correction, status: e.target.value })
              }
            >
              {["present", "partial", "absent", "clear"].map((s) => (
                <option key={s} value={s}>
                  {s === "clear" ? "Clear correction and use Zoom evidence" : s}
                </option>
              ))}
            </select>
            <input
              aria-label="Reason for attendance correction"
              placeholder="Reason for correction"
              className={fieldClass}
              value={correction.note}
              maxLength={1000}
              onChange={(e) =>
                setCorrection({ ...correction, note: e.target.value })
              }
            />
            <button
              className={buttonClass}
              disabled={busy || correction.note.trim().length < 3}
              onClick={() =>
                action(async () => {
                  const result = await adminApi(`${endpoint}/override`, {
                    method: "POST",
                    body: correction,
                  });
                  setMessage(result.message);
                  setCorrection({ ...correction, registration_id: "" });
                  await refresh();
                })
              }
            >
              Save correction
            </button>
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <h2 className="text-xl font-bold">
          Participants needing review ({report?.unmatched.length || 0})
        </h2>
        <p className="text-sm text-slate-500">
          Names are not automatically matched. Select the registered student
          only after checking their identity.
        </p>
        {report?.unmatched.map((p) => (
          <div
            className="border-t border-slate-100 pt-3 grid sm:grid-cols-3 gap-3 text-sm"
            key={p.id}
          >
            <div>
              {p.name || "Unnamed participant"}
              <br />
              {p.email || "No email returned"} ·{" "}
              {Math.round(p.duration_seconds / 60)} minutes
            </div>
            <select
              aria-label={`Match ${p.name || "unnamed participant"}`}
              className={fieldClass}
              value={matches[p.id] || ""}
              onChange={(e) =>
                setMatches({ ...matches, [p.id]: e.target.value })
              }
            >
              <option value="">Choose registration</option>
              {report.data.map((r) => (
                <option key={r.registration_id} value={r.registration_id}>
                  {r.full_name} · {r.email}
                </option>
              ))}
            </select>
            <button
              className={buttonClass}
              disabled={busy || !matches[p.id]}
              onClick={() =>
                action(async () => {
                  const result = await adminApi(`${endpoint}/match`, {
                    method: "POST",
                    body: {
                      participant_id: p.id,
                      registration_id: matches[p.id],
                    },
                  });
                  setMessage(result.message);
                  await refresh();
                })
              }
            >
              Match participant
            </button>
          </div>
        ))}
      </section>
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold">
          Attendance audit history
        </summary>
        {report?.audit.map((a) => (
          <p key={a.id} className="text-xs text-slate-500 mt-2">
            {new Date(a.created_at).toLocaleString()} · {a.action} · {a.detail}
          </p>
        ))}
      </details>
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Working…
        </p>
      )}
    </main>
  );
}
