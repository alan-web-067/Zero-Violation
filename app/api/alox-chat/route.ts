import { NextRequest, NextResponse } from "next/server";
import { initDb, get } from "@/lib/db";

export const runtime = "nodejs";

type BlockFact = {
  name: string;
  finalKpi: number;
  violationPoints: number;
  totalIns: number;
  cleanIns: number;
  trucks: number;
  status: string;
  isActive: boolean;
};

type DashboardFacts = {
  totalBlocks: number;
  activeBlocks: number;
  bestBlock: BlockFact | null;
  weakestBlock: BlockFact | null;
  averageKpi: number;
  perfectBlocks: BlockFact[];
  excellentBlocks: BlockFact[];
  goodBlocks: BlockFact[];
  poorBlocks: BlockFact[];
  ranking: Array<{
    rank: number;
    name: string;
    finalKpi: number;
    violationPoints: number;
    status: string;
    isActive: boolean;
  }>;
};

function cleanAloxText(text: string) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/```/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function safeNumber(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (value === null || value === undefined) return 0;

  const cleaned = String(value).replace("%", "").trim();

  if (!cleaned || cleaned === "—" || cleaned === "-") return 0;

  const num = Number(cleaned);

  return Number.isFinite(num) ? num : 0;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getValue(item: any, names: string[]) {
  if (!item || typeof item !== "object") return undefined;

  for (const name of names) {
    if (item[name] !== undefined) return item[name];
  }

  const normalizedNames = names.map(normalizeKey);

  for (const key of Object.keys(item)) {
    if (normalizedNames.includes(normalizeKey(key))) {
      return item[key];
    }
  }

  return undefined;
}

function findBlockRows(data: any): any[] {
  if (!data || typeof data !== "object") return [];

  const arrays: any[][] = [];

  function walk(value: any) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      arrays.push(value);
      value.forEach(walk);
      return;
    }

    Object.values(value).forEach(walk);
  }

  walk(data);

  let bestArray: any[] = [];
  let bestScore = 0;

  for (const arr of arrays) {
    let score = 0;

    for (const item of arr) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;

      const keys = Object.keys(item).join(" ").toLowerCase();

      if (keys.includes("block")) score += 5;
      if (keys.includes("kpi")) score += 5;
      if (keys.includes("viol")) score += 3;
      if (keys.includes("status")) score += 2;
      if (keys.includes("inspection") || keys.includes("ins")) score += 1;
      if (keys.includes("truck")) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestArray = arr;
    }
  }

  return bestArray.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item)
  );
}

function buildDashboardFacts(dashboardData: any): DashboardFacts {
  try {
    const rawData = dashboardData?.data || null;
    const rows = findBlockRows(rawData);

    const blocks: BlockFact[] = rows.map((item) => {
      const name =
        getValue(item, ["block", "blockName", "name", "title"]) ||
        "Unknown block";

      const finalKpi = safeNumber(
        getValue(item, [
          "finalKpi",
          "final_kpi",
          "finalKPI",
          "final KPI",
          "kpi",
          "afterClean",
          "after_clean",
        ])
      );

      const violationPoints = safeNumber(
        getValue(item, [
          "violPoints",
          "violationPoints",
          "viol_points",
          "violation_points",
          "points",
          "viol. points",
        ])
      );

      const totalIns = safeNumber(
        getValue(item, [
          "totalIns",
          "total_ins",
          "totalInspections",
          "total_inspections",
          "inspections",
          "total ins.",
          "total ins",
        ])
      );

      const cleanIns = safeNumber(
        getValue(item, [
          "cleanIns",
          "clean_ins",
          "cleanInspections",
          "clean_inspections",
          "clean ins.",
          "clean ins",
        ])
      );

      const trucks = safeNumber(
        getValue(item, ["trucks", "truckCount", "truck_count"])
      );

      const status = getValue(item, ["status", "result", "rating"]) || "";

      const isActive =
        totalIns > 0 || cleanIns > 0 || trucks > 0 || violationPoints > 0;

      return {
        name: String(name),
        finalKpi,
        violationPoints,
        totalIns,
        cleanIns,
        trucks,
        status: String(status),
        isActive,
      };
    });

    const activeBlocks = blocks.filter((b) => b.isActive);
    const rankingBlocks = activeBlocks.length > 0 ? activeBlocks : blocks;

    const ranking = [...rankingBlocks].sort((a, b) => {
      if (a.finalKpi !== b.finalKpi) return a.finalKpi - b.finalKpi;
      return a.violationPoints - b.violationPoints;
    });

    const worstRanking = [...rankingBlocks].sort((a, b) => {
      if (b.finalKpi !== a.finalKpi) return b.finalKpi - a.finalKpi;
      return b.violationPoints - a.violationPoints;
    });

    const averageKpi =
      rankingBlocks.length > 0
        ? rankingBlocks.reduce((sum, b) => sum + b.finalKpi, 0) /
          rankingBlocks.length
        : 0;

    const byStatus = (statusName: string) =>
      blocks.filter(
        (b) => b.status.toLowerCase() === statusName.toLowerCase()
      );

    return {
      totalBlocks: blocks.length,
      activeBlocks: activeBlocks.length,
      bestBlock: ranking[0] || null,
      weakestBlock: worstRanking[0] || null,
      averageKpi: Number(averageKpi.toFixed(2)),
      perfectBlocks: byStatus("Perfect"),
      excellentBlocks: byStatus("Excellent"),
      goodBlocks: byStatus("Good"),
      poorBlocks: byStatus("Poor"),
      ranking: ranking.map((b, index) => ({
        rank: index + 1,
        name: b.name,
        finalKpi: b.finalKpi,
        violationPoints: b.violationPoints,
        status: b.status,
        isActive: b.isActive,
      })),
    };
  } catch (error) {
    console.error("Alox buildDashboardFacts error:", error);

    return {
      totalBlocks: 0,
      activeBlocks: 0,
      bestBlock: null,
      weakestBlock: null,
      averageKpi: 0,
      perfectBlocks: [],
      excellentBlocks: [],
      goodBlocks: [],
      poorBlocks: [],
      ranking: [],
    };
  }
}

function isGreeting(message: string) {
  const m = message.trim().toLowerCase();

  return [
    "hi",
    "hello",
    "hey",
    "hii",
    "hiii",
    "ok",
    "okay",
    "salom",
    "assalomu aleykum",
    "assalamu alaykum",
  ].includes(m);
}

function isHowAreYou(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("how are you") ||
    m.includes("how r u") ||
    m.includes("how are u") ||
    m.includes("how you doing") ||
    m.includes("how are you doing")
  );
}

function wantsBestBlock(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("best block") ||
    m.includes("winner") ||
    m.includes("top block") ||
    m.includes("which block is best") ||
    m.includes("which block is the best") ||
    m.includes("block is best") ||
    m.includes("block is the best") ||
    m.includes("best now") ||
    m.includes("best right now")
  );
}

function wantsWeakBlock(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("needs improvement") ||
    m.includes("need improvement") ||
    m.includes("worst block") ||
    m.includes("weak block") ||
    m.includes("which block is bad") ||
    m.includes("which block is the worst") ||
    m.includes("needs attention") ||
    m.includes("need attention") ||
    m.includes("attention")
  );
}

function wantsSummary(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("june summary") ||
    m.includes("monthly summary") ||
    m.includes("short summary") ||
    m.includes("report summary") ||
    m.includes("summary")
  );
}

function wantsPerfectBlocks(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("perfect blocks") ||
    m.includes("show perfect") ||
    m.includes("which blocks are perfect") ||
    m.includes("perfect block")
  );
}

function wantsAverageKpi(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("average kpi") ||
    m.includes("avg kpi") ||
    m.includes("average performance")
  );
}

function wantsActiveBlocks(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("active blocks") ||
    m.includes("how many active") ||
    m.includes("active block")
  );
}

function wantsRanking(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("ranking") ||
    m.includes("rank") ||
    m.includes("leaderboard") ||
    m.includes("top blocks")
  );
}

function wantsDashboardPageHelp(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("dashboard page") ||
    m.includes("what is dashboard") ||
    m.includes("explain dashboard")
  );
}

function wantsReportsPageHelp(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("reports page") ||
    m.includes("what is reports") ||
    m.includes("explain reports") ||
    m.includes("report page")
  );
}

function wantsAdminPageHelp(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("admin page") ||
    m.includes("admin edit") ||
    m.includes("admin / edit") ||
    m.includes("edit page")
  );
}

function wantsAnalyticsPageHelp(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("analytics page") ||
    m.includes("what is analytics") ||
    m.includes("explain analytics")
  );
}

function wantsCompanyLookupHelp(message: string) {
  const m = message.trim().toLowerCase();

  return (
    m.includes("company lookup") ||
    m.includes("lookup page") ||
    m.includes("company search")
  );
}

function formatBlockList(blocks: BlockFact[]) {
  if (!blocks.length) return "No blocks found.";
  return blocks.map((b) => b.name).join(", ");
}

function localWebsiteAnswer(message: string, facts: DashboardFacts) {
  if (wantsBestBlock(message)) {
    if (!facts.bestBlock) return "I need dashboard data to answer exactly.";

    return `${facts.bestBlock.name} is the best active block now. Its final KPI is ${facts.bestBlock.finalKpi}. Lower KPI is better.`;
  }

  if (wantsWeakBlock(message)) {
    if (!facts.weakestBlock) return "I need dashboard data to answer exactly.";

    return `${facts.weakestBlock.name} needs the most attention. Its final KPI is ${facts.weakestBlock.finalKpi}, and violation points are ${facts.weakestBlock.violationPoints}.`;
  }

  if (wantsSummary(message)) {
    if (!facts.bestBlock || !facts.weakestBlock) {
      return "I need dashboard data to answer exactly.";
    }

    return `Summary: ${facts.activeBlocks} blocks are active. Average KPI is ${facts.averageKpi}. Best active block is ${facts.bestBlock.name}. ${facts.weakestBlock.name} needs more attention.`;
  }

  if (wantsPerfectBlocks(message)) {
    return `Perfect blocks: ${formatBlockList(facts.perfectBlocks)}.`;
  }

  if (wantsAverageKpi(message)) {
    return `Average KPI is ${facts.averageKpi}. Lower KPI is better.`;
  }

  if (wantsActiveBlocks(message)) {
    return `${facts.activeBlocks} blocks are active now.`;
  }

  if (wantsRanking(message)) {
    if (!facts.ranking.length) return "I need dashboard data to show ranking.";

    const top = facts.ranking
      .slice(0, 5)
      .map((b) => `${b.rank}. ${b.name} — KPI ${b.finalKpi}`)
      .join("\n");

    return `Top ranking:\n${top}`;
  }

  if (wantsDashboardPageHelp(message)) {
    return "Dashboard page shows the main picture. It shows best block, weak block, average KPI, active blocks, status summary, and KPI trend.";
  }

  if (wantsReportsPageHelp(message)) {
    return "Reports page shows monthly and quarterly results. It helps you prepare CSV, PDF, and management summaries.";
  }

  if (wantsAdminPageHelp(message)) {
    return "Admin / Edit page is where admins change the numbers. You can update blocks, trucks, inspections, violation points, staff adjustment, and KPI data there.";
  }

  if (wantsAnalyticsPageHelp(message)) {
    return "Analytics page helps you understand trends. It can show changes by block, month, and performance.";
  }

  if (wantsCompanyLookupHelp(message)) {
    return "Company Lookup page helps you search company information and review company details.";
  }

  return null;
}

function localGeneralAnswer(message: string) {
  const m = message.trim().toLowerCase();

  if (isGreeting(message)) {
    return "Hello. I am Alox, your KPI adviser assistant. Ask me about block performance, KPI, drivers, trucks, or any page on this dashboard.";
  }

  if (isHowAreYou(message)) {
    return "I am running well and ready to help with your dashboard data.";
  }

  if (
    m.includes("who are you") ||
    m.includes("who r u") ||
    m.includes("what is alox") ||
    m.includes("what's alox") ||
    m.includes("what are you")
  ) {
    return "I am Alox — the KPI adviser assistant for Zero Violations. I read your dashboard data directly and can answer questions about blocks, KPI scores, drivers, checked trucks, rankings, and what each page shows.";
  }

  if (m.includes("what can you answer") || m.includes("what can you do") || m.includes("how can you help")) {
    return "I can tell you which block is performing best or needs attention, explain KPI and ranking, summarize the current month, list active or perfect blocks, and walk you through any page on this dashboard. Open the Questions Library below for ready-made examples.";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    await initDb();

    const body = await req.json();

    const message = body.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const row = await get<any>(
      `SELECT data_json, updated_at, year, month, scope
       FROM month_results
       WHERE scope = ?
       ORDER BY year DESC, month DESC
       LIMIT 1`,
      ["published"]
    );

    let dashboardData: any = null;

    if (row) {
      try {
        dashboardData = {
          year: row.year,
          month: row.month,
          scope: row.scope,
          updated_at: row.updated_at,
          data: JSON.parse(row.data_json),
        };
      } catch (error) {
        console.error("Alox JSON parse error:", error);
      }
    }

    const calculatedFacts = buildDashboardFacts(dashboardData);

    const websiteAnswer = localWebsiteAnswer(message, calculatedFacts);
    const generalAnswer = localGeneralAnswer(message);

    const reply =
      websiteAnswer ||
      generalAnswer ||
      "I am Alox, your KPI adviser assistant. I can answer questions like best block, needs improvement, monthly summary, average KPI, active blocks, ranking, drivers, checked trucks, and page explanations — try one from the Questions Library below.";

    return NextResponse.json({
      reply: cleanAloxText(reply),
      usedData: dashboardData
        ? {
            year: dashboardData.year,
            month: dashboardData.month,
            scope: dashboardData.scope,
            updated_at: dashboardData.updated_at,
          }
        : null,
      calculatedFacts,
    });
  } catch (error: any) {
    console.error("Alox API route error:", error);

    return NextResponse.json(
      {
        error: "Alox could not answer right now. Please check the route.ts code.",
      },
      { status: 500 }
    );
  }
}