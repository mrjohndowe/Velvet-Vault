"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, FileSearch, Plus, Lock } from "lucide-react";
import { Button, Card, Field, inputCls, Toggle, Stars, useToast, Spinner, Badge } from "./ui";
import { api } from "@/lib/client";
import { fmtBytes, fmtDateTime, fmtDur, parseDuration, resLabel } from "@/lib/util";
import type { VideoItem } from "./video-bits";

type Tax = { categories: { id: number; name: string; parentId: number | null }[]; tags: { id: number; name: string }[]; collections: { id: number; name: string; kind: string }[] };
type FormState = Record<string, string>;

const EMPTY: FormState = {
  title: "", altTitle: "", filePath: "", format: "", codec: "", sizeMB: "", durationStr: "",
  width: "", height: "", fps: "", recordedAt: "", categoryId: "", studio: "", performers: "", source: "",
  review: "", description: "", privateNotes: "", watchStatus: "unwatched", watchCount: "0",
  privacy: "standard", contentWarnings: "", rating: "0",
};

export function VideoForm({ videoId }: { videoId?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<FormState>(EMPTY);
  const [fav, setFav] = useState(false);
  const [bm, setBm] = useState(false);
  const [tagIds, setTagIds] = useState<Set<number>>(new Set());
  const [colIds, setColIds] = useState<Set<number>>(new Set());
  const [tax, setTax] = useState<Tax | null>(null);
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [loading, setLoading] = useState(!!videoId);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    api<Tax>("/vault/api/taxonomy").then(setTax).catch((e) => toast(e.message, "err"));
    if (videoId) {
      api<{ video: VideoItem }>(`/vault/api/videos/${videoId}`).then((r) => {
        const v = r.video;
        setVideo(v);
        setF({
          title: v.title, altTitle: v.altTitle ?? "", filePath: v.filePath, format: v.format ?? "", codec: v.codec ?? "",
          sizeMB: v.sizeBytes ? (v.sizeBytes / 1048576).toFixed(1) : "", durationStr: v.durationSec != null ? fmtDur(v.durationSec) : "",
          width: v.width ? String(v.width) : "", height: v.height ? String(v.height) : "", fps: v.fps ? String(v.fps) : "",
          recordedAt: v.recordedAt ? v.recordedAt.slice(0, 10) : "", categoryId: v.categoryId ? String(v.categoryId) : "",
          studio: v.studio ?? "", performers: v.performers ?? "", source: v.source ?? "",
          review: v.review ?? "", description: v.description ?? "", privateNotes: v.privateNotes ?? "",
          watchStatus: v.watchStatus, watchCount: String(v.watchCount), privacy: v.privacy,
          contentWarnings: v.contentWarnings ?? "", rating: String(v.rating),
        });
        setFav(v.favorite); setBm(v.bookmarked);
        setTagIds(new Set(v.tags.map((t) => t.id)));
        setColIds(new Set(v.collectionIds ?? []));
        setLoading(false);
      }).catch((e) => { toast(e.message, "err"); setLoading(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const probe = async () => {
    if (!f.filePath.trim()) return toast("Enter the file path first.", "err");
    setProbing(true);
    try {
      const r = await api<{ size: number; meta: { durationSec: number | null; width: number | null; height: number | null; fps: number | null; codec: string | null; format: string | null } | null; probed: boolean }>("/vault/api/scan", { body: { action: "probe", path: f.filePath } });
      setF((p) => ({
        ...p, sizeMB: (r.size / 1048576).toFixed(1),
        durationStr: r.meta?.durationSec != null ? fmtDur(r.meta.durationSec) : p.durationStr,
        width: r.meta?.width ? String(r.meta.width) : p.width, height: r.meta?.height ? String(r.meta.height) : p.height,
        fps: r.meta?.fps ? String(r.meta.fps) : p.fps, codec: r.meta?.codec ?? p.codec, format: r.meta?.format ?? p.format,
      }));
      toast(r.probed ? "Metadata read from file with FFprobe." : "File found; FFprobe unavailable — only size updated.", r.probed ? "ok" : "info");
    } catch (e) { toast(e instanceof Error ? e.message : "Probe failed", "err"); }
    setProbing(false);
  };

  const addTag = async () => {
    const name = newTag.trim().toLowerCase();
    if (!name) return;
    try {
      const r = await api<{ created: { id: number; name: string } }>("/vault/api/taxonomy", { body: { type: "tag", name } });
      setTax((t) => t ? { ...t, tags: [...t.tags, r.created].sort((a, b) => a.name.localeCompare(b.name)) } : t);
      setTagIds((s) => new Set(s).add(r.created.id));
      setNewTag("");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const save = async () => {
    if (!f.title.trim()) return toast("Title is required.", "err");
    if (!f.filePath.trim()) return toast("Full file path is required.", "err");
    let dur: number | null = null;
    if (f.durationStr.trim()) {
      dur = parseDuration(f.durationStr);
      if (dur == null || dur < 0) return toast("Duration must be HH:MM:SS, MM:SS or seconds.", "err");
    }
    setSaving(true);
    const body = {
      title: f.title, altTitle: f.altTitle || null, filePath: f.filePath, format: f.format || null, codec: f.codec || null,
      sizeBytes: f.sizeMB ? Math.round(Number(f.sizeMB) * 1048576) : 0, durationSec: dur,
      width: f.width ? Number(f.width) : null, height: f.height ? Number(f.height) : null, fps: f.fps ? Number(f.fps) : null,
      recordedAt: f.recordedAt || null, categoryId: f.categoryId ? Number(f.categoryId) : null,
      studio: f.studio || null, performers: f.performers || null, source: f.source || null,
      rating: Number(f.rating), review: f.review || null, description: f.description || null, privateNotes: f.privateNotes || null,
      favorite: fav, bookmarked: bm, watchStatus: f.watchStatus, watchCount: Number(f.watchCount || 0),
      privacy: f.privacy, contentWarnings: f.contentWarnings || null,
      tagIds: [...tagIds], collectionIds: [...colIds],
    };
    try {
      if (videoId) {
        await api(`/vault/api/videos/${videoId}`, { method: "PATCH", body });
        toast("Video updated.");
        router.push(`/videos/${videoId}`);
      } else {
        const r = await api<{ video: { id: number } }>("/vault/api/videos", { body });
        toast("Video added to inventory.");
        router.push(`/videos/${r.video.id}`);
      }
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "err"); setSaving(false); }
  };

  if (loading || !tax) return <Spinner label={videoId ? "Loading record…" : "Preparing form…"} />;

  const section = "p-5 space-y-4";
  const h = "font-display text-base font-bold flex items-center gap-2";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className={section}>
        <h2 className={h}>File & technical metadata</h2>
        <Field label="Full local file path" required hint="Must be inside a configured library root (Settings). The file is never copied or moved.">
          <div className="flex gap-2">
            <input value={f.filePath} onChange={(e) => set("filePath", e.target.value)} placeholder="D:\Media\Vault\example.mp4" className={inputCls} />
            <Button variant="outline" busy={probing} onClick={probe} title="Read metadata from the file with FFprobe"><FileSearch size={14} /> Read</Button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" required><input value={f.title} onChange={(e) => set("title", e.target.value)} className={inputCls} /></Field>
          <Field label="Alternate title"><input value={f.altTitle} onChange={(e) => set("altTitle", e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (HH:MM:SS)" hint="Auto-detected on import; editable when unknown.">
            <input value={f.durationStr} onChange={(e) => set("durationStr", e.target.value)} placeholder="01:24:36" className={inputCls} />
          </Field>
          <Field label="File size (MB)"><input type="number" min={0} step="0.1" value={f.sizeMB} onChange={(e) => set("sizeMB", e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Width"><input type="number" value={f.width} onChange={(e) => set("width", e.target.value)} className={inputCls} /></Field>
          <Field label="Height"><input type="number" value={f.height} onChange={(e) => set("height", e.target.value)} className={inputCls} /></Field>
          <Field label="FPS"><input type="number" step="0.01" value={f.fps} onChange={(e) => set("fps", e.target.value)} className={inputCls} /></Field>
          <Field label="Codec"><input value={f.codec} onChange={(e) => set("codec", e.target.value)} className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Container format"><input value={f.format} onChange={(e) => set("format", e.target.value)} placeholder="mov,mp4,m4a…" className={inputCls} /></Field>
          <Field label="Recorded / created date"><input type="date" value={f.recordedAt} onChange={(e) => set("recordedAt", e.target.value)} className={inputCls} /></Field>
        </div>
        {video && (
          <p className="text-[11px] leading-relaxed text-mut">
            Added {fmtDateTime(video.dateAdded)} · File modified {fmtDateTime(video.fileModifiedAt)} · Metadata last checked {fmtDateTime(video.lastMetaCheck)}
            {video.height ? <> · <Badge tone="amber">{resLabel(video.width, video.height)}</Badge></> : null} {video.sizeBytes ? <>· {fmtBytes(video.sizeBytes)}</> : null}
          </p>
        )}
      </Card>

      <div className="space-y-4">
        <Card className={section}>
          <h2 className={h}>Organization</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category / subcategory">
              <select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
                <option value="">Uncategorized</option>
                {tax.categories.filter((c) => !c.parentId).map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name}</option>
                    {tax.categories.filter((k) => k.parentId === c.id).map((k) => <option key={k.id} value={k.id}>— {k.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Studio"><input value={f.studio} onChange={(e) => set("studio", e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Performers / creators"><input value={f.performers} onChange={(e) => set("performers", e.target.value)} placeholder="Comma-separated" className={inputCls} /></Field>
            <Field label="Source"><input value={f.source} onChange={(e) => set("source", e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {tax.tags.map((t) => (
                <button key={t.id} type="button" onClick={() => setTagIds((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${tagIds.has(t.id) ? "border-rose/50 bg-rose/15 text-rose" : "border-line text-mut hover:text-ink"}`}>
                  #{t.name}
                </button>
              ))}
              <span className="flex items-center gap-1">
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTag(); } }}
                  placeholder="new tag" className={inputCls + " !w-24 !px-2 !py-1 !text-[11px]"} />
                <Button size="sm" variant="outline" onClick={addTag}><Plus size={12} /></Button>
              </span>
            </div>
          </Field>
          <Field label="Collections & playlists">
            <div className="flex flex-wrap gap-1.5">
              {tax.collections.length === 0 && <span className="text-xs text-mut">None yet — create them under Collections.</span>}
              {tax.collections.map((c) => (
                <button key={c.id} type="button" onClick={() => setColIds((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${colIds.has(c.id) ? "border-amber/50 bg-amber/15 text-amber" : "border-line text-mut hover:text-ink"}`}>
                  {c.kind === "playlist" ? "▶" : "◈"} {c.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description"><textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputCls} /></Field>
        </Card>

        <Card className={section}>
          <h2 className={h}>Personal</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Field label="Rating"><Stars value={Number(f.rating)} onChange={(v) => set("rating", String(v))} size={20} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold">Favorite <Toggle checked={fav} onChange={setFav} label="Favorite" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold">Bookmark <Toggle checked={bm} onChange={setBm} label="Bookmark" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Watch status">
              <select value={f.watchStatus} onChange={(e) => set("watchStatus", e.target.value)} className={inputCls}>
                <option value="unwatched">Unwatched</option><option value="partial">Partially watched</option><option value="watched">Watched</option>
              </select>
            </Field>
            <Field label="Watch count"><input type="number" min={0} value={f.watchCount} onChange={(e) => set("watchCount", e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Review"><textarea value={f.review} onChange={(e) => set("review", e.target.value)} rows={2} className={inputCls} /></Field>
          <Field label="Private notes" hint="Never included in CSV exports unless explicitly requested; never shared.">
            <textarea value={f.privateNotes} onChange={(e) => set("privateNotes", e.target.value)} rows={2} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Privacy classification">
              <select value={f.privacy} onChange={(e) => set("privacy", e.target.value)} className={inputCls}>
                <option value="standard">Standard</option><option value="private">Private</option><option value="hidden">Hidden (filtered out by default)</option>
              </select>
            </Field>
            <Field label="Content warnings"><input value={f.contentWarnings} onChange={(e) => set("contentWarnings", e.target.value)} className={inputCls} /></Field>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3 lg:col-span-2">
        <Button busy={saving} onClick={save}><Save size={15} /> {videoId ? "Save changes" : "Add to inventory"}</Button>
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-mut"><Lock size={12} /> Stored locally · originals untouched</span>
      </div>
    </div>
  );
}
