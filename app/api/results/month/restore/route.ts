// app/api/results/month/restore/route.ts — republish an earlier version of a month
// from the publish history (admins only). Also resets the admin draft to it, so
// the next Publish doesn't bring the replaced numbers back.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, withTransaction, logPublish } from "@/lib/db";
import { nowIso, requireAdmin, requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await initDb();
  let user;
  try {
    user = await requireAuth(req);
    requireAdmin(user);
  } catch (e: any) {
    const status = e.message === "Admin only" ? 403 : 401;
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status });
  }

  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Missing history id" }, { status: 400 });

  const at = nowIso();
  const result = await withTransaction(async (tx) => {
    const entry = await tx.get<{ year: number; month: number; data_json: string | null }>(
      `SELECT year, month, data_json FROM publish_log WHERE id = ?`,
      [id]
    );
    if (!entry || !entry.data_json) return null;
    for (const scope of ["published", "draft"]) {
      await tx.run(
        `INSERT INTO month_results(scope, year, month, data_json, updated_at)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(scope, year, month)
         DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
        [scope, entry.year, entry.month, entry.data_json, at]
      );
    }
    await logPublish(tx, { year: entry.year, month: entry.month, userId: user.uid, username: user.username, kind: "restore", at });
    return entry;
  });

  if (!result) return NextResponse.json({ error: "That version can't be restored" }, { status: 404 });
  return NextResponse.json({ ok: true, restored_at: at });
}
