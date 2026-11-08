// R1 rev14 (Codex review 6723732821, B5): the after-close OPPORTUNITY RADAR reads the live watcher record (T1, sealed) through the sealed
// store. Synthetic only: the ACTUAL `node opportunity-radar.mjs close` process in a throw-away copy of the source (.mjs files), invented
// data, a synthetic key, and fetch() refused (no network, no provider calls, no Telegram).
// 1 valid sealed record -> scored (approved-signal count shown), never "saved no results"
// 2 no key / damaged file / legacy plaintext -> LIVE WATCHER RECORD UNKNOWN with its SEALED_ code, never "no results", never read as data
// 3 audit: no module reads a T1 data path without importing the sealed store (the indirect readJson wrapper that hid this reader)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, writeSealedJson, isT1 } from '../sealed-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-radar-only';

function closeRun(t, setup, key = SECRET) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-radar-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.mjs'))) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'data'));
  const guard = path.join(dir, 'network-guard.mjs'); fs.writeFileSync(guard, "globalThis.fetch = async () => { throw Error('EXTERNAL_NETWORK_FORBIDDEN'); };");
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  fs.writeFileSync(path.join(dir, 'data/settings.json'), '{"radar":true}'); fs.writeFileSync(path.join(dir, 'data/radar-v3-ledger.jsonl'), '');
  setup(dir, { day, alerts: 7, missed: [], tally: {}, coverage: { firstMinute: '09:30' } });
  const r = spawnSync(process.execPath, ['--import', guard, path.join(dir, 'opportunity-radar.mjs'), 'close'], { cwd: dir, env: { PATH: process.env.PATH, SEALED_SECRET: key }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}
const sealedLive = (dir, live) => writeSealedJson(path.join(dir, 'data/ignition-live.json'), live, sealedKey(SECRET));

test('B5: a valid sealed live record is read and scored by the actual close-radar process', (t) => {
  const r = closeRun(t, sealedLive);
  assert.equal(r.status, 0, r.out); assert.match(r.out, /APPROVED SIGNALS today: 7/); assert.doesNotMatch(r.out, /saved no results|UNKNOWN \(SEALED_/);
});
test('B5: no key, a damaged file or legacy plaintext is LIVE WATCHER RECORD UNKNOWN with its code (never "no results"); the rest still runs', (t) => {
  const cases = [
    ['SEALED_KEY_MISSING', sealedLive, ''],
    ['SEALED_UNREADABLE', (d, l) => { sealedLive(d, l); const p = path.join(d, 'data/ignition-live.json.sealed'), b = fs.readFileSync(p); b[b.length - 1] ^= 1; fs.writeFileSync(p, b); }, SECRET],
    ['SEALED_LEGACY_PLAINTEXT', (d, l) => fs.writeFileSync(path.join(d, 'data/ignition-live.json'), JSON.stringify(l)), SECRET],
  ];
  for (const [code, setup, key] of cases) {
    const r = closeRun(t, setup, key);
    assert.equal(r.status, 0, code + ': the ledger save step must still run'); assert.match(r.out, new RegExp('LIVE WATCHER RECORD UNKNOWN \\(' + code + '\\)'), code + '\n' + r.out);
    assert.doesNotMatch(r.out, /saved no results/, code); assert.doesNotMatch(r.out, /APPROVED SIGNALS today: 7/, code + ': unreadable or plaintext data is never scored');
    assert.match(r.out, /OPPORTUNITY RADAR, AFTER THE CLOSE/, code + ': the rest of the close message is still produced');
  }
});
test('B5 audit: every module that names a T1 data path imports the sealed store (no plain-file wrapper can read T1 silently)', () => {
  const files = execFileSync('git', ['ls-files', '*.mjs'], { cwd: ROOT }).toString().split('\n').filter((f) => f && !/^(test|docs)\//.test(f));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const t1 = [...src.matchAll(/['"`](data\/[A-Za-z0-9_./-]+?)['"`]/g)].map((m) => m[1]).filter((p) => isT1(p));
    if (t1.length && !/(from |import\()'\.\/sealed-store\.mjs'/.test(src) && f !== 'sealed-store.mjs') offenders.push(f + ': ' + t1[0]);
  }
  assert.deepEqual(offenders, []);
});
