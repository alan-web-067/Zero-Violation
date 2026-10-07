// app/api/events/[id]/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get } from "@/lib/db";
import { requireAuth, nowIso, errorStatus } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const ev = await get<any>(`SELECT * FROM events WHERE id=?`, [Number(id)]);
    if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ event: ev });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const body = await req.json();
    const { title, description, event_date, event_type } = body;
    if (!title?.trim() || !event_date) {
      return NextResponse.json({ error: "title and event_date are required" }, { status: 400 });
    }
    await run(
      `UPDATE events SET title=?,description=?,event_date=?,event_type=?,updated_at=? WHERE id=?`,
      [title.trim(), description || null, event_date, event_type || "general", nowIso(), Number(id)]
    );
    const ev = await get<any>(`SELECT * FROM events WHERE id=?`, [Number(id)]);
    return NextResponse.json({ event: ev });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const { id } = await ctx.params;
    await run(`DELETE FROM events WHERE id=?`, [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
