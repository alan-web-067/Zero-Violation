// app/api/truck-income/route.ts
// ACCOUNTING FINANCIAL SUMMARY — truck income per block per period (upsert)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { requireAuth, nowIso } from "@/lib/auth";

function canAccess(role: string) {
  return role === "accounting" || role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = requireAuth(req);
    if (!canAccess(user.role)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const year  = Number(searchParams.get("year")  || new Date().getFullYear());
    const month = Number(searchParams.get("month") || new Date().getMonth() + 1);

    const records = await all<any>(`
      SELECT ti.*, b.name as block_name
      FROM truck_income ti
      JOIN blocks b ON b.id = ti.block_id
      WHERE ti.year = ? AND ti.month = ?
      ORDER BY b.sort_order, b.name
    `, [year, month]);

    return NextResponse.json({ records });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = requireAuth(req);
    if (!canAccess(user.role)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = await req.json();
    const { block_id, year, month, amount, notes } = body;
    if (!block_id || !year || !month) {
      return NextResponse.json({ error: "block_id, year, month required" }, { status: 400 });
    }

    const ts = nowIso();
    const existing = await get<{ id: number }>(
      `SELECT id FROM truck_income WHERE block_id=? AND year=? AND month=?`,
      [Number(block_id), Number(year), Number(month)]
    );

    if (existing?.id) {
      await run(
        `UPDATE truck_income SET amount=?, notes=?, updated_at=? WHERE id=?`,
        [Number(amount) || 0, notes || null, ts, existing.id]
      );
    } else {
      await run(
        `INSERT INTO truck_income(block_id,year,month,amount,notes,created_by,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        [Number(block_id), Number(year), Number(month), Number(amount) || 0, notes || null, user.uid, ts, ts]
      );
    }

    const record = await get<any>(`
      SELECT ti.*, b.name as block_name FROM truck_income ti
      JOIN blocks b ON b.id = ti.block_id
      WHERE ti.block_id=? AND ti.year=? AND ti.month=?
    `, [Number(block_id), Number(year), Number(month)]);

    return NextResponse.json({ record });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
