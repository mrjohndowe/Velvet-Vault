import { cookies } from "next/headers";
import { getSettings } from "@/lib/settings";
import { makeOwnerToken, verifyPassword, validOwnerToken, OWNER_COOKIE, csrfOk } from "@/lib/auth";
import { ok, fail, readBody } from "@/lib/api";
import { audit } from "@/lib/shares";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; until: number }>();

export async function GET() {
  const s = await getSettings();
  const jar = await cookies();
  return ok({ authEnabled: s.authEnabled && !!s.passwordHash, loggedIn: validOwnerToken(jar.get(OWNER_COOKIE)?.value) });
}

export async function POST(req: Request) {
  if (!csrfOk(req)) return fail("CSRF check failed.", 403);
  const b = await readBody(req);
  const jar = await cookies();
  if (b.action === "logout") {
    jar.delete(OWNER_COOKIE);
    await audit("auth.logout", {});
    return ok({ loggedOut: true });
  }
  if (b.action === "login") {
    const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const a = attempts.get(ip) ?? { n: 0, until: 0 };
    if (a.until > Date.now()) return fail("Too many attempts. Wait a minute and try again.", 429);
    const s = await getSettings();
    if (!s.authEnabled || !s.passwordHash) return fail("Login protection is not enabled.");
    if (!verifyPassword(String(b.password ?? ""), s.passwordHash)) {
      a.n++;
      if (a.n >= 5) { a.until = Date.now() + 60_000; a.n = 0; }
      attempts.set(ip, a);
      await audit("auth.failed", {});
      return fail("Incorrect password.", 401);
    }
    attempts.delete(ip);
    const secure = req.url.startsWith("https");
    jar.set(OWNER_COOKIE, makeOwnerToken(), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 7 * 86400 });
    await audit("auth.login", {});
    return ok({ loggedIn: true });
  }
  return fail("Unknown action.");
}