import type { ReactNode } from "react";
import Link from "next/link";
import { Clapperboard, ShieldCheck } from "lucide-react";
import { Providers } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 py-4">
          <Link href="/vault/access" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-amber to-rose">
              <Clapperboard size={15} className="text-[#1d1206]" />
            </span>
            <span className="font-display text-base font-black tracking-tight">Velvet Vault</span>
            <span className="rounded-md border border-rose/30 bg-rose/10 px-1.5 py-0.5 text-[10px] font-bold text-rose">18+</span>
          </Link>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-mut"><ShieldCheck size={13} className="text-ok" /> Private viewing · no tracking</span>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-8">{children}</main>
        <footer className="px-5 py-4 text-center text-[10px] text-mut">
          Content is streamed directly from the owner's machine to authorized recipients only. Nothing is hosted externally.
        </footer>
      </div>
    </Providers>
  );
}
