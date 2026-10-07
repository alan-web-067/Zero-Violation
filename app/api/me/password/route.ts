// app/api/me/password/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { get, run } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const u = await requireAuth(req);

    let body: { currentPassword?: string; newPassword?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const currentPassword = body.currentPassword?.trim() ?? "";
    const newPassword = body.newPassword?.trim() ?? "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "New password must be different from the current password" }, { status: 400 });
    }

    const row = await get<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [u.uid]
    );
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!bcrypt.compareSync(currentPassword, row.password_hash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newHash, u.uid]);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "Missing token" || message === "Invalid or expired token") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("Change password error:", message);
    return NextResponse.json({ error: "Server error — try again" }, { status: 500 });
  }
}
