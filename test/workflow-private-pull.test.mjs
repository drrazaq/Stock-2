// Cutover wiring (P0 Route A): after the private-data cutover the owner's files exist only in the private repository. Every workflow whose
// scripts (local import closure) read an owner file must PULL them in each job (private mode only; fail-closed: an unreadable private
// repository stops the job, never a run on missing holdings/marks/settings). A pulling workflow never stages them publicly: no bare
// git add data / -A (the guard's stage phase stages data/ except every private path). news-watch's owner-derived outputs are private files
// saved only through the private route; a failed private save fails the job visibly. Static source checks; no workflow is run.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'), WF = path.join(ROOT, '.github/workflows');
const priv = fs.readFileSync(path.join(ROOT, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const OWNER = new RegExp("['\"`]data/(" + priv.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ")['\"`]|readSignals\\(|ownerQuietOff\\(");
const closure = (s) => { const seen = new Set(), q = [...s]; while (q.length) { const f = q.pop(); if (seen.has(f) || !fs.existsSync(path.join(ROOT, f))) continue; seen.add(f);
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/(?:from|import\()\s*['"]\.\/([^'"]+)['"]/g)) q.push(m[1]); } return seen; };
const readers = fs.readdirSync(WF).filter(f => f.endsWith('.yml')).filter(w => { const y = fs.readFileSync(path.join(WF, w), 'utf8');
  const scripts = [...new Set([...y.matchAll(/node\s+(?:\.\/)?([A-Za-z0-9_.\-]+\.mjs)/g)].map(m => m[1]))];
  return [...closure(scripts)].some(m => OWNER.test(fs.readFileSync(path.join(ROOT, m), 'utf8'))); });
test('every workflow that reads owner files pulls them after each checkout, in private mode only, fail-closed', () => {
  assert.ok(readers.length >= 26, 'owner-reading workflows: ' + readers.length);
  for (const w of readers) { const y = fs.readFileSync(path.join(WF, w), 'utf8');
    const checkouts = (y.match(/- uses: actions\/checkout@/g) || []).length, pulls = (y.match(/private-data\.sh pull/g) || []).length;
    assert.ok(pulls >= Math.min(1, checkouts), w + ': pulls the private owner files');
    if (w === 'bot.yml' || w === 'main.yml') continue;   // their own audited pull steps (fail-closed, cycle/job level)
    assert.equal((y.match(/Private owner files \(P0; private mode only; fail-closed/g) || []).length, checkouts, w + ': one pull step per checkout');
    assert.doesNotMatch(y, /Private owner files[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\|\| true/, w + ': the pull is never made non-fatal'); }
});
test('a pulling workflow never stages data/ with a bare git add (owner files would be staged)', () => {
  for (const w of readers) { const y = fs.readFileSync(path.join(WF, w), 'utf8'); assert.doesNotMatch(y, /^\s*git add (data|-A|--all|\.)\s*$/m, w); }
});
test('news-watch outputs are private files: never committed publicly; saved privately; a failed private save fails the job', () => {
  for (const f of ['news-log.jsonl', 'news-meta.json', 'news-seen.json']) assert.ok(priv.includes(f), f);
  const y = fs.readFileSync(path.join(WF, 'news.yml'), 'utf8');
  assert.doesNotMatch(y, /git add[^\n]*news-(log|meta|seen)/); assert.match(y, /private-data\.sh push \|\| \{ PF=1;/); assert.match(y, /\[ "\$PF" = 0 \] \|\| exit 1/);
});
