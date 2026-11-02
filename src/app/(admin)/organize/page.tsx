"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Tags, FolderPlus, Pencil, Trash2, Plus, ListVideo, Film, KeyRound, X, Sparkles } from "lucide-react";
import { Button, Card, Badge, Modal, Field, inputCls, useToast, useConfirm, Spinner, PageHeader, EmptyState, cx } from "@/components/ui";
import { ShareDialog } from "@/components/share-dialog";
import { api } from "@/lib/client";
import { fmtDur } from "@/lib/util";

type Tax = {
  categories: { id: number; name: string; parentId: number | null; n: number }[];
  tags: { id: number; name: string; n: number }[];
  collections: { id: number; name: string; description: string | null; kind: string; n: number }[];
};
const STARTERS = ["Amateur", "Couples", "Solo", "Roleplay", "BDSM", "Fetish", "Romance", "Educational", "Compilation", "Other"];

function OrganizeInner() {
  const sp = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"categories" | "tags" | "collections">(sp.get("tab") === "collections" ? "collections" : "categories");
  const [tax, setTax] = useState<Tax | null>(null);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [kind, setKind] = useState("collection");
  const [desc, setDesc] = useState("");
  const [edit, setEdit] = useState<{ type: string; id: number; name: string; description?: string } | null>(null);
  const [members, setMembers] = useState<{ colId: number; items: { id: number; title: string; durationSec: number | null }[] } | null>(null);
  const [shareCol, setShareCol] = useState<{ ids: number[]; titles: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api<Tax>("/vault/api/taxonomy").then(setTax).catch((e) => toast(e.message, "err")); }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sp.get("tab") === "collections") setTab("collections"); }, [sp]);

  const create = async () => {
    if (!name.trim()) return toast("Enter a name.", "err");
    try {
      if (tab === "categories") await api("/vault/api/taxonomy", { body: { type: "category", name, parentId: parent ? Number(parent) : null } });
      else if (tab === "tags") await api("/vault/api/taxonomy", { body: { type: "tag", name } });
      else await api("/vault/api/taxonomy", { body: { type: "collection", name, kind, description: desc || null } });
      setName(""); setDesc(""); setParent("");
      toast("Created."); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const addStarters = async () => {
    setBusy(true);
    let added = 0;
    for (const s of STARTERS) {
      if (!tax?.categories.some((c) => c.name === s && !c.parentId)) {
        try { await api("/vault/api/taxonomy", { body: { type: "category", name: s } }); added++; } catch { /* exists */ }
      }
    }
    toast(added ? `Added ${added} starter categories — rename or delete them freely.` : "Starter categories already exist.", "info");
    load(); setBusy(false);
  };

  const saveEdit = async () => {
    if (!edit) return;
    try {
      await api("/vault/api/taxonomy", { method: "PATCH", body: { type: edit.type, id: edit.id, name: edit.name, description: edit.description } });
      toast("Renamed."); setEdit(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const remove = async (type: string, id: number, label: string, n: number) => {
    const ok = await confirm({
      title: `Delete ${type} “${label}”?`,
      message: type === "category"
        ? <>{n} video(s) will become <strong>Uncategorized</strong> and subcategories move to top level. Videos and files are not deleted.</>
        : type === "tag"
          ? <>The tag is removed from {n} video(s). Videos and files are not deleted.</>
          : <>The {type} is removed; its {n} member video(s) remain in the library. Files are not deleted.</>,
      confirmLabel: "Delete", danger: true,
    });
    if (!ok) return;
    try { await api("/vault/api/taxonomy", { method: "DELETE", body: { type, id } }); toast("Deleted."); setMembers(null); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const openMembers = async (colId: number) => {
    if (members?.colId === colId) return setMembers(null);
    try {
      const r = await api<{ items: { id: number; title: string; durationSec: number | null; missing: boolean }[] }>(`/vault/api/videos?collectionId=${colId}&pageSize=100&sort=title&dir=asc`);
      setMembers({ colId, items: r.items });
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const removeMember = async (colId: number, videoId: number) => {
    try {
      await api("/vault/api/taxonomy", { body: { type: "collection-remove", collectionId: colId, videoIds: [videoId] } });
      toast("Removed from collection (record kept).");
      setMembers(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const shareCollection = async (colId: number) => {
    try {
      const r = await api<{ items: { id: number; title: string; missing: boolean }[] }>(`/vault/api/videos?collectionId=${colId}&pageSize=50&missing=0`);
      if (!r.items.length) return toast("No available videos in this collection to share.", "err");
      setShareCol({ ids: r.items.map((x) => x.id), titles: r.items.map((x) => x.title) });
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  if (!tax) return <Spinner />;
  const tabBtn = (t: typeof tab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(t)} className={cx("flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors", tab === t ? "bg-amber/15 text-amber" : "text-mut hover:text-ink")}>{icon} {label}</button>
  );

  return (
    <>
      <PageHeader title="Organize" sub="Custom categories, subcategories, tags, collections and playlists — all editable, all persisted." />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabBtn("categories", `Categories (${tax.categories.length})`, <Tags size={14} />)}
        {tabBtn("tags", `Tags (${tax.tags.length})`, <Sparkles size={14} />)}
        {tabBtn("collections", `Collections (${tax.collections.length})`, <ListVideo size={14} />)}
      </div>

      <Card className="rise mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={tab === "categories" ? "New category / subcategory" : tab === "tags" ? "New tag" : "New collection / playlist"}>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
              placeholder={tab === "tags" ? "e.g. slow burn" : "Name…"} className={inputCls + " !w-56"} />
          </Field>
          {tab === "categories" && (
            <>
              <Field label="Parent (optional)">
                <select value={parent} onChange={(e) => setParent(e.target.value)} className={inputCls + " !w-44"}>
                  <option value="">Top level</option>
                  {tax.categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Button variant="outline" busy={busy} onClick={addStarters} title="Add the optional example categories"><FolderPlus size={14} /> Starter set</Button>
            </>
          )}
          {tab === "collections" && (
            <>
              <Field label="Type">
                <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls + " !w-36"}>
                  <option value="collection">Collection</option><option value="playlist">Playlist</option>
                </select>
              </Field>
              <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls + " !w-64"} /></Field>
            </>
          )}
          <Button onClick={create}><Plus size={14} /> Create</Button>
        </div>
      </Card>

      {tab === "categories" && (
        <Card className="rise divide-y divide-line/60">
          {tax.categories.length === 0 && <div className="p-4"><EmptyState icon={Tags} title="No categories yet" body="Create your own, or add the optional starter set above. They are examples, not mandatory classifications." /></div>}
          {tax.categories.filter((c) => !c.parentId).map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-2 px-4 py-2.5">
                <span className="text-sm font-bold">{c.name}</span>
                <Badge tone="mut">{c.n} videos</Badge>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ type: "category", id: c.id, name: c.name })}><Pencil size={12} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove("category", c.id, c.name, c.n)}><Trash2 size={12} className="text-err" /></Button>
                </span>
              </div>
              {tax.categories.filter((k) => k.parentId === c.id).map((k) => (
                <div key={k.id} className="flex items-center gap-2 border-t border-line/40 bg-raised/40 py-2 pl-10 pr-4">
                  <span className="text-xs font-semibold text-mut">└ {k.name}</span>
                  <Badge tone="mut">{k.n}</Badge>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ type: "category", id: k.id, name: k.name })}><Pencil size={11} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove("category", k.id, k.name, k.n)}><Trash2 size={11} className="text-err" /></Button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      {tab === "tags" && (
        <Card className="rise p-4">
          {tax.tags.length === 0 ? <EmptyState icon={Sparkles} title="No tags yet" body="Tags are free-form keywords. Add them here or straight from any video form." /> : (
            <div className="flex flex-wrap gap-2">
              {tax.tags.map((t) => (
                <span key={t.id} className="group flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-semibold transition-colors hover:border-rose/40">
                  <Link href={`/library?tagIds=${t.id}`} className="hover:text-rose">#{t.name}</Link>
                  <span className="text-mut">{t.n}</span>
                  <button onClick={() => setEdit({ type: "tag", id: t.id, name: t.name })} aria-label={`Rename ${t.name}`} className="text-mut hover:text-amber"><Pencil size={11} /></button>
                  <button onClick={() => remove("tag", t.id, t.name, t.n)} aria-label={`Delete ${t.name}`} className="text-mut hover:text-err"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "collections" && (
        <div className="grid gap-4 md:grid-cols-2">
          {tax.collections.length === 0 && <div className="md:col-span-2"><EmptyState icon={ListVideo} title="No collections yet" body="Collections and playlists reference videos without duplicating inventory records. Add videos from the Library's bulk bar or any video form." /></div>}
          {tax.collections.map((c) => (
            <Card key={c.id} className="rise p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 font-display text-base font-bold">
                    {c.kind === "playlist" ? <ListVideo size={15} className="text-amber" /> : <Film size={15} className="text-rose" />} {c.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-mut">{c.description ?? (c.kind === "playlist" ? "Playlist" : "Collection")} · {c.n} video(s)</p>
                </div>
                <Badge tone={c.kind === "playlist" ? "amber" : "rose"}>{c.kind}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href={`/library?collectionId=${c.id}`}><Button size="sm" variant="outline">View videos</Button></Link>
                <Button size="sm" variant="outline" onClick={() => openMembers(c.id)}>{members?.colId === c.id ? "Hide members" : "Members"}</Button>
                <Button size="sm" variant="outline" onClick={() => shareCollection(c.id)}><KeyRound size={12} /> Share all</Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ type: "collection", id: c.id, name: c.name, description: c.description ?? "" })}><Pencil size={12} /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove("collection", c.id, c.name, c.n)}><Trash2 size={12} className="text-err" /></Button>
              </div>
              {members?.colId === c.id && (
                <ul className="rise mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  {members.items.length === 0 && <li className="text-mut">Empty — add videos via the Library bulk bar.</li>}
                  {members.items.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Link href={`/videos/${m.id}`} className="truncate font-semibold hover:text-amber">{m.title}</Link>
                      <span className="font-mono text-mut">{fmtDur(m.durationSec)}</span>
                      <button className="ml-auto text-mut hover:text-err" onClick={() => removeMember(c.id, m.id)} aria-label={`Remove ${m.title} from collection`}><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Rename ${edit?.type ?? ""}`}>
        <Field label="Name"><input value={edit?.name ?? ""} onChange={(e) => setEdit(edit ? { ...edit, name: e.target.value } : null)} className={inputCls} /></Field>
        {edit?.type === "collection" && (
          <div className="mt-3"><Field label="Description"><input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className={inputCls} /></Field></div>
        )}
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={saveEdit}>Save</Button></div>
      </Modal>

      {shareCol && <ShareDialog open onClose={() => setShareCol(null)} videoIds={shareCol.ids} titles={shareCol.titles.slice(0, 3).concat(shareCol.titles.length > 3 ? [`+${shareCol.titles.length - 3} more`] : [])} />}
    </>
  );
}

export default function OrganizePage() {
  return <Suspense fallback={<Spinner />}><OrganizeInner /></Suspense>;
}
