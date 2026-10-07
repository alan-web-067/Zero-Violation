"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import {
  Row,
  RowWithKpi,
  BlockDef,
  applyKpiToRows,
  combineQuarterRows,
  mergeWithBase,
  monthsForQuarter,
  sortByKpi,
  rankedOnly,
} from "@/lib/kpi";

export type { Row, RowWithKpi, BlockDef };

export type PeriodState = {
  year: number;
  quarter: number;
  month: number;
  view: "month" | "quarter";
};

// Shared block registry — single source of truth for "which blocks exist", used by
// every page (Reports, Dashboard, Analytics, Leaderboard, Admin). Cached briefly so
// pages that load many periods at once (e.g. Analytics' 12-month sweep) don't refetch
// it dozens of times; invalidate after any block create/edit/rename/status change.
let blockDefsCache: { defs: BlockDef[]; ts: number } | null = null;
const BLOCK_DEFS_TTL_MS = 60_000;

export function invalidateBlockDefsCache() {
  blockDefsCache = null;
}

// Parallel callers on a cold cache share one request instead of each firing their own.
let blockDefsInFlight: Promise<BlockDef[]> | null = null;

export async function fetchBlockDefs(): Promise<BlockDef[]> {
  const now = Date.now();
  if (blockDefsCache && now - blockDefsCache.ts < BLOCK_DEFS_TTL_MS) {
    return blockDefsCache.defs;
  }
  if (blockDefsInFlight) return blockDefsInFlight;
  blockDefsInFlight = apiClient("/api/blocks")
    .then((out) => {
      const defs = (out.blocks || []) as BlockDef[];
      blockDefsCache = { defs, ts: Date.now() };
      return defs;
    })
    .catch(() => blockDefsCache?.defs ?? [])
    .finally(() => { blockDefsInFlight = null; });
  return blockDefsInFlight;
}

// Rejects on a failed request. Shares identical requests that are already in flight (e.g. Analytics loads each
// month for both the monthly and quarterly charts at once). Nothing is kept after
// the request settles, so saved/published data is never served stale.
const inFlightMonths = new Map<string, Promise<Row[] | null>>();

function fetchMonth(scope: string, y: number, m: number): Promise<Row[] | null> {
  const url = `/api/results/month?scope=${encodeURIComponent(scope)}&year=${y}&month=${m}`;
  const pending = inFlightMonths.get(url);
  if (pending) return pending;
  const p = apiClient(url)
    .then((out) => out.data as Row[] | null)
    .finally(() => inFlightMonths.delete(url));
  inFlightMonths.set(url, p);
  return p;
}

type MonthLoad = { rows: Row[]; unpublished: boolean };

// strict: a failed request throws instead of quietly showing the block defaults —
// Admin/Edit needs this so it never saves defaults over data it couldn't load.
async function loadMonthForRole(y: number, m: number, isAdmin: boolean, defs: BlockDef[], strict = false): Promise<MonthLoad> {
  const get = (scope: string) => (strict ? fetchMonth(scope, y, m) : fetchMonth(scope, y, m).catch(() => null));
  if (isAdmin) {
    const [d, p] = await Promise.all([get("draft"), get("published")]);
    // Admins see the draft when there is one; flag it when it differs from what viewers see.
    const unpublished = !!d && JSON.stringify(d) !== JSON.stringify(p);
    return { rows: mergeWithBase(d ?? p ?? null, defs), unpublished };
  }
  const p = await get("published");
  return { rows: mergeWithBase(p, defs), unpublished: false };
}

// Same as loadPeriodRows, plus whether an admin is looking at unpublished draft numbers.
export async function loadPeriodRowsWithStatus(period: PeriodState, isAdmin: boolean, strict = false): Promise<MonthLoad> {
  const defs = await fetchBlockDefs();
  if (strict && defs.length === 0) throw new Error("Could not load the block list.");
  if (period.view === "month") {
    return loadMonthForRole(period.year, period.month, isAdmin, defs, strict);
  }
  const months = monthsForQuarter(period.quarter);
  const loads = await Promise.all(months.map((m) => loadMonthForRole(period.year, m, isAdmin, defs, strict)));
  return {
    rows: combineQuarterRows(loads.map((l) => l.rows), defs),
    unpublished: loads.some((l) => l.unpublished),
  };
}

export async function loadPeriodRows(period: PeriodState, isAdmin: boolean): Promise<Row[]> {
  return (await loadPeriodRowsWithStatus(period, isAdmin)).rows;
}

// All 12 months of a year in one request (/api/results/year), with the same
// draft-before-published rule as loadMonthForRole. Index 0 = January.
export async function loadYearMonthRows(year: number, isAdmin: boolean): Promise<Row[][]> {
  const [defs, out] = await Promise.all([
    fetchBlockDefs(),
    apiClient(`/api/results/year?year=${year}`),
  ]);
  const months = (out.months || {}) as Record<string, { draft: Row[] | null; published: Row[] | null }>;
  return Array.from({ length: 12 }, (_, i) => {
    const m = months[String(i + 1)];
    const data = (isAdmin ? m?.draft ?? m?.published : m?.published) ?? null;
    return mergeWithBase(data, defs);
  });
}

// Quarter rows built from already-loaded month lists (q = 1..4).
export async function quarterFromMonths(monthRows: Row[][], q: number): Promise<Row[]> {
  const defs = await fetchBlockDefs();
  return combineQuarterRows(monthsForQuarter(q).map((m) => monthRows[m - 1]), defs);
}

export function useKpiData(isAdmin: boolean) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (period: PeriodState) => {
      setLoading(true);
      try {
        const r = await loadPeriodRows(period, isAdmin);
        setRows(r);
      } finally {
        setLoading(false);
      }
    },
    [isAdmin]
  );

  const sorted: RowWithKpi[] = sortByKpi(applyKpiToRows(rows));
  const ranked = rankedOnly(sorted);
  const winner = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const activeBlocks = ranked.length;
  const avgKpi =
    ranked.length > 0
      ? Math.round((ranked.reduce((s, r) => s + r.kpi.finalKpi, 0) / ranked.length) * 100) / 100
      : 0;

  return { rows, setRows, sorted, winner, worst, activeBlocks, avgKpi, loading, load };
}
