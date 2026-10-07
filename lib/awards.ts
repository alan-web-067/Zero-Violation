// Year awards and block achievements — built from the same monthly ranking as
// the Leaderboard (calcKpi + sortByKpi + rankedOnly), so they always agree.
import { Row, RowWithKpi, applyKpiToRows, sortByKpi, rankedOnly } from "@/lib/kpi";

export type RankedMonth = {
  month: number;          // 1..12
  ranked: RowWithKpi[];   // ranked blocks, best first (empty = no data that month)
};

export function rankYear(monthRows: Row[][]): RankedMonth[] {
  return monthRows.map((rows, i) => ({ month: i + 1, ranked: rankedOnly(sortByKpi(applyKpiToRows(rows))) }));
}

export type BlockYear = {
  id: string;
  name: string;
  months: number;          // months ranked
  wins: number;            // #1 finishes
  avgRank: number;
  avgKpi: number;
  bestStreak: number;      // longest run of consecutive #1 months
  perfectMonths: number;
  inspections: number;
  clean: number;
  improvement: number | null; // avg KPI of first 3 ranked months − last 3 (positive = improved)
};

export function blockYears(year: RankedMonth[]): BlockYear[] {
  const map = new Map<string, BlockYear & { kpis: number[]; ranks: number[]; streak: number; lastWinMonth: number }>();
  for (const { month, ranked } of year) {
    ranked.forEach((r, idx) => {
      let b = map.get(r.id);
      if (!b) {
        b = {
          id: r.id, name: r.name, months: 0, wins: 0, avgRank: 0, avgKpi: 0, bestStreak: 0,
          perfectMonths: 0, inspections: 0, clean: 0, improvement: null,
          kpis: [], ranks: [], streak: 0, lastWinMonth: -1,
        };
        map.set(r.id, b);
      }
      b.name = r.name;
      b.months++;
      b.kpis.push(r.kpi.finalKpi);
      b.ranks.push(idx + 1);
      b.inspections += Number(r.totalInspections || 0);
      b.clean += Number(r.cleanInspections || 0);
      if (r.kpi.status === "Perfect") b.perfectMonths++;
      if (idx === 0) {
        b.wins++;
        b.streak = b.lastWinMonth === month - 1 ? b.streak + 1 : 1;
        b.lastWinMonth = month;
        b.bestStreak = Math.max(b.bestStreak, b.streak);
      }
    });
  }
  return [...map.values()].map(({ kpis, ranks, streak: _s, lastWinMonth: _l, ...b }) => {
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    return {
      ...b,
      avgRank: avg(ranks),
      avgKpi: avg(kpis),
      improvement: kpis.length >= 4 ? avg(kpis.slice(0, 3)) - avg(kpis.slice(-3)) : null,
    };
  });
}

export type Award = { key: string; icon: string; title: string; winner: BlockYear; value: string; why: string };

const MIN_CLEAN_RATE_INSPECTIONS = 50;

// Each award goes to one block; ties fall back to the lower average rank.
export function yearAwards(year: RankedMonth[]): { teamOfYear: BlockYear | null; awards: Award[]; monthsWithData: number } {
  const blocks = blockYears(year);
  const monthsWithData = year.filter((m) => m.ranked.length > 0).length;
  if (!blocks.length) return { teamOfYear: null, awards: [], monthsWithData };

  const byRank = (a: BlockYear, b: BlockYear) => a.avgRank - b.avgRank || b.wins - a.wins || a.avgKpi - b.avgKpi;
  const pick = (score: (b: BlockYear) => number | null, pool = blocks) => {
    const scored = pool.filter((b) => score(b) !== null && score(b)! > 0);
    if (!scored.length) return null;
    return scored.sort((a, b) => score(b)! - score(a)! || byRank(a, b))[0];
  };

  // Team of the Year: best average rank among blocks ranked in at least half the months.
  const eligible = blocks.filter((b) => b.months * 2 >= monthsWithData);
  const teamOfYear = [...(eligible.length ? eligible : blocks)].sort(byRank)[0];

  const awards: Award[] = [];
  const add = (key: string, icon: string, title: string, w: BlockYear | null, value: (b: BlockYear) => string, why: string) => {
    if (w) awards.push({ key, icon, title, winner: w, value: value(w), why });
  };
  add("wins", "👑", "Most #1 finishes", pick((b) => b.wins), (b) => `${b.wins} month${b.wins === 1 ? "" : "s"} at #1`, "Finished first more often than any other block.");
  add("streak", "🔥", "Longest winning streak", pick((b) => (b.bestStreak >= 2 ? b.bestStreak : null)), (b) => `${b.bestStreak} months in a row`, "Most consecutive months at #1.");
  add("improved", "📈", "Most improved", pick((b) => b.improvement), (b) => `−${b.improvement!.toFixed(2)} Final KPI`, "Biggest drop in Final KPI from its first 3 months to its last 3.");
  add("perfect", "💎", "Most Perfect months", pick((b) => b.perfectMonths), (b) => `${b.perfectMonths} Perfect month${b.perfectMonths === 1 ? "" : "s"}`, "Most months with status Perfect.");
  add("inspections", "🔍", "Inspection champion", pick((b) => b.inspections), (b) => `${b.inspections.toLocaleString()} inspections`, "Most inspections across the year.");
  add("clean", "✨", "Cleanest record",
    pick((b) => (b.inspections >= MIN_CLEAN_RATE_INSPECTIONS ? b.clean / b.inspections : null)),
    (b) => `${Math.round((b.clean / b.inspections) * 100)}% clean`, `Highest share of clean inspections (at least ${MIN_CLEAN_RATE_INSPECTIONS} inspections).`);
  return { teamOfYear, awards, monthsWithData };
}

export type Badge = { icon: string; label: string; detail: string };

// Achievements one block earned during the year.
export function blockBadges(year: RankedMonth[], blockId: string): Badge[] {
  const b = blockYears(year).find((x) => x.id === blockId);
  if (!b) return [];
  const out: Badge[] = [];
  if (b.wins) out.push({ icon: "🏆", label: `Monthly champion ×${b.wins}`, detail: "Finished #1 for the month" });
  if (b.bestStreak >= 2) out.push({ icon: "🔥", label: `${b.bestStreak} wins in a row`, detail: "Consecutive months at #1" });
  if (b.perfectMonths) out.push({ icon: "💎", label: `Perfect ×${b.perfectMonths}`, detail: "Months with status Perfect" });

  let zeroPoints = 0, fullClean = 0, bigInspections = 0, bestClimb = 0;
  let prevRank: number | null = null;
  for (const { ranked } of year) {
    const idx = ranked.findIndex((r) => r.id === blockId);
    if (idx < 0) { prevRank = null; continue; }
    const r = ranked[idx];
    if (Number(r.violationPoints || 0) === 0) zeroPoints++;
    if (r.totalInspections > 0 && r.cleanInspections === r.totalInspections) fullClean++;
    if (r.totalInspections >= 300) bigInspections++;
    if (prevRank !== null) bestClimb = Math.max(bestClimb, prevRank - (idx + 1));
    prevRank = idx + 1;
  }
  if (zeroPoints) out.push({ icon: "🛡️", label: `Zero violations ×${zeroPoints}`, detail: "Months with 0 violation points" });
  if (fullClean) out.push({ icon: "✨", label: `100% clean ×${fullClean}`, detail: "Every inspection clean that month" });
  if (bigInspections) out.push({ icon: "🔍", label: `300+ inspections ×${bigInspections}`, detail: "Months with 300 or more inspections" });
  if (bestClimb >= 3) out.push({ icon: "🚀", label: `Climbed ${bestClimb} places`, detail: "Biggest jump up the ranking in one month" });
  return out;
}
