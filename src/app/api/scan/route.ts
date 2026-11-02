import path from "path";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg } from "@/lib/api";
import { scanJobs, startScan, importPaths } from "@/lib/library";
import { getSettings, updateSettings } from "@/lib/settings";
import { assertAllowedPath, statIfExists, isWithinRoots } from "@/lib/paths";
import { probeFile } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireOwner(); if (denied) return denied;
  const jobId = new URL(req.url).searchParams.get("job");
  if (!jobId) return fail("Missing job id");
  const job = scanJobs.get(jobId);
  if (!job) return fail("Scan job not found (it may have finished and been cleared).", 404);
  return ok({ job });
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    if (b.action === "scan") {
      const root = String(b.root ?? "").trim();
      if (!root) return fail("Enter a folder path to scan.");
      const resolved = path.resolve(root);
      const st = await statIfExists(resolved);
      if (!st?.isDirectory()) return fail("That folder does not exist on this machine: " + resolved);
      const s = await getSettings();
      if (!isWithinRoots(resolved, s.libraryRoots)) {
        if (b.addRoot === true) {
          await updateSettings({ libraryRoots: [...s.libraryRoots, resolved] });
        } else {
          return fail("This folder is outside your configured library roots. Tick “Trust this folder as a library root” or add it in Settings.");
        }
      }
      const job = await startScan(resolved, b.recursive !== false, b.probe !== false);
      return ok({ job });
    }
    if (b.action === "import") {
      const paths = Array.isArray(b.paths) ? (b.paths as string[]).filter((p) => typeof p === "string") : [];
      if (!paths.length) return fail("No files selected for import.");
      if (paths.length > 2000) return fail("Too many files in one import (max 2000).");
      const result = await importPaths(paths, { hash: b.hash === true ? true : undefined, thumb: b.thumb === true ? true : b.thumb === false ? false : undefined });
      return ok(result);
    }
    if (b.action === "probe") {
      const p = String(b.path ?? "").trim();
      if (!p) return fail("No path given.");
      const resolved = await assertAllowedPath(p);
      const st = await statIfExists(resolved);
      if (!st?.isFile()) return fail("File not found at that path.");
      const meta = await probeFile(resolved);
      return ok({ size: st.size, mtime: st.mtime, meta, probed: !!meta });
    }
    return fail("Unknown scan action.");
  } catch (e) { return fail(errMsg(e)); }
}