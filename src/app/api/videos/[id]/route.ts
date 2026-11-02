import { db } from "@/db";
import { videos, videoTags, tags, collectionVideos, categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr, numOr, strOr, dateOr } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { assertAllowedPath, statIfExists, thumbsDir } from "@/lib/paths";
import { probeFile, hashFile } from "@/lib/media";
import { audit } from "@/lib/shares";
import { extOf, isPlayable } from "@/lib/util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function getId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctx: Ctx) {
  const denied = await requireOwner(); if (denied) return denied;
  const id = await getId(ctx); if (!id) return fail("Invalid id", 400);
  const rows = await db.select().from(videos).where(eq(videos.id, id));
  if (!rows[0]) return fail("Video not found", 404);
  const v = rows[0];
  const tagRows = await db.select({ id: tags.id, name: tags.name }).from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId)).where(eq(videoTags.videoId, id));
  const colRows = await db.select({ id: collectionVideos.collectionId }).from(collectionVideos).where(eq(collectionVideos.videoId, id));
  const cats = await db.select().from(categories);
  const st = await statIfExists(v.filePath);
  return ok({
    video: {
      ...v, tags: tagRows, collectionIds: colRows.map((c) => c.id),
      categoryName: cats.find((c) => c.id === v.categoryId)?.name ?? null,
      subcategoryName: null,
      hasThumb: fs.existsSync(path.join(thumbsDir(), `${id}.jpg`)),
      playable: isPlayable(v.fileExt), filePresent: !!st?.isFile(),
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await guardMutation(req); if (denied) return denied;
  const id = await getId(ctx); if (!id) return fail("Invalid id", 400);
  const rows = await db.select().from(videos).where(eq(videos.id, id));
  const v = rows[0]; if (!v) return fail("Video not found", 404);
  try {
    const b = await readBody(req);

    if (b.action === "progress") {
      const pos = Math.max(0, numOr(b.positionSec, 0) ?? 0);
      const ended = b.ended === true;
      const dur = v.durationSec;
      let status = v.watchStatus;
      let watchCount = v.watchCount;
      if (ended || (dur && dur > 0 && pos >= dur * 0.95)) {
        if (v.watchStatus !== "watched") watchCount += 1;
        status = "watched";
      } else if (pos > 5) status = v.watchStatus === "watched" ? "watched" : "partial";
      const [row] = await db.update(videos).set({
        progressSec: ended ? 0 : pos, watchStatus: status, watchCount, lastWatchedAt: new Date(),
      }).where(eq(videos.id, id)).returning();
      return ok({ video: row });
    }

    if (b.action === "probe") {
      await assertAllowedPath(v.filePath);
      const st = await statIfExists(v.filePath);
      if (!st?.isFile()) return fail("File is missing on disk — cannot read metadata. Use Relink on the Missing Files page.");
      const meta = await probeFile(v.filePath);
      const s = await getSettings();
      const [row] = await db.update(videos).set({
        sizeBytes: st.size, fileModifiedAt: st.mtime, lastMetaCheck: new Date(), missing: false,
        hash: b.rehash === true ? await hashFile(v.filePath) : v.hash,
        ...(meta ? { durationSec: meta.durationSec, width: meta.width, height: meta.height, fps: meta.fps, codec: meta.codec, format: meta.format } : {}),
        ...(s.hashOnImport && !v.hash ? { hash: await hashFile(v.filePath) } : {}),
      }).where(eq(videos.id, id)).returning();
      if (!meta) return ok({ video: row, warning: "FFprobe unavailable or could not read this file — only file size/dates refreshed." });
      return ok({ video: row });
    }

    if (b.action === "open") {
      await assertAllowedPath(v.filePath);
      const st = await statIfExists(v.filePath);
      if (!st?.isFile()) return fail("File is missing on disk.");
      const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
      const args = process.platform === "win32" ? ["/c", "start", "", v.filePath] : [v.filePath];
      try {
        const p = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
        const err = await new Promise<string | null>((res) => { p.on("error", (e) => res(e.message)); setTimeout(() => res(null), 1200); });
        p.unref();
        if (err) return fail("Could not launch the system player: " + err);
        return ok({ opened: true });
      } catch (e) { return fail("Could not launch the system player: " + errMsg(e)); }
    }

    // Field updates (whitelisted)
    const patch: Partial<typeof videos.$inferInsert> = {};
    if (b.title !== undefined) { const t = strOr(b.title); if (!t) return fail("Title cannot be empty."); patch.title = t; }
    for (const k of ["altTitle", "studio", "performers", "source", "review", "description", "privateNotes", "contentWarnings", "format", "codec"] as const) {
      if (b[k] !== undefined) patch[k] = strOr(b[k]);
    }
    if (b.durationSec !== undefined) { const d = numOr(b.durationSec); if (d !== null && d < 0) return fail("Duration cannot be negative."); patch.durationSec = d; }
    if (b.sizeBytes !== undefined) patch.sizeBytes = Math.max(0, numOr(b.sizeBytes, 0) ?? 0);
    if (b.width !== undefined) patch.width = intOr(b.width);
    if (b.height !== undefined) patch.height = intOr(b.height);
    if (b.fps !== undefined) patch.fps = numOr(b.fps);
    if (b.rating !== undefined) patch.rating = Math.min(5, Math.max(0, intOr(b.rating, 0) ?? 0));
    if (b.favorite !== undefined) patch.favorite = b.favorite === true;
    if (b.bookmarked !== undefined) patch.bookmarked = b.bookmarked === true;
    if (b.watchStatus !== undefined) {
      if (!["watched", "partial", "unwatched"].includes(String(b.watchStatus))) return fail("Invalid watch status.");
      patch.watchStatus = String(b.watchStatus);
      if (b.watchStatus === "watched" && v.watchStatus !== "watched") { patch.watchCount = v.watchCount + 1; patch.lastWatchedAt = new Date(); }
      if (b.watchStatus === "unwatched") patch.progressSec = 0;
    }
    if (b.watchCount !== undefined) patch.watchCount = Math.max(0, intOr(b.watchCount, 0) ?? 0);
    if (b.lastWatchedAt !== undefined) patch.lastWatchedAt = dateOr(b.lastWatchedAt);
    if (b.recordedAt !== undefined) patch.recordedAt = dateOr(b.recordedAt);
    if (b.categoryId !== undefined) patch.categoryId = intOr(b.categoryId);
    if (b.privacy !== undefined) {
      if (!["standard", "private", "hidden"].includes(String(b.privacy))) return fail("Invalid privacy class.");
      patch.privacy = String(b.privacy);
    }
    if (b.progressSec !== undefined) patch.progressSec = Math.max(0, numOr(b.progressSec, 0) ?? 0);
    if (b.filePath !== undefined) {
      const np = strOr(b.filePath); if (!np) return fail("File path cannot be empty.");
      const resolved = await assertAllowedPath(np);
      const clash = await db.select({ id: videos.id }).from(videos).where(eq(videos.filePath, resolved));
      if (clash.length && clash[0].id !== id) return fail("Another record already uses that path.");
      const st = await statIfExists(resolved);
      patch.filePath = resolved; patch.fileName = path.basename(resolved); patch.fileExt = extOf(resolved) || v.fileExt;
      patch.missing = !st?.isFile();
      if (st?.isFile()) { patch.sizeBytes = st.size; patch.fileModifiedAt = st.mtime; patch.lastMetaCheck = new Date(); }
    }
    const [row] = Object.keys(patch).length
      ? await db.update(videos).set(patch).where(eq(videos.id, id)).returning()
      : [v];
    if (Array.isArray(b.tagIds)) {
      await db.delete(videoTags).where(eq(videoTags.videoId, id));
      for (const t of (b.tagIds as number[]).map(Number).filter((n) => n > 0)) {
        await db.insert(videoTags).values({ videoId: id, tagId: t }).onConflictDoNothing();
      }
    }
    if (Array.isArray(b.collectionIds)) {
      await db.delete(collectionVideos).where(eq(collectionVideos.videoId, id));
      for (const cid of (b.collectionIds as number[]).map(Number).filter((n) => n > 0)) {
        await db.insert(collectionVideos).values({ collectionId: cid, videoId: id }).onConflictDoNothing();
      }
    }
    return ok({ video: row });
  } catch (e) { return fail(errMsg(e)); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await guardMutation(req); if (denied) return denied;
  const id = await getId(ctx); if (!id) return fail("Invalid id", 400);
  const rows = await db.select().from(videos).where(eq(videos.id, id));
  if (!rows[0]) return fail("Video not found", 404);
  await db.delete(videos).where(eq(videos.id, id)); // record only — the media file is NEVER touched
  try { fs.unlinkSync(path.join(thumbsDir(), `${id}.jpg`)); } catch { /* no thumb */ }
  await audit("video.deleted", { id, note: "inventory record only; media file untouched" });
  return ok({ deleted: true });
}