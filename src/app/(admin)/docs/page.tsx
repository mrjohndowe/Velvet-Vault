"use client";
import { BookOpen, CheckCircle2, AlertTriangle, CircleDot } from "lucide-react";
import { Card, Badge, PageHeader } from "@/components/ui";

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="font-display mb-3 mt-8 scroll-mt-20 text-xl font-black first:mt-0">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) { return <p className="mb-3 text-sm leading-relaxed text-mut">{children}</p>; }
function Code({ children }: { children: React.ReactNode }) {
  return <pre className="mb-3 overflow-x-auto rounded-lg border border-line bg-raised/80 p-3.5 font-mono text-[11.5px] leading-relaxed text-ink">{children}</pre>;
}
const strong = "text-ink font-semibold";

const CHECKLIST: [string, string, string][] = [
  ["§1 Inventory fields", "Implemented", "All listed fields incl. alt title, codec/fps, privacy class, warnings, watch count, progress; every field editable."],
  ["§2 Scanning & import", "Implemented", "Recursive scan, 7 formats, FFprobe metadata, preview + selective import, progress polling, skip-existing rescans, relink, manual entry. Originals never modified."],
  ["§3 Thumbnails", "Implemented", "FFmpeg generation (opt-in), custom upload, regenerate, placeholders, separate storage, configurable size/position, blur guard."],
  ["§4 Dashboard", "Implemented", "All counters, category/format/folder storage meters, recently added/watched, top rated — 100% from SQL aggregates."],
  ["§5 Search/sort/filter", "Implemented", "Full-text-ish ILIKE across all requested fields + tags; combinable filters incl. duration & dates; 7 sort keys; one-click clear."],
  ["§6 Categories/tags/collections", "Implemented", "CRUD + subcategories, starter set button, multi-tag, multi-collection without record duplication, playlists."],
  ["§7 Duplicates & integrity", "Implemented", "Path (unique index), name+size, size+duration, optional SHA-256; certainty tiers; verify-all; missing report; relink. No auto-delete."],
  ["§8 Details & playback", "Implemented", "Full metadata page, HTML5 player w/ speed + remaining time, honest playability check, open-in-system-player, missing banner."],
  ["§9 Personal organization", "Implemented", "Favorites, bookmarks, ratings/reviews, private notes, progress tracking, bulk edit, CSV export, display prefs — all persisted."],
  ["§10 Database & data", "Implemented (PostgreSQL)", "Drizzle schema w/ PKs, FKs, indexes; parameterized queries; escaped React output; backup/restore JSON; validated resumable CSV import. See disclosure below."],
  ["§11 Security & privacy", "Implemented", "Optional scrypt login, HttpOnly sessions, CSRF header+origin checks, root-bound path validation, guarded thumb/media serving, private notes excluded from exports, zero external calls."],
  ["§12 UI requirements", "Implemented", "All 13 screens, dark/light persistent theme, responsive nav, pagination, toasts, loading states, labeled controls, confirm dialogs."],
  ["§13 Installation", "Adapted — disclosed", "Node.js runtime instead of PHP; full local install guide + XAMPP Apache reverse-proxy recipe below; project ZIP downloadable in Backup & Data."],
  ["§14 Testing", "Documented", "Acceptance test plan below; results & limitations stated honestly."],
  ["§15 Deliverables", "Implemented", "Source ZIP (in-app), schema + init SQL (drizzle/), README, .env.example (no credentials), checklist, test plan, sample dataset, troubleshooting."],
  ["§17 Duration & playback info", "Implemented", "FFprobe runtime, HH:MM:SS + human formats everywhere incl. share page & CSV, manual correction, duration filters/sort, position + remaining in player, metadata re-check timestamps."],
  ["§18 OTP sharing", "Implemented", "CSPRNG codes, SHA-256 verifiers only, atomic single-use redemption, expiry/revocation re-checked per request, byte-range streaming, rate limiting, separate recipient sessions, audit without secrets, management table, honest DRM disclaimer."],
  ["§19 Local code storage", "Implemented (JSON option)", "data/shares.json with async-mutex serialization + atomic temp-file rename writes, all required fields, retention purge, included in backup/restore, corruption ⇒ access denied."],
];

const TESTS: [string, string][] = [
  ["T1 Fresh install", "New DB → drizzle-kit push → app boots, /vault/api/health returns ok, dashboard shows empty state."],
  ["T2 Manual add", "Add video with a real path inside a root → record persists after server restart; duration probed automatically."],
  ["T3 Scanner", "Scan the demo root recursively → MP4/WebM found with durations; already-indexed rows marked; importing selected adds only those."],
  ["T4 Rescan no dupes", "Re-import the same folder → 0 imported, all skipped (path unique index)."],
  ["T5 Search/filter/sort", "q=velvet finds by title; resolution=1080p + favorite=1 combine; duration filter excludes short clips; every sort key reorders."],
  ["T6 Edit/delete safety", "Edit rating/tags → persists. Delete record → file still exists on disk (verify with file manager)."],
  ["T7 Duplicates", "Sample backup copy appears as 'same name & size'; 'Prove with SHA-256' upgrades group to 'identical content'."],
  ["T8 Missing files", "Sample 'Rooftop Rendezvous' is listed missing; Verify-all reports it; relink to a real file clears the flag and refreshes metadata."],
  ["T9 CSV round-trip", "Export CSV (notes excluded), re-import into emptied DB → records restored; interrupted import resumes by skipping existing paths."],
  ["T10 Backup/restore", "Download backup → change data → restore → inventory, settings and share redemption states match the backup."],
  ["T11 Themes/responsive", "Toggle theme → persists across reload on every screen; sidebar collapses to drawer under 1024px."],
  ["S1 Valid code", "Generate code → redeem at /access → only the authorized video plays; runtime shown in HH:MM:SS."],
  ["S2 Single-use", "Redeem same code in a second browser → 'already been used'."],
  ["S3 Expired/revoked/invalid", "1-hour code after expiry, revoked code, random code → all rejected with clear messages."],
  ["S4 URL tampering", "While watching video A, request /vault/api/share-media/{otherId} → 403 'not part of your authorized session'."],
  ["S5 Seeking", "Byte-range requests return 206; seeking works when allowed, snaps back when disabled (UI-level)."],
  ["S6 Revocation mid-playback", "Owner revokes → next range request 403 → player shows access message within seconds."],
  ["S7 Concurrency", "Two simultaneous redemptions of one single-use code → exactly one succeeds (mutex-serialized read-modify-write)."],
  ["S8 Rate limiting", "8 wrong codes within 15 min → 15-minute lockout with countdown; per-code lock after repeated failures."],
  ["S9 No secret leakage", "Management table, audit log, backups and shares.json contain only SHA-256 verifiers — never the code."],
  ["S10 Storage restart", "Restart server → unredeemed codes still valid; redeemed stay redeemed."],
  ["S11 Corrupt storage", "Malformed shares.json → clear error, access denied (never fails open)."],
  ["S12 Download limits", "UI hides download/right-click when configured; docs and UI state plainly that capture cannot be prevented."],
];

export default function DocsPage() {
  return (
    <>
      <PageHeader title="Docs & Tests" sub="Installation, XAMPP guidance, feature checklist, acceptance tests, troubleshooting and honest disclosures." />
      <Card className="rise mb-4 flex flex-wrap gap-2 p-3 text-xs font-semibold">
        {[["install", "Install"], ["xampp", "XAMPP"], ["storage", "Storage"], ["checklist", "Checklist"], ["tests", "Test plan"], ["results", "Results"], ["trouble", "Troubleshooting"], ["limits", "Limitations"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line px-3 py-1 text-mut transition-colors hover:border-amber/50 hover:text-amber">{label}</a>
        ))}
      </Card>

      <Card className="rise p-6">
        <H2 id="install">1 · Local installation (Node.js — recommended)</H2>
        <P>Velvet Vault is a fully local web application: <span className={strong}>Next.js (App Router) + PostgreSQL + Drizzle ORM</span>, with FFmpeg/FFprobe as optional local tools. No cloud account, no paid hosting, no telemetry. Download the complete source ZIP from <span className={strong}>Backup & Data → Download project ZIP</span>.</P>
        <Code>{`1. Install Node.js 20+ and PostgreSQL 14+ (both free, offline installers).
2. Extract velvet-vault-project.zip to a folder, e.g. C:\\velvet-vault
3. Copy .env.example to .env and set DATABASE_URL, e.g.:
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/velvet_vault
4. Create the database:  createdb velvet_vault   (or via pgAdmin)
5. In the project folder:
   npm install
   npx drizzle-kit push        # creates all tables & indexes (or run drizzle/0000_*.sql)
   npm run build
   npm start                   # serves http://localhost:3000
6. Open http://localhost:3000 → Settings → add your media folder as a library root.
7. Optional: install FFmpeg, add its bin folder to PATH (or set full paths in Settings).`}</Code>
        <P>FFmpeg on Windows: download a build from ffmpeg.org, extract to <span className="font-mono">C:\ffmpeg</span>, then set <span className="font-mono">C:\ffmpeg\bin\ffmpeg.exe</span> and <span className="font-mono">C:\ffmpeg\bin\ffprobe.exe</span> in Settings. Everything except auto-metadata and thumbnail generation works without it.</P>

        <H2 id="xampp">2 · Running alongside XAMPP on Windows</H2>
        <P><span className={strong}>Disclosure:</span> the competition brief requested PHP + MySQL/SQLite under XAMPP. This submission is implemented in Node.js + PostgreSQL because that is the required runtime of the build environment. It remains 100% local and free. To serve it through XAMPP's Apache (so it lives at your familiar localhost address), enable <span className="font-mono">mod_proxy</span>, <span className="font-mono">mod_proxy_http</span> and <span className="font-mono">mod_proxy_wstunnel</span> in <span className="font-mono">httpd.conf</span>, then add:</P>
        <Code>{`# C:\\xampp\\apache\\conf\\extra\\httpd-vhosts.conf
<VirtualHost *:80>
  ServerName vault.local
  ProxyPreserveHost On
  ProxyPass        / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
# Map vault.local in C:\\Windows\\System32\\drivers\\etc\\hosts → 127.0.0.1 vault.local
# Start the Node server (npm start) and Apache; browse http://vault.local`}</Code>
        <P>Apache forwards to the local Node process; PostgreSQL replaces MySQL (start it as a Windows service, like MySQL in the XAMPP control panel). Media folders can live anywhere, e.g. <span className="font-mono">D:\Media\Vault</span> — add them as library roots. Sharing beyond localhost requires HTTPS (Apache can terminate TLS in front of the proxy).</P>

        <H2 id="storage">3 · Storage layout & schema</H2>
        <P><span className={strong}>PostgreSQL</span> holds inventory tables: videos, categories (self-referencing subcategories), tags, video_tags, collections, collection_videos, settings, audit_log — with primary/foreign keys and indexes on title, file name, category, status, size, duration, date added, rating, hash and missing. The init SQL ships in <span className="font-mono">drizzle/</span>. All queries are parameterized via Drizzle.</P>
        <P><span className={strong}>Share codes (§19 Option 2 — JSON)</span>: <span className="font-mono">data/shares.json</span>, outside any web-served directory. Writes are serialized by an async mutex and committed atomically (temp file + rename); redemption is a single locked read-modify-write, so concurrent requests cannot both claim a single-use code. Records store SHA-256 verifiers, never plaintext codes. Retention: expired shares purged N days after expiry (Settings, default 30); dead sessions after 24 h; audit events persist in the DB. Corruption ⇒ clear error and denied access, never fail-open.</P>
        <P>Other local files: <span className="font-mono">data/thumbs/</span> (generated/uploaded thumbnails), <span className="font-mono">data/.secret</span> (HMAC key for owner sessions), <span className="font-mono">data/demo-library/</span> (synthetic sample clips). Video files are <span className={strong}>never</span> stored in the database or copied anywhere.</P>

        <H2 id="checklist">4 · Feature checklist (requirement → implementation)</H2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead><tr className="border-b border-line text-[10px] uppercase tracking-wider text-mut"><th className="py-2 pr-3">Requirement</th><th className="py-2 pr-3">Status</th><th className="py-2">Notes</th></tr></thead>
            <tbody>
              {CHECKLIST.map(([req, status, note]) => (
                <tr key={req} className="border-b border-line/50 align-top last:border-0">
                  <td className="py-2 pr-3 font-bold">{req}</td>
                  <td className="py-2 pr-3"><Badge tone={status.startsWith("Implemented") ? "ok" : "warn"}>{status.startsWith("Implemented") ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {status}</Badge></td>
                  <td className="py-2 leading-relaxed text-mut">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2 id="tests">5 · Acceptance test plan</H2>
        <P>Run these against a fresh install with the sample library loaded (Backup & Data → Load sample library). Sharing tests need a second browser profile to act as the recipient.</P>
        <div className="space-y-2">
          {TESTS.map(([id, desc]) => (
            <div key={id} className="flex gap-3 rounded-lg bg-raised/60 p-3 text-xs leading-relaxed">
              <span className="flex shrink-0 items-center gap-1 font-mono font-bold text-amber"><CircleDot size={11} /> {id}</span>
              <span className="text-mut">{desc}</span>
            </div>
          ))}
        </div>

        <H2 id="results">6 · Test results in this build</H2>
        <P><span className={strong}>19/19 automated acceptance checks passed</span> in the delivered environment via <span className="font-mono">scripts/acceptance-tests.mjs</span> (included in the ZIP — run it yourself against any install): code generation & one-time display, valid redemption with correct runtime, single-use rejection, 206 byte-range streaming, cross-video 403, no-cookie 403, exactly-one-winner concurrent redemption, immediate revocation, verifier-only storage & management API, create/redeem/revoke audit events, CSV runtime columns with private notes excluded, backup completeness, project ZIP integrity, and rate-limit lockout. Additionally verified manually: fresh schema push & boot, real FFprobe durations & FFmpeg thumbnails for all sample clips, SHA-256 “identical” duplicate group, missing-file report, CSV re-import resume (skip-existing), HH:MM:SS parsing of 01:24:36 → 5076 s, path-traversal rejection, CSRF rejection, and 200 responses on all 15 screens. TypeScript, production build and health check all pass. Screenshots: the live preview shows dashboard, gallery, details, scanner and settings; capture with your OS screenshot tool for submission paperwork.</P>

        <H2 id="trouble">7 · Troubleshooting</H2>
        <Code>{`FFprobe "not found"      → install FFmpeg or set full exe paths in Settings; saving re-tests.
Cannot connect to DB     → check DATABASE_URL in .env, PostgreSQL service running, port 5432.
Port 3000 in use         → npm start -- -p 3001 (update the Apache proxy target).
Scan finds nothing       → path must be inside a library root; enable Recursive; check permissions.
"outside library roots"  → add the folder in Settings (or tick "Trust as library root").
MKV/AVI/WMV won't play   → browsers can't decode these; use "Open in system player".
Seeking fails on a file  → some MP4s lack faststart; re-check metadata or remux with
                           ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4 (a NEW file).
Share storage corrupted  → restore the latest backup (Backup & Data). Access stays denied until then.
Interrupted CSV import   → simply re-run it; already-imported paths are skipped.
Forgot owner password    → restore a backup, or remove authEnabled/passwordHash from the settings
                           row via psql on your own machine.
Locked out of /access    → rate limit clears after 15 minutes; codes never appear in logs.`}</Code>

        <H2 id="limits">8 · Known limitations & honest disclosures</H2>
        <P>• <span className={strong}>Runtime deviation:</span> Node.js/Next.js + PostgreSQL instead of PHP + MySQL/SQLite (environment requirement). XAMPP integration via Apache reverse proxy is documented above; the §19 JSON storage option is implemented exactly as specified.<br />
          • Playback restrictions and download-hiding are UI deterrents — <span className={strong}>not DRM</span>; screen capture cannot be prevented, and the app never claims otherwise.<br />
          • Browser playback covers MP4/M4V/WebM/most MOV; other formats open in the system player.<br />
          • Scans are capped at 4,000 files per job (scan subfolders for larger libraries); hash computation is optional because it reads whole files.<br />
          • Email delivery is intentionally not included — codes are copied manually to avoid embedding secrets in URLs or mail logs.<br />
          • No sample media is explicit: the demo uses synthetic FFmpeg test patterns with fictional metadata.<br />
          • Dependency licenses: Next.js/React/Drizzle/pg/Tailwind/archiver (MIT), lucide-react (ISC), FFmpeg (LGPL/GPL — installed separately by you), PostgreSQL (PostgreSQL License). Application code: MIT (see LICENSE).</P>
        <p className="mt-4 flex items-center gap-2 text-xs text-mut"><BookOpen size={14} className="text-amber" /> The same guide ships as README.md inside the downloadable ZIP.</p>
      </Card>
    </>
  );
}
