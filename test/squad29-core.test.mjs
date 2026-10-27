// Seams: squad29-core.mjs (SQUAD 29, 27 Oct 2026: red-flag SEC filings as SELL warnings). Candidate families from form + items, the
// pre-registered text rules (auditor resigned, CEO/CFO gone without successor, affirmative going-concern), the previous periodic filing,
// entry timing, dedupe, the window return with renames and the -100% stop, block t, the decision rule and the library pre-registration.
// Run: node --test test/squad29-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, FAM_KEYS, candidateFams, auditorResigned, execDeparture, goingConcernAffirmative, previousPeriodic, entryIdx, dedupe, windowRet, blockT, halfStats,
  decide, preRegister, firstDate, sentences, html2text, BAR } from '../squad29-core.mjs';

test('registry: six families, each with a SQ29 id', () => {
  assert.deepEqual(FAM_KEYS, ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']); for (const k of FAM_KEYS) assert.match(FAMILIES[k].id, /^SQ29-F\d-/);
  assert.deepEqual(BAR, { under: -0.03, t: -2.5, n: 20, horizons: [20, 60] });
});

test('candidate families from form and items; amendments left out', () => {
  assert.deepEqual(candidateFams({ form: '8-K', items: '4.02,9.01' }), ['F1']);
  assert.deepEqual(candidateFams({ form: '8-K', items: '3.01,4.01,5.02' }), ['F2', 'F3', 'F6']);
  assert.deepEqual(candidateFams({ form: '8-K/A', items: '4.02' }), []);
  assert.deepEqual(candidateFams({ form: 'NT 10-K', items: '' }), ['F4']); assert.deepEqual(candidateFams({ form: 'NT 10-Q' }), ['F4']); assert.deepEqual(candidateFams({ form: 'NT 10-K/A' }), []);
  assert.deepEqual(candidateFams({ form: '10-Q' }), ['P']); assert.deepEqual(candidateFams({ form: '10-K/A' }), []);
});

test('F2: auditor resigned / declined to stand counts; dismissal and firm combinations do not', () => {
  assert.ok(auditorResigned('On May 3, 2024, Smith & Co. LLP resigned as the independent registered public accounting firm of the Company. The decision was not recommended by the audit committee.'));
  assert.ok(auditorResigned('On March 1, 2023, BF Borgers CPA PC informed the Company that it declined to stand for re-election as the Company\'s auditor.'));
  assert.equal(auditorResigned('On May 3, 2024, the Audit Committee dismissed KPMG LLP as the independent registered public accounting firm.'), null);
  assert.equal(auditorResigned('The former accountant did not resign or decline to stand for re-election. The Audit Committee dismissed the auditor.'), null);
  assert.equal(auditorResigned('On November 1, 2024, CBIZ CPAs acquired the attest business of Marcum LLP. As a result, Marcum LLP resigned as the independent registered public accounting firm of the Company.'), null);
  assert.equal(auditorResigned('Mr. Jones resigned from the Board of Directors.'), null, 'no auditor word in the sentence');
});

test('F3: CEO / CFO leaving within 30 days without a successor; orderly transitions and named successors do not count', () => {
  const a = execDeparture('On June 2, 2025, John Smith resigned as Chief Financial Officer of the Company, effective immediately. The Company has commenced a search for a new Chief Financial Officer.', '2025-06-04');
  assert.equal(a.length, 1); assert.equal(a[0].office, 'CFO');
  assert.equal(execDeparture('On June 2, 2025, John Smith resigned as Chief Financial Officer, effective immediately. The Board appointed Jane Doe as interim Chief Financial Officer.', '2025-06-04'), null, 'interim successor named');
  assert.equal(execDeparture('Mr. Smith notified the Board that he will retire as Chief Executive Officer effective December 31, 2025.', '2025-06-04'), null, 'effective more than 30 days later');
  assert.equal(execDeparture('Mr. Smith will step down as Chief Executive Officer upon the appointment of his successor.', '2025-06-04'), null, 'orderly');
  assert.ok(execDeparture('On June 20, 2025, the Board terminated the employment of Mr. Smith as Chief Executive Officer, effective June 21, 2025.', '2025-06-23'));
  assert.equal(execDeparture('The Company appointed Mr. Lee as a director. Ms. Ray resigned from the Board.', '2025-06-04'), null, 'no CEO/CFO');
  assert.equal(firstDate('effective as of March 5, 2024 and'), '2024-03-05');
});

test('F5: affirmative going-concern sentences only', () => {
  assert.ok(goingConcernAffirmative('The Company has incurred recurring losses. These conditions raise substantial doubt about the Company\'s ability to continue as a going concern within one year.'));
  assert.ok(goingConcernAffirmative('there is substantial doubt about our ability to continue as a going concern.'));
  assert.equal(goingConcernAffirmative('Failure to raise capital could raise substantial doubt about our ability to continue as a going concern.'), null);
  assert.equal(goingConcernAffirmative('Management\'s plans have alleviated the substantial doubt about the Company\'s ability to continue as a going concern.'), null);
  assert.equal(goingConcernAffirmative('Management concluded that there is no substantial doubt about the Company\'s ability to continue as a going concern.'), null);
  assert.equal(goingConcernAffirmative('Management evaluates whether conditions raise substantial doubt in the aggregate.'), null, 'no going concern in the sentence');
});

test('text helpers: html, sentences keep Mr. / Inc. together', () => {
  assert.equal(html2text('<p>A&nbsp;B</p><p>C &amp; D</p>'), 'A B. C & D.');
  assert.equal(sentences('Mr. Smith of Acme Inc. resigned as CFO. The Board accepted.').length, 2);
});

test('previous periodic filing: the latest 10-K / 10-Q before, within 400 days', () => {
  const rows = [{ form: '10-K', fd: '2023-03-01', adsh: 'a' }, { form: '8-K', fd: '2023-04-01', adsh: 'b' }, { form: '10-Q', fd: '2023-05-10', adsh: 'c' }, { form: '10-Q', fd: '2024-09-01', adsh: 'd' }];
  assert.equal(previousPeriodic(rows, 'c').adsh, 'a'); assert.equal(previousPeriodic(rows, 'a'), null); assert.equal(previousPeriodic(rows, 'd'), null, 'more than 400 days');
});

test('entry session: before 09:30 New York -> that open; later or weekend -> the next session open', () => {
  const D = ['2025-01-06', '2025-01-07', '2025-01-08'];
  assert.equal(entryIdx(D, { d: '2025-01-07', hm: '08:15' }), 1); assert.equal(entryIdx(D, { d: '2025-01-07', hm: '09:30' }), 2); assert.equal(entryIdx(D, { d: '2025-01-07', hm: '17:00' }), 2);
  assert.equal(entryIdx(D, { d: '2025-01-05', hm: '12:00' }), 0, 'Sunday'); assert.equal(entryIdx(D, { d: '2025-01-07', hm: null }), 2, 'date only = next session');
  assert.equal(entryIdx(D, { d: '2025-01-08', hm: '18:00' }), 3, 'after the last session = beyond the cache');
});

test('dedupe: one event per stock per family per 60 sessions', () => {
  const ev = [{ fam: 'F4', i: 1, k: 10, adsh: 'a' }, { fam: 'F4', i: 1, k: 50, adsh: 'b' }, { fam: 'F4', i: 1, k: 70, adsh: 'c' }, { fam: 'F6', i: 1, k: 50, adsh: 'd' }, { fam: 'F4', i: 2, k: 50, adsh: 'e' }];
  assert.deepEqual(dedupe(ev).map(e => e.adsh), ['a', 'd', 'e', 'c']);
});

test('window return: normal, late entry, stop = -100%, rename followed, beyond cache = null', () => {
  const mk = (o, c, first, last) => ({ px: { o: Float32Array.from(o), c: Float32Array.from(c) }, first, last, next: null });
  const A = mk([10, 10, 11, 12, 0, 0], [10, 11, 12, 13, 0, 0], 0, 3);
  assert.ok(Math.abs(windowRet(A, 1, 3, 6) - 0.3) < 1e-6);
  assert.equal(windowRet(A, 1, 5, 6), -1, 'stopped trading before x');
  assert.equal(windowRet(A, 1, 6, 6), null, 'x beyond the cache');
  const B = mk([0, 0, 0, 0, 13, 14], [0, 0, 0, 0, 13, 15], 4, 5); A.next = B;
  assert.ok(Math.abs(windowRet(A, 1, 5, 6) - (13 / 10) * (15 / 13) + 1) < 1e-6, 'rename within 5 sessions followed');
  const G = mk([0, 10, 0, 12], [10, 0, 11, 12], 0, 3); assert.ok(Math.abs(windowRet(G, 2, 2, 4) - 0) < 1e-6, 'no open on k: the first later open, x moved');
});

test('block t, half stats and the decision rule', () => {
  const rows = []; for (let k = 0; k < 100; k++) rows.push({ k, g: -0.1 + (k % 5) * 0.01, y: 0, own: 0.01 });
  const h = halfStats(rows, 20); assert.equal(h.n, 100); assert.ok(h.excess < -0.07); assert.ok(h.blockT < -2.5); assert.equal(h.pctUnder, 1);
  assert.equal(blockT([{ k: 0, ex: -1 }, { k: 30, ex: -1 }], 21).t, null);
  assert.equal(decide({ 20: { older: h, newer: h }, 60: { older: h, newer: h } }).verdict, 'SELL-WARNING');
  assert.equal(decide({ 20: { older: h, newer: { ...h, n: 19 } }, 60: { older: { ...h, excess: -0.02 }, newer: h } }).verdict, 'INFO');
  assert.equal(decide({ 20: { older: h, newer: { ...h, blockT: -2.4 } } }).verdict, 'INFO');
  assert.equal(decide({ 20: { older: { ...h, blockT: -1 }, newer: h }, 60: { older: h, newer: h } }).horizons[0], 60);
});

test('library pre-registration is idempotent and append only', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 6); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 7);
  assert.ok(LB.strategies.every(e => e.id === 'X' || (e.kind === 'risk' && /pre-registered/.test(e.status))));
});
