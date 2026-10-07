"use client";

// Printable award certificate for Team of the Month / Quarter / Year.
// Built from PUBLISHED results only, so a draft can never produce a certificate.
// URL: /certificate?type=month&year=2026&month=10  (type=quarter → &quarter=4, type=year)
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer, ChevronLeft } from "lucide-react";
import { AUTH_TOKEN_KEY, getMe } from "@/lib/apiClient";
import { MONTHS, RowWithKpi, applyKpiToRows, sortByKpi, rankedOnly, kpiReasons } from "@/lib/kpi";
import { loadPeriodRows, loadYearMonthRows } from "@/lib/useKpiData";
import { rankYear, yearAwards } from "@/lib/awards";

type Winner = { name: string; lines: string[]; kpi: number | null; status: string | null };

export default function CertificateClient() {
  const router = useRouter();
  const params = useSearchParams();
  const now = useMemo(() => new Date(), []);
  const type = (params.get("type") ?? "month") as "month" | "quarter" | "year";
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(params.get("month")) || now.getMonth() + 1));
  const quarter = Math.min(4, Math.max(1, Number(params.get("quarter")) || Math.floor(now.getMonth() / 3) + 1));

  const [winner, setWinner] = useState<Winner | null | undefined>(undefined);

  useEffect(() => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) { router.replace("/"); return; }
    let alive = true;
    (async () => {
      try {
        await getMe();
        let w: Winner | null = null;
        if (type === "year") {
          const { teamOfYear } = yearAwards(rankYear(await loadYearMonthRows(year, false)));
          if (teamOfYear) {
            w = {
              name: teamOfYear.name,
              kpi: teamOfYear.avgKpi,
              status: null,
              lines: [
                `Average monthly rank #${teamOfYear.avgRank.toFixed(1)}`,
                `${teamOfYear.wins} month${teamOfYear.wins === 1 ? "" : "s"} at #1`,
                `${teamOfYear.inspections.toLocaleString()} inspections`,
              ],
            };
          }
        } else {
          const rows = await loadPeriodRows({ year, month, quarter, view: type === "quarter" ? "quarter" : "month" }, false);
          const top: RowWithKpi | undefined = rankedOnly(sortByKpi(applyKpiToRows(rows)))[0];
          if (top) w = { name: top.name, kpi: top.kpi.finalKpi, status: top.kpi.status, lines: kpiReasons(top) };
        }
        if (alive) setWinner(w);
      } catch {
        if (alive) setWinner(null);
      }
    })();
    return () => { alive = false; };
  }, [router, type, year, month, quarter]);

  const title = type === "year" ? "Team of the Year" : type === "quarter" ? "Team of the Quarter" : "Team of the Month";
  const periodLabel = type === "year" ? String(year) : type === "quarter" ? `Q${quarter} ${year}` : `${MONTHS[month - 1].name} ${year}`;
  const issued = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      <div className="page-header cert-toolbar">
        <div className="page-header-left">
          <button className="btn btn-ghost" onClick={() => router.back()} aria-label="Back"><ChevronLeft size={16} /></button>
          <h1>Certificate</h1>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={!winner}>
            <Printer size={14} style={{ marginRight: 6 }} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="page-body">
        {winner === undefined ? (
          <div className="card"><div className="card-body"><div className="empty-state"><p>Loading…</p></div></div></div>
        ) : winner === null ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <h3>No published winner for {periodLabel}</h3>
            <p>Certificates use published results only. <Link href="/hall-of-fame">Go to the Hall of Fame</Link></p>
          </div>
        ) : (
          <div className="cert-sheet">
            <div className="cert-inner">
              <div className="cert-brand">
                <Image src="/F1NAL.jpg" alt="" width={54} height={54} className="cert-logo" />
                <div>
                  <div className="cert-company">ALGO GROUP LLC</div>
                  <div className="cert-program">Zero Violations Program</div>
                </div>
              </div>

              <div className="cert-kicker">Certificate of Achievement</div>
              <div className="cert-title">{title}</div>
              <div className="cert-presented">is proudly presented to</div>
              <div className="cert-winner">{winner.name}</div>
              <div className="cert-period">{periodLabel}</div>

              <p className="cert-text">
                For outstanding safety and compliance — the best result of all blocks
                {type === "year" ? " across the year" : type === "quarter" ? " for the quarter" : " for the month"}.
              </p>

              <div className="cert-facts">
                {winner.kpi !== null && (
                  <div><span>{type === "year" ? "Average Final KPI" : "Final KPI"}</span><strong>{winner.kpi.toFixed(2)}</strong></div>
                )}
                {winner.status && <div><span>Status</span><strong>{winner.status}</strong></div>}
                {winner.lines.slice(0, 3).map((l) => <div key={l} className="cert-fact-line"><strong>{l}</strong></div>)}
              </div>

              <div className="cert-seal" aria-hidden>🏆</div>

              <div className="cert-sign">
                <div><div className="cert-line" /><span>Management</span></div>
                <div><div className="cert-line" /><span>Issued {issued}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
