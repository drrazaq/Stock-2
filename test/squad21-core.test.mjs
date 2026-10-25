// Seams: squad21-core.mjs (SQUAD 21, 25 Oct 2026: the outside reviewer's SQ21-CONTRACT10D, tested once, and V15-NO35, forward only).
// The text test (phrase + named counterparty), the reliable dollar value, the signal conditions, the exit (stop / 10-day average / max hold),
// share growth, dilution window, volatility deciles, signals per month, the V15 SIC split and the idempotent library pre-registration.
// Run: node --test test/squad21-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, TH, contractMatch, namedAfter, dollarValue, eftsHits, mainDoc, hasItem, priceOk, signalSession, sharesUp, dilutedAt, exitOf, vol20, deciles, perMonth, perYear,
  sic35, v15Key, v15Split, preRegister, V15_FROZEN_AT, V15_START, NOT_TESTED } from '../squad21-core.mjs';

test('registry: SQ21-CONTRACT10D (buy, max 120, blocks 21) and V15-NO35 (forward only, hold 126); frozenAt before the V15 start', () => {
  assert.deepEqual(IDS, ['SQ21-CONTRACT10D', 'V15-NO35']); assert.equal(RULES['SQ21-CONTRACT10D'].hold, 120); assert.equal(RULES['SQ21-CONTRACT10D'].block, 21);
  assert.equal(RULES['V15-NO35'].kind, 'forward'); assert.equal(RULES['V15-NO35'].hold, 126); assert.ok(V15_FROZEN_AT.slice(0, 10) < V15_START);
});

test('text: named counterparty after agreement / contract with, (purchase) order from; defined terms, people and personal agreements rejected', () => {
  const m = contractMatch('On May 1, the Company entered into a Master Supply Agreement (the "Agreement") with The Boeing Company ("Boeing") to supply parts.');
  assert.equal(m.phrase, 'agreement with'); assert.equal(m.counterparty, 'Boeing Company');
  assert.equal(contractMatch('received a purchase order from Walmart Inc. valued at $12.5 million.').phrase, 'purchase order from');
  assert.equal(contractMatch('received an order from Lockheed Martin for radios.').counterparty, 'Lockheed Martin');
  assert.equal(contractMatch('signed a contract with the U.S. Army Contracting Command.').counterparty, 'U.S. Army Contracting Command');
  assert.equal(contractMatch('a contract with the NIH for research').counterparty, 'NIH', 'an acronym after "the" is a name');
  for (const s of ['entered into an agreement with the Company', 'a securities purchase agreement with certain investors', 'an agreement with the Customer to supply',
    'an employment agreement with John Smith', 'a separation agreement with Jane Doe', 'agreement with Mr. Jones', 'an order from a leading hyperscaler', 'the agreement with its lenders', 'no such words here'])
    assert.equal(contractMatch(s), null, s);
  assert.equal(namedAfter('the Purchasers party thereto', 0), null); assert.equal(namedAfter('Acme, Inc. and', 0).name, 'Acme');
});

test('dollar value: exactly one amount of 100k USD+, none per share / unit; else null', () => {
  assert.equal(dollarValue('valued at $12.5 million for delivery'), 12.5e6); assert.equal(dollarValue('for $45,000,000.'), 45e6); assert.equal(dollarValue('a $1.2 billion award'), 1.2e9);
  assert.equal(dollarValue('$1,250,000 and $1.25 million'), 1.25e6, 'the same value twice is one value');
  assert.equal(dollarValue('between $5 million and $8 million'), null); assert.equal(dollarValue('up to $10 million, or $2.00 per unit'), null); assert.equal(dollarValue('a fee of $50,000'), null); assert.equal(dollarValue('no amount'), null);
});

test('EDGAR hits: items, file type, form; main document = the 8-K itself, not an exhibit or amendment', () => {
  const j = { hits: { hits: [{ _id: '0001-23-000001:d1.htm', _source: { adsh: '0001-23-000001', ciks: ['0000320193'], file_date: '2023-05-02', items: ['1.01', '9.01'], file_type: '8-K', form: '8-K', display_names: ['Apple Inc.  (AAPL)  (CIK 0000320193)'] } },
    { _id: '0001-23-000001:ex99.htm', _source: { adsh: '0001-23-000001', ciks: ['320193'], file_date: '2023-05-02', items: ['1.01'], file_type: 'EX-99.1', form: '8-K' } },
    { _id: '0001-23-000002:d2.htm', _source: { adsh: '0001-23-000002', ciks: ['5'], file_date: '2023-05-02', items: ['1.01'], file_type: '8-K/A', form: '8-K/A' } },
    { _id: '0001-23-000003:form8-k.htm', _source: { adsh: '0001-23-000003', ciks: ['6'], file_date: '2023-05-03', items: ['3.02'] } }] } };
  const h = eftsHits(j); assert.equal(h.length, 4); assert.equal(h[0][2], 320193); assert.deepEqual(h[0][7], ['AAPL']);
  assert.equal(mainDoc(h[0]), true); assert.equal(mainDoc(h[1]), false); assert.equal(mainDoc(h[2]), false); assert.equal(mainDoc(h[3]), true, 'no file type: the file name decides');
  assert.equal(hasItem(h[0], '1.01'), true); assert.equal(hasItem(h[3], '1.01'), false); assert.equal(hasItem(h[3], '3.02'), true);
});

// a quiet base: 40 sessions at 10 (low 9.8), filing at f = 32, then higher lows; volume rises in the last 10 sessions
const base = (n = 45) => { const c = Array(n).fill(10), S = { o: c.map(x => x), h: c.map(x => x + 0.2), l: c.map(x => x - 0.2), c: [...c], v: Array(n).fill(100000) }; for (let k = n - 12; k < n; k++) S.v[k] = 150000; return S; };
test('signal: price conditions a, d, e, f; the first session 1..10 after the filing that passes; shares and dilution', () => {
  const S = base(), f = 32, dv = () => 3e6; for (let k = f; k < 45; k++) { S.l[k] = 9.8 + (k - f) * 0.01; }
  assert.equal(priceOk(S, 34, f, 3e6), false, 't - f = 2: the 3-session window would reach before the filing');
  assert.equal(priceOk(S, 35, f, 3e6), true); assert.equal(priceOk(S, 35, f, 1.9e6), false, 'traded value under 2M');
  const lowC = base(); lowC.c = lowC.c.map(() => 1.9); assert.equal(priceOk(lowC, 35, f, 3e6), false, 'close under 2');
  const jump = base(); for (let k = f; k < 45; k++) jump.l[k] = 9.8 + (k - f) * 0.01; jump.c[20] = 11.6; jump.c[21] = 11.6; assert.equal(priceOk(jump, 35, f, 3e6), false, '+16% close-to-close inside t-20..t');
  jump.c[20] = 11.4; jump.c[21] = 11.4; jump.c[22] = 10; assert.equal(priceOk(jump, 35, f, 3e6), true, '+14% is allowed');
  const lower = base(); for (let k = f; k < 45; k++) lower.l[k] = 9.8; lower.l[35] = 9.7; assert.equal(priceOk(lower, 35, f, 3e6), false, 'a lower low in the last 3 sessions');
  const eq = base(); for (let k = f; k < 45; k++) eq.l[k] = 9.8; assert.equal(priceOk(eq, 35, f, 3e6), true, 'an equal low is not lower');
  const vol = base(); for (let k = f; k < 45; k++) vol.l[k] = 9.8; vol.v = vol.v.map(() => 100000); vol.v[35] = 99999; assert.equal(priceOk(vol, 35, f, 3e6), false, 'volume under 1.0x');
  vol.v[35] = 100000; assert.equal(priceOk(vol, 35, f, 3e6), true, 'exactly 1.0x passes');
  assert.equal(priceOk(S, 43, f, 3e6), false, 't - f = 11 is too late');
  const x = { sharesUp: () => 0.01, diluted: () => false }; assert.equal(signalSession(S, f, dv, x), 35);
  assert.equal(signalSession(S, f, dv, { sharesUp: () => 0.05, diluted: () => false }), -1, 'share count up 5% fails'); assert.equal(signalSession(S, f, dv, { sharesUp: () => null, diluted: () => false }), -1, 'unknown count fails');
  assert.equal(signalSession(S, f, dv, { sharesUp: () => 0, diluted: (t) => t <= 37 }), 38, 'a dilution filing blocks until it leaves the window');
});

test('shares: count known 30 days late vs the count known 90 days earlier; dilution window of 20 sessions', () => {
  const s = [['2023-01-31', 100], ['2023-04-30', 104], ['2023-07-31', 110]];
  assert.equal(+sharesUp(s, '2023-06-15').toFixed(4), 0.04, 'now = Apr 30 (known after May 30), then = Jan 31'); assert.equal(+sharesUp(s, '2023-09-15').toFixed(4), 0.0577);
  assert.equal(sharesUp(s, '2023-03-01'), null, 'nothing known 90 days earlier');
  const sess = (d) => ({ '2023-01-02': 0, '2023-02-01': 21, '2023-03-01': 40 })[d] ?? 99;
  assert.equal(dilutedAt(['2023-02-01'], 40, sess), true); assert.equal(dilutedAt(['2023-01-02'], 40, sess), false); assert.equal(dilutedAt(['2023-03-01'], 39, sess), false, 'a later filing does not count');
});

const path = (closes, { lows, opens } = {}) => ({ o: opens || closes.map(x => x), h: closes.map(x => x * 1.01), l: lows || closes.map(x => x * 0.99), c: closes, v: closes.map(() => 1) });
test('exit: stop at the open / at the stop, sell next open after a close under the 10-day average, max hold, data end, gone', () => {
  const up = Array.from({ length: 200 }, (_, k) => 10 + k * 0.05);
  const mx = exitOf(path(up), 20, 5); assert.equal(mx.kind, 'max'); assert.equal(mx.x, 139); assert.equal(mx.held, 120);
  const a = [...up]; a[60] = a[59] * 0.9; const ma = exitOf(path(a), 20, 5); assert.equal(ma.kind, 'ma'); assert.equal(ma.x, 61); assert.equal(ma.at, 'o'); assert.equal(ma.lastClose, 60);
  const st = exitOf(path(up, { lows: up.map((x, k) => k === 30 ? 4.9 : x * 0.99) }), 20, 5); assert.equal(st.kind, 'stop'); assert.equal(st.px, 5); assert.equal(st.x, 30);
  const gap = exitOf(path(up, { opens: up.map((x, k) => k === 31 ? 4 : x), lows: up.map((x, k) => k === 31 ? 3.9 : x * 0.99) }), 20, 5); assert.equal(gap.px, 4); assert.equal(gap.at, 'o');
  const first = exitOf(path(up, { opens: up.map((x, k) => k === 20 ? 4.5 : x) }), 20, 5); assert.equal(first.px, 4.5); assert.equal(first.held, 1);
  const short = exitOf(path(up.slice(0, 50)), 20, 5); assert.equal(short.open, true);
  const g = [...up.slice(0, 40), ...Array(20).fill(NaN)]; const gone = exitOf({ ...path(g), l: g, o: g, h: g }, 20, 5); assert.equal(gone.kind, 'gone'); assert.equal(gone.x, 39);
  assert.equal(exitOf(path(up, { opens: up.map((x, k) => k === 20 ? NaN : x) }), 20, 5), null, 'no open on the entry session: no trade');
});

test('volatility deciles; signals per month; per year of capital', () => {
  const c = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10]; assert.ok(vol20(c, 20) > 0.09); assert.equal(vol20(c, 10), null);
  const d = deciles(Array.from({ length: 100 }, (_, k) => ({ key: k, v: k }))); assert.equal(d.get(0), 0); assert.equal(d.get(99), 9); assert.equal(d.get(55), 5);
  const pm = perMonth(['2023-01-05', '2023-01-20', '2023-03-02'], '2023-01', '2023-03'); assert.equal(pm.months, 3); assert.equal(pm.mean, 1); assert.equal(pm.zeroMonths, 1); assert.equal(pm.max, 2);
  assert.equal(+perYear([{ g: 0.108, days: 126 }, { g: 0.108, days: 126 }]).toFixed(4), 0.2);
});

test('V15 lane: SIC 35/36/38 test, monthly keys from 27 Oct 2026, the two versions', () => {
  assert.equal(sic35('3674'), true); assert.equal(sic35('3571'), true); assert.equal(sic35(3812), true); assert.equal(sic35('2834'), false); assert.equal(sic35('7372'), false); assert.equal(sic35(null), false); assert.equal(sic35('370'), false);
  assert.equal(v15Key('2026-10-26', new Set()), null); assert.equal(v15Key('2026-10-27', new Set()), '2026-10'); assert.equal(v15Key('2026-10-28', new Set(['2026-10'])), null); assert.equal(v15Key('2026-11-02', new Set(['2026-10'])), '2026-11');
  const sp = v15Split([{ sym: 'MSFT' }, { sym: 'AAPL' }, { sym: 'MRVL' }, { sym: 'CTAS' }, { sym: 'MSFT' }, { sym: 'ZZZ' }], (s) => ({ MSFT: '7372', AAPL: '3571', MRVL: '3674', CTAS: '2320' })[s] || null);
  assert.deepEqual(sp.ref, ['MSFT', 'AAPL', 'MRVL', 'CTAS', 'ZZZ']); assert.deepEqual(sp.no35, ['MSFT', 'CTAS', 'ZZZ'], 'no SEC SIC: stays in');
});

test('library: three entries once (CONTRACT10D, V15-NO35 forward only, the untested wide version); idempotent', () => {
  const LB = { strategies: [{ id: 'V15' }] }; assert.equal(preRegister(LB), 3); assert.equal(preRegister(LB), 0);
  const ids = LB.strategies.map(x => x.id); assert.deepEqual(ids, ['V15', 'SQ21-CONTRACT10D', 'V15-NO35', NOT_TESTED.id]);
  assert.match(LB.strategies[2].status, /forward paper only/); assert.match(LB.strategies[3].status, /not tested/);
});
