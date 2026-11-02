"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Ban, History, RefreshCw, ShieldAlert, ExternalLink, Trash } from "lucide-react";
import { Button, Card, Badge, Spinner, EmptyState, PageHeader, Modal, useToast, useConfirm } from "@/components/ui";
import { ShareDialog } from "@/components/share-dialog";
import { api } from "@/lib/client";
import { fmtDateTime, fmtDur, timeAgo } from "@/lib/util";

type Share = {
  id: string; videoIds: number[]; createdAt: number; expiresAt: number; singleUse: boolean;
  maxRedemptions: number; redemptionCount: number; firstRedeemedAt: number | null; lastActivityAt: number | null;
  revokedAt: number | null; allowPause: boolean; allowSeek: boolean; allowSpeed: boolean; disableDownload: boolean;
  maxViewMinutes: number | null; status: "active" | "redeemed" | "expired" | "revoked" | "locked";
  videos: { id: number; title: string; durationSec: number | null; missing: boolean }[];
};
type AuditRow = { id: number; ts: string; event: string; detail: Record<string, unknown> | null };

const tone = (s: Share["status"]) => s === "active" ? "ok" : s === "redeemed" ? "amber" : s === "revoked" ? "err" : s === "locked" ? "warn" : "mut";

export default function SharesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [audit, setAudit] = useState<{ id: string; rows: AuditRow[] } | null>(null);
  const [regen, setRegen] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ shares: Share[] }>("/vault/api/shares").then((r) => setShares(r.shares)).catch((e) => toast(e.message, "err"));
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const revoke = async (sh: Share) => {
    const ok = await confirm({
      title: "Revoke this code now?",
      message: "Any active viewing session for this code loses access on its very next media request. This cannot be undone — generate a replacement code if needed.",
      confirmLabel: "Revoke access", danger: true,
    });
    if (!ok) return;
    try { await api("/vault/api/shares", { method: "PATCH", body: { id: sh.id, action: "revoke" } }); toast("Revoked. Subsequent playback requests are rejected."); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const showAudit = async (id: string) => {
    try {
      const r = await api<{ audit: AuditRow[] }>(`/vault/api/shares?auditFor=${id}`);
      setAudit({ id, rows: r.audit });
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
  };

  const purge = async () => {
    setBusy(true);
    try {
      const r = await api<{ purged: number }>("/vault/api/shares", { body: { action: "purge" } });
      toast(`Retention cleanup: ${r.purged} expired record(s) purged. Audit events remain.`);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "err"); }
    setBusy(false);
  };

  if (!shares) return <Spinner label="Reading local share storage…" />;

  return (
    <>
      <PageHeader title="OTP Sharing" sub="One-time codes stored locally as SHA-256 verifiers in data/shares.json — atomic redemption, rate-limited, audited."
        actions={
          <>
            <Button variant="outline" size="sm" busy={busy} onClick={purge}><Trash size={13} /> Purge expired</Button>
            <a href="/vault/access" target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink size={13} /> Recipient page</Button></a>
          </>
        } />

      <Card className="rise mb-5 flex items-start gap-3 p-4 text-xs leading-relaxed text-mut">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>Codes are shown <strong className="text-ink">once at creation</strong> and never appear here, in logs, or in backups — only verifiers. A single-use code is consumed when a viewing session is <em>established</em>, not when the page is opened. Playback is re-authorized on every request; revocation is immediate. Download-hiding is a deterrent, not DRM. Use HTTPS beyond localhost.</span>
      </Card>

      {shares.length === 0 ? (
        <EmptyState icon={KeyRound} title="No share sessions yet" body="Open any video and choose “Share video” to generate a one-time access code for an authorized recipient."
          action={<Link href="/library"><Button>Go to library</Button></Link>} />
      ) : (
        <Card className="rise overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mut">
                <th className="px-3 py-2.5">Shared video(s)</th><th className="px-2 py-2.5">Created</th><th className="px-2 py-2.5">Expires</th>
                <th className="px-2 py-2.5">Status</th><th className="px-2 py-2.5">Redeemed</th><th className="px-2 py-2.5">Last activity</th>
                <th className="px-2 py-2.5">Restrictions</th><th className="px-2 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((sh) => (
                <tr key={sh.id} className="border-b border-line/50 align-top last:border-0 hover:bg-amber/4">
                  <td className="max-w-[240px] px-3 py-3">
                    {sh.videos.map((v) => (
                      <p key={v.id} className="truncate">
                        <Link href={`/videos/${v.id}`} className="font-bold hover:text-amber">{v.title}</Link>
                        <span className="ml-1.5 font-mono text-[10px] text-mut">{fmtDur(v.durationSec)}</span>
                      </p>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-mut">{fmtDateTime(new Date(sh.createdAt))}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-mut">{fmtDateTime(new Date(sh.expiresAt))}</td>
                  <td className="px-2 py-3">
                    <Badge tone={tone(sh.status)}>{sh.status}</Badge>
                    <p className="mt-1 text-[10px] text-mut">{sh.redemptionCount}/{sh.maxRedemptions} use{sh.maxRedemptions > 1 ? "s" : ""}{sh.singleUse ? " · single" : ""}</p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-mut">{sh.firstRedeemedAt ? timeAgo(new Date(sh.firstRedeemedAt)) : "not yet"}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-mut">{sh.lastActivityAt ? timeAgo(new Date(sh.lastActivityAt)) : "—"}</td>
                  <td className="px-2 py-3">
                    <div className="flex max-w-[160px] flex-wrap gap-1">
                      {!sh.allowSeek && <Badge tone="mut">no seek</Badge>}
                      {!sh.allowPause && <Badge tone="mut">no pause</Badge>}
                      {!sh.allowSpeed && <Badge tone="mut">1× only</Badge>}
                      {sh.disableDownload && <Badge tone="mut">no dl button</Badge>}
                      {sh.maxViewMinutes && <Badge tone="mut">{sh.maxViewMinutes} min cap</Badge>}
                      {sh.allowSeek && sh.allowPause && sh.allowSpeed && !sh.disableDownload && !sh.maxViewMinutes && <span className="text-mut">none</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Audit history" onClick={() => showAudit(sh.id)}><History size={13} /></Button>
                      <Button size="sm" variant="ghost" title="Generate replacement code" onClick={() => setRegen(sh)}><RefreshCw size={13} /></Button>
                      {sh.status !== "revoked" && <Button size="sm" variant="ghost" title="Revoke now" onClick={() => revoke(sh)}><Ban size={13} className="text-err" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!audit} onClose={() => setAudit(null)} title="Share audit trail">
        <p className="mb-3 text-[11px] text-mut">Creation, redemption, denial and revocation events — the secret code is never recorded.</p>
        {audit?.rows.length === 0 && <p className="text-sm text-mut">No events recorded yet.</p>}
        <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
          {audit?.rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-md bg-raised/60 px-3 py-2">
              <span className="font-mono font-semibold">{a.event}</span>
              <span className="text-mut">{fmtDateTime(a.ts)}</span>
            </li>
          ))}
        </ul>
      </Modal>

      {regen && (
        <ShareDialog open onClose={() => { setRegen(null); load(); }}
          videoIds={regen.videos.filter((v) => !v.missing).map((v) => v.id)}
          titles={regen.videos.map((v) => v.title)} />
      )}
    </>
  );
}
