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
          body: "A lower Final KPI means better performance — fewer violations relative to the number of inspections performed, after any staff adjustments are applied. A rising KPI is a signal to take a closer look at that block.",
        },
      ],
    },
    roleHelp: {
      hr: {
        title: "HR Dashboard",
        intro:
          "Your HR Dashboard shows the total employee headcount across all company blocks, and how it has changed month over month.",
        sections: [
          {
            heading: "What this page shows",
            body: "The headline cards show total employees company-wide, how many were added this month, how many departed, and the net change. The block list below breaks this down per block with before/after comparisons.",
          },
          {
            heading: "Navigating to HR tools",
            list: [
              "Members — add, edit, and manage all employee records, upload profile photos, and submit monthly reports.",
              "Upcoming Events — schedule and track company events, deadlines, and birthdays. Events within 7 days also appear as notifications here on your dashboard.",
            ],
          },
          {
            heading: "Monthly trend chart",
            body: "The line chart shows total employee count for each month of the year, so you can see hiring trends at a glance.",
          },
        ],
      },
      accounting: {
        title: "Accounting Dashboard",
        intro:
          "Your Accounting Dashboard shows the total truck count per block and how it changes each period.",
        sections: [
          {
            heading: "What this page shows",
            body: "The headline cards show total trucks company-wide, trucks added this month, trucks removed, and the net fleet change. The block list shows a before/after comparison for each block.",
          },
          {
            heading: "Navigating to Accounting tools",
            list: [
              "Members — view all employees added by HR and manage their payroll. Search by name or employee ID to open a payroll form.",
              "Use the period selector to switch between months and years for historical data.",
            ],
          },
          {
            heading: "Fleet trend chart",
            body: "The line chart shows total truck count for each month of the year. The bar chart shows per-block changes for the selected period.",
          },
        ],
      },
    },
  },
  {
    match: "/members",
    help: {
      title: "Members",
      intro:
        "The Members page is the shared employee registry used by both HR and Accounting.",
      sections: [
        {
          heading: "HR — Managing employees",
          body: "HR can add, edit, and delete employee records. Click '+ Add Member' to create a new employee, fill in their details, assign them to a block, and optionally upload a profile photo.",
        },
        {
          heading: "Accounting — Payroll management",
          body: "Accounting can view all employees and click 'Payroll' on any row to enter salary, payment type, bonus, deductions, and notes for the selected period.",
        },
        {
          heading: "Monthly Members Report",
          body: "HR submits a monthly snapshot of member data for approval. The Main Account (admin) can approve or reject it. Rejected reports can be re-submitted after corrections.",
        },
      ],
    },
    roleHelp: {
      hr: {
        title: "Members — HR",
        intro:
          "On this page you manage all employee records for the company. Add employees, assign them to blocks, upload photos, and submit monthly reports for approval.",
        sections: [
          {
            heading: "Adding an employee",
            list: [
              "Click '+ Add Member' in the top-right corner.",
              "Enter first name, last name, date of birth, date first joined ALGO GROUP, employee ID, and their assigned block.",
              "Optionally upload a profile photo (PNG, JPG, or WebP — max 3 MB).",
              "Click 'Add Member' to save. No approval is needed — the employee is saved immediately.",
            ],
          },
          {
            heading: "Editing and deleting employees",
            body: "Click the pencil icon on any row to edit that employee's information. Click the trash icon to remove them. Both actions take effect immediately.",
          },
          {
            heading: "Moving employees between blocks",
            body: "Open the edit form for any employee and change the 'Assigned Block' dropdown. Save to move them to the new block — they will appear under the new block accordion on the next load.",
          },
          {
            heading: "Monthly Members Report",
            body: "At the bottom of the Members tab, select a year and month, then click 'Submit Monthly Members'. The report is sent to the Main Account for approval. You can check its status (Pending, Approved, or Rejected) in the Reports tab. If rejected, fix any issues and click 'Re-Submit'.",
          },
        ],
      },
      accounting: {
        title: "Members — Accounting",
        intro:
          "On this page you can view all employees created by HR, search by name or ID, and manage their payroll for any period.",
        sections: [
          {
            heading: "Searching for an employee",
            list: [
              "Type a first name, last name, or employee ID into the search box.",
              "Results appear instantly as a flat list — no need to browse blocks.",
              "If nothing matches, you will see 'No employee found. Try a different name or ID.'",
            ],
          },
          {
            heading: "Opening payroll",
            body: "Click the 'Payroll' button on any employee row to open the payroll form. Select the correct year and month with the period selectors before opening payroll to pre-load any existing entry for that period.",
          },
          {
            heading: "Payroll fields",
            list: [
              "Salary — the base pay amount for the period.",
              "Payment Type — Hourly, Salary, Contract, or Per Diem.",
              "Bonus — any bonus amount for the period.",
              "Deduction — any deduction amount for the period.",
              "Notes — free-form notes about this payroll entry.",
            ],
          },
          {
            heading: "What Accounting cannot change",
            body: "Employee name, date of birth, date joined, employee ID, and block assignment are all HR-managed fields. Accounting can only view them, not edit them.",
          },
        ],
      },
    },
  },
  {
    match: "/events",
    help: {
      title: "Upcoming Events",
      intro:
        "Upcoming Events is where you schedule and track company events, deadlines, birthdays, and meetings — with automatic notifications when an event is close.",
      sections: [
        {
          heading: "Adding an event",
          list: [
            "Click '+ Add Event' in the top-right corner.",
            "Enter an event title, select the date, choose an event type (e.g. Birthday, Meeting, Deadline, Holiday), and optionally add notes.",
            "Click 'Create Event' to save.",
          ],
        },
        {
          heading: "Editing and deleting events",
          body: "Click the pencil icon on any row to update an event's details. Click the trash icon to permanently delete it. Past events appear in a collapsed section at the bottom — click 'Past Events' to expand it.",
        },
        {
          heading: "Event notifications",
          list: [
            "🔴 Red — event is today or tomorrow: urgent, act now.",
            "🟡 Yellow — 2–3 days away: needs attention soon.",
            "🔵 Blue — within 7 days: coming up this week.",
            "Events also appear as notification banners on your HR Dashboard after login.",
          ],
        },
        {
          heading: "Dismissing a notification",
          body: "Click the ✕ on any notification banner to dismiss it for the current session. It will reappear after your next login.",
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
            "Staff Adjustment — a manual adjustment an admin can apply to account for context the raw numbers don't capture.",
            "Final KPI — the computed compliance score for the period; lower is better.",
            "Status — a quick label summarizing how the block is performing (e.g., Excellent, Good, Needs Improvement).",
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
          body: "Open a block in edit mode to update its team count, truck count, inspection numbers, violation points, and any staff adjustment for the period. Save your changes and the KPI and reports recalculate automatically.",
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
    match: "/lookup",
    help: {
      title: "Company Lookup",
      intro: "Company Lookup lets you search for a company or block and review its information in one place.",
      sections: [
        {
          heading: "How to search",
          body: "Type a company or block name (or part of it) into the search field. Matching results appear as you type — select one to see its details.",
        },
        {
          heading: "What you can check",
          body: "Once you select a result, you can review its general information along with its recent inspection activity and KPI history, giving you a full picture of how it has been performing.",
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
      body: "Use the sidebar to jump between Dashboard, Leaderboard, Analytics, Reports, Admin / Edit, and Company Lookup. Open this help panel from any page for guidance on what you're looking at.",
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
