// app/api/auth/login/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { initDb, get, run } from "@/lib/db";
import { signToken, nowIso, Role, DISABLED_ROLES } from "@/lib/auth";

// After this many wrong passwords in a row the account is locked for a while.
// A superadmin can unlock it sooner by resetting the password or re-activating it.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

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
      failed_logins: number | null;
      locked_until: string | null;
    }>(`SELECT id, username, password_hash, role, status, failed_logins, locked_until FROM users WHERE username = ?`, [
      username.trim(),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const lockedMs = user.locked_until ? Date.parse(user.locked_until) - Date.now() : 0;
    if (lockedMs > 0) {
      const minutes = Math.ceil(lockedMs / 60_000);
      return NextResponse.json(
        { error: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an administrator to reset your password.` },
        { status: 429 }
      );
    }

    const passwordMatch = bcrypt.compareSync(password.trim(), user.password_hash);
    if (!passwordMatch) {
      const failed = (user.locked_until ? 0 : Number(user.failed_logins || 0)) + 1;
      if (failed >= MAX_FAILED_LOGINS) {
        const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        await run(`UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?`, [until, user.id]);
        return NextResponse.json(
          { error: `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.` },
          { status: 429 }
        );
      }
      await run(`UPDATE users SET failed_logins = ?, locked_until = NULL WHERE id = ?`, [failed, user.id]);
      const left = MAX_FAILED_LOGINS - failed;
      return NextResponse.json(
        { error: left <= 2 ? `Invalid username or password. ${left} attempt${left === 1 ? "" : "s"} left before the account is locked.` : "Invalid username or password" },
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
    await run(`UPDATE users SET last_login = ?, failed_logins = 0, locked_until = NULL WHERE id = ?`, [nowIso(), user.id]);

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
