// TWO-PASS NIGHTLY SCAN (P0 Route A, development; not wired into any workflow).
// The public files written by the nightly scan must not depend on the owner's private state (ZAD marks, holdings, private watch list,
// tips, settings, private caches). Both passes run in ISOLATED temporary copies; the real checkout only ever receives
//   (a) FIRST, from a COMPLETED private pass: updated private-listed owner files and data/private-<name> copies of the private pass's
//       other outputs, each written atomically (temp file in the same directory + rename) to a private path;
//   (b) LAST, from a COMPLETED public pass: the validated public outputs, each written atomically to its public name.
// A crash, kill or timeout at any point therefore leaves every public path as it was and never puts private bytes at a public name, even
// transiently; owner files are only ever replaced by a completed private pass's versions (never deleted).
// 1. PUBLIC PASS: sandbox holding only the declared code copy and the positively declared public inputs (map below); its
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

// ---- Public-pass INPUT/SOURCE MAP (positive; reviewed 13 Nov 2026, Codex 6851464418). Nothing is trusted by default.
// A data file enters the public sandbox ONLY if it is declared here:
//  (a) PUBLIC_SEEDS: a declared public source with its producer and basis. Today only hand-maintained reference files qualify (no module
//      or workflow writes them; a drift test proves it). A runtime producer can be added only when its whole module closure AND every
//      data file it reads are themselves declared public (transitive); the producer audit found none yet: every lab/study/discovery
//      producer reads owner state directly (halal marks, settings, holdings, the hydrating signals reader) or reads such a file.
//  (b) SCAN_OUTPUTS: files the public pass itself writes, admitted as next-night seeds only when their bytes match the last public-pass
//      manifest (a legacy copy written by the old single-pass scan is never trusted).
// Everything else (owner files, data/private-*, owner-derived and UNKNOWN/unmapped inputs) is quarantined: never copied into the public
// sandbox. The private pass keeps the full real state, evidence and gates. Unknown is never presumed owner-independent.
export const PUBLIC_SEEDS = Object.freeze({
  'chains.json': Object.freeze({ kind: 'REFERENCE', producer: 'hand-maintained in git; no module or workflow writes it', basis: 'value-chain membership research list (company groups only; no owner data)' }),
  'zad-list.json': Object.freeze({ kind: 'REFERENCE', producer: 'hand-maintained in git; no module or workflow writes it', basis: "ZAD's published quarterly not-halal list: the PUBLIC gate (ZAD_PUBLIC_NOT); carries none of the owner's own marks" }),
});
export const SCAN_OUTPUTS = Object.freeze(['alert-state.json', 'dow-study.json', 'engine-history.jsonl', 'experiments.jsonl', 'fm-state.json', 'journal.jsonl', 'leaders.json', 'lessons.json',
  'mday-study.json', 'models.json', 'names.json', 'options-probe.json', 'outcomes.json', 'sectors.json', 'sic-extra.json', 'signals.json',
  'skipped.jsonl', 'spy-closes.json', 'switch-paper.json', 'timing-study.json']);
export const MANIFEST = 'public-pass-manifest.json';
// Owner-state outputs (Codex 6851609156): after a COMPLETED private pass, each of these has its complete private state at
// data/private-<name> (installed even when unchanged tonight), so owner-context readers in scan.mjs (dataPath/OWNER_MAPPED, kept equal
// by a test) never fall back to the smaller public projection. A private copy written concurrently (the bot, intraday) keeps the newer
// bytes; the scan copy is set aside as data/private-conflict-<name>.
export const OWNER_STATE_OUTPUTS = Object.freeze(['alert-state.json', 'dow-study.json', 'engine-history.jsonl', 'experiments.jsonl', 'fm-state.json', 'journal.jsonl',
  'leaders.json', 'lessons.json', 'mday-study.json', 'models.json', 'names.json', 'options-probe.json', 'outcomes.json', 'sectors.json', 'sic-extra.json',
  'skipped.jsonl', 'spy-closes.json', 'switch-paper.json', 'timing-study.json', 'tier2-ledger.jsonl', 'options-shadow.json']);
export function seedClass(rel, manifest, hashOf) {
  const top = rel.split('/')[0];
  if (isPrivate(top) || isPrivate(rel)) return 'PRIVATE';
  if (rel === MANIFEST) return 'MANIFEST';
  if (SCAN_OUTPUTS.includes(rel)) return manifest && manifest.files && manifest.files[rel] && manifest.files[rel] === hashOf(rel) ? 'SCAN_OUTPUT_VERIFIED' : 'SCAN_OUTPUT_UNVERIFIED';
  if (Object.hasOwn(PUBLIC_SEEDS, rel)) return 'DECLARED_PUBLIC';
  return 'UNKNOWN';
}
export const seedAllowed = (rel, manifest, hashOf) => ['SCAN_OUTPUT_VERIFIED', 'DECLARED_PUBLIC'].includes(seedClass(rel, manifest, hashOf));
// Source tree copied into each sandbox: code modules, the page whose logic block the scanner executes (index.html, read only) and the
// public default watch list. No docs, logs, run triggers, tools, tests, .github or any other root file is admitted.
export const CODE_COPY = Object.freeze({ pattern: /^[A-Za-z0-9_.-]+\.(mjs|js|cjs)$/, files: Object.freeze(['index.html', 'watchlist.txt']) });
export const codeAllowed = (name) => CODE_COPY.pattern.test(name) || CODE_COPY.files.includes(name);

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
function codeCopy(dest) { fs.mkdirSync(path.join(dest, 'data'), { recursive: true }); for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) { if (e.isFile() && codeAllowed(e.name)) fs.copyFileSync(path.join(ROOT, e.name), path.join(dest, e.name)); } }

// FAILED PRIVATE PASS: its side effects may already have happened (a nightly message with a SELL line, an owner-facing receipt), so its
// changed files are RETAINED as PRIVATE quarantine evidence instead of being deleted with the temp copy. They are never current state
// (never installed at their own names, never restored as caches, never hydrated, never replayed, nothing is re-sent), they are
// data/private-* so the public save never publishes them, and the private route stores them when private mode saves; when it does not,
// the save fails visibly. Retention rules (Codex 6851524938):
//  - CRITICAL records (owner files, send state and send ledgers) are ALWAYS retained, whatever their size; only OPTIONAL files (model and
//    cache outputs) over 4 MiB each / 32 MiB per failure are skipped, and each skip is listed explicitly.
//  - Nothing unresolved is ever pruned or deleted. A failure set stays UNRESOLVED until an explicitly reviewed disposition record
//    (data/private-failed-pass-<stamp>.disposition.json with resolved:true) exists; even then its files are kept (no deletion here).
//  - ADMISSION: when 3 unresolved sets exist, or their bytes plus room for tonight's critical records would pass 256 MiB, the private
//    pass is NOT run (no new private computation, no owner-facing side effect) and the run fails with an explicit coverage status.
export const FAILED_PREFIX = 'private-failed-pass-', NOT_STATE = /^private-(failed-pass|conflict|stale|unknown)-/;
export const FAILED_LIMITS = Object.freeze({ fileBytes: 4 << 20, optionalBytes: 32 << 20, unresolvedSets: 3, unresolvedBytes: 256 << 20 });
export const SEND_STATE = Object.freeze(['alert-state.json', 'tg-state.json', 'tg-failures.jsonl']);
const STAMP = /^private-failed-pass-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)(?:__|\.json$|\.disposition\.json$)/;
export const isCritical = (r) => { const top = r.split('/')[0]; return (isPrivate(top) && !top.startsWith('private-')) || SEND_STATE.includes(r) || top === 'watcher-message-state'; };
export function failedSets(data = DATA) {
  const sets = new Map();
  for (const n of fs.readdirSync(data)) { const m = n.match(STAMP); if (!m) continue; const e = sets.get(m[1]) || { stamp: m[1], bytes: 0, resolved: false };
    if (n.endsWith('.disposition.json')) { try { e.resolved = JSON.parse(fs.readFileSync(path.join(data, n), 'utf8')).resolved === true; } catch {} }
    else { try { e.bytes += fs.statSync(path.join(data, n)).size; } catch {} }
    sets.set(m[1], e); }
  return [...sets.values()].sort((x, y) => x.stamp.localeCompare(y.stamp));
}
export function privateAdmission(data = DATA, limits = FAILED_LIMITS) {
  const open = failedSets(data).filter(e => !e.resolved), openBytes = open.reduce((t, e) => t + e.bytes, 0);
  let critical = 0; for (const r of listData(data)) if (isCritical(r)) { try { critical += fs.statSync(path.join(data, r)).size; } catch {} }
  const need = critical * 2 + (1 << 20);   // tonight's critical records could change; margin for the index
  if (open.length >= limits.unresolvedSets) return { ok: false, reason: open.length + ' unresolved failed-pass evidence sets (limit ' + limits.unresolvedSets + ')', open };
  if (openBytes + need > limits.unresolvedBytes) return { ok: false, reason: 'unresolved failed-pass evidence would exceed ' + (limits.unresolvedBytes >> 20) + ' MiB with room for tonight\'s critical records', open };
  return { ok: true, open };
}
export function retainFailedPrivate(box, before, info, { data = DATA, now = Date.now(), limits = FAILED_LIMITS } = {}) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-'), kept = [], critical = [], skipped = []; let optional = 0;
  for (const r of changed(before, path.join(box, 'data'))) { const src = path.join(box, 'data', r), crit = isCritical(r); let size;
    try { size = fs.statSync(src).size; } catch { skipped.push({ r, why: 'unreadable', critical: crit }); continue; }
    if (!crit && (size > limits.fileBytes || optional + size > limits.optionalBytes)) { skipped.push({ r, why: 'optional file over the size bound', size }); continue; }
    atomicInstall(src, path.join(data, FAILED_PREFIX + stamp + '__' + r.replace(/\//g, '__'))); kept.push(r); if (crit) critical.push(r); else optional += size; }
  const idx = path.join(data, FAILED_PREFIX + stamp + '.json'), tmp = idx + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 2, kind: 'QUARANTINE: failed private pass evidence; not current state; never replayed or re-sent; UNRESOLVED until a reviewed disposition record exists', at: new Date(now).toISOString(), ...info, retained: kept, critical, skipped }, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, idx);
  return { stamp, kept, critical, skipped };
}
export function runPasses({ env = process.env, log = (s) => process.stdout.write(s + '\n'), timeoutMs = 6 * 3600e3 } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-')), pubBox = path.join(work, 'public'), privBox = path.join(work, 'private'), cache = path.join(work, 'fetch-cache');
  try {
    // ---- 1. PUBLIC PASS (isolated)
    codeCopy(pubBox);
    let manifest = null; try { manifest = JSON.parse(fs.readFileSync(path.join(DATA, MANIFEST), 'utf8')); } catch {}
    const seeds = {};
    for (const r of listData(DATA)) { const c = seedClass(r, manifest, (x) => digest(path.join(DATA, x))); seeds[c] = (seeds[c] || 0) + 1; if (c === 'SCAN_OUTPUT_VERIFIED' || c === 'DECLARED_PUBLIC') copy(path.join(DATA, r), path.join(pubBox, 'data', r)); }
    log('two-pass scan: public seed inputs by class (only DECLARED_PUBLIC and SCAN_OUTPUT_VERIFIED enter): ' + Object.entries(seeds).filter(([k]) => k !== 'PRIVATE').sort().map(([k, v]) => k + ' ' + v).join(', '));   // the private-file count is owner metadata: never in the public log
    const pubBefore = snapshot(path.join(pubBox, 'data'));
    const pub = spawnSync(process.execPath, ['scan.mjs'], { cwd: pubBox, env: { ...publicEnv(env), MODE: 'daily', SCAN_PASS: 'public', SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'record' }, encoding: 'utf8', maxBuffer: 256 << 20, timeout: timeoutMs, killSignal: 'SIGKILL' });
    if (pub.stdout) log(pub.stdout.trimEnd()); if (pub.stderr) log(pub.stderr.trimEnd());
    const pubOk = pub.status === 0 && !pub.signal;
    const pubChanged = pubOk ? changed(pubBefore, path.join(pubBox, 'data')) : [], publicOut = pubChanged.filter(r => SCAN_OUTPUTS.includes(r) && !isPrivate(r.split('/')[0]));   // declared public outputs only
    const undeclared = pubChanged.filter(r => !publicOut.includes(r)); if (undeclared.length) log('two-pass scan: ' + undeclared.length + ' undeclared public-pass outputs were NOT installed: ' + undeclared.sort().join(' '));
    if (pubOk) { const files = {}, prev = manifest && manifest.files ? manifest.files : {};
      for (const r of SCAN_OUTPUTS) { const f = path.join(pubBox, 'data', r); if (!fs.existsSync(f)) continue; if (publicOut.includes(r) || prev[r] === digest(f)) files[r] = digest(f); }
      fs.writeFileSync(path.join(pubBox, 'data', MANIFEST), JSON.stringify({ v: 1, files }, null, 1)); publicOut.push(MANIFEST); }
    log('two-pass scan: public pass ' + (pubOk ? 'OK, ' + publicOut.length + ' public files' : 'FAILED (exit ' + pub.status + (pub.signal ? ', ' + pub.signal : '') + '); public files left unchanged'));

    // ---- 2. PRIVATE PASS (isolated copy of the full real state), only when unresolved failure evidence leaves room (see above)
    const adm = privateAdmission();
    if (!adm.ok) {
      log('two-pass scan: Error: PRIVATE PASS NOT RUN: ' + adm.reason + '. Not produced tonight: the owner nightly (ACTIONS, holding review, SELL checks, owner records). Separate protective paths (bot, stop and intraday checks) are not affected. Earlier evidence is kept; capacity is released only by a reviewed disposition record.');
      for (const r of publicOut) { if (isPrivate(r.split('/')[0])) continue; atomicInstall(path.join(pubBox, 'data', r), path.join(DATA, r)); }
      return { publicStatus: pubOk ? 0 : (pub.status ?? 1), privateStatus: 6, publicOut };
    }
    codeCopy(privBox);
    const realAtCopy = snapshot(DATA);   // owner files changed after this point (e.g. by the bot) are never overwritten with older bytes
    for (const r of listData(DATA)) if (!NOT_STATE.test(r)) copy(path.join(DATA, r), path.join(privBox, 'data', r));   // quarantine/conflict evidence is never scan input
    for (const r of listData(DATA)) { if (!r.startsWith('private-') || NOT_STATE.test(r)) continue; const pub2 = r.slice('private-'.length).replace(/__/g, '/');
      if (!isPrivate(pub2.split('/')[0])) copy(path.join(DATA, r), path.join(privBox, 'data', pub2)); }   // owner's full-state caches
    let pubAt = null; if (pubOk) { try { pubAt = JSON.parse(fs.readFileSync(path.join(pubBox, 'data', 'signals.json'), 'utf8')).generatedAt; } catch {} }
    const privBefore = snapshot(path.join(privBox, 'data'));
    const priv = spawnSync(process.execPath, ['scan.mjs'], { cwd: privBox, env: { ...env, MODE: 'daily', SCAN_PASS: 'private', SCAN_OWNER_REFRESH: path.join(ROOT, '.github/owner-latest.sh'), SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'replay', ...(pubAt ? { SCAN_GENERATED_AT: pubAt } : {}) }, encoding: 'utf8', maxBuffer: 256 << 20, timeout: timeoutMs, killSignal: 'SIGKILL' });
    const privOk = priv.status === 0 && !priv.signal;
    const sinkTmp = path.join(work, 'private-scan-stdout.log'); fs.writeFileSync(sinkTmp, (priv.stdout || '') + (priv.stderr || ''), { mode: 0o600 });

    // ---- 3a. FIRST: private results to PRIVATE paths only (completed private pass only)
    if (privOk) {
      for (const r of changed(privBefore, path.join(privBox, 'data'))) {
        if (OWNER_STATE_OUTPUTS.includes(r)) continue;   // installed below, with its own concurrent-update check
        const top = r.split('/')[0], src = path.join(privBox, 'data', r);
        const dest = path.join(DATA, isPrivate(top) ? r : privateName(r));   // owner files in place; everything else as data/private-<name>
        if (isPrivate(top) && !top.startsWith('private-') && digest(dest) !== (realAtCopy.get(r) ?? null)) {   // changed concurrently: keep the newer owner bytes
          atomicInstall(src, path.join(DATA, 'private-conflict-' + r.replace(/\//g, '__'))); log('two-pass scan: ' + 'an owner file changed during the scan; the newer copy was kept and the scan copy set aside privately'); continue; }
        atomicInstall(src, dest);
      }
      for (const r of OWNER_STATE_OUTPUTS) {   // complete private owner state for every owner gate, even when unchanged tonight
        const src = path.join(privBox, 'data', r), dest = path.join(DATA, privateName(r)); if (!fs.existsSync(src) || digest(src) === digest(dest)) continue;
        if (digest(dest) !== (realAtCopy.get(privateName(r)) ?? null)) { atomicInstall(src, path.join(DATA, 'private-conflict-' + r)); log('two-pass scan: a private owner-state file changed during the scan; the newer copy was kept and the scan copy set aside privately'); continue; }
        atomicInstall(src, dest); }
    }
    if (!privOk) { try { const q = retainFailedPrivate(privBox, privBefore, { exit: priv.status, signal: priv.signal || null });
        log('two-pass scan: the failed private pass changed ' + (q.kept.length + q.skipped.length) + ' files; ' + q.kept.length + ' kept privately as UNRESOLVED quarantine evidence (' + FAILED_PREFIX + q.stamp + ', ' + q.critical.length + ' critical), not as current state' + (q.skipped.length ? '; ' + q.skipped.length + ' optional files over the size bound NOT kept: ' + q.skipped.map(x => x.r).join(' ') : ''));
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
