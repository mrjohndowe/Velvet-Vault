import path from "path";
import fs from "fs";
import { getSettings } from "./settings";

export function dataDir(): string {
  const d = path.join(process.cwd(), "data");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function thumbsDir(): string {
  const d = path.join(dataDir(), "thumbs");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function demoDir(): string {
  const d = path.join(dataDir(), "demo-library");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function norm(p: string): string {
  const r = path.resolve(p.replace(/\0/g, ""));
  return process.platform === "win32" ? r.toLowerCase() : r;
}

export function isWithinRoots(target: string, roots: string[]): boolean {
  if (!target || target.includes("\0")) return false;
  const t = norm(target);
  return roots.some((root) => {
    if (!root) return false;
    const r = norm(root);
    return t === r || t.startsWith(r + path.sep);
  });
}

/** Throws unless the path sits inside a configured library root. */
export async function assertAllowedPath(target: string): Promise<string> {
  const s = await getSettings();
  const resolved = path.resolve(target);
  if (!isWithinRoots(resolved, s.libraryRoots)) {
    throw new Error("Path is outside the configured library roots. Add the folder in Settings first.");
  }
  return resolved;
}

export async function statIfExists(p: string): Promise<fs.Stats | null> {
  try { return await fs.promises.stat(p); } catch { return null; }
}

export function parentDir(p: string): string { return path.dirname(p); }