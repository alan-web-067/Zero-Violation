// app/api/prefs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, get, run } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);

    const row = await get<any>(
      `SELECT theme_mode, accent, font_scale, snow_enabled FROM prefs WHERE user_id=?`,
      [user.uid]
    );

    return NextResponse.json(
      row || { theme_mode: "dark", accent: "#0B7A4B", font_scale: 1, snow_enabled: 1 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const { theme_mode, accent, font_scale, snow_enabled } = body || {};

    await run(
      `UPDATE prefs SET theme_mode=?, accent=?, font_scale=?, snow_enabled=? WHERE user_id=?`,
      [
        theme_mode ?? "dark",
        accent ?? "#0B7A4B",
        Number(font_scale ?? 1),
        snow_enabled ? 1 : 0,
        user.uid,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === "Missing token" || e.message === "Invalid token" ? 401 : 500;
    return NextResponse.json({ error: e.message || "Error" }, { status });
  }
}
