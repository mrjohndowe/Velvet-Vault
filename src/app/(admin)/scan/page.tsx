"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderSearch, Play, CheckCircle2, AlertTriangle, FileVideo, Download, Info, Plus } from "lucide-react";
import { Button, Card, Field, inputCls, Toggle, Badge, useToast, cx, PageHeader, EmptyState } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtBytes, fmtDur, resLabel, VIDEO_EXTS } from "@/lib/util";

type ScanFile = { path: string; name: string; ext: string; size: number; mtime: string; durationSec: number | null; width: number | null; height: number | null; fps: number | null; codec: string | null; status: "new" | "exists" | "error"; error?: string };
type Job = { id: string; status: "scanning" | "done" | "error"; root: string; scanned: number; found: number; files: ScanFile[]; errors: string[]; error?: string };

export default function ScanPage() {
  const toast = useToast();
  const [root, setRoot] = useState("");
  const [roots, setRoots] = useState<string[]>([]);
  const [recursive, setRecursive] = useState(true);
  const [probe, setProbe] = useState(true);
  const [addRoot, setAddRoot] = useState(false);
  const [hash, setHash] = useState(false);
  const [thumb, setThumb] = useState(false);
  const [ffprobeOk, setFfprobeOk] = useState<boolean | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<{ settings: { libraryRoots: string[]; thumbsEnabled: boolean; hashOnImport: boolean }; tools: { ffprobe: boolean } }>("/vault/api/settings")
      .then((r) => { setRoots(r.settings.libraryRoots); setRoot((p) => p || r.settings.libraryRoots[0] || ""); setThumb(r.settings.thumbsEnabled); setHash(r.settings.hashOnImport); setFfprobeOk(r.tools.ffprobe); })
      .catch((e) => toast(e.message, "err"));
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = (id: string) => {
    api<{ job: Job }>(`/vault/api/scan?job=${id}`).then((r) => {
      setJob(r.job);
      if (r.job.status === "scanning") pollRef.current = setTimeout(() => poll(id), 700);
      else if (r.job.status === "done") {
        setSel(new Set(r.job.files.filter((f) => f.status === "new").map((f) => f.path)));
        toast(`Scan complete: ${r.job.files.length} video file(s) found, ${r.job.files.filter((f) => f.status === "new").length} new.`);
      }
    }).catch((e) => toast(e.message, "err"));
  };

  const start = async () => {
    setResult(null); setJob(null);
    try {
      const r = await api<{ job: Job }>("/vault/api/scan", { body: { action: "scan", root, recursive, probe, addRoot } });
      setJob(r.job);
      poll(r.job.id);
    } catch (e) { toast(e instanceof Error ? e.message : "Scan failed", "err"); }
  };

  const doImport = async (paths: string[]) => {
    setImporting(true);
    try {
      const r = await api<{ imported: number; skipped: number; errors: string[] }>("/vault/api/scan", { body: { action: "import", paths, hash, thumb } });
      setResult(r);
      toast(`Imported ${r.imported}, skipped ${r.skipped}${r.errors.length ? `, ${r.errors.length} error(s)` : ""}.`, r.errors.length ? "info" : "ok");
      if (job) setJob({ ...job, files: job.files.map((f) => paths.includes(f.path) && !r.errors.some((e) => e.startsWith(f.name)) ? { ...f, status: "exists" as const } : f) });
      setSel(new Set());
    } catch (e) { toast(e instanceof Error ? e.message : "Import failed", "err"); }
    setImporting(false);
  };

  const scanning = job?.status === "scanning";
  const newFiles = job?.files.filter((f) => f.status === "new") ?? [];

  return (
    <>
      <PageHeader title="Scan & Import" sub="Index existing files in place — nothing is copied, moved, renamed, or modified."
        actions={<Link href="/videos/new"><Button variant="outline" size="sm"><Plus size={14} /> Manual entry</Button></Link>} />

      <Card className="rise mb-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Field label="Folder to scan" hint={roots.length ? `Configured roots: ${roots.join("  ·  ")}` : "No library roots configured yet — tick “trust” below or add roots in Settings."}>
            <input value={root} onChange={(e) => setRoot(e.target.value)} list="roots-list" placeholder="D:\Media\Vault  or  /home/me/Videos" className={inputCls} />
            <datalist id="roots-list">{roots.map((r) => <option key={r} value={r} />)}</datalist>
          </Field>
          <div className="flex items-end"><Button busy={scanning} onClick={start}><Play size={15} /> {scanning ? "Scanning…" : "Start scan"}</Button></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2.5 text-sm">
          <label className="flex items-center gap-2">Recursive (subfolders) <Toggle checked={recursive} onChange={setRecursive} label="Recursive scan" /></label>
          <label className="flex items-center gap-2">Extract metadata (FFprobe) <Toggle checked={probe} onChange={setProbe} label="Probe metadata" /></label>
          <label className="flex items-center gap-2">Trust as library root <Toggle checked={addRoot} onChange={setAddRoot} label="Trust folder as root" /></label>
          <label className="flex items-center gap-2">SHA-256 hashes <Toggle checked={hash} onChange={setHash} label="Hash files" /></label>
          <label className="flex items-center gap-2">Generate thumbnails <Toggle checked={thumb} onChange={setThumb} label="Generate thumbnails" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-mut">
          <Info size={13} className="text-amber" />
          Supported: {VIDEO_EXTS.map((e) => e.toUpperCase()).join(", ")} · Re-scans never create duplicate records (paths are matched).
          {ffprobeOk === false && <Badge tone="warn">FFprobe not found — install FFmpeg or set its path in Settings</Badge>}
          {ffprobeOk === true && <Badge tone="ok">FFprobe ready</Badge>}
          {!thumb && <Badge tone="mut">Thumbnails off (explicit-preview safe default)</Badge>}
        </div>
      </Card>

      {scanning && job && (
        <Card className="rise mb-5 flex items-center gap-4 p-5">
          <span className="pulse-dot grid h-10 w-10 place-items-center rounded-full bg-amber/15"><FolderSearch size={18} className="text-amber" /></span>
          <div>
            <p className="text-sm font-bold">Scanning {job.root}</p>
            <p className="text-xs text-mut">{job.scanned.toLocaleString()} files examined · {job.found} video file(s) found so far…</p>
          </div>
        </Card>
      )}

      {job?.status === "error" && <Card className="mb-5 border-err/40 p-4 text-sm text-err">{job.error}</Card>}

      {result && (
        <Card className="rise mb-5 border-ok/40 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-ok"><CheckCircle2 size={16} /> Import finished — {result.imported} imported, {result.skipped} skipped, {result.errors.length} errors</p>
          {result.errors.length > 0 && <ul className="mt-2 list-inside list-disc text-xs text-err">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </Card>
      )}

      {job?.errors.map((e, i) => (
        <p key={i} className="mb-2 flex items-center gap-2 text-xs text-warn"><AlertTriangle size={13} /> {e}</p>
      ))}

      {job?.status === "done" && (
        job.files.length === 0 ? (
          <EmptyState icon={FileVideo} title="No supported video files found" body="Check the folder path, or enable recursive scanning to include subdirectories." />
        ) : (
          <Card className="rise overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3.5">
              <p className="text-sm font-bold">{job.files.length} file(s) · {newFiles.length} new · {job.files.filter((f) => f.status === "exists").length} already indexed</p>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSel(new Set(newFiles.map((f) => f.path)))}>Select all new</Button>
                <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>None</Button>
                <Button size="sm" busy={importing} disabled={sel.size === 0} onClick={() => doImport([...sel])}><Download size={13} /> Import selected ({sel.size})</Button>
                <Button size="sm" variant="rose" busy={importing} disabled={newFiles.length === 0} onClick={() => doImport(newFiles.map((f) => f.path))}>Import all new</Button>
              </div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mut">
                    <th className="w-10 px-3 py-2"></th><th className="px-2 py-2">File</th><th className="px-2 py-2">Duration</th>
                    <th className="px-2 py-2">Res</th><th className="px-2 py-2">Codec</th><th className="px-2 py-2">Size</th><th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {job.files.map((f) => (
                    <tr key={f.path} className={cx("border-b border-line/40 last:border-0", f.status === "new" ? "hover:bg-amber/5" : "opacity-60")}>
                      <td className="px-3 py-2">
                        <input type="checkbox" disabled={f.status !== "new"} checked={sel.has(f.path)} aria-label={`Select ${f.name}`}
                          onChange={() => setSel((s) => { const n = new Set(s); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })} />
                      </td>
                      <td className="max-w-[320px] px-2 py-2">
                        <p className="truncate font-semibold">{f.name}</p>
                        <p className="truncate font-mono text-[10px] text-mut">{f.path}</p>
                      </td>
                      <td className="px-2 py-2 font-mono">{fmtDur(f.durationSec)}</td>
                      <td className="px-2 py-2">{resLabel(f.width, f.height)}</td>
                      <td className="px-2 py-2">{f.codec ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2">{fmtBytes(f.size)}</td>
                      <td className="px-2 py-2">
                        {f.status === "new" && <Badge tone="ok">New</Badge>}
                        {f.status === "exists" && <Badge tone="mut">Indexed</Badge>}
                        {f.status === "error" && <Badge tone="err" >{f.error ?? "Error"}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}
    </>
  );
}
