"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as Avatar from "@radix-ui/react-avatar";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Sun, Moon, User, KeyRound, Bot,
  LogOut, X, ChevronDown, ShieldCheck, Loader2,
  ImagePlus, Trash2, Camera,
} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { isAloxHidden, setAloxHidden, ALOX_VISIBILITY_EVENT } from "@/components/AloxHelpButton";
import type { Role } from "@/lib/auth";
import { roleLabel, isFullAdmin } from "@/lib/permissions";

type AdminUser = { username: string; role: Role; email?: string | null; avatarUrl?: string | null };
type Theme = "light" | "dark";

export const THEME_KEY = "zv_theme";
const PANEL_MIN_WIDTH = 296;

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AVATAR_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const AVATAR_TARGET_SIZE = 256;

// Center-crops the image to a square and resizes it to AVATAR_TARGET_SIZE —
// keeps every uploaded avatar a consistent, predictable shape for the circular display.
async function cropImageToSquare(file: File, size = AVATAR_TARGET_SIZE): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read the selected image"));
      image.src = objectUrl;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to process the image"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AdminProfileMenu({
  user,
  onLogout,
}: {
  user: AdminUser;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [aloxVisible, setAloxVisible] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load persisted preferences once on mount (theme is already applied by the
  // inline init script in app/layout.tsx — this just syncs React state to it).
  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) === "dark" ? "dark" : "light";
    setTheme(storedTheme);

    setAloxVisible(!isAloxHidden());
  }, []);

  // Stay in sync if Alox's own right-click "Hide Alox" / restore changes
  // visibility while this menu is open (or already mounted on the page).
  useEffect(() => {
    function onVisibilityChange(e: Event) {
      const detail = (e as CustomEvent<{ hidden: boolean }>).detail;
      if (detail) setAloxVisible(!detail.hidden);
    }
    window.addEventListener(ALOX_VISIBILITY_EVENT, onVisibilityChange as EventListener);
    return () => window.removeEventListener(ALOX_VISIBILITY_EVENT, onVisibilityChange as EventListener);
  }, []);

  function computePosition() {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPos({
      bottom: Math.max(8, window.innerHeight - rect.top + 8),
      left: Math.max(8, rect.left),
      width: Math.max(rect.width, PANEL_MIN_WIDTH),
    });
  }

  useEffect(() => {
    if (!open) return;
    computePosition();
    setExpanded(null);

    function onReposition() { computePosition(); }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  // Close the avatar action menu on outside click, Escape, or when the
  // My Profile detail collapses.
  useEffect(() => {
    if (expanded !== "profile") setAvatarMenuOpen(false);
  }, [expanded]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (avatarMenuRef.current?.contains(t)) return;
      setAvatarMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAvatarMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [avatarMenuOpen]);

  // ---- Appearance ----
  function chooseTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
    apiClient("/api/prefs", {
      method: "POST",
      body: JSON.stringify({ theme_mode: next, accent: "#0B7A4B", font_scale: 1, snow_enabled: false }),
    }).catch(() => { /* local preference already applied — sync is best-effort */ });
  }

  function toggleAloxVisible() {
    const next = !aloxVisible;
    setAloxVisible(next);
    setAloxHidden(!next);
  }

  // ---- Profile image ----
  function triggerAvatarUpload() {
    setAvatarError("");
    avatarInputRef.current?.click();
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setAvatarError("");
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      setAvatarError("Only PNG, JPG, JPEG, and WebP images are allowed.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("Image must be 2MB or smaller.");
      return;
    }

    setAvatarUploading(true);
    try {
      const cropped = await cropImageToSquare(file);
      const fd = new FormData();
      fd.append("file", cropped, "avatar.png");
      const res = await apiClient("/api/me/avatar", { method: "POST", body: fd });
      setAvatarUrl(res.avatarUrl ?? null);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatarError("");
    setAvatarUploading(true);
    try {
      await apiClient("/api/me/avatar", { method: "DELETE" });
      setAvatarUrl(null);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to remove image");
    } finally {
      setAvatarUploading(false);
    }
  }

  // ---- Change password ----
  function openChangePassword() {
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setPwError(""); setPwSuccess(false);
    setPwOpen(true);
    setOpen(false);
  }

  async function submitChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (!pwCurrent.trim()) { setPwError("Enter your current password."); return; }
    if (pwNew.trim().length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New password and confirmation do not match."); return; }
    if (pwNew === pwCurrent) { setPwError("New password must be different from the current password."); return; }

    setPwSaving(true);
    try {
      await apiClient("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      setPwSuccess(true);
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  }

  // ---- Logout ----
  function requestLogout() {
    setOpen(false);
    setLogoutConfirmOpen(true);
  }
  function confirmLogout() {
    setLogoutConfirmOpen(false);
    onLogout();
  }

  function toggleSection(key: string) {
    setExpanded((cur) => (cur === key ? null : key));
  }

  const initial = user.username.charAt(0).toUpperCase();
  const avatarBg = isFullAdmin(user.role)
    ? "linear-gradient(135deg,#0B7A4B,#10b981)"
    : "linear-gradient(135deg,#2563eb,#60a5fa)";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sidebar-user sidebar-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar-with-status">
          <Avatar.Root className="avatar-root" style={{ background: avatarBg }}>
            <Avatar.Image className="avatar-image" src={avatarUrl ?? undefined} alt="" />
            <Avatar.Fallback className="avatar-fallback" delayMs={avatarUrl ? 200 : undefined}>{initial}</Avatar.Fallback>
          </Avatar.Root>
          <span className="status-dot status-online" title="Online" aria-label="Online status: online" />
        </span>

        <span className="sidebar-user-info">
          <span className="sidebar-user-name">{user.username}</span>
          <span className="sidebar-user-role">{user.role}</span>
        </span>

        <ChevronDown size={14} className={`admin-menu-chevron${open ? " open" : ""}`} aria-hidden />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="admin-menu-panel"
          role="menu"
          style={{ position: "fixed", bottom: pos.bottom, left: pos.left, width: pos.width }}
        >
          {/* Header */}
          <div className="admin-menu-header">
            <span className="avatar-with-status">
              <Avatar.Root className="avatar-root" style={{ background: avatarBg }}>
                <Avatar.Image className="avatar-image" src={avatarUrl ?? undefined} alt="" />
                <Avatar.Fallback className="avatar-fallback" delayMs={avatarUrl ? 200 : undefined}>{initial}</Avatar.Fallback>
              </Avatar.Root>
              <span className="status-dot status-online" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="admin-menu-name">{user.username}</div>
              <div className="admin-menu-role">
                <ShieldCheck size={12} /> {roleLabel(user.role)}
                <span className="admin-menu-dot-sep">•</span>
                <span className="status-text-online">Online</span>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="admin-menu-section">
            <div className="admin-menu-section-label">Appearance</div>
            <div className="theme-toggle-group">
              <button
                type="button"
                className={`theme-toggle-btn${theme === "light" ? " active" : ""}`}
                onClick={() => chooseTheme("light")}
              >
                <Sun size={14} /> Light
              </button>
              <button
                type="button"
                className={`theme-toggle-btn${theme === "dark" ? " active" : ""}`}
                onClick={() => chooseTheme("dark")}
              >
                <Moon size={14} /> Dark
              </button>
            </div>
          </div>

          {/* Profile */}
          <div className="admin-menu-section">
            <div className="admin-menu-section-label">Profile</div>
            <button type="button" className="admin-menu-item" onClick={() => toggleSection("profile")}>
              <User size={15} />
              <span>My Profile</span>
              <ChevronDown size={13} className={`admin-menu-chevron admin-menu-chevron-end${expanded === "profile" ? " open" : ""}`} aria-hidden />
            </button>
            {expanded === "profile" && (
              <div className="admin-menu-detail">
                <div className="admin-menu-avatar-row">
                  <div className="admin-menu-avatar-wrap" ref={avatarMenuRef}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          className="admin-menu-avatar-trigger"
                          onClick={() => setAvatarMenuOpen((v) => !v)}
                          aria-haspopup="menu"
                          aria-expanded={avatarMenuOpen}
                          aria-label={avatarUrl ? "Change or remove profile photo" : "Upload profile photo"}
                        >
                          <Avatar.Root className="avatar-root admin-menu-avatar-preview" style={{ background: avatarBg }}>
                            <Avatar.Image className="avatar-image" src={avatarUrl ?? undefined} alt="" />
                            <Avatar.Fallback className="avatar-fallback" delayMs={avatarUrl ? 200 : undefined}>{initial}</Avatar.Fallback>
                          </Avatar.Root>
                          <span className="admin-menu-avatar-hover" aria-hidden>
                            {avatarUploading ? <Loader2 size={16} className="spin-icon" /> : <Camera size={16} />}
                          </span>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="tooltip-content" side="top" sideOffset={8}>
                          Change Photo
                          <Tooltip.Arrow className="tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>

                    {avatarMenuOpen && (
                      <div className="admin-menu-avatar-menu" role="menu">
                        <button
                          type="button"
                          className="admin-menu-avatar-menu-item"
                          role="menuitem"
                          onClick={() => { setAvatarMenuOpen(false); triggerAvatarUpload(); }}
                        >
                          <ImagePlus size={13} /> {avatarUrl ? "Change Image" : "Upload Image"}
                        </button>
                        {avatarUrl && (
                          <button
                            type="button"
                            className="admin-menu-avatar-menu-item admin-menu-avatar-menu-danger"
                            role="menuitem"
                            onClick={() => { setAvatarMenuOpen(false); removeAvatar(); }}
                          >
                            <Trash2 size={13} /> Remove Image
                          </button>
                        )}
                      </div>
                    )}

                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      style={{ display: "none" }}
                      onChange={handleAvatarFileChange}
                    />
                  </div>
                  <div className="admin-menu-avatar-actions">
                    <span className="admin-menu-avatar-label">Profile Image</span>
                    <p className="admin-menu-switch-help">Click your photo to upload, change, or remove it. Images are cropped to a square automatically.</p>
                    <p className="admin-menu-switch-help">PNG, JPG, JPEG, or WebP — up to 2MB.</p>
                  </div>
                </div>
                {avatarError && <p className="admin-menu-avatar-error">{avatarError}</p>}
                <div className="admin-menu-detail-row"><span>Username</span><strong>{user.username}</strong></div>
                <div className="admin-menu-detail-row"><span>Role</span><strong style={{ textTransform: "capitalize" }}>{user.role}</strong></div>
                <div className="admin-menu-detail-row"><span>Email</span><strong>{user.email || "—"}</strong></div>
              </div>
            )}
            <button type="button" className="admin-menu-item" onClick={openChangePassword}>
              <KeyRound size={15} />
              <span>Change Password</span>
            </button>
          </div>

          {/* Settings */}
          <div className="admin-menu-section">
            <div className="admin-menu-section-label">Settings</div>
            <button type="button" className="admin-menu-item" onClick={() => toggleSection("alox")}>
              <Bot size={15} />
              <span>Alox Assistant</span>
              <ChevronDown size={13} className={`admin-menu-chevron admin-menu-chevron-end${expanded === "alox" ? " open" : ""}`} aria-hidden />
            </button>
            {expanded === "alox" && (
              <div className="admin-menu-detail">
                <label className="admin-menu-switch-row">
                  <span>Show Alox</span>
                  <span
                    className={`mini-switch${aloxVisible ? " on" : ""}`}
                    onClick={toggleAloxVisible}
                    role="switch"
                    aria-checked={aloxVisible}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAloxVisible(); } }}
                  >
                    <span className="mini-switch-knob" />
                  </span>
                </label>
                <p className="admin-menu-switch-help">Shows or hides the floating Alox helper button on every page. You can also restore it from Alox&apos;s right-click menu.</p>
              </div>
            )}
          </div>

          {/* Account */}
          <div className="admin-menu-section admin-menu-section-last">
            <div className="admin-menu-section-label">Account</div>
            <button type="button" className="admin-menu-item admin-menu-danger" onClick={requestLogout}>
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Change Password modal */}
      <Dialog.Root open={pwOpen} onOpenChange={setPwOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" style={{ width: 360 }} aria-describedby={undefined}>
            <form onSubmit={submitChangePassword}>
              <div className="add-block-header">
                <Dialog.Title style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Change Password</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={16} /></button>
                </Dialog.Close>
              </div>
              <div className="add-block-body">
                {pwSuccess ? (
                  <div style={{ textAlign: "center", padding: "12px 0" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>Password changed</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Use your new password next time you log in.</p>
                  </div>
                ) : (
                  <>
                    {pwError && <div className="add-block-error">{pwError}</div>}
                    <div className="add-block-field">
                      <label>Current Password</label>
                      <input type="password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} disabled={pwSaving} />
                    </div>
                    <div className="add-block-field">
                      <label>New Password</label>
                      <input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} disabled={pwSaving} />
                    </div>
                    <div className="add-block-field">
                      <label>Confirm New Password</label>
                      <input type="password" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} disabled={pwSaving} />
                    </div>
                  </>
                )}
              </div>
              <div className="add-block-footer">
                {pwSuccess ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setPwOpen(false)}>Done</button>
                ) : (
                  <>
                    <Dialog.Close asChild>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={pwSaving}>Cancel</button>
                    </Dialog.Close>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={pwSaving}>
                      {pwSaving ? <><Loader2 size={14} className="spin-icon" /> Saving…</> : "Change Password"}
                    </button>
                  </>
                )}
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Logout confirmation */}
      <Dialog.Root open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" style={{ width: 340 }} aria-describedby={undefined}>
            <div className="add-block-header">
              <Dialog.Title style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Log out?</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={16} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                You&rsquo;ll be signed out of <strong>{user.username}</strong>&rsquo;s account and need to log in again to continue.
              </p>
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-primary btn-sm admin-menu-logout-confirm" onClick={confirmLogout}>
                <LogOut size={14} /> Log out
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
