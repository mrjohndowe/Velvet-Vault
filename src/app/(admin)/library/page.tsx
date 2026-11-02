"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid, Rows3, SlidersHorizontal, X, ArrowUpDown, Trash2, Heart, Plus,
  Clapperboard, ChevronDown, ChevronUp, CheckSquare,
} from "lucide-react";
import { Button, Badge, Spinner, EmptyState, Pagination, PageHeader, useToast, useConfirm, inputCls, cx, SkeletonGrid } from "@/components/ui";
import { VideoCard, VideoTable, type VideoItem } from "@/components/video-bits";
import { api, useDebounced } from "@/lib/client";
import { VIDEO_EXTS } from "@/lib/util";

type Tax = { categories: { id: number; name: string; parentId: number | null }[]; tags: { id: number; name: string; n: number }[]; collections: { id: number; name: string; kind: string; n: number }[] };
type F = Record<string, string>;
const FILTER_KEYS = ["q", "categoryId", "tagIds", "collectionId", "resolution", "ext", "ratingMin", "watch", "favorite", "bookmarked", "missing", "duplicate", "durMin", "durMax", "addedFrom", "addedTo", "recFrom", "recTo", "privacy", "sort", "dir", "page"];
const LABELS: Record<string, string> = { q: "Search", categoryId: "Category", tagIds: "Tags", collectionId: "Collection", resolution: "Resolution", ext: "Format", ratingMin: "Min rating", watch: "Watch status", favorite: "Favorites", bookmarked: "Bookmarks", missing: "Missing", duplicate: "Duplicates", durMin: "Min minutes", durMax: "Max minutes", addedFrom: "Added from", addedTo: "Added to", recFrom: "Recorded from", recTo: "Recorded to", privacy: "Privacy" };

function LibraryInner() {
  const sp = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState<F>(() => {
    const o: F = { sort: "dateAdded", dir: "desc", page: "1" };
    for (const k of FILTER_KEYS) { const v = sp.get(k); if (v) o[k] = v; }
    return o;
  });
  const [view, setView] = useState<"gallery" | "table">("gallery");
  const [blur, setBlur] = useState(false);
  const [pageSize, setPageSize] = useState(24);
  const [items, setItems] = useState<VideoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [tax, setTax] = useState<Tax | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<F>({});
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(f.q ?? "", 300);

  useEffect(() => {
    api<Tax>("/vault/api/taxonomy").then(setTax).catch(() => {});
    api<{ settings: { blurThumbs: boolean; defaultView: "gallery" | "table"; pageSize: number } }>("/vault/api/settings")
      .then((r) => { setBlur(r.settings.blurThumbs); setView(r.settings.defaultView); setPageSize(r.settings.pageSize); }).catch(() => {});
  }, []);

  // react to top-bar search navigation
  useEffect(() => {
    const q = sp.get("q") ?? "";
    setF((prev) => ((prev.q ?? "") === q ? prev : { ...prev, q, page: "1" }));
  }, [sp]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (!v) continue;
      if (k === "q") continue;
      if (k === "durMin" || k === "durMax") p.set(k, String(Number(v) * 60));
      else p.set(k, v);
    }
    if (dq) p.set("q", dq);
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [f, dq, pageSize]);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: VideoItem[]; total: number }>(`/vault/api/videos?${query}`)
      .then((r) => { setItems(r.items); setTotal(r.total); setLoading(false); })
      .catch((e) => { toast(e.message, "err"); setLoading(false); });
  }, [query, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [query]);

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v, page: k === "page" ? v : "1" }));
  const activeFilters = Object.entries(f).filter(([k, v]) => v && !["sort", "dir", "page"].includes(k));
  const clearAll = () => setF({ sort: f.sort ?? "dateAdded", dir: f.dir ?? "desc", page: "1" });

  const toggleSel = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = () => setSelected((s) => {
    const all = items.every((v) => s.has(v.id));
    const n = new Set(s);
    for (const v of items) { if (all) n.delete(v.id); else n.add(v.id); }
    return n;
  });

  const quickFav = async (v: VideoItem) => {
    try {
      await api(`/vault/api/videos/${v.id}`, { method: "PATCH", body: { favorite: !v.favorite } });
      setItems((arr) => arr.map((x) => (x.id === v.id ? { ...x, favorite: !v.favorite } : x)));
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const applyBulk = async () => {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (bulk.categoryId) patch.categoryId = Number(bulk.categoryId);
      if (bulk.watchStatus) patch.watchStatus = bulk.watchStatus;
      if (bulk.rating) patch.rating = Number(bulk.rating);
      if (bulk.favorite) patch.favorite = bulk.favorite === "1";
      await api("/vault/api/videos/bulk", { body: { ids: [...selected], action: "update", patch, addTagId: bulk.addTagId ? Number(bulk.addTagId) : undefined, addCollectionId: bulk.addCollectionId ? Number(bulk.addCollectionId) : undefined } });
      toast(`Updated ${selected.size} record${selected.size > 1 ? "s" : ""}.`);
      setSelected(new Set()); setBulk({}); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  const bulkFavorite = async () => {
    setBusy(true);
    try {
      await api("/vault/api/videos/bulk", { body: { ids: [...selected], action: "update", patch: { favorite: true } } });
      toast(`Marked ${selected.size} as favorite.`);
      setSelected(new Set()); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  const bulkDelete = async () => {
    const ok = await confirm({
      title: `Remove ${selected.size} inventory record${selected.size > 1 ? "s" : ""}?`,
      message: <>This deletes the selected <strong>database records and thumbnails only</strong>. Your original video files are <strong>never</strong> touched. This cannot be undone (restore from a backup if needed).</>,
      confirmLabel: "Remove records", danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/vault/api/videos/bulk", { body: { ids: [...selected], action: "delete" } });
      toast(`Removed ${selected.size} records. Files untouched.`);
      setSelected(new Set()); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  const selCls = inputCls + " !w-auto";

  return (
    <>
      <PageHeader title="Library" sub={`${total.toLocaleString()} record${total === 1 ? "" : "s"} match your view`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal size={14} /> Filters {activeFilters.length > 0 && <Badge tone="amber">{activeFilters.length}</Badge>}
              {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Button>
            <Link href="/videos/new"><Button size="sm"><Plus size={14} /> Add</Button></Link>
          </>
        } />

      {/* Controls row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={f.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="Search title, file, path, performer, studio, notes, tags…"
          aria-label="Search within library" className={cx(inputCls, "max-w-md flex-1")} />
        <select value={f.sort ?? "dateAdded"} onChange={(e) => set("sort", e.target.value)} aria-label="Sort by" className={selCls}>
          <option value="dateAdded">Date added</option><option value="title">Title</option><option value="duration">Duration</option>
          <option value="size">File size</option><option value="resolution">Resolution</option><option value="rating">Rating</option>
          <option value="lastWatched">Last watched</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => set("dir", f.dir === "asc" ? "desc" : "asc")} title="Toggle sort direction">
          <ArrowUpDown size={13} /> {f.dir === "asc" ? "Asc" : "Desc"}
        </Button>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-line">
          <button onClick={() => setView("gallery")} aria-label="Gallery view" className={cx("p-2 transition-colors", view === "gallery" ? "bg-amber/15 text-amber" : "text-mut hover:text-ink")}><LayoutGrid size={15} /></button>
          <button onClick={() => setView("table")} aria-label="Table view" className={cx("p-2 transition-colors", view === "table" ? "bg-amber/15 text-amber" : "text-mut hover:text-ink")}><Rows3 size={15} /></button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && tax && (
        <div className="rise mb-4 rounded-xl border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <select value={f.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)} aria-label="Category filter" className={inputCls}>
              <option value="">All categories</option>
              {tax.categories.filter((c) => !c.parentId).map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (all)</option>
                  {tax.categories.filter((k) => k.parentId === c.id).map((k) => <option key={k.id} value={k.id}>— {k.name}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={f.collectionId ?? ""} onChange={(e) => set("collectionId", e.target.value)} aria-label="Collection filter" className={inputCls}>
              <option value="">All collections</option>
              {tax.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
            </select>
            <select value={f.resolution ?? ""} onChange={(e) => set("resolution", e.target.value)} aria-label="Resolution filter" className={inputCls}>
              <option value="">Any resolution</option><option>4K</option><option>1440p</option><option>1080p</option><option>720p</option><option>480p</option><option value="Low">Below 480p</option><option value="unknown">Unknown</option>
            </select>
            <select value={f.ext ?? ""} onChange={(e) => set("ext", e.target.value)} aria-label="Format filter" className={inputCls}>
              <option value="">Any format</option>{VIDEO_EXTS.map((e) => <option key={e} value={e}>{e.toUpperCase()}</option>)}
            </select>
            <select value={f.ratingMin ?? ""} onChange={(e) => set("ratingMin", e.target.value)} aria-label="Minimum rating" className={inputCls}>
              <option value="">Any rating</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★ & up</option>)}
            </select>
            <select value={f.watch ?? ""} onChange={(e) => set("watch", e.target.value)} aria-label="Watch status filter" className={inputCls}>
              <option value="">Any watch status</option><option value="watched">Watched</option><option value="partial">Partially watched</option><option value="unwatched">Unwatched</option>
            </select>
            <select value={f.privacy ?? ""} onChange={(e) => set("privacy", e.target.value)} aria-label="Privacy filter" className={inputCls}>
              <option value="">Hide “hidden” items</option><option value="all">All privacy classes</option><option value="standard">Standard</option><option value="private">Private</option><option value="hidden">Hidden only</option>
            </select>
            <div className="flex gap-2">
              <input type="number" min={0} value={f.durMin ?? ""} onChange={(e) => set("durMin", e.target.value)} placeholder="Min min" aria-label="Minimum duration in minutes" className={inputCls} />
              <input type="number" min={0} value={f.durMax ?? ""} onChange={(e) => set("durMax", e.target.value)} placeholder="Max min" aria-label="Maximum duration in minutes" className={inputCls} />
            </div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-mut">Added from
              <input type="date" value={f.addedFrom ?? ""} onChange={(e) => set("addedFrom", e.target.value)} className={inputCls + " mt-1 font-normal normal-case"} /></label>
            <label className="text-[11px] font-bold uppercase tracking-wider text-mut">Added to
              <input type="date" value={f.addedTo ?? ""} onChange={(e) => set("addedTo", e.target.value)} className={inputCls + " mt-1 font-normal normal-case"} /></label>
            <label className="text-[11px] font-bold uppercase tracking-wider text-mut">Recorded from
              <input type="date" value={f.recFrom ?? ""} onChange={(e) => set("recFrom", e.target.value)} className={inputCls + " mt-1 font-normal normal-case"} /></label>
            <label className="text-[11px] font-bold uppercase tracking-wider text-mut">Recorded to
              <input type="date" value={f.recTo ?? ""} onChange={(e) => set("recTo", e.target.value)} className={inputCls + " mt-1 font-normal normal-case"} /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[["favorite", "Favorites"], ["bookmarked", "Bookmarked"], ["missing", "Missing files"], ["duplicate", "Duplicates"]].map(([k, label]) => (
              <button key={k} onClick={() => set(k, f[k] === "1" ? "" : "1")}
                className={cx("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", f[k] === "1" ? "border-amber/50 bg-amber/15 text-amber" : "border-line text-mut hover:text-ink")}>
                {f[k] === "1" ? "✓ " : ""}{label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap gap-1.5">
              {tax.tags.slice(0, 14).map((t) => {
                const ids = (f.tagIds ?? "").split(",").filter(Boolean);
                const on = ids.includes(String(t.id));
                return (
                  <button key={t.id} onClick={() => set("tagIds", (on ? ids.filter((x) => x !== String(t.id)) : [...ids, String(t.id)]).join(","))}
                    className={cx("rounded-full border px-2.5 py-0.5 text-[11px] transition-colors", on ? "border-rose/50 bg-rose/15 text-rose" : "border-line text-mut hover:text-ink")}>
                    #{t.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Active chips */}
      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          {activeFilters.map(([k, v]) => (
            <button key={k} onClick={() => set(k, "")} className="group flex items-center gap-1 rounded-full bg-amber/12 px-2.5 py-1 font-semibold text-amber transition-colors hover:bg-err/15 hover:text-err">
              {LABELS[k] ?? k}: {k === "categoryId" ? tax?.categories.find((c) => c.id === Number(v))?.name ?? v : k === "collectionId" ? tax?.collections.find((c) => c.id === Number(v))?.name ?? v : k === "tagIds" ? `${v.split(",").length} tag(s)` : v === "1" ? "yes" : v}
              <X size={11} />
            </button>
          ))}
          <button onClick={clearAll} className="ml-1 font-bold text-mut underline-offset-2 hover:text-err hover:underline">Clear all</button>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="rise sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber/40 bg-surface p-3 shadow-lg">
          <Badge tone="amber"><CheckSquare size={12} /> {selected.size} selected</Badge>
          <select value={bulk.categoryId ?? ""} onChange={(e) => setBulk({ ...bulk, categoryId: e.target.value })} aria-label="Bulk category" className={selCls}>
            <option value="">Set category…</option>{tax?.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}
          </select>
          <select value={bulk.watchStatus ?? ""} onChange={(e) => setBulk({ ...bulk, watchStatus: e.target.value })} aria-label="Bulk watch status" className={selCls}>
            <option value="">Set status…</option><option value="watched">Watched</option><option value="partial">Partial</option><option value="unwatched">Unwatched</option>
          </select>
          <select value={bulk.rating ?? ""} onChange={(e) => setBulk({ ...bulk, rating: e.target.value })} aria-label="Bulk rating" className={selCls}>
            <option value="">Set rating…</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}
          </select>
          <select value={bulk.addTagId ?? ""} onChange={(e) => setBulk({ ...bulk, addTagId: e.target.value })} aria-label="Bulk add tag" className={selCls}>
            <option value="">Add tag…</option>{tax?.tags.map((t) => <option key={t.id} value={t.id}>#{t.name}</option>)}
          </select>
          <select value={bulk.addCollectionId ?? ""} onChange={(e) => setBulk({ ...bulk, addCollectionId: e.target.value })} aria-label="Bulk add to collection" className={selCls}>
            <option value="">Add to collection…</option>{tax?.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" busy={busy} onClick={applyBulk}>Apply</Button>
          <Button size="sm" variant="outline" busy={busy} onClick={bulkFavorite}><Heart size={13} /> Favorite</Button>
          <Button size="sm" variant="danger" busy={busy} onClick={bulkDelete}><Trash2 size={13} /> Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Results */}
      {loading ? (view === "gallery" ? <SkeletonGrid n={pageSize > 12 ? 10 : pageSize} /> : <Spinner />) : items.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No videos match"
          body={activeFilters.length ? "Try loosening or clearing your filters." : "Scan a folder or add a video manually to get started."}
          action={activeFilters.length ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : <Link href="/scan"><Button>Scan a folder</Button></Link>} />
      ) : view === "gallery" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((v, i) => <VideoCard key={v.id} v={v} index={i} blur={blur} selected={selected.has(v.id)} onSelect={toggleSel} onFav={quickFav} />)}
        </div>
      ) : (
        <VideoTable items={items} selected={selected} onSelect={toggleSel} onSelectAll={allOnPage} />
      )}
      <Pagination page={Number(f.page ?? 1)} pageSize={pageSize} total={total} onPage={(p) => set("page", String(p))} />
    </>
  );
}

export default function LibraryPage() {
  return <Suspense fallback={<Spinner />}><LibraryInner /></Suspense>;
}
