"use client";
import { useEffect, useState } from "react";
import { FolderPlus, X, Save, Wrench, ImageIcon, ShieldCheck, KeyRound, MonitorCog, CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, Field, inputCls, Toggle, Badge, useToast, useConfirm, Spinner, PageHeader } from "@/components/ui";
import { api } from "@/lib/client";

type S = {
  libraryRoots: string[]; ffmpegPath: string; ffprobePath: string; thumbsEnabled: boolean; thumbWidth: number;
  thumbSeekPct: number; hashOnImport: boolean; authEnabled: boolean; hasPassword: boolean; pageSize: number;
  defaultView: "gallery" | "table"; blurThumbs: boolean; shareDefaultHours: number; shareRetentionDays: number;
};

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = useState<S | null>(null);
  const [tools, setTools] = useState<{ ffmpeg: boolean; ffprobe: boolean } | null>(null);
  const [storage, setStorage] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const load = () => {
    api<{ settings: S; tools: { ffmpeg: boolean; ffprobe: boolean }; shareStorage: { location: string } }>("/vault/api/settings")
      .then((r) => { setS(r.settings); setTools(r.tools); setStorage(r.shareStorage.location); })
      .catch((e) => toast(e.message, "err"));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch?: Partial<S>) => {
    if (!s) return;
    setSaving(true);
    try {
      const body = patch ?? {
        libraryRoots: s.libraryRoots, ffmpegPath: s.ffmpegPath, ffprobePath: s.ffprobePath,
        thumbsEnabled: s.thumbsEnabled, thumbWidth: s.thumbWidth, thumbSeekPct: s.thumbSeekPct,
        hashOnImport: s.hashOnImport, pageSize: s.pageSize, defaultView: s.defaultView, blurThumbs: s.blurThumbs,
        shareDefaultHours: s.shareDefaultHours, shareRetentionDays: s.shareRetentionDays,
      };
      await api("/vault/api/settings", { method: "PATCH", body });
      toast("Settings saved.");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setSaving(false);
  };

  const setPassword = async (disable = false) => {
    if (!disable && newPw.length < 8) return toast("Password must be at least 8 characters.", "err");
    if (disable) {
      const ok = await confirm({ title: "Disable login protection?", message: "The vault will be accessible to anyone who can reach this machine's browser session. Recommended only on a strictly private computer.", confirmLabel: "Disable login", danger: true });
      if (!ok) return;
    }
    setPwBusy(true);
    try {
      await api("/vault/api/settings", { method: "PATCH", body: { setPassword: disable ? "" : newPw, currentPassword: curPw } });
      toast(disable ? "Login protection disabled." : "Password set — login protection enabled.");
      setCurPw(""); setNewPw(""); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setPwBusy(false);
  };

  if (!s) return <Spinner />;
  const set = <K extends keyof S>(k: K, v: S[K]) => setS({ ...s, [k]: v });
  const h = "font-display text-base font-bold flex items-center gap-2 mb-4";
  const ToolBadge = ({ ok, name }: { ok: boolean; name: string }) => ok
    ? <Badge tone="ok"><CheckCircle2 size={11} /> {name} detected</Badge>
    : <Badge tone="err"><XCircle size={11} /> {name} not found</Badge>;

  return (
    <>
      <PageHeader title="Settings" sub="Library roots, local tools, thumbnails, privacy and display preferences — all persisted in the database."
        actions={<Button busy={saving} onClick={() => save()}><Save size={14} /> Save settings</Button>} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise p-5">
          <h2 className={h}><FolderPlus size={16} className="text-amber" /> Library roots (security boundary)</h2>
          <p className="mb-3 text-xs leading-relaxed text-mut">Scanning, playback, relinking and streaming are restricted to these folders. Paths outside them are rejected — Velvet Vault never bypasses filesystem permissions.</p>
          <ul className="space-y-1.5">
            {s.libraryRoots.length === 0 && <li className="text-xs text-warn">No roots configured — add the folder that contains your media.</li>}
            {s.libraryRoots.map((r) => (
              <li key={r} className="flex items-center gap-2 rounded-lg bg-raised/70 px-3 py-2 font-mono text-[11px]">
                <span className="min-w-0 flex-1 truncate">{r}</span>
                <button onClick={() => set("libraryRoots", s.libraryRoots.filter((x) => x !== r))} aria-label={`Remove root ${r}`} className="text-mut hover:text-err"><X size={13} /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input value={newRoot} onChange={(e) => setNewRoot(e.target.value)} placeholder="C:\Media\Vault or /home/me/Videos" className={inputCls} />
            <Button variant="outline" onClick={() => { const p = newRoot.trim(); if (!p) return; if (!s.libraryRoots.includes(p)) set("libraryRoots", [...s.libraryRoots, p]); setNewRoot(""); }}>Add</Button>
          </div>
          <p className="mt-2 text-[11px] text-mut">Click “Save settings” to validate & persist roots.</p>
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><Wrench size={16} className="text-rose" /> Local tools (FFmpeg / FFprobe)</h2>
          <div className="mb-3 flex gap-2">{tools && <><ToolBadge ok={tools.ffmpeg} name="FFmpeg" /><ToolBadge ok={tools.ffprobe} name="FFprobe" /></>}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="FFmpeg path" hint="Thumbnails & test clips"><input value={s.ffmpegPath} onChange={(e) => set("ffmpegPath", e.target.value)} className={inputCls} /></Field>
            <Field label="FFprobe path" hint="Duration, resolution, codec"><input value={s.ffprobePath} onChange={(e) => set("ffprobePath", e.target.value)} className={inputCls} /></Field>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mut">Windows/XAMPP example: <span className="font-mono">C:\ffmpeg\bin\ffmpeg.exe</span>. Leave as “ffmpeg”/“ffprobe” when on PATH. Saving re-tests availability. Both are optional — everything except auto-metadata & thumbnails works without them.</p>
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><ImageIcon size={16} className="text-amber" /> Thumbnails & previews</h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">Generate thumbnails on import
              <Toggle checked={s.thumbsEnabled} onChange={(v) => set("thumbsEnabled", v)} label="Generate thumbnails" /></label>
            <p className="text-[11px] text-mut">Off by default so explicit frames are never auto-generated without your consent. Stored separately in <span className="font-mono">data/thumbs/</span> — originals untouched.</p>
            <label className="flex items-center justify-between gap-3">Blur thumbnails in gallery (shoulder-surfing guard)
              <Toggle checked={s.blurThumbs} onChange={(v) => set("blurThumbs", v)} label="Blur thumbnails" /></label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Thumbnail width (px)"><input type="number" min={120} max={960} value={s.thumbWidth} onChange={(e) => set("thumbWidth", Number(e.target.value))} className={inputCls} /></Field>
              <Field label="Capture position (% of runtime)"><input type="number" min={1} max={90} value={s.thumbSeekPct} onChange={(e) => set("thumbSeekPct", Number(e.target.value))} className={inputCls} /></Field>
            </div>
            <label className="flex items-center justify-between gap-3 pt-1">Compute SHA-256 during import (duplicate proof)
              <Toggle checked={s.hashOnImport} onChange={(v) => set("hashOnImport", v)} label="Hash on import" /></label>
          </div>
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><MonitorCog size={16} className="text-ok" /> Display & sharing defaults</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default library view">
              <select value={s.defaultView} onChange={(e) => set("defaultView", e.target.value as "gallery" | "table")} className={inputCls}>
                <option value="gallery">Gallery</option><option value="table">Table</option>
              </select>
            </Field>
            <Field label="Items per page"><input type="number" min={6} max={100} value={s.pageSize} onChange={(e) => set("pageSize", Number(e.target.value))} className={inputCls} /></Field>
            <Field label="Default code validity (hours)"><input type="number" min={1} max={2160} value={s.shareDefaultHours} onChange={(e) => set("shareDefaultHours", Number(e.target.value))} className={inputCls} /></Field>
            <Field label="Share retention (days after expiry)"><input type="number" min={1} max={365} value={s.shareRetentionDays} onChange={(e) => set("shareRetentionDays", Number(e.target.value))} className={inputCls} /></Field>
          </div>
          <p className="mt-3 text-[11px] text-mut">Theme (light/dark) toggles from the top bar and persists per browser. OTP storage backend: <Badge tone="amber">JSON</Badge> <span className="font-mono">{storage}</span></p>
        </Card>

        <Card className="rise p-5 lg:col-span-2">
          <h2 className={h}><ShieldCheck size={16} className="text-rose" /> Login protection (optional)</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 pb-2">
              {s.hasPassword ? <Badge tone="ok"><KeyRound size={11} /> Password set (scrypt)</Badge> : <Badge tone="mut">No password — vault open on this machine</Badge>}
              {s.authEnabled && <Badge tone="amber">Login enforced</Badge>}
            </div>
            {s.hasPassword && <Field label="Current password"><input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className={inputCls + " !w-48"} autoComplete="current-password" /></Field>}
            <Field label={s.hasPassword ? "New password" : "Set a password (min 8 chars)"}><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls + " !w-48"} autoComplete="new-password" /></Field>
            <Button busy={pwBusy} onClick={() => setPassword(false)}>{s.hasPassword ? "Change password" : "Enable login"}</Button>
            {s.hasPassword && <Button variant="danger" busy={pwBusy} onClick={() => setPassword(true)}>Disable login</Button>}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-mut">Passwords are stored as salted scrypt verifiers — never plaintext, never hardcoded. Sessions use HttpOnly, SameSite cookies; state-changing requests carry CSRF protection. Recipient viewing sessions are fully separate from this owner session. No analytics, no external calls, no cloud.</p>
        </Card>
      </div>

      <div className="mt-5"><Button busy={saving} onClick={() => save()}><Save size={14} /> Save settings</Button></div>
    </>
  );
}
