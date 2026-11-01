// Seams: agent-c-core.mjs (Agent C, 1 Nov 2026): insider clusters (C-INSQ1), the 15% stop walk, the 200-session average, the House Clerk
// index and PTR text parsers (C-CONG1), the data stop, the TRY SMALL bar and the library pre-registration.
// Run: node --test test/agent-c-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { insiderClusters, stopWalk, sma200, parseFdIndex, parsePtrText, isScanned, purchases, congDataOk, trySmallBar, preRegister, halfOf, capG, RULE_IDS } from '../agent-c-core.mjs';

const DAYS = ['2023-03-01', '2023-03-02', '2023-03-03', '2023-03-06', '2023-03-07', '2023-03-08', '2023-03-09', '2023-03-10'];
const sessOf = (d) => { const i = DAYS.findIndex(x => x >= d); return i < 0 ? DAYS.length : i; };

test('cluster: 2 different insiders, 200k+ within 5 sessions, fires on the completing filing date', () => {
  const rows = [{ sym: 'AAA', cik: '1', d: '2023-03-01', who: 'x', usd: 150000, insider: true }, { sym: 'AAA', cik: '1', d: '2023-03-06', who: 'y', usd: 60000, insider: true }];
  const ev = insiderClusters(rows, sessOf); assert.equal(ev.length, 1); assert.equal(ev[0].d, '2023-03-06'); assert.equal(ev[0].people, 2); assert.equal(ev[0].usd, 210000);
});
test('cluster: too far apart, same person twice, under 200k, or a 10%-only owner do not fire', () => {
  assert.equal(insiderClusters([{ sym: 'A', d: '2023-03-01', who: 'x', usd: 150000, insider: true }, { sym: 'A', d: '2023-03-08', who: 'y', usd: 150000, insider: true }], sessOf).length, 0, '6 sessions apart');
  assert.equal(insiderClusters([{ sym: 'A', d: '2023-03-01', who: 'x', usd: 150000, insider: true }, { sym: 'A', d: '2023-03-02', who: 'x', usd: 150000, insider: true }], sessOf).length, 0, 'one person');
  assert.equal(insiderClusters([{ sym: 'A', d: '2023-03-01', who: 'x', usd: 90000, insider: true }, { sym: 'A', d: '2023-03-02', who: 'y', usd: 100000, insider: true }], sessOf).length, 0, 'under 200k');
  assert.equal(insiderClusters([{ sym: 'A', d: '2023-03-01', who: 'x', usd: 150000, insider: true }, { sym: 'A', d: '2023-03-02', who: 'f', usd: 900000, insider: false }], sessOf).length, 0, 'fund left out');
});
test('stop walk: 15% under the fill exits at min(open, level); else the close of the last hold session', () => {
  const O = [10, 10, 9, 8], L = [9.5, 9.2, 8.4, 7.9], C = [10, 9.5, 8.6, 8];
  const a = stopWalk(O, L, C, 1, 3); assert.equal(a.kind, 'stop'); assert.equal(a.x, 2); assert.ok(Math.abs(a.g - (-0.15)) < 1e-9);
  const O2 = [10, 10, 7, 8], b = stopWalk(O2, [9, 9.5, 6.9, 7.9], [10, 9.6, 7, 8], 1, 3); assert.ok(Math.abs(b.g - (-0.3)) < 1e-9, 'gap under the level fills at the open');
  const c = stopWalk([10, 10, 10, 10], [9, 9.5, 9.6, 9.7], [10, 10, 11, 12], 1, 3); assert.equal(c.kind, 'time'); assert.ok(Math.abs(c.g - 0.2) < 1e-9);
  assert.equal(stopWalk([10, 10], [9, 9], [10, 10], 1, 3), null, 'hold not complete');
});
test('200-session average needs 190+ closes', () => { const C = new Float32Array(260).fill(10); C[5] = NaN; const s = sma200(C); assert.ok(Number.isNaN(s[198])); assert.equal(s[199], 10); assert.equal(s[259], 10); });

test('House index: PTR rows with ISO filing dates', () => {
  const xml = '<FinancialDisclosure><Member><Prefix>Hon.</Prefix><Last>Doe</Last><First>Jane</First><Suffix /><FilingType>P</FilingType><StateDst>CA11</StateDst><Year>2024</Year><FilingDate>1/9/2024</FilingDate><DocID>20024542</DocID></Member>' +
    '<Member><Last>Roe</Last><First>Rick</First><FilingType>O</FilingType><StateDst>TX01</StateDst><Year>2024</Year><FilingDate>5/15/2024</FilingDate><DocID>10059999</DocID></Member></FinancialDisclosure>';
  const r = parseFdIndex(xml); assert.equal(r.length, 2); assert.deepEqual(r[0], { docId: '20024542', type: 'P', filed: '2024-01-09', last: 'Doe', first: 'Jane', state: 'CA11', year: '2024' }); assert.equal(r[1].type, 'O');
});
const PTR = [
  'ID          Owner Asset                                    Transaction Date             Notification Amount                  Cap.',
  '                                                           Type                         Date                                 Gains >',
  '            SP      Alphabet Inc. - Class A Common         P            01/18/2024      01/18/2024      $500,001 -',
  '                    Stock (GOOGL) [ST]                                                                  $1,000,000',
  '            F     S     : New',
  '                    Apple Inc. (AAPL) [OP]                 P            01/19/2024      01/20/2024      $1,001 - $15,000',
  '            D           : Call options',
  '            JT      Microsoft Corporation - Common         S (partial)  02/01/2024      02/03/2024      $15,001 - $50,000',
  '                    Stock (MSFT) [ST]',
  '                    Some Private Fund LP [ST]              P            02/05/2024      02/06/2024      $1,001 - $15,000',
  '                    Berkshire Hathaway Inc. New (BRK-B)    P            02/07/2024      02/08/2024      $1,001 - $15,000',
  '                    [ST]',
].join('\n');
test('PTR text: rows, tickers on the wrapped line, options and sales kept apart, amount ranges', () => {
  const p = parsePtrText(PTR); assert.equal(p.anchors, 5); assert.equal(p.st, 4); assert.equal(p.stTicker, 3);
  assert.deepEqual(p.rows[0], { type: 'P', trade: '2024-01-18', notified: '2024-01-18', lo: 500001, hi: 1000000, ticker: 'GOOGL', asset: 'ST' });
  assert.equal(p.rows[1].asset, 'OP'); assert.equal(p.rows[1].hi, 15000); assert.equal(p.rows[2].type, 'S'); assert.equal(p.rows[2].ticker, 'MSFT');
  assert.equal(p.rows[3].ticker, null); assert.equal(p.rows[4].ticker, 'BRK.B');
  assert.deepEqual(purchases(p).map(r => r.ticker), ['GOOGL', 'BRK.B']); assert.equal(isScanned(p), false);
  assert.equal(isScanned(parsePtrText('  \n\f  Clerk of the House  \n')), true);
});
test('data stop: each failure is named; a complete set passes', () => {
  assert.equal(congDataOk({ years: 6, yearsOk: 6, ptrs: 1000, downloaded: 995, scanned: 100, st: 5000, stTicker: 4800 }).ok, true);
  const b = congDataOk({ years: 6, yearsOk: 5, ptrs: 1000, downloaded: 900, scanned: 300, st: 100, stTicker: 50 }); assert.equal(b.ok, false); assert.equal(b.why.length, 4);
});
test('TRY SMALL bar and helpers', () => {
  const h = { n: 25, blocks: 4, avgStress: 0.01, edge: 0.01, noTop2: 0.002 }; assert.equal(trySmallBar({ older: h, newer: h }), true); assert.equal(trySmallBar({ older: h, newer: { ...h, edge: -0.01 } }), false);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer'); assert.equal(capG(5), 3);
});
test('library pre-registration: own entries once, idempotent, never touches other entries', () => {
  const LB = { strategies: [{ id: 'C-INSQ1', status: 'queued (Agent C)', agent: 'C' }, { id: 'C-CONG1', status: 'queued' }, { id: 'EXP-CONG1', status: 'queued', agent: 'expert' }, { id: 'V15', status: 'x' }] };
  const n = preRegister(LB); assert.ok(n >= 5); assert.equal(preRegister(LB), 0);
  for (const id of RULE_IDS) assert.ok(LB.strategies.some(e => e.id === id), id);
  assert.match(LB.strategies.find(e => e.id === 'C-INSQ1').status, /pre-registered 2026-11-01/); assert.equal(LB.strategies.find(e => e.id === 'V15').status, 'x'); assert.equal(LB.strategies.find(e => e.id === 'EXP-CONG1').agent, 'expert');
});
