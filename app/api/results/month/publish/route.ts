// app/api/results/month/publish/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, run } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const body = await req.json().catch(() => ({}));
    const { year, month } = body || {};
    if (!year || !month) return NextResponse.json({ error: "Missing year/month" }, { status: 400 });

    const draft = await get<any>(
      `SELECT data_json FROM month_results WHERE scope='draft' AND year=? AND month=?`,
      [Number(year), Number(month)]
    );
    if (!draft) return NextResponse.json({ error: "No draft data to publish" }, { status: 400 });

    const published_at = nowIso();

    await run(
      `INSERT INTO month_results(scope,year,month,data_json,updated_at)
       VALUES('published',?,?,?,?)
       ON CONFLICT(scope,year,month)
       DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`,
      [Number(year), Number(month), draft.data_json, published_at]
    );

    return NextResponse.json({ ok: true, published_at });
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
