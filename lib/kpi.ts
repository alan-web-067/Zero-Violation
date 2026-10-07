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
  cleanRate: number;      // clean ÷ total inspections (0–1)
  cleanPercent: number;   // discount applied to violation points (0–0.30)
  cleanDelta: number;
  inspectionPercent: number; // inspection-volume discount (1% per 10 inspections, from 50)
  inspectionDelta: number;
  afterClean: number;        // violation points after clean + inspection discounts
  expectedTrucks: number;
  diffPercent: number;
  staffPercent: number;
  staffDelta: number;
  finalKpi: number;
  status: string;
  noData: boolean;        // nothing entered for the period — excluded from ranking
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
  targetKpi?: number | null;   // monthly goal: Final KPI at or below this (quarters ×3)
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
// Violation points are scaled by workload so busy and quiet teams compete fairly:
//   workload factor = expected trucks ÷ actual trucks (capped to 0.5–2)
//   2× the target → violations count half;  half the target → violations count double.
// staffPercent = factor − 1  (negative = reward, positive = penalty).
export const TRUCKS_PER_MEMBER = 40;
const WORKLOAD_FACTOR_MIN = 0.5;
const WORKLOAD_FACTOR_MAX = 2;

export function getStaffDetails(
  teamMembers: number,
  trucksChecked: number,
): { expectedTrucks: number; diffPercent: number; staffPercent: number } {
  const team   = Math.round(Number(teamMembers   || 0));
  const actual = Number(trucksChecked || 0);
  if (!team) return { expectedTrucks: 0, diffPercent: 0, staffPercent: 0 };

  const expectedTrucks = team * TRUCKS_PER_MEMBER;
  if (!actual) return { expectedTrucks, diffPercent: 0, staffPercent: 0 };

  const diffPercent = round2(((actual - expectedTrucks) / expectedTrucks) * 100);
  const factor = clamp(expectedTrucks / actual, WORKLOAD_FACTOR_MIN, WORKLOAD_FACTOR_MAX);
  const staffPercent = round2(factor - 1);

  return { expectedTrucks, diffPercent, staffPercent };
}

export function getStaffPercent(teamMembers: number, trucksChecked: number): number {
  return getStaffDetails(teamMembers, trucksChecked).staffPercent;
}

const MAX_CLEAN_DISCOUNT = 0.30;

// More inspections → bigger % off the violation points. No discount below the
// minimum; above it, 1% per 10 inspections with no upper limit (50 → 5%, 300 → 30%).
// Clean + inspection discounts together are capped at 100% so points never go negative.
export const MIN_INSPECTIONS_FOR_DISCOUNT = 50;
export const INSPECTION_DISCOUNT_PER_INSPECTION = 0.001;

function inspectionDiscount(totalIns: number): number {
  if (totalIns < MIN_INSPECTIONS_FOR_DISCOUNT) return 0;
  return round2(totalIns * INSPECTION_DISCOUNT_PER_INSPECTION);
}

export function calcKpi(row: Row): KpiResult {
  const periodMonths = Number(row.periodMonths || 1);

  const maxKpi = periodMonths * 10;
  const perfectMax = periodMonths * 2;
  const excellentMax = periodMonths * 6;
  const goodMax = periodMonths * 8.9;

  const violPoint = Number(row.violationPoints || 0);
  const cleanIns = Number(row.cleanInspections || 0);
  const totalIns = Number(row.totalInspections || 0);

  // Clean discount: a flat −30% for any block with clean inspections. More inspections
  // are rewarded separately by the inspection discount.
  const cleanRate = totalIns > 0 ? clamp(cleanIns / totalIns, 0, 1) : 0;
  const cleanPercent = violPoint > 0 ? (cleanIns > 0 ? MAX_CLEAN_DISCOUNT : 0) : 0;
  const cleanDelta = violPoint * cleanPercent;
  // Quarter rows sum 3 months of inspections — use the monthly average.
  const inspectionPercent = violPoint > 0
    ? Math.min(inspectionDiscount(totalIns / periodMonths), 1 - cleanPercent)
    : 0;
  const inspectionDelta = violPoint * inspectionPercent;
  const afterClean = violPoint - cleanDelta - inspectionDelta;

  const noData = violPoint === 0 && totalIns === 0 && cleanIns === 0;

  // Blocks with nothing entered get no workload adjustment (it would only be noise).
  const { expectedTrucks, diffPercent, staffPercent } = noData
    ? { expectedTrucks: 0, diffPercent: 0, staffPercent: 0 }
    : getStaffDetails(Number(row.teamMembers || 0), Number(row.trucks || 0));

  const staffDelta = afterClean * staffPercent;
  const finalKpiRaw = afterClean + staffDelta;
  const finalKpi = round2(clamp(finalKpiRaw, 0, maxKpi));

  // Nothing entered yet (noData) — don't let an empty block rank as "Perfect".
  let status = "Poor";

  if (noData) status = "No data";
  else if (finalKpi <= perfectMax) status = "Perfect";
  else if (finalKpi <= excellentMax) status = "Excellent";
  else if (finalKpi <= goodMax) status = "Good";

  return {
    violPoint: round2(violPoint),
    cleanRate: round2(cleanRate),
    cleanPercent,
    cleanDelta: round2(cleanDelta),
    inspectionPercent,
    inspectionDelta: round2(inspectionDelta),
    afterClean: round2(afterClean),
    expectedTrucks,
    diffPercent,
    staffPercent,
    staffDelta: round2(staffDelta),
    finalKpi,
    status,
    noData,
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
  const byId = new Map((data ?? []).map((x) => [String(x.id), x]));
  const byName = new Map((data ?? []).map((x) => [x.name, x]));
  // Match by id first (stable across renames), fall back to name (legacy saved data).
  // Inactive (deleted) blocks only appear in periods where they have saved data.
  return makeBaseBlocks(defs).flatMap((def, i) => {
    const saved = byId.get(def.id) || byName.get(def.name);
    if (defs[i].status === "inactive" && !saved) return [];
    // Saved rows keep their numbers but always show the block's current name.
    return [saved ? { ...saved, id: def.id, name: def.name } : def];
  });
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
  // `lists` come from mergeWithBase, so a block missing from every month is inactive with no data.
  const base = makeBaseBlocks(defs).filter((def) =>
    lists.some((list) => list.some((r) => String(r.id) === def.id))
  );

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

function trucksPerMember(r: Row): number {
  return r.teamMembers > 0 ? Number(r.trucks || 0) / r.teamMembers : 0;
}

// Best first: lowest Final KPI. Ties → higher clean rate → more inspections → more trucks per member.
// Blocks with no data always sort last.
export function sortByKpi(rows: RowWithKpi[]): RowWithKpi[] {
  return [...rows].sort((a, b) =>
    Number(a.kpi.noData) - Number(b.kpi.noData) ||
    a.kpi.finalKpi - b.kpi.finalKpi ||
    b.kpi.cleanRate - a.kpi.cleanRate ||
    Number(b.totalInspections || 0) - Number(a.totalInspections || 0) ||
    trucksPerMember(b) - trucksPerMember(a) ||
    a.name.localeCompare(b.name)
  );
}

// Only blocks with data for the period — use for winner / worst / averages.
export function rankedOnly(rows: RowWithKpi[]): RowWithKpi[] {
  return rows.filter((r) => !r.kpi.noData);
}

// Short human-readable reasons a block is ranked where it is.
export function kpiReasons(r: RowWithKpi): string[] {
  const out = [`${r.kpi.violPoint} violation point${r.kpi.violPoint === 1 ? "" : "s"}`];
  if (r.totalInspections > 0) out.push(`${r.totalInspections} inspections, ${Math.round(r.kpi.cleanRate * 100)}% clean`);
  if (r.kpi.inspectionPercent > 0) out.push(`−${Math.round(r.kpi.inspectionPercent * 100)}% inspection bonus`);
  if (r.teamMembers > 0 && r.trucks > 0) {
    out.push(`${Math.round(trucksPerMember(r))} trucks/member (target ${TRUCKS_PER_MEMBER})`);
  }
  return out;
}

// ── Input validation (shared by the API routes) ────────────────────────────
export const MAX_FIELD_VALUE = 1_000_000;
const ROW_NUMBER_FIELDS = ["teamMembers", "trucks", "cleanInspections", "totalInspections", "violationPoints"] as const;

export function validPeriod(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

// Returns an error message, or null when the value is a valid count/score.
export function fieldValueError(field: string, value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FIELD_VALUE) return `"${field}" must be between 0 and ${MAX_FIELD_VALUE}`;
  return null;
}

// Validates a full month payload (array of block rows) saved by Admin / Edit.
export function monthRowsError(data: unknown): string | null {
  if (!Array.isArray(data)) return "Data must be a list of blocks";
  if (data.length > 500) return "Too many blocks";
  for (const r of data as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || !r.id || typeof r.name !== "string") return "Each block needs an id and name";
    for (const f of ROW_NUMBER_FIELDS) {
      const err = fieldValueError(f, r[f] ?? 0);
      if (err) return `${r.name}: ${err}`;
    }
    if (Number(r.cleanInspections || 0) > Number(r.totalInspections || 0)) {
      return `${r.name}: clean inspections cannot exceed total inspections`;
    }
  }
  return null;
}

// Did a block reach its goal? null = no goal set, or no data to judge.
// The goal is per month, so a quarter's goal is three times as large (like the status limits).
export function goalMet(row: RowWithKpi, target: number | null | undefined): boolean | null {
  if (target === null || target === undefined || row.kpi.noData) return null;
  return row.kpi.finalKpi <= target * Number(row.periodMonths || 1);
}
