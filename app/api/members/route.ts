// app/api/members/route.ts
// HR/ACCOUNTING MEMBERS FEATURE
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { requireAuth, nowIso } from "@/lib/auth";

function canRead(role: string) {
  return role === "hr" || role === "accounting" || role === "admin" || role === "super_admin";
}
function canWrite(role: string) {
  return role === "hr" || role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canRead(user.role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("block_id");
    const search = searchParams.get("search") || "";

    let sql = `
      SELECT m.id, m.first_name, m.last_name, m.date_of_birth, m.date_joined,
             m.employee_id, m.block_id, m.status, m.created_at, m.updated_at,
             b.name AS block_name
      FROM members m
      LEFT JOIN blocks b ON b.id = m.block_id
      WHERE m.status = 'active'
    `;
    const params: unknown[] = [];

    if (blockId) {
      sql += ` AND m.block_id = ?`;
      params.push(Number(blockId));
    }
    if (search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ` AND (m.first_name LIKE ? OR m.last_name LIKE ? OR m.employee_id LIKE ?)`;
      params.push(q, q, q);
    }
    sql += ` ORDER BY b.sort_order ASC, m.last_name ASC, m.first_name ASC`;

    const members = await all<any>(sql, params);
    return NextResponse.json({ members });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canWrite(user.role)) {
      return NextResponse.json({ error: "HR access required" }, { status: 403 });
    }

    const body = await req.json();
    const { first_name, last_name, date_of_birth, date_joined, employee_id, block_id } = body;

    if (!first_name?.trim() || !last_name?.trim() || !employee_id?.trim()) {
      return NextResponse.json({ error: "first_name, last_name, and employee_id are required" }, { status: 400 });
    }

    const existing = await get<{ id: number }>(
      `SELECT id FROM members WHERE employee_id = ? AND status = 'active'`,
      [employee_id.trim()]
    );
    if (existing) {
      return NextResponse.json({ error: "Employee ID already exists" }, { status: 409 });
    }

    const ts = nowIso();
    await run(
      `INSERT INTO members(first_name,last_name,date_of_birth,date_joined,employee_id,block_id,status,created_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [first_name.trim(), last_name.trim(), date_of_birth || null, date_joined || null,
       employee_id.trim(), block_id ? Number(block_id) : null, "active", user.uid, ts, ts]
    );

    const member = await get<any>(`
      SELECT m.id, m.first_name, m.last_name, m.date_of_birth, m.date_joined,
             m.employee_id, m.block_id, m.status, m.created_at, m.updated_at,
             b.name AS block_name
      FROM members m LEFT JOIN blocks b ON b.id = m.block_id
      WHERE m.id = last_insert_rowid()
    `);

    return NextResponse.json({ member }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
