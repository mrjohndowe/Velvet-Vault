import path from "path";
import { requireOwner, hashPassword, verifyPassword } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr, numOr } from "@/lib/api";
import { getSettings, updateSettings, publicSettings, type AppSettings } from "@/lib/settings";
import { statIfExists } from "@/lib/paths";
import { toolAvailable, clearToolCache } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const s = await getSettings();
    const ffmpeg = await toolAvailable(s.ffmpegPath);
    const ffprobe = await toolAvailable(s.ffprobePath);
    return ok({ settings: publicSettings(s), tools: { ffmpeg, ffprobe }, shareStorage: { backend: "JSON", location: "data/shares.json (project folder, never web-served)" } });
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function PATCH(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    const cur = await getSettings();
    const patch: Partial<AppSettings> = {};

    if (b.libraryRoots !== undefined) {
      if (!Array.isArray(b.libraryRoots)) return fail("libraryRoots must be an array.");
      const roots: string[] = [];
      for (const r of b.libraryRoots as string[]) {
        const p = String(r).trim();
        if (!p) continue;
        const resolved = path.resolve(p);
        const st = await statIfExists(resolved);
        if (!st?.isDirectory()) return fail("Library root does not exist or is not a folder: " + resolved);
        if (!roots.includes(resolved)) roots.push(resolved);
      }
      patch.libraryRoots = roots;
    }
    if (b.ffmpegPath !== undefined) { patch.ffmpegPath = String(b.ffmpegPath).trim() || "ffmpeg"; clearToolCache(); }
    if (b.ffprobePath !== undefined) { patch.ffprobePath = String(b.ffprobePath).trim() || "ffprobe"; clearToolCache(); }
    if (b.thumbsEnabled !== undefined) patch.thumbsEnabled = b.thumbsEnabled === true;
    if (b.thumbWidth !== undefined) patch.thumbWidth = Math.min(960, Math.max(120, intOr(b.thumbWidth, 480) ?? 480));
    if (b.thumbSeekPct !== undefined) patch.thumbSeekPct = Math.min(90, Math.max(1, intOr(b.thumbSeekPct, 25) ?? 25));
    if (b.hashOnImport !== undefined) patch.hashOnImport = b.hashOnImport === true;
    if (b.pageSize !== undefined) patch.pageSize = Math.min(100, Math.max(6, intOr(b.pageSize, 24) ?? 24));
    if (b.defaultView !== undefined) patch.defaultView = b.defaultView === "table" ? "table" : "gallery";
    if (b.blurThumbs !== undefined) patch.blurThumbs = b.blurThumbs === true;
    if (b.shareDefaultHours !== undefined) patch.shareDefaultHours = Math.min(24 * 90, Math.max(1, numOr(b.shareDefaultHours, 72) ?? 72));
    if (b.shareRetentionDays !== undefined) patch.shareRetentionDays = Math.min(365, Math.max(1, intOr(b.shareRetentionDays, 30) ?? 30));

    // Password management (verifier only, scrypt)
    if (b.setPassword !== undefined) {
      const pw = String(b.setPassword ?? "");
      if (cur.passwordHash && !verifyPassword(String(b.currentPassword ?? ""), cur.passwordHash)) {
        return fail("Current password is incorrect.", 403);
      }
      if (pw === "") { patch.passwordHash = null; patch.authEnabled = false; }
      else {
        if (pw.length < 8) return fail("Password must be at least 8 characters.");
        patch.passwordHash = hashPassword(pw);
        patch.authEnabled = true;
      }
    }
    if (b.authEnabled !== undefined) {
      const want = b.authEnabled === true;
      const willHaveHash = patch.passwordHash !== undefined ? patch.passwordHash : cur.passwordHash;
      if (want && !willHaveHash) return fail("Set a password before enabling login protection.");
      patch.authEnabled = want;
    }
    const next = await updateSettings(patch);
    return ok({ settings: publicSettings(next) });
  } catch (e) { return fail(errMsg(e)); }
}