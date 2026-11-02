import fs from "fs";
import path from "path";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { guardMutation, ok, fail, errMsg } from "@/lib/api";
import { thumbsDir, assertAllowedPath, statIfExists } from "@/lib/paths";
import { generateThumb } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardMutation(req); if (denied) return denied;
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return fail("Invalid id", 400);
  const rows = await db.select().from(videos).where(eq(videos.id, n));
  const v = rows[0]; if (!v) return fail("Video not found", 404);
  try {
    const ctype = req.headers.get("content-type") ?? "";
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("No image file uploaded.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return fail("Thumbnail must be JPEG, PNG or WebP.");
      if (file.size > 5 * 1024 * 1024) return fail("Thumbnail too large (max 5 MB).");
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(path.join(thumbsDir(), `${n}.jpg`), buf);
      return ok({ uploaded: true });
    }
    const b = await req.json().catch(() => ({}));
    if (b.action === "regenerate") {
      await assertAllowedPath(v.filePath);
      const st = await statIfExists(v.filePath);
      if (!st?.isFile()) return fail("File is missing on disk — cannot regenerate.");
      const done = await generateThumb(n, v.filePath, v.durationSec);
      if (!done) return fail("FFmpeg is not available or failed. Configure it in Settings.");
      return ok({ regenerated: true });
    }
    if (b.action === "remove") {
      try { fs.unlinkSync(path.join(thumbsDir(), `${n}.jpg`)); } catch { /* none */ }
      return ok({ removed: true });
    }
    return fail("Unknown thumbnail action.");
  } catch (e) { return fail(errMsg(e)); }
}