"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CopyCheck, ShieldQuestion, Fingerprint, Trash2, RefreshCw, FileWarning } from "lucide-react";
import { Button, Card, Badge, Spinner, EmptyState, PageHeader, useToast, useConfirm } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtBytes, fmtDur, fmtDate } from "@/lib/util";

type V = { id: number; title: string; filePath: string; sizeBytes: number; durationSec: number | null; hash: string | null; missing: boolean; dateAdded: string };
type Group = { key: string; method: string; certainty: string; label: string; videos: V[] };

export default function DuplicatesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ groups: Group[] }>("/vault/api/integrity?mode=duplicates").then((r) => setGroups(r.groups)).catch((e) => toast(e.message, "err"));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const removeRecord = async (v: V) => {
    const ok = await confirm({
      title: `Remove record “${v.title}”?`,
      message: <>Deletes only the <strong>inventory record #{v.id}</strong>. The file on disk is <strong>never deleted</strong> — suspected duplicates are always yours to review manually.</>,
      confirmLabel: "Remove record", danger: true,
    });
    if (!ok) return;
    try { await api(`/vault/api/videos/${v.id}`, { method: "DELETE" }); toast("Record removed. File untouched."); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const hashGroup = async (g: Group) => {
    setBusy(true);
    try {
      for (const v of g.videos) {
        if (!v.missing) await api(`/vault/api/videos/${v.id}`, { method: "PATCH", body: { action: "probe", rehash: true } });
      }
      toast("SHA-256 hashes computed — groups re-evaluated.");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  if (!groups) return <Spinner label="Comparing paths, names, sizes, durations and hashes…" />;

  return (
    <>
      <PageHeader title="Duplicate Review" sub="Three detection tiers: identical SHA-256 content · same name & size · similar size & duration. Nothing is ever auto-deleted." />
      <Card className="rise mb-5 flex items-start gap-3 p-4 text-xs leading-relaxed text-mut">
        <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-amber" />
        <span><strong className="text-ink">How to read this:</strong> a SHA-256 match proves byte-identical files. Same name + size is very likely the same file. Same size + duration only means <em>similar</em> — not proven identical. Removing a record here never touches the underlying file; delete files yourself in your OS file manager if you choose.</span>
      </Card>

      {groups.length === 0 ? (
        <EmptyState icon={CopyCheck} title="No duplicates detected" body="No records share a path, name+size, size+duration, or content hash. Enable “SHA-256 hashes” during import for content-level certainty." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card key={g.key} className="rise overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-raised/50 px-4 py-3">
                <Fingerprint size={15} className={g.certainty === "identical" ? "text-err" : g.certainty === "very likely" ? "text-warn" : "text-mut"} />
                <span className="text-sm font-bold">{g.label}</span>
                <Badge tone={g.certainty === "identical" ? "err" : g.certainty === "very likely" ? "warn" : "mut"}>{g.certainty}</Badge>
                <span className="ml-auto flex gap-2">
                  {g.method !== "hash" && <Button size="sm" variant="outline" busy={busy} onClick={() => hashGroup(g)}><Fingerprint size={12} /> Prove with SHA-256</Button>}
                  <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={12} /></Button>
                </span>
              </div>
              <div className="divide-y divide-line/50">
                {g.videos.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <Link href={`/videos/${v.id}`} className="font-bold hover:text-amber">{v.title}</Link>
                      <p className="truncate font-mono text-[10px] text-mut">{v.filePath}</p>
                    </div>
                    <span className="tabular-nums">{fmtBytes(v.sizeBytes)}</span>
                    <span className="font-mono">{fmtDur(v.durationSec)}</span>
                    <span className="text-mut">added {fmtDate(v.dateAdded)}</span>
                    {v.hash && <span className="font-mono text-[10px] text-mut">sha:{v.hash.slice(0, 10)}…</span>}
                    {v.missing && <Badge tone="err"><FileWarning size={10} /> missing</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => removeRecord(v)} title="Remove this inventory record (file kept)"><Trash2 size={12} className="text-err" /></Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
