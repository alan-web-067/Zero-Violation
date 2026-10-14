"use client";

// "How the score works" — plain-language rules plus a calculator that runs the
// exact same calcKpi() the rankings use, so the explanation can never drift.

import { useMemo, useState } from "react";
import {
  Row, calcKpi, TRUCKS_PER_MEMBER, CLEAN_DISCOUNT_PER_INSPECTION,
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
const CLEAN_EXAMPLES = [10, 40, 90, 120, 200];
const WORKLOAD_EXAMPLES = [300, 250, 235, 200, 165, 150, 100];

function pct(p: number) {
  const v = Math.round(p * 100);
  return v === 0 ? "0%" : `−${v}%`;
}

function RuleTable({ n, title, note, text, head, rows }: {
  n: number;
  title: string;
  note?: string;
  text?: React.ReactNode;
  head?: string[];
  rows?: React.ReactNode[][];
}) {
  return (
    <div style={{ marginTop: 18, marginBottom: 4 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{n}. {title}</div>
      {note && <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 6 }}>{note}</div>}
      {text && <div style={{ margin: "4px 0 8px" }}>{text}</div>}
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
                then the clean inspection discount and the workload adjustment are applied.
              </p>

              <RuleTable
                n={1}
                title={`Clean inspection discount — ${CLEAN_DISCOUNT_PER_INSPECTION * 100}% for every clean inspection`}
                text={<>
                  Every clean inspection takes <strong>{CLEAN_DISCOUNT_PER_INSPECTION * 100}%</strong> off the violation points:
                  {" "}<strong>clean inspections × {CLEAN_DISCOUNT_PER_INSPECTION * 100}% = discount</strong>. More clean inspections = bigger discount.
                  {" "}At most 100%. Quarters use the monthly average.
                </>}
                head={["Clean inspections", ...CLEAN_EXAMPLES.map(String)]}
                rows={[
                  ["Discount", ...CLEAN_EXAMPLES.map((n) => pct(calcKpi({ ...EXAMPLE_BASE, cleanInspections: n, totalInspections: n }).cleanPercent))],
                  ["10 points become", ...CLEAN_EXAMPLES.map((n) => calcKpi({ ...EXAMPLE_BASE, cleanInspections: n, totalInspections: n }).afterClean.toFixed(2))],
                ]}
              />

              <RuleTable
                n={2}
                title={`Workload — target is ${TRUCKS_PER_MEMBER} trucks per team member`}
                text={<>
                  Each person must check <strong>{TRUCKS_PER_MEMBER} trucks</strong>. A team of 5 must check <strong>{5 * TRUCKS_PER_MEMBER} trucks</strong> (5 × {TRUCKS_PER_MEMBER}).<br />
                  To find the change: <strong>take the extra or missing trucks, divide by the target, then multiply by 10.</strong>
                  <ul className="workload-steps">
                    <li><strong>Checked 235:</strong> 35 extra → 35 ÷ 200 × 10 = <strong style={{ color: "#047857" }}>1.75 points off</strong></li>
                    <li><strong>Checked 200:</strong> no extra, no missing → <strong>no change</strong></li>
                    <li><strong>Checked 165:</strong> 35 missing → 35 ÷ 200 × 10 = <strong style={{ color: "#dc2626" }}>1.75 points added</strong></li>
                  </ul>
                  <strong>More trucks = fewer points (good). Fewer trucks = more points (bad).</strong>
                  {" "}Every block gets the same change for the same trucks.
                </>}
                head={["Trucks checked", "Difference", "%", "Points change"]}
                rows={WORKLOAD_EXAMPLES.map((t) => {
                  const k = calcKpi({ ...EXAMPLE_BASE, teamMembers: 5, trucks: t });
                  const target = 5 * TRUCKS_PER_MEMBER;
                  const diff = t - target;
                  const pctText = `${Math.round((Math.abs(diff) / target) * 1000) / 10}%`;
                  const color = k.staffDelta < 0 ? "#047857" : k.staffDelta > 0 ? "#dc2626" : undefined;
                  return [
                    String(t),
                    <span key="d" style={{ whiteSpace: "nowrap" }}>{diff === 0 ? "on target" : `${Math.abs(diff)} ${diff > 0 ? "extra" : "missing"}`}</span>,
                    diff === 0 ? "0%" : pctText,
                    <strong key="c" style={{ color }}>{diff === 0 ? "no change" : `${k.staffDelta > 0 ? "+" : "−"}${Math.abs(k.staffDelta).toFixed(2)} pts`}</strong>,
                  ];
                })}
              />

              <RuleTable
                n={3}
                title="Status"
                note="Quarters combine 3 months, so the limits are ×3."
                head={["Final KPI (month)", "Status"]}
                rows={[
                  ["0 – 2", <span key="p" className={BADGE_CLASS.Perfect}>Perfect</span>],
                  ["2 – 6", <span key="e" className={BADGE_CLASS.Excellent}>Excellent</span>],
                  ["6 – 8", <span key="g" className={BADGE_CLASS.Good}>Good</span>],
                  ["above 8 (no upper limit)", <span key="b" className={BADGE_CLASS.Poor}>Poor</span>],
                  ["nothing entered", <span key="n" className={BADGE_CLASS["No data"]}>No data</span>],
                ]}
              />

              <p style={{ marginBottom: 0 }}>
                <strong>Example:</strong> 10 violation points and 90 clean inspections → 90 × 0.5% = −45% → <strong>5.50 points</strong>,
                then the workload adjustment gives the Final KPI.
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
                    <tr><td>Clean inspection discount ({row.cleanInspections} × {CLEAN_DISCOUNT_PER_INSPECTION * 100}% = {Math.round(kpi.cleanPercent * 1000) / 10}%)</td><td className="num">−{kpi.cleanDelta.toFixed(2)}</td></tr>
                    <tr><td>After discount</td><td className="num">{kpi.afterClean.toFixed(2)}</td></tr>
                    {/* Same wording as the workload table: trucks · difference · % → points change */}
                    <tr>
                      <td>
                        Workload: {row.trucks} trucks, target {kpi.expectedTrucks || "—"}
                        {kpi.expectedTrucks > 0 && row.trucks !== kpi.expectedTrucks && (
                          <span style={{ color: "var(--text-muted)" }}>
                            {" "}· {Math.abs(row.trucks - kpi.expectedTrucks)} {row.trucks > kpi.expectedTrucks ? "extra" : "missing"} · {Math.round(Math.abs(kpi.staffPercent) * 1000) / 10}%
                          </span>
                        )}
                      </td>
                      <td className="num">
                        <strong style={{ color: kpi.staffDelta < 0 ? "#047857" : kpi.staffDelta > 0 ? "#dc2626" : undefined }}>
                          {kpi.expectedTrucks > 0 && row.trucks !== kpi.expectedTrucks
                            ? `${kpi.staffDelta > 0 ? "+" : "−"}${Math.abs(kpi.staffDelta).toFixed(2)} pts`
                            : "no change"}
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Final KPI</strong></td>
                      <td className="num">
                        <strong style={{ fontSize: 15, color: kpi.status === "Poor" ? "#dc2626" : undefined }}>{kpi.finalKpi.toFixed(2)}</strong>{" "}
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
