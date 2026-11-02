import { db } from "@/db";
import { videos, categories, auditLog } from "@/db/schema";
import { sql, desc, isNotNull, eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { requireOwner } from "@/lib/auth";
import { ok, fail, errMsg } from "@/lib/api";
import { duplicateGroups } from "@/lib/library";
import { thumbsDir, parentDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const [totals] = await db.select({
      total: sql<number>`count(*)::int`,
      size: sql<string>`coalesce(sum(${videos.sizeBytes}),0)`,
      duration: sql<string>`coalesce(sum(${videos.durationSec}),0)`,
      watched: sql<number>`count(*) filter (where ${videos.watchStatus}='watched')::int`,
      partial: sql<number>`count(*) filter (where ${videos.watchStatus}='partial')::int`,
      unwatched: sql<number>`count(*) filter (where ${videos.watchStatus}='unwatched')::int`,
      favorites: sql<number>`count(*) filter (where ${videos.favorite})::int`,
      bookmarks: sql<number>`count(*) filter (where ${videos.bookmarked})::int`,
      missing: sql<number>`count(*) filter (where ${videos.missing})::int`,
    }).from(videos);
    const dupGroups = await duplicateGroups();
    const dupIds = new Set(dupGroups.flatMap((g) => g.videos.map((v) => v.id)));
    const byCat = await db.select({ id: categories.id, name: categories.name, n: sql<number>`count(${videos.id})::int`, size: sql<string>`coalesce(sum(${videos.sizeBytes}),0)` })
      .from(categories).leftJoin(videos, eq(videos.categoryId, categories.id)).groupBy(categories.id, categories.name).orderBy(sql`count(${videos.id}) desc`);
    const byFormat = await db.select({ ext: videos.fileExt, n: sql<number>`count(*)::int`, size: sql<string>`coalesce(sum(${videos.sizeBytes}),0)` })
      .from(videos).groupBy(videos.fileExt).orderBy(sql`count(*) desc`);
    const allPaths = await db.select({ p: videos.filePath, size: videos.sizeBytes }).from(videos);
    const folderMap = new Map<string, { n: number; size: number }>();
    for (const r of allPaths) {
      const d = parentDir(r.p);
      const cur = folderMap.get(d) ?? { n: 0, size: 0 };
      cur.n++; cur.size += r.size;
      folderMap.set(d, cur);
    }
    const byFolder = [...folderMap.entries()].map(([folder, v]) => ({ folder, ...v })).sort((a, b) => b.size - a.size).slice(0, 8);
    const td = thumbsDir();
    const mini = (v: typeof videos.$inferSelect) => ({ id: v.id, title: v.title, durationSec: v.durationSec, rating: v.rating, sizeBytes: v.sizeBytes, height: v.height, favorite: v.favorite, missing: v.missing, dateAdded: v.dateAdded, lastWatchedAt: v.lastWatchedAt, hasThumb: fs.existsSync(path.join(td, `${v.id}.jpg`)) });
    const recentAdded = (await db.select().from(videos).orderBy(desc(videos.dateAdded)).limit(8)).map(mini);
    const recentWatched = (await db.select().from(videos).where(isNotNull(videos.lastWatchedAt)).orderBy(desc(videos.lastWatchedAt)).limit(6)).map(mini);
    const topRated = (await db.select().from(videos).where(sql`${videos.rating} > 0`).orderBy(desc(videos.rating), desc(videos.dateAdded)).limit(6)).map(mini);
    const activity = await db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(8);
    return ok({
      totals: { ...totals, size: Number(totals.size), duration: Number(totals.duration), duplicates: dupIds.size, duplicateGroups: dupGroups.length },
      byCategory: byCat.map((c) => ({ ...c, size: Number(c.size) })),
      byFormat: byFormat.map((f) => ({ ...f, size: Number(f.size) })),
      byFolder, recentAdded, recentWatched, topRated, activity,
    });
  } catch (e) { return fail(errMsg(e), 500); }
}