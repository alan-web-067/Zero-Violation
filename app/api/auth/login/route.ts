// app/api/auth/login/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, get, run } from "@/lib/db";
import { signToken, nowIso, Role, DISABLED_ROLES } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await initDb();

    let body: { username?: string; password?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { username, password } = body;

    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await get<{
      id: number;
      username: string;
      password_hash: string;
      role: Role;
      status: string | null;
    }>(`SELECT id, username, password_hash, role, status FROM users WHERE username = ?`, [
      username.trim(),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const passwordMatch = bcrypt.compareSync(password.trim(), user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // RBAC FEATURE — accounts disabled from User Management cannot sign in.
    // Safe to remove: deleting this check lets disabled accounts log in again,
    // matching pre-RBAC behavior (no account could be disabled before).
    if (user.status === "disabled" || DISABLED_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "This account has been disabled. Contact your administrator." },
        { status: 403 }
      );
    }

    // Ensure prefs row exists for this user
    await run(`INSERT OR IGNORE INTO prefs(user_id) VALUES(?)`, [user.id]);

    // RBAC FEATURE — track last login for the User Management table.
    await run(`UPDATE users SET last_login = ? WHERE id = ?`, [nowIso(), user.id]);

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return NextResponse.json({
      token,
      user: { username: user.username, role: user.role },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Login error:", message);
    return NextResponse.json({ error: "Server error — try again" }, { status: 500 });
  }
}
