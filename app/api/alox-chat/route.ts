// app/api/alox-chat/route.ts — Alox, the rule-based KPI assistant (no external AI).
// Answers from the latest published month using the same KPI pipeline as every
// page (lib/kpi.ts), so its rankings always match the Leaderboard.
import { NextRequest, NextResponse } from "next/server";
import { initDb, get, all } from "@/lib/db";
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

export const runtime = "nodejs";

type Facts = {
  periodLabel: string | null;
  all: RowWithKpi[];      // sorted, includes "No data" blocks at the end
  ranked: RowWithKpi[];   // blocks with data, best first
  averageKpi: number;
};

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
  const row = await get<{ data_json: string; year: number; month: number }>(
    `SELECT data_json, year, month FROM month_results
     WHERE scope = 'published' ORDER BY year DESC, month DESC LIMIT 1`
  );
  const blockRows = await all<{
    id: number; name: string; team_members: number; trucks: number;
    starting_kpi: number; notes: string; status: "active" | "inactive"; sort_order: number;
  }>(`SELECT * FROM blocks ORDER BY sort_order ASC, id ASC`);

  const defs: BlockDef[] = blockRows.map((b) => ({
    id: String(b.id), name: b.name, teamMembers: b.team_members, trucks: b.trucks,
    startingKpi: b.starting_kpi, notes: b.notes, status: b.status, sortOrder: b.sort_order,
  }));

  let data: Row[] | null = null;
  if (row) {
    try { data = JSON.parse(row.data_json) as Row[]; } catch { data = null; }
  }

  const sorted = sortByKpi(applyKpiToRows(mergeWithBase(data, defs)));
  const ranked = rankedOnly(sorted);
  const averageKpi = ranked.length
    ? Math.round((ranked.reduce((s, r) => s + r.kpi.finalKpi, 0) / ranked.length) * 100) / 100
    : 0;
  const periodLabel = row ? `${MONTHS[row.month - 1]?.name ?? row.month} ${row.year}` : null;

  return { periodLabel, all: sorted, ranked, averageKpi };
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
    "2. Clean discount: up to 30% off, scaled by clean ÷ total inspections (90% clean or more = −30%, 80% = −27%, 50% = −17%).",
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
    return `${lead}\n${describe(named)}`;
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
    return "I can tell you the best block, the top 3, which block needs attention, the full leaderboard, average KPI, perfect blocks, most violations, a monthly summary, how the score is calculated, and details for any block by name (e.g. \"Explain C BLOCK performance\").";
  }
  return null;
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
    const reply =
      websiteAnswer(message, facts) ||
      generalAnswer(message) ||
      "I can answer questions like: best block, top 3, which block needs attention, leaderboard, average KPI, most violations, monthly summary, how the score is calculated, or \"Explain C BLOCK performance\". Try one from the Questions Library below.";

    return NextResponse.json({ reply: cleanAloxText(reply), period: facts.periodLabel });
  } catch (error) {
    console.error("Alox API route error:", error);
    return NextResponse.json({ error: "Alox could not answer right now." }, { status: 500 });
  }
}
