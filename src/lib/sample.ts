/**
 * Sample inventory: fictional titles + synthetic, non-explicit FFmpeg test clips.
 * Real files are generated locally so durations, thumbnails, playback, duplicate
 * and missing-file detection are all exercised against genuine data.
 */
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { videos, categories, tags, videoTags, collections, collectionVideos } from "@/db/schema";
import { eq } from "drizzle-orm";
import { demoDir } from "./paths";
import { getSettings, updateSettings } from "./settings";
import { runTool, toolAvailable, generateThumb, hashFile, probeFile } from "./media";
import { extOf, titleFromFileName } from "./util";
import { audit } from "./shares";

const STARTER_CATEGORIES = ["Amateur", "Couples", "Solo", "Roleplay", "BDSM", "Fetish", "Romance", "Educational", "Compilation", "Other"];

export async function ensureStarterCategories(): Promise<number> {
  const existing = await db.select().from(categories);
  let added = 0;
  for (const name of STARTER_CATEGORIES) {
    if (!existing.some((c) => c.name === name && c.parentId === null)) {
      await db.insert(categories).values({ name });
      added++;
    }
  }
  return added;
}

type Spec = { file: string; w: number; h: number; dur: number; hue: number; hz: number; webm?: boolean };
const SPECS: Spec[] = [
  { file: "midnight-rehearsal.mp4", w: 1280, h: 720, dur: 14, hue: 200, hz: 392 },
  { file: "velvet-hours-session-03.mp4", w: 1920, h: 1080, dur: 18, hue: 320, hz: 440 },
  { file: "amber-light-duet.mp4", w: 1280, h: 720, dur: 11, hue: 35, hz: 494 },
  { file: "behind-closed-doors-ep2.mp4", w: 854, h: 480, dur: 22, hue: 260, hz: 330 },
  { file: "silk-and-static.webm", w: 1280, h: 720, dur: 9, hue: 150, hz: 523, webm: true },
  { file: "the-long-take.mp4", w: 1920, h: 1080, dur: 26, hue: 10, hz: 294 },
  { file: "analog-dreams.mp4", w: 640, h: 480, dur: 12, hue: 90, hz: 349 },
];

const FICTION: Record<string, Partial<typeof videos.$inferInsert>> = {
  "midnight-rehearsal.mp4": { title: "Midnight Rehearsal", altTitle: "Late Session Take 2", studio: "Nocturne Pictures", performers: "Ava Nocturne, Jules Marlowe", source: "Nocturne Pictures — vol. 4", rating: 5, favorite: true, watchStatus: "watched", watchCount: 3, description: "Fictional sample record. A slow, atmospheric studio session — used to demonstrate the inventory.", privateNotes: "Sample note: great lighting reference. (Private notes stay out of exports.)", contentWarnings: null },
  "velvet-hours-session-03.mp4": { title: "Velvet Hours — Session 03", studio: "Ember Room", performers: "Rin Solace", source: "Ember Room archive", rating: 4, favorite: true, watchStatus: "partial", watchCount: 1, description: "Fictional sample record in 1080p used to exercise resolution filters and thumbnails.", privateNotes: "Sample: compare with the backup copy in /backup." },
  "amber-light-duet.mp4": { title: "Amber Light Duet", studio: "Homegrown (Amateur)", performers: "Cass Vega, Jules Marlowe", source: "Personal recording (fictional)", rating: 4, watchStatus: "watched", watchCount: 2, description: "Fictional amateur-style sample entry.", contentWarnings: "Fictional example warning" },
  "behind-closed-doors-ep2.mp4": { title: "Behind Closed Doors — Ep. 2", altTitle: "BCD S01E02", studio: "Nocturne Pictures", performers: "Ava Nocturne", source: "Series rip (fictional)", rating: 3, watchStatus: "unwatched", description: "Fictional 480p sample — demonstrates low-resolution filtering." },
  "silk-and-static.webm": { title: "Silk & Static", studio: "Ember Room", performers: "Rin Solace, Cass Vega", source: "Web release (fictional)", rating: 5, favorite: true, watchStatus: "unwatched", description: "Fictional WebM sample — browser-playable alternate format." },
  "the-long-take.mp4": { title: "The Long Take (Director's Cut)", studio: "Nocturne Pictures", performers: "Ava Nocturne, Rin Solace", source: "Director's cut (fictional)", rating: 5, watchStatus: "watched", watchCount: 5, description: "Fictional sample with the longest runtime in the demo set.", privateNotes: "Sample: bookmark the midpoint." },
  "analog-dreams.mp4": { title: "Analog Dreams", studio: "Homegrown (Amateur)", performers: "Cass Vega", source: "Tape transfer (fictional)", rating: 2, watchStatus: "partial", watchCount: 1, description: "Fictional low-fi sample used for the missing-file report." },
};

export async function seedSampleLibrary(): Promise<{ created: number; duplicates: number; missing: number; ffmpeg: boolean; already?: boolean }> {
  const s = await getSettings();
  if (s.seeded) return { created: 0, duplicates: 0, missing: 0, ffmpeg: false, already: true };
  const dir = demoDir();
  const hasFF = await toolAvailable(s.ffmpegPath);
  await ensureStarterCategories();
  const cats = await db.select().from(categories);
  const catId = (n: string) => cats.find((c) => c.name === n)?.id ?? null;

  const tagNames = ["remaster", "favorite scene", "classic", "slow burn", "great soundtrack", "behind the scenes"];
  for (const t of tagNames) await db.insert(tags).values({ name: t }).onConflictDoNothing();
  const allTags = await db.select().from(tags);

  const made: { file: string; id: number }[] = [];
  let created = 0;

  const importOne = async (full: string, extra: Partial<typeof videos.$inferInsert>) => {
    const st = fs.statSync(full);
    const meta = await probeFile(full);
    const hash = await hashFile(full);
    const [row] = await db.insert(videos).values({
      title: titleFromFileName(path.basename(full)),
      fileName: path.basename(full), filePath: full, fileExt: extOf(full),
      format: meta?.format ?? null, sizeBytes: st.size,
      durationSec: meta?.durationSec ?? null, width: meta?.width ?? null, height: meta?.height ?? null,
      fps: meta?.fps ?? null, codec: meta?.codec ?? null,
      fileModifiedAt: st.mtime, lastMetaCheck: new Date(), hash, missing: false,
      ...extra,
    }).returning();
    await generateThumb(row.id, full, row.durationSec);
    created++;
    made.push({ file: path.basename(full), id: row.id });
    return row;
  };

  if (hasFF) {
    for (const spec of SPECS) {
      const out = path.join(dir, spec.file);
      if (!fs.existsSync(out)) {
        const vcodec = spec.webm ? ["-c:v", "libvpx", "-b:v", "400k", "-c:a", "libvorbis"] : ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"];
        const r = await runTool(s.ffmpegPath, [
          "-y", "-f", "lavfi", "-i", `testsrc2=size=${spec.w}x${spec.h}:rate=24`,
          "-f", "lavfi", "-i", `sine=frequency=${spec.hz}:sample_rate=44100`,
          "-t", String(spec.dur), "-vf", `hue=h=${spec.hue}`, ...vcodec, "-shortest", out,
        ], 90000);
        if (!r.ok || !fs.existsSync(out)) continue;
      }
      const daysAgo = 2 + SPECS.indexOf(spec) * 3;
      const extra = { ...FICTION[spec.file], dateAdded: new Date(Date.now() - daysAgo * 86400_000), recordedAt: new Date(Date.now() - (daysAgo + 120) * 86400_000) };
      await importOne(out, extra);
    }
    // True duplicate: byte-identical copy with the same name in a backup folder
    const src = path.join(dir, "velvet-hours-session-03.mp4");
    if (fs.existsSync(src)) {
      const bdir = path.join(dir, "backup");
      fs.mkdirSync(bdir, { recursive: true });
      const dst = path.join(bdir, "velvet-hours-session-03.mp4");
      fs.copyFileSync(src, dst);
      await importOne(dst, { title: "Velvet Hours — Session 03 (backup copy)", studio: "Ember Room", rating: 0, description: "Byte-identical backup copy — appears in Duplicate Review." });
    }
    // Missing file: import then remove the generated demo file (never user media)
    const gone = path.join(dir, "rooftop-rendezvous.mp4");
    const r = await runTool(s.ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-t", "6", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", gone], 60000);
    if (r.ok && fs.existsSync(gone)) {
      await importOne(gone, { title: "Rooftop Rendezvous", studio: "Homegrown (Amateur)", description: "Sample record whose demo file was removed to exercise missing-file detection.", missing: true });
      fs.unlinkSync(gone);
    }
  }

  // Assign categories, tags, watch dates, collections
  const catFor: Record<string, string> = {
    "Midnight Rehearsal": "Couples", "Velvet Hours — Session 03": "Solo", "Amber Light Duet": "Amateur",
    "Behind Closed Doors — Ep. 2": "Roleplay", "Silk & Static": "Romance", "The Long Take (Director's Cut)": "Couples",
    "Analog Dreams": "Amateur", "Rooftop Rendezvous": "Amateur", "Velvet Hours — Session 03 (backup copy)": "Solo",
  };
  const all = await db.select().from(videos);
  let i = 0;
  for (const v of all) {
    const patch: Partial<typeof videos.$inferInsert> = { categoryId: catId(catFor[v.title] ?? "Other") };
    if (v.watchStatus !== "unwatched") patch.lastWatchedAt = new Date(Date.now() - (i + 1) * 3600_000 * 7);
    if (v.watchStatus === "partial") patch.progressSec = (v.durationSec ?? 60) * 0.4;
    await db.update(videos).set(patch).where(eq(videos.id, v.id));
    const t1 = allTags[i % allTags.length], t2 = allTags[(i + 2) % allTags.length];
    if (t1) await db.insert(videoTags).values({ videoId: v.id, tagId: t1.id }).onConflictDoNothing();
    if (t2) await db.insert(videoTags).values({ videoId: v.id, tagId: t2.id }).onConflictDoNothing();
    i++;
  }
  const [queue] = await db.insert(collections).values({ name: "Weekend Queue", kind: "playlist", description: "Fictional sample playlist." }).returning();
  const [best] = await db.insert(collections).values({ name: "Best of Nocturne", kind: "collection", description: "Fictional sample collection." }).returning();
  for (const [idx, m] of made.slice(0, 4).entries()) {
    await db.insert(collectionVideos).values({ collectionId: queue.id, videoId: m.id, position: idx }).onConflictDoNothing();
  }
  for (const m of made.filter((x) => ["midnight-rehearsal.mp4", "the-long-take.mp4", "behind-closed-doors-ep2.mp4"].includes(x.file))) {
    await db.insert(collectionVideos).values({ collectionId: best.id, videoId: m.id }).onConflictDoNothing();
  }

  const roots = s.libraryRoots.includes(dir) ? s.libraryRoots : [...s.libraryRoots, dir];
  await updateSettings({ libraryRoots: roots, seeded: true });
  await audit("sample.loaded", { created, ffmpeg: hasFF });
  return { created, duplicates: hasFF ? 1 : 0, missing: hasFF ? 1 : 0, ffmpeg: hasFF };
}