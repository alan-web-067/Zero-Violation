// app/api/member-reports/route.ts
// HR/ACCOUNTING MEMBERS FEATURE — monthly submission + approval queue
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { requireAuth, nowIso, isFullAdmin, errorStatus } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && !isFullAdmin(user.role) && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const reports = await all<any>(`
      SELECT r.*,
             su.username AS submitted_by_username,
             ru.username AS reviewed_by_username
      FROM monthly_member_reports r
      LEFT JOIN users su ON su.id = r.submitted_by
      LEFT JOIN users ru ON ru.id = r.reviewed_by
      ORDER BY r.year DESC, r.month DESC
    `);

    return NextResponse.json({ reports });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: errorStatus(e) });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr") {
      return NextResponse.json({ error: "HR access required to submit" }, { status: 403 });
    }

    const body = await req.json();
    const { year, month } = body;
    if (!year || !month) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 });
    }

    // Only one report per month — if already exists and not rejected, block re-submit
    const existing = await get<any>(
      `SELECT * FROM monthly_member_reports WHERE year=? AND month=?`,
      [Number(year), Number(month)]
    );

    const ts = nowIso();

    if (existing) {
      if (existing.status === "approved") {
        return NextResponse.json({ error: "This period is already approved" }, { status: 409 });
      }
      // Re-submit rejected report
      await run(
        `UPDATE monthly_member_reports SET status='pending', submitted_by=?, submitted_at=?, reviewed_by=NULL, reviewed_at=NULL, review_note=NULL WHERE id=?`,
        [user.uid, ts, existing.id]
      );
      const report = await get<any>(`SELECT * FROM monthly_member_reports WHERE id=?`, [existing.id]);
      return NextResponse.json({ report });
    }

    const ins = await get<{ id: number }>(
      `INSERT INTO monthly_member_reports(year,month,status,submitted_by,submitted_at,created_at) VALUES(?,?,?,?,?,?) RETURNING id`,
      [Number(year), Number(month), "pending", user.uid, ts, ts]
    );
    const report = await get<any>(`SELECT * FROM monthly_member_reports WHERE id=?`, [ins?.id]);
    return NextResponse.json({ report }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
