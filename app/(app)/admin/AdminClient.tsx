"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import DraftBadge from "@/components/DraftBadge";
import PeriodSelector, { PeriodState } from "@/components/PeriodSelector";
import AddBlockDialog from "@/components/AddBlockDialog";
import RenameBlockDialog from "@/components/RenameBlockDialog";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import {
  Row, applyKpiToRows, sortByKpi, rankedOnly, fmtPct, calcKpi, RowWithKpi,
} from "@/lib/kpi";
import { loadPeriodRowsWithStatus } from "@/lib/useKpiData";
import { isFullAdmin, roleLabel } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

const FIELD_LABELS: Array<[keyof Row, string]> = [
  ["teamMembers", "Team Members"],
  ["trucks", "Trucks Checked"],
  ["cleanInspections", "Clean Ins."],
  ["totalInspections", "Total Ins."],
  ["violationPoints", "Viol. Points"],
];

// Human-readable list of what Publish would change compared with the live data.
function describeChanges(next: Row[], published: Row[] | null): string[] {
  const byId = new Map((published ?? []).map((r) => [String(r.id), r]));
  const out: string[] = [];
  for (const r of next) {
    const before = byId.get(String(r.id));
    const diffs = FIELD_LABELS
      .filter(([f]) => Number(before?.[f] ?? 0) !== Number(r[f] ?? 0))
      .map(([f, label]) => `${label} ${Number(before?.[f] ?? 0)} → ${Number(r[f] ?? 0)}`);
    if (diffs.length) out.push(`${r.name}: ${diffs.join(", ")}`);
  }
  return out;
}

type HistoryEntry = { id: number; at: string; by: string; kind: string; canRestore: boolean };

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

export default function AdminClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted,  setMounted]  = useState(true);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [role,     setRole]     = useState<Role | null>(null);
  const [period,   setPeriod]   = useState<PeriodState>({
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    month: now.getMonth() + 1,
    view: "month",
  });
  const [baseRows,  setBaseRows]  = useState<Row[]>([]);
  const [draftRows, setDraftRows] = useState<Row[] | null>(null);
  const [editMode,  setEditMode]  = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");
  const [unpublished, setUnpublished] = useState(false);
  const [addOpen,   setAddOpen]   = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmChanges, setConfirmChanges] = useState<string[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const activeRows  = draftRows ?? baseRows;
  const displayRows = editMode ? activeRows : sortByKpi(applyKpiToRows(activeRows));
  const rankedCount = editMode ? 0 : rankedOnly(displayRows as RowWithKpi[]).length;

  // Total Inspections can never be lower than Clean Inspections (a clean
  // inspection is a subset of total inspections) — block saving until fixed.
  const rowErrors = useMemo(() => {
    const map: Record<string, string> = {};
    if (!editMode) return map;
    for (const r of activeRows) {
      if (Number(r.totalInspections || 0) < Number(r.cleanInspections || 0)) {
        map[String(r.id)] = "Total inspections cannot be less than clean inspections.";
      }
    }
    return map;
  }, [activeRows, editMode]);
  const hasRowErrors = Object.keys(rowErrors).length > 0;

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function boot() {
    try {
      const me = await getMe();
      const r: Role | undefined = me.user?.role;
      setRole(r ?? null);
      // PERMISSIONS FIX — super_admin must have full Admin/Edit access too,
      // so this gate uses isFullAdmin() instead of a literal "admin" check.
      if (!r || !isFullAdmin(r)) { setIsAdmin(false); setLoading(false); return; }
      setIsAdmin(true);
      await loadData(period, true);
    } catch {
      router.replace("/");
    }
  }

  async function loadHistory(p: PeriodState) {
    if (p.view !== "month") { setHistory([]); return; }
    try {
      const out = await apiClient(`/api/results/month/history?year=${p.year}&month=${p.month}`);
      setHistory(out.history || []);
    } catch {
      setHistory([]);
    }
  }

  async function loadData(p: PeriodState, admin = isAdmin) {
    setLoading(true);
    if (admin) loadHistory(p);
    try {
      const { rows, unpublished } = await loadPeriodRowsWithStatus(p, admin);
      setUnpublished(unpublished);
      setBaseRows(rows);
      setDraftRows(null);
      setEditMode(false);
    } finally {
      setLoading(false);
    }
  }

  async function handlePeriodChange(next: PeriodState) {
    setPeriod(next);
    await loadData(next);
  }

  function startEdit() {
    setDraftRows(structuredClone(baseRows));
    setEditMode(true);
  }

  function cancelEdit() {
    setDraftRows(null);
    setEditMode(false);
    setToast("Cancelled — no changes saved");
  }

  function onChangeNumber(id: string, field: keyof Row, value: string) {
    const v = Number(value.replace(/[^\d]/g, "") || 0);
    setDraftRows((prev) => {
      const copy = structuredClone(prev ?? baseRows);
      const item = copy.find((x) => String(x.id) === String(id));
      if (!item) return copy;
      (item as unknown as Record<string, number>)[field as string] = v;
      return copy;
    });
  }

  async function saveDraft() {
    if (hasRowErrors) { setToast("Fix invalid numbers before saving ❌"); return; }
    setSaving(true);
    try {
      await apiClient("/api/results/month/draft", {
        method: "POST",
        body: JSON.stringify({ year: Number(period.year), month: Number(period.month), data: draftRows ?? baseRows }),
      });
      // Saved — Cancel should now return to these numbers, not the pre-edit ones.
      setBaseRows(structuredClone(draftRows ?? baseRows));
      setUnpublished(true);
      setToast("Draft saved ✅");
    } catch (err) {
      setToast(`Error saving draft ❌ ${err instanceof Error ? err.message : ""}`);
    } finally {
      setSaving(false);
    }
  }

  // Step 1 of Publish: show exactly what will change for viewers before doing it.
  async function openPublishConfirm() {
    if (hasRowErrors) { setToast("Fix invalid numbers before publishing ❌"); return; }
    try {
      const out = await apiClient(`/api/results/month?scope=published&year=${period.year}&month=${period.month}`);
      setConfirmChanges(describeChanges(draftRows ?? baseRows, (out.data as Row[] | null) ?? null));
    } catch {
      setConfirmChanges([]);
    }
  }

  async function restoreVersion(entry: HistoryEntry) {
    const when = new Date(entry.at).toLocaleString();
    if (!window.confirm(`Restore the version published ${when} by ${entry.by}? It will be visible to everyone right away.`)) return;
    setSaving(true);
    try {
      await apiClient("/api/results/month/restore", { method: "POST", body: JSON.stringify({ id: entry.id }) });
      setToast("Restored ✅");
      await loadData(period);
    } catch (err) {
      setToast(`Restore failed ❌ ${err instanceof Error ? err.message : ""}`);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (hasRowErrors) { setToast("Fix invalid numbers before publishing ❌"); return; }
    setConfirmChanges(null);
    setSaving(true);
    try {
      const y = Number(period.year), m = Number(period.month);
      await apiClient("/api/results/month/draft", {
        method: "POST",
        body: JSON.stringify({ year: y, month: m, data: draftRows ?? baseRows }),
      });
      await apiClient("/api/results/month/publish", {
        method: "POST",
        body: JSON.stringify({ year: y, month: m }),
      });
      setBaseRows(structuredClone(draftRows ?? baseRows));
      setDraftRows(null);
      setEditMode(false);
      setUnpublished(false);
      setToast("Published ✅ Viewers can now see this data");
      loadHistory(period);
    } catch (err) {
      setToast(`Publish failed ❌ ${err instanceof Error ? err.message : ""}`);
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  if (!isAdmin) {
    return (
      <>
        <div className="page-header">
          <div className="page-header-left">
            <span style={{ fontSize: 18 }}>⚙️</span>
            <h1>Admin / Edit</h1>
          </div>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <h3>Admin Access Only</h3>
            <p>You do not have permission to access this page.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>⚙️</span>
          <h1>Admin / Edit</h1>
        </div>
        <div className="page-header-right" style={{ gap: 8 }}>
          <DraftBadge show={unpublished && !loading && !editMode} />
          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setAddOpen(true)}
              disabled={loading || saving || editMode}
              title={editMode ? "Save or cancel your edits first" : undefined}
            >
              + Add Block
            </button>
          )}
          <span className="badge" style={{ background: "#dcfce7", color: "#065f46" }}>
            {role ? roleLabel(role) : "Admin"}
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Locked while editing so switching months can't silently discard unsaved numbers. */}
        <PeriodSelector period={period} onChange={handlePeriodChange} disabled={loading || saving || editMode} />

        {/* Edit mode controls */}
        {period.view === "month" && (
          <div className="edit-mode-bar">
            {editMode ? (
              <>
                {hasRowErrors ? (
                  <p style={{ color: "#b91c1c", fontWeight: 700 }}>
                    ⚠️ Total inspections cannot be less than clean inspections — fix the highlighted rows before saving.
                  </p>
                ) : (
                  <p>✏️ Edit mode active — modify numbers below, then Save Draft or Publish</p>
                )}
                <div className="edit-mode-actions">
                  <button className="btn btn-secondary btn-sm" onClick={cancelEdit} disabled={saving}>Cancel</button>
                  <button className="btn btn-secondary btn-sm" onClick={saveDraft} disabled={saving || hasRowErrors}>
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={openPublishConfirm} disabled={saving || hasRowErrors}>
                    {saving ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>View mode — click Edit to enter numbers for this month</p>
                <button className="btn btn-primary btn-sm" onClick={startEdit} disabled={loading}>
                  ✏️ Edit Numbers
                </button>
              </>
            )}
          </div>
        )}

        {period.view === "quarter" && (
          <div style={{ background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              Quarter view is read-only. Switch to Monthly view to edit individual months.
            </p>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {editMode ? "✏️ Editing — " : "Block Data — "}
              {period.view === "month"
                ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][period.month - 1]} ${period.year}`
                : `Q${period.quarter} ${period.year}`}
            </h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              {editMode ? "Changes are not published until you click Publish" : "Sorted by Final KPI"}
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
                      {!editMode && <th style={{ width: 40 }}>#</th>}
                      <th>Block</th>
                      <th className="num">Team Members</th>
                      <th className="num">Trucks Checked</th>
                      <th className="num">Clean Ins.</th>
                      <th className="num">Total Ins.</th>
                      <th className="num">Viol. Points</th>
                      <th className="num">Staff Adj.</th>
                      <th className="num">Staff %</th>
                      <th className="num">Discounts</th>
                      <th className="num">Final KPI</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editMode ? activeRows : (displayRows as RowWithKpi[])).map((row, idx) => {
                      const r      = editMode ? row as Row : row as RowWithKpi;
                      const kpi    = editMode ? calcKpi(r as Row) : (r as RowWithKpi).kpi;
                      const rowRaw = r as Row;

                      return (
                        <tr
                          key={r.id}
                          className={`table-row-animated${idx === 0 && rankedCount > 0 ? " rank-1" : idx === rankedCount - 1 && rankedCount > 1 ? " rank-worst" : ""}`}
                        >
                          {!editMode && (
                            <td>
                              <span className={`rank-num${(r as RowWithKpi).kpi.noData ? "" : idx === 0 ? " gold" : idx === 1 ? " silver" : idx === 2 ? " bronze" : ""}`}>
                                {(r as RowWithKpi).kpi.noData ? "—" : idx + 1}
                              </span>
                            </td>
                          )}
                          <td>
                            <strong>{r.name}</strong>
                            {isAdmin && !editMode && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                style={{ marginLeft: 6, padding: 2, verticalAlign: "middle", opacity: 0.6 }}
                                title="Rename block"
                                aria-label={`Rename ${r.name}`}
                                onClick={() => setRenameTarget({ id: String(r.id), name: r.name })}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </td>

                          <td className="num">
                            {editMode
                              ? <input className="cell-input" inputMode="numeric" value={rowRaw.teamMembers} onChange={(e) => onChangeNumber(r.id, "teamMembers", e.target.value)} />
                              : rowRaw.teamMembers || "—"}
                          </td>
                          <td className="num">
                            {editMode
                              ? <input className="cell-input" inputMode="numeric" value={rowRaw.trucks} onChange={(e) => onChangeNumber(r.id, "trucks", e.target.value)} />
                              : rowRaw.trucks || "—"}
                          </td>
                          <td className="num">
                            {editMode
                              ? <input className={`cell-input${rowErrors[r.id] ? " cell-input-error" : ""}`} inputMode="numeric" value={rowRaw.cleanInspections} onChange={(e) => onChangeNumber(r.id, "cleanInspections", e.target.value)} />
                              : rowRaw.cleanInspections || "—"}
                          </td>
                          <td className="num">
                            {editMode
                              ? (
                                <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                  <input className={`cell-input${rowErrors[r.id] ? " cell-input-error" : ""}`} inputMode="numeric" value={rowRaw.totalInspections} onChange={(e) => onChangeNumber(r.id, "totalInspections", e.target.value)} />
                                  {rowErrors[r.id] && <span className="cell-error-text">{rowErrors[r.id]}</span>}
                                </div>
                              )
                              : rowRaw.totalInspections || "—"}
                          </td>
                          <td className="num">
                            {editMode
                              ? <input className="cell-input" inputMode="numeric" value={rowRaw.violationPoints} onChange={(e) => onChangeNumber(r.id, "violationPoints", e.target.value)} />
                              : kpi.violPoint.toFixed(2)}
                          </td>

                          <td className="num">
                            <span style={{ color: kpi.staffDelta < 0 ? "#16a34a" : kpi.staffDelta > 0 ? "#dc2626" : "var(--text-muted)", fontWeight: 700 }}>
                              {kpi.staffDelta !== 0 ? (kpi.staffDelta > 0 ? "+" : "") + kpi.staffDelta.toFixed(2) : "—"}
                            </span>
                          </td>
                          <td className="num">
                            <span style={{ color: kpi.staffPercent < 0 ? "#16a34a" : kpi.staffPercent > 0 ? "#dc2626" : "var(--text-muted)", fontWeight: 700 }}>
                              {fmtPct(kpi.staffPercent)}
                            </span>
                          </td>
                          <td className="num">
                            {(kpi.cleanDelta + kpi.inspectionDelta) > 0
                            ? <span title={`Clean −${kpi.cleanDelta.toFixed(2)} · Inspections −${kpi.inspectionDelta.toFixed(2)}`} style={{ color: "#16a34a", fontWeight: 700 }}>−{(kpi.cleanDelta + kpi.inspectionDelta).toFixed(2)}</span>
                            : "—"}
                          </td>
                          <td className="num">
                            <strong style={{ fontSize: 14 }}>{kpi.finalKpi.toFixed(2)}</strong>
                          </td>
                          <td>
                            <span className={BADGE_CLASS[kpi.status]}>{kpi.status}</span>
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

        {isAdmin && period.view === "month" && history.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-header">
              <h2 className="card-title">Publish history</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Restore puts an earlier version back live</span>
            </div>
            <div className="card-body no-pad">
              <table className="data-table">
                <tbody>
                  {history.map((h, i) => (
                    <tr key={h.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(h.at).toLocaleString()}</td>
                      <td>
                        {h.kind === "approve" ? "Approved a Block Manager change" : h.kind === "restore" ? "Restored an earlier version" : "Published"}
                        {" "}by <strong>{h.by}</strong>
                        {i === 0 && <span className="badge badge-perfect" style={{ marginLeft: 8 }}>Live</span>}
                      </td>
                      <td className="num">
                        {i > 0 && h.canRestore && (
                          <button className="btn btn-secondary btn-sm" onClick={() => restoreVersion(h)} disabled={saving || editMode}>
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>Admin Notes:</strong>{" "}
          Edit mode shows live KPI previews as you type. Use "Save Draft" to store without making visible to viewers.
          Use "Publish" to make data visible to all viewers. Quarter view combines 3 months automatically — edit individual months instead.
        </div>
      </div>

      {/* Publish confirmation — lists every change viewers will see */}
      <Dialog.Root open={confirmChanges !== null} onOpenChange={(o) => { if (!o) setConfirmChanges(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
            <div className="add-block-header">
              <Dialog.Title className="alox-title">
                Publish {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][period.month - 1]} {period.year}?
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              {confirmChanges && confirmChanges.length > 0 ? (
                <>
                  <p style={{ marginTop: 0, fontSize: 13 }}>Everyone will see these changes:</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, maxHeight: 280, overflowY: "auto" }}>
                    {confirmChanges.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13 }}>No changes compared with what is already published.</p>
              )}
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-primary btn-sm" onClick={publish} disabled={saving}>
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <RenameBlockDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={async (name) => {
          setToast(`Block renamed to "${name}" ✅`);
          await loadData(period);
        }}
      />

      <AddBlockDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={async (name) => {
          setToast(`Block "${name}" added ✅`);
          await loadData(period);
        }}
      />

      {toast && (
        <div className="toast-wrapper">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  );
}
