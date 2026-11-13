// TWO-PASS NIGHTLY SCAN (P0 Route A, development; not wired into any workflow).
// The public files written by the nightly scan must not depend on the owner's private state (ZAD marks, holdings, private watch list,
// tips, settings, private caches). Instead of filtering field by field, the scan runs twice:
// 1. PUBLIC PASS in a sandbox copy of the repository that contains NO private file (.github/private-files.txt) and NO data/private-*
//    cache, with no Telegram credentials. Every data/ file it writes is the public output set; only those are copied back.
// 2. PRIVATE PASS in the real checkout with the full state. Before it, each public output's private full-state copy
//    (data/private-<name>) is restored over the public name, so the owner's evaluation keeps its original evidence and gates. After it,
//    every non-private-listed data/ file it changed is moved to data/private-<name> and the public version (public-pass output, or the
//    original when the public pass failed) is put back. Owner messages and data/signals-private.json come only from this pass.
// Market data: the public pass records successful GET responses in a run-local cache (fetch-cache.mjs) that the private pass replays.
// Stdout: the public pass prints to this process's stdout (the public job log); the private pass prints only to PRIVATE_SCAN_LOG
// (a private sink, default data/private-scan-stdout.log, covered by the data/private-* save guard).
// Exit code: the private pass's (protective owner messages); a public-pass failure leaves every public file as it was.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process';

const ROOT = process.cwd(), DATA = path.join(ROOT, 'data');
const PRIVATE_NAMES = new Set(fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
const isPrivate = (name) => PRIVATE_NAMES.has(name) || name.startsWith('private-');
const privateName = (name) => 'private-' + name.replace(/\//g, '__');

function listData(dir) {   // relative file paths under data/, recursive
  const out = []; const walk = (d, rel) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.isFile()) out.push(r); } };
  walk(dir, ''); return out;
}
const digest = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { return null; } };
const snapshot = (dir) => new Map(listData(dir).map(r => [r, digest(path.join(dir, r))]));
const changed = (before, dir) => listData(dir).filter(r => before.get(r) !== digest(path.join(dir, r)));
const copy = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };

export function runPasses({ env = process.env, log = (s) => process.stdout.write(s + '\n') } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-passes-')), sandbox = path.join(work, 'public'), cache = path.join(work, 'fetch-cache');
  try {
    // ---- 1. public pass in a sandbox without any private file
    fs.mkdirSync(sandbox);
    for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'data') continue;
      fs.cpSync(path.join(ROOT, e.name), path.join(sandbox, e.name), { recursive: true });
    }
    for (const r of listData(DATA)) { const top = r.split('/')[0]; if (isPrivate(top) || isPrivate(r)) continue; copy(path.join(DATA, r), path.join(sandbox, 'data', r)); }
    const pubEnv = { ...env, SCAN_PASS: 'public', SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'record' };
    for (const k of ['TG_TOKEN', 'TG_CHAT', 'PRIVATE_DATA_TOKEN', 'PRIVATE_DATA_READ', 'ALPACA_KEY', 'ALPACA_SECRET']) delete pubEnv[k];
    const sandboxBefore = snapshot(path.join(sandbox, 'data'));
    const pub = spawnSync(process.execPath, ['scan.mjs'], { cwd: sandbox, env: pubEnv, encoding: 'utf8', maxBuffer: 256 << 20 });
    if (pub.stdout) log(pub.stdout.trimEnd()); if (pub.stderr) log(pub.stderr.trimEnd());
    const publicOut = pub.status === 0 ? changed(sandboxBefore, path.join(sandbox, 'data')).filter(r => !isPrivate(r.split('/')[0])) : [];
    log('two-pass scan: public pass ' + (pub.status === 0 ? 'OK, ' + publicOut.length + ' public files' : 'FAILED (exit ' + pub.status + '); public files left unchanged'));

    // ---- 2. private pass in the real checkout with the full state
    const originals = snapshot(DATA), saved = new Map();
    for (const r of listData(DATA)) { if (isPrivate(r.split('/')[0])) continue; saved.set(r, fs.readFileSync(path.join(DATA, r))); }
    for (const r of publicOut) { const p = path.join(DATA, privateName(r)); if (fs.existsSync(p)) copy(p, path.join(DATA, r)); }   // owner's full-state cache
    let pubAt = null; try { pubAt = JSON.parse(fs.readFileSync(path.join(sandbox, 'data', 'signals.json'), 'utf8')).generatedAt; } catch {}
    const privEnv = { ...env, SCAN_PASS: 'private', SCAN_FETCH_CACHE: cache, SCAN_FETCH_CACHE_MODE: 'replay', ...(pub.status === 0 && pubAt ? { SCAN_GENERATED_AT: pubAt } : {}) };
    const preRun = snapshot(DATA);
    const priv = spawnSync(process.execPath, ['scan.mjs'], { cwd: ROOT, env: privEnv, encoding: 'utf8', maxBuffer: 256 << 20 });
    const sink = env.PRIVATE_SCAN_LOG || path.join(DATA, 'private-scan-stdout.log');
    fs.mkdirSync(path.dirname(sink), { recursive: true }); fs.writeFileSync(sink, (priv.stdout || '') + (priv.stderr || ''), { mode: 0o600 });

    // ---- 3. every non-private file the private pass changed (and every public output) becomes a private copy; public versions go back
    const touched = new Set([...changed(preRun, DATA), ...publicOut, ...[...preRun.keys()].filter(r => !fs.existsSync(path.join(DATA, r)))]);
    for (const r of touched) {
      if (isPrivate(r.split('/')[0])) continue;
      const real = path.join(DATA, r);
      if (fs.existsSync(real)) { copy(real, path.join(DATA, privateName(r))); }
      if (publicOut.includes(r)) copy(path.join(sandbox, 'data', r), real);
      else if (saved.has(r)) { fs.mkdirSync(path.dirname(real), { recursive: true }); fs.writeFileSync(real, saved.get(r)); }
      else fs.rmSync(real, { force: true });
    }
    log('two-pass scan: private pass ' + (priv.status === 0 ? 'OK' : 'exit ' + priv.status) + ' (its output is private)');
    return { publicStatus: pub.status, privateStatus: priv.status, publicOut, originals };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = runPasses(); process.exit(r.privateStatus === 0 ? 0 : (r.privateStatus || 1));
}
