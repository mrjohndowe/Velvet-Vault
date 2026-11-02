import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { requireOwner } from "@/lib/auth";
import { guardMutation, ok, fail, readBody, errMsg, intOr, numOr } from "@/lib/api";
import { createShare, listShares, revokeShare, purgeExpired, shareStatus } from "@/lib/shares";
import { videosByIds } from "@/lib/library";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireOwner(); if (denied) return denied;
  try {
    const s = await getSettings();
    await purgeExpired(s.shareRetentionDays);
    const u = new URL(req.url).searchParams;
    const auditFor = u.get("auditFor");
    if (auditFor) {
      const rows = await db.select().from(auditLog)
        .where(sql`${auditLog.detail}->>'shareId' = ${auditFor}`).orderBy(desc(auditLog.ts)).limit(100);
      return ok({ audit: rows });
    }
    const shares = listShares();
    const vids = await videosByIds([...new Set(shares.flatMap((x) => x.videoIds))]);
    const out = shares.map((sh) => {
      const { codeHash: _h, ...safe } = sh; // verifier never leaves the server
      return {
        ...safe, status: shareStatus(sh),
        videos: sh.videoIds.map((id) => {
          const v = vids.find((x) => x.id === id);
          return { id, title: v?.title ?? `#${id} (removed)`, durationSec: v?.durationSec ?? null, missing: v?.missing ?? true };
        }),
      };
    });
    return ok({ shares: out });
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function POST(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    if (b.action === "purge") {
      const s = await getSettings();
      const n = await purgeExpired(s.shareRetentionDays);
      return ok({ purged: n });
    }
    const videoIds = Array.isArray(b.videoIds) ? (b.videoIds as number[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!videoIds.length) return fail("Select at least one video to share.");
    const found = await videosByIds(videoIds);
    if (found.length !== videoIds.length) return fail("One or more videos do not exist.");
    if (found.some((v) => v.missing)) return fail("Cannot share a video whose file is missing.");
    const s = await getSettings();
    const { share, code } = await createShare({
      videoIds,
      expiresInHours: Math.min(24 * 90, Math.max(1, numOr(b.expiresInHours, s.shareDefaultHours) ?? s.shareDefaultHours)),
      singleUse: b.singleUse !== false,
      maxRedemptions: Math.max(1, intOr(b.maxRedemptions, 1) ?? 1),
      allowPause: b.allowPause !== false,
      allowSeek: b.allowSeek !== false,
      allowSpeed: b.allowSpeed === true,
      disableDownload: b.disableDownload !== false,
      maxViewMinutes: numOr(b.maxViewMinutes),
    });
    const { codeHash: _h, ...safe } = share;
    // The plaintext code is returned ONCE here and never stored or logged.
    return ok({ share: { ...safe, status: shareStatus(share) }, code, accessPath: "/vault/access" });
  } catch (e) { return fail(errMsg(e)); }
}

export async function PATCH(req: Request) {
  const denied = await guardMutation(req); if (denied) return denied;
  try {
    const b = await readBody(req);
    if (b.action === "revoke") {
      const id = String(b.id ?? "");
      const done = await revokeShare(id);
      if (!done) return fail("Share not found.", 404);
      return ok({ revoked: true });
    }
    return fail("Unknown action.");
  } catch (e) { return fail(errMsg(e)); }
}
