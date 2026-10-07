// app/api/results/year/route.ts — every saved month of a year in ONE request.
// Dashboard trend / Analytics used to fetch each month (×2 scopes for admins)
// separately: ~24–50 round trips. Same visibility rules as /api/results/month.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, all } from "@/lib/db";
import { requireAuth, isFullAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  let user;
  try {
    user = await requireAuth(req);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }

  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  // Viewers / block managers only ever see published data.
  const scopes = isFullAdmin(user.role) ? ["draft", "published"] : ["published"];
  const rows = await all<{ scope: string; month: number; data_json: string }>(
    `SELECT scope, month, data_json FROM month_results
     WHERE year = ? AND scope IN (${scopes.map(() => "?").join(",")})`,
    [year, ...scopes]
  );

  // { "1": { draft: Row[] | null, published: Row[] | null }, ... }
  const months: Record<string, { draft: unknown; published: unknown }> = {};
  for (const r of rows) {
    let data: unknown = null;
    try { data = JSON.parse(r.data_json); } catch { /* corrupted month → treated as missing */ }
    const slot = (months[String(r.month)] ??= { draft: null, published: null });
    if (r.scope === "draft") slot.draft = data;
    else slot.published = data;
  }

  return NextResponse.json({ year, months });
}
