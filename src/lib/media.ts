import { spawn } from "child_process";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { getSettings } from "./settings";
import { thumbsDir } from "./paths";

export function runTool(bin: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", done = false;
    try {
      const p = spawn(bin, args, { windowsHide: true });
      const timer = setTimeout(() => { if (!done) { done = true; p.kill("SIGKILL"); resolve({ ok: false, stdout, stderr: "timeout" }); } }, timeoutMs);
      p.stdout.on("data", (d) => { if (stdout.length < 4_000_000) stdout += d; });
      p.stderr.on("data", (d) => { if (stderr.length < 200_000) stderr += d; });
      p.on("error", (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, stdout, stderr: String(e.message) }); } });
      p.on("close", (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: code === 0, stdout, stderr }); } });
    } catch (e) {
      resolve({ ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e) });
    }
  });
}

const availCache = new Map<string, boolean>();
export async function toolAvailable(bin: string): Promise<boolean> {
  if (availCache.has(bin)) return availCache.get(bin)!;
  const r = await runTool(bin, ["-version"], 8000);
  availCache.set(bin, r.ok);
  return r.ok;
}
export function clearToolCache() { availCache.clear(); }

export type ProbedMeta = {
  durationSec: number | null; width: number | null; height: number | null;
  fps: number | null; codec: string | null; format: string | null;
};

export async function probeFile(filePath: string): Promise<ProbedMeta | null> {
  const s = await getSettings();
  if (!(await toolAvailable(s.ffprobePath))) return null;
  const r = await runTool(s.ffprobePath, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath,
  ], 20000);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.stdout);
    const vs = (j.streams ?? []).find((x: { codec_type?: string }) => x.codec_type === "video") ?? {};
    let fps: number | null = null;
    const fr = vs.avg_frame_rate ?? vs.r_frame_rate;
    if (typeof fr === "string" && fr.includes("/")) {
      const [a, b] = fr.split("/").map(Number);
      if (b > 0 && a > 0) fps = Math.round((a / b) * 100) / 100;
    }
    let dur = parseFloat(j.format?.duration);
    if (isNaN(dur)) dur = parseFloat(vs.duration);
    return {
      durationSec: isNaN(dur) ? null : Math.round(dur * 100) / 100,
      width: vs.width ?? null,
      height: vs.height ?? null,
      fps,
      codec: vs.codec_name ?? null,
      format: j.format?.format_name ?? null,
    };
  } catch { return null; }
}

export async function generateThumb(videoId: number, filePath: string, durationSec: number | null): Promise<boolean> {
  const s = await getSettings();
  if (!(await toolAvailable(s.ffmpegPath))) return false;
  const seek = durationSec && durationSec > 2 ? Math.max(0.5, durationSec * (s.thumbSeekPct / 100)) : 1;
  const out = path.join(thumbsDir(), `${videoId}.jpg`);
  const r = await runTool(s.ffmpegPath, [
    "-y", "-ss", String(seek), "-i", filePath, "-frames:v", "1",
    "-vf", `scale=${Math.max(120, s.thumbWidth)}:-2`, "-q:v", "5", out,
  ], 25000);
  return r.ok && fs.existsSync(out);
}

export function hashFile(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const h = crypto.createHash("sha256");
      const st = fs.createReadStream(filePath);
      st.on("data", (d) => h.update(d));
      st.on("error", () => resolve(null));
      st.on("end", () => resolve(h.digest("hex")));
    } catch { resolve(null); }
  });
}