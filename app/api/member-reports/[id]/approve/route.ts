// app/api/member-reports/[id]/approve/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get } from "@/lib/db";
import { requireAuth, nowIso, isFullAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!isFullAdmin(user.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const report = await get<any>(`SELECT * FROM monthly_member_reports WHERE id=?`, [Number(id)]);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report.status !== "pending") {
      return NextResponse.json({ error: "Report is not pending" }, { status: 409 });
    }
    await run(
      `UPDATE monthly_member_reports SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?`,
      [user.uid, nowIso(), Number(id)]
    );
    const updated = await get<any>(`SELECT * FROM monthly_member_reports WHERE id=?`, [Number(id)]);
    return NextResponse.json({ report: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
