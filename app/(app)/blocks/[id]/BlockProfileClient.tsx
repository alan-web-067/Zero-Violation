"use client";

// Block profile — one block's whole year: rank and Final KPI per month, best
// month, #1 finishes, and an optional second block drawn on the same chart.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AUTH_TOKEN_KEY, getMe } from "@/lib/apiClient";
import { applyKpiToRows, sortByKpi, rankedOnly, MONTHS, Row, RowWithKpi, BlockDef } from "@/lib/kpi";
import { fetchBlockDefs, loadYearMonthRows } from "@/lib/useKpiData";
import { isFullAdmin } from "@/lib/permissions";
import { rankYear, blockBadges } from "@/lib/awards";
import type { Role } from "@/lib/auth";

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

type MonthResult = {
  month: number;
  row: RowWithKpi | null;
  rank: number | null;   // null = not ranked (no data)
  of: number;            // how many blocks were ranked that month
};

type Row2D = Row[][];

function monthResults(year: Row2D, blockId: string): MonthResult[] {
  return year.map((rows, i) => {
    const sorted = sortByKpi(applyKpiToRows(rows));
    const ranked = rankedOnly(sorted);
    const row = sorted.find((r) => r.id === blockId) ?? null;
    const idx = ranked.findIndex((r) => r.id === blockId);
    return { month: i + 1, row, rank: idx >= 0 ? idx + 1 : null, of: ranked.length };
  });
}

export default function BlockProfileClient() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const thisYear = useMemo(() => new Date().getFullYear(), []);

  const [year, setYear] = useState(thisYear);
  const [months, setMonths] = useState<Row2D | null>(null);
  const [defs, setDefs] = useState<BlockDef[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [compareId, setCompareId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) { router.replace("/"); return; }
    getMe()
      .then((me) => {
        const role = me.user?.role;
        if (role === "hr" || role === "accounting") { router.replace("/dashboard"); return; }
        setIsAdmin(isFullAdmin(role as Role));
      })
      .catch(() => router.replace("/"));
    fetchBlockDefs().then(setDefs);
  }, [router]);

  useEffect(() => {
    if (isAdmin === null) return;
    let alive = true;
    setMonths(null);
    setError("");
    loadYearMonthRows(year, isAdmin)
      .then((m) => { if (alive) setMonths(m); })
      .catch(() => { if (alive) setError("Could not load results. Please try again."); });
    return () => { alive = false; };
  }, [year, isAdmin]);

  const block = defs.find((d) => d.id === id);
  const results = useMemo(() => (months ? monthResults(months, id) : []), [months, id]);
  const compare = useMemo(() => (months && compareId ? monthResults(months, compareId) : []), [months, compareId]);
  const compareName = defs.find((d) => d.id === compareId)?.name ?? "";
  const badges = useMemo(() => (months ? blockBadges(rankYear(months), id) : []), [months, id]);

  // Only months that already happened (or have data) count toward the summary.
  const withData = results.filter((r) => r.row && !r.row.kpi.noData);
  const avgKpi = withData.length
    ? withData.reduce((s, r) => s + r.row!.kpi.finalKpi, 0) / withData.length
    : null;
  const best = withData.reduce<MonthResult | null>(
    (b, r) => (!b || r.row!.kpi.finalKpi < b.row!.kpi.finalKpi ? r : b), null);
  const wins = withData.filter((r) => r.rank === 1).length;
  const avgRank = withData.length
    ? withData.reduce((s, r) => s + (r.rank ?? 0), 0) / withData.length
    : null;

  const goal = block?.targetKpi ?? null;
  const onTarget = goal === null ? 0 : withData.filter((r) => r.row!.kpi.finalKpi <= goal).length;

  const chartData = results.map((r, i) => ({
    label: MONTHS[i].name.slice(0, 3),
    [block?.name ?? "This block"]: r.row && !r.row.kpi.noData ? r.row.kpi.finalKpi : null,
    ...(compareId ? { [compareName]: compare[i]?.row && !compare[i].row!.kpi.noData ? compare[i].row!.kpi.finalKpi : null } : {}),
  }));

  const name = block?.name ?? (defs.length ? "Unknown block" : "…");
  const loading = months === null && !error;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/leaderboard" className="btn btn-ghost" style={{ padding: "4px 8px" }} aria-label="Back to leaderboard">
            <ChevronLeft size={16} />
          </Link>
          <h1>{name}</h1>
          {block?.status === "inactive" && <span className="badge badge-nodata">Deactivated</span>}
        </div>
        <div className="page-header-right" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setYear((y) => y - 1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 48, textAlign: "center" }}>{year}</strong>
          <button className="btn btn-ghost" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear} aria-label="Next year"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="page-body">
        {defs.length > 0 && !block && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-body">This block does not exist any more. <Link href="/leaderboard">Back to the leaderboard</Link></div>
          </div>
        )}
        {error && <div className="card" style={{ marginBottom: 14 }}><div className="card-body" style={{ color: "#dc2626" }}>{error}</div></div>}

        <div className="stat-grid">
          <div className="stat-card stat-card-animated accent-green">
            <div className="stat-label">🏆 Times #1</div>
            <div className="stat-value">{loading ? "—" : wins}</div>
            <div className="stat-sub">months won in {year}</div>
          </div>
          <div className="stat-card stat-card-animated accent-blue">
            <div className="stat-label">📊 Average Final KPI</div>
            <div className="stat-value">{loading || avgKpi === null ? "—" : avgKpi.toFixed(2)}</div>
            <div className="stat-sub">{withData.length} month{withData.length === 1 ? "" : "s"} with data</div>
          </div>
          <div className="stat-card stat-card-animated accent-amber">
            <div className="stat-label">⭐ Best month</div>
            <div className="stat-value" style={{ fontSize: 18, marginTop: 4 }}>{loading || !best ? "—" : MONTHS[best.month - 1].name}</div>
            <div className="stat-sub">{best ? `Final KPI ${best.row!.kpi.finalKpi.toFixed(2)} · rank #${best.rank}` : "No results yet"}</div>
          </div>
          <div className="stat-card stat-card-animated accent-red">
            <div className="stat-label">📍 Average rank</div>
            <div className="stat-value">{loading || avgRank === null ? "—" : `#${avgRank.toFixed(1)}`}</div>
            <div className="stat-sub">lower is better</div>
          </div>
        </div>

        {!loading && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h2 className="card-title">🎖️ Achievements {year}</h2>
              <Link href="/hall-of-fame" style={{ fontSize: 12, fontWeight: 600 }}>Hall of Fame →</Link>
            </div>
            <div className="card-body">
              {badges.length ? (
                <div className="badge-shelf">
                  {badges.map((b) => (
                    <div key={b.label} className="achievement" title={b.detail}>
                      <span className="achievement-icon">{b.icon}</span>
                      <span><strong>{b.label}</strong><small>{b.detail}</small></span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No achievements yet this year — finish #1, have a Perfect month or a 100% clean month to earn one.</div>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <h2 className="card-title">Final KPI by month</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              Compare with
              <select style={{ padding: "5px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface, #fff)", color: "var(--text)", fontWeight: 600 }} value={compareId} onChange={(e) => setCompareId(e.target.value)}>
                <option value="">— none —</option>
                {defs.filter((d) => d.id !== id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <div className="card-body">
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                  <Tooltip formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)} />
                  <Legend />
                  <Line type="monotone" dataKey={block?.name ?? "This block"} stroke="#059669" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                  {goal !== null && (
                    <ReferenceLine y={goal} stroke="#d4a017" strokeDasharray="6 4" label={{ value: `Goal ≤ ${goal}`, position: "insideTopRight", fill: "#a16207", fontSize: 11 }} />
                  )}
                  {compareId && <Line type="monotone" dataKey={compareName} stroke="#d4a017" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              Lower = better. Months with no data are skipped.
              {goal !== null && withData.length > 0 && (
                <> · <strong style={{ color: onTarget === withData.length ? "#047857" : "#a16207" }}>🎯 Goal ≤ {goal.toFixed(2)} reached in {onTarget} of {withData.length} months</strong></>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Month by month</h2></div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading data…</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="num">Rank</th>
                      <th className="num">Team</th>
                      <th className="num">Trucks</th>
                      <th className="num">Clean Ins.</th>
                      <th className="num">Total Ins.</th>
                      <th className="num">Violation pts</th>
                      <th className="num">Final KPI</th>
                      <th>Status</th>
                      {compareId && <th className="num">{compareName}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const k = r.row?.kpi;
                      const c = compare[i]?.row?.kpi;
                      const has = !!k && !k.noData;
                      return (
                        <tr key={r.month} className={r.rank === 1 ? "rank-1" : undefined}>
                          <td><strong>{MONTHS[i].name}</strong></td>
                          <td className="num">{r.rank ? `#${r.rank} of ${r.of}` : "—"}</td>
                          <td className="num">{has ? r.row!.teamMembers || "—" : "—"}</td>
                          <td className="num">{has ? r.row!.trucks || "—" : "—"}</td>
                          <td className="num">{has ? r.row!.cleanInspections || "—" : "—"}</td>
                          <td className="num">{has ? r.row!.totalInspections || "—" : "—"}</td>
                          <td className="num">{has ? r.row!.violationPoints : "—"}</td>
                          <td className="num"><strong>{has ? k!.finalKpi.toFixed(2) : "—"}</strong></td>
                          <td><span className={BADGE_CLASS[k?.status ?? "No data"]}>{k?.status ?? "No data"}</span></td>
                          {compareId && (
                            <td className="num">
                              {c && !c.noData ? (
                                <span style={{ color: has && c.finalKpi > k!.finalKpi ? "#16a34a" : has && c.finalKpi < k!.finalKpi ? "#dc2626" : undefined, fontWeight: 600 }}>
                                  {c.finalKpi.toFixed(2)}
                                </span>
                              ) : "—"}
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
      </div>
    </>
  );
}
