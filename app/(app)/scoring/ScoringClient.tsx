"use client";

// "How the score works" — plain-language rules plus a calculator that runs the
// exact same calcKpi() the rankings use, so the explanation can never drift.

import { useMemo, useState } from "react";
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

// Examples for the rule tables — values come from calcKpi(), so they always match the real scoring.
const EXAMPLE_BASE: Row = { id: "ex", name: "ex", teamMembers: 0, trucks: 0, cleanInspections: 0, totalInspections: 0, violationPoints: 10 };
const INSPECTION_EXAMPLES = [40, 50, 100, 200, 300, 500];
const WORKLOAD_EXAMPLES = [400, 300, 200, 150, 100];

function pct(p: number) {
  const v = Math.round(p * 100);
  return v === 0 ? "0%" : `−${v}%`;
}

function RuleTable({ n, title, note, head, rows }: {
  n: number;
  title: string;
  note?: string;
  head?: string[];
  rows?: React.ReactNode[][];
}) {
  return (
    <div style={{ marginTop: 18, marginBottom: 4 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{n}. {title}</div>
      {note && <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 6 }}>{note}</div>}
      {head && rows && <div className="table-wrap" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
        <table className="data-table">
          <thead>
            <tr>{head.map((h, i) => <th key={i} className={i === 0 ? undefined : "num"}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => <td key={j} className={j === 0 ? undefined : "num"}><span style={{ fontWeight: j === r.length - 1 ? 700 : 500 }}>{c}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

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
    <>
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
              <p style={{ marginTop: 0 }}>
                <strong>Lower Final KPI = better.</strong> Each month starts from the block&apos;s violation points,
                then two discounts and a workload adjustment are applied.
              </p>

              <RuleTable
                n={1}
                title="Clean discount — 30% for every block with clean inspections"
                note="Every block gets 30% off its violation points for its clean inspections, no matter how many clean inspections it has. Blocks that inspect more get extra reward from the inspection discount below."
              />

              <RuleTable
                n={2}
                title={`Inspection discount — from ${MIN_INSPECTIONS_FOR_DISCOUNT} inspections, 1% for every 10`}
                note="No upper limit. Quarters use the monthly average."
                head={["Total inspections", ...INSPECTION_EXAMPLES.map((n) => (n < MIN_INSPECTIONS_FOR_DISCOUNT ? `Under ${MIN_INSPECTIONS_FOR_DISCOUNT}` : String(n)))]}
                rows={[["Discount", ...INSPECTION_EXAMPLES.map((n) =>
                  pct(calcKpi({ ...EXAMPLE_BASE, totalInspections: n }).inspectionPercent))]]}
              />

              <RuleTable
                n={3}
                title={`Workload — target is ${TRUCKS_PER_MEMBER} trucks per team member`}
                note={`Example: 5 members → ${5 * TRUCKS_PER_MEMBER} expected trucks. Points are multiplied by expected ÷ actual (between ×0.5 and ×2).`}
                head={["Trucks checked", "vs. target", "Points ×"]}
                rows={WORKLOAD_EXAMPLES.map((t) => {
                  const k = calcKpi({ ...EXAMPLE_BASE, teamMembers: 5, trucks: t });
                  return [String(t), `${Math.round((t / (5 * TRUCKS_PER_MEMBER)) * 100)}%`, `×${(1 + k.staffPercent).toFixed(2)}`];
                })}
              />

              <RuleTable
                n={4}
                title="Status"
                note="Quarters combine 3 months, so the limits are ×3."
                head={["Final KPI (month)", "Status"]}
                rows={[
                  ["0 – 2", <span key="p" className={BADGE_CLASS.Perfect}>Perfect</span>],
                  ["2 – 6", <span key="e" className={BADGE_CLASS.Excellent}>Excellent</span>],
                  ["6 – 8.9", <span key="g" className={BADGE_CLASS.Good}>Good</span>],
                  ["above 8.9", <span key="b" className={BADGE_CLASS.Poor}>Poor</span>],
                  ["nothing entered", <span key="n" className={BADGE_CLASS["No data"]}>No data</span>],
                ]}
              />

              <p style={{ marginBottom: 0 }}>
                <strong>Example:</strong> 10 violation points, 200 inspections, 180 clean → clean inspections (−30%) + 200 inspections (−20%)
                = −50% → <strong>5 points</strong>, then the workload adjustment gives the Final KPI.
                When two blocks tie, the higher clean rate wins, then more inspections, then more trucks per member.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2 className="card-title">Try it</h2></div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {FIELDS.map(([f, label]) => (
                  <div key={f} className="add-block-field" style={{ marginBottom: 0 }}>
                    <label className="form-label">{label}</label>
                    <input
                      inputMode="numeric"
                      value={String(row[f] ?? 0)}
                      onChange={(e) => set(f, e.target.value)}
                    />
                  </div>
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
    </>
  );
}
