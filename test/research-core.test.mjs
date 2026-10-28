// Seams: research-core.mjs (daily researcher, 25 Oct 2026; idea 1 = Lazy Prices, 10-K text change). Text -> word counts, cosine,
// the 10-K list from SEC submissions JSON, the previous-10-K pairing window, the minimum length, the point-in-time percentile (prior 365
// days only, 300+ refs), the side cut-offs, the data rule, the avoid verdict and the idempotent library pre-registration.
// No network. Run: node --test test/research-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, LAZY_IDS, LP, termFreq, cosine, tenKs, docUrl, pairPrev, pairSim, makeRanker, sideOf, dataComplete, avoidVerdict, preRegister, halfOf, addDays, firstAfter, capG } from '../research-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('registry: two buy rules (63 / 126 sessions) and one avoid check; ids RQ-', () => {
  assert.deepEqual(LAZY_IDS, ['RQ-LAZY-63', 'RQ-LAZY-126', 'RQ-LAZY-CHG63']); assert.deepEqual(BUY_IDS.filter(id => LAZY_IDS.includes(id)), ['RQ-LAZY-63', 'RQ-LAZY-126']); assert.deepEqual(IDS.slice(0, 3), LAZY_IDS);
  assert.equal(RULES['RQ-LAZY-63'].hold, 63); assert.equal(RULES['RQ-LAZY-126'].hold, 126); assert.equal(RULES['RQ-LAZY-CHG63'].kind, 'avoid');
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer'); assert.equal(capG(5), 3);
});

test('text: tags, scripts and the inline-XBRL header are removed; words are 2+ letters, lower case, numbers dropped', () => {
  const tf = termFreq('<html><script>var secret=1</script><ix:header><ix:hidden>dei NOISE</ix:hidden></ix:header><p>Revenue rose 12% in 2025.</p><div>REVENUE&nbsp;fell a</div></html>');
  assert.equal(tf.get('revenue'), 2); assert.equal(tf.get('rose'), 1); assert.equal(tf.get('fell'), 1);
  assert.equal(tf.has('secret'), false); assert.equal(tf.has('noise'), false); assert.equal(tf.has('a'), false); assert.equal(tf.total, 5);
});

test('cosine: identical = 1, disjoint = 0, the paper example ordering holds', () => {
  const m = (s) => termFreq(s);
  assert.ok(near(cosine(m('we expect demand to increase'), m('we expect demand to increase')), 1));
  assert.equal(cosine(m('alpha beta'), m('gamma delta')), 0);
  const A = m('we expect demand to increase'), B = m('we expect worldwide demand to increase'), C = m('we expect weakness in sales');
  assert.ok(cosine(A, B) > cosine(A, C)); assert.equal(cosine(new Map(), A), null);
});

test('10-K list: form 10-K only (no 10-K/A, 10-KT, 10-Q), from the fetch start, primary document required; URL built from the accession', () => {
  const cols = { form: ['10-K', '10-K/A', '10-Q', '10-K', '10-KT', '10-K'], filingDate: ['2025-02-20', '2025-03-01', '2025-05-01', '2024-02-21', '2024-06-01', '2019-02-01'],
    accessionNumber: ['0000320193-25-000010', 'x', 'y', '0000320193-24-000008', 'z', 'old'], acceptanceDateTime: ['2025-02-20T21:05:00.000Z', '', '', '2024-02-21T13:00:00.000Z', '', ''],
    primaryDocument: ['a10k2025.htm', 'b.htm', 'c.htm', 'a10k2024.htm', 'd.htm', 'e.htm'] };
  const L = tenKs(cols); assert.equal(L.length, 2); assert.deepEqual(L.map(f => f.date), ['2025-02-20', '2024-02-21']);
  assert.equal(docUrl('0000320193', L[0]), '/Archives/edgar/data/320193/000032019325000010/a10k2025.htm');
  assert.deepEqual(tenKs({ form: ['10-K'], filingDate: ['2025-01-01'], accessionNumber: ['q'], primaryDocument: [''] }), []);
});

test('pairing: the previous 10-K only when filed 300-430 days earlier', () => {
  const L = [{ acc: 'a', date: '2022-02-20' }, { acc: 'b', date: '2023-02-21' }, { acc: 'c', date: '2023-06-01' }, { acc: 'd', date: '2025-02-20' }];
  const P = pairPrev(L); assert.equal(P.get('a'), null); assert.equal(P.get('b'), 'a'); assert.equal(P.get('c'), null);   // c: b is only 100 days before, a is 466 days before
  assert.equal(P.get('d'), null);   // 2 years gap
  assert.equal(pairPrev([{ acc: 'x', date: '2024-01-01' }, { acc: 'y', date: '2024-10-27' }]).get('y'), 'x');   // 300 days exactly
});

test('similarity needs 10,000+ words in both documents', () => {
  const big = new Map([['word', 6000], ['other', 5000]]); big.total = 11000; const small = new Map([['word', 50]]); small.total = 50;
  assert.ok(near(pairSim(big, big), 1)); assert.equal(pairSim(big, small), null); assert.equal(pairSim(null, big), null); assert.equal(LP.minWords, 10000);
});

test('percentile: only the 365 days BEFORE the day count (not the day itself), 300+ refs, share strictly below; sides at 0.8 / 0.2', () => {
  const refs = []; for (let k = 0; k < 400; k++) refs.push({ d: addDays('2024-01-01', k % 300), s: k / 400 });
  const rank = makeRanker([...refs, { d: '2025-06-01', s: 0.99 }]);
  const p = rank('2024-12-01', 0.5); assert.ok(near(p, 200 / 400));
  assert.equal(rank('2024-06-01', 0.5), null);   // fewer than 300 refs before that day
  assert.equal(makeRanker(refs)('2026-01-01', 0.5), null);   // refs older than 365 days do not count
  // a value filed ON the day is not yet a reference
  const r2 = makeRanker([...refs, { d: '2024-12-01', s: 0.0 }]); assert.ok(near(r2('2024-12-01', 0.5), 200 / 400));
  assert.equal(sideOf(0.8), 'top'); assert.equal(sideOf(0.79), 'mid'); assert.equal(sideOf(0.2), 'bottom'); assert.equal(sideOf(null), null);
});

test('data rule: 98% filing lists, 95% documents, 85% mapped liquid stock-months; any miss = no verdict', () => {
  assert.equal(dataComplete({ ciks: 100, subsOk: 99, docsNeeded: 1000, docsDone: 960, liqMonths: 1000, liqMapped: 900 }).ok, true);
  const a = dataComplete({ ciks: 100, subsOk: 97, docsNeeded: 1000, docsDone: 960, liqMonths: 1000, liqMapped: 900 }); assert.equal(a.ok, false); assert.match(a.why, /filing lists/);
  assert.match(dataComplete({ ciks: 100, subsOk: 100, docsNeeded: 1000, docsDone: 900, liqMonths: 1000, liqMapped: 900 }).why, /documents/);
  assert.match(dataComplete({ ciks: 100, subsOk: 100, docsNeeded: 1000, docsDone: 1000, liqMonths: 1000, liqMapped: 800 }).why, /SEC number/);
  assert.equal(dataComplete({ ciks: 0, subsOk: 0, docsNeeded: 0, docsDone: 0, liqMonths: 0, liqMapped: 0 }).ok, false);
});

test('avoid verdict: never a buy; confirmed only with negative edge and block t <= -2.5 in both halves', () => {
  const h = (edge, t) => ({ n: 50, blocks: 5, edge, tBlock: t });
  assert.match(avoidVerdict({ older: h(-0.02, -3), newer: h(-0.01, -2.6) }).verdict, /AVOID CONFIRMED/);
  assert.match(avoidVerdict({ older: h(-0.02, -3), newer: h(-0.01, -1) }).verdict, /AVOID WEAK/);
  assert.match(avoidVerdict({ older: h(0.02, 3), newer: h(-0.01, -3) }).verdict, /NOT SUPPORTED/);
  assert.match(avoidVerdict({ older: { n: 5, blocks: 1 }, newer: h(-0.01, -3) }).verdict, /TOO FEW/);
});

test('library pre-registration: adds every RQ entry once (3 lazy + 2 tender + 4 info-shock + 3 backlog), never touches others', () => {
  const LB = { strategies: [{ id: 'C-DIFF1', status: 'queued (Agent C)' }] };
  assert.equal(preRegister(LB), 12); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 13); assert.equal(LB.strategies[0].status, 'queued (Agent C)');
  const e = LB.strategies.find(x => x.id === 'RQ-LAZY-126'); assert.equal(e.hold, 126); assert.match(e.status, /pre-registered/); assert.ok(e.sources.length >= 1);
});

test('firstAfter: the entry is the first session strictly after the acceptance date', () => {
  const D = ['2025-02-19', '2025-02-20', '2025-02-21', '2025-02-24'];
  assert.equal(firstAfter(D, '2025-02-20'), 2); assert.equal(firstAfter(D, '2025-02-22'), 3); assert.equal(firstAfter(D, '2025-03-01'), 4);
});
