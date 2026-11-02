import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import { csrfOk, SHARE_COOKIE } from "@/lib/auth";
import { ok, fail, readBody, errMsg } from "@/lib/api";
import { redeemCode, checkSession, endSession, touchSession } from "@/lib/shares";
import { videosByIds } from "@/lib/library";
import { thumbsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!csrfOk(req)) return fail("CSRF check failed.", 403);
  try {
    const b = await readBody(req);
    if (b.acknowledge !== true) return fail("Please confirm you are 18+ and an authorized recipient.");
    const code = String(b.code ?? "");
    if (!code.trim()) return fail("Enter your access code.");
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const result = redeemCode(code, ip);
    const r = await result;
    if (!r.ok) return Response.json({ error: r.error, retryAfterSec: r.retryAfterSec ?? null }, { status: 429 });
    const jar = await cookies();
    jar.set(SHARE_COOKIE, r.session.sid, {
      httpOnly: true, sameSite: "lax", secure: req.url.startsWith("https"), path: "/",
      expires: new Date(r.session.expiresAt),
    });
    return ok({ sid: r.session.sid, expiresAt: r.session.expiresAt, videoIds: r.session.videoIds });
  } catch (e) { return fail(errMsg(e), 500); }
}

/** Recipient session info — deliberately minimal: no file paths, no internal data. */
export async function GET() {
  try {
    const jar = await cookies();
    const sid = jar.get(SHARE_COOKIE)?.value;
    const check = checkSession(sid);
    if (!check.ok) return ok({ active: false, error: check.error });
    await touchSession(sid!);
    const vids = await videosByIds(check.session.videoIds);
    const td = thumbsDir();
    return ok({
      active: true,
      expiresAt: check.session.expiresAt,
      shareExpiresAt: check.share.expiresAt,
      restrictions: {
        allowPause: check.share.allowPause, allowSeek: check.share.allowSeek,
        allowSpeed: check.share.allowSpeed, disableDownload: check.share.disableDownload,
      },
      videos: vids.map((v) => ({
        id: v.id, title: v.title, durationSec: v.durationSec, height: v.height,
        missing: v.missing, hasThumb: fs.existsSync(path.join(td, `${v.id}.jpg`)),
      })),
    });
  } catch (e) { return fail(errMsg(e), 500); }
}

export async function DELETE(req: Request) {
  if (!csrfOk(req)) return fail("CSRF check failed.", 403);
  const jar = await cookies();
  const sid = jar.get(SHARE_COOKIE)?.value;
  if (sid) await endSession(sid);
  jar.delete(SHARE_COOKIE);
  return ok({ ended: true });
}