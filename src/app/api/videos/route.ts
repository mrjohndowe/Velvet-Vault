import { db } from "@/db";
import { videos, videoTags, tags, categories, collectionVideos } from "@/db/schema";
import { and, or, ilike, eq, gte, lte, lt, inArray, isNotNull, desc, asc, sql, count, type SQL } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr, numOr, strOr, dateOr } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { assertAllowedPath, statIfExists, thumbsDir, parentDir } from "@/lib/paths";
import { probeFile, generateThumb, hashFile } from "@/lib/media";
import { duplicateGroups } from "@/lib/library";
import { extOf, isPlayable } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const u = new URL(req.url).searchParams;
    const s = await getSettings();
    const conds: SQL[] = [];
    const q = u.get("q")?.trim();
    if (q) {
      const like = `%${q}%`;
      const tagHits = await db.select({ id: videoTags.videoId }).from(videoTags)
        .innerJoin(tags, eq(tags.id, videoTags.tagId)).where(ilike(tags.name, like));
      const parts = [videos.title, videos.altTitle, videos.fileName, videos.filePath, videos.studio, videos.performers, videos.source, videos.description, videos.privateNotes].map((c) => ilike(c, like));
      if (tagHits.length) parts.push(inArray(videos.id, [...new Set(tagHits.map((t) => t.id))]));
      conds.push(or(...parts)!);
    }
    const catId = intOr(u.get("categoryId"));
    if (catId) {
      const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, catId));
      conds.push(inArray(videos.categoryId, [catId, ...kids.map((k) => k.id)]));
    }
    const tagIds = (u.get("tagIds") ?? "").split(",").map(Number).filter((n) => n > 0);
    if (tagIds.length) {
      const hits = await db.select({ id: videoTags.videoId }).from(videoTags).where(inArray(videoTags.tagId, tagIds));
      conds.push(hits.length ? inArray(videos.id, [...new Set(hits.map((h) => h.id))]) : sql`false`);
    }
    const colId = intOr(u.get("collectionId"));
    if (colId) {
      const hits = await db.select({ id: collectionVideos.videoId }).from(collectionVideos).where(eq(collectionVideos.collectionId, colId));
      conds.push(hits.length ? inArray(videos.id, hits.map((h) => h.id)) : sql`false`);
    }
    const res = u.get("resolution");
    const resRanges: Record<string, [number, number]> = { "4K": [2000, 99999], "1440p": [1400, 1999], "1080p": [1000, 1399], "720p": [700, 999], "480p": [460, 699], "Low": [1, 459] };
    if (res === "unknown") conds.push(sql`${videos.height} is null`);
    else if (res && resRanges[res]) conds.push(and(gte(videos.height, resRanges[res][0]), lte(videos.height, resRanges[res][1]))!);
    const ext = u.get("ext"); if (ext) conds.push(eq(videos.fileExt, ext.toLowerCase()));
    const ratingMin = intOr(u.get("ratingMin")); if (ratingMin) conds.push(gte(videos.rating, ratingMin));
    const watch = u.get("watch"); if (watch && ["watched", "partial", "unwatched"].includes(watch)) conds.push(eq(videos.watchStatus, watch));
    if (u.get("favorite") === "1") conds.push(eq(videos.favorite, true));
    if (u.get("bookmarked") === "1") conds.push(eq(videos.bookmarked, true));
    if (u.get("missing") === "1") conds.push(eq(videos.missing, true));
    if (u.get("missing") === "0") conds.push(eq(videos.missing, false));
    if (u.get("duplicate") === "1") {
      const ids = (await duplicateGroups()).flatMap((g) => g.videos.map((v) => v.id));
      conds.push(ids.length ? inArray(videos.id, ids) : sql`false`);
    }
    const durMin = numOr(u.get("durMin")); if (durMin != null) conds.push(gte(videos.durationSec, durMin));
    const durMax = numOr(u.get("durMax")); if (durMax != null) conds.push(lte(videos.durationSec, durMax));
    if (u.get("durUnknown") === "1") conds.push(sql`${videos.durationSec} is null`);
    const addedFrom = dateOr(u.get("addedFrom")); if (addedFrom) conds.push(gte(videos.dateAdded, addedFrom));
    const addedTo = dateOr(u.get("addedTo")); if (addedTo) conds.push(lte(videos.dateAdded, new Date(addedTo.getTime() + 86400_000)));
    const recFrom = dateOr(u.get("recFrom")); if (recFrom) conds.push(gte(videos.recordedAt, recFrom));
    const recTo = dateOr(u.get("recTo")); if (recTo) conds.push(lte(videos.recordedAt, new Date(recTo.getTime() + 86400_000)));
    const privacy = u.get("privacy");
    if (privacy && privacy !== "all") conds.push(eq(videos.privacy, privacy));
    else if (!privacy) conds.push(sql`${videos.privacy} <> 'hidden'`);

    const where = conds.length ? and(...conds) : undefined;
    const sortKey = u.get("sort") ?? "dateAdded";
    const dir = u.get("dir") === "asc" ? "asc" : "desc";
    const colMap: Record<string, SQL> = {
      title: sql`lower(${videos.title})`, dateAdded: sql`${videos.dateAdded}`, duration: sql`${videos.durationSec}`,
      size: sql`${videos.sizeBytes}`, resolution: sql`${videos.height}`, rating: sql`${videos.rating}`,
      lastWatched: sql`${videos.lastWatchedAt}`, random: sql`random()`,
    };
    const col = colMap[sortKey] ?? colMap.dateAdded;
    const order = sortKey === "random" ? col : dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`;
    const page = Math.max(1, intOr(u.get("page"), 1) ?? 1);
    const pageSize = Math.min(100, Math.max(1, intOr(u.get("pageSize"), s.pageSize) ?? s.pageSize));
    const [{ c }] = await db.select({ c: count() }).from(videos).where(where);
    const items = await db.select().from(videos).where(where).orderBy(order, desc(videos.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    const ids = items.map((v) => v.id);
    const tagRows = ids.length ? await db.select({ vid: videoTags.videoId, id: tags.id, name: tags.name })
      .from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId)).where(inArray(videoTags.videoId, ids)) : [];
    const cats = await db.select().from(categories);
    const td = thumbsDir();
    const enriched = items.map((v) => ({
      ...v,
      tags: tagRows.filter((t) => t.vid === v.id).map((t) => ({ id: t.id, name: t.name })),
      categoryName: cats.find((c) => c.id === v.categoryId)?.name ?? null,
      hasThumb: fs.existsSync(path.join(td, `${v.id}.jpg`)),
      playable: isPlayable(v.fileExt),
      folder: parentDir(v.filePath),
    }));
    return ok({ items: enriched, total: c, page, pageSize });
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const title = strOr(b.title);
    const filePath = strOr(b.filePath);
    if (!title) return fail("Title is required.");
    if (!filePath) return fail("Full local file path is required.");
    const resolved = await assertAllowedPath(filePath);
    const dupe = await db.select({ id: videos.id }).from(videos).where(eq(videos.filePath, resolved));
    if (dupe.length) return fail(`This file is already indexed (record #${dupe[0].id}).`);
    const st = await statIfExists(resolved);
    let meta = null;
    if (st?.isFile() && b.probe !== false) meta = await probeFile(resolved);
    const s = await getSettings();
    const [row] = await db.insert(videos).values({
      title, altTitle: strOr(b.altTitle), fileName: path.basename(resolved), filePath: resolved,
      fileExt: extOf(resolved) || "mp4", format: meta?.format ?? strOr(b.format),
      sizeBytes: st?.size ?? Math.max(0, numOr(b.sizeBytes, 0) ?? 0),
      durationSec: meta?.durationSec ?? numOr(b.durationSec),
      width: meta?.width ?? intOr(b.width), height: meta?.height ?? intOr(b.height),
      fps: meta?.fps ?? numOr(b.fps), codec: meta?.codec ?? strOr(b.codec),
      recordedAt: dateOr(b.recordedAt), fileModifiedAt: st?.mtime ?? null, lastMetaCheck: new Date(),
      categoryId: intOr(b.categoryId), studio: strOr(b.studio), performers: strOr(b.performers), source: strOr(b.source),
      rating: Math.min(5, Math.max(0, intOr(b.rating, 0) ?? 0)), review: strOr(b.review), description: strOr(b.description),
      privateNotes: strOr(b.privateNotes), favorite: b.favorite === true, bookmarked: b.bookmarked === true,
      watchStatus: ["watched", "partial", "unwatched"].includes(String(b.watchStatus)) ? String(b.watchStatus) : "unwatched",
      watchCount: Math.max(0, intOr(b.watchCount, 0) ?? 0),
      privacy: ["standard", "private", "hidden"].includes(String(b.privacy)) ? String(b.privacy) : "standard",
      contentWarnings: strOr(b.contentWarnings),
      hash: st?.isFile() && s.hashOnImport ? await hashFile(resolved) : null,
      missing: !st?.isFile(),
    }).returning();
    const tagIds = Array.isArray(b.tagIds) ? (b.tagIds as number[]).map(Number).filter((n) => n > 0) : [];
    for (const t of tagIds) await db.insert(videoTags).values({ videoId: row.id, tagId: t }).onConflictDoNothing();
    const colIds = Array.isArray(b.collectionIds) ? (b.collectionIds as number[]).map(Number).filter((n) => n > 0) : [];
    for (const cid of colIds) await db.insert(collectionVideos).values({ collectionId: cid, videoId: row.id }).onConflictDoNothing();
    if (st?.isFile() && s.thumbsEnabled) await generateThumb(row.id, resolved, row.durationSec);
    return ok({ video: row });
  } catch (e) { return fail(errMsg(e)); }
}