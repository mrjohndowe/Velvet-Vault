"use client";
import { useState } from "react";
import { KeyRound, Copy, ShieldAlert, RefreshCw } from "lucide-react";
import { Modal, Button, Field, inputCls, Toggle, useToast, Badge } from "./ui";
import { api } from "@/lib/client";

export function ShareDialog({ open, onClose, videoIds, titles, defaultHours = 72 }: {
  open: boolean; onClose: () => void; videoIds: number[]; titles: string[]; defaultHours?: number;
}) {
  const toast = useToast();
  const [hours, setHours] = useState(String(defaultHours));
  const [singleUse, setSingleUse] = useState(true);
  const [maxRedemptions, setMaxRedemptions] = useState("3");
  const [maxView, setMaxView] = useState("");
  const [allowPause, setAllowPause] = useState(true);
  const [allowSeek, setAllowSeek] = useState(true);
  const [allowSpeed, setAllowSpeed] = useState(false);
  const [noDownload, setNoDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ code: string }>("/vault/api/shares", {
        body: {
          videoIds, expiresInHours: Number(hours || defaultHours), singleUse,
          maxRedemptions: singleUse ? 1 : Number(maxRedemptions || 1),
          maxViewMinutes: maxView ? Number(maxView) : null,
          allowPause, allowSeek, allowSpeed, disableDownload: noDownload,
        },
      });
      setCode(r.code);
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied — deliver it over a private channel.`); }
    catch { toast("Copy failed — select and copy manually.", "err"); }
  };

  const close = () => { setCode(null); onClose(); };
  const accessUrl = typeof window !== "undefined" ? `${window.location.origin}/vault/access` : "/vault/access";

  return (
    <Modal open={open} onClose={close} title={<span className="flex items-center gap-2"><KeyRound size={18} className="text-amber" /> Share via one-time code</span>} wide>
      <p className="mb-3 text-xs text-mut">Authorizing: {titles.map((t, i) => <Badge key={i} tone="amber" className="mr-1">{t}</Badge>)}</p>
      {!code ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code expires after (hours)" hint="Unredeemed codes stop working after this.">
              <input type="number" min={1} max={2160} value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Max viewing minutes / session" hint="Optional. Blank = 12 h cap per session.">
              <input type="number" min={1} value={maxView} onChange={(e) => setMaxView(e.target.value)} placeholder="e.g. 120" className={inputCls} />
            </Field>
          </div>
          <div className="mt-3 space-y-2.5 rounded-lg border border-line bg-raised/60 p-3.5 text-sm">
            <label className="flex items-center justify-between gap-3">Single-use code (consumed on first successful redemption)
              <Toggle checked={singleUse} onChange={setSingleUse} label="Single use" /></label>
            {!singleUse && (
              <label className="flex items-center justify-between gap-3">Maximum redemptions
                <input type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} className={inputCls + " !w-24"} /></label>
            )}
            <label className="flex items-center justify-between gap-3">Recipient can pause <Toggle checked={allowPause} onChange={setAllowPause} label="Allow pause" /></label>
            <label className="flex items-center justify-between gap-3">Recipient can seek <Toggle checked={allowSeek} onChange={setAllowSeek} label="Allow seek" /></label>
            <label className="flex items-center justify-between gap-3">Recipient can change speed <Toggle checked={allowSpeed} onChange={setAllowSpeed} label="Allow speed" /></label>
            <label className="flex items-center justify-between gap-3">Hide download button & block right-click <Toggle checked={noDownload} onChange={setNoDownload} label="Disable download" /></label>
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 p-3 text-[11px] leading-relaxed text-mut">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warn" />
            Playback restrictions are interface-level deterrents, not DRM. Disabling downloads cannot prevent screen recording or other capture by someone who can watch the video. Share only with people you trust. Use HTTPS when sharing beyond localhost / your trusted LAN.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button busy={busy} onClick={create}><KeyRound size={14} /> Generate code</Button>
          </div>
        </>
      ) : (
        <div className="rise">
          <div className="rounded-xl border border-amber/40 bg-amber/8 p-5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Access code — shown only this once</p>
            <p className="font-mono mt-2 select-all text-2xl font-black tracking-[0.15em] text-amber sm:text-3xl">{code}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => copy(code, "Code")}><Copy size={13} /> Copy code</Button>
              <Button size="sm" variant="outline" onClick={() => copy(accessUrl, "Access page URL")}><Copy size={13} /> Copy access URL</Button>
              <Button size="sm" variant="ghost" busy={busy} onClick={create}><RefreshCw size={13} /> New code</Button>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-err/30 bg-err/8 p-3 text-[11px] leading-relaxed text-mut">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-err" />
            <span><strong className="text-ink">Copy it now.</strong> Only a SHA-256 verifier is stored — the code cannot be shown again, and it never appears in logs or the management table. Send the code and the URL <em>{accessUrl}</em> via a secure channel (ideally separately). The code is consumed when the recipient establishes a viewing session, not when they open the page. Manage or revoke it under <strong className="text-ink">OTP Sharing</strong>.</span>
          </p>
          <div className="mt-4 flex justify-end"><Button onClick={close}>Done</Button></div>
        </div>
      )}
    </Modal>
  );
}
