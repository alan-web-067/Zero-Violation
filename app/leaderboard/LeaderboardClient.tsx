"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import PeriodSelector, { PeriodState } from "@/components/PeriodSelector";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import { applyKpiToRows, sortByKpi, rankedOnly, kpiReasons, RowWithKpi } from "@/lib/kpi";
import { loadPeriodRows } from "@/lib/useKpiData";
import { isFullAdmin } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

function RankBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 0)     return null;
  if (rank === 1)     return <span className="badge badge-winner">🏆 #1 Winner</span>;
  if (rank === total) return <span className="badge badge-worst">⚠️ Needs Work</span>;
  return null;
}

export default function LeaderboardClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted, setMounted] = useState(true);
  const [period,  setPeriod]  = useState<PeriodState>({
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    month: now.getMonth() + 1,
    view: "month",
  });
  const [sorted,  setSorted]  = useState<RowWithKpi[]>([]);
  const ranked = rankedOnly(sorted);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      const me   = await getMe();
      const role = me.user?.role;
      // RBAC FEATURE — Leaderboard is a KPI ranking view; HR/Accounting's
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
      const rows = await loadPeriodRows(p, admin);
      setSorted(sortByKpi(applyKpiToRows(rows)));
    } finally {
      setLoading(false);
    }
  }

  async function handlePeriodChange(next: PeriodState) {
    setPeriod(next);
    await loadData(next);
  }

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🏆</span>
          <h1>Leaderboard</h1>
        </div>
        <div className="page-header-right">
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
            Sorted by Final KPI · Lowest = Best
          </span>
        </div>
      </div>

      <div className="page-body">
        <PeriodSelector period={period} onChange={handlePeriodChange} disabled={loading} />

        {/* Winner highlight */}
        {!loading && ranked.length > 0 && (
          <div className="winner-banner">
            <div className="winner-trophy">🏆</div>
            <div className="winner-info">
              <h3>Block of the Period</h3>
              <div className="winner-name">{ranked[0].name}</div>
              <div className="winner-kpi">
                Final KPI: {ranked[0].kpi.finalKpi.toFixed(2)} ·{" "}
                <span className={BADGE_CLASS[ranked[0].kpi.status]}>{ranked[0].kpi.status}</span>
              </div>
              <div className="winner-kpi" style={{ opacity: 0.85, fontSize: 12 }}>{kpiReasons(ranked[0]).join(" · ")}</div>
            </div>
            {ranked.length > 1 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Needs Improvement
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#7f1d1d" }}>
                  {ranked[ranked.length - 1].name}
                </div>
                <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 2 }}>
                  KPI: {ranked[ranked.length - 1].kpi.finalKpi.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Block Rankings</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{sorted.length} blocks</span>
          </div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading data…</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Block</th>
                      <th className="num">Team</th>
                      <th className="num">Trucks</th>
                      <th className="num">Expected</th>
                      <th className="num">Staff Perf. %</th>
                      <th className="num">Workload %</th>
                      <th className="num">Clean Ins.</th>
                      <th className="num">Total Ins.</th>
                      <th className="num">Discounts</th>
                      <th className="num">Final KPI</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, idx) => (
                      <tr
                        key={r.id}
                        className={`table-row-animated${idx === 0 && ranked.length > 0 ? " rank-1" : idx === ranked.length - 1 && ranked.length > 1 ? " rank-worst" : ""}`}
                      >
                        <td>
                          <span className={`rank-num${r.kpi.noData ? "" : idx === 0 ? " gold" : idx === 1 ? " silver" : idx === 2 ? " bronze" : ""}`}>
                            {r.kpi.noData ? "—" : idx + 1}
                          </span>
                        </td>
                        <td><strong>{r.name}</strong></td>
                        {/* Team */}
                        <td className="num">{r.teamMembers || "—"}</td>
                        {/* Trucks checked */}
                        <td className="num">{r.trucks || "—"}</td>
                        {/* Expected trucks (team × 40) */}
                        <td className="num">{r.kpi.expectedTrucks || "—"}</td>
                        {/* Staff Performance % = (actual − expected) / expected × 100 */}
                        <td className="num">
                          {r.kpi.expectedTrucks ? (
                            <span style={{
                              color: r.kpi.diffPercent < 0 ? "#dc2626" : r.kpi.diffPercent > 0 ? "#16a34a" : "var(--text-muted)",
                              fontWeight: r.kpi.diffPercent !== 0 ? 700 : 400,
                            }}>
                              {r.kpi.diffPercent > 0 ? "+" : ""}{r.kpi.diffPercent.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                        {/* Workload adjustment: expected ÷ actual trucks − 1 (negative = checked more than target) */}
                        <td className="num">
                          {r.kpi.expectedTrucks ? (
                            <span style={{
                              color: r.kpi.staffPercent < 0 ? "#16a34a" : r.kpi.staffPercent > 0 ? "#dc2626" : "var(--text-muted)",
                              fontWeight: r.kpi.staffPercent !== 0 ? 700 : 400,
                            }}>
                              {r.kpi.staffPercent !== 0
                                ? `${r.kpi.staffPercent > 0 ? "+" : ""}${(r.kpi.staffPercent * 100).toFixed(1)}%`
                                : "0%"}
                            </span>
                          ) : "—"}
                        </td>
                        {/* Clean inspections */}
                        <td className="num">{r.cleanInspections || "—"}</td>
                        <td className="num">{r.totalInspections || "—"}</td>
                        {/* Clean-rate + inspection-volume discounts (hover for breakdown) */}
                        <td className="num">
                          {(r.kpi.cleanDelta + r.kpi.inspectionDelta) > 0
                            ? <span title={`Clean −${r.kpi.cleanDelta.toFixed(2)} · Inspections −${r.kpi.inspectionDelta.toFixed(2)}`} style={{ color: "#16a34a", fontWeight: 700 }}>−{(r.kpi.cleanDelta + r.kpi.inspectionDelta).toFixed(2)}</span>
                            : "—"}
                        </td>
                        <td className="num"><strong style={{ fontSize: 14 }}>{r.kpi.finalKpi.toFixed(2)}</strong></td>
                        <td><span className={BADGE_CLASS[r.kpi.status]}>{r.kpi.status}</span></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <RankBadge rank={r.kpi.noData ? 0 : idx + 1} total={ranked.length} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
