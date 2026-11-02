"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Heart, Bookmark, Pencil, KeyRound, Trash2, RefreshCw, ImageUp, ImageOff, ExternalLink,
  FileWarning, Link2, Lock, ChevronDown, ChevronUp, FolderOpen, Hash, Eye,
} from "lucide-react";
import { Button, Card, Badge, Spinner, Stars, useToast, useConfirm, inputCls, cx } from "@/components/ui";
import { Thumb, StatusBadge, type VideoItem } from "@/components/video-bits";
import { MediaPlayer, UnsupportedFormat, openExternal } from "@/components/player";
import { ShareDialog } from "@/components/share-dialog";
import { api } from "@/lib/client";
import { fmtBytes, fmtDur, fmtDurHuman, fmtDate, fmtDateTime, resLabel } from "@/lib/util";

function Meta({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/50 py-1.5 text-xs last:border-0">
      <span className="shrink-0 font-semibold text-mut">{k}</span>
      <span className={cx("text-right", mono && "font-mono text-[11px] break-all")}>{v ?? "—"}</span>
    </div>
  );
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useState<VideoItem | null>(null);
  const [present, setPresent] = useState(true);
  const [share, setShare] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [relink, setRelink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [thumbKey, setThumbKey] = useState(0);

  const load = useCallback(() => {
    api<{ video: VideoItem & { filePresent: boolean } }>(`/vault/api/videos/${id}`)
      .then((r) => { setV(r.video); setPresent(r.video.filePresent); })
      .catch((e) => { toast(e.message, "err"); });
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>, msg?: string) => {
    try {
      await api(`/vault/api/videos/${id}`, { method: "PATCH", body });
      if (msg) toast(msg);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  if (!v) return <Spinner label="Loading record…" />;

  const doDelete = async () => {
    const ok = await confirm({
      title: "Remove this inventory record?",
      message: <>Only the <strong>database record and its thumbnail</strong> are deleted. The original file <span className="font-mono text-[11px]">{v.fileName}</span> stays exactly where it is on disk.</>,
      confirmLabel: "Remove record", danger: true,
    });
    if (!ok) return;
    try { await api(`/vault/api/videos/${id}`, { method: "DELETE" }); toast("Record removed. Original file untouched."); router.push("/library"); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const doThumb = async (action: string) => {
    setBusy("thumb");
    try {
      await api(`/vault/api/videos/${id}/thumbnail`, { body: { action } });
      toast(action === "regenerate" ? "Thumbnail regenerated with FFmpeg." : "Thumbnail removed.");
      setThumbKey((k) => k + 1); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const uploadThumb = async (file: File) => {
    setBusy("thumb");
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/vault/api/videos/${id}/thumbnail`, { form });
      toast("Custom thumbnail saved.");
      setThumbKey((k) => k + 1); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const doRelink = async () => {
    if (!relink.trim()) return toast("Enter the new file path.", "err");
    setBusy("relink");
    try {
      await api("/vault/api/integrity", { body: { action: "relink", id: v.id, path: relink } });
      toast("File relinked and metadata refreshed.");
      setRelink(""); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const onOpen = async () => { const err = await openExternal(v.id); if (err) toast(err, "err"); else toast("Asked the OS to open the file in its default player.", "info"); };

  const canPlay = present && !v.missing && v.playable;

  return (
    <>
      <div className="rise mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Inventory record #{v.id}</p>
          <h1 className="font-display mt-0.5 text-3xl font-black leading-tight tracking-tight">{v.title}</h1>
          {v.altTitle && <p className="mt-0.5 text-sm italic text-mut">“{v.altTitle}”</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {v.categoryName && <Link href={`/library?categoryId=${v.categoryId}`}><Badge tone="amber">{v.categoryName}</Badge></Link>}
            <Badge tone="mut">{resLabel(v.width, v.height)}</Badge>
            <Badge tone="mut">{v.fileExt.toUpperCase()}</Badge>
            <StatusBadge status={v.watchStatus} />
            {v.missing && <Badge tone="err"><FileWarning size={11} /> Missing file</Badge>}
            {v.privacy !== "standard" && <Badge tone="rose"><Lock size={11} /> {v.privacy}</Badge>}
            {v.contentWarnings && <Badge tone="warn">⚠ {v.contentWarnings}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={v.favorite ? "rose" : "outline"} onClick={() => patch({ favorite: !v.favorite })}>
            <Heart size={13} className={v.favorite ? "fill-white" : ""} /> {v.favorite ? "Favorited" : "Favorite"}
          </Button>
          <Button size="sm" variant={v.bookmarked ? "rose" : "outline"} onClick={() => patch({ bookmarked: !v.bookmarked })}>
            <Bookmark size={13} className={v.bookmarked ? "fill-white" : ""} /> Bookmark
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShare(true)} disabled={v.missing || !present}><KeyRound size={13} /> Share video</Button>
          <Link href={`/videos/${v.id}/edit`}><Button size="sm" variant="outline"><Pencil size={13} /> Edit</Button></Link>
          <Button size="sm" variant="danger" onClick={doDelete}><Trash2 size={13} /></Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {canPlay ? (
            <MediaPlayer key={v.id} src={`/vault/api/media/${v.id}`} title={v.title}
              durationHint={v.durationSec} initialSec={v.progressSec}
              poster={v.hasThumb ? `/vault/api/thumbs/${v.id}?k=${thumbKey}` : undefined}
              onProgress={(sec) => { void api(`/vault/api/videos/${id}`, { method: "PATCH", body: { action: "progress", positionSec: sec } }).catch(() => {}); }}
              onEnded={() => { void api(`/vault/api/videos/${id}`, { method: "PATCH", body: { action: "progress", positionSec: v.durationSec ?? 0, ended: true } }).then(() => { toast("Marked as watched."); load(); }).catch(() => {}); }} />
          ) : (
            <UnsupportedFormat ext={v.fileExt} missing={v.missing || !present} onOpen={onOpen} />
          )}

          {(v.missing || !present) && (
            <Card className="rise border-err/40 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-err"><Link2 size={15} /> Relink file</h3>
              <p className="mt-1 text-xs text-mut">Moved the file? Point this record at its new location (inside a library root). Metadata is re-read automatically.</p>
              <div className="mt-2.5 flex gap-2">
                <input value={relink} onChange={(e) => setRelink(e.target.value)} placeholder={v.filePath} className={inputCls} />
                <Button busy={busy === "relink"} onClick={doRelink}>Relink</Button>
              </div>
            </Card>
          )}

          <Card className="rise p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Total runtime</p>
                <p className="font-display text-3xl font-black text-amber">{fmtDur(v.durationSec)}</p>
                <p className="text-xs text-mut">{fmtDurHuman(v.durationSec)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-widest text-mut">Your rating</p>
                <Stars value={v.rating} size={22} onChange={(n) => patch({ rating: n }, n ? `Rated ${n}★` : "Rating cleared")} />
                <p className="mt-1 text-[11px] text-mut">Watched {v.watchCount}× · last {v.lastWatchedAt ? fmtDateTime(v.lastWatchedAt) : "never"}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-mut">Watch status</p>
                <select value={v.watchStatus} onChange={(e) => patch({ watchStatus: e.target.value }, "Status updated")} className={inputCls}>
                  <option value="unwatched">Unwatched</option><option value="partial">Partially watched</option><option value="watched">Watched</option>
                </select>
              </div>
            </div>
          </Card>

          {(v.description || v.review) && (
            <Card className="rise space-y-4 p-5">
              {v.description && <div><h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-mut">Description</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{v.description}</p></div>}
              {v.review && <div><h3 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-mut">Your review</h3><p className="whitespace-pre-wrap text-sm italic leading-relaxed text-ink/90">“{v.review}”</p></div>}
            </Card>
          )}

          {v.privateNotes && (
            <Card className="rise p-5">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setNotesOpen(!notesOpen)}>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-mut"><Lock size={13} className="text-rose" /> Private notes (never exported by default)</h3>
                {notesOpen ? <ChevronUp size={15} className="text-mut" /> : <ChevronDown size={15} className="text-mut" />}
              </button>
              {notesOpen && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-rose/6 p-3 text-sm leading-relaxed">{v.privateNotes}</p>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rise overflow-hidden">
            <div className="group relative aspect-video" key={thumbKey}>
              <Thumb v={v} />
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
              <Button size="sm" variant="outline" busy={busy === "thumb"} onClick={() => doThumb("regenerate")} title="Generate a fresh frame with FFmpeg"><RefreshCw size={12} /> Regenerate</Button>
              <Button size="sm" variant="outline" busy={busy === "thumb"} onClick={() => fileRef.current?.click()}><ImageUp size={12} /> Upload</Button>
              <Button size="sm" variant="ghost" busy={busy === "thumb"} onClick={() => doThumb("remove")}><ImageOff size={12} /></Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload custom thumbnail"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadThumb(file); e.target.value = ""; }} />
            </div>
          </Card>

          <Card className="rise p-4">
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold"><FolderOpen size={14} className="text-amber" /> File information</h3>
            <Meta k="File name" v={v.fileName} mono />
            <Meta k="Path" v={v.filePath} mono />
            <Meta k="Size" v={fmtBytes(v.sizeBytes)} />
            <Meta k="Resolution" v={v.width && v.height ? `${v.width}×${v.height} (${resLabel(v.width, v.height)})` : "—"} />
            <Meta k="Frame rate" v={v.fps ? `${v.fps} fps` : "—"} />
            <Meta k="Codec" v={v.codec} />
            <Meta k="Container" v={v.format ?? v.fileExt.toUpperCase()} />
            <Meta k="Added" v={fmtDateTime(v.dateAdded)} />
            <Meta k="Recorded" v={v.recordedAt ? fmtDate(v.recordedAt) : "Unknown"} />
            <Meta k="File modified" v={fmtDateTime(v.fileModifiedAt)} />
            <Meta k="Metadata checked" v={fmtDateTime(v.lastMetaCheck)} />
            <Meta k="SHA-256" v={v.hash ? <span className="inline-flex items-center gap-1"><Hash size={10} />{v.hash.slice(0, 16)}…</span> : "Not hashed"} mono />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => patch({ action: "probe", rehash: true }, "Metadata re-read from file.")}><RefreshCw size={12} /> Re-check metadata</Button>
              {present && !v.missing && <Button size="sm" variant="outline" onClick={onOpen}><ExternalLink size={12} /> System player</Button>}
            </div>
          </Card>

          <Card className="rise p-4">
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold"><Eye size={14} className="text-rose" /> Credits & organization</h3>
            <Meta k="Studio" v={v.studio} />
            <Meta k="Performers" v={v.performers} />
            <Meta k="Source" v={v.source} />
            <Meta k="Privacy" v={v.privacy} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.tags.length === 0 && <span className="text-xs text-mut">No tags yet.</span>}
              {v.tags.map((t) => <Link key={t.id} href={`/library?tagIds=${t.id}`}><Badge tone="rose">#{t.name}</Badge></Link>)}
            </div>
          </Card>
        </div>
      </div>

      <ShareDialog open={share} onClose={() => setShare(false)} videoIds={[v.id]} titles={[v.title]} />
    </>
  );
}
