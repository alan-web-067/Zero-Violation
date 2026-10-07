// app/api/drafts/[id]/discard/route.ts
//
// RBAC FEATURE — deletes a personal draft (status 'draft' or 'pending'):
// either its owner clearing their own work-in-progress / withdrawing a
// submission, or a Super Admin/Admin rejecting a pending Block Manager / HR /
// Accounting submission from the shared review queue. Published rows are kept
// as permanent history and cannot be discarded. Safe to remove alongside the
// rest of app/api/drafts/** and /workspace.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, run } from "@/lib/db";
import { requireAuth, isFullAdmin, errorStatus } from "@/lib/auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const user = await requireAuth(req);
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });

    const draft = await get<{ id: number; user_id: number; status: string }>(
      `SELECT id, user_id, status FROM field_drafts WHERE id = ?`,
      [id]
    );
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    // RBAC FEATURE — both private 'draft' rows (HR/Accounting, before
    // submission) and submitted 'pending' rows (any role's review-queue
    // entry) can be cleared/withdrawn. Only 'published' rows are permanent
    // history and cannot be discarded.
    if (draft.status === "published" || draft.status === "rejected") {
      return NextResponse.json({ error: "Reviewed changes cannot be discarded" }, { status: 409 });
    }

    const isOwner = draft.user_id === user.uid;
    if (!isOwner && !isFullAdmin(user.role)) {
      return NextResponse.json({ error: "You are not allowed to discard this draft" }, { status: 403 });
    }

    await run(`DELETE FROM field_drafts WHERE id = ?`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: errorStatus(e) });
  }
}
