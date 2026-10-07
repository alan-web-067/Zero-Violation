// app/api/users/[id]/route.ts
//
// RBAC FEATURE — User Management edit endpoint: change role, assigned block,
// status (enable/disable), and reset password — all from one PATCH so the
// User Management page can offer each as a focused action. Super Admin /
// Admin only. Safe to remove alongside app/api/users/route.ts and /users page.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { passwordProblem } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { initDb, get, run } from "@/lib/db";
import { requireAuth, requireAdmin, isFullAdmin, Role, errorStatus } from "@/lib/auth";

const ASSIGNABLE_ROLES: Role[] = ["super_admin", "block_manager", "admin", "viewer"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const requester = await requireAuth(req);
    requireAdmin(requester);

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid user id" }, { status: 400 });

    const target = await get<{ id: number; username: string; role: Role; status: string | null }>(
      `SELECT id, username, role, status FROM users WHERE id = ?`,
      [id]
    );
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    // Super Admin accounts can only be created, changed or reset by a Super Admin.
    if ((target.role === "super_admin" || body.role === "super_admin") && requester.role !== "super_admin") {
      return NextResponse.json({ error: "Only a Super Admin can change Super Admin accounts." }, { status: 403 });
    }

    // Never leave the site without someone who can manage it.
    const newRole = body.role !== undefined ? (String(body.role) as Role) : target.role;
    const newStatus = body.status !== undefined ? String(body.status) : target.status ?? "active";
    const staysAdmin = isFullAdmin(newRole) && newStatus !== "disabled";
    if (!staysAdmin && id === requester.uid) {
      return NextResponse.json({ error: "You can't disable or demote your own account." }, { status: 400 });
    }
    if (!staysAdmin && isFullAdmin(target.role) && target.status !== "disabled") {
      const others = await get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users
         WHERE id != ? AND role IN ('admin','super_admin') AND COALESCE(status,'active') != 'disabled'`,
        [id]
      );
      if (!Number(others?.n)) {
        return NextResponse.json({ error: "This is the last active admin account — it can't be disabled or demoted." }, { status: 400 });
      }
    }
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
      if (status === "active") updates.push("failed_logins = 0", "locked_until = NULL");
    }

    if (body.password !== undefined) {
      const password = String(body.password || "").trim();
      const problem = passwordProblem(password);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      // A new password also unlocks an account locked by failed sign-ins.
      updates.push("password_hash = ?", "failed_logins = 0", "locked_until = NULL");
      values.push(bcrypt.hashSync(password, 10));
    }

    if (!updates.length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    values.push(id);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
