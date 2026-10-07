// app/api/events/route.ts
// HR UPCOMING EVENTS FEATURE
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { initDb, run, get, all } from "@/lib/db";
import { requireAuth, nowIso } from "@/lib/auth";

function canAccess(role: string) {
  return role === "hr" || role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (!canAccess(user.role)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const upcoming = searchParams.get("upcoming"); // days ahead
    const all_flag = searchParams.get("all");

    let sql = `SELECT e.*, u.username as created_by_username FROM events e
               LEFT JOIN users u ON u.id = e.created_by`;
    const params: unknown[] = [];

    if (upcoming) {
      const days = Number(upcoming) || 30;
      const today = new Date();
      const cutoff = new Date(today);
      cutoff.setDate(today.getDate() + days);
      sql += ` WHERE e.event_date >= ? AND e.event_date <= ?`;
      params.push(today.toISOString().slice(0, 10), cutoff.toISOString().slice(0, 10));
    } else if (!all_flag) {
      // Default: events from today onwards
      sql += ` WHERE e.event_date >= ?`;
      params.push(new Date().toISOString().slice(0, 10));
    }

    sql += ` ORDER BY e.event_date ASC`;
    const events = await all<any>(sql, params);
    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "HR access required" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, event_date, event_type } = body;
    if (!title?.trim() || !event_date) {
      return NextResponse.json({ error: "title and event_date are required" }, { status: 400 });
    }

    const ts = nowIso();
    const ins = await get<{ id: number }>(
      `INSERT INTO events(title,description,event_date,event_type,created_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?) RETURNING id`,
      [title.trim(), description || null, event_date, event_type || "general", user.uid, ts, ts]
    );

    const ev = await get<any>(`SELECT * FROM events WHERE id=?`, [ins?.id]);
    return NextResponse.json({ event: ev }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
