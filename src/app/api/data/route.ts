import { db } from "@/db";
import { videos, categories, tags, videoTags, collections, collectionVideos, settings, auditLog } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import path from "path";
import { PassThrough } from "stream";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, numOr, intOr } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { assertAllowedPath, statIfExists } from "@/lib/paths";
import { csvStringify, csvParse, fmtDur, parseDuration, extOf } from "@/lib/util";
import { readStoreRaw, replaceStoreRaw, audit } from "@/lib/shares";
import { seedSampleLibrary } from "@/lib/sample";

export const dynamic = "force-dynamic";

const VIDEO_DATES = ["dateAdded", "recordedAt", "fileModifiedAt", "lastMetaCheck", "lastWatchedAt"] as const;

export async function GET(req: Request) {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const u = new URL(req.url).searchParams;
    const kind = u.get("kind") ?? "csv";
    const stamp = new Date().toISOString().slice(0, 10);

    if (kind === "csv") {
      const includePrivate = u.get("includePrivate") === "1";
      const all = await db.select().from(videos).orderBy(videos.id);
      const cats = await db.select().from(categories);
      const tagRows = await db.select({ vid: videoTags.videoId, name: tags.name }).from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId));
      const colRows = await db.select({ vid: collectionVideos.videoId, name: collections.name }).from(collectionVideos).innerJoin(collections, eq(collections.id, collectionVideos.collectionId));
      const headers = ["id", "title", "altTitle", "fileName", "filePath", "fileExt", "format", "sizeBytes", "durationSec", "durationHHMMSS", "width", "height", "fps", "codec", "dateAdded", "recordedAt", "fileModifiedAt", "category", "studio", "performers", "source", "rating", "review", "description", "favorite", "bookmarked", "watchStatus", "lastWatchedAt", "watchCount", "privacy", "contentWarnings", "tags", "collections", "hash", "missing"];
      if (includePrivate) headers.push("privateNotes");
      const rows = all.map((v) => {
        const base: unknown[] = [v.id, v.title, v.altTitle, v.fileName, v.filePath, v.fileExt, v.format, v.sizeBytes, v.durationSec, v.durationSec != null ? fmtDur(v.durationSec) : "", v.width, v.height, v.fps, v.codec, v.dateAdded?.toISOString(), v.recordedAt?.toISOString(), v.fileModifiedAt?.toISOString(), cats.find((c) => c.id === v.categoryId)?.name ?? "", v.studio, v.performers, v.source, v.rating, v.review, v.description, v.favorite ? 1 : 0, v.bookmarked ? 1 : 0, v.watchStatus, v.lastWatchedAt?.toISOString(), v.watchCount, v.privacy, v.contentWarnings, tagRows.filter((t) => t.vid === v.id).map((t) => t.name).join(";"), colRows.filter((c) => c.vid === v.id).map((c) => c.name).join(";"), v.hash, v.missing ? 1 : 0];
        if (includePrivate) base.push(v.privateNotes);
        return base;
      });
      await audit("export.csv", { rows: rows.length, includePrivate });
      return new Response(csvStringify(headers, rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="velvet-vault-inventory-${stamp}.csv"`, "Cache-Control": "private, no-store" },
      });
    }

    if (kind === "backup") {
      const data = {
        app: "velvet-vault", version: 1, exportedAt: new Date().toISOString(),
        tables: {
          videos: await db.select().from(videos),
          categories: await db.select().from(categories),
          tags: await db.select().from(tags),
          videoTags: await db.select().from(videoTags),
          collections: await db.select().from(collections),
          collectionVideos: await db.select().from(collectionVideos),
          settings: await db.select().from(settings),
        },
        shares: readStoreRaw(),
      };
      await audit("backup.created", { videos: data.tables.videos.length });
      return new Response(JSON.stringify(data, null, 1), {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="velvet-vault-backup-${stamp}.json"`, "Cache-Control": "private, no-store" },
      });
    }

    if (kind === "project") {
      const root = process.cwd();
      const archive = new ZipArchive({ zlib: { level: 6 } });
      const pass = new PassThrough();
      archive.pipe(pass);
      archive.glob("**/*", {
        cwd: root, dot: true,
        ignore: ["node_modules/**", ".next/**", ".git/**", "data/**", ".env", "*.log", "*.tsbuildinfo", "package-lock.json"],
      });
      void archive.finalize();
      return new Response(Readable.toWeb(pass) as ReadableStream, {
        headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="velvet-vault-project-${stamp}.zip"`, "Cache-Control": "private, no-store" },
      });
    }
    return fail("Unknown export kind.");
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);

    if (b.action === "sample") return ok(await seedSampleLibrary());

    if (b.action === "restore") {
      const data = b.data as { app?: string; tables?: Record<string, unknown[]>; shares?: unknown };
      if (!data || data.app !== "velvet-vault" || !data.tables) return fail("Not a valid Velvet Vault backup file.");
      const t = data.tables;
      for (const k of ["videos", "categories", "tags", "videoTags", "collections", "collectionVideos", "settings"]) {
        if (!Array.isArray(t[k])) return fail(`Backup is missing table: ${k}`);
      }
      const reviveVideos = (t.videos as Record<string, unknown>[]).map((r) => {
        const o = { ...r };
        for (const d of VIDEO_DATES) o[d] = o[d] ? new Date(String(o[d])) : null;
        return o;
      });
      const reviveCols = (t.collections as Record<string, unknown>[]).map((r) => ({ ...r, createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date() }));
      await db.transaction(async (tx) => {
        await tx.delete(collectionVideos); await tx.delete(videoTags); await tx.delete(videos);
        await tx.delete(collections); await tx.delete(tags); await tx.delete(categories); await tx.delete(settings);
        if ((t.categories as unknown[]).length) await tx.insert(categories).values(t.categories as (typeof categories.$inferInsert)[]);
        if ((t.tags as unknown[]).length) await tx.insert(tags).values(t.tags as (typeof tags.$inferInsert)[]);
        if (reviveVideos.length) await tx.insert(videos).values(reviveVideos as (typeof videos.$inferInsert)[]);
        if (reviveCols.length) await tx.insert(collections).values(reviveCols as (typeof collections.$inferInsert)[]);
        if ((t.videoTags as unknown[]).length) await tx.insert(videoTags).values(t.videoTags as (typeof videoTags.$inferInsert)[]);
        if ((t.collectionVideos as unknown[]).length) await tx.insert(collectionVideos).values(t.collectionVideos as (typeof collectionVideos.$inferInsert)[]);
        if ((t.settings as unknown[]).length) await tx.insert(settings).values(t.settings as (typeof settings.$inferInsert)[]);
      });
      for (const tbl of ["videos", "categories", "tags", "collections"]) {
        await db.execute(sql.raw(`select setval(pg_get_serial_sequence('${tbl}','id'), coalesce((select max(id) from ${tbl}),0)+1, false)`));
      }
      if (data.shares) await replaceStoreRaw(data.shares);
      await audit("backup.restored", { videos: reviveVideos.length });
      return ok({ restored: true, videos: reviveVideos.length });
    }

    if (b.action === "csv-import") {
      const text = String(b.csv ?? "");
      if (!text.trim()) return fail("No CSV content provided.");
      const rows = csvParse(text);
      if (rows.length < 2) return fail("CSV needs a header row plus at least one data row.");
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (n: string) => headers.indexOf(n.toLowerCase());
      if (idx("title") < 0 || idx("filePath") < 0) return fail("CSV must include at least 'title' and 'filePath' columns.");
      const existing = new Set((await db.select({ p: videos.filePath }).from(videos)).map((r) => r.p));
      const cats = await db.select().from(categories);
      const allTags = await db.select().from(tags);
      const s = await getSettings();
      let imported = 0, skipped = 0;
      const errors: string[] = [];
      const get = (row: string[], name: string) => { const i = idx(name); return i >= 0 ? (row[i] ?? "").trim() : ""; };
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        try {
          const title = get(row, "title");
          const rawPath = get(row, "filePath");
          if (!title || !rawPath) throw new Error("missing title or filePath");
          const resolved = await assertAllowedPath(rawPath);
          if (existing.has(resolved)) { skipped++; continue; } // resume-safe: re-running skips completed rows
          const st = await statIfExists(resolved);
          let dur = numOr(get(row, "durationSec"));
          if (dur == null) dur = parseDuration(get(row, "durationHHMMSS"));
          if (dur != null && dur < 0) throw new Error("negative duration");
          let categoryId: number | null = null;
          const catName = get(row, "category");
          if (catName) {
            let c = cats.find((x) => x.name.toLowerCase() === catName.toLowerCase());
            if (!c) { [c] = await db.insert(categories).values({ name: catName }).returning(); cats.push(c); }
            categoryId = c.id;
          }
          const ws = get(row, "watchStatus");
          const [vrow] = await db.insert(videos).values({
            title, altTitle: get(row, "altTitle") || null,
            fileName: path.basename(resolved), filePath: resolved, fileExt: extOf(resolved) || "mp4",
            format: get(row, "format") || null,
            sizeBytes: st?.size ?? Math.max(0, numOr(get(row, "sizeBytes"), 0) ?? 0),
            durationSec: dur, width: intOr(get(row, "width")), height: intOr(get(row, "height")),
            fps: numOr(get(row, "fps")), codec: get(row, "codec") || null,
            recordedAt: get(row, "recordedAt") ? new Date(get(row, "recordedAt")) : null,
            fileModifiedAt: st?.mtime ?? null, lastMetaCheck: new Date(),
            categoryId, studio: get(row, "studio") || null, performers: get(row, "performers") || null, source: get(row, "source") || null,
            rating: Math.min(5, Math.max(0, intOr(get(row, "rating"), 0) ?? 0)),
            review: get(row, "review") || null, description: get(row, "description") || null,
            privateNotes: s ? get(row, "privateNotes") || null : null,
            favorite: get(row, "favorite") === "1", bookmarked: get(row, "bookmarked") === "1",
            watchStatus: ["watched", "partial", "unwatched"].includes(ws) ? ws : "unwatched",
            watchCount: Math.max(0, intOr(get(row, "watchCount"), 0) ?? 0),
            privacy: ["standard", "private", "hidden"].includes(get(row, "privacy")) ? get(row, "privacy") : "standard",
            contentWarnings: get(row, "contentWarnings") || null,
            hash: get(row, "hash") || null, missing: !st?.isFile(),
          }).returning();
          for (const tn of get(row, "tags").split(";").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
            let tg = allTags.find((x) => x.name === tn);
            if (!tg) { [tg] = await db.insert(tags).values({ name: tn }).onConflictDoNothing().returning(); if (!tg) { [tg] = await db.select().from(tags).where(eq(tags.name, tn)); allTags.push(tg); } else allTags.push(tg); }
            if (tg) await db.insert(videoTags).values({ videoId: vrow.id, tagId: tg.id }).onConflictDoNothing();
          }
          existing.add(resolved);
          imported++;
        } catch (e) {
          if (errors.length < 50) errors.push(`Row ${r + 1}: ${e instanceof Error ? e.message : "invalid"}`);
          skipped++;
        }
      }
      await audit("import.csv", { imported, skipped, errors: errors.length });
      return ok({ imported, skipped, errors });
    }
    return fail("Unknown data action.");
  } catch (e) { return fail(errMsg(e), 500); }
}