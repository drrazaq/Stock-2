// SEALED STORE (R1, 8 Nov 2026; review only, not wired into production yet). Provider market data (intraday quotes/prices, options
// quotes, analyst recommendations) must not be readable in this PUBLIC repository: Alpaca Customer Agreement §30 (no reproduce/
// distribute), Massive Market Data Terms §5(c) (no share/publish/make available), Finnhub ToS (no redistribution of data or derived
// results). The same pattern already protects data/private.enc and data/calendar.enc: AES-256-GCM with a key derived from the existing
// PRIVATE_KEY secret. Here the key is DOMAIN-SEPARATED (sha256 of a fixed label + the secret), so these files never share a key with
// private.enc.
// A file  data/x.jsonl  is stored as  data/x.jsonl.sealed  (base64 text: magic | 12-byte IV | 16-byte tag | ciphertext).
// Rules: writing NEVER falls back to plaintext (no key -> SEALED_KEY_MISSING); a successful sealed write removes any plaintext copy of
// the same path from the working tree (so the next commit drops it from the public tip; git history is NOT rewritten); reading prefers
// the sealed copy and accepts a legacy plaintext copy only while migrating; a wrong key or any tampering -> SEALED_UNREADABLE, never
// silent empty data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAGIC = Buffer.from('S2SEAL1');
const LABEL = 'stock-2 sealed provider data v1\0';
export const SEALED_EXT = '.sealed';
export const sealedPath = (p) => p + SEALED_EXT;
const err = (code) => Object.assign(new Error(code), { code });

export function sealedKey(secret = process.env.PRIVATE_KEY) {
  if (typeof secret !== 'string' || !secret.length) return null;
  return crypto.createHash('sha256').update(LABEL).update(secret).digest();
}

export function seal(buf, key) {
  if (!key) throw err('SEALED_KEY_MISSING');
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]).toString('base64');
}

export function unseal(text, key) {
  if (!key) throw err('SEALED_KEY_MISSING');
  let b; try { b = Buffer.from(String(text).trim(), 'base64'); } catch { throw err('SEALED_UNREADABLE'); }
  if (b.length < MAGIC.length + 28 || !b.subarray(0, MAGIC.length).equals(MAGIC)) throw err('SEALED_UNREADABLE');
  const o = MAGIC.length, d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(o, o + 12));
  d.setAuthTag(b.subarray(o + 12, o + 28));
  try { return Buffer.concat([d.update(b.subarray(o + 28)), d.final()]); } catch { throw err('SEALED_UNREADABLE'); }
}

// read: Buffer or null when neither copy exists
export function readSealed(p, key = sealedKey()) {
  const sp = sealedPath(p);
  if (fs.existsSync(sp)) return unseal(fs.readFileSync(sp, 'utf8'), key);
  if (fs.existsSync(p)) return fs.readFileSync(p);   // legacy plaintext, only until the first sealed write
  return null;
}
export const readSealedText = (p, key) => { const b = readSealed(p, key); return b === null ? null : b.toString('utf8'); };
export function readSealedJson(p, fallback = null, key) { const t = readSealedText(p, key); return t === null ? fallback : JSON.parse(t); }

export function writeSealed(p, data, key = sealedKey()) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const text = seal(buf, key);   // throws before touching any file when the key is missing
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const sp = sealedPath(p), tmp = sp + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text + '\n'); fs.renameSync(tmp, sp);
  if (fs.existsSync(p)) fs.rmSync(p);   // the plaintext copy leaves the working tree (public tip after the next commit)
}
export const writeSealedJson = (p, obj, key) => writeSealed(p, JSON.stringify(obj), key);

// jsonl append: read-modify-write of the whole sealed file (these files are at most a few MB)
export function appendSealedLines(p, lines, key = sealedKey()) {
  if (!key) throw err('SEALED_KEY_MISSING');
  const old = readSealedText(p, key) || '';
  const add = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
  writeSealed(p, old + (old && !old.endsWith('\n') ? '\n' : '') + add + '\n', key);
}
