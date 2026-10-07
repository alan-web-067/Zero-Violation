// app/api/users/route.ts
//
// RBAC FEATURE — User Management list/create endpoints. Restricted to
// Super Admin (and "admin", which carries identical permissions via
// isFullAdmin). Safe to remove: deleting this route plus app/api/users/[id]
// and the /users page removes User Management entirely; no other route
// depends on it.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { passwordProblem } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { initDb, get, all, run } from "@/lib/db";
import { requireAuth, requireAdmin, nowIso, Role, errorStatus } from "@/lib/auth";

const ASSIGNABLE_ROLES: Role[] = ["super_admin", "block_manager", "admin", "viewer"];

type UserRow = {
  id: number;
  username: string;
  role: Role;
  status: string | null;
  last_login: string | null;
  locked_until: string | null;
  assigned_block_id: number | null;
  assigned_block_name: string | null;
};

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const rows = await all<UserRow>(`
      SELECT u.id, u.username, u.role, u.status, u.last_login, u.locked_until, u.assigned_block_id,
             b.name AS assigned_block_name
      FROM users u
      LEFT JOIN blocks b ON b.id = u.assigned_block_id
      ORDER BY u.id ASC
    `);

    return NextResponse.json({
      users: rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role,
        status: r.status || "active",
        lastLogin: r.last_login,
        lockedUntil: r.locked_until && Date.parse(r.locked_until) > Date.now() ? r.locked_until : null,
        assignedBlock: r.assigned_block_id
          ? { id: String(r.assigned_block_id), name: r.assigned_block_name || "" }
          : null,
      })),
    });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "").trim();
    const role = String(body?.role || "") as Role;
    const assignedBlockId = body?.assignedBlockId ? Number(body.assignedBlockId) : null;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    const pwProblem = passwordProblem(password);
    if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (role === "super_admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Only a Super Admin can create Super Admin accounts." }, { status: 403 });
    }
    if (role === "block_manager" && !assignedBlockId) {
      return NextResponse.json({ error: "Block Managers must be assigned a block" }, { status: 400 });
    }

    const existing = await get<{ id: number }>(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existing) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    const hash = bcrypt.hashSync(password, 10);
    await run(
      `INSERT INTO users(username, password_hash, role, assigned_block_id, status)
       VALUES(?, ?, ?, ?, 'active')`,
      [username, hash, role, role === "block_manager" ? assignedBlockId : null]
    );

    const created = await get<{ id: number }>(`SELECT id FROM users WHERE username = ?`, [username]);
    if (created?.id) await run(`INSERT OR IGNORE INTO prefs(user_id) VALUES(?)`, [created.id]);

    return NextResponse.json({ ok: true, id: created?.id, createdAt: nowIso() });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
