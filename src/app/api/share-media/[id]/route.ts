import { cookies } from "next/headers";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api";
import { SHARE_COOKIE } from "@/lib/auth";
import { checkSession, touchSession } from "@/lib/shares";
import { getSettings } from "@/lib/settings";
import { isWithinRoots } from "@/lib/paths";
import { streamFile } from "@/lib/stream";

export const dynamic = "force-dynamic";

async function handle(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return fail("Invalid request", 400);
  const jar = await cookies();
  const sid = jar.get(SHARE_COOKIE)?.value;
  // Authorization is re-checked on EVERY request, including each byte-range fetch.
  const check = checkSession(sid, n);
  if (!check.ok) return fail(check.error, 403);
  const rows = await db.select().from(videos).where(eq(videos.id, n));
  if (!rows[0]) return fail("Video not found", 404);
  const s = await getSettings();
  if (!isWithinRoots(rows[0].filePath, s.libraryRoots)) return fail("Media unavailable.", 403);
  await touchSession(sid!);
  return streamFile(req, rows[0].filePath);
}
export const GET = handle;
export const HEAD = handle;