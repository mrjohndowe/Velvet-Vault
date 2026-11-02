"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [state, setState] = useState<{ authEnabled: boolean } | null>(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ authEnabled: boolean; loggedIn: boolean }>("/vault/api/auth")
      .then((r) => { if (!r.authEnabled || r.loggedIn) router.replace("/"); else setState(r); })
      .catch(() => setState({ authEnabled: true }));
  }, [router]);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await api("/vault/api/auth", { body: { action: "login", password: pw } });
      router.replace("/");
    } catch (e) { setErr(e instanceof Error ? e.message : "Login failed"); setBusy(false); }
  };

  if (!state) return <Spinner />;

  return (
    <Card className="rise w-full max-w-sm p-7">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-rose/12"><Lock size={22} className="text-rose" /></span>
        <h1 className="font-display text-2xl font-black tracking-tight">Vault locked</h1>
        <p className="mt-1.5 text-xs text-mut">Enter the owner password to open the inventory.</p>
      </div>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        placeholder="Owner password" autoFocus autoComplete="current-password" aria-label="Owner password"
        className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-center text-sm focus:border-amber/60 focus:outline-none focus:ring-2 focus:ring-amber/25" />
      {err && <p className="rise mt-3 rounded-lg border border-err/30 bg-err/8 p-2.5 text-center text-xs text-err">{err}</p>}
      <Button className="mt-4 w-full" busy={busy} onClick={submit}>Unlock <ArrowRight size={15} /></Button>
      <p className="mt-4 text-center text-[10px] text-mut">Repeated failures are rate-limited. Recipient with a code?
        <Link href="/vault/access" className="font-semibold text-amber hover:underline">
          Use the access page
        </Link>
      </p>
    </Card>
  );
}
