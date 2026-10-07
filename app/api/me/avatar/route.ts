// app/api/me/avatar/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { initDb, get, run } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  await initDb();
  try {
    const u = await requireAuth(req);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid upload — expected multipart/form-data" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Only PNG, JPG, JPEG, and WebP images are allowed" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 2MB or smaller" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "The selected file is empty" }, { status: 400 });
    }

    // Delete the old blob if one exists
    const row = await get<{ avatar_url: string | null }>(`SELECT avatar_url FROM users WHERE id = ?`, [u.uid]);
    if (row?.avatar_url?.startsWith("https://")) {
      try { await del(row.avatar_url); } catch { /* ignore if already gone */ }
    }

    // Upload to Vercel Blob
    const pathname = `avatars/user-${u.uid}-${Date.now()}.${ext}`;
    const blob = await put(pathname, file, { access: "public" });

    await run(`UPDATE users SET avatar_url = ? WHERE id = ?`, [blob.url, u.uid]);

    return NextResponse.json({ ok: true, avatarUrl: blob.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "Missing token" || message === "Invalid or expired token") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("Avatar upload error:", message);
    return NextResponse.json({ error: "Server error — try again" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await initDb();
  try {
    const u = await requireAuth(req);

    const row = await get<{ avatar_url: string | null }>(`SELECT avatar_url FROM users WHERE id = ?`, [u.uid]);
    if (row?.avatar_url?.startsWith("https://")) {
      try { await del(row.avatar_url); } catch { /* ignore if already gone */ }
    }

    await run(`UPDATE users SET avatar_url = NULL WHERE id = ?`, [u.uid]);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    if (message === "Missing token" || message === "Invalid or expired token") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("Avatar remove error:", message);
    return NextResponse.json({ error: "Server error — try again" }, { status: 500 });
  }
}
