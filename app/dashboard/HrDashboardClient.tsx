"use client";

// app/dashboard/HrDashboardClient.tsx
//
// RBAC FEATURE — dedicated HR dashboard. HR's job is the company's people
// counts, not KPI/violations/leaderboard rankings, so this view is built
// entirely from `row.teamMembers` (current vs. previous month) and never
// touches `lib/kpi.ts` math, `RowWithKpi`, or any existing dashboard
// calculation. Rendered in place of the regular DashboardClient when
// `me.user.role === "hr"` (see DashboardClient.tsx).
//
// Safe to remove: deleting this file and its branch in DashboardClient.tsx
// reverts HR users to the standard (KPI-based) dashboard.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import AppShell from "@/components/AppShell";
import MonthYearSelector, { MonthYear } from "@/components/MonthYearSelector";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import { Row, MONTHS } from "@/lib/kpi";
import { loadPeriodRows } from "@/lib/useKpiData";
import { changeDirection, formatChange, CHANGE_PILL_CLASS, CHANGE_COLOR } from "@/lib/changeFormat";

type UpcomingEvent = {
  id: number;
  title: string;
  event_date: string;
  event_type: string;
};

function daysUntilEvent(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function eventDaysLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}

function eventColor(days: number) {
  if (days === 0) return { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c", dot: "🔴" };
  if (days <= 2)  return { bg: "#fffbeb", border: "#fcd34d", text: "#b45309", dot: "🟡" };
  if (days <= 7)  return { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", dot: "🔵" };
  return { bg: "#f0fdf4", border: "#86efac", text: "#15803d", dot: "🟢" };
}

type TrendPoint = { label: string; total: number };
type BlockChange = { id: string; name: string; oldValue: number; newValue: number; delta: number };

function monthName(month: number): string {
  return MONTHS.find((x) => x.n === month)?.name ?? `Month ${month}`;
}

function previousMonth(my: MonthYear): MonthYear {
  return my.month <= 1 ? { year: my.year - 1, month: 12 } : { year: my.year, month: my.month - 1 };
}

export default function HrDashboardClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted, setMounted] = useState(true);
  const [period, setPeriod] = useState<MonthYear>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [current, setCurrent] = useState<Row[]>([]);
  const [previous, setPrevious] = useState<Row[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      await getMe();
      await Promise.all([load(period), loadTrend(period.year), loadUpcomingEvents()]);
    } catch {
      router.replace("/");
    }
  }

  async function loadUpcomingEvents() {
    try {
      const res = await apiClient("/api/events?upcoming=7");
      setUpcomingEvents(res.events || []);
    } catch { /* non-fatal */ }
  }

  function asMonthPeriod(my: MonthYear) {
    return { year: my.year, month: my.month, quarter: Math.ceil(my.month / 3), view: "month" as const };
  }

  async function load(my: MonthYear) {
    setLoading(true);
    try {
      const [cur, prev] = await Promise.all([
        loadPeriodRows(asMonthPeriod(my), false),
        loadPeriodRows(asMonthPeriod(previousMonth(my)), false),
      ]);
      setCurrent(cur);
      setPrevious(prev);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrend(year: number) {
    const points: TrendPoint[] = [];
    for (let m = 1; m <= 12; m++) {
      try {
        const rows = await loadPeriodRows({ year, month: m, quarter: Math.ceil(m / 3), view: "month" }, false);
        points.push({ label: monthName(m).slice(0, 3), total: rows.reduce((s, r) => s + (r.teamMembers || 0), 0) });
      } catch {
        points.push({ label: monthName(m).slice(0, 3), total: 0 });
      }
    }
    setTrend(points);
  }

  async function handlePeriodChange(next: MonthYear) {
    setPeriod(next);
    await load(next);
    if (next.year !== period.year) await loadTrend(next.year);
  }

  // Per-block "old → new (delta)" — the basis for every stat and card below.
  const blocks: BlockChange[] = useMemo(() => {
    return current
      .map((r) => {
        const prev = previous.find((p) => p.id === r.id);
        const oldValue = prev?.teamMembers ?? 0;
        const newValue = r.teamMembers || 0;
        return { id: r.id, name: r.name, oldValue, newValue, delta: newValue - oldValue };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [current, previous]);

  const totalEmployees = blocks.reduce((s, b) => s + b.newValue, 0);
  const added = blocks.reduce((s, b) => s + (b.delta > 0 ? b.delta : 0), 0);
  const removed = blocks.reduce((s, b) => s + (b.delta < 0 ? -b.delta : 0), 0);
  const netChange = added - removed;

  const growthSorted = [...blocks].sort((a, b) => b.delta - a.delta);
  const biggestIncrease = growthSorted.find((b) => b.delta > 0) ?? null;
  const biggestDecrease = [...growthSorted].reverse().find((b) => b.delta < 0) ?? null;

  function changePill(delta: number) {
    const dir = changeDirection(delta);
    const sign = delta > 0 ? "+" : delta < 0 ? "" : "";
    return <span className={CHANGE_PILL_CLASS[dir]}>{sign}{delta}</span>;
  }

  function trendMeta(dir: "up" | "down" | "flat") {
    if (dir === "up")   return { icon: "▲", label: "Increased" };
    if (dir === "down") return { icon: "▼", label: "Decreased" };
    return { icon: "▬", label: "No Change" };
  }

  // Scales each row's progress bar relative to the largest swing this period,
  // so "biggest mover" reads visually, not just numerically.
  const maxAbsDelta = Math.max(1, ...blocks.map((b) => Math.abs(b.delta)));

  function statSkeleton(width = 90) {
    return <span className="skeleton" style={{ display: "inline-block", width, height: 18, verticalAlign: "middle" }} />;
  }

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>👥</span>
          <h1>HR Dashboard</h1>
        </div>
        <div className="page-header-right">
          <span className="badge" style={{ background: "#e0e7ff", color: "#3730a3" }}>HR</span>
        </div>
      </div>

      <div className="page-body">
        <MonthYearSelector value={period} onChange={handlePeriodChange} disabled={loading} />

        {/* Upcoming Events notification panel */}
        {upcomingEvents.filter(e => !dismissedEventIds.has(e.id)).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              🔔 Upcoming Events This Week
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {upcomingEvents.filter(e => !dismissedEventIds.has(e.id)).map(ev => {
                const days = daysUntilEvent(ev.event_date);
                const c = eventColor(days);
                return (
                  <div key={ev.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 14px", borderRadius: 10,
                    background: c.bg, border: `1px solid ${c.border}`,
                  }}>
                    <span style={{ fontSize: 14 }}>{c.dot}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{ev.title}</span>
                    <span style={{ fontSize: 12, color: c.text, fontWeight: 700 }}>{eventDaysLabel(days)}</span>
                    <button
                      onClick={() => setDismissedEventIds(s => new Set([...s, ev.id]))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", lineHeight: 1 }}
                      aria-label="Dismiss"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Headline stats */}
        <div className="stat-grid">
          <div className="stat-card stat-card-animated accent-blue">
            <div className="stat-label">👥 Total Employees</div>
            <div className="stat-value">{loading ? statSkeleton() : totalEmployees}</div>
            <div className="stat-sub">Across {blocks.length} block{blocks.length === 1 ? "" : "s"} — {monthName(period.month)} {period.year}</div>
          </div>

          <div className="stat-card stat-card-animated accent-green">
            <div className="stat-label">📈 Added This Month</div>
            <div className="stat-value">{loading ? statSkeleton(60) : `+${added}`}</div>
            <div className="stat-sub">New hires across all blocks vs. {monthName(previousMonth(period).month)}</div>
          </div>

          <div className="stat-card stat-card-animated accent-red">
            <div className="stat-label">📉 Removed This Month</div>
            <div className="stat-value">{loading ? statSkeleton(60) : `-${removed}`}</div>
            <div className="stat-sub">Departures across all blocks vs. {monthName(previousMonth(period).month)}</div>
          </div>

          <div className={`stat-card stat-card-animated ${netChange > 0 ? "accent-green" : netChange < 0 ? "accent-red" : "accent-blue"}`}>
            <div className="stat-label">⚖️ Net Employee Change</div>
            <div className="stat-value">
              {loading ? statSkeleton(60) : `${netChange > 0 ? "+" : ""}${netChange}`}
            </div>
            <div className="stat-sub">Added minus removed, company-wide</div>
          </div>
        </div>

        {/* Employees per block — comparison cards */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <h2 className="card-title">🏢 Employees Per Block — {monthName(period.month)} {period.year}</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              {monthName(previousMonth(period).month)} → {monthName(period.month)}
            </span>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : blocks.length === 0 ? (
              <div className="empty-state"><p>No block data for this period yet.</p></div>
            ) : (
              <div className="change-row-list">
                {blocks.map((b) => {
                  const dir = changeDirection(b.delta);
                  const meta = trendMeta(dir);
                  const barPct = Math.max(6, Math.round((Math.abs(b.delta) / maxAbsDelta) * 100));
                  return (
                    <div key={b.id} className={`change-row change-row-${dir}`}>
                      <div className="change-row-top">
                        <div className="change-row-name">{b.name}</div>
                        <span className={`trend-badge trend-${dir}`}>{meta.icon} {meta.label}</span>
                      </div>
                      <div className="change-row-months">
                        <span>{monthName(previousMonth(period).month)}: <strong>{b.oldValue}</strong> Employees</span>
                        <span className="change-row-arrow">→</span>
                        <span>{monthName(period.month)}: <strong>{b.newValue}</strong> Employees</span>
                      </div>
                      <div className="change-row-summary">
                        Change: {changePill(b.delta)}
                        <span className="change-row-format">{formatChange(b.oldValue, b.newValue)}</span>
                      </div>
                      <div className="change-row-bar-track">
                        <div className="change-row-bar-fill" style={{ width: `${barPct}%`, background: CHANGE_COLOR[dir] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* HR Analytics */}
        <div className="two-col" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📊 Monthly Employee Trend — {period.year}</h2>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="empty-state"><p>Loading…</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trend} margin={{ top: 6, right: 16, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" name="Total employees" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🌱 Employee Growth by Block</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>vs. {monthName(previousMonth(period).month)}</span>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="empty-state"><p>Loading…</p></div>
              ) : blocks.length === 0 ? (
                <div className="empty-state"><p>No block data for this period yet.</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={blocks} margin={{ top: 6, right: 16, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="delta" name="Change" radius={[4, 4, 0, 0]}>
                      {blocks.map((b) => (
                        <Cell key={b.id} fill={CHANGE_COLOR[changeDirection(b.delta)]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="two-col" style={{ marginTop: 14 }}>
          <div className="card change-highlight-card change-highlight-up">
            <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div className="change-highlight-icon">🚀</div>
              <div>
                <div className="change-highlight-title">Biggest Increase</div>
                {biggestIncrease ? (
                  <>
                    <div className="change-highlight-name">{biggestIncrease.name}</div>
                    <div className="change-highlight-value">{formatChange(biggestIncrease.oldValue, biggestIncrease.newValue)}</div>
                  </>
                ) : (
                  <div className="change-highlight-value">No increases this month</div>
                )}
              </div>
            </div>
          </div>

          <div className="card change-highlight-card change-highlight-down">
            <div className="card-body" style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div className="change-highlight-icon">📉</div>
              <div>
                <div className="change-highlight-title">Biggest Decrease</div>
                {biggestDecrease ? (
                  <>
                    <div className="change-highlight-name">{biggestDecrease.name}</div>
                    <div className="change-highlight-value">{formatChange(biggestDecrease.oldValue, biggestDecrease.newValue)}</div>
                  </>
                ) : (
                  <div className="change-highlight-value">No decreases this month</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
