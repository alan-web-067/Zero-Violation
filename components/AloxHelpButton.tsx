"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Bot, EyeOff, MessageSquare, RotateCcw, X } from "lucide-react";
import { openAloxChat } from "@/components/AloxChat";
import { ME_KEY } from "@/lib/apiClient";

type HelpSection = {
  heading: string;
  body?: string;
  list?: string[];
};

type PageHelp = {
  title: string;
  intro: string;
  sections: HelpSection[];
};

const CHAT_TIP: HelpSection = {
  heading: "Ask Alox Chat",
  body: 'Open Alox Chat from the sidebar and ask questions in plain language — like "Which block is performing best this month?" or "What does Final KPI mean?" — or pick one of the ready-made questions from the Questions Library. Alox answers using your current dashboard data.',
};

// Each entry may carry role-specific help that overrides the default for that role.
const PAGE_HELP: Array<{ match: string; help: PageHelp; roleHelp?: Partial<Record<string, PageHelp>> }> = [
  {
    match: "/dashboard",
    help: {
      title: "Dashboard",
      intro:
        "The Dashboard gives you a quick, at-a-glance view of how every block is performing for the current period.",
      sections: [
        {
          heading: "What this page shows",
          body: "The summary cards and highlights are computed from the latest report data, and update automatically whenever inspection numbers change.",
        },
        {
          heading: "Winner, Needs Improvement, Average KPI, Active Blocks",
          list: [
            "Winner — the block with the lowest Final KPI for the period (the strongest compliance record).",
            "Needs Improvement — the block with the highest Final KPI (the one that would benefit most from coaching or review).",
            "Average KPI — the average Final KPI across all active blocks; a quick read on overall fleet performance.",
            "Active Blocks — how many blocks are currently being tracked and scored.",
          ],
        },
        {
          heading: "How KPI performance is understood",
          body: "A lower Final KPI means better performance. It starts from violation points, then takes off a clean discount (30% for any block with clean inspections) and an inspection discount (from 50 inspections, 1% per 10), and finally scales by workload (trucks checked vs. 40 per team member). Blocks with nothing entered show \"No data\" and are not ranked. A rising KPI is a signal to take a closer look at that block.",
        },
      ],
    },
  },
  {
    match: "/reports",
    help: {
      title: "Reports",
      intro: "Reports let you generate and review a full breakdown of block performance for any period.",
      sections: [
        {
          heading: "Selecting Year, Month, Quarter",
          body: "Use the period selectors at the top of the page to choose a year and either a specific month or a full quarter. The report table refreshes to show that period's numbers.",
        },
        {
          heading: "Full Block Report",
          body: "This is the detailed table listing every block for the selected period — its raw inspection numbers, computed score, and rank, all in one place.",
        },
        {
          heading: "Reading the columns",
          list: [
            "Clean Inspections — inspections completed with no violations found.",
            "Total Inspections — every inspection performed in the period (clean plus those with violations).",
            "Violation Points — the total points accumulated from violations recorded during inspections.",
            "Staff Adj. / Staff % — the workload adjustment: expected trucks (40 per team member) ÷ trucks actually checked, between ×0.5 and ×2. Green means the team checked more than its target.",
            "Discounts — clean discount (30% for any block with clean inspections) plus inspection discount (from 50 inspections, 1% per 10). Hover the number for the breakdown.",
            "Final KPI — the computed compliance score for the period; lower is better.",
            "Status — Perfect (≤ 2), Excellent (≤ 6), Good (≤ 8.9), Poor, or No data when nothing was entered (per month; ×3 for quarters).",
          ],
        },
        {
          heading: "Download CSV and Print / PDF",
          body: "Download CSV exports the current report table as a spreadsheet file you can open in Excel or Google Sheets. Print / PDF opens a print-friendly version of the report so you can save or print it as a PDF.",
        },
      ],
    },
  },
  {
    match: "/analytics",
    help: {
      title: "Analytics",
      intro: "Analytics turns the report data into charts so you can spot trends and compare blocks visually.",
      sections: [
        {
          heading: "Charts and trends",
          body: "The charts plot KPI and related metrics across periods, making it easy to see whether a block's performance is improving, holding steady, or declining over time.",
        },
        {
          heading: "Block performance comparison",
          body: "Use the comparison views to see how blocks stack up against each other for the same period — useful for spotting your strongest and weakest performers at a glance.",
        },
        {
          heading: "Reading KPI changes",
          body: "Lower Final KPI is always better: a downward trend line means a block is improving, while an upward trend means violations are increasing relative to inspections and the block may need attention.",
        },
      ],
    },
  },
  {
    match: "/leaderboard",
    help: {
      title: "Leaderboard",
      intro: "The Leaderboard ranks every block by performance for the selected period.",
      sections: [
        {
          heading: "Ranking logic",
          body: "Blocks are ordered by their Final KPI score, and the ranking updates automatically whenever the underlying report numbers change.",
        },
        {
          heading: "How to read the ranking",
          list: [
            "Lowest Final KPI = best performance — these blocks sit at the top of the leaderboard.",
            "Highest Final KPI = needs improvement — these blocks sit at the bottom and are good candidates for coaching or a closer review.",
          ],
        },
        {
          heading: "Block profile",
          body: "Click any block name to open its profile: rank and Final KPI for every month of the year, times finished #1, best month, and a chart you can compare against another block.",
        },
      ],
    },
  },
  {
    match: "/admin",
    help: {
      title: "Admin / Edit",
      intro: "This is where admins enter and adjust each block's numbers for a period.",
      sections: [
        {
          heading: "Editing block numbers",
          body: "Click Edit Numbers to update each block's team members, trucks checked, clean and total inspections, and violation points for the month. The KPI preview updates as you type. Save Draft keeps it private to admins; Publish makes it visible to everyone. Use + Add Block or the pencil next to a name to add or rename blocks.",
        },
        {
          heading: "Validation rules",
          body: "The form checks your entries before saving — values must be valid, non-negative numbers, and required fields must be filled in. If something doesn't add up, you'll see an inline message explaining what to fix.",
        },
        {
          heading: "Total Inspections cannot be less than Clean Inspections",
          body: "Clean inspections are a subset of total inspections, so Total Inspections must always be greater than or equal to Clean Inspections. The system blocks saving until this is corrected.",
        },
      ],
    },
  },
  {
    match: "/blocks",
    help: {
      title: "Block profile",
      intro: "One block's whole year on a single page.",
      sections: [
        {
          heading: "What this page shows",
          list: [
            "Times #1 — how many months this block finished first.",
            "Average Final KPI and average rank across the months that have data.",
            "Best month — the month with this block's lowest Final KPI.",
            "Month by month — rank, numbers and Final KPI for every month.",
          ],
        },
        {
          heading: "Compare with another block",
          body: "Pick a block in 'Compare with' to draw it on the same chart and add its Final KPI to the table. Green means this block did better that month, red means worse. Use the arrows at the top to switch years.",
        },
      ],
    },
  },
  {
    match: "/hall-of-fame",
    help: {
      title: "Hall of Fame",
      intro: "The year's champions and awards, worked out from the monthly rankings.",
      sections: [
        {
          heading: "Team of the Year",
          body: "The block with the best average monthly rank, among blocks ranked in at least half the months. Ties go to more #1 finishes. During the current year it shows the leader so far.",
        },
        {
          heading: "Awards",
          list: [
            "👑 Most #1 finishes and 🔥 longest winning streak.",
            "📈 Most improved — biggest drop in Final KPI from the first 3 months to the last 3.",
            "💎 Most Perfect months, 🔍 most inspections and ✨ highest clean rate (at least 50 inspections).",
          ],
        },
        {
          heading: "Monthly champions",
          body: "The #1 block of every month. Click any block name to open its profile and achievements, or 📜 Certificate for a printable award.",
        },
      ],
    },
  },
  {
    match: "/scoring",
    help: {
      title: "How Scoring Works",
      intro: "The rules behind every Final KPI, with examples and a calculator.",
      sections: [
        {
          heading: "The rules",
          body: "Each month starts from the block's violation points. Clean discount: 30% off for any block with clean inspections. Inspection discount: from 50 inspections, 1% off per 10 inspections. Then the workload adjustment compares trucks checked with 40 per team member. Lower Final KPI = better.",
        },
        {
          heading: "Try it",
          body: "Type in any numbers to see exactly how the Final KPI is worked out, step by step.",
        },
      ],
    },
  },
  {
    match: "/workspace",
    help: {
      title: "My Workspace",
      intro: "Where Block Managers send number changes, and admins review them.",
      sections: [
        {
          heading: "Block Managers",
          body: "Enter the new numbers for your block and submit them. Your changes go to an admin for review and appear on the site once they are approved.",
        },
        {
          heading: "Admins",
          body: "The approval queue lists changes waiting for review. Approve to publish them, or reject to send them back.",
        },
      ],
    },
  },
  {
    match: "/users",
    help: {
      title: "User Management",
      intro: "Create accounts, change roles, reset passwords and disable access.",
      sections: [
        {
          heading: "Actions",
          list: [
            "Create User — passwords need at least 8 characters, with a letter and a number.",
            "Edit — change the role, or the block a Block Manager looks after.",
            "Reset Password — sets a new password and also unlocks a locked account.",
            "Disable / Enable — a disabled account cannot sign in.",
          ],
        },
        {
          heading: "Safety rules",
          list: [
            "After 5 wrong passwords in a row an account is locked for 15 minutes.",
            "You can't disable or demote your own account, or the last active admin.",
            "Only a Super Admin can create or change Super Admin accounts.",
          ],
        },
      ],
    },
  },
];

const DEFAULT_HELP: PageHelp = {
  title: "Alox Assistant",
  intro: "Alox is here to help you understand any page in Zero Violations.",
  sections: [
    {
      heading: "Getting around",
      body: "Use the sidebar to jump between Dashboard, Leaderboard, Analytics, Reports, Hall of Fame, How Scoring Works, My Workspace, Admin / Edit and User Management. Open this help panel from any page for guidance on what you're looking at.",
    },
  ],
};

function getHelpForPath(pathname: string, role: string | null): PageHelp {
  const found = PAGE_HELP.find(
    (entry) => pathname === entry.match || pathname.startsWith(entry.match + "/")
  );
  if (!found) return DEFAULT_HELP;
  if (role && found.roleHelp?.[role]) return found.roleHelp[role]!;
  return found.help;
}

// ---- Drag-to-reposition ----
// Position is persisted as the button's top-left corner in viewport pixels.
// Defaults to the bottom-right corner (matching the static CSS placement)
// so there's nothing to migrate for users who never move it.
const FAB_POSITION_KEY = "zv_alox_fab_pos";
const DRAG_THRESHOLD_PX = 6;

type Point = { x: number; y: number };

function fabMetrics() {
  const mobile = typeof window !== "undefined" && window.innerWidth <= 680;
  return mobile ? { size: 50, padding: 14 } : { size: 60, padding: 28 };
}

function clampToViewport(point: Point): Point {
  if (typeof window === "undefined") return point;
  const { size, padding } = fabMetrics();
  const maxX = Math.max(padding, window.innerWidth - size - padding);
  const maxY = Math.max(padding, window.innerHeight - size - padding);
  return {
    x: Math.min(Math.max(point.x, padding), maxX),
    y: Math.min(Math.max(point.y, padding), maxY),
  };
}

function defaultFabPosition(): Point {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const { size, padding } = fabMetrics();
  return { x: window.innerWidth - size - padding, y: window.innerHeight - size - padding };
}

function readSavedFabPosition(): Point | null {
  try {
    const raw = localStorage.getItem(FAB_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number" && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore malformed/unavailable storage
  }
  return null;
}

// ---- Show / hide ----
// Hidden state is shared with the "Alox Assistant" toggle in the admin
// profile menu (Settings → Alox Assistant → Show Alox). Both sides read the
// same localStorage key and broadcast a same-tab CustomEvent so either one
// can flip the other live without a page refresh (the native `storage` event
// only fires across tabs, not within the tab that made the change).
export const ALOX_HIDDEN_KEY = "zv_alox_hidden";
export const ALOX_VISIBILITY_EVENT = "zv-alox-visibility-change";

export function isAloxHidden(): boolean {
  try {
    return localStorage.getItem(ALOX_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAloxHidden(hidden: boolean) {
  try {
    localStorage.setItem(ALOX_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    // ignore unavailable storage
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<{ hidden: boolean }>(ALOX_VISIBILITY_EVENT, { detail: { hidden } }));
  }
}

const CONTEXT_MENU_WIDTH = 184;
const CONTEXT_MENU_HEIGHT = 220;
const CONTEXT_MENU_MARGIN = 8;

export default function AloxHelpButton() {
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menu, setMenu] = useState<Point | null>(null);

  // Derived from state — intentionally after all hooks so userRole is always initialized
  const help = getHelpForPath(pathname || "", userRole);
  const sections = [...help.sections, CHAT_TIP];

  const positionRef = useRef<Point>({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerType: "mouse" | "touch";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  // Drag math is shared between mouse and touch — both just feed in a
  // viewport point and let this clamp + threshold logic do the rest.
  const trackPointer = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      didDragRef.current = true;
      setIsDragging(true);
    }
    if (drag.moved) {
      const next = clampToViewport({ x: drag.originX + dx, y: drag.originY + dy });
      positionRef.current = next;
      setPosition(next);
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    trackPointer(e.clientX, e.clientY);
  }, [trackPointer]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    // Stop the page from scrolling once a drag is underway — this is the
    // touch-equivalent of the mouse simply moving outside the button.
    if (dragRef.current?.moved) e.preventDefault();
    trackPointer(touch.clientX, touch.clientY);
  }, [trackPointer]);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", endDrag);
    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", endDrag);
    window.removeEventListener("touchcancel", endDrag);

    if (drag.moved) {
      try {
        localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(positionRef.current));
      } catch {
        // ignore unavailable storage — position simply won't persist
      }
    }
    dragRef.current = null;
    setIsDragging(false);
  }, [handleMouseMove, handleTouchMove]);

  const beginDrag = useCallback((pointerType: "mouse" | "touch", clientX: number, clientY: number) => {
    didDragRef.current = false;
    dragRef.current = {
      pointerType,
      startX: clientX,
      startY: clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
      moved: false,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !mounted) return;
    beginDrag("mouse", e.clientX, e.clientY);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", endDrag);
  }, [mounted, beginDrag, handleMouseMove, endDrag]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    const touch = e.touches[0];
    if (!touch || !mounted) return;
    beginDrag("touch", touch.clientX, touch.clientY);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("touchcancel", endDrag);
  }, [mounted, beginDrag, handleTouchMove, endDrag]);

  // Radix composes the trigger's own onClick before its internal
  // open-toggle handler and respects preventDefault — so swallowing the
  // click here (when a drag just happened) stops the help panel from
  // opening without having to fight Dialog's state machine.
  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (didDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
    }
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!mounted) return;
    const x = Math.min(
      Math.max(CONTEXT_MENU_MARGIN, e.clientX),
      window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN
    );
    const y = Math.min(
      Math.max(CONTEXT_MENU_MARGIN, e.clientY),
      window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN
    );
    setMenu({ x, y });
  }, [mounted]);

  const menuOpenAlox = useCallback(() => {
    setDialogOpen(true);
    closeMenu();
  }, [closeMenu]);

  const menuChatAlox = useCallback(() => {
    openAloxChat();
    closeMenu();
  }, [closeMenu]);

  const menuHideAlox = useCallback(() => {
    setAloxHidden(true);
    closeMenu();
  }, [closeMenu]);

  const menuResetPosition = useCallback(() => {
    const next = clampToViewport(defaultFabPosition());
    positionRef.current = next;
    setPosition(next);
    try {
      localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(next));
    } catch {
      // ignore unavailable storage
    }
    closeMenu();
  }, [closeMenu]);

  // Mount-time setup: load the saved position (or fall back to the default
  // bottom-right corner), load the hidden flag, then mark mounted so the
  // inline left/top style only ever appears on the client — matching the
  // `mounted`-gate pattern used elsewhere to avoid hydration mismatches.
  useEffect(() => {
    const initial = clampToViewport(readSavedFabPosition() ?? defaultFabPosition());
    positionRef.current = initial;
    setPosition(initial);
    setHidden(isAloxHidden());
    // Read cached user role so help can be role-aware without an extra API call
    try {
      const cached = localStorage.getItem(ME_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setUserRole(parsed?.role ?? null);
      }
    } catch { /* ignore parse errors */ }
    setMounted(true);

    function onResize() {
      const next = clampToViewport(positionRef.current);
      positionRef.current = next;
      setPosition(next);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Stay in sync with the "Show Alox" toggle in the admin profile menu —
  // either side can flip visibility live, in the same tab, via this event.
  useEffect(() => {
    function onVisibilityChange(e: Event) {
      const detail = (e as CustomEvent<{ hidden: boolean }>).detail;
      if (detail) setHidden(detail.hidden);
    }
    window.addEventListener(ALOX_VISIBILITY_EVENT, onVisibilityChange as EventListener);
    return () => window.removeEventListener(ALOX_VISIBILITY_EVENT, onVisibilityChange as EventListener);
  }, []);

  // Dismiss the right-click menu on outside click, Escape, or layout shifts.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menu, closeMenu]);

  // Belt-and-suspenders cleanup if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchcancel", endDrag);
    };
  }, [handleMouseMove, handleTouchMove, endDrag]);

  // Press "A" to restore Alox after hiding — only active when hidden, and
  // skipped when the user is typing in a form field so it doesn't interfere.
  useEffect(() => {
    if (!hidden) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) return;
      if (e.key === "a" || e.key === "A") setAloxHidden(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hidden]);

  if (hidden) return null;

  const fabStyle: React.CSSProperties | undefined = mounted
    ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="alox-help-fab"
                aria-label="Ask Alox for help on this page (drag to move, right-click for options)"
                style={fabStyle}
                data-dragging={isDragging || undefined}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onContextMenu={handleContextMenu}
                onClick={handleClick}
              >
                <span className="alox-help-fab-glow" aria-hidden />
                <Image
                  src="/alox/alox-neutral.png"
                  alt=""
                  width={48}
                  height={48}
                  className="alox-help-fab-img"
                  priority={false}
                  draggable={false}
                />
              </button>
            </Dialog.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="tooltip-content" side="left" sideOffset={12}>
              Ask Alox
              <Tooltip.Arrow className="tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      {mounted && menu && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="alox-context-menu"
          role="menu"
          aria-label="Alox options"
          style={{ left: menu.x, top: menu.y }}
        >
          <button type="button" role="menuitem" onClick={menuOpenAlox}>
            <Bot size={14} />
            <span>Open Alox</span>
          </button>
          <button type="button" role="menuitem" onClick={menuChatAlox}>
            <MessageSquare size={14} />
            <span>Chat Alox</span>
          </button>
          <button type="button" role="menuitem" onClick={menuHideAlox}>
            <EyeOff size={14} />
            <span>Hide Alox</span>
          </button>
          <button type="button" role="menuitem" onClick={menuResetPosition}>
            <RotateCcw size={14} />
            <span>Reset Position</span>
          </button>
          <button type="button" role="menuitem" onClick={closeMenu}>
            <X size={14} />
            <span>Close</span>
          </button>
        </div>,
        document.body
      )}

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="add-block-panel alox-help-panel" aria-describedby={undefined}>
          <div className="add-block-header alox-help-header">
            <Dialog.Title className="alox-help-title">
              <Bot size={17} strokeWidth={2} />
              Alox — {help.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close help">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <div className="add-block-body alox-help-body">
            <p className="alox-help-intro">{help.intro}</p>
            {sections.map((section) => (
              <div className="alox-help-section" key={section.heading}>
                <h4>{section.heading}</h4>
                {section.body && <p>{section.body}</p>}
                {section.list && (
                  <ul>
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
