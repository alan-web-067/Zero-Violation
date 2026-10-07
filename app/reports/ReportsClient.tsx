"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, MoreVertical } from "lucide-react";
import AppShell from "@/components/AppShell";
import PeriodSelector, { PeriodState } from "@/components/PeriodSelector";
import AddBlockDialog from "@/components/AddBlockDialog";
import RenameBlockDialog from "@/components/RenameBlockDialog";
import { AUTH_TOKEN_KEY, apiClient } from "@/lib/apiClient";
import { applyKpiToRows, sortByKpi, rankedOnly, fmtPct, MONTHS, Row } from "@/lib/kpi";
import { loadPeriodRows, fetchBlockDefs, invalidateBlockDefsCache, BlockDef } from "@/lib/useKpiData";
import { isFullAdmin } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

function emptyToNumber(s: string) {
  const t = s.trim();
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
}

const MENU_WIDTH = 172;
// Constant — the menu always has exactly 3 items, so its rendered height never
// varies. Used purely to decide whether it should flip upward; the actual
// upward anchoring is done with `translateY(-100%)` so it's pixel-perfect
// regardless of this estimate.
const MENU_HEIGHT_ESTIMATE = 132;

// Three-dots menu for managing a block (Edit / Rename / Delete-Activate).
// Renders into a body-level portal with fixed positioning computed from the
// trigger button's screen position — this keeps it from being clipped by the
// table's scroll container / stacking context (which made it look "broken"
// when rendered inline), flips leftward near the right edge, and flips upward
// near the bottom edge so it's always fully visible without scrolling.
function BlockActionsMenu({
  block,
  onEdit,
  onRename,
  onDelete,
  onActivate,
}: {
  block: BlockDef;
  onEdit: (b: BlockDef) => void;
  onRename: (b: BlockDef) => void;
  onDelete: (b: BlockDef) => void;
  onActivate: (b: BlockDef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function computePosition() {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < MENU_HEIGHT_ESTIMATE + 12 && spaceAbove > spaceBelow;
    const openLeft = window.innerWidth - rect.right < MENU_WIDTH + 12;
    setPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: openLeft ? Math.max(8, rect.right - MENU_WIDTH) : rect.left,
      openUp,
    });
  }

  useEffect(() => {
    if (!open) return;
    computePosition();

    function onReposition() { computePosition(); }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(fn: (b: BlockDef) => void) {
    setOpen(false);
    fn(block);
  }

  return (
    <div className="block-actions">
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={`Actions for ${block.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={16} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        // Outer wrapper owns the fixed position + upward anchor flip
        // (translateY(-100%) anchors the menu's bottom edge to the trigger,
        // so it's correctly placed regardless of its rendered height).
        // The inner element owns the open animation — keeping the two
        // transforms on separate elements means they never conflict.
        <div
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: MENU_WIDTH,
            transform: pos.openUp ? "translateY(-100%)" : undefined,
          }}
        >
          <div
            ref={menuRef}
            className={`block-actions-menu ${pos.openUp ? "block-actions-menu-up" : "block-actions-menu-down"}`}
            role="menu"
          >
            <button type="button" role="menuitem" onClick={() => pick(onEdit)}>Edit Block</button>
            <button type="button" role="menuitem" onClick={() => pick(onRename)}>Rename Block</button>
            {block.status === "active" ? (
              <button type="button" role="menuitem" className="block-actions-danger" onClick={() => pick(onDelete)}>Delete Block</button>
            ) : (
              <button type="button" role="menuitem" onClick={() => pick(onActivate)}>Activate Block</button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ReportsClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted,  setMounted]  = useState(true);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [period,   setPeriod]   = useState<PeriodState>({
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    month: now.getMonth() + 1,
    view: "month",
  });
  const [rows,    setRows]    = useState<Row[]>([]);
  const [blocks,  setBlocks]  = useState<BlockDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState("");

  // Add Block
  const [addOpen, setAddOpen] = useState(false);

  // Edit Block
  const [editTarget, setEditTarget] = useState<BlockDef | null>(null);
  const [editName,   setEditName]   = useState("");
  const [editTeam,   setEditTeam]   = useState("");
  const [editTrucks, setEditTrucks] = useState("");
  const [editNotes,  setEditNotes]  = useState("");
  const [editError,  setEditError]  = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Rename Block
  const [renameTarget, setRenameTarget] = useState<BlockDef | null>(null);

  // Delete (soft — sets Inactive) confirmation
  const [deleteTarget, setDeleteTarget] = useState<BlockDef | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const sorted = useMemo(() => sortByKpi(applyKpiToRows(rows)), [rows]);

  // Period-scoped report summary — lowest Final KPI = best, so sorted[0] is the
  // Winner and the last entry Needs Improvement. Derived purely from `sorted`,
  // never recomputed — this must stay a read-only view over the existing KPI pipeline.
  const rankedCount = useMemo(() => rankedOnly(sorted).length, [sorted]);
  const reportSummary = useMemo(() => {
    const ranked = rankedOnly(sorted);
    if (ranked.length === 0) return null;
    return {
      winner: ranked[0],
      needsImprovement: ranked[ranked.length - 1],
      avgKpi: ranked.reduce((s, r) => s + r.kpi.finalKpi, 0) / ranked.length,
      activeBlocks: ranked.length,
    };
  }, [sorted]);

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
      const me   = await apiClient("/api/me");
      const role = me.user?.role;
      // RBAC FEATURE — Reports surfaces KPI/violation rankings; HR/Accounting's
      // job has nothing to do with KPI, so send them to their own dashboard
      // (the nav link is hidden too — see components/AppShell.tsx — this is
      // the matching server-side-reachable guard for direct navigation).
      if (role === "hr" || role === "accounting") { router.replace("/dashboard"); return; }
      // PERMISSIONS FIX — super_admin gets the same draft-scope visibility as admin.
      const admin = isFullAdmin(role as Role);
      setIsAdmin(admin);
      await loadData(period, admin);
    } catch {
      router.replace("/");
    }
  }

  async function loadData(p: PeriodState, admin = isAdmin) {
    setLoading(true);
    try {
      const [data, defs] = await Promise.all([
        loadPeriodRows(p, admin),
        fetchBlockDefs(),
      ]);
      setRows(data);
      setBlocks(defs);
    } finally {
      setLoading(false);
    }
  }

  // Re-fetches the shared block registry + this period's rows after any
  // create / edit / rename / status change — so Reports, and every other page
  // that reads loadPeriodRows, reflect the change immediately.
  async function reloadAfterBlockChange() {
    invalidateBlockDefsCache();
    await loadData(period);
  }

  async function handlePeriodChange(next: PeriodState) {
    setPeriod(next);
    await loadData(next);
  }

  // ---------- Edit Block ----------
  function openEditBlock(b: BlockDef) {
    setEditTarget(b);
    setEditName(b.name);
    setEditTeam(String(b.teamMembers));
    setEditTrucks(String(b.trucks));
    setEditNotes(b.notes);
    setEditError("");
  }

  async function handleEditBlock(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editTarget) return;
    setEditError("");

    const name = editName.trim();
    if (!name) { setEditError("Block Name is required."); return; }

    const team = emptyToNumber(editTeam);
    if (team === null) { setEditError("Team Members must be a number."); return; }

    const trucks = emptyToNumber(editTrucks);
    if (trucks === null) { setEditError("Truck Count must be a number."); return; }

    setEditSaving(true);
    try {
      await apiClient(`/api/blocks/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, teamMembers: team, trucks, notes: editNotes.trim() }),
      });
      setEditTarget(null);
      setToast(`Block "${name}" updated ✅`);
      await reloadAfterBlockChange();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update block");
    } finally {
      setEditSaving(false);
    }
  }

  // ---------- Rename Block ----------
  function openRenameBlock(b: BlockDef) {
    setRenameTarget(b);
  }

  // ---------- Delete (soft → Inactive) / Activate ----------
  function openDeleteBlock(b: BlockDef) {
    setDeleteTarget(b);
  }

  async function confirmDeleteBlock() {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiClient(`/api/blocks/${deleteTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "inactive" }),
      });
      setToast(`Block "${deleteTarget.name}" deleted (set Inactive) ✅`);
      setDeleteTarget(null);
      await reloadAfterBlockChange();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to delete block");
      setDeleteTarget(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  async function activateBlock(b: BlockDef) {
    try {
      await apiClient(`/api/blocks/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      setToast(`Block "${b.name}" activated ✅`);
      await reloadAfterBlockChange();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to activate block");
    }
  }

  const periodLabel =
    period.view === "month"
      ? `${MONTHS.find((x) => x.n === period.month)?.name ?? ""} ${period.year}`
      : `Q${period.quarter} ${period.year}`;

  function csvRow(cells: (string | number)[]) {
    return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
  }

  function downloadCsv() {
    if (!reportSummary) {
      setToast("No report data available for this period.");
      return;
    }
    const { winner, needsImprovement, avgKpi, activeBlocks } = reportSummary;

    const lines: string[] = [
      csvRow(["ALGO GROUP — Zero Violations Report"]),
      csvRow(["Selected Period", periodLabel]),
      csvRow(["Generated", `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`]),
      "",
      csvRow(["Winner Block", `${winner.name} (Final KPI ${winner.kpi.finalKpi.toFixed(2)})`]),
      csvRow(["Needs Improvement Block", `${needsImprovement.name} (Final KPI ${needsImprovement.kpi.finalKpi.toFixed(2)})`]),
      csvRow(["Average KPI", avgKpi.toFixed(2)]),
      csvRow(["Active Blocks", activeBlocks]),
      "",
      csvRow(["FULL BLOCK REPORT — " + periodLabel]),
    ];

    const header = [
      "Rank","Block","Team Members","Trucks Checked","Clean Inspections",
      "Total Inspections","Violation Points","Staff Adj.","Staff %",
      "Clean Adj.","Inspection Bonus","After Clean","Final KPI","Status",
    ];
    lines.push(header.join(","));
    sorted.forEach((r, idx) => {
      lines.push([
        idx + 1, r.name, r.teamMembers, r.trucks, r.cleanInspections,
        r.totalInspections, r.kpi.violPoint, r.kpi.staffDelta, fmtPct(r.kpi.staffPercent),
        r.kpi.cleanDelta, r.kpi.inspectionDelta, r.kpi.afterClean, r.kpi.finalKpi, r.kpi.status,
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ALGO-ZeroViolations-${period.view}-${periodLabel.replace(/ /g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("CSV downloaded ✅");
  }

  function handlePrint() {
    if (!reportSummary) {
      setToast("No report data available for this period.");
      return;
    }
    window.print();
  }

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>📄</span>
          <h1>Reports</h1>
        </div>
        <div className="page-header-right" style={{ gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={loading || sorted.length === 0}>
            ⬇ Download CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrint} disabled={loading}>
            🖨 Print / PDF
          </button>
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)} disabled={loading}>
              + Add Block
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        <PeriodSelector period={period} onChange={handlePeriodChange} disabled={loading} />

        {/* Report header */}
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>ALGO GROUP — Zero Violations Report</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                Period: <strong>{periodLabel}</strong> · View: <strong style={{ textTransform: "capitalize" }}>{period.view}</strong>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-light)" }}>
              Generated: {now.toLocaleDateString()} {now.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Summary stat cards */}
        {!loading && reportSummary && (
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card accent-green">
              <div className="stat-label">🏆 Winner</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{reportSummary.winner.name}</div>
              <div className="stat-sub">KPI: {reportSummary.winner.kpi.finalKpi.toFixed(2)}</div>
            </div>
            <div className="stat-card accent-red">
              <div className="stat-label">⚠️ Needs Improvement</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{reportSummary.needsImprovement.name}</div>
              <div className="stat-sub">KPI: {reportSummary.needsImprovement.kpi.finalKpi.toFixed(2)}</div>
            </div>
            <div className="stat-card accent-blue">
              <div className="stat-label">Average KPI</div>
              <div className="stat-value">{reportSummary.avgKpi.toFixed(2)}</div>
            </div>
            <div className="stat-card accent-amber">
              <div className="stat-label">Active Blocks</div>
              <div className="stat-value">{reportSummary.activeBlocks}</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Full Block Report — {periodLabel}</h2>
          </div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading report data…</p></div>
            ) : sorted.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <h3>No report data available for this period.</h3>
                <p>Select a different period or ask admin to publish data.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Block</th>
                      <th className="num">Team</th>
                      <th className="num">Trucks</th>
                      <th className="num">Clean Ins.</th>
                      <th className="num">Total Ins.</th>
                      <th className="num">Viol. Points</th>
                      <th className="num">Staff Adj.</th>
                      <th className="num">Staff %</th>
                      <th className="num">Discounts</th>
                      <th className="num">After Clean</th>
                      <th className="num">Final KPI</th>
                      <th>Status</th>
                      {isAdmin && <th style={{ width: 56, textAlign: "right" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, idx) => {
                      const def = blockById.get(String(r.id));
                      return (
                        <tr
                          key={r.id}
                          className={`table-row-animated${idx === 0 && rankedCount > 0 ? " rank-1" : idx === rankedCount - 1 && rankedCount > 1 ? " rank-worst" : ""}`}
                        >
                          <td>
                            <span className={`rank-num${r.kpi.noData ? "" : idx === 0 ? " gold" : idx === 1 ? " silver" : idx === 2 ? " bronze" : ""}`}>
                              {r.kpi.noData ? "—" : idx + 1}
                            </span>
                          </td>
                          <td>
                            <strong>{r.name}</strong>
                            {def?.status === "inactive" && <span className="badge badge-inactive" style={{ marginLeft: 8 }}>Inactive</span>}
                          </td>
                          <td className="num">{r.teamMembers || "—"}</td>
                          <td className="num">{r.trucks || "—"}</td>
                          <td className="num">{r.cleanInspections || "—"}</td>
                          <td className="num">{r.totalInspections || "—"}</td>
                          <td className="num">{r.kpi.violPoint.toFixed(2)}</td>
                          <td className="num">
                            <span style={{ color: r.kpi.staffDelta < 0 ? "#16a34a" : r.kpi.staffDelta > 0 ? "#dc2626" : "inherit", fontWeight: r.kpi.staffDelta !== 0 ? 700 : 400 }}>
                              {r.kpi.staffDelta !== 0 ? (r.kpi.staffDelta > 0 ? "+" : "") + r.kpi.staffDelta.toFixed(2) : "—"}
                            </span>
                          </td>
                          <td className="num">
                            <span style={{ color: r.kpi.staffPercent < 0 ? "#16a34a" : r.kpi.staffPercent > 0 ? "#dc2626" : "inherit", fontWeight: 700 }}>
                              {fmtPct(r.kpi.staffPercent)}
                            </span>
                          </td>
                          <td className="num">
                            {(r.kpi.cleanDelta + r.kpi.inspectionDelta) > 0
                            ? <span title={`Clean −${r.kpi.cleanDelta.toFixed(2)} · Inspections −${r.kpi.inspectionDelta.toFixed(2)}`} style={{ color: "#16a34a", fontWeight: 700 }}>−{(r.kpi.cleanDelta + r.kpi.inspectionDelta).toFixed(2)}</span>
                            : "—"}
                          </td>
                          <td className="num">{r.kpi.afterClean.toFixed(2)}</td>
                          <td className="num"><strong style={{ fontSize: 14 }}>{r.kpi.finalKpi.toFixed(2)}</strong></td>
                          <td><span className={BADGE_CLASS[r.kpi.status]}>{r.kpi.status}</span></td>
                          {isAdmin && (
                            <td style={{ textAlign: "right" }}>
                              {def && (
                                <BlockActionsMenu
                                  block={def}
                                  onEdit={openEditBlock}
                                  onRename={openRenameBlock}
                                  onDelete={openDeleteBlock}
                                  onActivate={activateBlock}
                                />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Deactivated blocks with no data this period are hidden from the table — list them so they can be restored. */}
        {isAdmin && !loading && (() => {
          const shown = new Set(rows.map((r) => String(r.id)));
          const hidden = blocks.filter((b) => b.status === "inactive" && !shown.has(b.id));
          if (hidden.length === 0) return null;
          return (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-header">
                <h2 className="card-title">Deactivated blocks</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Hidden from all pages</span>
              </div>
              <div className="card-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {hidden.map((b) => (
                  <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 6px 4px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <strong style={{ fontSize: 13 }}>{b.name}</strong>
                    <button className="btn btn-secondary btn-sm" onClick={() => activateBlock(b)}>Activate</button>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-light)", textAlign: "center" }}>
          ALGO GROUP · Zero Violations Dashboard · {periodLabel} · Lowest KPI = Best Performance
        </div>
      </div>

      {toast && (
        <div className="toast-wrapper">
          <div className="toast">{toast}</div>
        </div>
      )}

      {/* Add Block */}
      <AddBlockDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={async (name) => {
          setToast(`Block "${name}" added ✅`);
          await reloadAfterBlockChange();
        }}
      />

      {/* Edit Block */}
      <Dialog.Root open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
            <form onSubmit={handleEditBlock}>
              <div className="add-block-header">
                <Dialog.Title className="alox-title">Edit Block</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Close">
                    <X size={15} />
                  </button>
                </Dialog.Close>
              </div>
              <div className="add-block-body">
                {editError && <div className="add-block-error">{editError}</div>}
                <div className="add-block-field">
                  <label className="form-label">Block Name</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus required />
                </div>
                <div className="add-block-field">
                  <label className="form-label">Team Members</label>
                  <input inputMode="numeric" value={editTeam} onChange={(e) => setEditTeam(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                </div>
                <div className="add-block-field">
                  <label className="form-label">Truck Count</label>
                  <input inputMode="numeric" value={editTrucks} onChange={(e) => setEditTrucks(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
                </div>
                <div className="add-block-field" style={{ marginBottom: 0 }}>
                  <label className="form-label">Notes</label>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes…" rows={3} />
                </div>
              </div>
              <div className="add-block-footer">
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
                </Dialog.Close>
                <button type="submit" className="btn btn-primary btn-sm" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Rename Block */}
      <RenameBlockDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={async (name) => {
          setToast(`Block renamed to "${name}" ✅`);
          await reloadAfterBlockChange();
        }}
      />

      {/* Delete Block confirmation */}
      <Dialog.Root open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" style={{ width: 360 }} aria-describedby={undefined}>
            <div className="add-block-header">
              <Dialog.Title className="alox-title">Delete Block</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close">
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--text)", fontWeight: 600 }}>
                Are you sure you want to delete this block?
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                <strong>{deleteTarget?.name}</strong> will be marked <strong>Inactive</strong> instead of permanently removed —
                this keeps its KPI history intact for future reporting. You can reactivate it anytime from this same menu.
              </p>
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-danger btn-sm" onClick={confirmDeleteBlock} disabled={deleteSaving}>
                {deleteSaving ? "Deleting…" : "Confirm"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppShell>
  );
}
