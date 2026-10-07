// app/api/drafts/[id]/publish/route.ts
//
// RBAC FEATURE — promotes one personal field-draft into the live published
// data (the same `month_results` "published" scope the Dashboard/Reports/
// Analytics/Leaderboard already read from), merging only the changed
// field(s) for that one block/period — everything else in published data is
// left untouched.
//
// Who can publish:
//   • The draft's own owner, if their role can self-publish (HR, Accounting,
//     Admin, Super Admin).
//   • Any Super Admin / Admin, for a pending Block Manager draft (the
//     "approve & publish" review flow).
//
// Safe to remove alongside the rest of app/api/drafts/** and /workspace.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, withTransaction } from "@/lib/db";
import { requireAuth, isFullAdmin, nowIso } from "@/lib/auth";
import { canSelfPublish, DraftField } from "@/lib/permissions";
import { Row } from "@/lib/kpi";

type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];

// Merges the approved field(s) into one scope's saved month. The admin "draft"
// scope is only touched if it exists — otherwise the next admin Publish (which
// copies draft → published) would silently overwrite the approved change.
async function mergeChangeInto(
  tx: Tx,
  scope: "published" | "draft",
  blockId: string,
  year: number,
  month: number,
  changes: Partial<Record<DraftField, number>>,
  ts: string
) {
  const existing = await tx.get<{ data_json: string }>(
    `SELECT data_json FROM month_results WHERE scope=? AND year=? AND month=?`,
    [scope, year, month]
  );
  if (!existing && scope === "draft") return;

  let rows: Row[] = [];
  if (existing) {
    try { rows = JSON.parse(existing.data_json) as Row[]; } catch { rows = []; }
  }
  const idx = rows.findIndex((r) => String(r.id) === blockId);

  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...changes };
  } else {
    const block = await tx.get<{ id: number; name: string; team_members: number; trucks: number }>(
      `SELECT id, name, team_members, trucks FROM blocks WHERE id = ?`,
      [Number(blockId)]
    );
    if (block) {
      rows.push({
        id: String(block.id),
        name: block.name,
        teamMembers: block.team_members,
        trucks: block.trucks,
        cleanInspections: 0,
        totalInspections: 0,
        violationPoints: 0,
        periodMonths: 1,
        ...changes,
      });
    }
  }

  await tx.run(
    `INSERT INTO month_results(scope, year, month, data_json, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(scope, year, month)
     DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
    [scope, year, month, JSON.stringify(rows), ts]
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const user = await requireAuth(req);
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!id) return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });

    const draft = await get<{
      id: number; user_id: number; block_id: string; year: number; month: number;
      changes: string; status: string;
    }>(`SELECT * FROM field_drafts WHERE id = ?`, [id]);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.status === "published") {
      return NextResponse.json({ error: "Draft already published" }, { status: 409 });
    }

    const isOwner = draft.user_id === user.uid;
    const ownerCanSelfPublish = isOwner && canSelfPublish(user.role);
    const reviewerCanPublish = !isOwner && isFullAdmin(user.role);

    if (!ownerCanSelfPublish && !reviewerCanPublish) {
      return NextResponse.json({ error: "You are not allowed to publish this draft" }, { status: 403 });
    }

    let changes: Partial<Record<DraftField, number>>;
    try { changes = JSON.parse(draft.changes || "{}"); } catch {
      return NextResponse.json({ error: "Draft data is corrupted" }, { status: 422 });
    }

    const published_at = nowIso();
    const alreadyPublished = await withTransaction(async (tx) => {
      // Re-check inside the transaction so two approvals of the same draft can't both apply.
      const fresh = await tx.get<{ status: string }>(`SELECT status FROM field_drafts WHERE id = ?`, [id]);
      if (fresh?.status === "published") return true;
      await mergeChangeInto(tx, "published", draft.block_id, draft.year, draft.month, changes, published_at);
      await mergeChangeInto(tx, "draft", draft.block_id, draft.year, draft.month, changes, published_at);
      await tx.run(
        `UPDATE field_drafts SET status = 'published', updated_at = ?, published_at = ? WHERE id = ?`,
        [published_at, published_at, id]
      );
      return false;
    });
    if (alreadyPublished) {
      return NextResponse.json({ error: "Draft already published" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, publishedAt: published_at });
  } catch (e: any) {
    const msg = String(e?.message || "Error");
    const status = /token/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
