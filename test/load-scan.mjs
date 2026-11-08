// Test helper: loads scan.mjs WITHOUT running it, in a temporary folder with only the data files a test gives it.
// scan.mjs runs its main job on import (its last line is `await (MODE === ... daily())`), so the helper copies it minus that line,
// adds one export that hands out any top-level function by name, writes the fixture files, and imports the copy.
// No network: every fetch to anything other than localhost is refused and recorded in `blocked` (a test checks it stays empty).
// SCAN_SRC=/path/to/old/scan.mjs runs the same tests against another version (used to prove a test fails on the pre-fix code).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isT1, sealedKey, writeSealed, readSealedText } from '../sealed-store.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const blocked = [];
if (!globalThis.__scanTestFetchGuard) {
  const real = globalThis.fetch;
  globalThis.fetch = (u, o) => { const s = String(u && u.url ? u.url : u); if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(s)) return real(u, o); blocked.push(s); return Promise.reject(new TypeError('network blocked in tests: ' + s)); };
  globalThis.__scanTestFetchGuard = true;
}
// one-time migrations in scan.mjs are marked done, so they never rewrite a fixture
const DONE = { stopPlan1018: '2026-10-18T00:00:00.000Z', stopRestore1022: '2026-10-22T00:00:00.000Z', tradesMig1022: '2026-10-22T00:00:00.000Z' };
const SECRETS = ['TG_TOKEN', 'TG_CHAT', 'TG_BASE', 'FH_BASE', 'TD_BASE', 'FINNHUB_KEY', 'ALPACA_KEY', 'ALPACA_SECRET', 'MASSIVE_KEY', 'FMP_KEY', 'ZOYA_KEY', 'PRIVATE_KEY', 'GITHUB_WORKFLOW'];
let seq = 0; const DIRS = [];
process.on('exit', () => { process.chdir(os.tmpdir()); for (const d of DIRS) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} });

// R1: T1 provider-data fixtures are written SEALED with a synthetic test secret (as production writes them), unless the code under
// test predates R1 (SCAN_SRC pointing at an old scan.mjs) or the test removes the secret (SEALED_SECRET: '') to test fail-closed paths.
export const TEST_SEALED_SECRET = 'synthetic-scan-test-secret';
let SEAL = true;
const sealedNow = (name) => SEAL && isT1(name.replace(/\\/g, '/')) && sealedKey(process.env.SEALED_SECRET || TEST_SEALED_SECRET);
export function writeFixture(dir, name, data) {
  const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = typeof data === 'string' ? data : name.endsWith('.jsonl') ? data.map(x => JSON.stringify(x)).join('\n') + (data.length ? '\n' : '') : JSON.stringify(data);
  const key = sealedNow(name);
  if (key) writeSealed(f, text, key); else fs.writeFileSync(f, text);
}
const readFixture = (dir, name) => { const key = sealedNow(name); return key && fs.existsSync(path.join(dir, name) + '.sealed') ? readSealedText(path.join(dir, name), key) : fs.readFileSync(path.join(dir, name), 'utf8'); };

// files: { 'data/signals.json': {...}, 'data/my-trades.jsonl': [rows], ... }; settings are merged over the migration flags.
export async function loadScan({ files = {}, env = {} } = {}) {
  const src = fs.readFileSync(process.env.SCAN_SRC || path.join(REPO, 'scan.mjs'), 'utf8').trimEnd().split('\n');
  const last = src.pop(); if (!/^await \(MODE ===/.test(last)) throw new Error('scan.mjs no longer ends with its main call; update test/load-scan.mjs: ' + last.slice(0, 80));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-')); DIRS.push(dir);
  SEAL = src.some(l => l.includes("from './sealed-store.mjs'"));
  if (SEAL) process.env.SEALED_SECRET = 'SEALED_SECRET' in env ? env.SEALED_SECRET : TEST_SEALED_SECRET;
  fs.copyFileSync(path.join(REPO, 'index.html'), path.join(dir, 'index.html'));
  // (4 Nov) local modules scan.mjs imports statically (e.g. './stop-watch.mjs') are copied beside the copy, from the same tree
  const srcDir = path.dirname(process.env.SCAN_SRC ? path.resolve(process.env.SCAN_SRC) : path.join(REPO, 'scan.mjs'));
  for (const m of new Set([...src.join('\n').matchAll(/^import [^;]*? from '\.\/([\w.-]+\.mjs)';/gm)].map(x => x[1]))) { const f = fs.existsSync(path.join(srcDir, m)) ? path.join(srcDir, m) : path.join(REPO, m); fs.copyFileSync(f, path.join(dir, m)); }
  fs.mkdirSync(path.join(dir, 'data'));
  // a string is written as is (a test of a settings file that does not parse); an object is merged over the migration flags
  const st0 = files['data/settings.json']; writeFixture(dir, 'data/settings.json', typeof st0 === 'string' ? st0 : { ...DONE, ...(st0 || {}) });
  for (const [k, v] of Object.entries(files)) if (k !== 'data/settings.json') writeFixture(dir, k, v);
  const file = path.join(dir, 'scan-under-test-' + (++seq) + '.mjs');
  fs.writeFileSync(file, src.join('\n') + '\nexport const __get = (name) => eval(name);\n');
  for (const k of SECRETS) delete process.env[k];
  Object.assign(process.env, { TWELVE_KEY: 'x', BOT_ONLY: '1', MODE: 'chat' }, env);
  process.chdir(dir);
  const mod = await import(pathToFileURL(file).href);
  const fn = (name) => { const f = mod.__get(name); if (typeof f !== 'function') throw new Error(name + ' is not a function in scan.mjs'); return f; };
  return { dir, fn, value: (name) => mod.__get(name), write: (name, data) => writeFixture(dir, name, data), read: (name) => readFixture(dir, name), readJson: (name) => JSON.parse(readFixture(dir, name)) };
}
