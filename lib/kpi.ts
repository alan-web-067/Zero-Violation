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
  inspectionPercent: number; // inspection-volume discount (0–0.10)
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

// Blocks that did more inspections than the period's average get a small % off
// their violation points, growing to the full amount for the block with the most.
// At or below average: no discount (and no penalty).
export const MAX_INSPECTION_DISCOUNT = 0.10;

export type InspectionStats = { avg: number; max: number };

export function inspectionStats(rows: Row[]): InspectionStats {
  const counts = rows.map((r) => Number(r.totalInspections || 0)).filter((n) => n > 0);
  if (counts.length === 0) return { avg: 0, max: 0 };
  return { avg: counts.reduce((a, b) => a + b, 0) / counts.length, max: Math.max(...counts) };
}

function inspectionDiscount(totalIns: number, stats?: InspectionStats): number {
  if (!stats || stats.max <= stats.avg || totalIns <= stats.avg) return 0;
  return round2(MAX_INSPECTION_DISCOUNT * (totalIns - stats.avg) / (stats.max - stats.avg));
}

// `stats` = inspectionStats() of every block in the same period. Without it the
// inspection discount is skipped — prefer applyKpiToRows(), which supplies it.
export function calcKpi(row: Row, stats?: InspectionStats): KpiResult {
  const periodMonths = Number(row.periodMonths || 1);

  const maxKpi = periodMonths * 10;
  const perfectMax = periodMonths * 2;
  const excellentMax = periodMonths * 6;
  const goodMax = periodMonths * 8.9;

  const violPoint = Number(row.violationPoints || 0);
  const cleanIns = Number(row.cleanInspections || 0);
  const totalIns = Number(row.totalInspections || 0);

  // Clean discount scales with the real clean-inspection rate: 100% clean → −30%.
  const cleanRate = totalIns > 0 ? clamp(cleanIns / totalIns, 0, 1) : 0;
  const cleanPercent = violPoint > 0 ? round2(MAX_CLEAN_DISCOUNT * cleanRate) : 0;
  const cleanDelta = violPoint * cleanPercent;
  const inspectionPercent = violPoint > 0 ? inspectionDiscount(totalIns, stats) : 0;
  const inspectionDelta = violPoint * inspectionPercent;
  const afterClean = violPoint - cleanDelta - inspectionDelta;

  const { expectedTrucks, diffPercent, staffPercent } = getStaffDetails(
    Number(row.teamMembers || 0),
    Number(row.trucks || 0),
  );

  const staffDelta = afterClean * staffPercent;
  const finalKpiRaw = afterClean + staffDelta;
  const finalKpi = round2(clamp(finalKpiRaw, 0, maxKpi));

  // Nothing entered yet — don't let an empty block rank as "Perfect".
  const noData = violPoint === 0 && totalIns === 0 && cleanIns === 0;

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
  const stats = inspectionStats(rows);
  return rows.map((r) => ({ ...r, kpi: calcKpi(r, stats) }));
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