// TWO-PASS NIGHTLY SCAN (P0 Route A, development; not wired into any workflow).
// The public files written by the nightly scan must not depend on the owner's private state (ZAD marks, holdings, private watch list,
// tips, settings, private caches). Both passes run in ISOLATED temporary copies; the real checkout only ever receives
//   (a) FIRST, from a COMPLETED private pass: updated private-listed owner files and data/private-<name> copies of the private pass's
//       other outputs, each written atomically (temp file in the same directory + rename) to a private path;
//   (b) LAST, from a COMPLETED public pass: the validated public outputs, each written atomically to its public name.
// A crash, kill or timeout at any point therefore leaves every public path as it was and never puts private bytes at a public name, even
// transiently; owner files are only ever replaced by a completed private pass's versions (never deleted).
// 1. PUBLIC PASS: sandbox without any private file, without data/private-* and without tainted/unverified seeds (policy below); its
//    environment is an ALLOWLIST (market-data GET credentials, run flags), so it performs no communication/account/order/screening effect.
// 2. PRIVATE PASS: sandbox with the full real data, the private full-state caches restored over their public names, the public pass's
//    clock (SCAN_GENERATED_AT) and the public pass's market-data cache (replay of declared historical routes only).
// Stdout: the public pass to this process's stdout (public job log); the private pass only to the private sink data/private-scan-stdout.log.
// Exit code: the private pass's (it carries the owner's protective messages).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process';

const ROOT = process.cwd(), DATA = path.join(ROOT, 'data');
const PRIVATE_NAMES = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
const isPrivate = (name) => PRIVATE_NAMES.has(name) || name.startsWith('private-');
const privateName = (name) => 'private-' + name.replace(/\//g, '__');

// ---- Public-pass seed policy (declared; reviewed 13 Nov 2026). A data file is copied into the public sandbox only if:
//  (a) it is not a private file and not a data/private-* copy;
//  (b) it is not produced by a module that reads the owner's private state (TAINTED_SEEDS, from the producer audit; a drift test
//      recomputes it from source and fails when a producer starts reading private files);
//  (c) if the nightly scan itself writes it (SCAN_OUTPUTS), its bytes match the last public-pass manifest; a legacy copy written by
//      the old single-pass scan is quarantined (never used as a public seed), because it may carry private-derived entries.
// Everything else (files from producers that never read private state, external reference files) is a trusted public input.
export const TAINTED_SEEDS = Object.freeze(['calendar.enc', 'decoded-check.json', 'earnings-cache.json.gz', 'events-study.json', 'fastmover-lab.json',
  'fastmover-paper.json', 'follow-fade.json', 'ignition-days.jsonl', 'ignition-lab.json', 'ignition-live.json', 'ignition-results.json', 'macro-log.jsonl',
  'news-log.jsonl', 'quality.json', 'smart-money-study.json', 'smart-money.json', 'squad29-lab.json', 'strategy-library.json',
  'options-shadow.json', 'tier2-ledger.jsonl', 'tg-state.json', 'tg-failures.jsonl', 'halal-ext.json', 'zoya.json']);
export const SCAN_OUTPUTS = Object.freeze(['alert-state.json', 'dow-study.json', 'fm-state.json', 'journal.jsonl', 'leaders.json', 'lessons.json',
  'mday-study.json', 'models.json', 'names.json', 'options-probe.json', 'outcomes.json', 'sectors.json', 'sic-extra.json', 'signals.json', 'skipped.jsonl',
  'spy-closes.json', 'timing-study.json']);
export const MANIFEST = 'public-pass-manifest.json';
export function seedAllowed(rel, manifest, hashOf) {
  const top = rel.split('/')[0];
  if (isPrivate(top) || isPrivate(rel) || rel === MANIFEST) return false;
  if (TAINTED_SEEDS.includes(rel)) return false;
  if (SCAN_OUTPUTS.includes(rel)) return !!(manifest && manifest.files && manifest.files[rel] && manifest.files[rel] === hashOf(rel));
  return true;
}


// Public pass environment ALLOWLIST: no Telegram, Alpaca, private-data, GitHub token, halal screening, Zoya, eToro or TipRanks credentials.
export const PUBLIC_ENV_ALLOW = Object.freeze(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'NODE_OPTIONS', 'TMPDIR', 'TWELVE_KEY', 'MASSIVE_KEY', 'FINNHUB_KEY', 'FMP_KEY',
  'ALPHAVANTAGE_KEY', 'SEC_UA', 'OPENFIGI_KEY', 'RATE', 'FORCE', 'NO_CROWD', 'NO_WIDE', 'NO_QUICK_EXTRA', 'WIDE_N', 'WIDE_ALL', 'WIDE_DV', 'WIDE_MAX', 'WIDE_MIN_PX']);
const LOCAL_BASE = /^[A-Z_]+_BASE$/;   // loopback test bases only (the modules accept nothing else)
export function publicEnv(env) { const o = {}; for (const [k, v] of Object.entries(env)) if (PUBLIC_ENV_ALLOW.includes(k) || (LOCAL_BASE.test(k) && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v))) o[k] = v; return o; }

function listData(dir) {
  const out = []; const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) out.push(r); } };
  walk(dir, ''); return out;
}
const digest = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const snapshot = (dir) => new Map(listData(dir).map(r => [r, digest(path.join(dir, r))]));
const changed = (before, dir) => listData(dir).filter(r => before.get(r) !== digest(path.join(dir, r)));
const copy = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };
function atomicInstall(src, dest) {   // same-directory temp + fsync + rename: the destination is either the old or the complete new file
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = path.join(path.dirname(dest), '.' + path.basename(dest) + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.copyFileSync(src, tmp); const fd = fs.openSync(tmp, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, dest);
}
function codeCopy(dest) { fs.mkdirSync(path.join(dest, 'data'), { recursive: true }); for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) { if (['.git', 'node_modules', 'data'].includes(e.name)) continue; fs.cpSync(path.join(ROOT, e.name), path.join(dest, e.name), { recursive: true }); } }

// FAILED PRIVATE PASS: its side effects may already have happened (a nightly message with a SELL line, an owner-facing receipt), so its
// changed files are RETAINED as bounded PRIVATE quarantine evidence instead of being deleted with the temp copy. They are never current
// state (never installed at their own names, never restored as caches, never hydrated, never replayed, nothing is re-sent), they are
// data/private-* so the public save never publishes them, and the private route stores them when private mode saves; when it does not,
// the save fails visibly (save-data.sh exit 3). Bounds: 4 MiB per file, 32 MiB per failure, the newest 3 failures.
export const FAILED_PREFIX = 'private-failed-pass-', NOT_STATE = /^private-(failed-pass|conflict)-/;
export const FAILED_LIMITS = Object.freeze({ fileBytes: 4 << 20, totalBytes: 32 << 20, keep: 3 });
export function retainFailedPrivate(box, before, info, { data = DATA, now = Date.now(), limits = FAILED_LIMITS } = {}) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-'), kept = [], skipped = []; let total = 0;
  for (const r of changed(before, path.join(box, 'data'))) { const src = path.join(box, 'data', r); let size; try { size = fs.statSync(src).size; } catch { skipped.push({ r, why: 'unreadable' }); continue; }
    if (size > limits.fileBytes || total + size > limits.totalBytes) { skipped.push({ r, why: 'over bound', size }); continue; }
    atomicInstall(src, path.join(data, FAILED_PREFIX + stamp + '__' + r.replace(/\//g, '__'))); total += size; kept.push(r); }
  const idx = path.join(data, FAILED_PREFIX + stamp + '.json'), tmp = idx + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, kind: 'QUARANTINE: failed private pass evidence; not current state; never replayed or re-sent', at: new Date(now).toISOString(), ...info, retained: kept, skipped }, null, 1), { mode: 0o600 }); fs.renameSync(tmp, idx);
  const stamps = [...new Set(fs.readdirSync(data).filter(n => n.startsWith(FAILED_PREFIX)).map(n => n.slice(FAILED_PREFIX.length).split(/__|\.json$/)[0]))].sort();
  for (const old of stamps.slice(0, Math.max(0, stamps.length - limits.keep))) for (const n of fs.readdirSync(data)) if (n.startsWith(FAILED_PREFIX + old)) fs.rmSync(path.join(data, n), { force: true });
  return { stamp, kept, skipped };
}
export function runPasses({ env = process.env, log = (s) => process.stdout.write(s + '\n'), timeoutMs = 6 * 3600e3 } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-')), pubBox = path.join(work, 'public'), privBox = path.join(work, 'private'), cache = path.join(work, 'fetch-cache');
  try {
    // ---- 1. PUBLIC PASS (isolated)
    codeCopy(pubBox);
    let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(DATA, MANIFEST), 'utf8')); } catch {}
    let quarantined = 0;
    for (const r of listData(DATA)) { if (seedAllowed(r, manifest, (x) => digest(path.join(DATA, x)))) copy(path.join(DATA, r), path.join(pubBox, 'data', r)); else if (!isPrivate(r.split('/')[0])) quarantined++; }
    log('two-pass scan: public seed inputs exclude ' + quarantined + ' tainted or unverified files');
    const pubBefore = snapshot(path.join(pubBox, 'data'));
    const pub = spawnSync(process.execPath, ['scan.mjs'], { cwd: pubBox, env: { ...publicEnv(env), MODE: 'daily', SCAN_PASS: 'public', SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'record' }, encoding: 'utf8', maxBuffer: 256 << 20, timeout: timeoutMs, killSignal: 'SIGKILL' });
    if (pub.stdout) log(pub.stdout.trimEnd()); if (pub.stderr) log(pub.stderr.trimEnd());
    const pubOk = pub.status === 0 && !pub.signal;
    const publicOut = pubOk ? changed(pubBefore, path.join(pubBox, 'data')).filter(r => !isPrivate(r.split('/')[0]) && !TAINTED_SEEDS.includes(r)) : [];
    if (pubOk) { const files = {}, prev = manifest && manifest.files ? manifest.files : {};
      for (const r of SCAN_OUTPUTS) { const f = path.join(pubBox, 'data', r); if (!fs.existsSync(f)) continue; if (publicOut.includes(r) || prev[r] === digest(f)) files[r] = digest(f); }
      fs.writeFileSync(path.join(pubBox, 'data', MANIFEST), JSON.stringify({ v: 1, files }, null, 1)); publicOut.push(MANIFEST); }
    log('two-pass scan: public pass ' + (pubOk ? 'OK, ' + publicOut.length + ' public files' : 'FAILED (exit ' + pub.status + (pub.signal ? ', ' + pub.signal : '') + '); public files left unchanged'));

    // ---- 2. PRIVATE PASS (isolated copy of the full real state)
    codeCopy(privBox);
    const realAtCopy = snapshot(DATA);   // owner files changed after this point (e.g. by the bot) are never overwritten with older bytes
    for (const r of listData(DATA)) if (!NOT_STATE.test(r)) copy(path.join(DATA, r), path.join(privBox, 'data', r));   // quarantine/conflict evidence is never scan input
    for (const r of listData(DATA)) { if (!r.startsWith('private-') || NOT_STATE.test(r)) continue; const pub2 = r.slice('private-'.length).replace(/__/g, '/');
      if (!isPrivate(pub2.split('/')[0])) copy(path.join(DATA, r), path.join(privBox, 'data', pub2)); }   // owner's full-state caches
    let pubAt = null; if (pubOk) { try { pubAt = JSON.parse(fs.readFileSync(path.join(pubBox, 'data', 'signals.json'), 'utf8')).generatedAt; } catch {} }
    const privBefore = snapshot(path.join(privBox, 'data'));
    const priv = spawnSync(process.execPath, ['scan.mjs'], { cwd: privBox, env: { ...env, MODE: 'daily', SCAN_PASS: 'private', SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'replay', ...(pubAt ? { SCAN_GENERATED_AT: pubAt } : {}) }, encoding: 'utf8', maxBuffer: 256 << 20, timeout: timeoutMs, killSignal: 'SIGKILL' });
    const privOk = priv.status === 0 && !priv.signal;
    const sinkTmp = path.join(work, 'private-scan-stdout.log'); fs.writeFileSync(sinkTmp, (priv.stdout || '') + (priv.stderr || ''), { mode: 0o600 });

    // ---- 3a. FIRST: private results to PRIVATE paths only (completed private pass only)
    if (privOk) {
      for (const r of changed(privBefore, path.join(privBox, 'data'))) {
        const top = r.split('/')[0], src = path.join(privBox, 'data', r);
        const dest = path.join(DATA, isPrivate(top) ? r : privateName(r));   // owner files in place; everything else as data/private-<name>
        if (isPrivate(top) && !top.startsWith('private-') && digest(dest) !== (realAtCopy.get(r) ?? null)) {   // changed concurrently: keep the newer owner bytes
          atomicInstall(src, path.join(DATA, 'private-conflict-' + r.replace(/\//g, '__'))); log('two-pass scan: ' + 'an owner file changed during the scan; the newer copy was kept and the scan copy set aside privately'); continue; }
        atomicInstall(src, dest);
      }
    }
    if (!privOk) { try { const q = retainFailedPrivate(privBox, privBefore, { exit: priv.status, signal: priv.signal || null });
        log('two-pass scan: the failed private pass changed ' + (q.kept.length + q.skipped.length) + ' files; ' + q.kept.length + ' kept privately as quarantine evidence (' + FAILED_PREFIX + q.stamp + '), not as current state' + (q.skipped.length ? '; ' + q.skipped.length + ' over the size bound NOT kept' : ''));
      } catch (e) { log('two-pass scan: Error: the failed private pass evidence could NOT be retained (' + (e.code || e.message) + ')'); } }
    // private sink after the private results (a sink failure must not lose them); a failure is reported and fails the run visibly
    let sinkOk = true; try { atomicInstall(sinkTmp, env.PRIVATE_SCAN_LOG || path.join(DATA, 'private-scan-stdout.log')); } catch (e) { sinkOk = false; log('two-pass scan: Error: the private log could not be stored (' + e.code + '); private results were kept'); }
    log('two-pass scan: private pass ' + (privOk ? 'OK' : 'FAILED (exit ' + priv.status + (priv.signal ? ', ' + priv.signal : '') + '); owner files left as they were') + ' (its output is private)');
    // ---- 3b. LAST: validated public outputs to public names
    for (const r of publicOut) { if (isPrivate(r.split('/')[0])) continue; atomicInstall(path.join(pubBox, 'data', r), path.join(DATA, r)); }
    return { publicStatus: pubOk ? 0 : (pub.status ?? 1), privateStatus: privOk ? (sinkOk ? 0 : 4) : (priv.status ?? 1), publicOut };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = runPasses(); process.exit(r.privateStatus === 0 ? 0 : (r.privateStatus || 1));
}
