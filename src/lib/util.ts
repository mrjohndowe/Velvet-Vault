export const VIDEO_EXTS = ["mp4", "mkv", "avi", "mov", "wmv", "webm", "m4v"] as const;
export const PLAYABLE_EXTS = ["mp4", "webm", "m4v", "mov"];

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
export function isVideoFile(name: string) { return (VIDEO_EXTS as readonly string[]).includes(extOf(name)); }
export function isPlayable(ext: string) { return PLAYABLE_EXTS.includes(ext.toLowerCase()); }

export function mimeFor(ext: string): string {
  const m: Record<string, string> = {
    mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mkv: "video/x-matroska", avi: "video/x-msvideo", wmv: "video/x-ms-wmv",
  };
  return m[ext.toLowerCase()] ?? "application/octet-stream";
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB";
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}

export function fmtDur(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(r)}`;
}

export function fmtDurHuman(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec < 0) return "Unknown duration";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (r || !parts.length) parts.push(`${r} second${r === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** Accepts "HH:MM:SS", "MM:SS", plain seconds, or "1h 24m 36s". Returns seconds or null. */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(t)) {
    const parts = t.split(":").map(Number);
    if (parts.some((x) => isNaN(x))) return null;
    return parts.reduce((acc, x) => acc * 60 + x, 0);
  }
  const m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
  return null;
}

export function resLabel(w?: number | null, h?: number | null): string {
  if (!h) return "—";
  if (h >= 2000 || (w ?? 0) >= 3800) return "4K";
  if (h >= 1400) return "1440p";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 460) return "480p";
  return `${h}p`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(dt);
}

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/* ---------- CSV ---------- */
export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function csvStringify(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n");
}
export function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", inQ = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}