import test from 'node:test';
import assert from 'node:assert/strict';
import { spinStart, tradeOf, monthT, judge, posOnOrAfter, spyOver } from '../squad32-core.mjs';
const days = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2022, 0, 3) + i * 864e5).toISOString().slice(0, 10));
const ser = (from, n, px = 10, step = 0) => { const s = { d: [], o: [], h: [], l: [], c: [], v: [] }; for (let i = 0; i < n; i++) { const p = px + step * i; s.d.push(from + i); s.o.push(p); s.h.push(p); s.l.push(p); s.c.push(p); s.v.push(1e6); } return s; };
test('spinStart: needs a first bar after the filing, not at the data start, within 540 days', () => {
  assert.equal(spinStart(ser(50, 100), days, days[10]), 0);
  assert.equal(spinStart(ser(2, 100), days, '2021-01-01'), -1);
  assert.equal(spinStart(ser(50, 100), days, days[60]), -1);
});
test('tradeOf: open of e to the close of e+hold-1, or an explicit last position', () => {
  const s = ser(0, 50, 10, 0.1), t = tradeOf(s, 5, 10); assert.equal(t.x, 14); assert.ok(Math.abs(t.gross - (s.c[14] / s.o[5] - 1)) < 1e-12);
  const u = tradeOf(s, 5, null, 7); assert.equal(u.x, 7); assert.equal(tradeOf(s, 5, null, 4), null);
});
test('posOnOrAfter and spyOver', () => { const s = ser(10, 20); assert.equal(posOnOrAfter(s, days, days[12]), 2); assert.equal(posOnOrAfter(s, days, days[90]), -1);
  const spy = ser(0, 100, 100, 1), at = new Map(spy.d.map((d, k) => [d, k])); assert.ok(Math.abs(spyOver(spy, at, 0, 9) - (109 / 100 - 1)) < 1e-12); });
test('monthT clusters by entry month', () => { const r = monthT([{ day: '2022-01-05', ex: 0.1 }, { day: '2022-01-20', ex: 0.3 }, { day: '2022-02-01', ex: 0.1 }, { day: '2022-03-01', ex: 0.2 }]);
  assert.equal(r.months, 3); assert.ok(Math.abs(r.avg - 0.1666666) < 1e-6); });
test('judge: a steady winner that beats SPY in both halves is a WINNER; a loser is not', () => {
  const mk = (g, spyG) => Array.from({ length: 80 }, (_, i) => { const d = new Date(Date.UTC(2022, 0, 3) + i * 20 * 864e5).toISOString().slice(0, 10); return { di: i, day: d, sym: 'X', px: 20, gross: g + (i % 3) * 0.01, spy: spyG }; });
  const w = judge(mk(0.08, 0.01)); assert.equal(w.verdict, 'TRY SMALL'); assert.equal(w.vsSpy.beats, true); assert.equal(w.winner, true);
  const l = judge(mk(-0.02, 0.01)); assert.equal(l.verdict, 'REJECTED'); assert.equal(l.winner, false);
});
