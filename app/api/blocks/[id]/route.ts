// app/api/blocks/[id]/route.ts — edit / rename / activate-deactivate a shared block
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth, errorStatus } from "@/lib/auth";

type BlockRow = {
  id: number;
  name: string;
  team_members: number;
  trucks: number;
  starting_kpi: number;
  notes: string;
  status: "active" | "inactive";
  sort_order: number;
};

function toApi(b: BlockRow) {
  return {
    id: String(b.id),
    name: b.name,
    teamMembers: b.team_members,
    trucks: b.trucks,
    startingKpi: b.starting_kpi,
    notes: b.notes,
    status: b.status,
    sortOrder: b.sort_order,
  };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  try {
    const user = await requireAuth(req);
    requireAdmin(user);

    const { id } = await ctx.params;
    const blockId = Number(id);
    if (!blockId) return NextResponse.json({ error: "Invalid block id" }, { status: 400 });

    const existing = await get<BlockRow>(`SELECT * FROM blocks WHERE id = ?`, [blockId]);
    if (!existing) return NextResponse.json({ error: "Block not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    const fields: string[] = [];
    const params: unknown[] = [];

    if (body?.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: "Block name is required" }, { status: 400 });
      if (name.length > 60) return NextResponse.json({ error: "Block name is too long (max 60)" }, { status: 400 });
      const dupe = await get<{ id: number }>(`SELECT id FROM blocks WHERE name = ? AND id != ?`, [name, blockId]);
      if (dupe) return NextResponse.json({ error: "A block with this name already exists" }, { status: 409 });
      fields.push("name = ?");
      params.push(name);
    }

    if (body?.teamMembers !== undefined) {
      const v = Number(body.teamMembers);
      if (Number.isNaN(v) || v < 0) return NextResponse.json({ error: "Team Members must be a number ≥ 0" }, { status: 400 });
      fields.push("team_members = ?");
      params.push(v);
    }

    if (body?.trucks !== undefined) {
      const v = Number(body.trucks);
      if (Number.isNaN(v) || v < 0) return NextResponse.json({ error: "Trucks must be a number ≥ 0" }, { status: 400 });
      fields.push("trucks = ?");
      params.push(v);
    }

    if (body?.startingKpi !== undefined) {
      const v = Number(body.startingKpi);
      if (Number.isNaN(v) || v < 0) return NextResponse.json({ error: "Starting KPI Score must be a number ≥ 0" }, { status: 400 });
      fields.push("starting_kpi = ?");
      params.push(v);
    }

    if (body?.notes !== undefined) {
      const notes = String(body.notes).trim();
      if (notes.length > 1000) return NextResponse.json({ error: "Notes are too long (max 1000)" }, { status: 400 });
      fields.push("notes = ?");
      params.push(notes);
    }

    if (body?.status !== undefined) {
      const status = String(body.status);
      if (status !== "active" && status !== "inactive") {
        return NextResponse.json({ error: "Status must be 'active' or 'inactive'" }, { status: 400 });
      }
      fields.push("status = ?");
      params.push(status);
    }

    if (fields.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    fields.push("updated_at = ?");
    params.push(nowIso());
    params.push(blockId);

    await run(`UPDATE blocks SET ${fields.join(", ")} WHERE id = ?`, params);

    const updated = await get<BlockRow>(`SELECT * FROM blocks WHERE id = ?`, [blockId]);
    return NextResponse.json({ ok: true, block: updated ? toApi(updated) : null });
  } catch (e: any) {
    const status = errorStatus(e);
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
