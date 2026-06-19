// lib/permissions.ts
//
// RBAC FEATURE — central definitions for the role-based access system added
// on top of the existing admin/viewer model. Nothing in the existing app
// imports from this file, so deleting it (along with the routes/pages that
// use it) cleanly removes the whole RBAC layer with no dangling references.
export const runtime = "nodejs";

import type { Role } from "@/lib/auth";
import { Row } from "@/lib/kpi";

// RBAC FEATURE — client-safe copy of lib/auth.ts's isFullAdmin().
//
// Why duplicated instead of imported: lib/auth.ts also pulls in
// `jsonwebtoken` and `next/server` (both server-only — jsonwebtoken needs
// Node's `crypto`, next/server is banned in Client Components). Importing
// *any* runtime value from lib/auth.ts drags that whole module graph into
// the browser bundle. AdminProfileMenu (rendered on every page via AppShell)
// previously imported `isFullAdmin` from lib/auth.ts directly, which forced
// Turbopack to bundle jsonwebtoken/next/server for the browser — causing
// constant recompiles, broken chunks, blank screens, and high CPU on every
// authenticated page load. This file has zero server-only imports, so
// client components should always get `isFullAdmin` from here instead.
export function isFullAdmin(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

// The Row fields a draft can change. Each role may only touch a subset.
export type DraftField = "teamMembers" | "trucks" | "cleanInspections" | "totalInspections" | "violationPoints";

export const ALL_DRAFT_FIELDS: DraftField[] = [
  "teamMembers", "trucks", "cleanInspections", "totalInspections", "violationPoints",
];

// Which Row fields each role is allowed to write into a draft / publish directly.
// Super Admin / Admin are governed by the existing Admin page, not this map —
// they are listed here only so shared helpers can recognize "full access".
export const EDITABLE_FIELDS_BY_ROLE: Record<Role, DraftField[]> = {
  admin:         ALL_DRAFT_FIELDS,
  super_admin:   ALL_DRAFT_FIELDS,
  block_manager: ALL_DRAFT_FIELDS,
  hr:            ["teamMembers"],
  accounting:    ["trucks"],
  viewer:        [],
};

export function fieldsAllowedFor(role: Role): DraftField[] {
  return EDITABLE_FIELDS_BY_ROLE[role] ?? [];
}

// True if `role` may include `field` in a draft submission.
export function canEditField(role: Role, field: string): field is DraftField {
  return (fieldsAllowedFor(role) as string[]).includes(field);
}

// True if `role` may create/edit drafts for arbitrary blocks (HR/Accounting,
// who operate company-wide) vs. being restricted to one assigned block
// (Block Manager).
export function isCompanyWideEditor(role: Role): boolean {
  return role === "hr" || role === "accounting" || role === "admin" || role === "super_admin";
}

// RBAC FEATURE — only Admin / Super Admin may publish a draft directly.
// HR and Accounting used to self-publish; per the updated workflow every
// HR/Accounting change must now go through the same Super Admin review queue
// as Block Manager drafts (Draft -> Submit for Review -> Approve -> Published).
// Safe to remove: restoring `|| role === "hr" || role === "accounting"` here
// reverts to the old self-publish behavior.
export function canSelfPublish(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

// RBAC FEATURE — roles whose drafts go through a private "draft" stage before
// being submitted into the Super Admin review queue (HR/Accounting). Block
// Manager drafts skip straight to "pending" on save — unchanged from before.
export function hasDraftStage(role: Role): boolean {
  return role === "hr" || role === "accounting";
}

export function isBlockManager(role: Role): boolean {
  return role === "block_manager";
}

// Friendly labels shown in the UI (User Management table, profile menu, etc.)
export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  viewer: "Viewer",
  super_admin: "Super Admin",
  block_manager: "Block Manager",
  hr: "HR",
  accounting: "Accounting",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

// Applies a partial set of field changes onto a base Row, returning a new Row.
// Used both by the What-If simulator (preview) and by the publish step
// (merging an approved draft into the live published data).
export function applyDraftChanges(base: Row, changes: Partial<Record<DraftField, number>>): Row {
  return { ...base, ...changes };
}
