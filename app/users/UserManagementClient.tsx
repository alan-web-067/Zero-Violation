"use client";

// =====================================================================
// RBAC FEATURE — "User Management"
//
// Lets a Super Admin (or "admin", which carries identical permissions)
// create accounts, change roles, assign a Block Manager to a block,
// enable/disable accounts, and reset passwords. Entirely additive — built
// on the existing `users` table (plus the new assigned_block_id/status/
// last_login columns) and the existing Dialog/form patterns already used
// on the Reports page's "+ Add Block" modal.
//
// Safe to remove: deleting this directory and app/api/users/** removes User
// Management entirely; no other page links into it except the gated nav
// entry in AppShell.tsx.
// =====================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { AUTH_TOKEN_KEY, apiClient, getMe } from "@/lib/apiClient";
import { fetchBlockDefs, BlockDef } from "@/lib/useKpiData";
import type { Role } from "@/lib/auth";
import { roleLabel } from "@/lib/permissions";

type UserDTO = {
  id: number;
  username: string;
  role: Role;
  status: "active" | "disabled";
  lastLogin: string | null;
  assignedBlock: { id: string; name: string } | null;
};

const ASSIGNABLE_ROLES: Role[] = ["super_admin", "block_manager", "admin", "viewer"];

function fmtLastLogin(iso: string | null) {
  if (!iso) return "Never";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function RoleBadge({ role }: { role: Role }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    super_admin:   { bg: "#dcfce7", fg: "#065f46" },
    admin:         { bg: "#dcfce7", fg: "#065f46" },
    block_manager: { bg: "#dbeafe", fg: "#1e40af" },
    hr:            { bg: "#fce7f3", fg: "#9d174d" },
    accounting:    { bg: "#fef3c7", fg: "#92400e" },
    viewer:        { bg: "var(--gray-100)", fg: "var(--text-muted)" },
  };
  const c = colors[role] || colors.viewer;
  return <span className="badge" style={{ background: c.bg, color: c.fg }}>{roleLabel(role)}</span>;
}

export default function UserManagementClient() {
  const router = useRouter();
  const [mounted, setMounted] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [blocks, setBlocks] = useState<BlockDef[]>([]);
  const [toast, setToast] = useState("");

  // Create User modal
  const [createOpen, setCreateOpen] = useState(false);
  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState<Role>("viewer");
  const [cBlockId, setCBlockId] = useState("");
  const [cError, setCError] = useState("");
  const [cSaving, setCSaving] = useState(false);

  // Edit User modal (role + assigned block)
  const [editTarget, setEditTarget] = useState<UserDTO | null>(null);
  const [eRole, setERole] = useState<Role>("viewer");
  const [eBlockId, setEBlockId] = useState("");
  const [eError, setEError] = useState("");
  const [eSaving, setESaving] = useState(false);

  // Reset password modal
  const [pwTarget, setPwTarget] = useState<UserDTO | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { router.replace("/"); return; }
    setMounted(true);
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function boot() {
    try {
      const me = await getMe();
      if (me.user?.role !== "admin" && me.user?.role !== "super_admin") {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);
      const [defs] = await Promise.all([fetchBlockDefs(), loadUsers()]);
      setBlocks(defs);
    } catch {
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    const out = await apiClient("/api/users");
    setUsers((out.users || []) as UserDTO[]);
  }

  function blockName(id: string) {
    return blocks.find((b) => b.id === id)?.name || id;
  }

  // ---------- Create ----------
  function openCreate() {
    setCUsername(""); setCPassword(""); setCRole("viewer"); setCBlockId(blocks[0]?.id || ""); setCError("");
    setCreateOpen(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCError("");
    if (!cUsername.trim() || !cPassword.trim()) { setCError("Username and password are required."); return; }
    if (cRole === "block_manager" && !cBlockId) { setCError("Choose a block to assign this Block Manager to."); return; }
    setCSaving(true);
    try {
      await apiClient("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: cUsername.trim(),
          password: cPassword.trim(),
          role: cRole,
          assignedBlockId: cRole === "block_manager" ? cBlockId : null,
        }),
      });
      setCreateOpen(false);
      setToast(`User "${cUsername.trim()}" created ✅`);
      await loadUsers();
    } catch (err: any) {
      setCError(err?.message || "Could not create user.");
    } finally {
      setCSaving(false);
    }
  }

  // ---------- Edit (role / assigned block) ----------
  function openEdit(u: UserDTO) {
    setERole(u.role); setEBlockId(u.assignedBlock?.id || blocks[0]?.id || ""); setEError("");
    setEditTarget(u);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEError("");
    if (eRole === "block_manager" && !eBlockId) { setEError("Choose a block to assign this Block Manager to."); return; }
    setESaving(true);
    try {
      await apiClient(`/api/users/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: eRole,
          assignedBlockId: eRole === "block_manager" ? eBlockId : null,
        }),
      });
      setEditTarget(null);
      setToast(`User "${editTarget.username}" updated ✅`);
      await loadUsers();
    } catch (err: any) {
      setEError(err?.message || "Could not update user.");
    } finally {
      setESaving(false);
    }
  }

  // ---------- Disable / Enable ----------
  async function toggleStatus(u: UserDTO) {
    const next = u.status === "active" ? "disabled" : "active";
    try {
      await apiClient(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setToast(`User "${u.username}" ${next === "active" ? "enabled" : "disabled"} ✅`);
      await loadUsers();
    } catch (err: any) {
      setToast(err?.message || "Could not update status ❌");
    }
  }

  // ---------- Reset password ----------
  function openResetPassword(u: UserDTO) {
    setPwValue(""); setPwError(""); setPwTarget(u);
  }

  async function submitResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwTarget) return;
    setPwError("");
    if (pwValue.trim().length < 6) { setPwError("Password must be at least 6 characters."); return; }
    setPwSaving(true);
    try {
      await apiClient(`/api/users/${pwTarget.id}`, { method: "PATCH", body: JSON.stringify({ password: pwValue.trim() }) });
      setPwTarget(null);
      setToast(`Password reset for "${pwTarget.username}" ✅`);
    } catch (err: any) {
      setPwError(err?.message || "Could not reset password.");
    } finally {
      setPwSaving(false);
    }
  }

  if (!mounted) return null;

  if (!allowed) {
    return (
      <AppShell>
        <div className="page-header">
          <div className="page-header-left">
            <span style={{ fontSize: 18 }}>👤</span>
            <h1>User Management</h1>
          </div>
        </div>
        <div className="page-body">
          <div className="empty-state">
            <div className="empty-state-icon">🔒</div>
            <h3>Super Admin Access Only</h3>
            <p>You do not have permission to manage users.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>👤</span>
          <h1>User Management</h1>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Create User</button>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All Accounts</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{users.length} users</span>
          </div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Role</th>
                      <th>Assigned Block</th>
                      <th>Status</th>
                      <th>Last Login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="table-row-animated">
                        <td><strong>{u.username}</strong></td>
                        <td><RoleBadge role={u.role} /></td>
                        <td>{u.assignedBlock ? u.assignedBlock.name : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                        <td>
                          {u.status === "active"
                            ? <span className="badge" style={{ background: "#dcfce7", color: "#065f46" }}>Active</span>
                            : <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>Disabled</span>}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtLastLogin(u.lastLogin)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openResetPassword(u)}>Reset Password</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => toggleStatus(u)}>
                              {u.status === "active" ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--gray-50)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>Roles:</strong>{" "}
          Super Admin and Administrator have full access, including publishing and approving Block Manager changes.
          Block Managers must be assigned exactly one block and propose changes for it in My Workspace.
          Viewers can only see published results.
        </div>
      </div>

      {/* Create User */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
            <form onSubmit={submitCreate}>
              <div className="add-block-header">
                <Dialog.Title className="alox-title">+ Create User</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
                </Dialog.Close>
              </div>
              <div className="add-block-body">
                {cError && <div className="add-block-error">{cError}</div>}
                <div className="add-block-field">
                  <label className="form-label">Username</label>
                  <input value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder="e.g. jane.hr" autoFocus required />
                </div>
                <div className="add-block-field">
                  <label className="form-label">Password</label>
                  <input value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="At least 6 characters" type="text" required />
                </div>
                <div className="add-block-field">
                  <label className="form-label">Role</label>
                  <select value={cRole} onChange={(e) => setCRole(e.target.value as Role)}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </div>
                {cRole === "block_manager" && (
                  <div className="add-block-field" style={{ marginBottom: 0 }}>
                    <label className="form-label">Assigned Block</label>
                    <select value={cBlockId} onChange={(e) => setCBlockId(e.target.value)}>
                      {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="add-block-footer">
                <Dialog.Close asChild><button type="button" className="btn btn-secondary btn-sm">Cancel</button></Dialog.Close>
                <button type="submit" className="btn btn-primary btn-sm" disabled={cSaving}>{cSaving ? "Creating…" : "Create User"}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Edit User (role + assigned block) */}
      <Dialog.Root open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
            <form onSubmit={submitEdit}>
              <div className="add-block-header">
                <Dialog.Title className="alox-title">Edit "{editTarget?.username}"</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
                </Dialog.Close>
              </div>
              <div className="add-block-body">
                {eError && <div className="add-block-error">{eError}</div>}
                <div className="add-block-field">
                  <label className="form-label">Role</label>
                  <select value={eRole} onChange={(e) => setERole(e.target.value as Role)}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </div>
                {eRole === "block_manager" && (
                  <div className="add-block-field" style={{ marginBottom: 0 }}>
                    <label className="form-label">Assigned Block</label>
                    <select value={eBlockId} onChange={(e) => setEBlockId(e.target.value)}>
                      {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="add-block-footer">
                <Dialog.Close asChild><button type="button" className="btn btn-secondary btn-sm">Cancel</button></Dialog.Close>
                <button type="submit" className="btn btn-primary btn-sm" disabled={eSaving}>{eSaving ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Reset Password */}
      <Dialog.Root open={!!pwTarget} onOpenChange={(o) => { if (!o) setPwTarget(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" style={{ width: 360 }} aria-describedby={undefined}>
            <form onSubmit={submitResetPassword}>
              <div className="add-block-header">
                <Dialog.Title className="alox-title">Reset Password</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
                </Dialog.Close>
              </div>
              <div className="add-block-body">
                {pwError && <div className="add-block-error">{pwError}</div>}
                <p style={{ marginTop: 0, fontSize: 13, color: "var(--text-muted)" }}>
                  Set a new password for <strong>{pwTarget?.username}</strong>. They'll need it the next time they sign in.
                </p>
                <div className="add-block-field" style={{ marginBottom: 0 }}>
                  <label className="form-label">New Password</label>
                  <input value={pwValue} onChange={(e) => setPwValue(e.target.value)} placeholder="At least 6 characters" autoFocus required />
                </div>
              </div>
              <div className="add-block-footer">
                <Dialog.Close asChild><button type="button" className="btn btn-secondary btn-sm">Cancel</button></Dialog.Close>
                <button type="submit" className="btn btn-primary btn-sm" disabled={pwSaving}>{pwSaving ? "Saving…" : "Reset Password"}</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </AppShell>
  );
}
