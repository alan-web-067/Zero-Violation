// app/api/members/[id]/photo/route.ts
// HR/ACCOUNTING MEMBERS FEATURE — employee profile photo upload
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { initDb, get, run } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/webp": "webp",
};

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "HR access required" }, { status: 403 });
    }
    const { id } = await ctx.params;

    let form: FormData;
    try { form = await req.formData(); } catch {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File))   return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext)                       return NextResponse.json({ error: "Only PNG, JPG, JPEG, WebP allowed" }, { status: 400 });
    if (file.size > MAX_BYTES)      return NextResponse.json({ error: "Max 3MB" }, { status: 400 });
    if (file.size === 0)            return NextResponse.json({ error: "Empty file" }, { status: 400 });

    const member = await get<{ photo_url: string | null }>(`SELECT photo_url FROM members WHERE id=?`, [Number(id)]);
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    // Delete the old blob if one exists
    if (member.photo_url?.startsWith("https://")) {
      try { await del(member.photo_url); } catch { /* ignore if already gone */ }
    }

    // Upload to Vercel Blob
    const pathname = `member-photos/member-${id}-${Date.now()}.${ext}`;
    const blob = await put(pathname, file, { access: "public" });

    await run(`UPDATE members SET photo_url=? WHERE id=?`, [blob.url, Number(id)]);

    return NextResponse.json({ ok: true, photoUrl: blob.url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  await initDb();
  try {
    const user = await requireAuth(req);
    if (user.role !== "hr" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "HR access required" }, { status: 403 });
    }
    const { id } = await ctx.params;

    const member = await get<{ photo_url: string | null }>(`SELECT photo_url FROM members WHERE id=?`, [Number(id)]);
    if (member?.photo_url?.startsWith("https://")) {
      try { await del(member.photo_url); } catch { /* ignore if already gone */ }
    }

    await run(`UPDATE members SET photo_url=NULL WHERE id=?`, [Number(id)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
