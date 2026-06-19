// app/api/results/month/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get } from "@/lib/db";
import { requireAuth, isFullAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = requireAuth(req);

    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    const scope = String(searchParams.get("scope") || "published");

    if (!year || !month) return NextResponse.json({ error: "Missing year/month" }, { status: 400 });

    // PERMISSIONS FIX — super_admin must see draft-scope data exactly like
    // admin (isFullAdmin covers both); everyone else stays published-only.
    if (!isFullAdmin(user.role) && scope !== "published") {
      return NextResponse.json({ error: "Viewer can only read published" }, { status: 403 });
    }

    const row = await get<any>(
      `SELECT data_json, updated_at FROM month_results WHERE scope=? AND year=? AND month=?`,
      [scope, year, month]
    );

    if (!row) return NextResponse.json({ data: null, updated_at: null });

    return NextResponse.json({ data: JSON.parse(row.data_json), updated_at: row.updated_at });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}
