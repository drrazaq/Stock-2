import test from 'node:test';
import assert from 'node:assert/strict';
import { item101Section, contractAmount, acceptance, reactionSession, burnCovered, classify, spyGate, trySmallBar, preRegister, RULE_IDS } from '../agent-c2-core.mjs';

test('item 1.01 section ends at the next item heading', () => {
  const t = 'Cover page. Item 1.01 Entry into a Material Definitive Agreement. On May 1 the Company signed a supply agreement with Acme Corp. for $120 million. Item 9.01 Financial Statements and Exhibits. $900 million.';
  const s = item101Section(t); assert.ok(s.includes('$120 million')); assert.ok(!s.includes('$900 million'));
  assert.equal(item101Section('no items here'), null);
});

test('amount: largest counted figure, financing sentences excluded, small figures ignored', () => {
  const s = 'The Company entered into a contract with Acme Corp. valued at up to $45.5 million over three years. The Company also amended its credit facility to $500 million. Each unit costs $12.50. A payment of $2,500,000 is due at signing.';
  const a = contractAmount(s); assert.equal(a.amount, 45500000); assert.equal(a.figures, 3); assert.equal(a.counted, 2);
  assert.equal(contractAmount('The Company issued senior notes of $1.2 billion.').amount, null);
  assert.equal(contractAmount('The Company issued senior notes of $1.2 billion.').figures, 1);
  assert.equal(contractAmount('An award of $1.1 billion from the Army.').amount, 1.1e9);
  assert.equal(contractAmount('An award of $999,999.').figures, 0);
  assert.equal(contractAmount('A lease of office space at $3 million a year.').amount, null);
});

test('acceptance time and reaction session', () => {
  assert.deepEqual(acceptance('<ACCEPTANCE-DATETIME>20240305163012\n'), { d: '2024-03-05', hm: '16:30' });
  assert.equal(acceptance('nothing'), null);
  const D = ['2024-03-04', '2024-03-05', '2024-03-06', '2024-03-08'];
  assert.equal(reactionSession(D, { d: '2024-03-05', hm: '08:00' }, '2024-03-05'), 1);
  assert.equal(reactionSession(D, { d: '2024-03-05', hm: '12:00' }, '2024-03-05'), 1);
  assert.equal(reactionSession(D, { d: '2024-03-05', hm: '16:00' }, '2024-03-05'), 2);
  assert.equal(reactionSession(D, { d: '2024-03-07', hm: '09:00' }, '2024-03-07'), 3);   // not a session -> next one
  assert.equal(reactionSession(D, null, '2024-03-05'), 2);                              // no header -> after the filing date
  assert.equal(reactionSession(D, null, '2024-03-07'), 3);
});

test('cash-burn cover', () => {
  assert.equal(burnCovered(5e6, { val: 1e6 }), true);
  assert.equal(burnCovered(5e6, { val: -4e6 }), true);
  assert.equal(burnCovered(5e6, { val: -6e6 }), false);
  assert.equal(burnCovered(5e6, null), false);
});

test('CMP classification', () => {
  const h = new Map([['1', new Set(['2021-03', '2022-03', '2023-03'])], ['2', new Set(['2021-01', '2022-05', '2023-07'])], ['3', new Set(['2022-01', '2023-01'])]]);
  assert.equal(classify(h, '1', 2024), 'routine');
  assert.equal(classify(h, '2', 2024), 'opportunistic');
  assert.equal(classify(h, '3', 2024), 'unclassified');
  assert.equal(classify(h, '9', 2024), 'unclassified');
  assert.equal(classify(h, '1', 2025), 'unclassified');
});

test('S&P gate and TRY SMALL bar', () => {
  const tr = [{ half: 'older', g: 0.05, spy: 0.01 }, { half: 'newer', g: 0.0, spy: 0.02 }];
  const w = spyGate(tr); assert.equal(w.length, 1); assert.ok(w[0].includes('newer'));
  assert.equal(trySmallBar({ older: { n: 20, blocks: 3, avgStress: 0.01, edge: 0.01, noTop2: 0.01 }, newer: { n: 19, blocks: 3, avgStress: 0.01, edge: 0.01, noTop2: 0.01 } }), false);
});

test('pre-registration writes every rule once', () => {
  const LB = { strategies: [{ id: 'C-CT1' }, { id: 'C-INS3' }] };
  const n = preRegister(LB); assert.ok(n >= 6);
  for (const id of RULE_IDS) assert.ok(LB.strategies.find(x => x.id === id && x.rule && x.agent === 'C'));
  assert.equal(preRegister(LB), 0);
});
