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

export async function fetchBlockDefs(): Promise<BlockDef[]> {
  const now = Date.now();
  if (blockDefsCache && now - blockDefsCache.ts < BLOCK_DEFS_TTL_MS) {
    return blockDefsCache.defs;
  }
  try {
    const out = await apiClient("/api/blocks");
    const defs = (out.blocks || []) as BlockDef[];
    blockDefsCache = { defs, ts: now };
    return defs;
  } catch {
    return blockDefsCache?.defs ?? [];
  }
}

// Shares identical requests that are already in flight (e.g. Analytics loads each
// month for both the monthly and quarterly charts at once). Nothing is kept after
// the request settles, so saved/published data is never served stale.
const inFlightMonths = new Map<string, Promise<Row[] | null>>();

function fetchMonth(scope: string, y: number, m: number): Promise<Row[] | null> {
  const url = `/api/results/month?scope=${encodeURIComponent(scope)}&year=${y}&month=${m}`;
  const pending = inFlightMonths.get(url);
  if (pending) return pending;
  const p = apiClient(url)
    .then((out) => out.data as Row[] | null)
    .catch(() => null)
    .finally(() => inFlightMonths.delete(url));
  inFlightMonths.set(url, p);
  return p;
}

async function loadMonthForRole(y: number, m: number, isAdmin: boolean, defs: BlockDef[]): Promise<Row[]> {
  if (isAdmin) {
    const [d, p] = await Promise.all([fetchMonth("draft", y, m), fetchMonth("published", y, m)]);
    if (d) return mergeWithBase(d, defs);
    if (p) return mergeWithBase(p, defs);
    return mergeWithBase(null, defs);
  } else {
    const p = await fetchMonth("published", y, m);
    return mergeWithBase(p, defs);
  }
}

export async function loadPeriodRows(
  period: PeriodState,
  isAdmin: boolean
): Promise<Row[]> {
  const defs = await fetchBlockDefs();
  if (period.view === "month") {
    return loadMonthForRole(period.year, period.month, isAdmin, defs);
  } else {
    const months = monthsForQuarter(period.quarter);
    const lists = await Promise.all(
      months.map((m) => loadMonthForRole(period.year, m, isAdmin, defs))
    );
    return combineQuarterRows(lists, defs);
  }
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
