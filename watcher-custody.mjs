// WATCHER RESERVATION CUSTODY (P0, Codex 6854715808 (2); development source preparation, NOTHING here runs a migration or a private write).
//   node watcher-custody.mjs prepare OUTDIR   OFFLINE: builds the reviewed custody import from THIS public checkout: every existing public
//                                              reservation under data/watcher-message-state/ plus CUSTODY.json {version, publicRepo,
//                                              publicCommit, files: {path: git blob id}}. Writes only OUTDIR; no network, no push.
//   node watcher-custody.mjs admit            private mode only, read-only on both repositories. ADMITTED only when ALL hold:
//     1. the private clone is bound to the declared private repository and its newest commit carries CUSTODY.json;
//     2. old-writer QUIESCENCE: this public checkout's namespace is byte-identical to the custody snapshot (same files, same blob ids), so
//        no public writer changed or added a reservation after custody (a content check, valid on a shallow checkout);
//     3. every custody reservation exists privately, either byte-identical or a valid later state of the same key: never a regression
//        (UNSENT < RESERVED < ACKNOWLEDGED/UNCERTAIN, and a terminal public state must stay exactly that state).
//   Then, and only then, it installs the private namespace into this checkout (readers see the private state) and writes the job receipt
//   that watcher-reservation-route.mjs requires. Anything else: NOT ADMITTED with a fixed reason code; nothing installed, no receipt, so
//   the private route stays closed and no delivered or uncertain message can be replayed from a blank namespace.
// Public output is a fixed status line only (no file names, keys or states).
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { PRIVATE_REPO_URL, privateCloneDir, custodyReceipt, privateGitEnv } from './private-repo-binding.mjs';
const NS = 'data/watcher-message-state', REC = /^\d{4}-\d\d-\d\d\/[a-f0-9]{64}\.json$/, RANK = { UNSENT: 0, RESERVED: 1, ACKNOWLEDGED: 2, UNCERTAIN: 2 };
const g = (cwd, args, env = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env }, maxBuffer: 256 << 20 });
function tree(cwd, rev) {   // { relpath: blob } of the namespace at rev (records only)
  const out = {}; let raw = ''; try { raw = g(cwd, ['ls-tree', '-r', '-z', rev, '--', NS + '/']); } catch { return null; }
  for (const e of raw.split('\0').filter(Boolean)) { const [meta, p] = e.split('\t'); const rel = p.slice(NS.length + 1); if (REC.test(rel)) out[rel] = meta.split(' ')[2]; }
  return out;
}
const valid = (r, rel) => r && r.version === 2 && r.keySha256 === rel.slice(11, 75) && r.day === rel.slice(0, 10) && r.state in RANK;
export function admit({ root = process.cwd(), env = process.env } = {}) {
  const no = (reason) => ({ status: 'NOT_ADMITTED', reason });
  if (!fs.existsSync(path.join(root, '.github/private-data-mode'))) return no('NOT_PRIVATE_MODE');
  const dir = privateCloneDir(env), url = PRIVATE_REPO_URL(env), auth = privateGitEnv(env);
  let tip, custody;
  try { if (g(dir, ['remote', 'get-url', 'origin']).trim() !== url) return no('CLONE_NOT_BOUND'); } catch { return no('CLONE_MISSING'); }
  try { g(dir, ['fetch', '-q', 'origin'], auth); const br = g(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); tip = g(dir, ['rev-parse', 'origin/' + br]).trim(); } catch { return no('PRIVATE_UNREADABLE'); }
  try { custody = JSON.parse(g(dir, ['show', tip + ':' + NS + '/CUSTODY.json'])); } catch { return no('NO_CUSTODY_RECORD'); }
  if (!custody || custody.version !== 1 || !/^[0-9a-f]{40}$/.test(custody.publicCommit || '') || typeof custody.files !== 'object') return no('CUSTODY_INVALID');
  const pub = tree(root, 'HEAD'); if (!pub) return no('PUBLIC_UNREADABLE');
  const ck = Object.keys(custody.files).sort(), pk = Object.keys(pub).sort();
  if (ck.length !== pk.length || ck.some((k, i) => k !== pk[i] || custody.files[k] !== pub[k])) return no('PUBLIC_WRITER_NOT_QUIESCENT');
  const priv = tree(dir, tip); if (!priv) return no('PRIVATE_UNREADABLE');
  for (const rel of ck) {
    if (!priv[rel]) return no('CUSTODY_INCOMPLETE');
    if (priv[rel] === custody.files[rel]) continue;
    let a, b; try { a = JSON.parse(g(root, ['show', 'HEAD:' + NS + '/' + rel])); b = JSON.parse(g(dir, ['show', tip + ':' + NS + '/' + rel])); } catch { return no('STATE_UNREADABLE'); }
    if (!valid(a, rel) || !valid(b, rel)) return no('STATE_INVALID');
    if (RANK[b.state] < RANK[a.state] || (RANK[a.state] === 2 && b.state !== a.state)) return no('STATE_REGRESSION');
  }
  for (const rel of Object.keys(priv)) { const dest = path.join(root, NS, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.custody.tmp'; fs.writeFileSync(tmp, g(dir, ['show', tip + ':' + NS + '/' + rel])); fs.renameSync(tmp, dest); }
  const receipt = { status: 'ADMITTED', url, privateCommit: tip, publicCommit: custody.publicCommit, at: new Date().toISOString() };
  fs.writeFileSync(custodyReceipt(env), JSON.stringify(receipt), { mode: 0o600 });
  return receipt;
}
export function prepare(out, { root = process.cwd() } = {}) {
  const head = g(root, ['rev-parse', 'HEAD']).trim(), files = tree(root, 'HEAD') || {};
  for (const rel of Object.keys(files)) { const dest = path.join(out, NS, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, g(root, ['show', 'HEAD:' + NS + '/' + rel])); }
  fs.mkdirSync(path.join(out, NS), { recursive: true });
  const custody = { version: 1, publicRepo: 'drrazaq/stock-2', publicCommit: head, files };
  fs.writeFileSync(path.join(out, NS, 'CUSTODY.json'), JSON.stringify(custody, null, 1) + '\n');
  return { files: Object.keys(files).length, publicCommit: head };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const mode = process.argv[2];
  if (mode === 'admit') { const r = admit(); console.log('watcher custody: ' + (r.status === 'ADMITTED' ? 'ADMITTED' : 'NOT ADMITTED (' + r.reason + '); private reservations stay closed')); process.exit(r.status === 'ADMITTED' ? 0 : 3); }
  else if (mode === 'prepare' && process.argv[3]) { const r = prepare(process.argv[3]); console.log('watcher custody import prepared offline: ' + r.files + ' reservations (not pushed)'); }
  else { console.log('usage: watcher-custody.mjs admit | prepare OUTDIR'); process.exit(2); }
}
