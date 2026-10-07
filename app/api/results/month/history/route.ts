// app/api/results/month/history/route.ts — who published a month, and when (admins only).
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, all } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";
import { validPeriod } from "@/lib/kpi";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status });
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!validPeriod(year, month)) return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });

  const rows = await all<{ id: number; published_at: string; username: string | null; kind: string | null; has_snapshot: number }>(
    `SELECT id, published_at, username, kind, (data_json IS NOT NULL) AS has_snapshot
     FROM publish_log WHERE year = ? AND month = ? ORDER BY id DESC LIMIT 20`,
    [year, month]
  );

  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id,
      at: r.published_at,
      by: r.username ?? "—",
      kind: r.kind ?? "publish",
      canRestore: Boolean(r.has_snapshot),
    })),
  });
}
