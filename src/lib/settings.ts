import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AppSettings = {
  libraryRoots: string[];
  ffmpegPath: string;
  ffprobePath: string;
  thumbsEnabled: boolean;      // explicit previews opt-in
  thumbWidth: number;
  thumbSeekPct: number;
  hashOnImport: boolean;
  authEnabled: boolean;
  passwordHash: string | null; // scrypt verifier, never plaintext
  pageSize: number;
  defaultView: "gallery" | "table";
  blurThumbs: boolean;
  shareDefaultHours: number;
  shareRetentionDays: number;
  seeded: boolean;
};

export const DEFAULTS: AppSettings = {
  libraryRoots: [],
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  thumbsEnabled: false,
  thumbWidth: 480,
  thumbSeekPct: 25,
  hashOnImport: false,
  authEnabled: false,
  passwordHash: null,
  pageSize: 24,
  defaultView: "gallery",
  blurThumbs: false,
  shareDefaultHours: 72,
  shareRetentionDays: 30,
  seeded: false,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, "app"));
  const stored = (rows[0]?.value ?? {}) as Partial<AppSettings>;
  return { ...DEFAULTS, ...stored };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await db.insert(settings).values({ key: "app", value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}

/** Settings safe to send to the browser (no password verifier). */
export function publicSettings(s: AppSettings) {
  const { passwordHash: _ph, ...rest } = s;
  return { ...rest, hasPassword: !!s.passwordHash };
}