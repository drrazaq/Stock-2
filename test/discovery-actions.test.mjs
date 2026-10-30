// Seam in scan.mjs for DISCOVERY ENGINE v2 (discovery2.mjs writes data/discovery2-today.json weekly):
//   discoveryLines(sig, pos)  the 'DISCOVERED (tier 2 ...)' section of ACTIONS: a buy appears ONLY when its rule's frozen newer-half verdict
//                             is TRADABLE SMALL (tier2 switch on, its own ledger 'discovery:<id>' not negative); one line with the entry
//                             range (next open up to +3%), the 15% stop, the sell date (hold), and the feature combination; halal
//                             (unknown -> 'check ZAD first'), lottery, offering filings, warnings and held stocks checked; each shown
//                             line logged once in data/tier2-ledger.jsonl as 'discovery:<id>'.
// Run: node test/discovery-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const sig = { session: '2026-10-23', stocks: [{ sym: 'AAA', last: 20 }, { sym: 'BBB', last: 50 }], lottery: {} };
const buy = (o = {}) => ({ rule: 'D2-003', sym: 'AAA', buy: '2026-10-26', sell: '2026-11-06', hold: 10, stopPct: 0.15, lastClose: 19.5, combo: 'signal-day volume vs its 50-day average at or above 3.7 AND consecutive up closes: none', halal: 'ok', ...o });
const today = (rules, buys = [buy()]) => ({ generatedAt: new Date().toISOString(), lastClose: '2026-10-23', sessions: ['2026-10-26', '2026-10-27'], rules: { 'D2-001': null, 'D2-003': null, ...rules }, buys });
const files = (rules, extra = {}, buys) => ({ 'data/settings.json': { tier2: true }, 'data/discovery2-today.json': today(rules, buys), 'data/halal.json': { AAA: { s: 'ok', d: new Date().toISOString().slice(0, 10) } }, ...extra });

test('no discovered rule at tier 2 -> ACTIONS shows nothing new and nothing is logged', async () => {
  const S = await loadScan({ files: files({}) });
  assert.deepEqual(S.fn('discoveryLines')(sig, {}), []);
  assert.throws(() => S.read('data/tier2-ledger.jsonl'));
});

test('TRADABLE SMALL -> one line: BUY at the next open up to +3%, stop 15%, sell date and hold, the feature combination; logged as discovery:D2-003', async () => {
  const S = await loadScan({ files: files({ 'D2-003': 'TRADABLE SMALL' }) });
  const out = S.fn('discoveryLines')(sig, {});
  assert.match(out[0], /^DISCOVERED \(tier 2/);
  const line = out.find(l => /BUY AAA/.test(l));
  assert.match(line, /BUY AAA at the open on 2026-10-26, up to 20\.60 /);
  assert.match(line, /STOP 15% under your buy/);
  assert.match(line, /SELL at the close on 2026-11-06 \(hold 10 sessions\)/);
  assert.match(line, /D2-003: signal-day volume vs its 50-day average at or above 3\.7 AND consecutive up closes: none/);
  const L = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.equal(L.length, 1); assert.equal(L[0].kind, 'discovery:D2-003'); assert.equal(L[0].px, 20);
});

test('halal unknown -> shown with "check ZAD first"; ZAD not halal, lottery-like, an offering filing, held, another buy day, a rule not at tier 2 -> not shown', async () => {
  const bs = [buy({ sym: 'BBB', halal: 'unknown' }), buy({ sym: 'NOTH', halal: 'fail' }), buy({ sym: 'LOTT' }), buy({ sym: 'OFFR' }), buy({ sym: 'HELD' }), buy({ sym: 'LATE', buy: '2026-10-27' }), buy({ sym: 'OTHR', rule: 'D2-001' })];
  const ev = { events: [{ sym: 'OFFR', f: 'OFFERING 424B5', p: new Date().toISOString() }] };
  const S = await loadScan({ files: files({ 'D2-003': 'TRADABLE SMALL' }, { 'data/events-recent.json': ev, 'data/halal.json': {} }, bs) });
  const out = S.fn('discoveryLines')({ ...sig, lottery: { LOTT: 0.2 } }, { HELD: { entry: 5 } }).join('\n');
  assert.match(out, /RESEARCH ONLY — MARK HALAL FIRST: BBB[^\n]*check ZAD first/);
  for (const s of ['NOTH', 'LOTT', 'OFFR', 'HELD', 'LATE', 'OTHR']) assert.doesNotMatch(out, new RegExp('BUY ' + s));
});

test('tier2 off -> nothing; its own ledger negative (20+ finished) -> off', async () => {
  let S = await loadScan({ files: { ...files({ 'D2-003': 'TRADABLE SMALL' }), 'data/settings.json': { tier2: false } } });
  assert.deepEqual(S.fn('discoveryLines')(sig, {}), []);
  const L = Array.from({ length: 20 }, (_, i) => ({ d: '2026-08-01', sym: 'S' + i, kind: 'discovery:D2-003', px: 10, out: '2026-09-01', px1: 9, pct: -0.108 }));
  S = await loadScan({ files: files({ 'D2-003': 'TRADABLE SMALL' }, { 'data/tier2-ledger.jsonl': L }) });
  assert.deepEqual(S.fn('discoveryLines')(sig, {}), []);
});

test('no network was used', () => { assert.deepEqual(blocked, []); });
