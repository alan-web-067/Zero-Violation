// app/api/member-payroll/route.ts
// HR/ACCOUNTING MEMBERS FEATURE — payroll entries created/updated by Accounting
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { requireAuth, nowIso, errorStatus } from "@/lib/auth";

function canAccess(role: string) {
  return role === "accounting" || role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canAccess(user.role) && user.role !== "hr") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("member_id");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    let sql = `SELECT * FROM member_payroll WHERE 1=1`;
    const params: unknown[] = [];
    if (memberId) { sql += ` AND member_id = ?`; params.push(Number(memberId)); }
    if (year)     { sql += ` AND year = ?`;      params.push(Number(year)); }
    if (month)    { sql += ` AND month = ?`;     params.push(Number(month)); }
    sql += ` ORDER BY year DESC, month DESC`;

    const rows = await all<any>(sql, params);
    return NextResponse.json({ payroll: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: errorStatus(e) });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canAccess(user.role)) {
      return NextResponse.json({ error: "Accounting access required" }, { status: 403 });
    }

    const body = await req.json();
    const { member_id, year, month, salary, payment_type, bonus, deduction, notes } = body;
    if (!member_id || !year || !month) {
      return NextResponse.json({ error: "member_id, year, month are required" }, { status: 400 });
    }

    const ts = nowIso();
    const existing = await get<{ id: number }>(
      `SELECT id FROM member_payroll WHERE member_id=? AND year=? AND month=?`,
      [Number(member_id), Number(year), Number(month)]
    );

    if (existing) {
      await run(
        `UPDATE member_payroll SET salary=?,payment_type=?,bonus=?,deduction=?,notes=?,updated_at=? WHERE id=?`,
        [salary ?? null, payment_type || null, bonus ?? 0, deduction ?? 0, notes || null, ts, existing.id]
      );
      const row = await get<any>(`SELECT * FROM member_payroll WHERE id=?`, [existing.id]);
      return NextResponse.json({ payroll: row });
    } else {
      const ins = await get<{ id: number }>(
        `INSERT INTO member_payroll(member_id,year,month,salary,payment_type,bonus,deduction,notes,created_by,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [Number(member_id), Number(year), Number(month), salary ?? null, payment_type || null,
         bonus ?? 0, deduction ?? 0, notes || null, user.uid, ts, ts]
      );
      const row = await get<any>(`SELECT * FROM member_payroll WHERE id=?`, [ins?.id]);
      return NextResponse.json({ payroll: row }, { status: 201 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
