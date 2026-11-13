// Owner gates read the COMPLETE private state, never the smaller public projection (Codex 6851609156). Two contexts with the same public
// files: the public tier2 ledger looks favourable (all +9%), the owner's complete private ledger holds losses. With the two-pass nightly
// live (manifest present) and a private record PAIRED to the published signals, the owner scorecard (which drives the TRY SMALL
// switch-off and the FOCUS gate rows) must show the private losses; with the private context missing or mismatched it must fail closed
// (no row is built from the public subset). Before the two-pass is live (no manifest) the legacy single-pass file is the full state.
// No threshold or count changes; synthetic data only; no network.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { loadScan, blocked } from './load-scan.mjs';
import { OWNER_STATE_OUTPUTS, NOT_STATE } from '../scan-passes.mjs';   // static: load-scan changes the working directory
const ROOT = path.resolve(import.meta.dirname, '..');
const rows30 = (pct) => Array.from({ length: 30 }, (_, i) => ({ d: '2026-09-' + String(10 + (i % 10)).padStart(2, '0'), sym: 'T' + i, kind: 'longer hold', px: 10, px1: +(10 * (1 + pct)).toFixed(2), pct, out: '2026-10-20' }));
const SIG = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000-05:00', market: { above50: true, up: true }, stocks: [], quick: [] };
const base = { 'data/settings.json': { tier2: true }, 'data/signals.json': SIG, 'data/tier2-ledger.jsonl': rows30(0.09) };
const tier2Row = (S) => { S.fn('scorecardText')(); return S.value('SC_ROWS').find(r => /TRADABLE SMALL/.test(r.engine)); };
test('control (legacy, two-pass not live): the single-pass file IS the full state and is read', async () => {
  const S = await loadScan({ files: base }); assert.match(tier2Row(S).verdict, /^POSITIVE/);
});
test('two-pass live + paired private record: private-only losses keep the owner row LOSING although the public projection looks favourable', async () => {
  const S = await loadScan({ files: { ...base, 'data/public-pass-manifest.json': { v: 1, files: {} }, 'data/private-signals.json': { ...SIG, posVerdict: {} }, 'data/private-tier2-ledger.jsonl': rows30(-0.06) } });
  const r = tier2Row(S); assert.ok(r, 'row built from the private state'); assert.doesNotMatch(r.verdict, /^POSITIVE/); assert.match(r.verdict, /LOSING|losing/);
});
for (const [name, extra] of [['private record missing', {}], ['private record not paired (other run)', { 'data/private-signals.json': { ...SIG, generatedAt: '2026-11-11T21:40:00.000-05:00' } }], ['private copy of the ledger missing', { 'data/private-signals.json': SIG }]])
  test('two-pass live + ' + name + ': fails closed, never promoted from the public subset', async () => {
    const S = await loadScan({ files: { ...base, 'data/public-pass-manifest.json': { v: 1, files: {} }, ...extra } });
    const r = tier2Row(S); assert.ok(!r || !/^POSITIVE/.test(r.verdict), 'no POSITIVE owner row from the public projection');
  });
test('owner-context writes go to the private copy (or to never-state scratch when the context is unknown), never to the public projection', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8');
  const bare = [...src.matchAll(/['"]data\/(outcomes|models|lessons|leaders|journal|names|skipped|fm-state|alert-state|timing-study|dow-study|mday-study|options-probe|sectors|sic-extra|spy-closes|engine-history|experiments|switch-paper|tier2-ledger|options-shadow)\.jsonl?['"]/g)]
    .filter(m => !src.slice(Math.max(0, m.index - 9), m.index).endsWith('dataPath('));
  assert.deepEqual(bare.map(m => m[0]), [], 'every owner-state path goes through dataPath()');
});
test('the owner-mapped set equals the private-pass owner-state outputs, and unknown/stale/conflict copies are never state', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'scan.mjs'), 'utf8'), m = src.match(/const OWNER_MAPPED = new Set\(\[([^\]]+)\]\)/);
  assert.deepEqual(m[1].match(/'[^']+'/g).map(x => x.slice(1, -1)).sort(), [...OWNER_STATE_OUTPUTS].sort());
  for (const n of ['private-unknown-outcomes.json', 'private-stale-tips.jsonl', 'private-conflict-outcomes.json', 'private-failed-pass-x.json']) assert.match(n, NOT_STATE);
  assert.deepEqual(blocked, []);
});
// Codex 6851917256 / 6852102057 / 6852112825: the live quick-trade record in signals.json.
const QR = { n: 40, days: 12, stocks: 25, avgPct: 0.03, avgSpy: 0, winRate: 0.7 }, MAN = { 'data/public-pass-manifest.json': { v: 1, files: {} } };
const PUB = { ...SIG, quickRecord: QR }, PV = { v: 1, session: SIG.session, generatedAt: SIG.generatedAt, posVerdict: {}, tipBoard: { sources: [], tips: [] }, leaders: [], pead: [], evt: [], peadFunnel: {} };
const quickWorks = (S) => S.fn('workingKinds')().size > 0;
test('control (legacy, no manifest): the favourable quick record makes the quick kind working', async () => {
  const S = await loadScan({ files: { 'data/signals.json': PUB } }); assert.equal(quickWorks(S), true);
});
test('two-pass live + paired full private record with a NEGATIVE quick record: quick kind not working', async () => {
  const S = await loadScan({ files: { ...MAN, 'data/signals.json': PUB, 'data/signals-private.json': PV, 'data/private-signals.json': { ...PUB, quickRecord: { ...QR, avgPct: -0.02 } } } });
  assert.equal(quickWorks(S), false);
});
test('two-pass live + full private record REMOVED: fails closed, never admitted from the favourable public subset', async () => {
  const S = await loadScan({ files: { ...MAN, 'data/signals.json': PUB, 'data/signals-private.json': PV } });
  assert.equal(quickWorks(S), false); assert.equal(S.fn('readJson0')('data/signals.json').quickRecord, undefined); assert.equal(S.fn('readJson0')('data/signals.json').ownerEvidenceUnknown, true);
});
test('two-pass live + calendar-invalid pair (2026-02-30) with a positive private ledger: UNKNOWN, no POSITIVE owner row', async () => {
  const BAD = { ...SIG, session: '2026-02-30', generatedAt: '2026-02-30T21:40:00.000Z' };
  const S = await loadScan({ files: { ...base, ...MAN, 'data/signals.json': BAD, 'data/private-signals.json': BAD, 'data/private-tier2-ledger.jsonl': rows30(0.09) } });
  const r = tier2Row(S); assert.ok(!r || !/^POSITIVE/.test(r.verdict)); assert.equal(quickWorks(S), false);
});
