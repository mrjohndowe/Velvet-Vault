"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldAlert, ArrowRight } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { api } from "@/lib/client";

export default function AccessPage() {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const format = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
    return clean.match(/.{1,4}/g)?.join("-") ?? "";
  };

  const submit = async () => {
    setError(null);
    if (!ack) return setError("Please confirm you are 18+ and an authorized recipient.");
    if (code.replace(/-/g, "").length < 16) return setError("Enter the full 16-character access code.");
    setBusy(true);
    try {
      const r = await api<{ sid: string }>("/vault/api/access", { body: { code, acknowledge: true } });
      toast("Access granted — your private viewing session has started.");
      router.push(`/watch/${r.sid}`);
    } catch (e) {
      const err = e as Error & { retryAfterSec?: number };
      setError(err.message);
      if (err.retryAfterSec) setCooldown(err.retryAfterSec);
      setBusy(false);
    }
  };

  return (
    <Card className="rise w-full max-w-md p-7">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-amber/12"><KeyRound size={22} className="text-amber" /></span>
        <h1 className="font-display text-2xl font-black tracking-tight">Private viewing access</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-mut">Enter the one-time code you received from the library owner. The code is consumed when your viewing session starts — not when this page opens.</p>
      </div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-mut" htmlFor="otp">Access code</label>
      <input id="otp" value={code} onChange={(e) => setCode(format(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoFocus spellCheck={false}
        className="w-full rounded-xl border border-line bg-raised px-4 py-3.5 text-center font-mono text-lg font-bold tracking-[0.2em] placeholder:text-mut/40 focus:border-amber/60 focus:outline-none focus:ring-2 focus:ring-amber/25" />
      <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-mut">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        I confirm I am at least 18 years old and an authorized recipient of this private, consensually produced adult media.
      </label>
      {error && (
        <p className="rise mt-3 flex items-start gap-2 rounded-lg border border-err/30 bg-err/8 p-3 text-xs text-err">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{error}{cooldown > 0 && <> Try again in <strong>{Math.floor(cooldown / 60)}:{String(cooldown % 60).padStart(2, "0")}</strong>.</>}</span>
        </p>
      )}
      <Button className="mt-5 w-full" busy={busy} disabled={cooldown > 0} onClick={submit}>
        Redeem code <ArrowRight size={15} />
      </Button>
      <p className="mt-4 text-center text-[10px] leading-relaxed text-mut">
        Failed attempts are rate-limited. Expired, revoked or already-used codes are rejected.
        Are you the owner? <a href="/" className="font-semibold text-amber hover:underline">Open the vault</a>
      </p>
    </Card>
  );
}
