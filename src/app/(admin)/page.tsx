"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Clapperboard, HardDrive, Eye, EyeOff, Heart, CopyCheck, FileWarning, Clock3,
  FolderSearch, Sparkles, Activity, Bookmark, Folder, FileVideo, Tags,
} from "lucide-react";
import { Card, Button, Spinner, EmptyState, PageHeader, useToast, Badge } from "@/components/ui";
import { MiniCard, Meter } from "@/components/video-bits";
import { api } from "@/lib/client";
import { fmtBytes, fmtDur, fmtDurHuman, timeAgo } from "@/lib/util";

type Mini = { id: number; title: string; durationSec: number | null; rating: number; hasThumb: boolean; missing: boolean };
type Stats = {
  totals: { total: number; size: number; duration: number; watched: number; partial: number; unwatched: number; favorites: number; bookmarks: number; missing: number; duplicates: number; duplicateGroups: number };
  byCategory: { id: number; name: string; n: number; size: number }[];
  byFormat: { ext: string; n: number; size: number }[];
  byFolder: { folder: string; n: number; size: number }[];
  recentAdded: Mini[]; recentWatched: Mini[]; topRated: Mini[];
  activity: { id: number; ts: string; event: string; detail: Record<string, unknown> | null }[];
};

function StatTile({ href, icon: Icon, label, value, tone, sub }: { href: string; icon: typeof Eye; label: string; value: number | string; tone: string; sub?: string }) {
  return (
    <Link href={href} className="group rise rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-amber/40 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}><Icon size={15} /></span>
        <span className="font-display text-2xl font-black tabular-nums">{value}</span>
      </div>
      <p className="mt-2.5 text-[11px] font-bold uppercase tracking-wider text-mut group-hover:text-ink">{label}</p>
      {sub && <p className="text-[10px] text-mut/70">{sub}</p>}
    </Link>
  );
}

function Row({ title, icon: Icon, items, href }: { title: string; icon: typeof Eye; items: Mini[]; href: string }) {
  if (!items.length) return null;
  return (
    <section className="rise">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Icon size={16} className="text-amber" /> {title}</h2>
        <Link href={href} className="text-xs font-semibold text-mut hover:text-amber">View all →</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">{items.map((v) => <MiniCard key={v.id} v={v} />)}</div>
    </section>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [seeding, setSeeding] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<Stats>("/vault/api/stats").then(setStats).catch((e) => toast(e.message, "err"));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const loadSample = async () => {
    setSeeding(true);
    try {
      const r = await api<{ created: number; ffmpeg: boolean; already?: boolean }>("/vault/api/data", { body: { action: "sample" } });
      if (r.already) toast("Sample library was already loaded.", "info");
      else toast(r.ffmpeg ? `Sample library loaded: ${r.created} records with real generated test clips.` : "Sample metadata loaded (FFmpeg unavailable — no media files generated).", "ok");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setSeeding(false);
  };

  if (!stats) return <Spinner label="Reading inventory…" />;
  const t = stats.totals;

  if (t.total === 0) {
    return (
      <>
        <PageHeader title="The Vault" sub="Your private collection at a glance — every number below comes live from the database." />
        <EmptyState icon={Clapperboard} title="Your vault is empty"
          body="Scan a folder of existing videos to build your inventory, add a record manually, or load the fictional sample library (synthetic, non-explicit test clips) to explore every feature."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button busy={seeding} onClick={loadSample}><Sparkles size={15} /> {seeding ? "Generating test clips…" : "Load sample library"}</Button>
              <Link href="/scan"><Button variant="outline"><FolderSearch size={15} /> Scan a folder</Button></Link>
            </div>
          } />
      </>
    );
  }

  const maxCat = Math.max(...stats.byCategory.map((c) => c.n), 1);
  const maxFmt = Math.max(...stats.byFormat.map((f) => f.size), 1);
  const maxFolder = Math.max(...stats.byFolder.map((f) => f.size), 1);
  const watchedPct = t.total ? Math.round((t.watched / t.total) * 100) : 0;

  return (
    <>
      <PageHeader title="The Vault" sub="Live inventory statistics — computed from your database, never hardcoded."
        actions={<Link href="/scan"><Button variant="outline"><FolderSearch size={14} /> Scan folders</Button></Link>} />

      {/* Hero band */}
      <Card className="rise mb-5 overflow-hidden">
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <div className="bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Indexed videos</p>
            <p className="font-display mt-1 text-5xl font-black tracking-tight text-amber">{t.total.toLocaleString()}</p>
            <p className="mt-1 text-xs text-mut">{t.duplicateGroups > 0 ? `${t.duplicateGroups} duplicate group${t.duplicateGroups > 1 ? "s" : ""} to review` : "No duplicate groups detected"}</p>
          </div>
          <div className="bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Library size</p>
            <p className="font-display mt-1 text-5xl font-black tracking-tight">{fmtBytes(t.size)}</p>
            <p className="mt-1 text-xs text-mut">across {stats.byFolder.length} folder{stats.byFolder.length === 1 ? "" : "s"} · {stats.byFormat.length} format{stats.byFormat.length === 1 ? "" : "s"}</p>
          </div>
          <div className="bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Total runtime</p>
            <p className="font-display mt-1 text-5xl font-black tracking-tight text-rose">{fmtDur(t.duration)}</p>
            <p className="mt-1 text-xs text-mut">{fmtDurHuman(t.duration)} · {watchedPct}% watched</p>
          </div>
        </div>
        <div className="h-1.5 w-full bg-mut/10"><div className="h-full bg-gradient-to-r from-ok to-amber transition-all duration-1000" style={{ width: `${watchedPct}%` }} /></div>
      </Card>

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile href="/library?watch=watched" icon={Eye} label="Watched" value={t.watched} tone="bg-ok/12 text-ok" />
        <StatTile href="/library?watch=unwatched" icon={EyeOff} label="Unwatched" value={t.unwatched} tone="bg-mut/12 text-mut" sub={`${t.partial} partially watched`} />
        <StatTile href="/library?favorite=1" icon={Heart} label="Favorites" value={t.favorites} tone="bg-rose/12 text-rose" />
        <StatTile href="/duplicates" icon={CopyCheck} label="Duplicates" value={t.duplicates} tone="bg-warn/12 text-warn" sub="records in dup groups" />
        <StatTile href="/missing" icon={FileWarning} label="Missing files" value={t.missing} tone="bg-err/12 text-err" />
        <StatTile href="/library?bookmarked=1" icon={Bookmark} label="Bookmarks" value={t.bookmarks} tone="bg-amber/12 text-amber" sub="quick-look list" />
      </div>

      {/* Breakdowns */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="rise p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><Tags size={15} className="text-amber" /> By category</h2>
          <div className="space-y-2">
            {stats.byCategory.filter((c) => c.n > 0).slice(0, 8).map((c) => (
              <Meter key={c.id} label={c.name} value={c.n} max={maxCat} sub={`${c.n} videos`} href={`/library?categoryId=${c.id}`} />
            ))}
            {stats.byCategory.every((c) => c.n === 0) && <p className="text-xs text-mut">No categorized videos yet.</p>}
          </div>
        </Card>
        <Card className="rise p-4" >
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><FileVideo size={15} className="text-rose" /> Storage by format</h2>
          <div className="space-y-2">
            {stats.byFormat.map((f) => (
              <Meter key={f.ext} label={f.ext.toUpperCase()} value={f.size} max={maxFmt} sub={`${f.n} · ${fmtBytes(f.size)}`} href={`/library?ext=${f.ext}`} />
            ))}
          </div>
        </Card>
        <Card className="rise p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><Folder size={15} className="text-ok" /> Storage by folder</h2>
          <div className="space-y-2">
            {stats.byFolder.map((f) => (
              <Meter key={f.folder} label={f.folder.split(/[\\/]/).pop() ?? f.folder} value={f.size} max={maxFolder} sub={`${f.n} · ${fmtBytes(f.size)}`} />
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Row title="Recently added" icon={Sparkles} items={stats.recentAdded} href="/library?sort=dateAdded&dir=desc" />
        <Row title="Recently watched" icon={Clock3} items={stats.recentWatched} href="/library?sort=lastWatched&dir=desc" />
        <Row title="Highest rated" icon={Heart} items={stats.topRated} href="/library?sort=rating&dir=desc" />
      </div>

      {stats.activity.length > 0 && (
        <Card className="rise mt-6 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><Activity size={15} className="text-amber" /> Recent activity <Badge tone="mut">audit trail · no secrets logged</Badge></h2>
          <ul className="divide-y divide-line/60 text-xs">
            {stats.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="font-mono font-semibold text-ink/80">{a.event}</span>
                <span className="text-mut">{timeAgo(a.ts)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 flex items-center gap-2 text-[11px] text-mut">
        <HardDrive size={13} /> Originals are never moved, renamed, or deleted by Velvet Vault — only inventory records are managed.
      </div>
    </>
  );
}
