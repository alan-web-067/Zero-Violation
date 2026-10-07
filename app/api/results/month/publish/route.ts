// app/api/results/month/publish/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, withTransaction, logPublish } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const body = await req.json().catch(() => ({}));
    const { year, month } = body || {};
    if (!year || !month) return NextResponse.json({ error: "Missing year/month" }, { status: 400 });

    const y = Number(year), m = Number(month);
    const published_at = nowIso();
    const ok = await withTransaction(async (tx) => {
      const draft = await tx.get<{ data_json: string }>(
        `SELECT data_json FROM month_results WHERE scope='draft' AND year=? AND month=?`,
        [y, m]
      );
      if (!draft) return false;
      await tx.run(
        `INSERT INTO month_results(scope,year,month,data_json,updated_at)
         VALUES('published',?,?,?,?)
         ON CONFLICT(scope,year,month)
         DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`,
        [y, m, draft.data_json, published_at]
      );
      await logPublish(tx, { year: y, month: m, userId: user.uid, username: user.username, kind: "publish", at: published_at });
      return true;
    });
    if (!ok) return NextResponse.json({ error: "No draft data to publish" }, { status: 400 });

    return NextResponse.json({ ok: true, published_at });
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
