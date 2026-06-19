"use client";

// app/events/EventsClient.tsx
// HR UPCOMING EVENTS FEATURE — event calendar with notifications

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, Plus, Edit2, Trash2, X, Bell, ChevronDown, ChevronUp } from "lucide-react";
import AppShell from "@/components/AppShell";
import { AUTH_TOKEN_KEY, apiClient } from "@/lib/apiClient";

type Event = {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_type: string;
  created_by: number;
  created_by_username: string;
  created_at: string;
};

const EVENT_TYPES = [
  { value: "general",          label: "📌 General Event" },
  { value: "birthday",         label: "🎂 Employee Birthday" },
  { value: "meeting",          label: "📅 Company Meeting" },
  { value: "interview",        label: "🤝 Interview Schedule" },
  { value: "deadline",         label: "⏰ Submission Deadline" },
  { value: "holiday",          label: "🏖️ Holiday" },
  { value: "important",        label: "⚠️ Important Company Event" },
];

function typeLabel(value: string) {
  return EVENT_TYPES.find(t => t.value === value)?.label ?? value;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function daysLabel(days: number): string {
  if (days < 0) return `${-days} day${days < -1 ? "s" : ""} ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}

function urgencyStyle(days: number): React.CSSProperties {
  if (days < 0)  return { background: "#f3f4f6", color: "#6b7280" };
  if (days === 0) return { background: "#fef2f2", color: "#b91c1c", fontWeight: 700, border: "1px solid #fca5a5" };
  if (days <= 2)  return { background: "#fef2f2", color: "#dc2626", fontWeight: 700 };
  if (days <= 7)  return { background: "#fffbeb", color: "#b45309", fontWeight: 600 };
  return { background: "#f0fdf4", color: "#15803d" };
}

function fmtDate(d: string) {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" }); }
  catch { return d; }
}

export default function EventsClient() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [dismissedNotifs, setDismissedNotifs] = useState<Set<number>>(new Set());

  const [dialog, setDialog] = useState<{
    open: boolean;
    editing: Event | null;
    title: string;
    description: string;
    event_date: string;
    event_type: string;
    saving: boolean;
    error: string;
  }>({
    open: false, editing: null, title: "", description: "",
    event_date: "", event_type: "general", saving: false, error: "",
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2800);
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
      const me = await apiClient("/api/me");
      if (me.user?.role !== "hr" && me.user?.role !== "admin" && me.user?.role !== "super_admin") {
        router.replace("/dashboard"); return;
      }
      await loadEvents();
    } catch { router.replace("/"); }
    finally { setLoading(false); }
  }

  async function loadEvents() {
    const res = await apiClient("/api/events?all=1").catch(() => ({ events: [] }));
    setEvents(res.events || []);
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcoming = useMemo(() => events.filter(e => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date)), [events, today]);
  const past = useMemo(() => events.filter(e => e.event_date < today).sort((a, b) => b.event_date.localeCompare(a.event_date)), [events, today]);

  // Notification events: within 7 days
  const urgentEvents = useMemo(
    () => upcoming.filter(e => daysUntil(e.event_date) <= 7 && !dismissedNotifs.has(e.id)),
    [upcoming, dismissedNotifs]
  );

  function openAdd() {
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    setDialog({ open: true, editing: null, title: "", description: "", event_date: twoWeeks.toISOString().slice(0, 10), event_type: "general", saving: false, error: "" });
  }
  function openEdit(e: Event) {
    setDialog({ open: true, editing: e, title: e.title, description: e.description ?? "", event_date: e.event_date, event_type: e.event_type, saving: false, error: "" });
  }

  async function saveEvent() {
    const d = dialog;
    if (!d.title.trim() || !d.event_date) {
      setDialog(p => ({ ...p, error: "Title and date are required." })); return;
    }
    setDialog(p => ({ ...p, saving: true, error: "" }));
    try {
      const body = { title: d.title.trim(), description: d.description || null, event_date: d.event_date, event_type: d.event_type };
      if (d.editing) {
        await apiClient(`/api/events/${d.editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        setToast("Event updated.");
      } else {
        await apiClient("/api/events", { method: "POST", body: JSON.stringify(body) });
        setToast("Event created.");
      }
      setDialog(p => ({ ...p, open: false }));
      await loadEvents();
    } catch (e: any) {
      setDialog(p => ({ ...p, saving: false, error: e.message || "Failed to save." }));
    }
  }

  async function deleteEvent(ev: Event) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    try {
      await apiClient(`/api/events/${ev.id}`, { method: "DELETE" });
      setToast("Event deleted.");
      await loadEvents();
    } catch { setToast("Failed to delete event."); }
  }

  if (!mounted) return null;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>📅</span>
          <h1>Upcoming Events</h1>
        </div>
        <div className="page-header-right">
          <span className="badge" style={{ background: "#e0e7ff", color: "#3730a3" }}>HR</span>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* Notification Panel */}
        {urgentEvents.length > 0 && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Bell size={15} style={{ color: "#f59e0b" }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>
                {urgentEvents.length} upcoming event{urgentEvents.length !== 1 ? "s" : ""} need your attention
              </span>
            </div>
            {urgentEvents.map(ev => {
              const days = daysUntil(ev.event_date);
              return (
                <div
                  key={ev.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                    background: days === 0 ? "#fef2f2" : days <= 2 ? "#fffbeb" : "#f0f9ff",
                    borderRadius: 10, border: `1px solid ${days === 0 ? "#fca5a5" : days <= 2 ? "#fcd34d" : "#bae6fd"}`,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{days === 0 ? "🔴" : days <= 2 ? "🟡" : "🔵"}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{ev.title}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
                      {typeLabel(ev.event_type)}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    ...urgencyStyle(days)
                  }}>
                    {daysLabel(days)}
                  </span>
                  <button
                    onClick={() => setDismissedNotifs(s => new Set([...s, ev.id]))}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary stats */}
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card stat-card-animated accent-blue">
            <div className="stat-label">📅 Total Events</div>
            <div className="stat-value">{loading ? "…" : events.length}</div>
            <div className="stat-sub">All scheduled events</div>
          </div>
          <div className="stat-card stat-card-animated accent-green">
            <div className="stat-label">⏳ Upcoming</div>
            <div className="stat-value">{loading ? "…" : upcoming.length}</div>
            <div className="stat-sub">Events from today onwards</div>
          </div>
          <div className="stat-card stat-card-animated" style={{ borderLeft: "3px solid #ef4444" }}>
            <div className="stat-label">🔔 This Week</div>
            <div className="stat-value">{loading ? "…" : upcoming.filter(e => daysUntil(e.event_date) <= 7).length}</div>
            <div className="stat-sub">Events in the next 7 days</div>
          </div>
          <div className="stat-card stat-card-animated">
            <div className="stat-label">📆 Today</div>
            <div className="stat-value">{loading ? "…" : upcoming.filter(e => daysUntil(e.event_date) === 0).length}</div>
            <div className="stat-sub">Events happening today</div>
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header">
            <h2 className="card-title">📅 Upcoming Events</h2>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{upcoming.length} event{upcoming.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="card-body no-pad">
            {loading ? (
              <div className="empty-state"><p>Loading…</p></div>
            ) : upcoming.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <h3>No upcoming events</h3>
                <p>Click "+ Add Event" to schedule one.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Event</th>
                      <th>Type</th>
                      <th>Notes</th>
                      <th>Days Left</th>
                      <th style={{ width: 80 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map(ev => {
                      const days = daysUntil(ev.event_date);
                      return (
                        <tr key={ev.id}>
                          <td style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: 13 }}>{fmtDate(ev.event_date)}</td>
                          <td><strong>{ev.title}</strong></td>
                          <td style={{ fontSize: 12 }}>{typeLabel(ev.event_type)}</td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 200 }}>
                            {ev.description ?? "—"}
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block", fontSize: 12, padding: "3px 10px",
                              borderRadius: 20, ...urgencyStyle(days)
                            }}>
                              {daysLabel(days)}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="btn btn-ghost btn-icon" title="Edit" onClick={() => openEdit(ev)}>
                                <Edit2 size={13} />
                              </button>
                              <button className="btn btn-ghost btn-icon" title="Delete"
                                style={{ color: "#ef4444" }} onClick={() => deleteEvent(ev)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Past Events (collapsible) */}
        {past.length > 0 && (
          <div className="card">
            <button
              type="button"
              onClick={() => setShowPast(p => !p)}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}
            >
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, color: "var(--text-muted)" }}>
                📁 Past Events ({past.length})
              </span>
              {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showPast && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Event</th><th>Type</th><th>Notes</th><th style={{ width: 80 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {past.map(ev => (
                        <tr key={ev.id} style={{ opacity: 0.65 }}>
                          <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDate(ev.event_date)}</td>
                          <td><span style={{ textDecoration: "line-through" }}>{ev.title}</span></td>
                          <td style={{ fontSize: 12 }}>{typeLabel(ev.event_type)}</td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{ev.description ?? "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="btn btn-ghost btn-icon" onClick={() => openEdit(ev)}><Edit2 size={13} /></button>
                              <button className="btn btn-ghost btn-icon" style={{ color: "#ef4444" }} onClick={() => deleteEvent(ev)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog.Root open={dialog.open} onOpenChange={o => !o && setDialog(p => ({ ...p, open: false }))}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="add-block-panel" aria-describedby={undefined} style={{ maxWidth: 480 }}>
            <div className="add-block-header">
              <Dialog.Title>
                <Calendar size={16} />
                {dialog.editing ? "Edit Event" : "Add New Event"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Event Title *
                </label>
                <input className="cell-input" style={{ width: "100%", direction: "ltr", textAlign: "left" }}
                  placeholder="e.g. Company Meeting, Employee Birthday…"
                  value={dialog.title}
                  onChange={e => setDialog(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Date *
                  </label>
                  <input type="date" className="cell-input" style={{ width: "100%", direction: "ltr", textAlign: "left" }}
                    value={dialog.event_date}
                    onChange={e => setDialog(p => ({ ...p, event_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Event Type
                  </label>
                  <select className="cell-input" style={{ width: "100%", direction: "ltr", textAlign: "left" }}
                    value={dialog.event_type}
                    onChange={e => setDialog(p => ({ ...p, event_type: e.target.value }))}>
                    {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Notes / Description
                </label>
                <textarea className="cell-input" style={{ width: "100%", minHeight: 80, resize: "vertical", direction: "ltr", textAlign: "left" }}
                  placeholder="Additional details, instructions, or reminders…"
                  value={dialog.description}
                  onChange={e => setDialog(p => ({ ...p, description: e.target.value }))} />
              </div>
              {dialog.error && (
                <div style={{ color: "#b91c1c", fontSize: 13, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  {dialog.error}
                </div>
              )}
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="button" className="btn btn-primary btn-sm"
                disabled={dialog.saving} onClick={saveEvent}>
                {dialog.saving ? "Saving…" : dialog.editing ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast && <div className="toast-wrapper"><div className="toast">{toast}</div></div>}
    </AppShell>
  );
}
