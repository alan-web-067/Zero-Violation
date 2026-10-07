"use client";

// "How the score works" — plain-language rules plus a calculator that runs the
// exact same calcKpi() the rankings use, so the explanation can never drift.

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Row, calcKpi, fmtPct, TRUCKS_PER_MEMBER, MIN_INSPECTIONS_FOR_DISCOUNT,
} from "@/lib/kpi";

const FIELDS: Array<[keyof Row, string]> = [
  ["teamMembers", "Team members"],
  ["trucks", "Trucks checked"],
  ["cleanInspections", "Clean inspections"],
  ["totalInspections", "Total inspections"],
  ["violationPoints", "Violation points"],
];

const BADGE_CLASS: Record<string, string> = {
  Perfect:   "badge badge-perfect",
  Excellent: "badge badge-excellent",
  Good:      "badge badge-good",
  Poor:      "badge badge-poor",
  "No data": "badge badge-nodata",
};

export default function ScoringClient() {
  const [row, setRow] = useState<Row>({
    id: "calc", name: "Example",
    teamMembers: 5, trucks: 250, cleanInspections: 90, totalInspections: 100, violationPoints: 6,
  });
  const kpi = useMemo(() => calcKpi(row), [row]);

  function set(field: keyof Row, raw: string) {
    setRow((r) => ({ ...r, [field]: Number(raw.replace(/[^\d]/g, "") || 0) }));
  }

  const invalid = row.cleanInspections > row.totalInspections;

  return (
    <AppShell>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🧮</span>
          <h1>How the score works</h1>
        </div>
      </div>

      <div className="page-body">
        <div className="two-col" style={{ marginBottom: 14, alignItems: "start" }}>
          <div className="card">
            <div className="card-header"><h2 className="card-title">The rules</h2></div>
            <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <p style={{ marginTop: 0 }}><strong>Lower Final KPI = better.</strong> Each month starts from the block&apos;s violation points:</p>
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                <li><strong>Clean discount</strong> — up to 30% off, based on clean ÷ total inspections (100% clean = −30%, 50% clean = −15%).</li>
                <li><strong>Inspection discount</strong> — from {MIN_INSPECTIONS_FOR_DISCOUNT} inspections, 1% off for every 10 (100 = −10%, 300 = −30%). No discount below {MIN_INSPECTIONS_FOR_DISCOUNT}.</li>
                <li><strong>Workload</strong> — target is {TRUCKS_PER_MEMBER} trucks per team member. Points are multiplied by expected ÷ actual trucks, between ×0.5 and ×2. Checking twice the target halves the points; half the target doubles them.</li>
                <li><strong>Status</strong> — Perfect ≤ 2, Excellent ≤ 6, Good ≤ 8.9, otherwise Poor. Quarters use 3 months combined, so the limits are ×3.</li>
              </ol>
              <p style={{ marginBottom: 0 }}>
                Blocks with nothing entered show <span className="badge badge-nodata">No data</span> and are not ranked.
                When two blocks tie, the higher clean rate wins, then more inspections, then more trucks per member.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2 className="card-title">Try it</h2></div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {FIELDS.map(([f, label]) => (
                  <label key={f} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                    {label}
                    <input
                      inputMode="numeric"
                      value={String(row[f] ?? 0)}
                      onChange={(e) => set(f, e.target.value)}
                      style={{ display: "block", width: "100%", marginTop: 4 }}
                    />
                  </label>
                ))}
              </div>
              {invalid ? (
                <div className="add-block-error">Clean inspections can&apos;t be more than total inspections.</div>
              ) : (
                <table className="data-table">
                  <tbody>
                    <tr><td>Violation points</td><td className="num">{kpi.violPoint.toFixed(2)}</td></tr>
                    <tr><td>Clean discount ({Math.round(kpi.cleanPercent * 100)}%)</td><td className="num">−{kpi.cleanDelta.toFixed(2)}</td></tr>
                    <tr><td>Inspection discount ({Math.round(kpi.inspectionPercent * 100)}%)</td><td className="num">−{kpi.inspectionDelta.toFixed(2)}</td></tr>
                    <tr><td>After discounts</td><td className="num">{kpi.afterClean.toFixed(2)}</td></tr>
                    <tr>
                      <td>Workload ({kpi.expectedTrucks ? `${row.trucks} of ${kpi.expectedTrucks} expected trucks` : "no team size"})</td>
                      <td className="num">{fmtPct(kpi.staffPercent)} ({kpi.staffDelta >= 0 ? "+" : ""}{kpi.staffDelta.toFixed(2)})</td>
                    </tr>
                    <tr>
                      <td><strong>Final KPI</strong></td>
                      <td className="num">
                        <strong style={{ fontSize: 15 }}>{kpi.finalKpi.toFixed(2)}</strong>{" "}
                        <span className={BADGE_CLASS[kpi.status]}>{kpi.status}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
