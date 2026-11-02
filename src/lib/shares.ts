/**
 * One-time access code storage — JSON file backend (Option 2 of the spec).
 * File: <project>/data/shares.json  (outside the web root's public dir; served never).
 * Concurrency: an async mutex serializes read-modify-write; writes are atomic
 * (temp file + rename). Codes are stored ONLY as SHA-256 verifiers.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { dataDir } from "./paths";

export type ShareRecord = {
  id: string;
  codeHash: string;
  videoIds: number[];
  createdAt: number;
  expiresAt: number;
  singleUse: boolean;
  maxRedemptions: number;
  redemptionCount: number;
  firstRedeemedAt: number | null;
  lastActivityAt: number | null;
  revokedAt: number | null;
  allowPause: boolean;
  allowSeek: boolean;
  allowSpeed: boolean;
  disableDownload: boolean;
  maxViewMinutes: number | null;
  failedAttempts: number;
  lockedUntil: number | null;
};

export type ViewSession = {
  sid: string;
  shareId: string;
  videoIds: number[];
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
};

type Store = {
  version: 1;
  shares: ShareRecord[];
  sessions: ViewSession[];
  rate: Record<string, { fails: number[]; lockedUntil: number | null }>;
};

const FILE = () => path.join(dataDir(), "shares.json");
const EMPTY = (): Store => ({ version: 1, shares: [], sessions: [], rate: {} });

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function load(): Store {
  const f = FILE();
  if (!fs.existsSync(f)) return EMPTY();
  const raw = fs.readFileSync(f, "utf8");
  let j: Store;
  try { j = JSON.parse(raw); } catch {
    throw new Error("Share storage file is corrupted. Access is denied until it is restored from a backup.");
  }
  if (!j || !Array.isArray(j.shares) || !Array.isArray(j.sessions)) {
    throw new Error("Share storage file is invalid. Access is denied until it is restored from a backup.");
  }
  j.rate = j.rate ?? {};
  return j;
}

function save(s: Store) {
  const f = FILE();
  const tmp = f + ".tmp-" + crypto.randomBytes(4).toString("hex");
  fs.writeFileSync(tmp, JSON.stringify(s, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, f);
}

export function readStoreRaw(): Store { return load(); }
export function replaceStoreRaw(data: unknown) {
  const d = data as Store;
  if (!d || !Array.isArray(d.shares) || !Array.isArray(d.sessions)) throw new Error("Backup share data is invalid.");
  return withLock(() => save({ version: 1, shares: d.shares, sessions: d.sessions, rate: d.rate ?? {} }));
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export function generateCode(): string {
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] & 31];
  return out.match(/.{4}/g)!.join("-");
}
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}
function hashCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeCode(code)).digest("hex");
}

export async function audit(event: string, detail: Record<string, unknown>) {
  try { await db.insert(auditLog).values({ event, detail }); } catch { /* audit must never block */ }
}

export type CreateShareInput = {
  videoIds: number[];
  expiresInHours: number;
  singleUse: boolean;
  maxRedemptions: number;
  allowPause: boolean;
  allowSeek: boolean;
  allowSpeed: boolean;
  disableDownload: boolean;
  maxViewMinutes: number | null;
};

export async function createShare(input: CreateShareInput): Promise<{ share: ShareRecord; code: string }> {
  const code = generateCode();
  const now = Date.now();
  const rec: ShareRecord = {
    id: crypto.randomBytes(12).toString("hex"),
    codeHash: hashCode(code),
    videoIds: input.videoIds,
    createdAt: now,
    expiresAt: now + Math.max(1, input.expiresInHours) * 3600_000,
    singleUse: input.singleUse,
    maxRedemptions: input.singleUse ? 1 : Math.max(1, input.maxRedemptions),
    redemptionCount: 0,
    firstRedeemedAt: null,
    lastActivityAt: null,
    revokedAt: null,
    allowPause: input.allowPause,
    allowSeek: input.allowSeek,
    allowSpeed: input.allowSpeed,
    disableDownload: input.disableDownload,
    maxViewMinutes: input.maxViewMinutes,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await withLock(() => { const s = load(); s.shares.push(rec); save(s); });
  await audit("share.created", { shareId: rec.id, videoIds: rec.videoIds, singleUse: rec.singleUse, expiresAt: rec.expiresAt });
  return { share: rec, code }; // plaintext code returned exactly once, never persisted
}

const WINDOW = 15 * 60_000, MAX_FAILS = 8, LOCK = 15 * 60_000;

export type RedeemResult =
  | { ok: true; session: ViewSession; share: ShareRecord }
  | { ok: false; error: string; retryAfterSec?: number };

export function redeemCode(code: string, ip: string): Promise<RedeemResult> {
  return withLock(async () => {
    const s = load();
    const now = Date.now();
    // IP rate limiting
    const r = s.rate[ip] ?? { fails: [], lockedUntil: null };
    r.fails = r.fails.filter((t) => now - t < WINDOW);
    if (r.lockedUntil && now < r.lockedUntil) {
      s.rate[ip] = r; save(s);
      return { ok: false, error: "Too many failed attempts. Try again later.", retryAfterSec: Math.ceil((r.lockedUntil - now) / 1000) };
    }
    const hash = hashCode(code);
    const share = s.shares.find((x) => x.codeHash === hash);
    const deny = async (msg: string, ev = "share.denied"): Promise<RedeemResult> => {
      r.fails.push(now);
      if (r.fails.length >= MAX_FAILS) { r.lockedUntil = now + LOCK; r.fails = []; }
      s.rate[ip] = r; save(s);
      await audit(ev, { reason: msg.slice(0, 60), shareId: share?.id ?? null });
      return { ok: false, error: msg, retryAfterSec: r.lockedUntil ? Math.ceil(LOCK / 1000) : undefined };
    };
    if (normalizeCode(code).length < 12 || !share) return deny("Invalid access code.");
    if (share.revokedAt) return deny("This code has been revoked by the owner.");
    if (now > share.expiresAt) return deny("This code has expired.");
    if (share.lockedUntil && now < share.lockedUntil) return deny("This code is temporarily locked after failed attempts.");
    if (share.redemptionCount >= share.maxRedemptions) return deny("This code has already been used.");

    // Atomic redemption inside the lock: concurrent requests cannot both pass.
    share.redemptionCount += 1;
    share.firstRedeemedAt = share.firstRedeemedAt ?? now;
    share.lastActivityAt = now;
    share.failedAttempts = 0;
    const viewMs = (share.maxViewMinutes ?? 720) * 60_000; // default cap: 12h per session
    const session: ViewSession = {
      sid: crypto.randomBytes(24).toString("hex"),
      shareId: share.id,
      videoIds: share.videoIds,
      createdAt: now,
      expiresAt: Math.min(share.expiresAt, now + viewMs),
      lastActivityAt: now,
    };
    s.sessions.push(session);
    s.rate[ip] = { fails: [], lockedUntil: null };
    save(s);
    await audit("share.redeemed", { shareId: share.id, count: share.redemptionCount });
    return { ok: true, session, share };
  });
}

export type SessionCheck = { ok: true; session: ViewSession; share: ShareRecord } | { ok: false; error: string };

export function checkSession(sid: string | undefined, videoId?: number): SessionCheck {
  if (!sid) return { ok: false, error: "No viewing session. Redeem an access code first." };
  const s = load();
  const now = Date.now();
  const session = s.sessions.find((x) => x.sid === sid);
  if (!session) return { ok: false, error: "Viewing session not found. It may have ended." };
  if (now > session.expiresAt) return { ok: false, error: "This viewing session has expired." };
  const share = s.shares.find((x) => x.id === session.shareId);
  if (!share) return { ok: false, error: "The share for this session no longer exists." };
  if (share.revokedAt) return { ok: false, error: "Access has been revoked by the owner." };
  if (now > share.expiresAt) return { ok: false, error: "This share has expired." };
  if (videoId !== undefined && !session.videoIds.includes(videoId)) return { ok: false, error: "This video is not part of your authorized session." };
  return { ok: true, session, share };
}

export function touchSession(sid: string) {
  return withLock(() => {
    const s = load();
    const now = Date.now();
    const ses = s.sessions.find((x) => x.sid === sid);
    if (!ses || now - ses.lastActivityAt < 60_000) return; // throttle writes
    ses.lastActivityAt = now;
    const sh = s.shares.find((x) => x.id === ses.shareId);
    if (sh) sh.lastActivityAt = now;
    save(s);
  });
}

export function endSession(sid: string) {
  return withLock(() => {
    const s = load();
    s.sessions = s.sessions.filter((x) => x.sid !== sid);
    save(s);
  });
}

export function revokeShare(id: string): Promise<boolean> {
  return withLock(async () => {
    const s = load();
    const sh = s.shares.find((x) => x.id === id);
    if (!sh) return false;
    sh.revokedAt = Date.now();
    save(s);
    await audit("share.revoked", { shareId: id });
    return true;
  });
}

export function listShares(): ShareRecord[] {
  return load().shares.slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Retention policy: expired/revoked shares are purged N days after expiry; dead sessions after 24h. */
export function purgeExpired(retentionDays: number): Promise<number> {
  return withLock(() => {
    const s = load();
    const now = Date.now();
    const before = s.shares.length;
    s.shares = s.shares.filter((x) => now - x.expiresAt < retentionDays * 86400_000);
    s.sessions = s.sessions.filter((x) => now - x.expiresAt < 86400_000);
    for (const k of Object.keys(s.rate)) {
      const r = s.rate[k];
      if ((!r.lockedUntil || now > r.lockedUntil) && r.fails.every((t) => now - t > WINDOW)) delete s.rate[k];
    }
    save(s);
    return before - s.shares.length;
  });
}

export function shareStatus(sh: ShareRecord): "active" | "redeemed" | "expired" | "revoked" | "locked" {
  const now = Date.now();
  if (sh.revokedAt) return "revoked";
  if (now > sh.expiresAt) return "expired";
  if (sh.lockedUntil && now < sh.lockedUntil) return "locked";
  if (sh.redemptionCount >= sh.maxRedemptions) return "redeemed";
  return "active";
}