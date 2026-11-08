// R1 sealed store v2: synthetic only (temporary folders, invented values, no real secret or market data, no network).
// Includes Codex's Stage 1 adverse reproductions (R1-C3): wrong-file replay, keyless legacy read, malformed encodings, durability.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import * as SS from '../sealed-store.mjs';
const { sealedKey, seal, unseal, readSealed, readSealedText, readSealedJson, readSealedLines, writeSealed, writeSealedJson, appendSealedLines, sealedPath, listSealed, logicalId, isT1, trySealed } = SS;

const K = sealedKey('synthetic-test-secret'), K2 = sealedKey('another-secret');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return path.join(d, 'repo'); };
const code = (c) => ({ code: c });

test('round trip; ciphertext reveals no plaintext; fresh IV each time; binary, not base64', () => {
  const pt = Buffer.from('{"sym":"ZZQ","bid":1.23,"ask":1.25}\n'.repeat(20));
  const a = seal(pt, K, 'data/opp-ledger.jsonl'), b = seal(pt, K, 'data/opp-ledger.jsonl');
  assert.ok(Buffer.isBuffer(a)); assert.notDeepEqual(a, b);
  assert.doesNotMatch(a.toString('latin1'), /ZZQ|bid|1\.23/);
  assert.deepEqual(unseal(a, K, 'data/opp-ledger.jsonl'), pt);
  assert.ok(a.length < pt.length, 'compressed before encryption');
});

test('key derivation: domain-separated from sha256(secret) (the private.enc key); read only from SEALED_SECRET', () => {
  assert.notDeepEqual(K, crypto.createHash('sha256').update('synthetic-test-secret').digest());
  assert.equal(sealedKey(''), null); assert.equal(sealedKey(undefined), null);
  const keep = { S: process.env.SEALED_SECRET, P: process.env.PRIVATE_KEY };
  try { delete process.env.SEALED_SECRET; process.env.PRIVATE_KEY = 'x'; assert.equal(sealedKey(), null, 'PRIVATE_KEY alone is not used'); }
  finally { if (keep.S === undefined) delete process.env.SEALED_SECRET; else process.env.SEALED_SECRET = keep.S; if (keep.P === undefined) delete process.env.PRIVATE_KEY; else process.env.PRIVATE_KEY = keep.P; }
});

test('Codex R1-C3 replay: a valid sealed file copied over another path is SEALED_UNREADABLE (path bound in the AAD)', (t) => {
  const d = tmp(t), A = path.join(d, 'data', 'a.json'), B = path.join(d, 'data', 'b.json');
  writeSealedJson(A, { a: 1 }, K); writeSealedJson(B, { b: 2 }, K);
  fs.copyFileSync(sealedPath(A), sealedPath(B));
  assert.throws(() => readSealedJson(B, null, K), code('SEALED_UNREADABLE'));
  assert.deepEqual(readSealedJson(A, null, K), { a: 1 });
  assert.equal(logicalId(path.join(d, 'data', 'ignition-runs', '2026-01-02', 'r-1.json.sealed')), 'data/ignition-runs/2026-01-02/r-1.json');
});

test('wrong key, tampering (every byte region), truncation, other versions and malformed input: SEALED_UNREADABLE', () => {
  const id = 'data/x.json', s = seal(Buffer.from('x'.repeat(200)), K, id);
  assert.throws(() => unseal(s, K2, id), code('SEALED_UNREADABLE'));
  for (const i of [0, 6, 7, 8, 20, 30, s.length - 1]) { const t = Buffer.from(s); t[i] ^= 1; assert.throws(() => unseal(t, K, id), code('SEALED_UNREADABLE'), 'byte ' + i); }
  assert.throws(() => unseal(s.subarray(0, 25), K, id), code('SEALED_UNREADABLE'));
  assert.throws(() => unseal(Buffer.from('{"plain":"json"}'), K, id), code('SEALED_UNREADABLE'));
  assert.throws(() => unseal(Buffer.from(s.toString('base64')), K, id), code('SEALED_UNREADABLE'), 'a base64 rendering is not accepted');
  assert.throws(() => unseal(Buffer.from('!' + s.toString('base64')), K, id), code('SEALED_UNREADABLE'), 'Codex inserted-character probe');
  assert.throws(() => unseal('text', K, id), code('SEALED_UNREADABLE'));
});

test('Codex R1-C3 keyless legacy read: plaintext with no sealed copy is SEALED_LEGACY_PLAINTEXT with or without a key', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'opp-ledger.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{"n":1}\n');
  assert.throws(() => readSealedJson(p, null, null), code('SEALED_LEGACY_PLAINTEXT'));
  assert.throws(() => readSealedText(p, K), code('SEALED_LEGACY_PLAINTEXT'));
  assert.throws(() => appendSealedLines(p, [{ n: 2 }], K), code('SEALED_LEGACY_PLAINTEXT'), 'no implicit migration on append');
  assert.equal(fs.readFileSync(p, 'utf8'), '{"n":1}\n', 'plaintext untouched'); assert.equal(fs.existsSync(sealedPath(p)), false);
  assert.equal(readSealed(path.join(d, 'data', 'none.json'), K), null, 'absent stays absent');
  assert.deepEqual(trySealed(() => readSealedText(p, K)), { ok: false, code: 'SEALED_LEGACY_PLAINTEXT' });
});

test('no key: every write refuses BEFORE touching any file; a sealed file without the key is SEALED_KEY_MISSING (never absent)', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'q.jsonl');
  assert.throws(() => writeSealed(p, 'quotes', null), code('SEALED_KEY_MISSING'));
  assert.throws(() => appendSealedLines(p, ['a'], null), code('SEALED_KEY_MISSING'));
  assert.equal(fs.existsSync(path.join(d, 'data')), false);
  writeSealed(p, 'x\n', K);
  assert.throws(() => readSealed(p, null), code('SEALED_KEY_MISSING'));
});

test('durable write: no temp file left, read-back verified, plaintext removed only after the sealed copy verifies', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'ignition-live.json');
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{"old":true}');
  writeSealedJson(p, { day: '2026-01-02' }, K);
  assert.equal(fs.existsSync(p), false); assert.deepEqual(readSealedJson(p, null, K), { day: '2026-01-02' });
  assert.deepEqual(fs.readdirSync(path.dirname(p)), ['ignition-live.json.sealed']);
  // a failing seal (no key) leaves the existing plaintext and sealed copies exactly as they were
  fs.writeFileSync(p, '{"old":true}'); const before = fs.readFileSync(sealedPath(p));
  assert.throws(() => writeSealedJson(p, { day: 'x' }, null), code('SEALED_KEY_MISSING'));
  assert.deepEqual(fs.readFileSync(sealedPath(p)), before); assert.equal(fs.readFileSync(p, 'utf8'), '{"old":true}');
});

test('exclusive write replaces {flag:"wx"}: an existing per-run archive is never replaced', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'ignition-runs', '2026-01-02', 'r-1.json');
  writeSealedJson(p, { v: 1 }, K, { exclusive: true });
  assert.throws(() => writeSealedJson(p, { v: 2 }, K, { exclusive: true }), code('EEXIST'));
  assert.deepEqual(readSealedJson(p, null, K), { v: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(p)), ['r-1.json.sealed'], 'no temp file left behind');
});

test('append + lines; listing by logical name; a plaintext T1 file in a sealed folder is refused', (t) => {
  const d = tmp(t), p = path.join(d, 'data', 'opp-ledger.jsonl');
  appendSealedLines(p, [{ n: 1 }], K); appendSealedLines(p, [{ n: 2 }, '{"n":3}'], K); appendSealedLines(p, [], K);
  assert.deepEqual(readSealedLines(p, K), [{ n: 1 }, { n: 2 }, { n: 3 }]);
  const sd = path.join(d, 'data', 'shadow');
  writeSealed(path.join(sd, '2026-01-02.jsonl.gz'), zlib.gzipSync('{"bid":1}\n'), K); writeSealed(path.join(sd, '2026-01-05.jsonl.gz'), zlib.gzipSync('{"bid":2}\n'), K);
  assert.deepEqual(listSealed(sd, /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/), ['2026-01-02.jsonl.gz', '2026-01-05.jsonl.gz']);
  assert.equal(zlib.gunzipSync(readSealed(path.join(sd, '2026-01-05.jsonl.gz'), K)).toString(), '{"bid":2}\n', 'gzip payload unchanged');
  fs.writeFileSync(path.join(sd, '2026-01-06.jsonl.gz'), zlib.gzipSync('{"bid":3}\n'));
  assert.throws(() => listSealed(sd, /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/), code('SEALED_LEGACY_PLAINTEXT'));
});

test('T1 inventory patterns: the 45 tracked families match; neighbours that are not T1 do not', () => {
  for (const p of ['data/shadow/2026-11-06.jsonl.gz', 'data/ignition-runs/2026-11-06/42282044370-1.json', 'data/ignition-runs/2026-11-06/42282044370-1-progress.json',
    'data/ignition-runs/2026-11-06/42282044370-1-delivery-recovery.json', 'data/ignition-runs/2026-11-06/42282044370-1.shadow.jsonl.gz', 'data/opp-ledger.jsonl', 'data/premarket.jsonl',
    'data/early-wave-obs.jsonl', 'data/ignition-live.json', 'data/ignition-missed-history.jsonl', 'data/fastmover-live.json', 'data/movers-state.json', 'data/movers-journal.jsonl',
    'data/options-spread-survey.json', 'data/options-spread-survey.md', 'data/options-shadow.json', 'data/analyst-archive-2026-11.jsonl.gz']) assert.ok(isT1(p), p);
  for (const p of ['data/opp-days.jsonl', 'data/signals.json', 'data/discovery.json', 'data/shadow-report.json', 'data/shadow-outcomes/2026-11-06.json.gz', 'data/ignition-days.jsonl',
    'data/radar-v3-ledger.jsonl', 'data/options-lab.json', 'data/smart-money.json', 'data/opp-ledger.jsonl.sealed', 'data/shadow/2026-11-06.jsonl.gz.sealed', 'index.html']) assert.ok(!isT1(p), p);
});
