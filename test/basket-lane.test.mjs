// THE BASKET lane (owner's decisions 24 + 26 Oct 2026): every ~1,000 USD in TWO ZAD baskets = Basket 1, ONLY the halal top-20 stocks
// (SQ10-SH20-C15), 35%, in WHOLE-NUMBER percentages summing to 100 (min 1%, largest remainder) + Basket 2, SPUS 54% / gold fund IAUM 46%, 65%.
// Seams in scan.mjs: basketSource / basketPlan / basketWholePct (replacement, renormalisation, whole-number %, unmarked -> Basket 2 SPUS,
// dollar split), basketChange / basketDue (quarterly rebalance notice, monthly reminder), basketNotices, basketText.
// Run: node --test test/basket-lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let sent = [];
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: true })); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
test.after(() => server.close());

const mem = (sym, w) => ({ sym, weightAtReview: w, weightNow: w, zad: 'unknown' });
const T10 = (members, extra = {}) => ({ lastClose: '2026-10-23', methods: { 'SQ10-SH20-C15': { lastReview: '2026-10-02', members, reserves: [{ sym: 'LRCX' }, { sym: 'AMAT' }, { sym: 'CVX' }, { sym: 'COST' }, { sym: 'ORCL' }],
  freshAtLastClose: [...members.map(m => ({ sym: m.sym })), { sym: 'CVX' }, { sym: 'COST' }], ...extra } } });
const T17 = { methods: { 'SQ17-MIX50': { lastReview: '2026-10-02', reserves: [{ sym: 'CVX' }, { sym: 'COST' }, { sym: 'KO' }, { sym: 'ORCL' }, { sym: 'PG' }] } } };
const FOUR = [mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('PLTR', 0.1)];
const sum = (a) => +a.reduce((x, y) => x + y, 0).toFixed(2);
const pcts = (P) => P.rows.map(r => r.pct);
const usds = (P) => [P.spusUsd, P.gold.usd, ...P.rows.map(r => r.usd)];
const TWENTY = [0.15, 0.1405, 0.1213, 0.111, 0.078, 0.0543, 0.0478, 0.0408, 0.0361, 0.0315, 0.0293, 0.0253, 0.0241, 0.0198, 0.0182, 0.0176, 0.0142, 0.0142, 0.0134, 0.0125].map((w, i) => mem('S' + String(i + 1).padStart(2, '0'), w));
const MONTHLY = 'Monthly basket day: Basket 1 (20 stocks) 35% + Basket 2 (SPUS 54% / IAUM 46%) 65%. Send  basket 1000  for the amounts.';
const QUARTERLY = 'Quarterly check: if the mix drifted, new money goes to whatever is below its %; the basket % may have changed - send basket.';
const S = await loadScan({ env });
const src = (t10 = T10(FOUR), t17 = T17) => S.fn('basketSource')(t10, t17), plan = (...a) => S.fn('basketPlan')(...a);

test('a member marked NOT halal is replaced by the first reserve marked halal (unmarked and NOT halal reserves are passed over)', () => {
  const s = src();
  assert.deepEqual(s.reserves.slice(0, 5), ['CVX', 'COST', 'KO', 'ORCL', 'PG']);   // today's line: Shariah list minus members, then squad17, then squad10
  const P = plan(s, { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail', COST: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P.replaced, [{ out: 'PLTR', in: 'KO' }]);
  assert.deepEqual(P.skipped, [{ sym: 'CVX', zad: 'unmarked' }, { sym: 'COST', zad: 'fail' }]);
  const ko = P.rows.find(r => r.sym === 'KO'); assert.equal(ko.pct, 10); assert.equal(ko.replaces, 'PLTR');   // PLTR's 10% of the basket
  assert.ok(!P.rows.some(r => r.sym === 'PLTR'));
  // two NOT halal members take two different reserves, in line order
  const P2 = plan(s, { NVDA: 'ok', AAPL: 'fail', MSFT: 'ok', PLTR: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P2.replaced, [{ out: 'AAPL', in: 'KO' }, { out: 'PLTR', in: 'ORCL' }]);
});

test('weights are renormalised to 100% after a NOT halal member with no halal reserve is dropped', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail' }, 1000);   // no reserve marked halal
  assert.deepEqual(P.dropped, ['PLTR']);
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct]), [['NVDA', 44], ['AAPL', 33], ['MSFT', 22]].map(([s, p], i) => [s, p + (i === 0 ? 1 : 0)]));   // 44.4 / 33.3 / 22.2 -> 45 / 33 / 22
  assert.equal(sum(pcts(P)), 100);
  assert.equal(P.basketUsd, 350); assert.equal(P.spusUsd, 351); assert.equal(P.gold.usd, 299); assert.equal(sum(usds(P)), 1000);
});

test('an unmarked member is listed to check in ZAD first and its money goes to Basket 2 SPUS until marked', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', PLTR: 'fail', KO: 'ok' }, 1000);   // MSFT not checked
  assert.deepEqual(P.unmarked.map(x => [x.sym, x.usd]), [['MSFT', 70]]);   // 35% x 20% of 1000
  assert.ok(!P.rows.some(r => r.sym === 'MSFT'));
  assert.equal(P.basketUsd, 280); assert.equal(P.spusUsd, 421); assert.equal(P.b2.extra, 70); assert.equal(P.b2.usd, 720);   // Basket 2: SPUS 351 + MSFT's 70, IAUM 299
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct, r.usd]), [['NVDA', 50, 140], ['AAPL', 38, 106.4], ['KO', 12, 33.6]]);   // 4/8, 3/8, 1/8 of Basket 1: 50 / 37.5 / 12.5
  assert.equal(P.gold.pct, 46); assert.equal(P.gold.usd, 299); assert.equal(sum(pcts(P)), 100); assert.equal(sum(usds(P)), 1000);
  // nothing marked at all: Basket 1 empty, all of its 350 in Basket 2 SPUS
  const P0 = plan(src(), {}, 1000); assert.equal(P0.spusUsd, 701); assert.equal(P0.gold.usd, 299); assert.equal(P0.basketUsd, 0); assert.equal(P0.rows.length, 0);
});

test('whole-number basket percentages: largest remainder of the basket weights, min 1% each, total exactly 100 (today\'s 20 stocks)', () => {
  const s20 = src(T10(TWENTY)), marks = Object.fromEntries(TWENTY.map(m => [m.sym, 'ok']));
  const P = plan(s20, marks, 1000);
  assert.equal(P.rows.length, 20); assert.equal(P.gold.sym, 'IAUM'); assert.equal(P.gold.pct, 46);
  for (const x of pcts(P)) { assert.ok(Number.isInteger(x), 'whole number: ' + x); assert.ok(x >= 1, 'min 1%: ' + x); }
  assert.equal(sum(pcts(P)), 100);
  // the live 26 Oct 2026 weights (PLTR's slot held by KO): NVDA 15, AAPL 14, GOOGL 12, MSFT 11, AMZN 8, META 6, AVGO 5, TSLA 4, MU 4, LLY 3, AMD 3, SPCX 3, WMT 2, XOM 2, INTC 2, JNJ 2, KO 1, MA 1, ABBV 1, CSCO 1
  const LIVE = [['AAPL', 0.1405], ['NVDA', 0.15], ['GOOGL', 0.1213], ['MSFT', 0.111], ['AMZN', 0.078], ['META', 0.0543], ['AVGO', 0.0478], ['TSLA', 0.0408], ['LLY', 0.0315], ['MU', 0.0361], ['WMT', 0.0241], ['SPCX', 0.0253], ['AMD', 0.0293], ['XOM', 0.0198], ['JNJ', 0.0182], ['MA', 0.0142], ['ABBV', 0.0134], ['PLTR', 0.0142], ['INTC', 0.0176], ['CSCO', 0.0125]].map(([s, w]) => mem(s, w));
  const lm = Object.fromEntries(LIVE.map(m => [m.sym, 'ok'])); lm.PLTR = 'fail'; lm.KO = 'ok';
  const PL = plan(src(T10(LIVE)), lm, 1000);
  assert.deepEqual(PL.rows.map(r => r.sym + ' ' + r.pct), ['NVDA 15', 'AAPL 14', 'GOOGL 12', 'MSFT 11', 'AMZN 8', 'META 6', 'AVGO 5', 'TSLA 4', 'MU 4', 'LLY 3', 'AMD 3', 'SPCX 3', 'WMT 2', 'XOM 2', 'JNJ 2', 'INTC 2', 'KO 1', 'MA 1', 'ABBV 1', 'CSCO 1']);
  assert.equal(PL.rows.find(r => r.sym === 'NVDA').usd, 52.5); assert.equal(PL.basketUsd, 350); assert.equal(PL.spusUsd, 351); assert.equal(PL.gold.usd, 299); assert.equal(PL.b2.usd, 650);
  // the 1% minimum: names below 1% of the basket are raised and flagged, the extra points come off the holdings with the smallest remainders
  const wp = S.fn('basketWholePct');
  const tiny = wp([{ sym: 'A', w: 0.97 }, { sym: 'B', w: 0.01 }, { sym: 'C', w: 0.005 }, { sym: 'D', w: 0.005 }]);
  assert.deepEqual(tiny.map(r => [r.sym, r.pct, r.raised]), [['A', 97, false], ['B', 1, false], ['C', 1, true], ['D', 1, true]]);
  assert.deepEqual(wp([]), []);
  assert.deepEqual(wp([{ sym: 'X', w: 0.2 }]).map(r => r.pct), [100]);
});

test('dollar split for 1000 and 1500: Basket 1 35% by its whole %, Basket 2 65% = SPUS 54% / IAUM 46% (cents to SPUS), adding up exactly', () => {
  const marks = { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail', KO: 'ok' };
  const P1 = plan(src(), marks, 1000), P2 = plan(src(), marks, 1500);
  assert.deepEqual(pcts(P1), [40, 30, 20, 10]);   // NVDA, AAPL, MSFT, KO
  assert.deepEqual(usds(P1), [351, 299, 140, 105, 70, 35]);   // SPUS, IAUM (Basket 2), then the Basket 1 stocks
  assert.deepEqual(usds(P2), [526.5, 448.5, 210, 157.5, 105, 52.5]);
  assert.deepEqual(P2.rows.map(r => r.sym), ['NVDA', 'AAPL', 'MSFT', 'KO']);
  const s20 = src(T10(TWENTY)), m20 = Object.fromEntries(TWENTY.map(m => [m.sym, 'ok']));
  for (const amt of [1000, 1500, 1234.56]) { const P = plan(s20, m20, amt); assert.equal(sum(pcts(P)), 100); assert.equal(sum(usds(P)), amt);
    const b2 = Math.round(amt * 65) / 100; assert.equal(sum(P.rows.map(r => r.usd)), P.basketUsd); assert.equal(P.basketUsd, Math.round(amt * 35) / 100);
    assert.equal(P.gold.usd, Math.round(b2 * 46) / 100); assert.equal(P.spusUsd, +(b2 - P.gold.usd).toFixed(2)); assert.equal(P.b2.extra, 0); }
  const P15 = plan(s20, m20, 1500); assert.equal(P15.gold.usd, 448.5); assert.equal(P15.basketUsd, 525); assert.equal(P15.spusUsd, 526.5);
});

test('rebalance change detection: members in/out or a weight change at a new formation; drift-free repeats are silent', () => {
  const f = S.fn('basketFormation'), ch = S.fn('basketChange');
  const a = f(T10(FOUR)), same = f(T10(FOUR));
  assert.equal(ch(a, same), null);
  const swap = f(T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('ORCL', 0.1)], { lastReview: '2027-01-04' }));
  assert.deepEqual(ch(a, swap), { ins: ['ORCL'], outs: ['PLTR'], moved: [], review: '2027-01-04' });
  const rew = f(T10([mem('NVDA', 0.35), mem('AAPL', 0.35), mem('MSFT', 0.2), mem('PLTR', 0.1)], { lastReview: '2027-01-04' }));
  assert.deepEqual(ch(a, rew).moved, ['NVDA', 'AAPL']);
  const tiny = f(T10([mem('NVDA', 0.4004), mem('AAPL', 0.2996), mem('MSFT', 0.2), mem('PLTR', 0.1)]));   // same review, rounding noise
  assert.equal(ch(a, tiny), null);
});

test('rebalance notice: the first formation is the silent baseline; a new one is sent once with plain words about old holdings', async () => {
  const due = S.fn('basketDue'), SAT = Date.parse('2026-10-24T15:00:00Z');
  let r = due(SAT, {}, T10(FOUR), T17, {});
  assert.equal(r.msgs.length, 0); assert.equal(r.state.formation.review, '2026-10-02');
  const next = T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('ORCL', 0.1)], { lastReview: '2027-01-04' });
  r = due(SAT, r.state, next, T17, { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', ORCL: 'ok' });
  assert.equal(r.msgs.length, 1);
  assert.match(r.msgs[0], /^THE BASKET: NEW QUARTERLY LIST \(formed 4 Jan 2027\)/);
  assert.match(r.msgs[0], /IN: ORCL/); assert.match(r.msgs[0], /OUT: PLTR/);
  assert.match(r.msgs[0], /NEW PERCENTAGES for ZAD Basket 1, the 20 stocks \(whole numbers, total 100%, after ZAD checks\):\nNVDA 40%, AAPL 30%, MSFT 20%, ORCL 10%\.\nBasket 2 stays SPUS 54% \/ IAUM 46%\./);
  assert.match(r.msgs[0], /New money from now on uses the new percentages\. You do NOT need to sell what you already hold/);
  assert.equal(due(SAT, r.state, next, T17, {}).msgs.length, 0);   // once
});

test('monthly reminder: first US trading day of the month, after the US open, once; not on other days', async () => {
  const due = S.fn('basketDue'), first = S.fn('firstSessionOfMonth');
  assert.equal(first('2026-11-02'), true); assert.equal(first('2026-11-03'), false); assert.equal(first('2026-11-01'), false);   // 1 Nov 2026 is a Sunday
  assert.equal(first('2027-01-04'), true); assert.equal(first('2027-01-01'), false);   // New Year holiday, then the weekend
  const base = due(Date.parse('2026-10-24T15:00:00Z'), {}, T10(FOUR), T17, {}).state;
  const before = due(Date.parse('2026-11-02T13:00:00Z'), base, T10(FOUR), T17, {});   // 8:00 New York, before the open
  assert.equal(before.msgs.length, 0);
  const after = due(Date.parse('2026-11-02T16:00:00Z'), base, T10(FOUR), T17, {});   // 11:00 New York = 19:00 Kuwait
  assert.deepEqual(after.msgs, [MONTHLY]);
  assert.equal(due(Date.parse('2026-11-02T18:00:00Z'), after.state, T10(FOUR), T17, {}).msgs.length, 0);
  assert.equal(due(Date.parse('2026-11-03T16:00:00Z'), base, T10(FOUR), T17, {}).msgs.length, 0);
  // quarterly check line on the first trading day of Jan / Apr / Jul / Oct only
  assert.deepEqual(due(Date.parse('2027-01-04T16:00:00Z'), base, T10(FOUR), T17, {}).msgs, [MONTHLY + '\n' + QUARTERLY]);
  assert.deepEqual(due(Date.parse('2027-04-01T16:00:00Z'), base, T10(FOUR), T17, {}).msgs, [MONTHLY + '\n' + QUARTERLY]);
  assert.deepEqual(due(Date.parse('2026-12-01T17:00:00Z'), base, T10(FOUR), T17, {}).msgs, [MONTHLY]);
  // sent by the bot through Telegram (in quiet mode too: it is an action reminder) and remembered in data/basket-state.json
  const B = await loadScan({ env, files: { 'data/settings.json': { quiet: true }, 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17, 'data/tg-state.json': { offset: 3 } } });
  sent = [];
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:00:00Z'));
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:30:00Z'));
  assert.deepEqual(sent, [MONTHLY]);
  assert.equal(B.readJson('data/basket-state.json').monthly, '2026-11');
  assert.equal(B.readJson('data/tg-state.json').offset, 3);
});

test('basket text: header, Basket 1 whole-number list, Basket 2 SPUS / IAUM, replacement note, next rebalance, tested record; ways lists the three lanes', async () => {
  const B = await loadScan({ env, files: { 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17,
    'data/halal.json': { NVDA: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }, AAPL: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }, PLTR: { s: 'fail', d: '2026-10-24', by: 'ZAD (you)' }, COST: { s: 'fail', d: '2026-10-24', by: 'ZAD (you)' }, KO: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' } } } });
  const t = B.fn('basketText')(2000, Date.parse('2026-10-24T15:00:00Z'));
  assert.match(t, /^THE BASKET \(one of the system’s ways: long-term core\)\nFor 2,000 USD/);
  assert.match(t, /TWO ZAD baskets = Basket 1, the halal top-20 stocks, 35% \+ Basket 2, SPUS 54% \/ gold fund IAUM 46%, 65%/);
  assert.match(t, /\nZAD BASKET 1 \(3 stocks\): 560 USD\nEnter these WHOLE-NUMBER percentages in ZAD \(total 100%\):\n/);
  assert.match(t, /- NVDA 50% = 280\.00 USD \(ZAD halal\)/);
  assert.match(t, /- KO 12% = 67\.20 USD \(ZAD halal; replaces PLTR\)/);
  assert.match(t, /These percentages only change at the quarterly update\./);
  assert.match(t, /\nZAD BASKET 2 \(SPUS 54% \+ IAUM 46%\): 1,440 USD\n- SPUS 54% = 842\.00 USD \(702\.00 \+ 140\.00 held for the stocks not yet checked in ZAD\)\n- IAUM 46% = 598\.00 USD \(gold fund - your ZAD choice\)\n/);
  assert.match(t, /Note: this month Basket 2 gets 140\.00 USD more for MSFT \(not yet checked in ZAD\): invest 1,300 at 54\/46 and add the 140\.00 to SPUS\./);
  assert.match(t, /Total: 2,000\.00 USD = 560\.00 \(Basket 1\) \+ 1,440\.00 \(Basket 2\)\./);
  assert.match(t, /REPLACED: PLTR is NOT halal in ZAD, so KO/);
  assert.match(t, /CHECK IN ZAD FIRST: MSFT \(140\.00 USD, in Basket 2 SPUS until you mark it\)/);
  assert.match(t, /Basket 1 holds ONLY the 20 stocks and Basket 2 ONLY SPUS \+ IAUM; enter THESE percentages, not an equal split/);
  assert.doesNotMatch(t, /rounded up to 1%/);   // no small names in this basket
  const small = await loadScan({ env, files: { 'data/squad10-today.json': T10([...TWENTY.slice(0, 19), mem('S20', 0.004)]), 'data/halal.json': Object.fromEntries(TWENTY.map(m => [m.sym, { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }])) } });
  const t2 = small.fn('basketText')(1000, Date.parse('2026-10-24T15:00:00Z'));
  assert.match(t2, /- S20 1% = 3\.50 USD \(ZAD halal; rounded up to 1%\)/);
  assert.match(t2, /Small names are rounded up to 1% of Basket 1 \(ZAD minimum\), slightly more than their exact share: S20 0\.\d\d%/);
  assert.match(t, /Next rebalance: about 4 Jan 2027/);
  assert.match(t, /14\.2% a year vs SPUS 12\.0%; worst fall -30% vs -29%/);
  assert.match(t, /16\.2% a year, worst fall -33%\. NOT PROVEN by the luck test/);
  assert.match(t, /\nWith 30% gold \(Squad 23 test, 70% basket \+ 30% gold\): ~17\.5% a year vs 16\.2%, worst fall -26% vs -33%; NOT PROVEN by the luck test\n/);
  const w = B.fn('waysText')();
  assert.match(w, /a\) THE BASKET \(core\)/); assert.match(w, /b\) TRY SMALL: 1,000 USD/); assert.match(w, /c\) OPTIONS PAPER LANE/);
  assert.match(B.value('HELP'), /\nbasket   \(THE BASKET/); assert.match(B.value('HELP'), /\nways   \(your ways to trade/);
  const none = await loadScan({ env });
  assert.match(none.fn('basketText')(1000), /not ready yet.*whole amount in Basket 2 at 70% SPUS \+ 30% IAUM/s);
  assert.deepEqual(blocked, []);
});
