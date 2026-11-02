import fs from "fs";
import path from "path";
import { db } from "@/db";
import { videos, type Video } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { assertAllowedPath, statIfExists } from "./paths";
import { getSettings } from "./settings";
import { probeFile, generateThumb, hashFile, toolAvailable } from "./media";
import { isVideoFile, extOf, titleFromFileName } from "./util";
import { audit } from "./shares";

/* ---------------- Scan jobs (in-memory, polled by the UI) ---------------- */
export type ScanFile = {
  path: string; name: string; ext: string; size: number; mtime: string;
  durationSec: number | null; width: number | null; height: number | null;
  fps: number | null; codec: string | null; format: string | null;
  status: "new" | "exists" | "error"; error?: string;
};
export type ScanJob = {
  id: string; status: "scanning" | "done" | "error"; root: string; recursive: boolean;
  scanned: number; found: number; files: ScanFile[]; errors: string[]; startedAt: number; error?: string;
};
const g = globalThis as typeof globalThis & { __vvJobs?: Map<string, ScanJob> };
export const scanJobs: Map<string, ScanJob> = (g.__vvJobs ??= new Map());

export async function startScan(root: string, recursive: boolean, probe: boolean): Promise<ScanJob> {
  const resolved = await assertAllowedPath(root);
  const st = await statIfExists(resolved);
  if (!st || !st.isDirectory()) throw new Error("Folder does not exist or is not a directory: " + resolved);
  const job: ScanJob = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    status: "scanning", root: resolved, recursive, scanned: 0, found: 0, files: [], errors: [], startedAt: Date.now(),
  };
  scanJobs.set(job.id, job);
  void runScan(job, probe);
  return job;
}

async function runScan(job: ScanJob, probe: boolean) {
  try {
    const s = await getSettings();
    const canProbe = probe && (await toolAvailable(s.ffprobePath));
    if (probe && !canProbe) job.errors.push("FFprobe not available — files listed without metadata. Install FFmpeg or set its path in Settings.");
    const existing = new Set((await db.select({ p: videos.filePath }).from(videos)).map((r) => r.p));
    const queue = [job.root];
    const MAX = 4000;
    while (queue.length && job.files.length < MAX) {
      const dir = queue.shift()!;
      let entries: fs.Dirent[];
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch (e) { job.errors.push(`Cannot read ${dir}: ${e instanceof Error ? e.message : "error"}`); continue; }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (job.recursive) queue.push(full); continue; }
        if (!ent.isFile()) continue;
        job.scanned++;
        if (!isVideoFile(ent.name)) continue;
        try {
          const st = await fs.promises.stat(full);
          const meta = canProbe ? await probeFile(full) : null;
          job.files.push({
            path: full, name: ent.name, ext: extOf(ent.name), size: st.size, mtime: st.mtime.toISOString(),
            durationSec: meta?.durationSec ?? null, width: meta?.width ?? null, height: meta?.height ?? null,
            fps: meta?.fps ?? null, codec: meta?.codec ?? null, format: meta?.format ?? null,
            status: existing.has(full) ? "exists" : "new",
          });
          job.found = job.files.length;
        } catch (e) {
          job.files.push({ path: full, name: ent.name, ext: extOf(ent.name), size: 0, mtime: "", durationSec: null, width: null, height: null, fps: null, codec: null, format: null, status: "error", error: e instanceof Error ? e.message : "unreadable" });
        }
      }
    }
    if (job.files.length >= MAX) job.errors.push(`Result limit (${MAX} files) reached — scan narrower folders for the rest.`);
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : "Scan failed";
  }
}

/* ---------------- Import ---------------- */
export async function insertVideoFromPath(filePath: string, opts: { hash?: boolean; thumb?: boolean } = {}): Promise<Video> {
  const resolved = await assertAllowedPath(filePath);
  const st = await statIfExists(resolved);
  if (!st || !st.isFile()) throw new Error("File not found: " + resolved);
  const meta = await probeFile(resolved);
  const s = await getSettings();
  const doHash = opts.hash ?? s.hashOnImport;
  const hash = doHash ? await hashFile(resolved) : null;
  const [row] = await db.insert(videos).values({
    title: titleFromFileName(path.basename(resolved)),
    fileName: path.basename(resolved),
    filePath: resolved,
    fileExt: extOf(resolved),
    format: meta?.format ?? null,
    sizeBytes: st.size,
    durationSec: meta?.durationSec ?? null,
    width: meta?.width ?? null,
    height: meta?.height ?? null,
    fps: meta?.fps ?? null,
    codec: meta?.codec ?? null,
    fileModifiedAt: st.mtime,
    lastMetaCheck: new Date(),
    hash,
    missing: false,
  }).returning();
  const wantThumb = opts.thumb ?? s.thumbsEnabled;
  if (wantThumb) await generateThumb(row.id, resolved, row.durationSec);
  return row;
}

export async function importPaths(paths: string[], opts: { hash?: boolean; thumb?: boolean }): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0, skipped = 0;
  const errors: string[] = [];
  const existing = new Set((await db.select({ p: videos.filePath }).from(videos)).map((r) => r.p));
  for (const p of paths) {
    try {
      const resolved = await assertAllowedPath(p);
      if (existing.has(resolved)) { skipped++; continue; }
      await insertVideoFromPath(resolved, opts);
      existing.add(resolved);
      imported++;
    } catch (e) { errors.push(`${path.basename(p)}: ${e instanceof Error ? e.message : "failed"}`); }
  }
  await audit("import.completed", { imported, skipped, errors: errors.length });
  return { imported, skipped, errors };
}

/* ---------------- Integrity ---------------- */
export async function verifyLibrary(): Promise<{ checked: number; missing: number; updated: number }> {
  const all = await db.select().from(videos);
  const s = await getSettings();
  const canProbe = await toolAvailable(s.ffprobePath);
  let missing = 0, updated = 0;
  for (const v of all) {
    const st = await statIfExists(v.filePath);
    if (!st || !st.isFile()) {
      missing++;
      if (!v.missing) await db.update(videos).set({ missing: true, lastMetaCheck: new Date() }).where(eq(videos.id, v.id));
      continue;
    }
    const changed = st.size !== v.sizeBytes;
    const patch: Partial<typeof videos.$inferInsert> = { missing: false, lastMetaCheck: new Date() };
    if (changed) {
      patch.sizeBytes = st.size;
      patch.fileModifiedAt = st.mtime;
      if (canProbe) {
        const meta = await probeFile(v.filePath);
        if (meta) Object.assign(patch, { durationSec: meta.durationSec, width: meta.width, height: meta.height, fps: meta.fps, codec: meta.codec, format: meta.format });
      }
      updated++;
    }
    await db.update(videos).set(patch).where(eq(videos.id, v.id));
  }
  await audit("integrity.verified", { checked: all.length, missing, updated });
  return { checked: all.length, missing, updated };
}

export async function relinkVideo(id: number, newPath: string): Promise<Video> {
  const resolved = await assertAllowedPath(newPath);
  const st = await statIfExists(resolved);
  if (!st || !st.isFile()) throw new Error("New path does not point to an existing file.");
  const clash = await db.select({ id: videos.id }).from(videos).where(eq(videos.filePath, resolved));
  if (clash.length && clash[0].id !== id) throw new Error("Another inventory record already uses that path.");
  const meta = await probeFile(resolved);
  const [row] = await db.update(videos).set({
    filePath: resolved, fileName: path.basename(resolved), fileExt: extOf(resolved),
    sizeBytes: st.size, fileModifiedAt: st.mtime, missing: false, lastMetaCheck: new Date(),
    ...(meta ? { durationSec: meta.durationSec, width: meta.width, height: meta.height, fps: meta.fps, codec: meta.codec, format: meta.format } : {}),
  }).where(eq(videos.id, id)).returning();
  if (!row) throw new Error("Video not found.");
  await audit("video.relinked", { id, changedFile: true });
  return row;
}

/* ---------------- Duplicate detection ---------------- */
export type DupGroup = {
  key: string;
  method: "hash" | "name-size" | "size-duration";
  certainty: "identical" | "very likely" | "possible";
  label: string;
  videos: Video[];
};

export async function duplicateGroups(): Promise<DupGroup[]> {
  const all = await db.select().from(videos);
  const buckets = new Map<string, { method: DupGroup["method"]; items: Video[] }>();
  const add = (method: DupGroup["method"], key: string, v: Video) => {
    const k = method + ":" + key;
    if (!buckets.has(k)) buckets.set(k, { method, items: [] });
    buckets.get(k)!.items.push(v);
  };
  for (const v of all) {
    if (v.hash) add("hash", v.hash, v);
    if (v.sizeBytes > 0) add("name-size", v.fileName.toLowerCase() + "|" + v.sizeBytes, v);
    if (v.sizeBytes > 0 && v.durationSec != null && v.durationSec > 0) add("size-duration", v.sizeBytes + "|" + Math.round(v.durationSec), v);
  }
  // merge overlapping groups, strongest method wins
  const groups: DupGroup[] = [];
  const idToGroup = new Map<number, number>();
  const rank = { hash: 3, "name-size": 2, "size-duration": 1 } as const;
  const sorted = [...buckets.values()].filter((b) => b.items.length > 1).sort((a, b) => rank[b.method] - rank[a.method]);
  for (const b of sorted) {
    const existingIdx = b.items.map((v) => idToGroup.get(v.id)).find((x) => x !== undefined);
    if (existingIdx !== undefined) {
      const grp = groups[existingIdx];
      for (const v of b.items) if (!grp.videos.some((x) => x.id === v.id)) { grp.videos.push(v); idToGroup.set(v.id, existingIdx); }
    } else {
      const idx = groups.length;
      const certainty = b.method === "hash" ? "identical" : b.method === "name-size" ? "very likely" : "possible";
      const label = b.method === "hash" ? "Identical content — SHA-256 match"
        : b.method === "name-size" ? "Duplicate file — same name & size"
        : "Similar — same size & duration (not proven identical)";
      groups.push({ key: "g" + idx, method: b.method, certainty, label, videos: [...b.items] });
      for (const v of b.items) idToGroup.set(v.id, idx);
    }
  }
  return groups;
}

export async function videosByIds(ids: number[]): Promise<Video[]> {
  if (!ids.length) return [];
  return db.select().from(videos).where(inArray(videos.id, ids));
}