// LIBRARY MERGE for long study runs (leaders-study.yml save step). A study run starts from the library as it was at checkout (BASE)
// and ends with its own version (RUN); meanwhile other commits may have changed the library on main (NEWEST, after a fresh pull).
// Only what THIS run changed is re-applied on top of NEWEST: entries the run added, and per entry the fields whose value differs
// between BASE and RUN. Every other field keeps NEWEST's value, so edits pushed during the run are not reverted.
// Usage: node library-merge.mjs BASE.json RUN.json data/strategy-library.json   (the third file is NEWEST and is rewritten)
import fs from 'node:fs';
const [baseF, runF, newF] = process.argv.slice(2), J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const B = J(baseF), R = J(runF), N = J(newF), same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
if (!R || !N) { console.log('library-merge: ' + (!R ? 'no run library' : 'no newest library') + '; nothing merged'); process.exit(0); }
if (!B) { console.log('library-merge: no base copy; the newest library is kept unchanged (this run\'s library edits are NOT applied)'); process.exit(0); }
const byId = (L) => new Map((L.strategies || []).map(e => [e.id, e])), b = byId(B), n = byId(N);
let added = 0, changed = 0, removed = 0, skipped = 0;
for (const e of R.strategies || []) { const old = b.get(e.id), cur = n.get(e.id);
  if (!old) { if (cur) Object.assign(cur, e); else N.strategies.push(e); added++; continue; }
  if (same(old, e)) continue;
  if (!cur) { skipped++; console.log('library-merge: ' + e.id + ' was changed by this run but removed on main meanwhile; left removed'); continue; }
  for (const k of new Set([...Object.keys(old), ...Object.keys(e)])) if (!same(old[k], e[k])) { if (k in e) cur[k] = e[k]; else delete cur[k]; }
  changed++; }
const runIds = new Set((R.strategies || []).map(e => e.id));
for (const id of b.keys()) if (!runIds.has(id) && n.has(id)) { N.strategies = N.strategies.filter(e => e.id !== id); removed++; }
for (const k of Object.keys(R)) if (k !== 'strategies' && !same(B[k], R[k])) N[k] = R[k];
fs.writeFileSync(newF, JSON.stringify(N, null, 1));
console.log('library-merge: ' + added + ' added, ' + changed + ' changed, ' + removed + ' removed by this run re-applied on the newest library' + (skipped ? ', ' + skipped + ' skipped' : ''));
