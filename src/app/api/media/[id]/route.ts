import { db } from "@/db";
import { videos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";
import { fail } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { isWithinRoots } from "@/lib/paths";
import { streamFile } from "@/lib/stream";

export const dynamic = "force-dynamic";

async function handle(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(); if (denied) return denied;
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return fail("Invalid id", 400);
  const rows = await db.select().from(videos).where(eq(videos.id, n));
  if (!rows[0]) return fail("Video not found", 404);
  const s = await getSettings();
  if (!isWithinRoots(rows[0].filePath, s.libraryRoots)) {
    return fail("This file is outside the configured library roots.", 403);
  }
  return streamFile(req, rows[0].filePath);
}
export const GET = handle;
export const HEAD = handle;