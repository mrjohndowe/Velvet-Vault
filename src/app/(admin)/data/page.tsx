"use client";
import { useRef, useState } from "react";
import { FileDown, FileUp, DatabaseBackup, Archive, Sparkles, UploadCloud, AlertTriangle, HardDrive } from "lucide-react";
import { Button, Card, Badge, useToast, useConfirm, PageHeader, inputCls } from "@/components/ui";
import { api, download } from "@/lib/client";

export default function DataPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [includePrivate, setIncludePrivate] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const importCsv = async (text: string) => {
    setBusy("csv");
    try {
      const r = await api<{ imported: number; skipped: number; errors: string[] }>("/vault/api/data", { body: { action: "csv-import", csv: text } });
      setImportResult(r);
      toast(`CSV import: ${r.imported} imported, ${r.skipped} skipped, ${r.errors.length} error(s).`, r.errors.length ? "info" : "ok");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const restore = async (file: File) => {
    const ok = await confirm({
      title: "Restore backup? This replaces everything.",
      message: <>The current inventory, taxonomy, settings and share records will be <strong>replaced</strong> by the backup contents. Original media files are never touched. Export a fresh backup first if unsure.</>,
      confirmLabel: "Replace & restore", danger: true,
    });
    if (!ok) return;
    setBusy("restore");
    try {
      const data = JSON.parse(await file.text());
      const r = await api<{ videos: number }>("/vault/api/data", { body: { action: "restore", data } });
      toast(`Restored ${r.videos} video records plus taxonomy, settings and share sessions.`);
    } catch (e) { toast(e instanceof Error ? e.message : "Restore failed — file may be invalid", "err"); }
    setBusy(null);
  };

  const loadSample = async () => {
    setBusy("sample");
    try {
      const r = await api<{ created: number; already?: boolean; ffmpeg: boolean }>("/vault/api/data", { body: { action: "sample" } });
      toast(r.already ? "Sample library already loaded." : `Sample library loaded (${r.created} records${r.ffmpeg ? ", synthetic test clips generated" : ", metadata only — FFmpeg missing"}).`, "ok");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const h = "font-display text-base font-bold flex items-center gap-2 mb-2";

  return (
    <>
      <PageHeader title="Backup & Data" sub="Exports, imports, disaster recovery and the downloadable project archive." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rise p-5">
          <h2 className={h}><FileDown size={16} className="text-amber" /> Export inventory</h2>
          <p className="mb-3 text-xs leading-relaxed text-mut">CSV includes every metadata field plus total runtime (seconds and HH:MM:SS). <strong className="text-ink">Private notes are excluded by default.</strong></p>
          <label className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} />
            Include private notes <span className="font-normal text-warn">(sensitive — handle the file accordingly)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download(`/vault/api/data?kind=csv${includePrivate ? "&includePrivate=1" : ""}`)}><FileDown size={14} /> Download CSV</Button>
          </div>
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><DatabaseBackup size={16} className="text-ok" /> Full backup & restore</h2>
          <p className="mb-3 text-xs leading-relaxed text-mut">One JSON file with all tables (records, categories, tags, collections, settings incl. the password <em>verifier</em>) and the share-code store (verifiers + redemption state). Media files are referenced by path, never embedded.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download("/vault/api/data?kind=backup")}><DatabaseBackup size={14} /> Download backup</Button>
            <Button variant="outline" busy={busy === "restore"} onClick={() => restoreRef.current?.click()}><UploadCloud size={14} /> Restore from file…</Button>
            <input ref={restoreRef} type="file" accept="application/json" className="hidden" aria-label="Restore backup file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-warn"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Restoring replaces current data and revives share sessions exactly as backed up (redeemed codes stay redeemed).</p>
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><FileUp size={16} className="text-rose" /> CSV import (validated, resumable)</h2>
          <p className="mb-3 text-xs leading-relaxed text-mut">Required columns: <span className="font-mono">title, filePath</span>. Optional: durationSec / durationHHMMSS, sizeBytes, category, tags (semicolon-separated), rating, watchStatus, and more. Rows with existing paths are skipped, so an interrupted import can simply be re-run. Paths must be inside library roots.</p>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={4} placeholder={'title,filePath,durationHHMMSS,category,tags\n"My Title","D:\\Media\\clip.mp4","01:24:36","Couples","slow burn;classic"'} className={inputCls + " font-mono !text-[11px]"} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button busy={busy === "csv"} disabled={!csvText.trim()} onClick={() => importCsv(csvText)}><FileUp size={14} /> Import pasted CSV</Button>
            <Button variant="outline" busy={busy === "csv"} onClick={() => csvFileRef.current?.click()}>Choose .csv file…</Button>
            <input ref={csvFileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Import CSV file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(importCsv); e.target.value = ""; }} />
          </div>
          {importResult && (
            <div className="rise mt-3 rounded-lg border border-line bg-raised/60 p-3 text-xs">
              <p className="font-bold">Imported {importResult.imported} · skipped {importResult.skipped} · errors {importResult.errors.length}</p>
              {importResult.errors.length > 0 && <ul className="mt-1.5 list-inside list-disc text-err">{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </Card>

        <Card className="rise p-5">
          <h2 className={h}><Archive size={16} className="text-amber" /> Downloadable project</h2>
          <p className="mb-3 text-xs leading-relaxed text-mut">Complete source ZIP: application code, database schema & init script, README with installation guide, sample config (no credentials), feature checklist, test plan and troubleshooting. Excludes runtime data, media, secrets and node_modules.</p>
          <Button onClick={() => download("/vault/api/data?kind=project")}><Archive size={14} /> Download project ZIP</Button>
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold"><Sparkles size={14} className="text-rose" /> Sample dataset</h3>
            <p className="mb-2 text-[11px] text-mut">Fictional titles + locally generated, non-explicit FFmpeg test clips — exercises real durations, thumbnails, duplicates and missing files.</p>
            <Button variant="outline" size="sm" busy={busy === "sample"} onClick={loadSample}>Load sample library</Button>
          </div>
        </Card>
      </div>

      <Card className="rise mt-4 flex items-start gap-3 p-4 text-xs leading-relaxed text-mut">
        <HardDrive size={16} className="mt-0.5 shrink-0 text-ok" />
        <span><strong className="text-ink">Records vs files:</strong> the database holds only paths and metadata — never video content. Deleting records, restoring backups or purging shares never deletes, renames or moves a media file. Keep your own file-level backups for the media itself.</span>
      </Card>
    </>
  );
}
