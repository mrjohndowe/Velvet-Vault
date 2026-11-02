"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileWarning, RefreshCw, Link2, Trash2, ShieldCheck } from "lucide-react";
import { Button, Card, Spinner, EmptyState, PageHeader, useToast, useConfirm, inputCls } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtBytes, fmtDate } from "@/lib/util";

type V = { id: number; title: string; filePath: string; sizeBytes: number; dateAdded: string };

export default function MissingPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<V[] | null>(null);
  const [paths, setPaths] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | "verify" | null>(null);

  const load = useCallback(() => {
    api<{ missing: V[] }>("/vault/api/integrity?mode=missing").then((r) => setRows(r.missing)).catch((e) => toast(e.message, "err"));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const verify = async () => {
    setBusy("verify");
    try {
      const r = await api<{ checked: number; missing: number; updated: number }>("/vault/api/integrity", { body: { action: "verify" } });
      toast(`Verified ${r.checked} paths: ${r.missing} missing, ${r.updated} changed file(s) re-read.`);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const relink = async (id: number) => {
    const p = paths[id]?.trim();
    if (!p) return toast("Enter the new path first.", "err");
    setBusy(id);
    try {
      await api("/vault/api/integrity", { body: { action: "relink", id, path: p } });
      toast("Relinked — metadata refreshed from the new file.");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(null);
  };

  const removeRecord = async (v: V) => {
    const ok = await confirm({
      title: `Remove record “${v.title}”?`,
      message: "Removes the inventory record only. If the file still exists somewhere, it is not affected.",
      confirmLabel: "Remove record", danger: true,
    });
    if (!ok) return;
    try { await api(`/vault/api/videos/${v.id}`, { method: "DELETE" }); toast("Record removed."); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  if (!rows) return <Spinner label="Checking stored paths…" />;

  return (
    <>
      <PageHeader title="Missing Files" sub="Records whose stored path can no longer be read. Relink them or remove the record — files are never touched."
        actions={<Button busy={busy === "verify"} onClick={verify}><RefreshCw size={14} /> Verify entire library</Button>} />
      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="All files accessible" body="Every stored path resolved to a readable file at last check. Run “Verify entire library” after moving files around." />
      ) : (
        <div className="space-y-4">
          {rows.map((v) => (
            <Card key={v.id} className="rise border-err/30 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <FileWarning size={18} className="shrink-0 text-err" />
                <div className="min-w-0 flex-1">
                  <Link href={`/videos/${v.id}`} className="text-sm font-bold hover:text-amber">{v.title}</Link>
                  <p className="truncate font-mono text-[11px] text-mut">{v.filePath}</p>
                  <p className="text-[11px] text-mut">Last known size {fmtBytes(v.sizeBytes)} · added {fmtDate(v.dateAdded)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeRecord(v)}><Trash2 size={13} className="text-err" /></Button>
              </div>
              <div className="mt-3 flex gap-2">
                <input value={paths[v.id] ?? ""} onChange={(e) => setPaths({ ...paths, [v.id]: e.target.value })}
                  placeholder="New full path (inside a library root)…" aria-label={`New path for ${v.title}`} className={inputCls} />
                <Button size="sm" busy={busy === v.id} onClick={() => relink(v.id)}><Link2 size={13} /> Relink</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
