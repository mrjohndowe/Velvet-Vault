"use client";
import { useState } from "react";
import Link from "next/link";
import { Film, Heart, Bookmark, FileWarning, Eye, EyeOff, Clock3, BookmarkCheck } from "lucide-react";
import { cx, Badge, Stars } from "./ui";
import { fmtBytes, fmtDur, resLabel, fmtDate } from "@/lib/util";

export type VideoItem = {
  id: number; title: string; altTitle: string | null; fileName: string; filePath: string;
  fileExt: string; format: string | null; sizeBytes: number; durationSec: number | null;
  width: number | null; height: number | null; fps: number | null; codec: string | null;
  dateAdded: string; recordedAt: string | null; fileModifiedAt: string | null; lastMetaCheck: string | null;
  categoryId: number | null; studio: string | null; performers: string | null; source: string | null;
  rating: number; review: string | null; description: string | null; privateNotes: string | null;
  favorite: boolean; bookmarked: boolean; watchStatus: string; lastWatchedAt: string | null;
  watchCount: number; progressSec: number; missing: boolean; hash: string | null;
  privacy: string; contentWarnings: string | null;
  tags: { id: number; name: string }[]; categoryName: string | null;
  hasThumb: boolean; playable: boolean; folder?: string; collectionIds?: number[];
};

export function Thumb({ v, blur, className }: { v: { id: number; hasThumb: boolean; title: string; missing?: boolean }; blur?: boolean; className?: string }) {
  const [err, setErr] = useState(false);
  const show = v.hasThumb && !err && !v.missing;
  return (
    <div className={cx("relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-raised to-surface", className)}>
      {show ? (
        // eslint-disable-next-line @next/next-no-img-element
        <img src={`/vault/api/thumbs/${v.id}`} alt={`Thumbnail for ${v.title}`} loading="lazy" onError={() => setErr(true)}
          className={cx("h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]", blur && "thumb-blur")} />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-mut/50">
          <Film size={30} strokeWidth={1.4} />
          <span className="text-[10px] font-semibold uppercase tracking-widest">No preview</span>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "watched") return <Badge tone="ok"><Eye size={11} /> Watched</Badge>;
  if (status === "partial") return <Badge tone="warn"><Clock3 size={11} /> Partial</Badge>;
  return <Badge tone="mut"><EyeOff size={11} /> Unwatched</Badge>;
}

export function VideoCard({ v, blur, selected, onSelect, onFav, index = 0 }: {
  v: VideoItem; blur?: boolean; selected?: boolean; onSelect?: (id: number) => void;
  onFav?: (v: VideoItem) => void; index?: number;
}) {
  const pct = v.durationSec && v.progressSec ? Math.min(100, (v.progressSec / v.durationSec) * 100) : 0;
  return (
    <div className="group rise relative overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber/40 hover:shadow-lg hover:shadow-black/10"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <Link href={`/videos/${v.id}`} className="block">
        <div className="relative aspect-video overflow-hidden">
          <Thumb v={v} blur={blur} />
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{fmtDur(v.durationSec)}</span>
          {v.height ? <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-strong">{resLabel(v.width, v.height)}</span> : null}
          {v.missing && <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-err/90 px-2 py-1 text-[10px] font-bold text-white"><FileWarning size={11} /> FILE MISSING</span>}
          {pct > 0 && v.watchStatus === "partial" && !v.missing && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40"><span className="block h-full bg-amber" style={{ width: `${pct}%` }} /></span>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug transition-colors group-hover:text-amber">{v.title}</h3>
          <p className="mt-1 truncate text-[11px] text-mut">
            {v.categoryName ?? "Uncategorized"} · {fmtBytes(v.sizeBytes)} · {v.fileExt.toUpperCase()}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Stars value={v.rating} size={12} />
            <span className="flex items-center gap-1">
              {v.watchStatus === "watched" && <Eye size={12} className="text-ok" />}
              {v.watchStatus === "partial" && <Clock3 size={12} className="text-warn" />}
              {v.bookmarked && <BookmarkCheck size={12} className="text-rose" />}
            </span>
          </div>
        </div>
      </Link>
      {onSelect && (
        <input type="checkbox" checked={!!selected} onChange={() => onSelect(v.id)} aria-label={`Select ${v.title}`}
          className="absolute right-2 top-2 z-10 h-4.5 w-4.5 cursor-pointer rounded shadow" />
      )}
      {onFav && !onSelect && (
        <button onClick={() => onFav(v)} aria-label={v.favorite ? "Remove from favorites" : "Add to favorites"}
          className={cx("absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 backdrop-blur transition-all hover:scale-110", v.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          <Heart size={14} className={v.favorite ? "fill-rose text-rose" : "text-white"} />
        </button>
      )}
      {v.favorite && onSelect && <Heart size={13} className="absolute left-2 top-8 fill-rose text-rose" />}
    </div>
  );
}

export function VideoTable({ items, selected, onSelect, onSelectAll }: {
  items: VideoItem[]; selected: Set<number>; onSelect: (id: number) => void; onSelectAll: () => void;
}) {
  const allSel = items.length > 0 && items.every((v) => selected.has(v.id));
  return (
    <div className="rise overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[900px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mut">
            <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={allSel} onChange={onSelectAll} aria-label="Select all on page" /></th>
            <th className="px-2 py-2.5">Title / File</th>
            <th className="px-2 py-2.5">Duration</th>
            <th className="px-2 py-2.5">Size</th>
            <th className="px-2 py-2.5">Res</th>
            <th className="px-2 py-2.5">Format</th>
            <th className="px-2 py-2.5">Rating</th>
            <th className="px-2 py-2.5">Status</th>
            <th className="px-2 py-2.5">Added</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => (
            <tr key={v.id} className={cx("border-b border-line/50 transition-colors last:border-0 hover:bg-amber/5", selected.has(v.id) && "bg-amber/8")}>
              <td className="px-3 py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={() => onSelect(v.id)} aria-label={`Select ${v.title}`} /></td>
              <td className="max-w-[300px] px-2 py-2">
                <Link href={`/videos/${v.id}`} className="flex items-center gap-2.5">
                  <span className="h-9 w-14 shrink-0 overflow-hidden rounded"><Thumb v={v} /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate font-semibold hover:text-amber">
                      {v.favorite && <Heart size={11} className="shrink-0 fill-rose text-rose" />}
                      {v.bookmarked && <Bookmark size={11} className="shrink-0 text-rose" />}
                      <span className="truncate">{v.title}</span>
                    </span>
                    <span className="block truncate text-[11px] text-mut">{v.fileName}</span>
                  </span>
                </Link>
              </td>
              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{fmtDur(v.durationSec)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-mut">{fmtBytes(v.sizeBytes)}</td>
              <td className="px-2 py-2 text-xs">{resLabel(v.width, v.height)}</td>
              <td className="px-2 py-2 text-xs uppercase text-mut">{v.fileExt}</td>
              <td className="px-2 py-2"><Stars value={v.rating} size={11} /></td>
              <td className="px-2 py-2">{v.missing ? <Badge tone="err"><FileWarning size={11} /> Missing</Badge> : <StatusBadge status={v.watchStatus} />}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-mut">{fmtDate(v.dateAdded)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MiniCard({ v }: { v: { id: number; title: string; durationSec: number | null; rating: number; hasThumb: boolean; missing?: boolean } }) {
  return (
    <Link href={`/videos/${v.id}`} className="group w-40 shrink-0 overflow-hidden rounded-lg border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-amber/40 hover:shadow-md">
      <div className="relative aspect-video overflow-hidden">
        <Thumb v={v} />
        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-px font-mono text-[10px] font-semibold text-white">{fmtDur(v.durationSec)}</span>
      </div>
      <div className="p-2">
        <p className="truncate text-[11px] font-bold group-hover:text-amber">{v.title}</p>
        <Stars value={v.rating} size={10} />
      </div>
    </Link>
  );
}

export function Meter({ label, value, max, sub, href }: { label: string; value: number; max: number; sub?: string; href?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const inner = (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-semibold">{label}</span>
        <span className="shrink-0 text-mut">{sub ?? value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-mut/15">
        <div className="h-full rounded-full bg-gradient-to-r from-amber to-rose transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
  return href ? <Link href={href} className="block rounded-md p-1 transition-colors hover:bg-ink/5">{inner}</Link> : <div className="p-1">{inner}</div>;
}
