// app/api/members/[id]/route.ts
// HR/ACCOUNTING MEMBERS FEATURE
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get } from "@/lib/db";
import { requireAuth, nowIso } from "@/lib/auth";

function canRead(role: string) {
  return role === "hr" || role === "accounting" || role === "admin" || role === "super_admin";
}
function canWrite(role: string) {
  return role === "hr" || role === "admin" || role === "super_admin";
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canRead(user.role)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const { id } = await ctx.params;
    const member = await get<any>(`
      SELECT m.*, b.name AS block_name
      FROM members m LEFT JOIN blocks b ON b.id = m.block_id
      WHERE m.id = ? AND m.status = 'active'
    `, [Number(id)]);
    if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ member });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canWrite(user.role)) return NextResponse.json({ error: "HR access required" }, { status: 403 });
    const { id } = await ctx.params;

    const body = await req.json();
    const { first_name, last_name, date_of_birth, date_joined, employee_id, block_id } = body;

    if (!first_name?.trim() || !last_name?.trim() || !employee_id?.trim()) {
      return NextResponse.json({ error: "first_name, last_name, and employee_id are required" }, { status: 400 });
    }

    // Check duplicate employee_id for other records
    const dup = await get<{ id: number }>(
      `SELECT id FROM members WHERE employee_id = ? AND id != ? AND status = 'active'`,
      [employee_id.trim(), Number(id)]
    );
    if (dup) return NextResponse.json({ error: "Employee ID already used by another member" }, { status: 409 });

    await run(
      `UPDATE members SET first_name=?,last_name=?,date_of_birth=?,date_joined=?,employee_id=?,block_id=?,updated_at=? WHERE id=?`,
      [first_name.trim(), last_name.trim(), date_of_birth || null, date_joined || null,
       employee_id.trim(), block_id ? Number(block_id) : null, nowIso(), Number(id)]
    );

    const member = await get<any>(`
      SELECT m.*, b.name AS block_name
      FROM members m LEFT JOIN blocks b ON b.id = m.block_id
      WHERE m.id = ?
    `, [Number(id)]);

    return NextResponse.json({ member });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canWrite(user.role)) return NextResponse.json({ error: "HR access required" }, { status: 403 });
    const { id } = await ctx.params;
    await run(`UPDATE members SET status='deleted', updated_at=? WHERE id=?`, [nowIso(), Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
