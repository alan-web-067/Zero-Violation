"use client";

// app/members/MembersClient.tsx
// HR/ACCOUNTING MEMBERS FEATURE — shared employee registry with role-scoped views

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Search, X, ChevronDown, ChevronUp, Edit2, Trash2,
  DollarSign, FileCheck, Clock, CheckCircle, XCircle,
  UserPlus, Camera,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import { MONTHS } from "@/lib/kpi";

type Me = { id: number; username: string; role: string };
type Block = { id: number; name: string; sort_order: number };
type Member = {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  date_joined: string | null;
  employee_id: string;
  block_id: number | null;
  block_name: string | null;
  status: string;
  photo_url?: string | null;
  created_at: string;
};
type Payroll = {
  id: number;
  member_id: number;
  year: number;
  month: number;
  salary: number | null;
  payment_type: string | null;
  bonus: number;
  deduction: number;
  notes: string | null;
};
type Report = {
  id: number;
  year: number;
  month: number;
  status: "pending" | "approved" | "rejected";
  submitted_by: number;
  submitted_by_username: string;
  submitted_at: string;
  reviewed_by_username: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

function monthName(n: number) { return MONTHS.find(m => m.n === n)?.name ?? String(n); }
function fmtDate(d: string | null): string {
  if (!d) return "—";
  // Parse YYYY-MM-DD directly — avoid Date() UTC-to-local shift that rolls back one day
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return d;
}

function MemberAvatar({ member, size = 32 }: { member: Member; size?: number }) {
  const initials = `${member.first_name[0] ?? "?"}${member.last_name[0] ?? ""}`.toUpperCase();
  if (member.photo_url) {
    return (
      <img
        src={member.photo_url}
        alt={`${member.first_name} ${member.last_name}`}
        style={{
          width: size, height: size, borderRadius: "50%",
          objectFit: "cover", border: "2px solid var(--border)", flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, #667eea, #764ba2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: Math.floor(size * 0.36),
      border: "2px solid var(--border)",
    }}>
      {initials}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending:  "badge",
  approved: "badge badge-perfect",
  rejected: "badge badge-poor",
};
const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:  <Clock size={12} />,
  approved: <CheckCircle size={12} />,
  rejected: <XCircle size={12} />,
};

export default function MembersClient() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [mounted, setMounted] = useState(true);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterBlock, setFilterBlock] = useState<number | "">("");
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState<"members" | "reports">("members");

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Add/Edit Member dialog
  const [memberDialog, setMemberDialog] = useState<{
    open: boolean;
    editing: Member | null;
    firstName: string;
    lastName: string;
    dob: string;
    dateJoined: string;
    employeeId: string;
    blockId: string;
    photoFile: File | null;
    photoPreview: string | null;
    saving: boolean;
    error: string;
  }>({
    open: false, editing: null, firstName: "", lastName: "", dob: "",
    dateJoined: "", employeeId: "", blockId: "",
    photoFile: null, photoPreview: null, saving: false, error: "",
  });

  // Payroll dialog (Accounting)
  const [payrollDialog, setPayrollDialog] = useState<{
    open: boolean;
    member: Member | null;
    existing: Payroll | null;
    salary: string;
    paymentType: string;
    bonus: string;
    deduction: string;
    notes: string;
    saving: boolean;
    error: string;
  }>({
    open: false, member: null, existing: null, salary: "", paymentType: "",
    bonus: "0", deduction: "0", notes: "", saving: false, error: "",
  });

  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; reportId: number | null; note: string }>({
    open: false, reportId: null, note: "",
  });

  const isHR = me?.role === "hr";
  const isAccounting = me?.role === "accounting";
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";

  // ---- Toast ----
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Boot ----
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    try {
      const [meRes, blocksRes] = await Promise.all([
        getMe(),
        apiClient("/api/blocks"),
      ]);
      const role = meRes.user?.role;
      if (role !== "hr" && role !== "accounting" && role !== "admin" && role !== "super_admin") {
        router.replace("/dashboard"); return;
      }
      setMe({ id: meRes.user.id, username: meRes.user.username, role });
      setBlocks((blocksRes.blocks || []).sort((a: Block, b: Block) => a.sort_order - b.sort_order));
      await loadAll();
    } catch {
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }

  const loadAll = useCallback(async () => {
    const [membersRes, reportsRes] = await Promise.all([
      apiClient("/api/members").catch(() => ({ members: [] })),
      apiClient("/api/member-reports").catch(() => ({ reports: [] })),
    ]);
    setMembers(membersRes.members || []);
    setReports(reportsRes.reports || []);
  }, []);

  // ---- Filtered members ----
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        m.first_name.toLowerCase().includes(q) ||
        m.last_name.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q);
      const matchBlock = filterBlock === "" || m.block_id === filterBlock;
      return matchSearch && matchBlock;
    });
  }, [members, search, filterBlock]);

  const membersByBlock = useMemo(() => {
    const map: Record<number, Member[]> = {};
    for (const m of filteredMembers) {
      const bid = m.block_id ?? 0;
      if (!map[bid]) map[bid] = [];
      map[bid].push(m);
    }
    return map;
  }, [filteredMembers]);

  const currentReport = useMemo(
    () => reports.find(r => r.year === year && r.month === month) ?? null,
    [reports, year, month]
  );

  // ---- Photo upload helper ----
  async function uploadPhoto(memberId: number, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    await fetch(`/api/members/${memberId}/photo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  }

  // ---- Member form helpers ----
  function openAddMember(presetBlockId?: string) {
    setMemberDialog({
      open: true, editing: null, firstName: "", lastName: "", dob: "",
      dateJoined: "", employeeId: "", blockId: presetBlockId ?? "",
      photoFile: null, photoPreview: null, saving: false, error: "",
    });
  }
  function openEditMember(m: Member) {
    setMemberDialog({
      open: true, editing: m,
      firstName: m.first_name, lastName: m.last_name,
      dob: m.date_of_birth ?? "", dateJoined: m.date_joined ?? "",
      employeeId: m.employee_id, blockId: m.block_id ? String(m.block_id) : "",
      photoFile: null, photoPreview: m.photo_url ?? null,
      saving: false, error: "",
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMemberDialog(p => ({ ...p, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  }

  async function saveMember() {
    const d = memberDialog;
    if (!d.firstName.trim() || !d.lastName.trim() || !d.employeeId.trim()) {
      setMemberDialog(p => ({ ...p, error: "First name, last name, and Employee ID are required." }));
      return;
    }
    setMemberDialog(p => ({ ...p, saving: true, error: "" }));
    try {
      const body = {
        first_name: d.firstName.trim(), last_name: d.lastName.trim(),
        date_of_birth: d.dob || null, date_joined: d.dateJoined || null,
        employee_id: d.employeeId.trim(), block_id: d.blockId ? Number(d.blockId) : null,
      };
      let savedId: number;
      if (d.editing) {
        await apiClient(`/api/members/${d.editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        savedId = d.editing.id;
        setToast("Member updated.");
      } else {
        const res = await apiClient("/api/members", { method: "POST", body: JSON.stringify(body) });
        savedId = res.member?.id;
        setToast("Member added successfully.");
      }
      // Upload photo if a new file was selected
      if (d.photoFile && savedId) {
        try { await uploadPhoto(savedId, d.photoFile); } catch { /* photo upload failed, not fatal */ }
      }
      setMemberDialog(p => ({ ...p, open: false }));
      await loadAll();
    } catch (e: any) {
      setMemberDialog(p => ({ ...p, saving: false, error: e.message || "Failed to save member." }));
    }
  }

  async function deleteMember(m: Member) {
    if (!confirm(`Remove ${m.first_name} ${m.last_name}?`)) return;
    try {
      await apiClient(`/api/members/${m.id}`, { method: "DELETE" });
      setToast("Member removed.");
      await loadAll();
    } catch {
      setToast("Failed to remove member.");
    }
  }

  // ---- Payroll helpers (Accounting) ----
  async function openPayroll(m: Member) {
    try {
      const res = await apiClient(`/api/member-payroll?member_id=${m.id}&year=${year}&month=${month}`);
      const existing: Payroll | undefined = res.payroll?.[0];
      setPayrollDialog({
        open: true, member: m, existing: existing ?? null,
        salary: existing?.salary != null ? String(existing.salary) : "",
        paymentType: existing?.payment_type ?? "",
        bonus: existing?.bonus != null ? String(existing.bonus) : "0",
        deduction: existing?.deduction != null ? String(existing.deduction) : "0",
        notes: existing?.notes ?? "",
        saving: false, error: "",
      });
    } catch {
      setToast("Failed to load payroll data.");
    }
  }

  async function savePayroll() {
    const d = payrollDialog;
    setPayrollDialog(p => ({ ...p, saving: true, error: "" }));
    try {
      await apiClient("/api/member-payroll", {
        method: "POST",
        body: JSON.stringify({
          member_id: d.member!.id, year, month,
          salary: d.salary ? parseFloat(d.salary) : null,
          payment_type: d.paymentType || null,
          bonus: parseFloat(d.bonus) || 0,
          deduction: parseFloat(d.deduction) || 0,
          notes: d.notes || null,
        }),
      });
      setToast("Payroll saved.");
      setPayrollDialog(p => ({ ...p, open: false }));
    } catch (e: any) {
      setPayrollDialog(p => ({ ...p, saving: false, error: e.message || "Failed to save payroll." }));
    }
  }

  // ---- Monthly report ----
  async function submitMonthlyReport() {
    if (!confirm(`Submit monthly members report for ${monthName(month)} ${year} for approval?`)) return;
    try {
      await apiClient("/api/member-reports", {
        method: "POST", body: JSON.stringify({ year, month }),
      });
      setToast("Monthly report submitted for approval.");
      await loadAll();
    } catch (e: any) {
      setToast(e.message || "Failed to submit report.");
    }
  }

  async function approveReport(id: number) {
    try {
      await apiClient(`/api/member-reports/${id}/approve`, { method: "POST" });
      setToast("Report approved."); await loadAll();
    } catch (e: any) { setToast(e.message || "Failed to approve."); }
  }

  async function rejectReport() {
    if (!rejectDialog.reportId) return;
    try {
      await apiClient(`/api/member-reports/${rejectDialog.reportId}/reject`, {
        method: "POST", body: JSON.stringify({ note: rejectDialog.note }),
      });
      setToast("Report rejected.");
      setRejectDialog({ open: false, reportId: null, note: "" });
      await loadAll();
    } catch (e: any) { setToast(e.message || "Failed to reject."); }
  }

  if (!mounted) return null;

  // Accounting search results view
  const showAccountingSearch = isAccounting && search.trim().length > 0;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>👥</span>
          <h1>Members</h1>
        </div>
        <div className="page-header-right" style={{ gap: 8, display: "flex", alignItems: "center" }}>
          {isHR && <span className="badge" style={{ background: "#e0e7ff", color: "#3730a3" }}>HR</span>}
          {isAccounting && <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>Accounting</span>}
          {isAdmin && <span className="badge" style={{ background: "#dcfce7", color: "#065f46" }}>Admin</span>}
          {(isHR || isAdmin) && (
            <button className="btn btn-primary btn-sm" onClick={() => openAddMember()}>
              <UserPlus size={14} /> Add Member
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
          {[
            { key: "members", label: "👥 Members" },
            ...(isHR || isAdmin ? [{ key: "reports", label: "📋 Monthly Reports" }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "members" | "reports")}
              style={{
                padding: "8px 18px", fontSize: 13, fontWeight: 700, border: "none", background: "none",
                cursor: "pointer", color: activeTab === tab.key ? "var(--green-700)" : "var(--text-muted)",
                borderBottom: activeTab === tab.key ? "2px solid var(--green-700)" : "2px solid transparent",
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== MEMBERS TAB ===== */}
        {activeTab === "members" && (
          <>
            {/* Search + Filter + Period */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 220px" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  className="cell-input"
                  style={{ width: "100%", paddingLeft: 32 }}
                  placeholder="Search by name or Employee ID…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {!showAccountingSearch && (
                <select
                  className="cell-input"
                  style={{ flex: "0 0 160px" }}
                  value={filterBlock}
                  onChange={e => setFilterBlock(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">All Blocks</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {isAccounting && (
                <>
                  <select className="cell-input" style={{ flex: "0 0 110px" }} value={year} onChange={e => setYear(Number(e.target.value))}>
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <select className="cell-input" style={{ flex: "0 0 130px" }} value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {MONTHS.map(m => <option key={m.n} value={m.n}>{m.name}</option>)}
                  </select>
                </>
              )}
            </div>

            {/* Summary stats */}
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card stat-card-animated accent-blue">
                <div className="stat-label">👥 Total Members</div>
                <div className="stat-value">{loading ? "…" : members.length}</div>
                <div className="stat-sub">Active employees across all blocks</div>
              </div>
              <div className="stat-card stat-card-animated accent-green">
                <div className="stat-label">🏢 Active Blocks</div>
                <div className="stat-value">{loading ? "…" : blocks.length}</div>
                <div className="stat-sub">Blocks with member data</div>
              </div>
              {(isHR || isAdmin) && (
                <div className="stat-card stat-card-animated" style={{ borderLeft: "3px solid var(--green-500)" }}>
                  <div className="stat-label">📋 Pending Reports</div>
                  <div className="stat-value">{reports.filter(r => r.status === "pending").length}</div>
                  <div className="stat-sub">Monthly reports awaiting approval</div>
                </div>
              )}
            </div>

            {/* ===== ACCOUNTING SEARCH RESULTS VIEW ===== */}
            {showAccountingSearch ? (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">🔍 Search Results</h2>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {filteredMembers.length} employee{filteredMembers.length !== 1 ? "s" : ""} found
                  </span>
                </div>
                {filteredMembers.length === 0 ? (
                  <div className="card-body">
                    <div className="empty-state">
                      <div className="empty-state-icon">🔍</div>
                      <h3>No employee found</h3>
                      <p>Try searching by first name, last name, or employee ID number.</p>
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setSearch("")}>
                        Clear Search
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card-body no-pad">
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th style={{ width: 44 }} />
                            <th>Employee ID</th>
                            <th>Name</th>
                            <th>Block</th>
                            <th>Date of Birth</th>
                            <th>Date Joined</th>
                            <th className="num">Payroll</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map(m => (
                            <tr key={m.id}>
                              <td style={{ padding: "8px 12px" }}>
                                <MemberAvatar member={m} size={34} />
                              </td>
                              <td><code style={{ fontSize: 12 }}>{m.employee_id}</code></td>
                              <td><strong>{m.first_name} {m.last_name}</strong></td>
                              <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.block_name ?? "—"}</td>
                              <td>{fmtDate(m.date_of_birth)}</td>
                              <td>{fmtDate(m.date_joined)}</td>
                              <td className="num">
                                <button className="btn btn-secondary btn-sm" onClick={() => openPayroll(m)}>
                                  <DollarSign size={12} /> Payroll
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Blocks accordion */}
                {loading ? (
                  <div className="empty-state"><p>Loading…</p></div>
                ) : blocks.length === 0 ? (
                  <div className="empty-state"><p>No blocks found.</p></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {blocks.map(block => {
                      const blockMembers = membersByBlock[block.id] ?? [];
                      const isOpen = expandedBlock === block.id;
                      return (
                        <div key={block.id} className="card" style={{ overflow: "hidden" }}>
                          <button
                            type="button"
                            onClick={() => setExpandedBlock(isOpen ? null : block.id)}
                            style={{
                              width: "100%", background: "none", border: "none", cursor: "pointer",
                              padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                            }}
                          >
                            <span style={{ fontSize: 16 }}>🏢</span>
                            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{block.name}</span>
                            <span className="badge" style={{ background: "#e0e7ff", color: "#3730a3", marginRight: 4 }}>
                              {blockMembers.length} member{blockMembers.length !== 1 ? "s" : ""}
                            </span>
                            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>

                          {isOpen && (
                            <div style={{ borderTop: "1px solid var(--border)" }}>
                              {blockMembers.length === 0 ? (
                                <div style={{ padding: "20px", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                                  No members in this block yet.
                                  {(isHR || isAdmin) && (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ marginLeft: 12 }}
                                      onClick={() => openAddMember(String(block.id))}
                                    >
                                      + Add Member to {block.name}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="table-wrap">
                                  <table className="data-table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: 44 }} />
                                        <th>Employee ID</th>
                                        <th>Name</th>
                                        <th>Date of Birth</th>
                                        <th>Date Joined</th>
                                        {isAccounting && <th className="num">Payroll</th>}
                                        {(isHR || isAdmin) && <th style={{ width: 80 }}>Actions</th>}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {blockMembers.map(m => (
                                        <tr key={m.id}>
                                          <td style={{ padding: "8px 12px" }}>
                                            <MemberAvatar member={m} size={32} />
                                          </td>
                                          <td><code style={{ fontSize: 12 }}>{m.employee_id}</code></td>
                                          <td><strong>{m.first_name} {m.last_name}</strong></td>
                                          <td>{fmtDate(m.date_of_birth)}</td>
                                          <td>{fmtDate(m.date_joined)}</td>
                                          {isAccounting && (
                                            <td className="num">
                                              <button className="btn btn-secondary btn-sm" onClick={() => openPayroll(m)}>
                                                <DollarSign size={12} /> Payroll
                                              </button>
                                            </td>
                                          )}
                                          {(isHR || isAdmin) && (
                                            <td>
                                              <div style={{ display: "flex", gap: 4 }}>
                                                <button className="btn btn-ghost btn-icon" title="Edit" onClick={() => openEditMember(m)}>
                                                  <Edit2 size={13} />
                                                </button>
                                                <button className="btn btn-ghost btn-icon" title="Remove" style={{ color: "#ef4444" }} onClick={() => deleteMember(m)}>
                                                  <Trash2 size={13} />
                                                </button>
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Unassigned members */}
                {(() => {
                  const unassigned = filteredMembers.filter(m => !m.block_id);
                  if (unassigned.length === 0) return null;
                  return (
                    <div className="card" style={{ marginTop: 8, overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedBlock(expandedBlock === 0 ? null : 0)}
                        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
                      >
                        <span style={{ fontSize: 16 }}>❓</span>
                        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Unassigned</span>
                        <span className="badge">{unassigned.length}</span>
                        {expandedBlock === 0 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expandedBlock === 0 && (
                        <div style={{ borderTop: "1px solid var(--border)" }}>
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th style={{ width: 44 }} />
                                  <th>Employee ID</th><th>Name</th><th>Date of Birth</th><th>Date Joined</th>
                                  {(isHR || isAdmin) && <th>Actions</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {unassigned.map(m => (
                                  <tr key={m.id}>
                                    <td style={{ padding: "8px 12px" }}><MemberAvatar member={m} size={32} /></td>
                                    <td><code style={{ fontSize: 12 }}>{m.employee_id}</code></td>
                                    <td><strong>{m.first_name} {m.last_name}</strong></td>
                                    <td>{fmtDate(m.date_of_birth)}</td>
                                    <td>{fmtDate(m.date_joined)}</td>
                                    {(isHR || isAdmin) && (
                                      <td>
                                        <div style={{ display: "flex", gap: 4 }}>
                                          <button className="btn btn-ghost btn-icon" onClick={() => openEditMember(m)}><Edit2 size={13} /></button>
                                          <button className="btn btn-ghost btn-icon" style={{ color: "#ef4444" }} onClick={() => deleteMember(m)}><Trash2 size={13} /></button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* HR Monthly Submit */}
                {isHR && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-header">
                      <h2 className="card-title">📋 Submit Monthly Members Report</h2>
                    </div>
                    <div className="card-body">
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <select className="cell-input" style={{ flex: "0 0 110px" }} value={year} onChange={e => setYear(Number(e.target.value))}>
                          {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select className="cell-input" style={{ flex: "0 0 130px" }} value={month} onChange={e => setMonth(Number(e.target.value))}>
                          {MONTHS.map(m => <option key={m.n} value={m.n}>{m.name}</option>)}
                        </select>
                        {currentReport ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className={STATUS_BADGE[currentReport.status] || "badge"} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {STATUS_ICON[currentReport.status]} {currentReport.status.toUpperCase()}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              Submitted by {currentReport.submitted_by_username} on {fmtDate(currentReport.submitted_at)}
                            </span>
                            {currentReport.status === "rejected" && (
                              <button className="btn btn-secondary btn-sm" onClick={submitMonthlyReport}>Re-Submit</button>
                            )}
                          </div>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={submitMonthlyReport}>
                            <FileCheck size={14} /> Submit Monthly Members
                          </button>
                        )}
                      </div>
                      {currentReport?.review_note && (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", borderRadius: 8, fontSize: 12, color: "#b91c1c" }}>
                          Rejection note: {currentReport.review_note}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ===== REPORTS TAB ===== */}
        {activeTab === "reports" && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📋 Monthly Members Reports</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {isAdmin ? "Review and approve/reject HR submissions" : "Your monthly submissions"}
              </span>
            </div>
            <div className="card-body no-pad">
              {reports.length === 0 ? (
                <div className="empty-state"><p>No monthly reports submitted yet.</p></div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Submitted By</th>
                        <th>Submitted At</th>
                        <th>Status</th>
                        <th>Reviewed By</th>
                        <th>Review Note</th>
                        {isAdmin && <th style={{ width: 140 }}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map(r => (
                        <tr key={r.id}>
                          <td><strong>{monthName(r.month)} {r.year}</strong></td>
                          <td>{r.submitted_by_username}</td>
                          <td>{fmtDate(r.submitted_at)}</td>
                          <td>
                            <span className={STATUS_BADGE[r.status] || "badge"} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {STATUS_ICON[r.status]} {r.status.toUpperCase()}
                            </span>
                          </td>
                          <td>{r.reviewed_by_username ?? "—"}</td>
                          <td style={{ fontSize: 12, color: r.status === "rejected" ? "#b91c1c" : "var(--text-muted)" }}>
                            {r.review_note ?? "—"}
                          </td>
                          {isAdmin && (
                            <td>
                              {r.status === "pending" && (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    className="btn btn-sm"
                                    style={{ background: "#16a34a", color: "#fff", fontSize: 12, padding: "4px 10px" }}
                                    onClick={() => approveReport(r.id)}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    style={{ background: "#ef4444", color: "#fff", fontSize: 12, padding: "4px 10px" }}
                                    onClick={() => setRejectDialog({ open: true, reportId: r.id, note: "" })}
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== ADD/EDIT MEMBER DIALOG ===== */}
      <Dialog.Root open={memberDialog.open} onOpenChange={o => !o && setMemberDialog(p => ({ ...p, open: false }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined} style={{ maxWidth: 540 }}>
            <div className="add-block-header">
              <Dialog.Title>
                <UserPlus size={16} />
                {memberDialog.editing ? "Edit Member" : "Add New Member"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Photo section */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ position: "relative" }}>
                  {memberDialog.photoPreview ? (
                    <img
                      src={memberDialog.photoPreview}
                      alt="Preview"
                      style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }}
                    />
                  ) : (
                    <div style={{
                      width: 64, height: 64, borderRadius: "50%",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontWeight: 700, fontSize: 22, border: "2px solid var(--border)",
                    }}>
                      {memberDialog.firstName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Profile Photo</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    PNG, JPG or WebP — max 3 MB
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={13} /> {memberDialog.photoPreview ? "Change Photo" : "Upload Photo"}
                  </button>
                  {memberDialog.photoFile && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>
                      {memberDialog.photoFile.name}
                    </span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    style={{ display: "none" }}
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>First Name *</label>
                  <input className="cell-input" style={{ width: "100%" }} placeholder="First Name"
                    value={memberDialog.firstName}
                    onChange={e => setMemberDialog(p => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Last Name / Surname *</label>
                  <input className="cell-input" style={{ width: "100%" }} placeholder="Last Name"
                    value={memberDialog.lastName}
                    onChange={e => setMemberDialog(p => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Date of Birth</label>
                  <input type="date" className="cell-input" style={{ width: "100%" }}
                    value={memberDialog.dob}
                    onChange={e => setMemberDialog(p => ({ ...p, dob: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Date First Came to ALGO GROUP</label>
                  <input type="date" className="cell-input" style={{ width: "100%" }}
                    value={memberDialog.dateJoined}
                    onChange={e => setMemberDialog(p => ({ ...p, dateJoined: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Employee ID Number *</label>
                  <input className="cell-input" style={{ width: "100%" }} placeholder="e.g. EMP-001"
                    value={memberDialog.employeeId}
                    onChange={e => setMemberDialog(p => ({ ...p, employeeId: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Assigned Block</label>
                  <select className="cell-input" style={{ width: "100%" }}
                    value={memberDialog.blockId}
                    onChange={e => setMemberDialog(p => ({ ...p, blockId: e.target.value }))}>
                    <option value="">— No Block —</option>
                    {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              {memberDialog.error && (
                <div style={{ color: "#b91c1c", fontSize: 13, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  {memberDialog.error}
                </div>
              )}
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-primary btn-sm" disabled={memberDialog.saving} onClick={saveMember}>
                {memberDialog.saving ? "Saving…" : memberDialog.editing ? "Save Changes" : "Add Member"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ===== PAYROLL DIALOG ===== */}
      <Dialog.Root open={payrollDialog.open} onOpenChange={o => !o && setPayrollDialog(p => ({ ...p, open: false }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined} style={{ maxWidth: 480 }}>
            <div className="add-block-header">
              <Dialog.Title>
                <DollarSign size={16} />
                Payroll — {payrollDialog.member?.first_name} {payrollDialog.member?.last_name}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {payrollDialog.member && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <MemberAvatar member={payrollDialog.member} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{payrollDialog.member.first_name} {payrollDialog.member.last_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {payrollDialog.member.employee_id} · {payrollDialog.member.block_name ?? "No Block"} · {monthName(month)} {year}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Salary</label>
                  <input type="number" className="cell-input" style={{ width: "100%" }} placeholder="0.00"
                    value={payrollDialog.salary}
                    onChange={e => setPayrollDialog(p => ({ ...p, salary: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Payment Type</label>
                  <select className="cell-input" style={{ width: "100%" }}
                    value={payrollDialog.paymentType}
                    onChange={e => setPayrollDialog(p => ({ ...p, paymentType: e.target.value }))}>
                    <option value="">— Select —</option>
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                    <option value="contract">Contract</option>
                    <option value="per_diem">Per Diem</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Bonus</label>
                  <input type="number" className="cell-input" style={{ width: "100%" }} placeholder="0.00"
                    value={payrollDialog.bonus}
                    onChange={e => setPayrollDialog(p => ({ ...p, bonus: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Deduction</label>
                  <input type="number" className="cell-input" style={{ width: "100%" }} placeholder="0.00"
                    value={payrollDialog.deduction}
                    onChange={e => setPayrollDialog(p => ({ ...p, deduction: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Notes</label>
                <textarea className="cell-input" style={{ width: "100%", minHeight: 72, resize: "vertical" }}
                  placeholder="Any notes for this payroll entry…"
                  value={payrollDialog.notes}
                  onChange={e => setPayrollDialog(p => ({ ...p, notes: e.target.value }))} />
              </div>
              {payrollDialog.error && (
                <div style={{ color: "#b91c1c", fontSize: 13, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  {payrollDialog.error}
                </div>
              )}
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-primary btn-sm" disabled={payrollDialog.saving} onClick={savePayroll}>
                {payrollDialog.saving ? "Saving…" : "Save Payroll"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ===== REJECT DIALOG ===== */}
      <Dialog.Root open={rejectDialog.open} onOpenChange={o => !o && setRejectDialog(p => ({ ...p, open: false }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined} style={{ maxWidth: 420 }}>
            <div className="add-block-header">
              <Dialog.Title><XCircle size={16} /> Reject Report</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                Optionally add a rejection note for the HR team.
              </p>
              <textarea
                className="cell-input"
                style={{ width: "100%", minHeight: 80, resize: "vertical" }}
                placeholder="Rejection reason…"
                value={rejectDialog.note}
                onChange={e => setRejectDialog(p => ({ ...p, note: e.target.value }))}
              />
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-sm" style={{ background: "#ef4444", color: "#fff" }} onClick={rejectReport}>
                Reject Report
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </AppShell>
  );
}
