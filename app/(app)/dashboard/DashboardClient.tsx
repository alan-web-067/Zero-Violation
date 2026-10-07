"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import DraftBadge from "@/components/DraftBadge";
import dynamic from "next/dynamic";
// HR / Accounting roles are turned off — load their dashboards only if ever needed.
const HrDashboardClient = dynamic(() => import("./HrDashboardClient"), { ssr: false });
const AccountingDashboardClient = dynamic(() => import("./AccountingDashboardClient"), { ssr: false });
import PeriodSelector, { PeriodState } from "@/components/PeriodSelector";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import {
  applyKpiToRows, sortByKpi, rankedOnly, kpiReasons, MONTHS, RowWithKpi,
} from "@/lib/kpi";
import { loadPeriodRows, loadPeriodRowsWithStatus, loadYearMonthRows } from "@/lib/useKpiData";
import { isFullAdmin } from "@/lib/permissions";
import type { Role } from "@/lib/auth";
import { askAlox } from "@/components/AloxChat";

type TrendPoint = { label: string; [block: string]: string | number };

// =====================================================================
// PHASE 1 FEATURES — feature flags
//
// Each flag below gates one self-contained Phase 1 enhancement. Flipping
// any flag to `false` instantly restores the dashboard's pre-Phase-1
// behavior for that feature — its UI disappears and its computations are
// skipped, with no effect on the existing widgets, KPI math, or layout.
// =====================================================================
const ENABLE_ALOX_SUMMARY     = true; // PHASE1 FEATURE — "Alox Insights" executive-summary card
const ENABLE_KPI_DELTAS       = true; // PHASE1 FEATURE — ▲▼ chips comparing stat cards to the previous period
const ENABLE_MOST_IMPROVED    = true; // PHASE1 FEATURE — "🚀 Most Improved" highlight card
const ENABLE_STREAK_BADGES    = true; // PHASE1 FEATURE — "🔥/🏆 N Months Perfect/Excellent" badges
const ENABLE_ASK_ALOX         = true; // PHASE1 FEATURE — "Ask Alox" quick-link buttons on Top Blocks
const ENABLE_SKELETON_LOADERS = true; // PHASE1 FEATURE — shimmer skeletons instead of "—" placeholders
const ENABLE_TARGET_KPI_LINE  = true; // PHASE1 FEATURE — configurable reference line on the KPI Trend chart
const TARGET_KPI = 6.0;               // PHASE1 FEATURE — target KPI shown by the reference line above

const STATUS_COLOR: Record<string, string> = {
  Perfect:   "#16a34a",
  Excellent: "#0ea5e9",
  Good:      "#f59e0b",
  Poor:      "#ef4444",
  "No data": "#94a3b8",
};

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

const BLOCK_COLORS = [
  "#0B7A4B","#2563eb","#f59e0b","#ef4444","#8b5cf6","#0ea5e9","#ec4899","#14b8a6",
];

// PHASE1 FEATURE — pure helper that derives "the period right before this
// one", used only by comparison widgets (delta chips, Most Improved, Alox
// Insights). It never touches the selected `period` state or KPI math —
// it just describes which extra period to fetch for comparison.
function getPreviousPeriod(p: PeriodState): PeriodState {
  if (p.view === "quarter") {
    if (p.quarter <= 1) return { year: p.year - 1, quarter: 4, month: 12, view: "quarter" };
    return { year: p.year, quarter: p.quarter - 1, month: (p.quarter - 1) * 3, view: "quarter" };
  }
  if (p.month <= 1) return { year: p.year - 1, quarter: 4, month: 12, view: "month" };
  const month = p.month - 1;
  return { year: p.year, quarter: Math.floor((month - 1) / 3) + 1, month, view: "month" };
}

export default function DashboardClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted,  setMounted]  = useState(true);
  const [isAdmin,  setIsAdmin]  = useState(false);
  // RBAC FEATURE — HR/Accounting get their own dedicated dashboards (people-
  // count / fleet-count stats only, no KPI/violations/leaderboard). `role`
  // gates an early-return below; nothing else on this page is affected.
  const [role,     setRole]     = useState<string | null>(null);
  const [period,   setPeriod]   = useState<PeriodState>({
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
    month: now.getMonth() + 1,
    view: "month",
  });
  const [sorted,    setSorted]    = useState<RowWithKpi[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState("");
  const [unpublished, setUnpublished] = useState(false);

  // PHASE1 FEATURE — previous-period rows, used only for comparison widgets
  // (delta chips, Most Improved, Alox Insights). Empty array = no comparison
  // available yet; nothing else on the page reads or depends on this state.
  const [prevSorted, setPrevSorted] = useState<RowWithKpi[]>([]);

  // PHASE1 FEATURE — per-block status across this year's months, keyed by
  // block name, indexed 0-11 (Jan-Dec). Built alongside the existing trend
  // fetch in loadTrend() so it costs no extra network requests. Used only
  // to derive streak badges.
  const [statusHistory, setStatusHistory] = useState<Record<string, (string | undefined)[]>>({});

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
      const r  = me.user?.role ?? null;
      setRole(r);
      // RBAC FEATURE — HR/Accounting render their own dashboard (see the
      // early-return in the JSX below) and never need this page's KPI/
      // trend/comparison data, so skip loading it entirely for them.
      if (r === "hr" || r === "accounting") return;

      // PERMISSIONS FIX — super_admin gets the same draft-scope visibility as admin.
      const admin = isFullAdmin(r as Role);
      setIsAdmin(admin);
      await Promise.all([
        loadData(period, admin),
        loadTrend(period.year, admin),
        loadPrevPeriod(period, admin),
      ]);
    } catch {
      router.replace("/");
    }
  }

  // PHASE1 FEATURE — loads the period immediately before the selected one,
  // purely for comparison widgets (delta chips, Most Improved, Alox Insights).
  // Skipped entirely (and state cleared) when none of those features are
  // enabled, so disabling all three also removes this extra fetch.
  async function loadPrevPeriod(p: PeriodState, admin = isAdmin) {
    if (!(ENABLE_KPI_DELTAS || ENABLE_MOST_IMPROVED || ENABLE_ALOX_SUMMARY)) {
      setPrevSorted([]);
      return;
    }
    try {
      const rows = await loadPeriodRows(getPreviousPeriod(p), admin);
      setPrevSorted(sortByKpi(applyKpiToRows(rows)));
    } catch {
      setPrevSorted([]);
    }
  }

  async function loadData(p: PeriodState, admin = isAdmin) {
    setLoading(true);
    try {
      const { rows, unpublished } = await loadPeriodRowsWithStatus(p, admin);
      setUnpublished(unpublished);
      setSorted(sortByKpi(applyKpiToRows(rows)));
    } finally {
      setLoading(false);
    }
  }

  async function handlePeriodChange(next: PeriodState) {
    setPeriod(next);
    const tasks: Promise<void>[] = [loadData(next), loadPrevPeriod(next)];
    if (next.year !== period.year) tasks.push(loadTrend(next.year));
    await Promise.all(tasks);
  }

  async function loadTrend(year: number, admin = isAdmin) {
    // One request for the whole year instead of 12–24.
    const yearRows = await loadYearMonthRows(year, admin).catch(() => null);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
        try {
          if (!yearRows) throw new Error("no data");
          const rows    = yearRows[m - 1];
          const withKpi = sortByKpi(applyKpiToRows(rows));
          const pt: TrendPoint = { label: MONTHS.find((x) => x.n === m)?.name?.slice(0, 3) ?? `M${m}` };
          const monthHistory: Record<string, string | undefined> = {};
          withKpi.forEach((r) => {
            if (!r.kpi.noData) pt[r.name] = r.kpi.finalKpi;
            if (ENABLE_STREAK_BADGES) monthHistory[r.name] = r.kpi.status;
          });
          return { pt, monthHistory, m };
        } catch {
          return { pt: { label: MONTHS.find((x) => x.n === m)?.name?.slice(0, 3) ?? `M${m}` } as TrendPoint, monthHistory: {} as Record<string, string | undefined>, m };
        }
      })
    );
    setTrendData(results.map((r) => r.pt));
    if (ENABLE_STREAK_BADGES) {
      const history: Record<string, (string | undefined)[]> = {};
      for (const { monthHistory, m } of results) {
        for (const [name, status] of Object.entries(monthHistory)) {
          if (!history[name]) history[name] = [];
          history[name][m - 1] = status;
        }
      }
      setStatusHistory(history);
    }
  }

  // Blocks with no data for the period can't win, lose, or move the average.
  const ranked      = rankedOnly(sorted);
  const winner      = ranked[0] ?? null;
  const worst       = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const activeBlocks = ranked.length;
  const avgKpi      = ranked.length > 0
    ? Math.round(ranked.reduce((s, r) => s + r.kpi.finalKpi, 0) / ranked.length * 100) / 100
    : 0;
  const top5 = ranked.slice(0, 5);

  // =====================================================================
  // PHASE1 FEATURE — derived comparison values (vs. previous period)
  //
  // Everything in this block is a pure derivation of `sorted` + `prevSorted`
  // (already-loaded data). None of it touches lib/kpi.ts, recomputes a KPI,
  // or changes how `sorted`/`winner`/`worst`/`avgKpi`/`activeBlocks` above
  // are produced — it only adds extra read-only context alongside them.
  // =====================================================================
  const prevRanked = rankedOnly(prevSorted);
  function findPrevRow(name: string) {
    return prevRanked.find((r) => r.name === name) ?? null;
  }
  const prevAvgKpi = prevRanked.length > 0
    ? Math.round(prevRanked.reduce((s, r) => s + r.kpi.finalKpi, 0) / prevRanked.length * 100) / 100
    : null;
  const prevActiveBlocks = prevSorted.length > 0 ? prevRanked.length : null;
  const prevWinnerRow = winner ? findPrevRow(winner.name) : null;

  // "Most Improved" = the block whose Final KPI dropped the most vs. the
  // previous period (lower KPI = better, so a positive `improvement` is good).
  const mostImproved = (() => {
    if (!ENABLE_MOST_IMPROVED || prevSorted.length === 0) return null;
    let best: { row: RowWithKpi; improvement: number } | null = null;
    for (const r of ranked) {
      const prev = findPrevRow(r.name);
      if (!prev) continue;
      const improvement = prev.kpi.finalKpi - r.kpi.finalKpi;
      if (improvement > 0.005 && (!best || improvement > best.improvement)) {
        best = { row: r, improvement };
      }
    }
    return best;
  })();

  // "🔥 N Months Perfect" / "🏆 N Months Excellent" badge for a block, derived
  // from this year's per-month status history (statusHistory, built alongside
  // the existing trend fetch — see loadTrend). Counts consecutive months,
  // ending at the selected month, that share the block's current status.
  // Only meaningful in month view, since the history is keyed by calendar month.
  // Rank change per block between the previous and the selected period (ranked blocks only).
  const movers = useMemo(() => {
    const prev = new Map(rankedOnly(prevSorted).map((r, i) => [r.id, i + 1]));
    const changes = rankedOnly(sorted)
      .map((r, i) => ({ id: r.id, name: r.name, from: prev.get(r.id) ?? 0, to: i + 1 }))
      .filter((m) => m.from > 0 && m.from !== m.to);
    return {
      up: changes.filter((m) => m.from > m.to).sort((a, b) => (b.from - b.to) - (a.from - a.to)).slice(0, 3),
      down: changes.filter((m) => m.from < m.to).sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, 3),
    };
  }, [sorted, prevSorted]);

  function streakBadge(name: string): { emoji: string; label: string } | null {
    if (!ENABLE_STREAK_BADGES || period.view !== "month") return null;
    const hist = statusHistory[name];
    if (!hist) return null;
    const current = hist[period.month - 1];
    if (current !== "Perfect" && current !== "Excellent") return null;
    let streak = 0;
    for (let i = period.month - 1; i >= 0; i--) {
      if (hist[i] === current) streak++;
      else break;
    }
    if (streak < 2) return null;
    return current === "Perfect"
      ? { emoji: "🔥", label: `${streak} Months Perfect` }
      : { emoji: "🏆", label: `${streak} Months Excellent` };
  }

  // Small ▲/▼ chip comparing a metric to the previous period. `lowerIsBetter`
  // decides which raw direction counts as an improvement — for KPI scores
  // lower is better, for Active Blocks more active is generally better — so
  // the arrow always shows the raw change while the color reflects whether
  // that change is good or bad for this particular metric.
  function kpiDeltaChip(
    current: number | null,
    previous: number | null,
    opts: { lowerIsBetter: boolean; suffix: string; decimals?: number }
  ) {
    if (!ENABLE_KPI_DELTAS || current === null || previous === null) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 0.005) return null;
    const improved = opts.lowerIsBetter ? diff < 0 : diff > 0;
    const arrow = diff < 0 ? "▼" : "▲";
    const decimals = opts.decimals ?? 2;
    return (
      <span className={`kpi-delta-chip${improved ? " kpi-delta-up" : " kpi-delta-down"}`}>
        {arrow} {Math.abs(diff).toFixed(decimals)} {opts.suffix} vs last period
      </span>
    );
  }

  // Locally generated "Alox Insights" bullets — purely derived from data
  // already loaded on this page (sorted/prevSorted/avgKpi/winner/worst).
  // No external AI calls, mirroring the existing rule-based local-answer
  // pattern in app/api/alox-chat/route.ts ("No external AI required").
  function buildAloxInsights(): string[] {
    if (!ENABLE_ALOX_SUMMARY || sorted.length === 0) return [];
    const bullets: string[] = [];

    if (prevAvgKpi !== null) {
      const diff = avgKpi - prevAvgKpi;
      if (Math.abs(diff) >= 0.01) {
        bullets.push(
          diff < 0
            ? `Average KPI improved by ${Math.abs(diff).toFixed(2)} from last period.`
            : `Average KPI rose by ${diff.toFixed(2)} from last period — worth a look.`
        );
      }
    }

    const perfectCount = sorted.filter((r) => r.kpi.status === "Perfect").length;
    if (perfectCount > 0) {
      bullets.push(`${perfectCount} block${perfectCount === 1 ? " is" : "s are"} currently Perfect.`);
    }

    if (winner) {
      bullets.push(
        prevRanked[0]?.name === winner.name
          ? `${winner.name} remains the top performer.`
          : `${winner.name} is the top performer this period.`
      );
    }

    if (worst && worst.name !== winner?.name) {
      bullets.push(`${worst.name} requires attention.`);
    }

    if (mostImproved) {
      bullets.push(`${mostImproved.row.name} improved the most since last period (▼ ${mostImproved.improvement.toFixed(2)} KPI).`);
    }

    return bullets.slice(0, 5);
  }
  const aloxInsights = buildAloxInsights();

  // PHASE1 FEATURE — opens Alox Chat with a pre-filled question about a
  // specific block via the small CustomEvent bridge exported from AloxChat
  // (askAlox / ALOX_ASK_QUESTION_EVENT), so this page doesn't need to manage
  // the chat dialog's open state itself.
  function askAloxAbout(blockName: string, isTopBlock: boolean) {
    if (!ENABLE_ASK_ALOX) return;
    askAlox(isTopBlock ? `Why is ${blockName} ranked #1?` : `Explain ${blockName} performance.`);
  }

  // PHASE1 FEATURE — shimmer placeholder shown while a stat is loading,
  // replacing the plain "—" dash. Reuses the existing `.skeleton` style
  // (already defined in globals.css for other loading states).
  function statSkeleton(width = 90, height = 18) {
    return <span className="skeleton" style={{ display: "inline-block", width, height, verticalAlign: "middle" }} />;
  }

  if (!mounted) return null;

  // RBAC FEATURE — HR/Accounting see a dedicated dashboard built only from
  // the data they control (people counts / fleet counts) — no KPI, no
  // violations, no leaderboard. See HrDashboardClient / AccountingDashboardClient.
  if (role === "hr") return <HrDashboardClient />;
  if (role === "accounting") return <AccountingDashboardClient />;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🏠</span>
          <h1>Dashboard</h1>
        </div>
        <div className="page-header-right" style={{ gap: 8 }}>
          <DraftBadge show={unpublished && !loading} />
          {isAdmin && (
            <span className="badge" style={{ background: "#dcfce7", color: "#065f46" }}>Admin</span>
          )}
        </div>
      </div>

      <div className="page-body">
        <PeriodSelector period={period} onChange={handlePeriodChange} disabled={loading} />

        {/* Team of the Month — hero, first thing on the page */}
        {winner && !loading && winner.kpi.finalKpi <= 6.0 && (
          <div className="winner-banner">
            <div className="winner-trophy">🏆</div>
            <div className="winner-info">
              <h3>{period.view === "quarter" ? "Team of the Quarter" : "Team of the Month"}</h3>
              <div className="winner-name">{winner.name}</div>
              <div className="winner-kpi">
                Final KPI: {winner.kpi.finalKpi.toFixed(2)} ·{" "}
                <span className={BADGE_CLASS[winner.kpi.status]}>{winner.kpi.status}</span>
                {(() => {
                  const streak = streakBadge(winner.name);
                  return streak ? <span className="badge badge-winner" style={{ marginLeft: 6 }}>{streak.emoji} {streak.label}</span> : null;
                })()}
              </div>
              <div className="winner-kpi" style={{ opacity: 0.85, fontSize: 12 }}>
                Why: {kpiReasons(winner).join(" · ")}
              </div>
            </div>
            {!unpublished && (
              <Link
                href={`/certificate?type=${period.view}&year=${period.year}&month=${period.month}&quarter=${period.quarter}`}
                className="btn btn-sm cert-btn"
                title="Open a printable certificate for the winner"
              >
                📜 Certificate
              </Link>
            )}
          </div>
        )}

        {/* PHASE1 FEATURE — Alox Insights (locally generated executive summary) */}
        {ENABLE_ALOX_SUMMARY && !loading && aloxInsights.length > 0 && (
          <div className="card alox-insights-card" style={{ marginBottom: 14 }}>
            <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Image
                src="/alox/alox-neutral.png"
                alt=""
                width={44}
                height={44}
                className="alox-insights-icon"
              />
              <div>
                <div className="alox-insights-title">Alox Insights</div>
                <ul className="alox-insights-list">
                  {aloxInsights.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="stat-grid">
          <div className="stat-card stat-card-animated accent-green">
            <div className="stat-label">🏆 Best Block</div>
            <div className="stat-value" style={{ fontSize: 18, marginTop: 4 }}>
              {loading ? (ENABLE_SKELETON_LOADERS ? statSkeleton(110) : "—") : winner?.name ?? "—"}
            </div>
            {winner && !loading && (
              <div className="stat-sub">
                KPI: <strong>{winner.kpi.finalKpi.toFixed(2)}</strong>
                <span className="badge badge-winner" style={{ marginLeft: 6 }}>Winner</span>
                {kpiDeltaChip(winner.kpi.finalKpi, prevWinnerRow?.kpi.finalKpi ?? null, { lowerIsBetter: true, suffix: "KPI" })}
              </div>
            )}
          </div>

          <div className="stat-card stat-card-animated accent-red">
            <div className="stat-label">⚠️ Needs Improvement</div>
            <div className="stat-value" style={{ fontSize: 18, marginTop: 4 }}>
              {loading ? (ENABLE_SKELETON_LOADERS ? statSkeleton(110) : "—") : worst?.name ?? "—"}
            </div>
            {worst && !loading && (
              <div className="stat-sub">
                KPI: <strong>{worst.kpi.finalKpi.toFixed(2)}</strong>
                {kpiDeltaChip(worst.kpi.finalKpi, findPrevRow(worst.name)?.kpi.finalKpi ?? null, { lowerIsBetter: true, suffix: "KPI" })}
              </div>
            )}
          </div>

          <div className="stat-card stat-card-animated accent-blue">
            <div className="stat-label">📊 Average KPI</div>
            <div className="stat-value">{loading ? (ENABLE_SKELETON_LOADERS ? statSkeleton(60, 28) : "—") : avgKpi.toFixed(2)}</div>
            <div className="stat-sub">
              Across all blocks
              {!loading && kpiDeltaChip(avgKpi, prevAvgKpi, { lowerIsBetter: true, suffix: "KPI" })}
            </div>
          </div>

          <div className="stat-card stat-card-animated accent-amber">
            <div className="stat-label">📦 Active Blocks</div>
            <div className="stat-value">{loading ? (ENABLE_SKELETON_LOADERS ? statSkeleton(40, 28) : "—") : activeBlocks}</div>
            <div className="stat-sub">
              of {sorted.length} total
              {!loading && kpiDeltaChip(activeBlocks, prevActiveBlocks, { lowerIsBetter: false, suffix: "blocks", decimals: 0 })}
            </div>
          </div>
        </div>

        {/* PHASE1 FEATURE — Most Improved highlight */}
        {ENABLE_MOST_IMPROVED && !loading && mostImproved && (
          <div className="card most-improved-card" style={{ marginBottom: 14 }}>
            <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="most-improved-icon" aria-hidden>🚀</div>
              <div>
                <div className="stat-label">Most Improved</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>
                  {mostImproved.row.name}
                </div>
                <div className="stat-sub">
                  KPI improved by <strong>{mostImproved.improvement.toFixed(2)}</strong> vs last period
                  {" "}({mostImproved.row.kpi.finalKpi.toFixed(2)} now)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 5 + Status Summary */}
        <div className="two-col" style={{ marginBottom: 14 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🥇 Top Blocks</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Lowest KPI = Best</span>
            </div>
            <div className="card-body">
              {loading ? (
                ENABLE_SKELETON_LOADERS ? (
                  /* PHASE1 FEATURE — shimmer rows instead of "Loading…" text */
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="skeleton" style={{ height: 38, width: "100%" }} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 24 }}><p>Loading…</p></div>
                )
              ) : (
                <div className="top-list">
                  {top5.map((r, idx) => {
                    const badge = streakBadge(r.name); // PHASE1 FEATURE
                    return (
                      <div className="top-item" key={r.id}>
                        <div className="top-item-rank">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                        </div>
                        <div className="top-item-name">
                          {r.name}
                          {badge && (
                            <span className="streak-badge" title={badge.label}>{badge.emoji} {badge.label}</span>
                          )}
                        </div>
                        <div className="top-item-bar">
                          <div
                            className="top-item-bar-fill"
                            style={{ width: `${(r.kpi.finalKpi / 10) * 100}%`, background: STATUS_COLOR[r.kpi.status] ?? "#6b7280" }}
                          />
                        </div>
                        <div className="top-item-kpi">{r.kpi.finalKpi.toFixed(2)}</div>
                        {ENABLE_ASK_ALOX && (
                          <button
                            type="button"
                            className="ask-alox-btn"
                            onClick={() => askAloxAbout(r.name, idx === 0)}
                            title={`Ask Alox about ${r.name}`}
                          >
                            🤖 Ask Alox
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📋 Status Summary</h2>
            </div>
            <div className="card-body">
              {loading ? (
                ENABLE_SKELETON_LOADERS ? (
                  /* PHASE1 FEATURE — shimmer rows instead of "Loading…" text */
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className="skeleton" style={{ height: 18, width: `${85 - i * 10}%` }} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 24 }}><p>Loading…</p></div>
                )
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(["Perfect", "Excellent", "Good", "Poor", "No data"] as const).map((s) => {
                    const count = sorted.filter((r) => r.kpi.status === s).length;
                    return (
                      <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={BADGE_CLASS[s]} style={{ width: 80, justifyContent: "center" }}>{s}</span>
                        <div style={{ flex: 1, height: 8, background: "var(--gray-100)", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${sorted.length ? (count / sorted.length) * 100 : 0}%`,
                            background: STATUS_COLOR[s],
                            borderRadius: 99,
                            transition: "width 400ms ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, width: 20, textAlign: "right" }}>{count}</span>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>All Blocks</div>
                    {sorted.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</span>
                        <span className={BADGE_CLASS[r.kpi.status]}>{r.kpi.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Biggest movers — rank change vs the previous period */}
        {!loading && movers.up.length + movers.down.length > 0 && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h2 className="card-title">🚀 Biggest Movers</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                Rank change vs {period.view === "quarter" ? "last quarter" : "last month"}
              </span>
            </div>
            <div className="card-body movers">
              <div>
                <div className="movers-head up">▲ Climbed</div>
                {movers.up.length ? movers.up.map((m) => (
                  <Link key={m.id} href={`/blocks/${encodeURIComponent(m.id)}`} className="mover-row">
                    <span className="mover-name">{m.name}</span>
                    <span className="mover-ranks">#{m.from} → #{m.to}</span>
                    <span className="mover-delta up">▲ {m.from - m.to}</span>
                  </Link>
                )) : <div className="mover-empty">No block moved up.</div>}
              </div>
              <div>
                <div className="movers-head down">▼ Dropped</div>
                {movers.down.length ? movers.down.map((m) => (
                  <Link key={m.id} href={`/blocks/${encodeURIComponent(m.id)}`} className="mover-row">
                    <span className="mover-name">{m.name}</span>
                    <span className="mover-ranks">#{m.from} → #{m.to}</span>
                    <span className="mover-delta down">▼ {m.to - m.from}</span>
                  </Link>
                )) : <div className="mover-empty">No block moved down.</div>}
              </div>
            </div>
          </div>
        )}

        {/* KPI Trend */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📈 KPI Trend — {period.year}</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>All months · Lower is better</span>
          </div>
          <div className="card-body">
            {trendData.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3>No trend data yet</h3>
                <p>Data will appear as months are published.</p>
              </div>
            ) : (
              <div className="chart-container" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                      formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {ENABLE_TARGET_KPI_LINE && (
                      /* PHASE1 FEATURE — configurable target KPI reference line (see TARGET_KPI) */
                      <ReferenceLine
                        y={TARGET_KPI}
                        stroke="#f59e0b"
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                        label={{ value: `Target ${TARGET_KPI.toFixed(1)}`, position: "right", fill: "#f59e0b", fontSize: 11, fontWeight: 700 }}
                      />
                    )}
                    {sorted.map((r, idx) => (
                      <Line
                        key={r.name}
                        type="monotone"
                        dataKey={r.name}
                        stroke={BLOCK_COLORS[idx % BLOCK_COLORS.length]}
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast-wrapper">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  );
}
