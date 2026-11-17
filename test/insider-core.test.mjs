// tests for insider-core.mjs (squad 31 WHO IS BUYING). Run: node test/insider-core.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isoDate, cleanSym, roleOf, parseForm4Xml, parseHousePtr, insiderEvents, addClusters, holdExit, scoreTrade, entryCtx, RULES, testOf, labelOf } from '../insider-core.mjs';
let n = 0; const t = (name, f) => { f(); n++; };
const fx = (f) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

t('dates from SEC, House and ISO formats', () => {
  assert.equal(isoDate('31-JUL-2025'), '2025-07-31'); assert.equal(isoDate('7/3/2026'), '2026-07-03'); assert.equal(isoDate('2026-11-16T00:00'), '2026-11-16'); assert.equal(isoDate('x'), null);
  assert.equal(cleanSym('brk-b'), 'BRK.B'); assert.equal(cleanSym('NONE'), null); assert.equal(cleanSym(''), null);
});
t('roles: CEO / CFO / president / chair count as the top', () => {
  assert.ok(roleOf('Officer', 'Chief Executive Officer').top); assert.ok(roleOf('Director,Officer', 'CFO').top); assert.ok(!roleOf('Director', '').top);
  assert.ok(roleOf('TenPercentOwner', '').ten);
});
t('real Form 4 (RCG, Sep 2025): 7 open-market buys at 2.55 by the president', () => {
  const f = parseForm4Xml(fx('form4-rcg.xml'));
  assert.equal(f.sym, 'RCG'); assert.equal(f.buys.length, 7); assert.equal(f.buys[0].px, 2.55); assert.equal(f.owners[0].name, 'STAHL MURRAY'); assert.ok(f.owners[0].role.top);
  assert.equal(parseForm4Xml('<ownershipDocument><documentType>4</documentType><nonDerivativeTransaction><transactionCode>S</transactionCode></nonDerivativeTransaction></ownershipDocument>').buys.length, 0);
});
t('real House PTR (Gottheimer, Jan 2025): every stock line, options left out, wrapped tickers found', () => {
  const h = parseHousePtr(fx('house-ptr-gottheimer.txt'));
  assert.equal(h.length, 47); assert.ok(h.some(x => x.sym === 'AAPL' && x.type === 'P' && x.tdate === '2024-12-19' && x.lo === 1001));
  assert.ok(!h.some(x => x.sym === 'MSFT'), 'MSFT lines are call options [OP]'); assert.ok(h.some(x => x.sym === 'ABEV' && x.type === 'S'));
});
t('events: one per company and filing day; clusters over 10 days', () => {
  const r = (sym, filed, name, sh, px, rel = 'Director', title = '') => ({ sym, filed, name, role: roleOf(rel, title), sh, px });
  const E = addClusters(insiderEvents([r('AAA', '2026-01-05', 'X', 1000, 10), r('AAA', '2026-01-05', 'X', 1000, 12), r('AAA', '2026-01-12', 'Y', 500, 11, 'Officer', 'CEO'), r('BBB', '2026-01-05', 'Z', 10, 1, 'TenPercentOwner')]));
  assert.equal(E.length, 3); const a = E.find(e => e.sym === 'AAA' && e.filed === '2026-01-05'); assert.equal(a.usd, 22000); assert.equal(a.avgPx, 11); assert.equal(a.cluster, 1);
  const b = E.find(e => e.sym === 'AAA' && e.filed === '2026-01-12'); assert.equal(b.cluster, 2); assert.ok(b.top); assert.ok(E.find(e => e.sym === 'BBB').ten);
});
const ser = (closes, start = 0, gap = null) => { const s = { d: [], o: [], h: [], l: [], c: [], v: [] }; closes.forEach((c, i) => { if (i === gap) return; s.d.push(start + i); s.o.push(c); s.h.push(c); s.l.push(c); s.c.push(c); s.v.push(1e6); }); return s; };
t('hold exit: time, a thin stock that skipped the last day, a delisted stock (-20%)', () => {
  const s = ser([10, 10, 11, 12, 13]); assert.equal(holdExit(s, 0, 3, 10).exit, 11); assert.equal(holdExit(s, 0, 3, 10).how, 'time');
  const g = ser([10, 10, 11, 12, 13], 0, 2); assert.equal(holdExit(g, 0, 3, 10).exit, 10); assert.equal(holdExit(g, 0, 3, 10).how, 'last trade before');
  const dead = ser([10, 9]); const x = holdExit(dead, 0, 5, 30); assert.equal(x.how, 'stopped trading'); assert.ok(Math.abs(x.exit - 7.2) < 1e-9);
  assert.equal(holdExit(s, 3, 5, 5), null, 'not finished yet');
});
t('score = stock minus the S&P 500 minus costs', () => {
  const s = ser([10, 10, 11]), spy = ser([100, 100, 105]); const x = scoreTrade(s, 0, spy, 3, 10);
  assert.ok(Math.abs(x.gross - 0.1) < 1e-9); assert.ok(Math.abs(x.mkt - 0.05) < 1e-9); assert.ok(Math.abs(x.net - (0.1 - 0.05 - 0.006 - 0.003)) < 1e-9);
});
t('rules: pre-registered tests and labels', () => {
  const c = { px: 2, pre20: 0.15, dollar20: 1e6 }, e = { usd: 3e4, top: false, cluster: 1, ten: false };
  assert.ok(testOf('INS-ANY')(e, c)); assert.ok(!testOf('INS-CEO')(e, c)); assert.ok(testOf('INS-MOM')(e, c)); assert.ok(testOf('INS-PENNY')(e, c)); assert.ok(!testOf('INS-ANY')(e, { ...c, px: 0.5 }));
  assert.ok(testOf('CONG-FAST')({ lag: 10, lo: 1001 }, c)); assert.ok(!testOf('CONG-BIG')({ lag: 10, lo: 1001 }, c)); assert.equal(RULES['INS-60D'].hold, 60);
  assert.equal(labelOf(['INS-ANY', 'INS-MOM'], { 'INS-ANY': { verdict: 'REJECTED' }, 'INS-MOM': { verdict: 'TRY SMALL' } }), 'TRY SMALL');
  assert.equal(labelOf(['INS-ANY'], { 'INS-ANY': { verdict: 'REJECTED' } }), 'INFO (rule failed the test)'); assert.equal(labelOf(['INS-ANY'], {}), 'WATCH');
  const ctx = entryCtx(ser(Array.from({ length: 30 }, (_, i) => 10 + i)), 25); assert.ok(ctx.pre20 > 0 && ctx.dollar20 > 0);
});
console.log(n + ' insider core tests passed');
