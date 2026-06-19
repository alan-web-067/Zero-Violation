"use client";

// app/dashboard/AccountingDashboardClient.tsx
// Accounting dashboard: fleet overview + financial summary (income / expenses / profit)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, Edit2, Check, X as XIcon, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import MonthYearSelector, { MonthYear } from "@/components/MonthYearSelector";
import { AUTH_TOKEN_KEY, apiClient } from "@/lib/apiClient";
import { Row, MONTHS } from "@/lib/kpi";
import { loadPeriodRows } from "@/lib/useKpiData";
import { changeDirection, formatChange, CHANGE_PILL_CLASS, CHANGE_COLOR } from "@/lib/changeFormat";

// ---- Types ----
type TrendPoint = { label: string; total: number };
type BlockChange = { id: string; name: string; oldValue: number; newValue: number; delta: number };

type BlockFinancial = {
  block_id: number;
  block_name: string;
  truck_income: number;
  income_notes: string | null;
  total_salary: number;
  total_bonus: number;
  total_deduction: number;
  total_expense: number;
  employee_count: number;
};
type EmployeePayroll = {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
  photo_url: string | null;
  salary: number;
  bonus: number;
  deduction: number;
  total_expense: number;
  payment_type: string | null;
  notes: string | null;
};
type FinancialTotals = {
  truck_income: number;
  total_expense: number;
  profit: number;
  employee_count: number;
};

// ---- Helpers ----
function monthName(month: number): string {
  return MONTHS.find((x) => x.n === month)?.name ?? `Month ${month}`;
}
function previousMonth(my: MonthYear): MonthYear {
  return my.month <= 1 ? { year: my.year - 1, month: 12 } : { year: my.year, month: my.month - 1 };
}
function fmt$(n: number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function profitColor(n: number): string {
  if (n > 0) return "#16a34a";
  if (n < 0) return "#dc2626";
  return "var(--text-muted)";
}

function MemberAvatar({ first, last, photo, size = 28 }: { first: string; last: string; photo: string | null; size?: number }) {
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  if (photo) return (
    <img src={photo} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }} />
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,#667eea,#764ba2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: Math.floor(size * 0.36), border: "1px solid var(--border)",
    }}>
      {initials}
    </div>
  );
}

export default function AccountingDashboardClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [mounted, setMounted] = useState(true);
  const [period, setPeriod] = useState<MonthYear>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [loading, setLoading] = useState(true);

  // Fleet data (existing truck counts from KPI)
  const [current, setCurrent] = useState<Row[]>([]);
  const [previous, setPrevious] = useState<Row[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  // Financial data
  const [financialBlocks, setFinancialBlocks] = useState<BlockFinancial[]>([]);
  const [financialTotals, setFinancialTotals] = useState<FinancialTotals>({ truck_income: 0, total_expense: 0, profit: 0, employee_count: 0 });
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const [expandedEmployees, setExpandedEmployees] = useState<EmployeePayroll[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState<number | "">("");

  // Inline income editing
  const [editingIncome, setEditingIncome] = useState<number | null>(null); // block_id being edited
  const [incomeInput, setIncomeInput] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");
  const [savingIncome, setSavingIncome] = useState(false);

  const [activeTab, setActiveTab] = useState<"financial" | "fleet">("financial");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      await apiClient("/api/me");
      await Promise.all([load(period), loadTrend(period.year), loadFinancial(period)]);
    } catch { router.replace("/"); }
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
    } finally { setLoading(false); }
  }

  async function loadTrend(year: number) {
    const points: TrendPoint[] = [];
    for (let m = 1; m <= 12; m++) {
      try {
        const rows = await loadPeriodRows({ year, month: m, quarter: Math.ceil(m / 3), view: "month" }, false);
        points.push({ label: monthName(m).slice(0, 3), total: rows.reduce((s, r) => s + (r.trucks || 0), 0) });
      } catch {
        points.push({ label: monthName(m).slice(0, 3), total: 0 });
      }
    }
    setTrend(points);
  }

  async function loadFinancial(my: MonthYear) {
    try {
      const res = await apiClient(`/api/accounting/summary?year=${my.year}&month=${my.month}`);
      setFinancialBlocks(res.blocks || []);
      setFinancialTotals(res.totals || { truck_income: 0, total_expense: 0, profit: 0, employee_count: 0 });
    } catch { /* non-fatal */ }
  }

  async function handlePeriodChange(next: MonthYear) {
    setPeriod(next);
    setExpandedBlock(null);
    await Promise.all([load(next), loadFinancial(next)]);
    if (next.year !== period.year) await loadTrend(next.year);
  }

  // Expand a block row → load employee detail
  async function toggleBlock(blockId: number) {
    if (expandedBlock === blockId) { setExpandedBlock(null); setExpandedEmployees([]); return; }
    setExpandedBlock(blockId);
    setEmployeeSearch("");
    try {
      const res = await apiClient(`/api/accounting/summary?year=${period.year}&month=${period.month}&block_id=${blockId}`);
      setExpandedEmployees(res.employees || []);
    } catch { setExpandedEmployees([]); }
  }

  // Save truck income for a block
  async function saveIncome(blockId: number) {
    setSavingIncome(true);
    try {
      await apiClient("/api/truck-income", {
        method: "POST",
        body: JSON.stringify({ block_id: blockId, year: period.year, month: period.month, amount: parseFloat(incomeInput) || 0, notes: incomeNotes || null }),
      });
      setEditingIncome(null);
      setToast("Income saved.");
      await loadFinancial(period);
    } catch { setToast("Failed to save income."); }
    finally { setSavingIncome(false); }
  }

  // Fleet: per-block change data
  const fleetBlocks: BlockChange[] = useMemo(() => current.map((r) => {
    const prev = previous.find((p) => p.id === r.id);
    return { id: r.id, name: r.name, oldValue: prev?.trucks ?? 0, newValue: r.trucks || 0, delta: (r.trucks || 0) - (prev?.trucks ?? 0) };
  }).sort((a, b) => a.name.localeCompare(b.name)), [current, previous]);

  const totalTrucks = fleetBlocks.reduce((s, b) => s + b.newValue, 0);

  const maxAbsDelta = Math.max(1, ...fleetBlocks.map(b => Math.abs(b.delta)));

  // Filtered financial blocks
  const visibleBlocks = useMemo(() => {
    if (blockFilter === "") return financialBlocks;
    return financialBlocks.filter(b => b.block_id === blockFilter);
  }, [financialBlocks, blockFilter]);

  // Filtered employees
  const visibleEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return expandedEmployees;
    return expandedEmployees.filter(e =>
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      e.employee_id.toLowerCase().includes(q)
    );
  }, [expandedEmployees, employeeSearch]);

  function statSkeleton(w = 90) {
    return <span className="skeleton" style={{ display: "inline-block", width: w, height: 18, verticalAlign: "middle" }} />;
  }
  function trendMeta(dir: "up" | "down" | "flat") {
    if (dir === "up")   return { icon: "▲", label: "Increased" };
    if (dir === "down") return { icon: "▼", label: "Decreased" };
    return { icon: "▬", label: "No Change" };
  }
  function changePill(delta: number) {
    const dir = changeDirection(delta);
    const sign = delta > 0 ? "+" : "";
    return <span className={CHANGE_PILL_CLASS[dir]}>{sign}{delta}</span>;
  }

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🚚</span>
          <h1>Accounting Dashboard</h1>
        </div>
        <div className="page-header-right">
          <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Accounting</span>
        </div>
      </div>

      <div className="page-body">
        <MonthYearSelector value={period} onChange={handlePeriodChange} disabled={loading} />

        {/* ── Summary Cards ── */}
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card stat-card-animated accent-blue">
            <div className="stat-label">🚚 Total Trucks</div>
            <div className="stat-value">{loading ? statSkeleton() : totalTrucks}</div>
            <div className="stat-sub">Fleet size — {monthName(period.month)} {period.year}</div>
          </div>
          <div className="stat-card stat-card-animated accent-green">
            <div className="stat-label">💰 Received From Trucks</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{loading ? statSkeleton() : fmt$(financialTotals.truck_income)}</div>
            <div className="stat-sub">Total income entered across all blocks</div>
          </div>
          <div className="stat-card stat-card-animated accent-red">
            <div className="stat-label">💸 Salary Expenses</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{loading ? statSkeleton() : fmt$(financialTotals.total_expense)}</div>
            <div className="stat-sub">{financialTotals.employee_count} employee{financialTotals.employee_count !== 1 ? "s" : ""} with payroll this period</div>
          </div>
          <div className={`stat-card stat-card-animated ${financialTotals.profit >= 0 ? "accent-green" : "accent-red"}`}>
            <div className="stat-label">⚖️ Net Profit / Remaining</div>
            <div className="stat-value" style={{ fontSize: 20, color: profitColor(financialTotals.profit) }}>
              {loading ? statSkeleton() : fmt$(financialTotals.profit)}
            </div>
            <div className="stat-sub">Income minus salary expenses</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
          {([
            { key: "financial", label: "💰 Financial Summary" },
            { key: "fleet",     label: "🚛 Fleet Overview" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 18px", fontSize: 13, fontWeight: 700,
                border: "none", background: "none", cursor: "pointer",
                color: activeTab === tab.key ? "var(--green-700)" : "var(--text-muted)",
                borderBottom: activeTab === tab.key ? "2px solid var(--green-700)" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════ FINANCIAL SUMMARY TAB ══════════════════════════ */}
        {activeTab === "financial" && (
          <>
            {/* Block filter */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <select
                className="cell-input"
                style={{ flex: "0 0 180px", direction: "ltr", textAlign: "left" }}
                value={blockFilter}
                onChange={e => setBlockFilter(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">All Blocks</option>
                {financialBlocks.map(b => <option key={b.block_id} value={b.block_id}>{b.block_name}</option>)}
              </select>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {visibleBlocks.length} block{visibleBlocks.length !== 1 ? "s" : ""}
                {" "}·{" "}
                Click a row to see employee payroll detail
              </span>
            </div>

            {/* Per-block financial table */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">📊 Financial Summary — {monthName(period.month)} {period.year}</h2>
              </div>
              <div className="card-body no-pad">
                {visibleBlocks.length === 0 ? (
                  <div className="empty-state"><p>No block data for this period.</p></div>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Block</th>
                          <th className="num">Employees</th>
                          <th className="num">Received from Trucks</th>
                          <th className="num">Salary Expenses</th>
                          <th className="num">Bonus</th>
                          <th className="num">Deductions</th>
                          <th className="num" style={{ fontWeight: 800 }}>Net Profit</th>
                          <th style={{ width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleBlocks.map(b => {
                          const profit = b.truck_income - b.total_expense;
                          const isExpanded = expandedBlock === b.block_id;
                          const isEditing = editingIncome === b.block_id;

                          return (
                            <>
                              <tr
                                key={b.block_id}
                                style={{ cursor: "pointer" }}
                                onClick={() => { if (!isEditing) toggleBlock(b.block_id); }}
                              >
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontWeight: 700 }}>{b.block_name}</span>
                                    {isExpanded ? <ChevronUp size={13} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={13} style={{ color: "var(--text-muted)" }} />}
                                  </div>
                                </td>
                                <td className="num">{b.employee_count || "—"}</td>

                                {/* Received from trucks — inline edit */}
                                <td className="num" onClick={e => e.stopPropagation()}>
                                  {isEditing ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <input
                                        type="number"
                                        className="cell-input"
                                        style={{ width: 110, textAlign: "right", direction: "ltr" }}
                                        value={incomeInput}
                                        placeholder="0.00"
                                        autoFocus
                                        onChange={e => setIncomeInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") saveIncome(b.block_id); if (e.key === "Escape") setEditingIncome(null); }}
                                      />
                                      <button className="btn btn-ghost btn-icon" style={{ color: "#16a34a" }}
                                        disabled={savingIncome} onClick={() => saveIncome(b.block_id)}>
                                        <Check size={13} />
                                      </button>
                                      <button className="btn btn-ghost btn-icon" style={{ color: "#ef4444" }}
                                        onClick={() => setEditingIncome(null)}>
                                        <XIcon size={13} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                      <span style={{ fontWeight: b.truck_income > 0 ? 700 : 400, color: b.truck_income > 0 ? "#15803d" : "var(--text-muted)" }}>
                                        {b.truck_income > 0 ? fmt$(b.truck_income) : "—"}
                                      </span>
                                      <button
                                        className="btn btn-ghost btn-icon"
                                        title="Enter income"
                                        style={{ opacity: 0.5, marginLeft: 2 }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingIncome(b.block_id);
                                          setIncomeInput(b.truck_income > 0 ? String(b.truck_income) : "");
                                          setIncomeNotes(b.income_notes ?? "");
                                        }}
                                      >
                                        <Edit2 size={11} />
                                      </button>
                                    </div>
                                  )}
                                </td>

                                <td className="num">{b.total_expense > 0 ? fmt$(b.total_expense) : "—"}</td>
                                <td className="num" style={{ color: "#16a34a" }}>{b.total_bonus > 0 ? fmt$(b.total_bonus) : "—"}</td>
                                <td className="num" style={{ color: "#ef4444" }}>{b.total_deduction > 0 ? fmt$(b.total_deduction) : "—"}</td>
                                <td className="num">
                                  <span style={{ fontWeight: 800, color: profitColor(profit) }}>
                                    {(b.truck_income > 0 || b.total_expense > 0) ? fmt$(profit) : "—"}
                                  </span>
                                </td>
                                <td />
                              </tr>

                              {/* Expanded employee payroll detail */}
                              {isExpanded && (
                                <tr key={`${b.block_id}-detail`} style={{ background: "var(--surface-alt, var(--bg-secondary, #f8f9fa))" }}>
                                  <td colSpan={8} style={{ padding: "12px 18px 18px" }}>
                                    <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{ fontWeight: 700, fontSize: 13 }}>👤 Employee Payroll — {b.block_name}</span>
                                      <div style={{ position: "relative", flex: "0 0 220px" }}>
                                        <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                        <input
                                          className="cell-input"
                                          style={{ width: "100%", paddingLeft: 26, fontSize: 12, direction: "ltr", textAlign: "left" }}
                                          placeholder="Filter by name or ID…"
                                          value={employeeSearch}
                                          onChange={e => setEmployeeSearch(e.target.value)}
                                          onClick={e => e.stopPropagation()}
                                        />
                                      </div>
                                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                        {visibleEmployees.length} employee{visibleEmployees.length !== 1 ? "s" : ""}
                                      </span>
                                    </div>
                                    {visibleEmployees.length === 0 ? (
                                      <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>
                                        {expandedEmployees.length === 0 ? "No employees with payroll this period." : "No employees match your search."}
                                      </div>
                                    ) : (
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", textAlign: "left" }}>
                                            <th style={{ padding: "4px 10px 6px 0", fontWeight: 600 }}>Employee</th>
                                            <th style={{ padding: "4px 10px 6px", fontWeight: 600, textAlign: "right" }}>Salary</th>
                                            <th style={{ padding: "4px 10px 6px", fontWeight: 600, textAlign: "right", color: "#16a34a" }}>Bonus</th>
                                            <th style={{ padding: "4px 10px 6px", fontWeight: 600, textAlign: "right", color: "#ef4444" }}>Deduction</th>
                                            <th style={{ padding: "4px 10px 6px", fontWeight: 700, textAlign: "right" }}>Total</th>
                                            <th style={{ padding: "4px 0 6px 10px", fontWeight: 600 }}>Type</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visibleEmployees.map(emp => (
                                            <tr key={emp.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                              <td style={{ padding: "6px 10px 6px 0" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                  <MemberAvatar first={emp.first_name} last={emp.last_name} photo={emp.photo_url} size={26} />
                                                  <div>
                                                    <div style={{ fontWeight: 600 }}>{emp.first_name} {emp.last_name}</div>
                                                    <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{emp.employee_id}</div>
                                                  </div>
                                                </div>
                                              </td>
                                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{emp.salary > 0 ? fmt$(emp.salary) : "—"}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#16a34a" }}>{emp.bonus > 0 ? fmt$(emp.bonus) : "—"}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#ef4444" }}>{emp.deduction > 0 ? fmt$(emp.deduction) : "—"}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>{emp.total_expense > 0 ? fmt$(emp.total_expense) : "—"}</td>
                                              <td style={{ padding: "6px 0 6px 10px", color: "var(--text-muted)" }}>{emp.payment_type ?? "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                                            <td style={{ padding: "8px 10px 4px 0" }}>Block Total</td>
                                            <td style={{ padding: "8px 10px 4px", textAlign: "right" }}>{fmt$(b.total_salary)}</td>
                                            <td style={{ padding: "8px 10px 4px", textAlign: "right", color: "#16a34a" }}>{fmt$(b.total_bonus)}</td>
                                            <td style={{ padding: "8px 10px 4px", textAlign: "right", color: "#ef4444" }}>{fmt$(b.total_deduction)}</td>
                                            <td style={{ padding: "8px 10px 4px", textAlign: "right" }}>{fmt$(b.total_expense)}</td>
                                            <td />
                                          </tr>
                                        </tfoot>
                                      </table>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}

                        {/* Grand Total row */}
                        {visibleBlocks.length > 0 && blockFilter === "" && (
                          <tr style={{ background: "var(--surface-alt, rgba(0,0,0,0.03))", fontWeight: 800, fontSize: 13 }}>
                            <td style={{ paddingLeft: 14 }}>🏁 Grand Total</td>
                            <td className="num">{financialTotals.employee_count || "—"}</td>
                            <td className="num" style={{ color: "#15803d" }}>{fmt$(financialTotals.truck_income)}</td>
                            <td className="num">{fmt$(financialTotals.total_expense)}</td>
                            <td className="num" />
                            <td className="num" />
                            <td className="num" style={{ color: profitColor(financialTotals.profit) }}>{fmt$(financialTotals.profit)}</td>
                            <td />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Income entry legend */}
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>✏️ Click the edit icon in <strong>Received from Trucks</strong> to enter income for a block.</span>
              <span>▼ Click any row to expand and see employee payroll detail.</span>
            </div>
          </>
        )}

        {/* ══════════════════════════ FLEET OVERVIEW TAB ══════════════════════════ */}
        {activeTab === "fleet" && (
          <>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🏢 Trucks Per Block — {monthName(period.month)} {period.year}</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                  {monthName(previousMonth(period).month)} → {monthName(period.month)}
                </span>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="empty-state"><p>Loading…</p></div>
                ) : fleetBlocks.length === 0 ? (
                  <div className="empty-state"><p>No block data for this period yet.</p></div>
                ) : (
                  <div className="change-row-list">
                    {fleetBlocks.map((b) => {
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
                            <span>{monthName(previousMonth(period).month)}: <strong>{b.oldValue}</strong> Trucks</span>
                            <span className="change-row-arrow">→</span>
                            <span>{monthName(period.month)}: <strong>{b.newValue}</strong> Trucks</span>
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

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-header">
                <h2 className="card-title">📊 Monthly Fleet Trend — {period.year}</h2>
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
                      <Line type="monotone" dataKey="total" name="Total trucks" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </AppShell>
  );
}
