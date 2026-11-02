import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { fail } from "@/lib/api";
import { SHARE_COOKIE } from "@/lib/auth";
import { checkSession } from "@/lib/shares";
import { thumbsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return fail("Invalid request", 400);
  const jar = await cookies();
  const check = checkSession(jar.get(SHARE_COOKIE)?.value, n);
  if (!check.ok) return fail(check.error, 403);
  const f = path.join(thumbsDir(), `${n}.jpg`);
  if (!fs.existsSync(f)) return fail("No thumbnail", 404);
  const buf = fs.readFileSync(f);
  let type = "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) type = "image/png";
  else if (buf.toString("ascii", 0, 4) === "RIFF") type = "image/webp";
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}