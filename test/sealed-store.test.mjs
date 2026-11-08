// R1 sealed store: synthetic only (temporary folders, invented values, no real secret or market data).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sealedKey, seal, unseal, readSealed, readSealedText, readSealedJson, writeSealed, writeSealedJson, appendSealedLines, sealedPath } from '../sealed-store.mjs';

const K = sealedKey('synthetic-test-secret'), K2 = sealedKey('another-secret');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('round trip; ciphertext reveals no plaintext; fresh IV each time', () => {
  const a = seal(Buffer.from('{"sym":"ZZQ","bid":1.23,"ask":1.25}'), K), b = seal(Buffer.from('{"sym":"ZZQ","bid":1.23,"ask":1.25}'), K);
  assert.notEqual(a, b);
  assert.doesNotMatch(Buffer.from(a, 'base64').toString('latin1'), /ZZQ|bid|1\.23/);
  assert.equal(unseal(a, K).toString(), '{"sym":"ZZQ","bid":1.23,"ask":1.25}');
});

test('key is domain-separated from the existing private.enc key (sha256 of the bare secret)', async () => {
  const crypto = await import('node:crypto');
  assert.notDeepEqual(K, crypto.createHash('sha256').update('synthetic-test-secret').digest());
  assert.equal(sealedKey(''), null); assert.equal(sealedKey(undefined), null);
});

test('wrong key, tampering, truncation and non-sealed text are SEALED_UNREADABLE, never silent data', () => {
  const s = seal(Buffer.from('x'.repeat(50)), K), b = Buffer.from(s, 'base64');
  assert.throws(() => unseal(s, K2), { code: 'SEALED_UNREADABLE' });
  const t = Buffer.from(b); t[t.length - 1] ^= 1; assert.throws(() => unseal(t.toString('base64'), K), { code: 'SEALED_UNREADABLE' });
  assert.throws(() => unseal(b.subarray(0, 20).toString('base64'), K), { code: 'SEALED_UNREADABLE' });
  assert.throws(() => unseal('{"plain":"json"}', K), { code: 'SEALED_UNREADABLE' });
});

test('no key: writing refuses BEFORE touching any file (never a plaintext fallback)', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'q.jsonl');
  assert.throws(() => writeSealed(p, 'secret quotes', null), { code: 'SEALED_KEY_MISSING' });
  assert.throws(() => appendSealedLines(p, ['a'], null), { code: 'SEALED_KEY_MISSING' });
  assert.equal(fs.existsSync(path.join(d, 'data')), false);
});

test('migration: legacy plaintext is read, the first sealed write removes the plaintext copy', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'opp-ledger.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{"n":1}\n');
  assert.equal(readSealedText(p, K), '{"n":1}\n');
  appendSealedLines(p, [{ n: 2 }], K);
  assert.equal(fs.existsSync(p), false, 'plaintext removed from the working tree');
  assert.equal(fs.existsSync(sealedPath(p)), true);
  assert.equal(readSealedText(p, K), '{"n":1}\n{"n":2}\n');
  assert.doesNotMatch(fs.readFileSync(sealedPath(p), 'utf8'), /"n"/);
});

test('sealed copy wins over a stale plaintext copy; json helpers; missing file -> fallback', (t) => {
  const d = tmp(t), p = path.join(d, 'x.json');
  writeSealedJson(p, { a: 1 }, K); fs.writeFileSync(p, '{"a":"stale"}');
  assert.deepEqual(readSealedJson(p, null, K), { a: 1 });
  assert.equal(readSealedJson(path.join(d, 'none.json'), 'FB', K), 'FB');
  assert.throws(() => readSealedJson(p, null, null), { code: 'SEALED_KEY_MISSING' });
});

test('binary (gzip) payloads round trip unchanged', async (t) => {
  const zlib = await import('node:zlib'), d = tmp(t), p = path.join(d, 'shadow', '2026-01-02.jsonl.gz');
  const gz = zlib.gzipSync(Buffer.from('{"bid":1}\n'));
  writeSealed(p, gz, K);
  assert.equal(zlib.gunzipSync(readSealed(p, K)).toString(), '{"bid":1}\n');
});
