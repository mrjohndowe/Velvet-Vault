"use client";
import { useEffect, useRef, useState } from "react";
import { FileWarning, ExternalLink, Gauge, TimerReset } from "lucide-react";
import { Button, Badge } from "./ui";
import { api } from "@/lib/client";
import { fmtDur } from "@/lib/util";

export type Restrictions = { allowPause: boolean; allowSeek: boolean; allowSpeed: boolean; disableDownload: boolean };
const ALL_ALLOWED: Restrictions = { allowPause: true, allowSeek: true, allowSpeed: true, disableDownload: false };

export function MediaPlayer({ src, poster, durationHint, initialSec = 0, restrictions = ALL_ALLOWED, onProgress, onEnded, onAccessError, title }: {
  src: string; poster?: string; durationHint?: number | null; initialSec?: number;
  restrictions?: Restrictions; onProgress?: (sec: number) => void; onEnded?: () => void;
  onAccessError?: (msg: string) => void; title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastTime = useRef(0);
  const lastSent = useRef(0);
  const endedRef = useRef(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState<number | null>(durationHint ?? null);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [resumeOffer, setResumeOffer] = useState(initialSec > 10);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMeta = () => { if (isFinite(el.duration) && el.duration > 0) setDur(el.duration); };
    const onTime = () => {
      const t = el.currentTime;
      setCur(t);
      if (!restrictions.allowSeek && Math.abs(t - lastTime.current) > 2 && !el.seeking) {
        // UI-level seek prevention (documented limitation: not DRM)
      }
      if (onProgress && t - lastSent.current > 10) { lastSent.current = t; onProgress(t); }
      lastTime.current = t;
    };
    const onSeeking = () => {
      if (!restrictions.allowSeek && Math.abs(el.currentTime - lastTime.current) > 2) {
        el.currentTime = lastTime.current;
      }
    };
    const onPause = () => {
      if (!restrictions.allowPause && !endedRef.current && !el.ended) void el.play().catch(() => {});
    };
    const onRate = () => {
      if (!restrictions.allowSpeed && el.playbackRate !== 1) el.playbackRate = 1;
      else setRate(el.playbackRate);
    };
    const onEnd = () => { endedRef.current = true; onEnded?.(); };
    const onErr = () => {
      setError("Playback failed. The file may be missing, in an unsupported codec, or your access may have expired or been revoked.");
      onAccessError?.("Playback stopped — access may have expired or been revoked.");
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeking", onSeeking);
    el.addEventListener("pause", onPause);
    el.addEventListener("ratechange", onRate);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeking", onSeeking);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ratechange", onRate);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
    };
  }, [restrictions.allowSeek, restrictions.allowPause, restrictions.allowSpeed, onProgress, onEnded, onAccessError]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-black shadow-lg">
      {error ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
          <FileWarning size={30} className="text-err" />
          <p className="max-w-md text-sm text-white/80">{error}</p>
        </div>
      ) : (
        <video ref={ref} src={src} poster={poster} controls playsInline preload="metadata"
          controlsList={restrictions.disableDownload ? "nodownload noremoteplayback" : undefined}
          disablePictureInPicture={restrictions.disableDownload}
          onContextMenu={(e) => { if (restrictions.disableDownload) e.preventDefault(); }}
          aria-label={`Video player: ${title}`}
          className="aspect-video w-full bg-black" />
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-3.5 py-2.5 text-xs">
        <span className="font-mono font-semibold tabular-nums">
          {fmtDur(cur)} <span className="text-mut">/ {fmtDur(dur)}</span>
        </span>
        <span className="flex items-center gap-1 text-mut"><TimerReset size={12} /> {dur != null ? `${fmtDur(Math.max(0, dur - cur))} left` : "—"}</span>
        {resumeOffer && initialSec > 10 && (
          <button className="font-semibold text-amber hover:underline" onClick={() => { if (ref.current) ref.current.currentTime = initialSec; setResumeOffer(false); }}>
            Resume at {fmtDur(initialSec)}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <Gauge size={13} className="text-mut" />
          {restrictions.allowSpeed ? (
            <select value={rate} aria-label="Playback speed"
              onChange={(e) => { const r = Number(e.target.value); if (ref.current) ref.current.playbackRate = r; setRate(r); }}
              className="rounded border border-line bg-raised px-1.5 py-0.5 text-xs focus:outline-none">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          ) : (
            <Badge tone="mut">1× locked</Badge>
          )}
          {!restrictions.allowSeek && <Badge tone="warn">Seeking off</Badge>}
          {!restrictions.allowPause && <Badge tone="warn">Pause off</Badge>}
        </span>
      </div>
    </div>
  );
}

export function UnsupportedFormat({ ext, missing, onOpen }: { ext: string; missing: boolean; onOpen: () => void }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-6 text-center">
      <FileWarning size={30} className={missing ? "text-err" : "text-warn"} />
      {missing ? (
        <>
          <p className="text-sm font-bold text-err">File missing or inaccessible</p>
          <p className="max-w-md text-xs leading-relaxed text-mut">The stored path could not be read. Use “Relink file” below or on the Missing Files page. The inventory record is intact.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold">.{ext.toUpperCase()} is not natively playable in browsers</p>
          <p className="max-w-md text-xs leading-relaxed text-mut">Browsers reliably play MP4 (H.264/AAC), WebM and most M4V/MOV files. Open this file in your operating system's default player instead.</p>
        </>
      )}
      {!missing && <Button variant="outline" onClick={onOpen}><ExternalLink size={14} /> Open in system player</Button>}
    </div>
  );
}

export async function openExternal(id: number): Promise<string | null> {
  try { await api(`/vault/api/videos/${id}`, { method: "PATCH", body: { action: "open" } }); return null; }
  catch (e) { return e instanceof Error ? e.message : "Failed to open"; }
}
