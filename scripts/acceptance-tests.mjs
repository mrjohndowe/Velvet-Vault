/**
 * Velvet Vault acceptance tests (run against a live server):
 *   node scripts/acceptance-tests.mjs            # default http://127.0.0.1:3000
 *   TEST_BASE_URL=http://localhost:3000 node scripts/acceptance-tests.mjs
 * Requires the sample library to be loaded (Backup & Data → Load sample library).
 * NOTE: the final rate-limit test locks the test IP for 15 minutes by design.
 */
import fs from "fs";
import path from "path";

const B = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const H = { "content-type": "application/json", "x-vault": "1" };
const results = [];
const log = (name, pass, extra = "") => { results.push([name, pass]); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function j(p, opts = {}) { const r = await fetch(B + p, opts); return { status: r.status, data: await r.json().catch(() => ({})), headers: r.headers }; }
const cookieOf = (r) => (r.headers.get("set-cookie") ?? "").split(";")[0];

// S1 create + redeem
const created = await j("/vault/api/shares", { method: "POST", headers: H, body: JSON.stringify({ videoIds: [1], singleUse: true, allowSeek: true, expiresInHours: 2 }) });
const CODE1 = created.data.code;
log("create share returns code once", created.status === 200 && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(CODE1 ?? ""));
const share1 = created.data.share?.id;
log("share record exposes no verifier", created.data.share?.codeHash === undefined);

const redeemA = await j("/vault/api/access", { method: "POST", headers: H, body: JSON.stringify({ code: CODE1, acknowledge: true }) });
const jarA = cookieOf(redeemA);
log("S1 valid redemption", redeemA.status === 200 && !!redeemA.data.sid);

const sess = await j("/vault/api/access", { headers: { cookie: jarA, "x-vault": "1" } });
log("S1 session: only authorized video, correct runtime", sess.data.active && sess.data.videos?.length === 1 && sess.data.videos[0].id === 1 && sess.data.videos[0].durationSec != null, `dur=${sess.data.videos?.[0]?.durationSec}s`);

// S2 double redeem
const redeemB = await j("/vault/api/access", { method: "POST", headers: H, body: JSON.stringify({ code: CODE1, acknowledge: true }) });
log("S2 single-use code rejected second time", redeemB.status === 429 && /already been used/i.test(redeemB.data.error ?? ""), redeemB.data.error);

// S5 ranges + S4 cross-video
const range = await fetch(B + "/vault/api/share-media/1", { headers: { cookie: jarA, range: "bytes=0-1023" } });
log("S5 authorized range request → 206", range.status === 206 && (range.headers.get("content-range") ?? "").startsWith("bytes 0-1023/"), range.headers.get("content-range") ?? "");
await range.arrayBuffer();
const cross = await j("/vault/api/share-media/2", { headers: { cookie: jarA } });
log("S4 cross-video request → 403", cross.status === 403, cross.data.error);
const noAuth = await j("/vault/api/share-media/1");
log("S4 no-cookie request → 403", noAuth.status === 403);

// S7 concurrent redemption
const c2 = await j("/vault/api/shares", { method: "POST", headers: H, body: JSON.stringify({ videoIds: [3], singleUse: true, expiresInHours: 2 }) });
const CODE2 = c2.data.code;
const [p1, p2] = await Promise.all([
  j("/vault/api/access", { method: "POST", headers: H, body: JSON.stringify({ code: CODE2, acknowledge: true }) }),
  j("/vault/api/access", { method: "POST", headers: H, body: JSON.stringify({ code: CODE2, acknowledge: true }) }),
]);
log("S7 concurrent redemption: exactly one winner", [p1, p2].filter((p) => p.status === 200).length === 1);

// owner streaming
const owner = await fetch(B + "/vault/api/media/1", { headers: { range: "bytes=100-199" } });
log("owner range stream → 206", owner.status === 206);
await owner.arrayBuffer();

// S6 revocation
await j("/vault/api/shares", { method: "PATCH", headers: H, body: JSON.stringify({ id: share1, action: "revoke" }) });
const afterRevoke = await j("/vault/api/share-media/1", { headers: { cookie: jarA } });
log("S6 revoked session rejected immediately", afterRevoke.status === 403 && /revoked/i.test(afterRevoke.data.error ?? ""), afterRevoke.data.error);

// S9 secret hygiene
const raw = fs.readFileSync(path.join(process.cwd(), "data", "shares.json"), "utf8");
const norm = (c) => (c ?? "").replace(/-/g, "");
log("S9 shares.json: verifiers only, no plaintext", !raw.includes(CODE1) && !raw.includes(norm(CODE1)) && !raw.includes(norm(CODE2)) && raw.includes("codeHash"));
const list = await j("/vault/api/shares", { headers: { "x-vault": "1" } });
log("S9 management API leaks no code material", !JSON.stringify(list.data).includes(CODE1) && !JSON.stringify(list.data).includes("codeHash"));
const audit = await j(`/vault/api/shares?auditFor=${share1}`, { headers: { "x-vault": "1" } });
const events = (audit.data.audit ?? []).map((a) => a.event).join(",");
log("audit: created/redeemed/revoked recorded", events.includes("share.created") && events.includes("share.redeemed") && events.includes("share.revoked"), events);

// CSV + backup + ZIP
const csv = await (await fetch(B + "/vault/api/data?kind=csv")).text();
const header = csv.split("\r\n")[0];
log("CSV: runtime columns present, private notes excluded", header.includes("durationHHMMSS") && header.includes("durationSec") && !header.includes("privateNotes"));
const backup = await (await fetch(B + "/vault/api/data?kind=backup")).json();
log("backup: tables + share verifiers included", backup.app === "velvet-vault" && backup.tables?.videos?.length >= 9 && Array.isArray(backup.shares?.shares));
const zipRes = await fetch(B + "/vault/api/data?kind=project");
const zipBuf = Buffer.from(await zipRes.arrayBuffer());
log("project ZIP downloads (PK header)", zipRes.status === 200 && zipBuf.length > 30000 && zipBuf.slice(0, 2).toString() === "PK", `${(zipBuf.length / 1024).toFixed(0)} KB`);
log("ZIP excludes runtime data & node_modules", !zipBuf.includes(Buffer.from("data/shares.json")) && !zipBuf.includes(Buffer.from("node_modules/")) && zipBuf.includes(Buffer.from("README.md")));

// S8 rate limiting (LAST — locks this IP for 15 min)
let lastErr = "", locked = false;
for (let i = 0; i < 9; i++) {
  const r = await j("/vault/api/access", { method: "POST", headers: H, body: JSON.stringify({ code: "AAAA-AAAA-AAAA-AAAA", acknowledge: true }) });
  lastErr = r.data.error ?? "";
  if (/too many failed/i.test(lastErr)) { locked = true; break; }
}
log("S8 rate-limit lockout after repeated failures", locked, lastErr);

const fails = results.filter(([, p]) => !p);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
