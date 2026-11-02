import fs from "fs";
import path from "path";
import { requireOwner } from "@/lib/auth";
import { fail } from "@/lib/api";
import { thumbsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(); if (denied) return denied;
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return fail("Invalid id", 400);
  const f = path.join(thumbsDir(), `${n}.jpg`);
  if (!fs.existsSync(f)) return fail("No thumbnail", 404);
  const buf = fs.readFileSync(f);
  // sniff actual format (uploads may be png/webp stored under .jpg)
  let type = "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) type = "image/png";
  else if (buf.toString("ascii", 0, 4) === "RIFF") type = "image/webp";
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=120", "X-Content-Type-Options": "nosniff" },
  });
}