// Producer split, lab halal field (P0 Route A): research labs used to copy the owner's own ZAD marks (data/halal.json) into the per-symbol
// halal label of their committed public outputs (a symbol <-> owner-mark association). Label-only labs now use the PUBLIC ZAD not-halal
// list only ('fail' or 'unknown'); scan.mjs applies the owner's own marks privately (myHalal) wherever a lab label is read. The remaining
// readers are DECLARED below with their class and are pending a private-output route (their owner-mark use filters a universe or a
// candidate set, so changing the mark source would change research results). Any NEW reader of the owner marks fails this test.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const READS = /(J|readJson|read|readFileSync)\(\s*'data\/halal\.json'/;
export const PENDING_OWNER_MARK_READERS = Object.freeze({
  'squad3-lab.mjs': 'B: backtest candidate filter (owner fail marks)', 'fastmover-lab.mjs': 'B: universe filter (owner fail marks)',
  'intraday-radar.mjs': 'B: universe filter (owner fail marks)', 'league.mjs': 'B: pick filter (owner fail marks)',
  'ignition-watch.mjs': 'B: live watcher filter (owner fail marks; owner-facing alerts)', 'follow-lane.mjs': 'B: call filter/labels',
  'opportunity-radar.mjs': 'B: owner-facing radar halal map', 'quality.mjs': 'B: universe filter (owner fail marks)',
  'squad19-lab.mjs': 'B: candidate labels/filters', 'agent-a-lab.mjs': 'C: fund allowed-set from owner ok marks',
  'options-survey.mjs': 'C: universe = owner ok marks', 'event-orb-retest-events.mjs': 'C: universe = owner ok marks',
  'account-replay-lab.mjs': 'C: replay set from owner ok marks' });
const mods = fs.readdirSync(ROOT).filter(f => f.endsWith('.mjs') && f !== 'scan.mjs');
test('only declared pending modules read the owner\'s own ZAD marks (no new reader)', () => {
  const readers = mods.filter(f => READS.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))).sort();
  assert.deepEqual(readers, Object.keys(PENDING_OWNER_MARK_READERS).sort());
});
test('switched labs publish the PUBLIC ZAD gate only: their halal helper never yields an owner "ok"', () => {
  const done = mods.filter(f => /P0: (the )?PUBLIC ZAD list only|P0: public ZAD list only|halalMark gives the PUBLIC ZAD list/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  assert.ok(done.length >= 40, 'switched labs: ' + done.length);
  for (const f of done) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); assert.doesNotMatch(s, /HAL\[/, f); assert.doesNotMatch(s, READS, f); }
});
test('every scan.mjs reader of a lab halal label also applies the owner\'s own mark privately (myHalal)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8');
  for (const m of src.matchAll(/[a-z]\.halal (===|!==) '(ok|fail)'/g)) { const line = src.slice(src.lastIndexOf('\n', m.index), src.indexOf('\n', m.index));
    assert.match(line, /myHalal\(/, 'owner mark applied: ' + line.trim().slice(0, 80)); }
  assert.match(src, /const ok = \(sym, hal\) => sym && hal !== 'fail' && !bad\.has\(sym\) && myHalal\(sym\) !== 'fail'/);
});
