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
const BLOCK_DEFS_TTL_MS = 5000;

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

async function fetchMonth(scope: string, y: number, m: number): Promise<Row[] | null> {
  try {
    const out = await apiClient(
      `/api/results/month?scope=${encodeURIComponent(scope)}&year=${y}&month=${m}`
    );
    return out.data as Row[] | null;
  } catch {
    return null;
  }
}

async function loadMonthForRole(y: number, m: number, isAdmin: boolean, defs: BlockDef[]): Promise<Row[]> {
  if (isAdmin) {
    const d = await fetchMonth("draft", y, m);
    if (d) return mergeWithBase(d, defs);
    const p = await fetchMonth("published", y, m);
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
  const winner = sorted[0] ?? null;
  const worst = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const activeBlocks = sorted.filter((r) => r.violationPoints > 0 || r.trucks > 0).length;
  const avgKpi =
    sorted.length > 0
      ? Math.round((sorted.reduce((s, r) => s + r.kpi.finalKpi, 0) / sorted.length) * 100) / 100
      : 0;

  return { rows, setRows, sorted, winner, worst, activeBlocks, avgKpi, loading, load };
}
