import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "./settings";
import { dataDir } from "./paths";

export const OWNER_COOKIE = "vv_owner";
export const SHARE_COOKIE = "vv_share";

function secret(): string {
  const f = path.join(dataDir(), ".secret");
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  return fs.readFileSync(f, "utf8").trim();
}

function hmac(v: string): string {
  return crypto.createHmac("sha256", secret()).update(v).digest("hex");
}

export function makeOwnerToken(hours = 24 * 7): string {
  const exp = Date.now() + hours * 3600_000;
  return `${exp}.${hmac(String(exp))}`;
}
export function validOwnerToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expect = hmac(exp);
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch { return false; }
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const dk = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `scrypt:${salt}:${dk}`;
}
export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [alg, salt, dk] = stored.split(":");
  if (alg !== "scrypt" || !salt || !dk) return false;
  const test = crypto.scryptSync(pw, salt, 32);
  try { return crypto.timingSafeEqual(test, Buffer.from(dk, "hex")); } catch { return false; }
}

/** API guard: returns a 401 Response when auth is enabled and the owner is not signed in. */
export async function requireOwner(): Promise<Response | null> {
  const s = await getSettings();
  if (!s.authEnabled || !s.passwordHash) return null;
  const jar = await cookies();
  if (validOwnerToken(jar.get(OWNER_COOKIE)?.value)) return null;
  return Response.json({ error: "Authentication required. Sign in to continue." }, { status: 401 });
}

/** Server-component guard for admin pages. */
export async function guardPage(): Promise<void> {
  const s = await getSettings();
  if (!s.authEnabled || !s.passwordHash) return;
  const jar = await cookies();
  if (!validOwnerToken(jar.get(OWNER_COOKIE)?.value)) redirect("/vault/login");
}

/**
 * CSRF defense for state-changing requests:
 *  - custom header must be present (cross-site forms cannot set headers),
 *  - Origin, when present, must match the request host.
 */
export function csrfOk(req: Request): boolean {
  if (req.headers.get("x-vault") !== "1") return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("host");
      if (new URL(origin).host !== host) return false;
    } catch { return false; }
  }
  return true;
}
