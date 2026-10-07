// app/api/drafts/route.ts
//
// RBAC FEATURE — personal field-level drafts for Block Manager / HR /
// Accounting (and Super Admin/Admin, who may use the same mechanism). Stored
// entirely in the `field_drafts` table — separate from the admin draft/publish
// pipeline (`month_results`) — so these drafts can never affect the Dashboard,
// Reports, Analytics, or Leaderboard until explicitly published.
//
// GET  ?scope=mine     → the caller's own drafts (every status — this list
//                        doubles as each editor's submission history)
// GET  ?scope=pending  → (Super Admin/Admin only) all pending drafts awaiting
//                        review/publish — Block Manager, HR, and Accounting
//                        submissions all land in this single shared queue
// POST                 → create/update one of the caller's drafts. Body may
//                        include `submit: true` to push it straight into the
//                        review queue (status='pending'); otherwise HR/
//                        Accounting saves land in a private 'draft' stage
//                        (see hasDraftStage in lib/permissions.ts) that only
//                        the owner can see — Block Manager/Admin/Super Admin
//                        keep the original "save = submit" behavior.
//
// Safe to remove: deleting this route, app/api/drafts/[id]/**, the
// `field_drafts` table, and the /workspace page removes the entire draft
// system; nothing else references it.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, all, run } from "@/lib/db";
import { requireAuth, requireAdmin, nowIso, Role, errorStatus } from "@/lib/auth";
import { canEditField, isCompanyWideEditor, hasDraftStage, ALL_DRAFT_FIELDS } from "@/lib/permissions";
import { fieldValueError, validPeriod } from "@/lib/kpi";

const DRAFT_ROLES: Role[] = ["block_manager", "hr", "accounting", "admin", "super_admin"];

type DraftRow = {
  id: number;
  user_id: number;
  username: string;
  block_id: string;
  block_name: string | null;
  year: number;
  month: number;
  changes: string;
  status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  reject_reason: string | null;
};

function serializeDraft(r: DraftRow) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    blockId: r.block_id,
    blockName: r.block_name || "",
    year: r.year,
    month: r.month,
    changes: JSON.parse(r.changes || "{}"),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
    rejectReason: r.reject_reason ?? null,
  };
}

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const scope = String(searchParams.get("scope") || "mine");

    if (scope === "pending") {
      requireAdmin(user);
      // RBAC FEATURE — single shared review queue: Block Manager, HR, and
      // Accounting submissions all surface here once status='pending'
      // (i.e. submitted for review). HR/Accounting drafts that haven't been
      // submitted yet (status='draft') stay private and never appear here.
      const rows = await all<DraftRow>(`
        SELECT d.*, u.username AS username, b.name AS block_name
        FROM field_drafts d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN blocks b ON b.id = CAST(d.block_id AS INTEGER)
        WHERE d.status = 'pending'
        ORDER BY d.updated_at DESC
      `);
      return NextResponse.json({ drafts: rows.map(serializeDraft) });
    }

    const rows = await all<DraftRow>(`
      SELECT d.*, u.username AS username, b.name AS block_name
      FROM field_drafts d
      JOIN users u ON u.id = d.user_id
      LEFT JOIN blocks b ON b.id = CAST(d.block_id AS INTEGER)
      WHERE d.user_id = ?
      ORDER BY d.updated_at DESC
    `, [user.uid]);

    return NextResponse.json({ drafts: rows.map(serializeDraft) });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!DRAFT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Your role cannot create drafts" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const blockId = String(body?.blockId || "").trim();
    const year = Number(body?.year);
    const month = Number(body?.month);
    const changes = (body?.changes && typeof body.changes === "object") ? body.changes : {};

    if (!blockId || !year || !month) {
      return NextResponse.json({ error: "Missing blockId/year/month" }, { status: 400 });
    }
    if (!validPeriod(year, month)) {
      return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
    }
    const blockExists = await get<{ id: number }>(`SELECT id FROM blocks WHERE id = ?`, [Number(blockId)]);
    if (!blockExists) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const changeKeys = Object.keys(changes);
    if (!changeKeys.length) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }
    for (const key of changeKeys) {
      if (!ALL_DRAFT_FIELDS.includes(key as any)) {
        return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
      }
      if (!canEditField(user.role, key)) {
        return NextResponse.json({ error: `Your role cannot edit "${key}"` }, { status: 403 });
      }
      const valueError = fieldValueError(key, changes[key]);
      if (valueError) {
        return NextResponse.json({ error: valueError }, { status: 400 });
      }
    }
    if (changes.cleanInspections !== undefined && changes.totalInspections !== undefined &&
        Number(changes.cleanInspections) > Number(changes.totalInspections)) {
      return NextResponse.json({ error: "Clean inspections cannot exceed total inspections" }, { status: 400 });
    }

    // Block Managers may only draft changes for their own assigned block.
    if (!isCompanyWideEditor(user.role)) {
      const me = await get<{ assigned_block_id: number | null }>(
        `SELECT assigned_block_id FROM users WHERE id = ?`,
        [user.uid]
      );
      if (!me?.assigned_block_id || String(me.assigned_block_id) !== blockId) {
        return NextResponse.json({ error: "You can only draft changes for your assigned block" }, { status: 403 });
      }
    }

    const numericChanges: Record<string, number> = {};
    for (const key of changeKeys) numericChanges[key] = Number(changes[key]);

    // RBAC FEATURE — Draft -> Submit for Review -> Approve -> Published.
    // HR/Accounting get a private 'draft' stage (invisible to the Super Admin
    // queue) until they explicitly pass `submit: true`, at which point the
    // row becomes 'pending' and enters the same shared review queue Block
    // Manager submissions use. Block Manager / Admin / Super Admin keep the
    // original "save = submit" behavior (always lands as 'pending').
    // Safe to remove: dropping the `hasDraftStage` branch makes every save
    // land as 'pending' immediately, matching pre-this-change behavior.
    const submitNow = body?.submit === true;
    const status = (hasDraftStage(user.role) && !submitNow) ? "draft" : "pending";

    const ts = nowIso();
    await run(
      `INSERT INTO field_drafts(user_id, block_id, year, month, changes, status, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, block_id, year, month)
       DO UPDATE SET changes = excluded.changes, status = excluded.status, updated_at = excluded.updated_at, published_at = NULL, reject_reason = NULL`,
      [user.uid, blockId, year, month, JSON.stringify(numericChanges), status, ts, ts]
    );

    return NextResponse.json({ ok: true, savedAt: ts, status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: errorStatus(e) });
  }
}
