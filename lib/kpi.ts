// lib/kpi.ts — single source of truth for all KPI logic
// Monthly max KPI = 10
// Quarterly max KPI = 30

export type Row = {
  id: string;
  name: string;
  teamMembers: number;
  trucks: number;
  cleanInspections: number;
  totalInspections: number;
  violationPoints: number;
  periodMonths?: number;
};

export type KpiResult = {
  violPoint: number;
  cleanPercent: number;
  cleanDelta: number;
  afterClean: number;
  expectedTrucks: number;
  diffPercent: number;
  staffPercent: number;
  staffDelta: number;
  finalKpi: number;
  status: string;
};

export type RowWithKpi = Row & { kpi: KpiResult };

// A block's identity/metadata as stored in the shared registry (lib/db.ts `blocks` table,
// served via /api/blocks). This is the single shared source for "which blocks exist" —
// every page (Reports, Dashboard, Analytics, Leaderboard, Admin) builds its rows from it.
export type BlockDef = {
  id: string;
  name: string;
  teamMembers: number;
  trucks: number;
  startingKpi: number;
  notes: string;
  status: "active" | "inactive";
  sortOrder: number;
};

export const MONTHS = [
  { n: 1, name: "January" },
  { n: 2, name: "February" },
  { n: 3, name: "March" },
  { n: 4, name: "April" },
  { n: 5, name: "May" },
  { n: 6, name: "June" },
  { n: 7, name: "July" },
  { n: 8, name: "August" },
  { n: 9, name: "September" },
  { n: 10, name: "October" },
  { n: 11, name: "November" },
  { n: 12, name: "December" },
];

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Standard target: 40 trucks per employee.
// Staff Performance % = (actual - expected) / expected × 100
// KPI Adjustment    % = −staffPerformance%
//   Over target  (+diff%) → KPI decreases (negative adjustment = reward)
//   Under target (−diff%) → KPI increases (positive adjustment = penalty)
// No fixed buckets — the adjustment is fully proportional to real performance.
export function getStaffDetails(
  teamMembers: number,
  trucksChecked: number,
): { expectedTrucks: number; diffPercent: number; staffPercent: number } {
  const team   = Math.round(Number(teamMembers   || 0));
  const actual = Number(trucksChecked || 0);
  if (!team) return { expectedTrucks: 0, diffPercent: 0, staffPercent: 0 };

  const expectedTrucks = team * 40;
  const diffPercent = actual
    ? round2(((actual - expectedTrucks) / expectedTrucks) * 100)
    : 0;

  // staffPercent is the KPI multiplier applied to violationPoints.
  // Inverted: overperformance (positive diff) reduces KPI; underperformance raises it.
  const staffPercent = actual ? round2(-diffPercent / 100) : 0;

  return { expectedTrucks, diffPercent, staffPercent };
}

export function getStaffPercent(teamMembers: number, trucksChecked: number): number {
  return getStaffDetails(teamMembers, trucksChecked).staffPercent;
}

export function calcKpi(row: Row): KpiResult {
  const periodMonths = Number(row.periodMonths || 1);

  const maxKpi = periodMonths * 10;
  const perfectMax = periodMonths * 2;
  const excellentMax = periodMonths * 6;
  const goodMax = periodMonths * 8.9;

  const violPoint = Number(row.violationPoints || 0);

  const cleanPercent = violPoint > 0 ? 0.30 : 0;
  const cleanDelta = violPoint * cleanPercent;
  const afterClean = violPoint - cleanDelta;

  const { expectedTrucks, diffPercent, staffPercent } = getStaffDetails(
    Number(row.teamMembers || 0),
    Number(row.trucks || 0),
  );

  const staffDelta = violPoint * staffPercent;
  const finalKpiRaw = afterClean + staffDelta;
  const finalKpi = round2(clamp(finalKpiRaw, 0, maxKpi));

  let status = "Poor";

  if (finalKpi <= perfectMax) status = "Perfect";
  else if (finalKpi <= excellentMax) status = "Excellent";
  else if (finalKpi <= goodMax) status = "Good";

  return {
    violPoint: round2(violPoint),
    cleanPercent,
    cleanDelta: round2(cleanDelta),
    afterClean: round2(afterClean),
    expectedTrucks,
    diffPercent,
    staffPercent,
    staffDelta: round2(staffDelta),
    finalKpi,
    status,
  };
}

// Builds the baseline rows for a period from the shared block registry.
// A block's registry teamMembers/trucks act as its starting reference values —
// they show up until real per-period numbers are entered (and saved) for that block,
// at which point mergeWithBase() prefers the saved data.
export function makeBaseBlocks(defs: BlockDef[]): Row[] {
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    teamMembers: d.teamMembers,
    trucks: d.trucks,
    cleanInspections: 0,
    totalInspections: 0,
    violationPoints: 0,
    periodMonths: 1,
  }));
}

export function mergeWithBase(data: Row[] | null, defs: BlockDef[]): Row[] {
  const base = makeBaseBlocks(defs);
  if (!data) return base;
  const byId = new Map(data.map((x) => [String(x.id), x]));
  const byName = new Map(data.map((x) => [x.name, x]));
  // Match by id first (stable across renames), fall back to name (legacy saved data).
  return base.map((def) => byId.get(def.id) || byName.get(def.name) || def);
}

export function fmtPct(p: number): string {
  const v = Math.round(p * 100);
  if (v === 0) return "0%";
  return v > 0 ? `+${v}%` : `${v}%`;
}

export function monthsForQuarter(q: number): number[] {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

export function combineQuarterRows(lists: Row[][], defs: BlockDef[]): Row[] {
  const base = makeBaseBlocks(defs);

  return base.map((def) => {
    const r3 = lists.map((list) => list.find((r) => String(r.id) === def.id) || list.find((r) => r.name === def.name) || def);

    const teamVals = r3.map((r) => Number(r.teamMembers || 0)).filter((v) => v > 0);
    const truckVals = r3.map((r) => Number(r.trucks || 0)).filter((v) => v > 0);

    const teamAvg = teamVals.length
      ? Math.round(teamVals.reduce((a, b) => a + b, 0) / teamVals.length)
      : 0;

    const truckAvg = truckVals.length
      ? Math.round(truckVals.reduce((a, b) => a + b, 0) / truckVals.length)
      : 0;

    const cleanSum = r3.reduce((s, r) => s + Number(r.cleanInspections || 0), 0);
    const totalSum = r3.reduce((s, r) => s + Number(r.totalInspections || 0), 0);
    const violSum = r3.reduce((s, r) => s + Number(r.violationPoints || 0), 0);

    return {
      ...def,
      teamMembers: teamAvg,
      trucks: truckAvg,
      cleanInspections: cleanSum,
      totalInspections: totalSum,
      violationPoints: violSum,
      periodMonths: 3,
    };
  });
}

export function applyKpiToRows(rows: Row[]): RowWithKpi[] {
  return rows.map((r) => ({ ...r, kpi: calcKpi(r) }));
}

export function sortByKpi(rows: RowWithKpi[]): RowWithKpi[] {
  return [...rows].sort((a, b) => a.kpi.finalKpi - b.kpi.finalKpi);
}