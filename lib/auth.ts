// lib/auth.ts
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// RBAC FEATURE — widened role union. The original "admin"/"viewer" roles and
// every check built on them keep working unchanged; the four new roles below
// are purely additive. Safe to remove: reverting this union to
// "admin" | "viewer" and removing the helpers below restores prior behavior
// (any account still holding a new role would simply fail `requireAuth`'s
// shape check, same as a malformed token does today).
export type Role = "admin" | "viewer" | "super_admin" | "block_manager" | "hr" | "accounting";

export type JwtUser = { uid: number; username: string; role: Role };

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

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
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function readBearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return "";
}

export function requireAuth(req: NextRequest): JwtUser {
  const token = readBearer(req);
  if (!token) throw new Error("Missing token");
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtUser;
    if (!payload?.uid || !payload?.username || !payload?.role) {
      throw new Error("Malformed token");
    }
    if (DISABLED_ROLES.includes(payload.role)) throw new Error("Role disabled");
    return payload;
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
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
