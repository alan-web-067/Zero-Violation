// lib/changeFormat.ts
//
// RBAC FEATURE — shared "Old Value -> New Value (+/- Change)" formatting and
// up/down/flat color coding used by the HR and Accounting role dashboards
// (app/dashboard/HrDashboardClient.tsx, AccountingDashboardClient.tsx) to
// compare one metric across two periods. Pure formatting only — does not
// touch KPI math or any existing dashboard calculation.
export type ChangeDirection = "up" | "down" | "flat";

export function changeDirection(delta: number): ChangeDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

export function formatChange(oldValue: number, newValue: number): string {
  const delta = newValue - oldValue;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${oldValue} → ${newValue} (${sign}${Math.abs(delta)})`;
}

export const CHANGE_PILL_CLASS: Record<ChangeDirection, string> = {
  up: "change-pill change-up",
  down: "change-pill change-down",
  flat: "change-pill change-flat",
};

export const CHANGE_COLOR: Record<ChangeDirection, string> = {
  up: "#16a34a",
  down: "#ef4444",
  flat: "#94a3b8",
};
