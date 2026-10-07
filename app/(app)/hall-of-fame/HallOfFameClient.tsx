"use client";

// Hall of Fame — Team of the Year, yearly awards and the 12 monthly champions.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AUTH_TOKEN_KEY, getMe } from "@/lib/apiClient";
import { MONTHS, Row } from "@/lib/kpi";
import { loadYearMonthRows } from "@/lib/useKpiData";
import { rankYear, yearAwards } from "@/lib/awards";
import { isFullAdmin } from "@/lib/permissions";
import type { Role } from "@/lib/auth";

const blockHref = (id: string) => `/blocks/${encodeURIComponent(id)}`;

export default function HallOfFameClient() {
  const router = useRouter();
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(thisYear);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [months, setMonths] = useState<Row[][] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) { router.replace("/"); return; }
    getMe()
      .then((me) => {
        const role = me.user?.role;
        if (role === "hr" || role === "accounting") { router.replace("/dashboard"); return; }
        setIsAdmin(isFullAdmin(role as Role));
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (isAdmin === null) return;
    let alive = true;
    setMonths(null);
    setError("");
    loadYearMonthRows(year, isAdmin)
      .then((m) => { if (alive) setMonths(m); })
      .catch(() => { if (alive) setError("Could not load results for this year."); });
    return () => { alive = false; };
  }, [year, isAdmin]);

  const ranked = useMemo(() => (months ? rankYear(months) : []), [months]);
  const { teamOfYear, awards, monthsWithData } = useMemo(() => yearAwards(ranked), [ranked]);
  const loading = months === null && !error;

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span style={{ fontSize: 18 }}>🏛️</span>
          <h1>Hall of Fame</h1>
        </div>
        <div className="page-header-right" style={{ gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setYear((y) => y - 1)} aria-label="Previous year"><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 48, textAlign: "center" }}>{year}</strong>
          <button className="btn btn-ghost" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear} aria-label="Next year"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="card" style={{ marginBottom: 14, borderColor: "#fecaca" }}>
            <div className="card-body" style={{ color: "#991b1b" }}>⚠️ {error}</div>
          </div>
        )}

        {loading ? (
          <div className="card"><div className="card-body"><div className="empty-state"><p>Loading…</p></div></div></div>
        ) : !teamOfYear ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏛️</div>
            <h3>No results for {year} yet</h3>
            <p>Awards appear once monthly numbers are published.</p>
          </div>
        ) : (
          <>
            <div className="winner-banner hof-hero">
              <div className="winner-trophy">🏆</div>
              <div className="winner-info">
                <h3>{year === thisYear ? `Team of the Year so far · ${monthsWithData} month${monthsWithData === 1 ? "" : "s"}` : `Team of the Year ${year}`}</h3>
                <div className="winner-name"><Link href={blockHref(teamOfYear.id)} className="block-link">{teamOfYear.name}</Link></div>
                <div className="winner-kpi">
                  Average rank #{teamOfYear.avgRank.toFixed(1)} · {teamOfYear.wins} month{teamOfYear.wins === 1 ? "" : "s"} at #1 · average Final KPI {teamOfYear.avgKpi.toFixed(2)}
                </div>
                <div className="winner-kpi" style={{ opacity: 0.85, fontSize: 12 }}>
                  Best average rank across the year (ranked in at least half the months). Ties go to more #1 finishes.
                </div>
              </div>
              <Link href={`/certificate?type=year&year=${year}`} className="btn btn-sm cert-btn">📜 Certificate</Link>
            </div>

            <div className="hof-awards">
              {awards.map((a) => (
                <div key={a.key} className="card hof-award">
                  <div className="hof-award-icon">{a.icon}</div>
                  <div className="hof-award-title">{a.title}</div>
                  <Link href={blockHref(a.winner.id)} className="block-link hof-award-winner">{a.winner.name}</Link>
                  <div className="hof-award-value">{a.value}</div>
                  <div className="hof-award-why">{a.why}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Monthly champions {year}</h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>#1 of each month</span>
              </div>
              <div className="card-body">
                <div className="hof-months">
                  {ranked.map(({ month, ranked: list }) => {
                    const w = list[0];
                    return (
                      <div key={month} className={`hof-month${w ? "" : " empty"}`}>
                        <div className="hof-month-name">{MONTHS[month - 1].name.slice(0, 3)}</div>
                        {w ? (
                          <>
                            <div className="hof-month-trophy">🏆</div>
                            <Link href={blockHref(w.id)} className="block-link hof-month-winner">{w.name}</Link>
                            <div className="hof-month-kpi">KPI {w.kpi.finalKpi.toFixed(2)}</div>
                            <Link href={`/certificate?type=month&year=${year}&month=${month}`} className="hof-month-cert" title="Printable certificate">📜 Certificate</Link>
                          </>
                        ) : (
                          <div className="hof-month-kpi">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
