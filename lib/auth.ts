// lib/auth.ts
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { get } from "@/lib/db";

// RBAC FEATURE — widened role union. The original "admin"/"viewer" roles and
// every check built on them keep working unchanged; the four new roles below
// are purely additive. Safe to remove: reverting this union to
// "admin" | "viewer" and removing the helpers below restores prior behavior
// (any account still holding a new role would simply fail `requireAuth`'s
// shape check, same as a malformed token does today).
export type Role = "admin" | "viewer" | "super_admin" | "block_manager" | "hr" | "accounting";

export type JwtUser = { uid: number; username: string; role: Role };

// The dev fallback is never used in production — a missing JWT_SECRET there would
// let anyone forge tokens, so signing/verifying fails loudly instead.
const JWT_SECRET =
  process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev_secret_change_me");

function jwtSecret(): string {
  if (!JWT_SECRET) throw new Error("Server misconfigured: JWT_SECRET is not set");
  return JWT_SECRET;
}

// Roles turned off for now — they can't sign in or use existing tokens.
// Remove a role from this list to bring it back (its code is untouched).
export const DISABLED_ROLES: Role[] = ["hr", "accounting"];

export function signToken(user: {
  id: number;
  username: string;
  role: Role;
}): string {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    jwtSecret(),
    { expiresIn: "7d" }
  );
}

export function readBearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return "";
}

// Verifies the token, then re-checks the account in the DB so disabling a user,
// changing their role, or turning a role off takes effect immediately (not after
// the 7-day token expires). The returned role is the current one from the DB.
export async function requireAuth(req: NextRequest): Promise<JwtUser> {
  const token = readBearer(req);
  if (!token) throw new Error("Missing token");
  let payload: JwtUser;
  try {
    payload = jwt.verify(token, jwtSecret()) as JwtUser;
  } catch {
    throw new Error("Invalid or expired token");
  }
  if (!payload?.uid || !payload?.username || !payload?.role) {
    throw new Error("Invalid or expired token");
  }
  const row = await get<{ username: string; role: Role; status: string | null }>(
    `SELECT username, role, status FROM users WHERE id = ?`,
    [payload.uid]
  );
  if (!row || row.status === "disabled" || DISABLED_ROLES.includes(row.role)) {
    throw new Error("Invalid or expired token");
  }
  return { uid: payload.uid, username: row.username, role: row.role };
}

// RBAC FEATURE — "super_admin" is a full-access role equivalent to "admin" in
// every existing permission check. Centralizing the equivalence here means
// every route that already calls requireAdmin() automatically grants Super
// Admins the same access, with no per-route changes. Safe to remove: deleting
// the `|| user.role === "super_admin"` clause makes requireAdmin() admin-only
// again, exactly as before.
export function isFullAdmin(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

export function requireAdmin(user: JwtUser) {
  if (!isFullAdmin(user.role)) throw new Error("Admin only");
}

// RBAC FEATURE — generic role allow-list check for the new role-scoped routes
// (User Management, drafts). Safe to remove: only the new RBAC routes call
// this; removing it alongside them is a clean extraction.
export function requireRole(user: JwtUser, allowed: Role[]) {
  if (!allowed.includes(user.role)) throw new Error("Forbidden — insufficient role");
}

export function nowIso(): string {
  return new Date().toISOString();
}

// HTTP status for an error caught in a route: sign-in problems → 401, missing
// permission → 403, anything else (e.g. a database hiccup) → 500, so a server
// error is never mistaken for "you are signed out".
export function errorStatus(e: unknown): number {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg === "Missing token" || msg === "Invalid or expired token") return 401;
  if (msg === "Admin only" || msg.startsWith("Forbidden")) return 403;
  return 500;
}
