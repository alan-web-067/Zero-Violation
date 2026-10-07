// app/api/me/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const u = await requireAuth(req);
    const row = await get<{ avatar_url: string | null; assigned_block_id: number | null }>(
      `SELECT avatar_url, assigned_block_id FROM users WHERE id = ?`,
      [u.uid]
    );

    // RBAC FEATURE — resolve the Block Manager's assigned block name so the
    // client doesn't need a second round trip. Safe to remove: the field is
    // additive (`assignedBlock: null` for every other role).
    let assignedBlock: { id: string; name: string } | null = null;
    if (row?.assigned_block_id) {
      const block = await get<{ id: number; name: string }>(
        `SELECT id, name FROM blocks WHERE id = ?`,
        [row.assigned_block_id]
      );
      if (block) assignedBlock = { id: String(block.id), name: block.name };
    }

    return NextResponse.json({
      user: {
        username: u.username,
        role: u.role,
        avatarUrl: row?.avatar_url ?? null,
        assignedBlock,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
