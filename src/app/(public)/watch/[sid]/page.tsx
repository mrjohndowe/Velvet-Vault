"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, ShieldAlert, LogOut, KeyRound, Film } from "lucide-react";
import { Button, Card, Badge, Spinner, useToast } from "@/components/ui";
import { MediaPlayer, type Restrictions } from "@/components/player";
import { api } from "@/lib/client";
import { fmtDur, fmtDurHuman } from "@/lib/util";

type SessionInfo = {
  active: boolean; error?: string; expiresAt?: number;
  restrictions?: Restrictions;
  videos?: { id: number; title: string; durationSec: number | null; height: number | null; missing: boolean; hasThumb: boolean }[];
};

export default function WatchPage() {
  const toast = useToast();
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [current, setCurrent] = useState(0);
  const [left, setLeft] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api<SessionInfo>("/vault/api/access").then((r) => {
      setInfo(r);
      if (r.active && r.expiresAt) setLeft(Math.max(0, Math.floor((r.expiresAt - Date.now()) / 1000)));
    }).catch((e) => setInfo({ active: false, error: e.message }));
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 20_000); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    if (left == null) return;
    if (left <= 0) { setInfo((i) => i ? { ...i, active: false, error: "This viewing session has expired." } : i); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const end = async () => {
    try { await api("/vault/api/access", { method: "DELETE" }); } catch { /* ignore */ }
    toast("Viewing session ended.", "info");
    window.location.href = "/vault/access";
  };

  if (!info) return <Spinner label="Validating your session…" />;

  if (!info.active) {
    return (
      <Card className="rise w-full max-w-md p-7 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-err/12"><ShieldAlert size={22} className="text-err" /></span>
        <h1 className="font-display text-xl font-black">Access unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-mut">{info.error ?? "Your session is no longer valid."}</p>
        <p className="mt-2 text-xs text-mut">If you need more viewing time, ask the owner for a new code.</p>
        <Link href="/vault/access"><Button className="mt-5"><KeyRound size={14} /> Enter a new code</Button></Link>
      </Card>
    );
  }

  const videos = info.videos ?? [];
  const v = videos[Math.min(current, videos.length - 1)];
  const mm = left != null ? Math.floor(left / 60) : 0;
  const ss = left != null ? left % 60 : 0;

  return (
    <div className="w-full max-w-4xl">
      <div className="rise mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mut">Authorized private viewing</p>
          <h1 className="font-display truncate text-2xl font-black tracking-tight">{v?.title ?? "Shared video"}</h1>
          {v && (
            <p className="mt-0.5 text-xs text-mut">
              Total runtime <span className="font-mono font-bold text-amber">{fmtDur(v.durationSec)}</span> · {fmtDurHuman(v.durationSec)}
            </p>
          )}
        </div>
        <Badge tone={left != null && left < 300 ? "err" : "amber"} className="!px-2.5 !py-1.5">
          <Clock3 size={12} /> Session ends in {mm}:{String(ss).padStart(2, "0")}
        </Badge>
        <Button variant="outline" size="sm" onClick={end}><LogOut size={13} /> End session</Button>
      </div>

      {videos.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {videos.map((x, i) => (
            <button key={x.id} onClick={() => setCurrent(i)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${i === current ? "border-amber/50 bg-amber/15 text-amber" : "border-line text-mut hover:text-ink"}`}>
              {x.title} <span className="font-mono opacity-70">{fmtDur(x.durationSec)}</span>
            </button>
          ))}
        </div>
      )}

      {v ? (
        v.missing ? (
          <Card className="flex aspect-video items-center justify-center p-6 text-center text-sm text-mut">This video's file is currently unavailable on the owner's machine.</Card>
        ) : (
          <MediaPlayer key={v.id} src={`/vault/api/share-media/${v.id}`} title={v.title}
            durationHint={v.durationSec}
            poster={v.hasThumb ? `/vault/api/share-thumb/${v.id}` : undefined}
            restrictions={info.restrictions}
            onAccessError={() => refresh()} />
        )
      ) : (
        <Card className="flex aspect-video items-center justify-center text-mut"><Film size={28} /></Card>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface/70 p-3.5 text-[11px] leading-relaxed text-mut">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warn" />
        Playback restrictions (seek/pause/speed/download buttons) are interface-level settings chosen by the owner — they are not copy protection. Please respect the owner's terms: do not record, save or redistribute this private content. Access is re-verified continuously and can be revoked at any time.
      </p>
    </div>
  );
}
