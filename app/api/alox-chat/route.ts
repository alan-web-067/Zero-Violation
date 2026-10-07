// app/api/alox-chat/route.ts — Alox, the rule-based KPI assistant (no external AI).
// Answers from the latest published month using the same KPI pipeline as every
// page (lib/kpi.ts), so its rankings always match the Leaderboard.
import { NextRequest, NextResponse } from "next/server";
import { initDb, all } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  BlockDef,
  Row,
  RowWithKpi,
  MONTHS,
  TRUCKS_PER_MEMBER,
  MIN_INSPECTIONS_FOR_DISCOUNT,
  applyKpiToRows,
  kpiReasons,
  mergeWithBase,
  rankedOnly,
  sortByKpi,
} from "@/lib/kpi";
import { rankYear, yearAwards } from "@/lib/awards";

export const runtime = "nodejs";

type Facts = {
  periodLabel: string | null;
  all: RowWithKpi[];      // sorted, includes "No data" blocks at the end
  ranked: RowWithKpi[];   // blocks with data, best first
  averageKpi: number;
  prevRanked: RowWithKpi[];      // the published month before the latest one
  prevLabel: string | null;
  year: number | null;
  yearMonths: Row[][];           // every published month of the latest year (index 0 = Jan)
};

type Link = { href: string; label: string };
type Answer = { text: string; link?: Link; suggestions?: string[] };

const blockLink = (r: { id: string; name: string }): Link => ({ href: `/blocks/${encodeURIComponent(r.id)}`, label: `Open ${r.name} profile` });

function cleanAloxText(text: string) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/```/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function loadFacts(): Promise<Facts> {
  const published = await all<{ data_json: string; year: number; month: number }>(
    `SELECT data_json, year, month FROM month_results
     WHERE scope = 'published' ORDER BY year DESC, month DESC`
  );
  const row = published[0];
  const blockRows = await all<{
    id: number; name: string; team_members: number; trucks: number;
    starting_kpi: number; notes: string; status: "active" | "inactive"; sort_order: number;
  }>(`SELECT * FROM blocks ORDER BY sort_order ASC, id ASC`);

  const defs: BlockDef[] = blockRows.map((b) => ({
    id: String(b.id), name: b.name, teamMembers: b.team_members, trucks: b.trucks,
    startingKpi: b.starting_kpi, notes: b.notes, status: b.status, sortOrder: b.sort_order,
  }));

  const parse = (json: string | undefined): Row[] | null => {
    if (!json) return null;
    try { return JSON.parse(json) as Row[]; } catch { return null; }
  };
  const data = parse(row?.data_json);

  const sorted = sortByKpi(applyKpiToRows(mergeWithBase(data, defs)));
  const ranked = rankedOnly(sorted);
  const averageKpi = ranked.length
    ? Math.round((ranked.reduce((s, r) => s + r.kpi.finalKpi, 0) / ranked.length) * 100) / 100
    : 0;
  const label = (r: { year: number; month: number }) => `${MONTHS[r.month - 1]?.name ?? r.month} ${r.year}`;
  const periodLabel = row ? label(row) : null;

  const prev = published[1];
  const prevRanked = prev ? rankedOnly(sortByKpi(applyKpiToRows(mergeWithBase(parse(prev.data_json), defs)))) : [];

  const year = row?.year ?? null;
  const yearMonths: Row[][] = Array.from({ length: 12 }, (_, i) => {
    const m = published.find((p) => p.year === year && p.month === i + 1);
    return m ? mergeWithBase(parse(m.data_json), defs) : [];
  });

  return { periodLabel, all: sorted, ranked, averageKpi, prevRanked, prevLabel: prev ? label(prev) : null, year, yearMonths };
}

const has = (m: string, ...words: string[]) => words.some((w) => m.includes(w));

function describe(r: RowWithKpi, rank?: number) {
  const pos = rank ? `#${rank} ` : "";
  return `${pos}${r.name} — KPI ${r.kpi.finalKpi.toFixed(2)} (${r.kpi.status}): ${kpiReasons(r).join(", ")}.`;
}

function explainScore() {
  return [
    "How the Final KPI works (lower is better):",
    "1. Start with the block's violation points.",
    "2. Clean discount: a flat 30% off for any block with clean inspections (30 of 40 and 100 of 100 both get −30%).",
    `3. Inspection discount: from ${MIN_INSPECTIONS_FOR_DISCOUNT} inspections, 1% off per 10 inspections (100 = −10%, 300 = −30%). Quarters use the monthly average.`,
    `4. Workload: violations are scaled by expected ÷ actual trucks (target ${TRUCKS_PER_MEMBER} per team member), between ×0.5 and ×2.`,
    "5. Status: Perfect ≤ 2, Excellent ≤ 6, Good ≤ 8.9, otherwise Poor (per month).",
    "Blocks with nothing entered show \"No data\" and are not ranked. Ties go to the higher clean rate, then more inspections, then more trucks per member.",
  ].join("\n");
}

// Finds a block named in the question, preferring the longest match ("FIRST B BLOCK" over "B BLOCK").
function findNamedBlock(m: string, facts: Facts): RowWithKpi | null {
  const hits = facts.all.filter((r) => m.includes(r.name.toLowerCase()));
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

// Newer topics: Hall of Fame / Team of the Year, movers, and the newer pages.
function extraAnswer(message: string, facts: Facts): Answer | null {
  const m = message.trim().toLowerCase();
  const noData = "There is no published data yet. Once a month is published I can answer this.";

  if (has(m, "team of the year", "hall of fame", "award", "champion of the year", "best of the year", "best this year", "year winner")) {
    if (has(m, "explain", "what is", "page")) {
      return {
        text: "The Hall of Fame shows the Team of the Year (best average monthly rank, ranked in at least half the months; ties go to more #1 finishes), six yearly awards — most #1 finishes, longest winning streak, most improved, most Perfect months, inspection champion and cleanest record — and the #1 block of every month, each with a printable certificate.",
        link: { href: "/hall-of-fame", label: "Open Hall of Fame" },
      };
    }
    const { teamOfYear, awards, monthsWithData } = yearAwards(rankYear(facts.yearMonths));
    if (!teamOfYear) return { text: noData };
    const lines = [
      `Team of the Year ${facts.year}${facts.year === new Date().getFullYear() ? " so far" : ""} (${monthsWithData} published month${monthsWithData === 1 ? "" : "s"}): ${teamOfYear.name}.`,
      `Average rank #${teamOfYear.avgRank.toFixed(1)}, ${teamOfYear.wins} month${teamOfYear.wins === 1 ? "" : "s"} at #1, average Final KPI ${teamOfYear.avgKpi.toFixed(2)}.`,
      ...awards.map((a) => `- ${a.title}: ${a.winner.name} (${a.value})`),
    ];
    return { text: lines.join("\n"), link: { href: "/hall-of-fame", label: "Open Hall of Fame" }, suggestions: ["Who climbed the most?", "Which block is performing best?"] };
  }

  if (has(m, "climb", "mover", "moved", "most improved", "improved", "dropped", "fell", "went down", "went up")) {
    if (!facts.ranked.length || !facts.prevRanked.length) return { text: "I need two published months to compare. " + noData };
    const prevPos = new Map(facts.prevRanked.map((r, i) => [r.id, i + 1]));
    const moves = facts.ranked
      .map((r, i) => ({ r, from: prevPos.get(r.id) ?? 0, to: i + 1 }))
      .filter((x) => x.from > 0 && x.from !== x.to);
    const up = moves.filter((x) => x.from > x.to).sort((a, b) => (b.from - b.to) - (a.from - a.to));
    const down = moves.filter((x) => x.from < x.to).sort((a, b) => (b.to - b.from) - (a.to - a.from));
    if (!moves.length) return { text: `No block changed rank between ${facts.prevLabel} and ${facts.periodLabel}.` };
    const lines = [`Rank changes from ${facts.prevLabel} to ${facts.periodLabel}:`];
    if (up.length) lines.push("Climbed:", ...up.slice(0, 3).map((x) => `- ${x.r.name}: #${x.from} → #${x.to} (▲${x.from - x.to})`));
    if (down.length) lines.push("Dropped:", ...down.slice(0, 3).map((x) => `- ${x.r.name}: #${x.from} → #${x.to} (▼${x.to - x.from})`));
    return { text: lines.join("\n"), link: up[0] ? blockLink(up[0].r) : undefined, suggestions: ["Which block needs attention?", "Show current leaderboard"] };
  }

  if (has(m, "certificate")) {
    return { text: "Every Team of the Month, Quarter and Year has a printable certificate. Use the gold 📜 Certificate button on the Dashboard winner banner or in the Hall of Fame, then Print / Save as PDF. Certificates use published results only.", link: { href: "/hall-of-fame", label: "Open Hall of Fame" } };
  }
  if (has(m, "block profile", "profile page")) {
    return { text: "Click any block name on the Leaderboard to open its profile: its rank and Final KPI for every month, times at #1, best month, achievement badges, and a chart you can compare with another block.", link: { href: "/leaderboard", label: "Open Leaderboard" } };
  }
  if (has(m, "leaderboard page", "explain leaderboard")) {
    return { text: "The Leaderboard ranks every block by Final KPI for the chosen month or quarter (lowest = best), with every step of the score. Click a block name to open its profile.", link: { href: "/leaderboard", label: "Open Leaderboard" } };
  }
  if (has(m, "workspace", "block manager")) {
    return { text: "My Workspace: Block Managers enter new numbers for their own block and submit them for review. Admins see the queue there and approve (publish) or reject them with a reason the Block Manager can read.", link: { href: "/workspace", label: "Open My Workspace" } };
  }
  if (has(m, "scoring page", "how scoring works", "try it", "calculator")) {
    return { text: "How Scoring Works lists the rules with examples, and the Try it calculator shows every step of the Final KPI for any numbers you type in.", link: { href: "/scoring", label: "Open How Scoring Works" } };
  }
  return null;
}

function websiteAnswer(message: string, facts: Facts): string | null {
  const m = message.trim().toLowerCase();
  const { ranked, periodLabel } = facts;
  const period = periodLabel ? ` (${periodLabel}, published)` : "";
  const noData = "There is no published data yet. Once a month is published I can answer this.";

  // Score explanation must come before "rank" matching.
  if (has(m, "how is ranking", "how is the ranking", "how is kpi", "how is the kpi", "how is score",
    "how is the score", "how does the score", "how does ranking", "calculated", "formula", "how kpi works")) {
    return explainScore();
  }

  const named = findNamedBlock(m, facts);
  if (named) {
    if (named.kpi.noData) return `${named.name} has no data${period}.`;
    const rank = ranked.findIndex((r) => r.id === named.id) + 1;
    const lead = rank === 1 ? `${named.name} is ranked #1 of ${ranked.length}${period}.` : `${named.name} is ranked #${rank} of ${ranked.length}${period}.`;
    const prevIdx = facts.prevRanked.findIndex((r) => r.id === named.id);
    const trend = prevIdx < 0 ? "" :
      prevIdx + 1 === rank ? `\nSame rank as ${facts.prevLabel}.` :
      prevIdx + 1 > rank ? `\nUp from #${prevIdx + 1} in ${facts.prevLabel} ▲` : `\nDown from #${prevIdx + 1} in ${facts.prevLabel} ▼`;
    return `${lead}\n${describe(named)}${trend}`;
  }

  if (has(m, "most violation", "highest violation", "violation ranking", "violations ranking")) {
    if (!ranked.length) return noData;
    const byViol = [...ranked].sort((a, b) => b.kpi.violPoint - a.kpi.violPoint);
    if (has(m, "ranking")) {
      return `Violation points${period}, highest first:\n` +
        byViol.map((r, i) => `${i + 1}. ${r.name} — ${r.kpi.violPoint} points`).join("\n");
    }
    return `${byViol[0].name} has the most violation points${period}: ${byViol[0].kpi.violPoint}.`;
  }

  if (has(m, "best", "winner", "top block", "performing best", "number one", "#1")) {
    if (!ranked.length) return noData;
    if (has(m, "top 3", "top three")) {
      return `Top 3${period}:\n` + ranked.slice(0, 3).map((r, i) => describe(r, i + 1)).join("\n");
    }
    return `Best block${period}:\n${describe(ranked[0], 1)}`;
  }

  if (has(m, "top 3", "top three")) {
    if (!ranked.length) return noData;
    return `Top 3${period}:\n` + ranked.slice(0, 3).map((r, i) => describe(r, i + 1)).join("\n");
  }

  if (has(m, "weakest", "worst", "weak block", "needs improvement", "need improvement", "attention", "lowest")) {
    if (!ranked.length) return noData;
    const w = ranked[ranked.length - 1];
    return `${w.name} needs the most attention${period}.\n${describe(w, ranked.length)}`;
  }

  if (has(m, "perfect")) {
    const p = ranked.filter((r) => r.kpi.status === "Perfect");
    return p.length ? `Perfect blocks${period}: ${p.map((r) => r.name).join(", ")}.` : `No block is Perfect${period}.`;
  }

  if (has(m, "average")) {
    if (!ranked.length) return noData;
    return `Average KPI${period} is ${facts.averageKpi.toFixed(2)} across ${ranked.length} blocks with data. Lower is better.`;
  }

  if (has(m, "active block", "active blocks", "how many active")) {
    const empty = facts.all.length - ranked.length;
    return `${ranked.length} blocks have data${period}` + (empty ? `; ${empty} show "No data".` : ".");
  }

  if (has(m, "summary", "what happened", "this month", "overview")) {
    if (!ranked.length) return noData;
    const statuses = ["Perfect", "Excellent", "Good", "Poor"]
      .map((s) => [s, ranked.filter((r) => r.kpi.status === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${n} ${s}`)
      .join(", ");
    const parts = [
      `Summary${period}: ${ranked.length} blocks ranked (${statuses}). Average KPI ${facts.averageKpi.toFixed(2)}.`,
      `Best: ${ranked[0].name} (${ranked[0].kpi.finalKpi.toFixed(2)}).`,
    ];
    if (ranked.length > 1) {
      const w = ranked[ranked.length - 1];
      parts.push(`Needs attention: ${w.name} (${w.kpi.finalKpi.toFixed(2)}).`);
    }
    return parts.join(" ");
  }

  if (has(m, "leaderboard", "ranking", "rank")) {
    if (!ranked.length) return noData;
    return `Leaderboard${period}:\n` + ranked.map((r, i) => `${i + 1}. ${r.name} — KPI ${r.kpi.finalKpi.toFixed(2)} (${r.kpi.status})`).join("\n");
  }

  if (has(m, "what can i edit", "can i edit", "how do i edit", "enter numbers")) {
    return "Admins edit numbers on Admin / Edit: team members, trucks checked, clean inspections, total inspections and violation points for each block and month. Save Draft keeps it private; Publish makes it visible to everyone. Block Managers propose changes for their own block in My Workspace, and an admin approves them.";
  }

  if (has(m, "dashboard page", "explain dashboard", "what is dashboard")) {
    return "The Dashboard shows the Team of the Month (and why it won), the block that needs improvement, average KPI, active blocks, Most Improved, status summary and the KPI trend for the year.";
  }
  if (has(m, "reports page", "report page", "explain reports", "what is reports")) {
    return "Reports shows the full monthly or quarterly table with every KPI step, and lets you download CSV or print/PDF. Admins can also add, edit, rename or deactivate blocks there.";
  }
  if (has(m, "admin page", "admin edit", "admin / edit", "edit page", "explain admin")) {
    return "Admin / Edit is where admins enter each block's monthly numbers, see the KPI preview live, save a draft or publish, and add or rename blocks.";
  }
  if (has(m, "analytics page", "explain analytics", "what is analytics")) {
    return "Analytics shows each block's KPI month by month and by quarter, plus the best and worst block of every month.";
  }

  return null;
}

function generalAnswer(message: string): string | null {
  const m = message.trim().toLowerCase();

  if (["hi", "hello", "hey", "hii", "hiii", "ok", "okay", "salom", "assalomu aleykum", "assalamu alaykum"].includes(m)) {
    return "Hello. I am Alox, your KPI adviser. Ask me about block performance, rankings, the score formula, or any page.";
  }
  if (has(m, "how are you", "how r u", "how are u", "how you doing")) {
    return "I am running well and ready to help with your KPI data.";
  }
  if (has(m, "who are you", "who r u", "what is alox", "what's alox", "what are you")) {
    return "I am Alox — the KPI adviser for Zero Violations. I read the latest published results and answer questions about blocks, KPI scores, rankings and pages.";
  }
  if (has(m, "what can you answer", "what can you do", "how can you help")) {
    return "I can tell you the best block, the top 3, which block needs attention, the full leaderboard, average KPI, perfect blocks, most violations, a monthly summary, Team of the Year and the yearly awards, who climbed or dropped since last month, how the score is calculated, and details for any block by name (e.g. \"How is C BLOCK doing?\").";
  }
  return null;
}

// A useful page to open next for the question asked.
function linkFor(m: string, facts: Facts): Link | undefined {
  const named = findNamedBlock(m, facts);
  if (named) return blockLink(named);
  if (has(m, "best", "winner", "#1", "number one", "weakest", "worst", "attention")) {
    const r = has(m, "weakest", "worst", "attention") ? facts.ranked[facts.ranked.length - 1] : facts.ranked[0];
    return r ? blockLink(r) : undefined;
  }
  if (has(m, "leaderboard", "ranking", "top 3", "top three")) return { href: "/leaderboard", label: "Open Leaderboard" };
  if (has(m, "calculated", "formula", "how is kpi", "how is the kpi", "score")) return { href: "/scoring", label: "Open How Scoring Works" };
  if (has(m, "summary", "what happened", "overview", "average")) return { href: "/dashboard", label: "Open Dashboard" };
  if (has(m, "analytics")) return { href: "/analytics", label: "Open Analytics" };
  if (has(m, "report")) return { href: "/reports", label: "Open Reports" };
  if (has(m, "admin", "edit")) return { href: "/admin", label: "Open Admin / Edit" };
  return undefined;
}

// Follow-up questions offered under each answer.
function followUps(m: string, facts: Facts): string[] {
  const top = facts.ranked[0];
  const last = facts.ranked[facts.ranked.length - 1];
  if (has(m, "best", "winner", "top")) return ["Which block needs attention?", "Who climbed the most?", "Who is Team of the Year?"];
  if (has(m, "weakest", "worst", "attention") && last) return [`How is ${last.name} doing?`, "How is the KPI calculated?", "Show current leaderboard"];
  if (has(m, "calculated", "formula", "score")) return ["Which block is performing best?", "Explain scoring page"];
  if (has(m, "summary", "what happened", "overview")) return ["Who climbed the most?", "Who is Team of the Year?", "Show current leaderboard"];
  return [top ? `How is ${top.name} doing?` : "Which block is performing best?", "Who is Team of the Year?", "Give me dashboard summary"];
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Please sign in to use Alox." }, { status: 401 });
  }

  try {
    await initDb();

    const body = await req.json().catch(() => ({}));
    const message = body?.message;
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const facts = await loadFacts();
    const answer: Answer = extraAnswer(message, facts) ?? {
      text: websiteAnswer(message, facts) ||
        generalAnswer(message) ||
        "I didn't catch that. I can answer questions like: best block, top 3, which block needs attention, the leaderboard, Team of the Year, who climbed the most, how the score is calculated, or \"How is C BLOCK doing?\".",
    };
    const m = message.toLowerCase();
    if (!answer.link) answer.link = linkFor(m, facts);
    if (!answer.suggestions) answer.suggestions = followUps(m, facts);

    return NextResponse.json({
      reply: cleanAloxText(answer.text),
      period: facts.periodLabel,
      link: answer.link ?? null,
      suggestions: answer.suggestions.slice(0, 3),
    });
  } catch (error) {
    console.error("Alox API route error:", error);
    return NextResponse.json({ error: "Alox could not answer right now." }, { status: 500 });
  }
}
