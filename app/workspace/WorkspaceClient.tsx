"use client";

// =====================================================================
// RBAC FEATURE — "My Workspace"
//
// One role-aware page that hosts the role-scoped tools introduced by the
// role-based access system: the Block Manager's What-If simulator + drafts,
// HR's Team Members editor, Accounting's Truck Count editor, and the Super
// Admin's draft approval queue. Nothing here touches KPI calculations, the
// database schema beyond the additive `field_drafts` table, or any existing
// page — it is purely additive and can be removed by deleting this directory,
// app/api/users/**, app/api/drafts/**, and the matching nav entries in
// AppShell.tsx without affecting anything else.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PeriodSelector, { PeriodState } from "@/components/PeriodSelector";
import { AUTH_TOKEN_KEY, apiClient } from "@/lib/apiClient";
import { Row, RowWithKpi, calcKpi, applyKpiToRows, inspectionStats, MONTHS, fmtPct } from "@/lib/kpi";
import { loadPeriodRows, fetchBlockDefs } from "@/lib/useKpiData";
import { roleLabel } from "@/lib/permissions";

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

type Me = {
  username: string;
  role: string;
  assignedBlock: { id: string; name: string } | null;
};

type DraftField = "teamMembers" | "trucks" | "cleanInspections" | "totalInspections" | "violationPoints";

type DraftStatus = "draft" | "pending" | "published";

type DraftDTO = {
  id: number;
  userId: number;
  username: string;
  blockId: string;
  blockName: string;
  year: number;
  month: number;
  changes: Partial<Record<DraftField, number>>;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

function monthLabel(month: number) {
  return MONTHS.find((m) => m.n === month)?.name || String(month);
}

function periodNow(): PeriodState {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    month: now.getMonth() + 1,
    view: "month",
  };
}

function fieldLabel(field: DraftField): string {
  switch (field) {
    case "teamMembers": return "Team Members";
    case "trucks": return "Trucks";
    case "cleanInspections": return "Clean Inspections";
    case "totalInspections": return "Total Inspections";
    case "violationPoints": return "Violation Points";
  }
}

function StatusPill({ status }: { status: DraftStatus }) {
  if (status === "published") {
    return <span className="badge" style={{ background: "#dcfce7", color: "#065f46" }}>Published</span>;
  }
  if (status === "pending") {
    return <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Pending review</span>;
  }
  return <span className="badge" style={{ background: "#e0e7ff", color: "#3730a3" }}>Draft</span>;
}

// =====================================================================
// Block Manager — "My Block" + What-If Simulator
// =====================================================================
function BlockManagerPanel({ me }: { me: Me }) {
  const block = me.assignedBlock;
  const [period, setPeriod] = useState<PeriodState>(periodNow());
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Row | null>(null);
  const [periodRows, setPeriodRows] = useState<Row[]>([]);
  const [draftValues, setDraftValues] = useState<Record<DraftField, number>>({
    teamMembers: 0, trucks: 0, cleanInspections: 0, totalInspections: 0, violationPoints: 0,
  });
  const [myDraft, setMyDraft] = useState<DraftDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { load(period); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period.year, period.month, period.view]);

  async function load(p: PeriodState) {
    if (!block) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await loadPeriodRows(p, false);
      const row = rows.find((r) => String(r.id) === block.id) || null;
      setPeriodRows(rows);
      setCurrent(row);
      if (row) {
        setDraftValues({
          teamMembers: row.teamMembers,
          trucks: row.trucks,
          cleanInspections: row.cleanInspections,
          totalInspections: row.totalInspections,
          violationPoints: row.violationPoints,
        });
      }

      const mine = await apiClient("/api/drafts?scope=mine");
      const drafts = (mine.drafts || []) as DraftDTO[];
      const own = drafts.find((d) => d.blockId === block.id && d.year === p.year && d.month === p.month && d.status === "pending") || null;
      setMyDraft(own);
      if (own && row) {
        setDraftValues({
          teamMembers: own.changes.teamMembers ?? row.teamMembers,
          trucks: own.changes.trucks ?? row.trucks,
          cleanInspections: own.changes.cleanInspections ?? row.cleanInspections,
          totalInspections: own.changes.totalInspections ?? row.totalInspections,
          violationPoints: own.changes.violationPoints ?? row.violationPoints,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function setField(field: DraftField, raw: string) {
    const v = Number(raw.replace(/[^\d]/g, "") || 0);
    setDraftValues((prev) => ({ ...prev, [field]: v }));
  }

  function resetToPublished() {
    if (!current) return;
    setDraftValues({
      teamMembers: current.teamMembers,
      trucks: current.trucks,
      cleanInspections: current.cleanInspections,
      totalInspections: current.totalInspections,
      violationPoints: current.violationPoints,
    });
    setToast("Reset to published values");
  }

  const projectedRow: Row | null = current ? { ...current, ...draftValues } : null;
  // The inspection discount compares against every block in the period.
  const currentKpi = current ? calcKpi(current, inspectionStats(periodRows)) : null;
  const projectedKpi = projectedRow
    ? calcKpi(projectedRow, inspectionStats(periodRows.map((r) => (r.id === projectedRow.id ? projectedRow : r))))
    : null;

  const changedFields = useMemo(() => {
    if (!current) return [] as DraftField[];
    const fields: DraftField[] = ["teamMembers", "trucks", "cleanInspections", "totalInspections", "violationPoints"];
    return fields.filter((f) => Number(draftValues[f]) !== Number(current[f]));
  }, [current, draftValues]);

  async function saveDraft() {
    if (!block || !current) return;
    if (!changedFields.length) { setToast("No changes to save — adjust a value first"); return; }
    if (Number(draftValues.totalInspections) < Number(draftValues.cleanInspections)) {
      setToast("Total inspections cannot be less than clean inspections ❌");
      return;
    }
    setSaving(true);
    try {
      const changes: Partial<Record<DraftField, number>> = {};
      for (const f of changedFields) changes[f] = draftValues[f];
      await apiClient("/api/drafts", {
        method: "POST",
        body: JSON.stringify({ blockId: block.id, year: period.year, month: period.month, changes }),
      });
      setToast("Draft saved ✅ — visible only to you until a Super Admin publishes it");
      await load(period);
    } catch (e: any) {
      setToast(e?.message || "Could not save draft ❌");
    } finally {
      setSaving(false);
    }
  }

  async function discardDraft() {
    if (!myDraft) return;
    setSaving(true);
    try {
      await apiClient(`/api/drafts/${myDraft.id}/discard`, { method: "POST" });
      setToast("Draft discarded");
      await load(period);
    } catch (e: any) {
      setToast(e?.message || "Could not discard draft ❌");
    } finally {
      setSaving(false);
    }
  }

  if (!block) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🚧</div>
        <h3>No block assigned</h3>
        <p>Ask a Super Admin to assign you a block from User Management.</p>
      </div>
    );
  }

  return (
    <>
      <PeriodSelector period={period} onChange={setPeriod} disabled={loading || saving} />

      {period.view === "quarter" ? (
        <div style={{ background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            The What-If simulator works on individual months. Switch to Monthly view to run a simulation.
          </p>
        </div>
      ) : loading ? (
        <div className="card"><div className="card-body"><div className="empty-state"><p>Loading…</p></div></div></div>
      ) : !current ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No data for this period yet</h3>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h2 className="card-title">🏢 {block.name} — {monthLabel(period.month)} {period.year}</h2>
              {myDraft && <StatusPill status={myDraft.status} />}
            </div>
            <div className="card-body">
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
                Current published Final KPI: <strong style={{ color: "var(--text)" }}>{currentKpi?.finalKpi.toFixed(2)}</strong>{" "}
                <span className={BADGE_CLASS[currentKpi?.status || "Good"]}>{currentKpi?.status}</span>
              </p>
              {myDraft && (
                <div className="rbac-note">
                  You have a pending draft for this period — {myDraft.status === "pending" ? "awaiting Super Admin review" : "already published"}.
                  {myDraft.status === "pending" && (
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: 10 }} onClick={discardDraft} disabled={saving}>
                      Discard draft
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="workspace-grid">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🧪 What If Analysis</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Local simulation — nothing is saved until you click Save Draft</span>
              </div>
              <div className="card-body">
                <div className="whatif-grid">
                  {(["teamMembers", "trucks", "cleanInspections", "totalInspections", "violationPoints"] as DraftField[]).map((f) => (
                    <label key={f} className="whatif-field">
                      <span>{fieldLabel(f)}</span>
                      <input
                        className="cell-input"
                        inputMode="numeric"
                        value={draftValues[f]}
                        onChange={(e) => setField(f, e.target.value)}
                      />
                      <span className="whatif-current">currently {current[f]}</span>
                    </label>
                  ))}
                </div>
                <div className="edit-mode-actions" style={{ marginTop: 14 }}>
                  <button className="btn btn-secondary btn-sm" onClick={resetToPublished} disabled={saving}>Reset to current</button>
                  <button className="btn btn-primary btn-sm" onClick={saveDraft} disabled={saving || !changedFields.length}>
                    {saving ? "Saving…" : "💾 Save Draft"}
                  </button>
                </div>
                <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                  Block Managers cannot publish — drafts are reviewed and published by a Super Admin, and stay private to you until then.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">📈 Projected Result</h2>
              </div>
              <div className="card-body">
                {projectedKpi && currentKpi && (
                  <>
                    <div className="whatif-projection">
                      <div>
                        <span className="whatif-projection-label">Projected Final KPI</span>
                        <strong className="whatif-projection-value">{projectedKpi.finalKpi.toFixed(2)}</strong>
                        <span className={`whatif-projection-delta ${projectedKpi.finalKpi <= currentKpi.finalKpi ? "good" : "bad"}`}>
                          {projectedKpi.finalKpi === currentKpi.finalKpi ? "No change" :
                            `${projectedKpi.finalKpi < currentKpi.finalKpi ? "▼" : "▲"} ${Math.abs(projectedKpi.finalKpi - currentKpi.finalKpi).toFixed(2)} vs current`}
                        </span>
                      </div>
                      <div>
                        <span className="whatif-projection-label">Projected Status</span>
                        <span className={BADGE_CLASS[projectedKpi.status]} style={{ fontSize: 13 }}>{projectedKpi.status}</span>
                        {projectedKpi.status !== currentKpi.status && (
                          <span className="whatif-projection-delta" style={{ display: "block", marginTop: 4 }}>
                            was <span className={BADGE_CLASS[currentKpi.status]}>{currentKpi.status}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <table className="data-table" style={{ marginTop: 14 }}>
                      <thead>
                        <tr><th>Metric</th><th className="num">Current</th><th className="num">Projected</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Staff adjustment</td><td className="num">{fmtPct(currentKpi.staffPercent)}</td><td className="num">{fmtPct(projectedKpi.staffPercent)}</td></tr>
                        <tr><td>Clean discount applied</td><td className="num">{currentKpi.cleanDelta > 0 ? `−${currentKpi.cleanDelta.toFixed(2)}` : "—"}</td><td className="num">{projectedKpi.cleanDelta > 0 ? `−${projectedKpi.cleanDelta.toFixed(2)}` : "—"}</td></tr>
                        <tr><td>Inspection bonus</td><td className="num">{currentKpi.inspectionDelta > 0 ? `−${currentKpi.inspectionDelta.toFixed(2)}` : "—"}</td><td className="num">{projectedKpi.inspectionDelta > 0 ? `−${projectedKpi.inspectionDelta.toFixed(2)}` : "—"}</td></tr>
                        <tr><td>Final KPI</td><td className="num"><strong>{currentKpi.finalKpi.toFixed(2)}</strong></td><td className="num"><strong>{projectedKpi.finalKpi.toFixed(2)}</strong></td></tr>
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </>
  );
}

// =====================================================================
// HR / Accounting — single-field, company-wide editor
// =====================================================================
function FieldEditorPanel({ field, label, icon }: { field: DraftField; label: string; icon: string }) {
  const [period, setPeriod] = useState<PeriodState>(periodNow());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RowWithKpi[]>([]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftDTO>>({});
  const [history, setHistory] = useState<DraftDTO[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { load(period); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period.year, period.month, period.view]);

  async function load(p: PeriodState) {
    setLoading(true);
    try {
      const raw = await loadPeriodRows(p, false);
      const withKpi = applyKpiToRows(raw);
      setRows(withKpi);

      const mine = await apiClient("/api/drafts?scope=mine");
      const list = ((mine.drafts || []) as DraftDTO[]).filter((d) => d.changes[field] !== undefined);

      // RBAC FEATURE — "No draft" / "Draft" / "Pending review" pill for the
      // selected period comes from the caller's own not-yet-published
      // submission for that block (status 'draft' while private, 'pending'
      // once Submit for Review is pressed). Published rows never show here —
      // they've already been merged into the live published data.
      const map: Record<string, DraftDTO> = {};
      const editMap: Record<string, number> = {};
      for (const d of list) {
        if (d.year !== p.year || d.month !== p.month || d.status === "published") continue;
        map[d.blockId] = d;
        editMap[d.blockId] = Number(d.changes[field]);
      }
      setDrafts(map);
      setEdits((prev) => {
        const next: Record<string, number> = {};
        for (const r of withKpi) next[r.id] = editMap[r.id] ?? r[field];
        return next;
      });

      setHistory(list);
    } finally {
      setLoading(false);
    }
  }

  function setEdit(blockId: string, raw: string) {
    const v = Number(raw.replace(/[^\d]/g, "") || 0);
    setEdits((prev) => ({ ...prev, [blockId]: v }));
  }

  async function save(row: RowWithKpi, submit: boolean) {
    const value = edits[row.id];
    const draft = drafts[row.id];
    if (!draft && value === Number(row[field])) { setToast("No change to save"); return; }
    setBusyId(row.id);
    try {
      await apiClient("/api/drafts", {
        method: "POST",
        body: JSON.stringify({ blockId: row.id, year: period.year, month: period.month, changes: { [field]: value }, submit }),
      });
      setToast(submit
        ? `${label} change for ${row.name} submitted for Super Admin review ✅`
        : `Draft saved for ${row.name} — still private until you submit it ✅`);
      await load(period);
    } catch (e: any) {
      setToast(e?.message || "Could not save ❌");
    } finally {
      setBusyId(null);
    }
  }

  async function discard(row: RowWithKpi) {
    const draft = drafts[row.id];
    if (!draft) return;
    setBusyId(row.id);
    try {
      await apiClient(`/api/drafts/${draft.id}/discard`, { method: "POST" });
      setToast(draft.status === "pending" ? `Submission withdrawn for ${row.name}` : `Draft cleared for ${row.name}`);
      await load(period);
    } catch (e: any) {
      setToast(e?.message || "Could not discard ❌");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PeriodSelector period={period} onChange={setPeriod} disabled={loading} />

      {period.view === "quarter" ? (
        <div style={{ background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Quarter view is read-only here. Switch to Monthly view to edit {label.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{icon} {label} — {monthLabel(period.month)} {period.year}</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              Save Draft to keep changes private, then Submit for Review to send them to the Super Admin for approval
            </span>
          </div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th className="num">Current {label}</th>
                      <th className="num">New {label}</th>
                      <th>Draft status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const draft = drafts[r.id];
                      const dirty = edits[r.id] !== undefined && Number(edits[r.id]) !== Number(r[field]);
                      const submitted = draft?.status === "pending";
                      return (
                        <tr key={r.id} className="table-row-animated">
                          <td><strong>{r.name}</strong></td>
                          <td className="num">{r[field]}</td>
                          <td className="num">
                            <input
                              className="cell-input"
                              inputMode="numeric"
                              value={edits[r.id] ?? r[field]}
                              onChange={(e) => setEdit(r.id, e.target.value)}
                              disabled={busyId === r.id || submitted}
                            />
                          </td>
                          <td>{draft ? <StatusPill status={draft.status} /> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No draft</span>}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {!submitted && (
                                <>
                                  <button className="btn btn-secondary btn-sm" onClick={() => save(r, false)} disabled={busyId === r.id || !dirty}>
                                    {busyId === r.id ? "…" : "💾 Save Draft"}
                                  </button>
                                  <button className="btn btn-primary btn-sm" onClick={() => save(r, true)} disabled={busyId === r.id || !dirty}>
                                    Submit for Review
                                  </button>
                                </>
                              )}
                              {draft && (
                                <button className="btn btn-secondary btn-sm" onClick={() => discard(r)} disabled={busyId === r.id}>
                                  {submitted ? "Withdraw" : "Discard"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ margin: "10px 16px", fontSize: 12, color: "var(--text-muted)" }}>
              {label} changes cannot be published directly — every submission is reviewed and approved by a Super Admin before it appears on the Dashboard, Reports, Analytics, and Leaderboard.
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header">
          <h2 className="card-title">🕘 History of submitted {label.toLowerCase()} changes</h2>
        </div>
        <div className="card-body no-pad">
          {history.length === 0 ? (
            <div className="empty-state"><p>You haven&apos;t submitted any {label.toLowerCase()} changes yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Period</th>
                    <th className="num">New {label}</th>
                    <th>Status</th>
                    <th>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .slice()
                    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
                    .map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.blockName || d.blockId}</strong></td>
                        <td>{monthLabel(d.month)} {d.year}</td>
                        <td className="num">{d.changes[field]}</td>
                        <td><StatusPill status={d.status} /></td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(d.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </>
  );
}

// =====================================================================
// Super Admin / Admin — pending Block Manager draft review queue
// =====================================================================
function ApprovalQueuePanel() {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftDTO[]>([]);
  const [currentByPeriod, setCurrentByPeriod] = useState<Record<string, RowWithKpi[]>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function load() {
    setLoading(true);
    try {
      const out = await apiClient("/api/drafts?scope=pending");
      const list = (out.drafts || []) as DraftDTO[];
      setDrafts(list);

      const periods = Array.from(new Set(list.map((d) => `${d.year}-${d.month}`)));
      const map: Record<string, RowWithKpi[]> = {};
      for (const key of periods) {
        const [y, m] = key.split("-").map(Number);
        const raw = await loadPeriodRows({ year: y, quarter: Math.floor((m - 1) / 3) + 1, month: m, view: "month" }, false);
        map[key] = applyKpiToRows(raw);
      }
      setCurrentByPeriod(map);
    } finally {
      setLoading(false);
    }
  }

  async function approve(d: DraftDTO) {
    setBusyId(d.id);
    try {
      await apiClient(`/api/drafts/${d.id}/publish`, { method: "POST" });
      setToast(`Published ${d.username}'s draft for ${d.blockName} ✅`);
      await load();
    } catch (e: any) {
      setToast(e?.message || "Could not publish ❌");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(d: DraftDTO) {
    setBusyId(d.id);
    try {
      await apiClient(`/api/drafts/${d.id}/discard`, { method: "POST" });
      setToast(`Rejected ${d.username}'s draft for ${d.blockName}`);
      await load();
    } catch (e: any) {
      setToast(e?.message || "Could not reject ❌");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🗂️ Pending Block Manager Drafts</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            {drafts.length} awaiting review
          </span>
        </div>
        <div className="card-body no-pad">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : !drafts.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <h3>Nothing pending</h3>
              <p>Block Manager draft submissions will appear here for review.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submitted by</th>
                    <th>Block</th>
                    <th>Period</th>
                    <th>Proposed changes</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => {
                    const periodKey = `${d.year}-${d.month}`;
                    const currentRow = currentByPeriod[periodKey]?.find((r) => r.id === d.blockId);
                    return (
                      <tr key={d.id} className="table-row-animated">
                        <td><strong>{d.username}</strong></td>
                        <td>{d.blockName}</td>
                        <td>{monthLabel(d.month)} {d.year}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {(Object.keys(d.changes) as DraftField[]).map((f) => (
                              <span key={f} style={{ fontSize: 12 }}>
                                <strong>{fieldLabel(f)}:</strong>{" "}
                                {currentRow ? `${currentRow[f]} → ` : ""}
                                <span style={{ color: "var(--green-700)", fontWeight: 700 }}>{d.changes[f]}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(d.updatedAt).toLocaleString()}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => approve(d)} disabled={busyId === d.id}>
                              {busyId === d.id ? "…" : "✅ Approve & Publish"}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => reject(d)} disabled={busyId === d.id}>
                              ✖ Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </>
  );
}

// =====================================================================
// Page shell — boot, role gate, and routing to the right panel
// =====================================================================
export default function WorkspaceClient() {
  const router = useRouter();
  const [mounted, setMounted] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      const out = await apiClient("/api/me");
      const role = out.user?.role;
      const allowed = ["block_manager", "hr", "accounting", "super_admin", "admin"];
      if (!allowed.includes(role)) { setDenied(true); return; }
      setMe(out.user);
      await fetchBlockDefs();
    } catch {
      router.replace("/");
    }
  }

  if (!mounted) return null;

  if (denied || !me) {
    return (
      <AppShell>
        <div className="page-header">
          <div className="page-header-left">
            <span style={{ fontSize: 18 }}>🧰</span>
            <h1>My Workspace</h1>
          </div>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <h3>No workspace tools for your role</h3>
            <p>This page hosts role-specific tools for Block Managers, HR, Accounting, and Super Admins.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const titleByRole: Record<string, { icon: string; title: string; subtitle: string }> = {
    block_manager: { icon: "🏢", title: "My Block", subtitle: "What-If simulator and draft changes for your assigned block" },
    hr:            { icon: "👥", title: "Team Members Editor", subtitle: "Update team member counts across all blocks" },
    accounting:    { icon: "🚚", title: "Truck Count Editor", subtitle: "Update truck counts across all blocks" },
    super_admin:   { icon: "🗂️", title: "Draft Approvals", subtitle: "Review and publish Block Manager draft submissions" },
    admin:         { icon: "🗂️", title: "Draft Approvals", subtitle: "Review and publish Block Manager draft submissions" },
  };
  const meta = titleByRole[me.role] || { icon: "🧰", title: "My Workspace", subtitle: "" };

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <h1>{meta.title}</h1>
        </div>
        <div className="page-header-right">
          <span className="badge" style={{ background: "var(--green-50)", color: "var(--green-700)" }}>{roleLabel(me.role as any)}</span>
        </div>
      </div>
      <div className="page-body">
        <p style={{ marginTop: -6, marginBottom: 14, fontSize: 13, color: "var(--text-muted)" }}>{meta.subtitle}</p>

        {me.role === "block_manager" && <BlockManagerPanel me={me} />}
        {me.role === "hr" && <FieldEditorPanel field="teamMembers" label="Team Members" icon="👥" />}
        {me.role === "accounting" && <FieldEditorPanel field="trucks" label="Truck Count" icon="🚚" />}
        {(me.role === "super_admin" || me.role === "admin") && <ApprovalQueuePanel />}
      </div>
    </AppShell>
  );
}
