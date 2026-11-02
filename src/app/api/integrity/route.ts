import { db } from "@/db";
import { videos, auditLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr } from "@/lib/api";
import { duplicateGroups, verifyLibrary, relinkVideo } from "@/lib/library";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const mode = new URL(req.url).searchParams.get("mode") ?? "duplicates";
    if (mode === "duplicates") return ok({ groups: await duplicateGroups() });
    if (mode === "missing") {
      const rows = await db.select().from(videos).where(eq(videos.missing, true)).orderBy(desc(videos.dateAdded));
      return ok({ missing: rows });
    }
    if (mode === "audit") {
      const rows = await db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(200);
      return ok({ audit: rows });
    }
    return fail("Unknown mode.");
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    if (b.action === "verify") return ok(await verifyLibrary());
    if (b.action === "relink") {
      const id = intOr(b.id); const p = String(b.path ?? "").trim();
      if (!id || !p) return fail("Missing video id or new path.");
      const row = await relinkVideo(id, p);
      return ok({ video: row });
    }
    return fail("Unknown action.");
  } catch (e) { return fail(errMsg(e)); }
}