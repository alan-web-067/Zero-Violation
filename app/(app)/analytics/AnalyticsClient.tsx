"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import {
  applyKpiToRows, sortByKpi, rankedOnly, MONTHS,
  RowWithKpi,
} from "@/lib/kpi";
import { fetchBlockDefs, loadYearMonthRows, quarterFromMonths } from "@/lib/useKpiData";
import { isFullAdmin } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

const BLOCK_COLORS = [
  "#0B7A4B","#2563eb","#f59e0b","#ef4444","#8b5cf6","#0ea5e9","#ec4899","#14b8a6",
];

type MonthPoint  = { label: string; [block: string]: number | string };
type QuarterPoint = { label: string; [block: string]: number | string };

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Select.Item value={value} className="select-item">
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator className="select-item-indicator">
        <Check size={12} />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export default function AnalyticsClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted,      setMounted]      = useState(true);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [year,         setYear]         = useState(now.getFullYear());
  const [monthlyData,  setMonthlyData]  = useState<MonthPoint[]>([]);
  const [monthlyRanks, setMonthlyRanks] = useState<{ best?: { name: string; kpi: number }; worst?: { name: string; kpi: number } }[]>([]);
  const [quarterlyData,setQuarterlyData]= useState<QuarterPoint[]>([]);
  const [blockSnap,    setBlockSnap]    = useState<RowWithKpi[]>([]);
  const [blockNames,   setBlockNames]   = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState("");
  const [focusBlock,   setFocusBlock]   = useState<string | null>(null);

  const currentYear = now.getFullYear();

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
      // RBAC FEATURE — Analytics is built on KPI trends; HR/Accounting's job
      // has nothing to do with KPI, so send them to their own dashboard (the
      // nav link is hidden too — see components/AppShell.tsx — this is the
      // matching server-side-reachable guard for direct navigation).
      if (role === "hr" || role === "accounting") { router.replace("/dashboard"); return; }
      // PERMISSIONS FIX — super_admin gets the same draft-scope visibility as admin.
      const admin = isFullAdmin(role as Role);
      setIsAdmin(admin);
      // Shared, cached block list (also used by loadPeriodRows) — no extra request.
      fetchBlockDefs().then((defs) => setBlockNames(defs.filter((d) => d.status === "active").map((d) => d.name)));
      await loadAll(now.getFullYear(), admin);
    } catch {
      router.replace("/");
    }
  }

  async function loadAll(y: number, admin = isAdmin) {
    setLoading(true);
    setLoadError("");
    try {
      // One request for the whole year; quarters and the current month are built from it.
      const yearRows = await loadYearMonthRows(y, admin);
      const [monthly, quarterly, curRows] = await Promise.all([
        Promise.all(
          Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
            const rows = yearRows[m - 1];
            const withKpi = sortByKpi(applyKpiToRows(rows));
            const pt: MonthPoint = { label: MONTHS.find((x) => x.n === m)?.name?.slice(0, 3) ?? `M${m}` };
            withKpi.forEach((r) => { if (!r.kpi.noData) pt[r.name] = r.kpi.finalKpi; });
            // Best/worst use the same ranking (incl. tie-breakers) as the Leaderboard.
            const ranked = rankedOnly(withKpi);
            const pick = (r?: RowWithKpi) => (r ? { name: r.name, kpi: r.kpi.finalKpi } : undefined);
            return { pt, best: pick(ranked[0]), worst: ranked.length > 1 ? pick(ranked[ranked.length - 1]) : undefined };
          })
        ),
        Promise.all(
          Array.from({ length: 4 }, (_, i) => i + 1).map(async (q) => {
            const rows = await quarterFromMonths(yearRows, q);
            const withKpi = sortByKpi(applyKpiToRows(rows));
            const pt: QuarterPoint = { label: `Q${q}` };
            withKpi.forEach((r) => { if (!r.kpi.noData) pt[r.name] = r.kpi.finalKpi; });
            return pt;
          })
        ),
        Promise.resolve(yearRows[now.getMonth()]),
      ]);
      setMonthlyData(monthly.map((x) => x.pt));
      setMonthlyRanks(monthly.map(({ best, worst }) => ({ best, worst })));
      setQuarterlyData(quarterly);
      setBlockSnap(rankedOnly(sortByKpi(applyKpiToRows(curRows))));
    } catch {
      setLoadError("Could not load the charts for this year.");
    } finally {
      setLoading(false);
    }
  }

  async function handleYearChange(y: number) {
    setYear(y);
    await loadAll(y);
  }

  if (!mounted) return null;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>📈</span>
          <h1>Analytics</h1>
        </div>
        <div className="page-header-right">
          <Select.Root
            value={String(year)}
            onValueChange={(v) => handleYearChange(Number(v))}
            disabled={loading}
          >
            <Select.Trigger className="select-trigger">
              <Select.Value />
              <Select.Icon><ChevronDown size={13} /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-content" position="popper" sideOffset={4}>
                <Select.Viewport className="select-viewport">
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>

      <div className="page-body">
        {loadError && !loading && (
          <div className="card" style={{ marginBottom: 14, borderColor: "#fecaca" }}>
            <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, color: "#991b1b" }}>
              <span>⚠️ {loadError}</span>
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => loadAll(year)}>Retry</button>
            </div>
          </div>
        )}
        {loading && (
          <div className="empty-state" style={{ padding: 48 }}>
            <div className="empty-state-icon">⏳</div>
            <h3>Loading analytics…</h3>
            <p>Fetching all months for {year}</p>
          </div>
        )}

        {!loading && (
          <>
            {/* Block filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Filter Block:
              </span>
              <button
                className={`btn btn-sm ${focusBlock === null ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFocusBlock(null)}
              >
                All
              </button>
              {blockNames.map((name, idx) => (
                <button
                  key={name}
                  className={`btn btn-sm ${focusBlock === name ? "btn-primary" : "btn-secondary"}`}
                  style={focusBlock === name ? { background: BLOCK_COLORS[idx % BLOCK_COLORS.length], borderColor: BLOCK_COLORS[idx % BLOCK_COLORS.length] } : {}}
                  onClick={() => setFocusBlock(name === focusBlock ? null : name)}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Monthly trend */}
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-header">
                <h2 className="card-title">Monthly KPI Trend — {year}</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Lower = Better</span>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                      <ReferenceLine y={6} stroke="#0ea5e9" strokeDasharray="4 4" label={{ value: "Excellent", position: "right", fontSize: 10, fill: "#0ea5e9" }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                        formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), ""]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {blockNames
                        .filter((name) => focusBlock === null || focusBlock === name)
                        .map((name) => (
                          <Line
                            key={name}
                            type="monotone"
                            dataKey={name}
                            stroke={BLOCK_COLORS[blockNames.indexOf(name) % BLOCK_COLORS.length]}
                            dot={false}
                            strokeWidth={focusBlock === name ? 3 : 2}
                            connectNulls
                            opacity={focusBlock && focusBlock !== name ? 0.2 : 1}
                          />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Two charts */}
            <div className="two-col">
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Quarterly Comparison</h2>
                </div>
                <div className="card-body">
                  <div className="chart-container" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={quarterlyData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), ""]}
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {blockNames
                          .filter((name) => focusBlock === null || focusBlock === name)
                          .map((name) => (
                            <Bar
                              key={name}
                              dataKey={name}
                              fill={BLOCK_COLORS[blockNames.indexOf(name) % BLOCK_COLORS.length]}
                              opacity={focusBlock && focusBlock !== name ? 0.2 : 0.85}
                              radius={[3, 3, 0, 0]}
                            />
                          ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Block Comparison — {MONTHS[now.getMonth()].name} {year}</h2>
                </div>
                <div className="card-body">
                  <div className="chart-container" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={blockSnap.map((r) => ({ name: r.name.replace(" BLOCK", ""), kpi: r.kpi.finalKpi }))}
                        margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v: unknown) => [typeof v === "number" ? v.toFixed(2) : String(v ?? ""), "KPI"]}
                        />
                        <Bar dataKey="kpi" radius={[4, 4, 0, 0]}>
                          {blockSnap.map((r, idx) => (
                            <Cell key={r.name} fill={BLOCK_COLORS[idx % BLOCK_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Best/Worst table */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Best & Worst by Month — {year}</h2>
              </div>
              <div className="card-body no-pad">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>🥇 Best Block</th>
                        <th className="num">KPI</th>
                        <th>⚠️ Needs Work</th>
                        <th className="num">KPI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((pt, idx) => {
                        const { best, worst } = monthlyRanks[idx] ?? {};
                        return (
                          <tr key={idx}>
                            <td><strong>{pt.label}</strong></td>
                            <td>{best ? <span className="badge badge-winner">{best.name}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                            <td className="num">{best ? best.kpi.toFixed(2) : "—"}</td>
                            <td>{worst && worst !== best ? <span className="badge badge-worst">{worst.name}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                            <td className="num">{worst && worst !== best ? worst.kpi.toFixed(2) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
