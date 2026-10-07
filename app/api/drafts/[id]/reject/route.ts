// app/api/drafts/[id]/reject/route.ts
//
// An admin turns down a pending Block Manager change. The row is kept with
// status 'rejected' and an optional reason, so the Block Manager can see what
// happened; submitting new numbers for the same month replaces it.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, run } from "@/lib/db";
import { requireAuth, requireAdmin, nowIso, errorStatus } from "@/lib/auth";

const MAX_REASON = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason ?? "").trim().slice(0, MAX_REASON);

    const draft = await get<{ id: number; status: string }>(`SELECT id, status FROM field_drafts WHERE id = ?`, [id]);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.status !== "pending") {
      return NextResponse.json({ error: "Only changes waiting for review can be rejected" }, { status: 409 });
    }

    await run(
      `UPDATE field_drafts SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?`,
      [reason || null, nowIso(), id]
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: errorStatus(e) });
  }
}
