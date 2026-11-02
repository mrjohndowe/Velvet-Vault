import { db } from "@/db";
import { videos, videoTags, collectionVideos } from "@/db/schema";
import { inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { guardMutation, ok, fail, readBody, errMsg, intOr } from "@/lib/api";
import { thumbsDir } from "@/lib/paths";
import { audit } from "@/lib/shares";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const ids = Array.isArray(b.ids) ? (b.ids as number[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!ids.length) return fail("No videos selected.");
    if (b.action === "delete") {
      await db.delete(videos).where(inArray(videos.id, ids));
      for (const id of ids) { try { fs.unlinkSync(path.join(thumbsDir(), `${id}.jpg`)); } catch { /* ignore */ } }
      await audit("video.bulkDeleted", { count: ids.length, note: "records only; media files untouched" });
      return ok({ deleted: ids.length });
    }
    if (b.action === "update") {
      const p = (b.patch ?? {}) as Record<string, unknown>;
      const patch: Partial<typeof videos.$inferInsert> = {};
      if (p.categoryId !== undefined) patch.categoryId = intOr(p.categoryId);
      if (p.watchStatus !== undefined && ["watched", "partial", "unwatched"].includes(String(p.watchStatus))) patch.watchStatus = String(p.watchStatus);
      if (p.favorite !== undefined) patch.favorite = p.favorite === true;
      if (p.bookmarked !== undefined) patch.bookmarked = p.bookmarked === true;
      if (p.rating !== undefined) patch.rating = Math.min(5, Math.max(0, intOr(p.rating, 0) ?? 0));
      if (p.privacy !== undefined && ["standard", "private", "hidden"].includes(String(p.privacy))) patch.privacy = String(p.privacy);
      if (Object.keys(patch).length) await db.update(videos).set(patch).where(inArray(videos.id, ids));
      const addTag = intOr(b.addTagId);
      if (addTag) for (const id of ids) await db.insert(videoTags).values({ videoId: id, tagId: addTag }).onConflictDoNothing();
      const addCol = intOr(b.addCollectionId);
      if (addCol) for (const id of ids) await db.insert(collectionVideos).values({ collectionId: addCol, videoId: id }).onConflictDoNothing();
      await audit("video.bulkUpdated", { count: ids.length });
      return ok({ updated: ids.length });
    }
    return fail("Unknown bulk action.");
  } catch (e) { return fail(errMsg(e)); }
}