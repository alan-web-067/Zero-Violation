// app/api/results/month/draft/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth, errorStatus } from "@/lib/auth";
import { monthRowsError, validPeriod } from "@/lib/kpi";

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const body = await req.json().catch(() => ({}));
    const { year, month, data } = body || {};
    if (!year || !month || !data) return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    if (!validPeriod(Number(year), Number(month))) return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
    const dataError = monthRowsError(data);
    if (dataError) return NextResponse.json({ error: dataError }, { status: 400 });

    const updated_at = nowIso();
    const json = JSON.stringify(data);

    await run(
      `INSERT INTO month_results(scope,year,month,data_json,updated_at)
       VALUES('draft',?,?,?,?)
       ON CONFLICT(scope,year,month)
       DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`,
      [Number(year), Number(month), json, updated_at]
    );

    return NextResponse.json({ ok: true, updated_at });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
