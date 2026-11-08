// SEALED STORE (R1, review only; NOT deployed). Provider market data (intraday quotes/prices, options quotes, analyst recommendation
// archives: tier T1 of the D2 review) is kept in this PUBLIC repository only as ciphertext. Ciphertext in a public repository REDUCES
// plaintext exposure; it is not a legal conclusion about any provider's terms, and it does not remove copies already published
// (git history, artifacts, clones, caches).
//
// Format v2 (Stage 2, after Codex R1-C3): a file  data/x  is stored as  data/x.sealed , raw binary:
//   "S2SEAL" | version 0x02 | flags | 12-byte IV | 16-byte GCM tag | ciphertext
//   flags bit0 = the plaintext was deflate-compressed before encryption (compress-then-encrypt: ciphertext does not compress, so
//   compressing first keeps the repository growth near today's git-compressed size).
//   AES-256-GCM additional data = header | 0x00 | LOGICAL FILE ID (e.g. "data/opp-ledger.jsonl"), so valid ciphertext of file A is
//   REJECTED at file B (wrong-file replay). Replaying an OLDER version of the same file is not detected (git history holds those).
// Key: sha256("stock-2 sealed provider data v1\0" || secret), the secret read from env SEALED_SECRET only (workflows map it from a
// GitHub secret; today PRIVATE_KEY, see README "key custody": an owner decision, not established custody).
// Rules (fail closed):
//  - no key -> SEALED_KEY_MISSING, before any file is touched; a write NEVER falls back to plaintext;
//  - wrong key, tampering, truncation, wrong file, unknown version -> SEALED_UNREADABLE, never silent data;
//  - a plaintext copy with no sealed copy -> SEALED_LEGACY_PLAINTEXT on read (no unauthenticated legacy fallback): legacy files are
//    converted ONLY by the explicit, reviewed migration (sealed-migrate.mjs), which verifies each file before removing plaintext;
//  - writes are durable before anything else changes: temp file + fsync + rename + directory fsync + read-back decrypt and compare;
//    only then is a stale plaintext copy removed (and the workflow stages that deletion explicitly, see sealed-git.sh).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const MAGIC = Buffer.from('S2SEAL'), VERSION = 2, HDR = MAGIC.length + 2, IVL = 12, TAGL = 16;
const LABEL = 'stock-2 sealed provider data v1\0';
export const SEALED_EXT = '.sealed';
export const sealedPath = (p) => p + SEALED_EXT;
const err = (code, detail) => Object.assign(new Error(code + (detail ? ': ' + detail : '')), { code });
export const sealedCode = (e) => (e && /^SEALED_/.test(e.code || '') ? e.code : 'SEALED_IO_ERROR');

// T1: the D2 review's 34 files + 11 same-family files present at b0d76987 (45 tracked), by family. A path matching any of these is
// never committed in plaintext (sealed-guard.mjs) and is read/written only through this module.
export const T1_PATTERNS = [
  /^data\/shadow\/\d{4}-\d{2}-\d{2}\.jsonl\.gz$/,
  /^data\/ignition-runs\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+(?:\.json|\.shadow\.jsonl\.gz)$/,
  /^data\/(?:opp-ledger|premarket|early-wave-obs|ignition-missed-history|movers-journal)\.jsonl$/,
  /^data\/(?:ignition-live|fastmover-live|movers-state|options-shadow|options-spread-survey)\.json$/,
  /^data\/options-spread-survey\.md$/,
  /^data\/analyst-archive-\d{4}-\d{2}\.jsonl\.gz$/,
  /^data\/(?:opp-ledger|premarket|early-wave-obs|ignition-missed-history|movers-journal)\.jsonl\.d\/\d{4}-\d{2}-\d{2}\.jsonl$/,   // daily segments (rev3)
];
// SEGMENTED LEDGERS (rev3, cost): an append-only ledger is the sealed base file (as migrated) plus one sealed segment per UTC day,
// data/x.jsonl.d/YYYY-MM-DD.jsonl.sealed. Appends rewrite only today's segment, so a save adds about one day of records to git history
// instead of re-adding the whole ever-growing ledger (whole-file rewrites under fresh IVs would grow history quadratically).
// Readers see base + segments in date order, exactly the bytes a single file would hold.
export const SEGMENTED = /^data\/(?:opp-ledger|premarket|early-wave-obs|ignition-missed-history|movers-journal)\.jsonl$/;
export const segmentPath = (p, day = new Date().toISOString().slice(0, 10)) => path.join(p + '.d', day + '.jsonl');
export const isT1 = (rel) => T1_PATTERNS.some((r) => r.test(String(rel).replace(/\\/g, '/')));

// the logical identity bound into every file: the path from its "data/" folder (repository-relative), whatever the working directory
export function logicalId(p) {
  const abs = path.resolve(String(p).endsWith(SEALED_EXT) ? String(p).slice(0, -SEALED_EXT.length) : String(p)).split(path.sep).join('/');
  const i = abs.lastIndexOf('/data/');
  return i >= 0 ? abs.slice(i + 1) : path.basename(abs);
}

export function sealedKey(secret = process.env.SEALED_SECRET) {
  if (typeof secret !== 'string' || !secret.length) return null;
  return crypto.createHash('sha256').update(LABEL).update(secret).digest();
}
const aad = (hdr, id) => Buffer.concat([hdr, Buffer.from([0]), Buffer.from(String(id), 'utf8')]);

export function seal(data, key, id) {
  if (!key) throw err('SEALED_KEY_MISSING');
  if (!id) throw err('SEALED_ID_MISSING');
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const gz = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;   // already gzip: do not compress twice
  const flags = gz ? 0 : 1, body = gz ? buf : zlib.deflateRawSync(buf, { level: 9 });
  const hdr = Buffer.concat([MAGIC, Buffer.from([VERSION, flags])]), iv = crypto.randomBytes(IVL);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(aad(hdr, id));
  const ct = Buffer.concat([c.update(body), c.final()]);
  return Buffer.concat([hdr, iv, c.getAuthTag(), ct]);
}

export function unseal(bytes, key, id) {
  if (!key) throw err('SEALED_KEY_MISSING');
  if (!id) throw err('SEALED_ID_MISSING');
  const b = Buffer.isBuffer(bytes) ? bytes : null;
  if (!b || b.length < HDR + IVL + TAGL || !b.subarray(0, MAGIC.length).equals(MAGIC) || b[MAGIC.length] !== VERSION || (b[MAGIC.length + 1] & ~1)) throw err('SEALED_UNREADABLE');
  const hdr = b.subarray(0, HDR), d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(HDR, HDR + IVL));
  d.setAAD(aad(hdr, id)); d.setAuthTag(b.subarray(HDR + IVL, HDR + IVL + TAGL));
  let body; try { body = Buffer.concat([d.update(b.subarray(HDR + IVL + TAGL)), d.final()]); } catch { throw err('SEALED_UNREADABLE'); }
  if (!(b[MAGIC.length + 1] & 1)) return body;
  try { return zlib.inflateRawSync(body); } catch { throw err('SEALED_UNREADABLE'); }
}

// read: Buffer, or null when NEITHER copy exists. Throws SEALED_KEY_MISSING / SEALED_UNREADABLE / SEALED_LEGACY_PLAINTEXT.
export function readSealed(p, key = sealedKey()) {
  const sp = sealedPath(p);
  let base = null;
  if (fs.existsSync(sp)) base = unseal(fs.readFileSync(sp), key, logicalId(p));
  else if (fs.existsSync(p)) throw err('SEALED_LEGACY_PLAINTEXT', logicalId(p));
  if (!SEGMENTED.test(logicalId(p))) return base;
  const segs = listSealed(p + '.d', /^\d{4}-\d{2}-\d{2}\.jsonl$/);
  if (!segs.length) return base;
  if (!key) throw err('SEALED_KEY_MISSING');
  const parts = base && base.length ? [base] : [];
  for (const n of segs) { const b = unseal(fs.readFileSync(sealedPath(path.join(p + '.d', n))), key, logicalId(path.join(p + '.d', n))); if (parts.length && parts[parts.length - 1].at(-1) !== 10) parts.push(Buffer.from('\n')); parts.push(b); }
  return Buffer.concat(parts);
}
export const readSealedText = (p, key) => { const b = readSealed(p, key); return b === null ? null : b.toString('utf8'); };
export function readSealedJson(p, fallback = null, key) {
  const t = readSealedText(p, key); if (t === null) return fallback;
  try { return JSON.parse(t); } catch { throw err('SEALED_UNREADABLE', 'not JSON'); }
}
export function readSealedLines(p, key) {
  const t = readSealedText(p, key); if (t === null) return [];
  return t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);   // as the plaintext readers did
}
// for callers that must SHOW the failure: { ok:true, value } or { ok:false, code } (a code only; never content)
// Codex re-review blocker 3: without the key, an ABSENT record is not "known empty": callers that may write must stop first
export const keyMissing = (key = sealedKey()) => !key;
export function trySealed(fn) { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, code: sealedCode(e) }; } }

// I/O seam (tests inject faults here; production uses node:fs). Codex R1 re-review blocker 2: a directory fsync error is a REAL error
// and propagates (only "fsync of a directory is not supported here", EINVAL/ENOTSUP, is tolerated); short writes are completed.
export const sealedIO = { openSync: fs.openSync, writeSync: fs.writeSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync, linkSync: fs.linkSync };
function fsyncDir(d) {
  const fd = sealedIO.openSync(d, 'r');
  try { sealedIO.fsyncSync(fd); } catch (e) { if (!['EINVAL', 'ENOTSUP'].includes(e && e.code)) throw e; }
  finally { sealedIO.closeSync(fd); }
}
function writeAll(fd, buf) { let off = 0; while (off < buf.length) { const n = sealedIO.writeSync(fd, buf, off, buf.length - off); if (!(n > 0)) throw Object.assign(new Error('EIO: short write made no progress'), { code: 'EIO' }); off += n; } }

// write: durable, verified, never plaintext. opts.exclusive: refuse to replace an existing sealed file (replaces {flag:'wx'}).
export function writeSealed(p, data, key = sealedKey(), opts = {}) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'), id = logicalId(p);
  const out = seal(buf, key, id);   // throws before touching any file when the key is missing
  const sp = sealedPath(p);
  if (opts.exclusive && fs.existsSync(sp)) throw Object.assign(new Error('EEXIST: ' + id), { code: 'EEXIST' });
  // unchanged content: no new file (a fresh IV would otherwise make an identical record a new git blob on every save; Codex cost note)
  if (!opts.exclusive && fs.existsSync(sp)) { let same = false; try { same = unseal(fs.readFileSync(sp), key, id).equals(buf); } catch {} if (same) { if (fs.existsSync(p)) { fs.rmSync(p); fsyncDir(path.dirname(p)); } return false; } }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = sp + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const fd = sealedIO.openSync(tmp, 'wx');
  try { writeAll(fd, out); sealedIO.fsyncSync(fd); } catch (e) { try { sealedIO.closeSync(fd); } catch {} fs.rmSync(tmp, { force: true }); throw e; }
  sealedIO.closeSync(fd);
  try { if (opts.exclusive) sealedIO.linkSync(tmp, sp); else sealedIO.renameSync(tmp, sp); } finally { if (opts.exclusive) fs.rmSync(tmp, { force: true }); }
  fsyncDir(path.dirname(sp));   // throws on a real I/O error: the plaintext copy below is then NOT removed
  if (!unseal(fs.readFileSync(sp), key, id).equals(buf)) throw err('SEALED_UNREADABLE', 'read-back mismatch');
  if (fs.existsSync(p)) { fs.rmSync(p); fsyncDir(path.dirname(p)); }   // stale plaintext leaves the working tree only after a durable, verified sealed copy
}
export const writeSealedJson = (p, obj, key, opts) => writeSealed(p, JSON.stringify(obj), key, opts);

// jsonl append: read-modify-write of the whole sealed file. Concurrent appends from different runs are merged by sealed-merge.mjs.
export function appendSealedLines(p, lines, key = sealedKey(), opts = {}) {
  if (!key) throw err('SEALED_KEY_MISSING');
  const add = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? l.replace(/\n+$/, '') : JSON.stringify(l))).filter((l) => l.length);
  if (!add.length) return;
  if (SEGMENTED.test(logicalId(p))) {
    if (!fs.existsSync(sealedPath(p)) && fs.existsSync(p)) throw err('SEALED_LEGACY_PLAINTEXT', logicalId(p));   // never append beside unmigrated plaintext
    const seg = segmentPath(p, opts.day), old = readSealedText(seg, key) || '';
    return writeSealed(seg, old + (old && !old.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n', key);
  }
  const old = readSealedText(p, key) || '';
  writeSealed(p, old + (old && !old.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n', key);
}

// directory listing by LOGICAL name (".sealed" stripped). A plaintext T1-family file in the folder -> SEALED_LEGACY_PLAINTEXT.
export function listSealed(dir, re = /./) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir), out = [];
  for (const n of names) {
    if (n.endsWith(SEALED_EXT)) { const l = n.slice(0, -SEALED_EXT.length); if (re.test(l)) out.push(l); }
    else if (re.test(n) && isT1(logicalId(path.join(dir, n)))) throw err('SEALED_LEGACY_PLAINTEXT', logicalId(path.join(dir, n)));
  }
  return out.sort();
}
export const existsSealed = (p) => fs.existsSync(sealedPath(p));
