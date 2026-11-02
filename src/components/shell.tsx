"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Clapperboard, FolderSearch, Tags, CopyCheck, FileWarning, KeyRound,
  DatabaseBackup, Settings2, BookOpen, Menu, X, Moon, Sun, Search, Plus, ShieldCheck, LogOut, Film,
} from "lucide-react";
import { cx, Button, Modal } from "./ui";
import { Providers } from "./ui";
import { api, getTheme, setTheme } from "@/lib/client";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Library", icon: Clapperboard },
  { href: "/scan", label: "Scan & Import", icon: FolderSearch },
  { href: "/organize", label: "Categories & Tags", icon: Tags },
  { href: "/organize?tab=collections", label: "Collections", icon: Film },
  { href: "/duplicates", label: "Duplicates", icon: CopyCheck },
  { href: "/missing", label: "Missing Files", icon: FileWarning },
  { href: "/shares", label: "OTP Sharing", icon: KeyRound },
  { href: "/data", label: "Backup & Data", icon: DatabaseBackup },
  { href: "/settings", label: "Settings", icon: Settings2 },
  { href: "/docs", label: "Docs & Tests", icon: BookOpen },
];

function AgeGate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("vv-adult-ok")) setShow(true); } catch { /* ignore */ }
  }, []);
  return (
    <Modal open={show} onClose={() => {}} title="Private adult library · 18+">
      <p className="text-sm leading-relaxed text-mut">
        Velvet Vault manages a <strong className="text-ink">private, locally stored</strong> collection of adult media intended for
        lawful, consensually produced content featuring adults (18+). Nothing is uploaded, tracked, or shared externally.
        By continuing you confirm you are at least 18 years old and the library owner or an authorized user.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { window.location.href = "about:blank"; }}>Leave</Button>
        <Button onClick={() => { try { localStorage.setItem("vv-adult-ok", "1"); } catch {} setShow(false); }}>I am 18+ — Continue</Button>
      </div>
    </Modal>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [q, setQ] = useState("");
  const [authOn, setAuthOn] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDark(getTheme() === "dark"); }, []);
  useEffect(() => { api<{ authEnabled: boolean }>("/vault/api/auth").then((r) => setAuthOn(r.authEnabled)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = dark ? "light" : "dark";
    setTheme(next); setDark(!dark);
  }, [dark]);

  const submitSearch = () => { router.push(`/library?q=${encodeURIComponent(q)}`); };

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {NAV.map(({ href, label, icon: Icon }) => {
        const search = typeof window !== "undefined" ? window.location.search : "";
        const onCollectionsTab = search.includes("tab=collections");
        const active = href === "/" ? pathname === "/"
          : href.includes("?") ? pathname === "/organize" && onCollectionsTab
          : href === "/organize" ? pathname === "/organize" && !onCollectionsTab
          : pathname.startsWith(href);
        return (
          <Link key={href} href={href}
            className={cx("group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150",
              active ? "bg-amber/12 text-amber" : "text-mut hover:bg-ink/5 hover:text-ink")}>
            <Icon size={16} className={cx("transition-transform group-hover:scale-110", active && "text-amber")} />
            {label}
            {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber" />}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 border-b border-line px-5 py-4">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber to-rose shadow-md shadow-rose/20">
        <Clapperboard size={18} className="text-[#1d1206]" />
      </span>
      <span>
        <span className="font-display block text-[17px] font-black leading-none tracking-tight">Velvet Vault</span>
        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-mut">Private media inventory</span>
      </span>
    </Link>
  );

  return (
    <div className="relative flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/80 backdrop-blur lg:flex">
        {brand}
        {nav}
        <div className="border-t border-line px-5 py-3.5 text-[11px] text-mut">
          <span className="flex items-center gap-1.5 font-semibold"><ShieldCheck size={13} className="text-ok" /> Local-only · No cloud · 18+</span>
          <span className="mt-1 block opacity-70">Files never leave this machine.</span>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="rise absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-surface">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="p-2 text-mut"><X size={18} /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <button className="rounded-md p-1.5 text-mut hover:text-ink lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="relative max-w-md flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mut/60" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
              placeholder="Search titles, files, performers, tags…  ( / )"
              aria-label="Search library"
              className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm placeholder:text-mut/50 focus:border-amber/50 focus:outline-none focus:ring-2 focus:ring-amber/20" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/videos/new"><Button size="sm" className="hidden sm:inline-flex"><Plus size={14} /> Add video</Button></Link>
            <button onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title="Toggle theme"
              className="rounded-lg border border-line p-2 text-mut transition-colors hover:border-amber/50 hover:text-amber">
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {authOn && (
              <button onClick={async () => { await api("/vault/api/auth", { body: { action: "logout" } }); router.push("/vault/login"); }}
                aria-label="Sign out" title="Sign out"
                className="rounded-lg border border-line p-2 text-mut transition-colors hover:border-rose/50 hover:text-rose">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
      <AgeGate />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <ShellInner>{children}</ShellInner>
    </Providers>
  );
}
