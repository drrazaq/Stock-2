// Seams: chain-core.mjs, the pure rules of the CHAIN DECODER (pre-registered 23 Oct 2026 as CHAIN-MOM1 / CHAIN-DEMAND1 / CHAIN-LAG1 /
// CHAIN-READ1). Each test holds a rule to the registered wording in data/strategy-library.json.
// Run: node test/chain-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { demandSignal, readThrough, customerSentence, linkActive, agreementEvidence, momSelect, lagLearn, lagPredict, stopExit } from '../chain-core.mjs';

test('demand signal: raised guidance or higher capital spending counts; lowered guidance does not', () => {
  assert.equal(demandSignal('The company raised its full-year revenue guidance to $40 billion.').hit, true);
  assert.equal(demandSignal('Full-year outlook raised on strong cloud demand.').hit, true);
  assert.equal(demandSignal('We now expect capital expenditures to be significantly higher in 2025 as we invest in AI infrastructure.').hit, true);
  assert.equal(demandSignal('We lowered our full-year guidance due to weaker demand.').hit, false);
  assert.equal(demandSignal('Capital expenditures were reduced compared with last year.').hit, false);
  assert.equal(demandSignal('Revenue increased 12% to $5.1 billion. We reaffirm our outlook.').hit, false);
});

test('demand signal reports the sentence that triggered it', () => {
  const r = demandSignal('Net income was $1.0 billion. Meta raised its 2024 capital expenditures outlook to $37-40 billion, increased from the prior range.');
  assert.equal(r.hit, true);
  assert.match(r.text, /capital expenditures outlook/);
});

test('read-through: revenue up 10%+ on the prior-year quarter AND raised guidance, both needed', () => {
  const both = 'Third quarter revenue was $2.4 billion, up 18% year-over-year. The company raised its full-year guidance.';
  assert.deepEqual([readThrough(both).hit, readThrough(both).growth], [true, 0.18]);
  assert.equal(readThrough('Revenue increased 8% compared to the same quarter last year. We raised our outlook.').hit, false);
  assert.equal(readThrough('Revenue grew 25% versus the prior year quarter. We reaffirm guidance.').hit, false);
  assert.equal(readThrough('Revenue declined 15% compared with the prior year. We raised our outlook for margins.').hit, false);
  assert.equal(readThrough('Net sales of $812.5 million increased 31.2% from the prior-year period; raising fiscal 2025 outlook.').hit, true);
});

test('major customer: the customer must be named next to concentration words', () => {
  const t = 'We sell to many customers. For fiscal 2023, Microsoft and Meta Platforms accounted for 39% and 21% of our total revenue, respectively.';
  assert.match(customerSentence(t, ['Meta Platforms', 'Meta', 'Facebook']), /Meta Platforms accounted for/);
  assert.match(customerSentence(t, ['Microsoft']), /Microsoft and Meta/);
  assert.equal(customerSentence('Our software runs on Microsoft Windows and Apple macOS.', ['Microsoft']), null);
  assert.equal(customerSentence('Sales to Metallica fans grew 10%.', ['Meta']), null);   // a whole word only
});

test('a link is active from the first session on/after its first filing until 400 days after the latest filing that showed it', () => {
  const filed = ['2022-02-15', '2023-02-14'];
  assert.equal(linkActive(filed, '2022-02-14'), false);   // not public yet
  assert.equal(linkActive(filed, '2022-02-15'), true);
  assert.equal(linkActive(filed, '2024-03-19'), true);    // 399 days after 2023-02-14
  assert.equal(linkActive(filed, '2024-03-21'), false);   // 401 days: no longer disclosed
  assert.equal(linkActive(['2024-05-01'], '2023-06-01'), false);   // a later filing never reaches back
});

test('material agreement: the customer named in an agreement sentence, with the stated value in USD', () => {
  const t = 'On March 3, 2025, the Company entered into a multi-year supply agreement with NVIDIA Corporation for optical transceivers. NVIDIA will also invest $2 billion in the Company.';
  const e = agreementEvidence(t, ['NVIDIA', 'Nvidia Corporation']);
  assert.match(e.text, /supply agreement with NVIDIA/);
  assert.equal(e.value, 2e9);
  const m = agreementEvidence('AIB entered into a master services agreement with Nebius for 50 MW, with total contract value of approximately $150.5 million.', ['Nebius']);
  assert.equal(m.value, 150.5e6);
  assert.equal(agreementEvidence('We compete with NVIDIA in many markets.', ['NVIDIA']), null);
});

test('CHAIN-MOM1: top 3 layers by average 3-month return minus the S&P 500; buy their members above the 50-day that pass the gates, once each', () => {
  const m = (s, r63, above50 = true, ok = true) => ({ s, r63, above50, ok });
  const layers = [
    { key: 'AI|Memory', members: [m('MU', 0.5), m('WDC', 0.4), m('STX', 0.3, false)] },          // avg +40%
    { key: 'AI|Optics', members: [m('COHR', 0.3), m('LITE', 0.3), m('MU', 0.3)] },              // avg +30%; MU again
    { key: 'Gold|Miners', members: [m('NEM', 0.2), m('AEM', 0.2), m('KGC', 0.2, true, false)] }, // avg +20%; KGC fails a gate
    { key: 'Ships|Bulk', members: [m('SBLK', 0.1), m('GNK', 0.1), m('EGLE', 0.1)] },            // avg +10%: 4th, not bought
    { key: 'Tiny|Two', members: [m('AAA', 2.0), m('BBB', 2.0)] },                               // only 2 members: not ranked
  ];
  const r = momSelect(layers, 0.05);
  assert.deepEqual(r.top.map(x => x.key), ['AI|Memory', 'AI|Optics', 'Gold|Miners']);
  assert.equal(r.top[0].excess.toFixed(2), '0.35');
  assert.deepEqual(r.buys.map(x => x.s), ['MU', 'WDC', 'COHR', 'LITE', 'NEM', 'AEM']);
  assert.deepEqual(r.buys[0].layers, ['AI|Memory', 'AI|Optics']);
});

test('CHAIN-LAG1: learns only same-chain pairs whose lead is strong (|t| >= 3, 15+ months), at most 10; predicts the sign', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  const A = Array.from({ length: 30 }, (_, k) => Math.sin(k * 1.3) * 0.05);
  const B = A.map((_, k) => k === 0 ? 0 : 0.8 * A[k - 1] + rnd());          // B follows A one month later
  const C = A.map((_, k) => k === 0 ? 0 : -0.8 * A[k - 1] + rnd());         // C moves opposite to A one month later
  const N = A.map(() => rnd() * 3), X = A.map((_, k) => k === 0 ? 0 : 0.8 * A[k - 1]);
  const pairs = lagLearn({ 'AI|A': A, 'AI|B': B, 'AI|C': C, 'AI|Noise': N, 'Gold|X': X });
  const keys = pairs.map(p => p.from + '>' + p.to);
  assert.ok(keys.includes('AI|A>AI|B')); assert.ok(keys.includes('AI|A>AI|C'));
  assert.ok(!keys.some(k => k.includes('Gold|X')));                           // another chain is never paired
  assert.ok(!keys.some(k => k.startsWith('AI|Noise>')));
  const ab = pairs.find(p => p.from === 'AI|A' && p.to === 'AI|B');
  assert.ok(ab.slope > 0 && ab.t >= 3);
  assert.equal(lagPredict(ab, 0.04), true); assert.equal(lagPredict(ab, -0.04), false);
  assert.equal(lagPredict(pairs.find(p => p.to === 'AI|C'), -0.04), true);   // negative lead: A down -> C up next month
  assert.deepEqual(lagLearn({ 'AI|A': A.slice(0, 10), 'AI|B': B.slice(0, 10) }), []);   // under 15 months: nothing
});

test('stop 20%: out at the stop on the first session whose low reaches it (at the open if it gapped below); else the close of the last session', () => {
  const bar = (o, l, c) => ({ o, l, c });
  // entry at the open of session 1 (10.00); hold 3 sessions = sell at the close of session 3
  assert.deepEqual(stopExit([bar(9, 9, 9), bar(10, 9.5, 10), bar(10, 9, 9.5), bar(9.5, 9.4, 11)], 1, 3, 0.2), { ret: 0.1, why: 'time', at: 3 });
  assert.deepEqual(stopExit([bar(9, 9, 9), bar(10, 9.5, 10), bar(10, 7.5, 9), bar(9, 9, 12)], 1, 3, 0.2), { ret: -0.2, why: 'stop', at: 2 });
  const gap = stopExit([bar(9, 9, 9), bar(10, 9.5, 10), bar(7, 6.5, 7.2), bar(9, 9, 12)], 1, 3, 0.2);
  assert.equal(gap.ret.toFixed(2), '-0.30'); assert.equal(gap.why, 'stop');
  assert.equal(stopExit([bar(9, 9, 9), bar(10, 9.5, 10)], 1, 3, 0.2), null);   // not enough sessions yet
});
