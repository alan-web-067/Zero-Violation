// app/api/blocks/route.ts — shared block registry (used by Reports, Dashboard, Analytics, Leaderboard, Admin)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  await initDb();
  try {
    requireAuth(req);
    const rows = await all<BlockRow>(`SELECT * FROM blocks ORDER BY sort_order ASC, id ASC`);
    return NextResponse.json({ blocks: rows.map(toApi) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = requireAuth(req);
    requireAdmin(user);

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "Block name is required" }, { status: 400 });

    const teamMembers = Number(body?.teamMembers) || 0;
    const trucks = Number(body?.trucks) || 0;
    const startingKpi = Number(body?.startingKpi) || 0;
    const notes = String(body?.notes || "").trim();

    const existing = await get<{ id: number }>(`SELECT id FROM blocks WHERE name = ?`, [name]);
    if (existing) return NextResponse.json({ error: "A block with this name already exists" }, { status: 409 });

    const maxOrder = await get<{ m: number }>(`SELECT COALESCE(MAX(sort_order), -1) as m FROM blocks`);
    const ts = nowIso();

    await run(
      `INSERT INTO blocks(name, team_members, trucks, starting_kpi, notes, status, sort_order, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [name, teamMembers, trucks, startingKpi, notes, (maxOrder?.m ?? -1) + 1, ts, ts]
    );

    const created = await get<BlockRow>(`SELECT * FROM blocks WHERE name = ?`, [name]);
    return NextResponse.json({ ok: true, block: created ? toApi(created) : null });
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
