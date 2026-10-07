// app/api/users/[id]/route.ts
//
// RBAC FEATURE — User Management edit endpoint: change role, assigned block,
// status (enable/disable), and reset password — all from one PATCH so the
// User Management page can offer each as a focused action. Super Admin /
// Admin only. Safe to remove alongside app/api/users/route.ts and /users page.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, get, run } from "@/lib/db";
import { requireAuth, requireAdmin, Role } from "@/lib/auth";

const ASSIGNABLE_ROLES: Role[] = ["super_admin", "block_manager", "admin", "viewer"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const requester = requireAuth(req);
    requireAdmin(requester);

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

    const target = await get<{ id: number; username: string; role: Role }>(
      `SELECT id, username, role FROM users WHERE id = ?`,
      [id]
    );
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.role !== undefined) {
      const role = String(body.role) as Role;
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.push("role = ?");
      values.push(role);

      // Clear the block assignment when moving away from Block Manager,
      // unless a new assignment is provided in the same request.
      if (role !== "block_manager" && body.assignedBlockId === undefined) {
        updates.push("assigned_block_id = NULL");
      }
    }

    if (body.assignedBlockId !== undefined) {
      const blockId = body.assignedBlockId ? Number(body.assignedBlockId) : null;
      if (blockId) {
        const block = await get<{ id: number }>(`SELECT id FROM blocks WHERE id = ?`, [blockId]);
        if (!block) return NextResponse.json({ error: "Block not found" }, { status: 400 });
      }
      updates.push("assigned_block_id = ?");
      values.push(blockId);
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (status !== "active" && status !== "disabled") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push("status = ?");
      values.push(status);
    }

    if (body.password !== undefined) {
      const password = String(body.password || "").trim();
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      updates.push("password_hash = ?");
      values.push(bcrypt.hashSync(password, 10));
    }

    if (!updates.length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    values.push(id);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
