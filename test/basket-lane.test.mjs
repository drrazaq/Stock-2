// THE BASKET lane (owner's decisions 24 + 26 Oct 2026, third version): ZAD charges ~3 USD per stock per order, so
// - every month: ZAD Basket 2 = SPUS 54% / gold fund IAUM 46% with 65% of the amount; 35% kept as cash for Basket 1;
// - Basket 1 = the HALAL TOP 10 (SQ10-SH10-C15, max 15% each; or the 10 largest of SQ10-SH20-C15 re-capped at 15%), bought only on the
//   first US trading day of January, May and September with the saved cash, in WHOLE-NUMBER % summing to 100 (min 1%, largest remainder).
// Seams in scan.mjs: basketSource / basketCap / basketPlan / basketWholePct / basketMonth / basketFee / basketNextBuy (replacement,
// renormalisation, whole-number %, unmarked -> SPUS, monthly 65/35 split, fee check, buy days), basketChange / basketDue (rebalance notice,
// monthly reminder), basketNotices, basketText, basketBuyText, and the Telegram commands  basket N  /  basket buy N  (tgCommands).
// Run: node --test test/basket-lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let sent = [], queue = [], uid = 100;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
test.after(() => server.close());

const mem = (sym, w) => ({ sym, weightAtReview: w, weightNow: w, zad: 'unknown' });
const RES = [{ sym: 'LRCX' }, { sym: 'AMAT' }, { sym: 'CVX' }, { sym: 'COST' }, { sym: 'ORCL' }];
const T10 = (members, extra = {}, id = 'SQ10-SH10-C15') => ({ lastClose: '2026-10-23', methods: { [id]: { lastReview: '2026-10-02', members, reserves: RES,
  freshAtLastClose: [...members.map(m => ({ sym: m.sym })), { sym: 'CVX' }, { sym: 'COST' }], ...extra } } });
const T17 = { methods: { 'SQ17-MIX50': { lastReview: '2026-10-02', reserves: [{ sym: 'CVX' }, { sym: 'COST' }, { sym: 'KO' }, { sym: 'ORCL' }, { sym: 'PG' }] } } };
const FOUR = [mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('PLTR', 0.1)];
const sum = (a) => +a.reduce((x, y) => x + y, 0).toFixed(2);
const pcts = (P) => P.rows.map(r => r.pct);
const usds = (P) => [P.spusUsd, ...P.rows.map(r => r.usd)];
// the live 26 Oct 2026 lists: SQ10-SH10-C15 (weights at the 2 Oct review) and SQ10-SH20-C15
const LIVE10 = [['AAPL', 0.15], ['MSFT', 0.15], ['GOOGL', 0.15], ['NVDA', 0.15], ['AMZN', 0.1082], ['META', 0.0753], ['AVGO', 0.0663], ['TSLA', 0.0565], ['LLY', 0.0437], ['MU', 0.0501]].map(([s, w]) => mem(s, w));
const LIVE20 = [['AAPL', 0.1405], ['NVDA', 0.15], ['GOOGL', 0.1213], ['MSFT', 0.111], ['AMZN', 0.078], ['META', 0.0543], ['AVGO', 0.0478], ['TSLA', 0.0408], ['LLY', 0.0315], ['MU', 0.0361], ['WMT', 0.0241], ['SPCX', 0.0253], ['AMD', 0.0293], ['XOM', 0.0198], ['JNJ', 0.0182], ['MA', 0.0142], ['ABBV', 0.0134], ['PLTR', 0.0142], ['INTC', 0.0176], ['CSCO', 0.0125]].map(([s, w]) => mem(s, w));
const TODAY = { NVDA: 15, AAPL: 15, GOOGL: 15, MSFT: 15, AMZN: 11, META: 7, AVGO: 7, TSLA: 6, MU: 5, LLY: 4 };
const okAll = (list) => Object.fromEntries(list.map(m => [m.sym, 'ok']));
const asMap = (P) => Object.fromEntries(P.rows.map(r => [r.sym, r.pct]));
const MONTHLY = 'Monthly basket day: Basket 2 (SPUS 54% / IAUM 46%) with 65% of your amount; keep 35% as cash for Basket 1. Send  basket 1000 .';
const BUYDAY = 'Basket 1 buy day: buy the top 10 with your saved cash. Send  basket buy AMOUNT .';
const S = await loadScan({ env });
const src = (t10 = T10(FOUR), t17 = T17) => S.fn('basketSource')(t10, t17), plan = (...a) => S.fn('basketPlan')(...a);
const halal = (list, extra = {}) => ({ ...Object.fromEntries(list.map(s => [s, { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }])), ...extra });
const send = async (B, text) => { queue = [text]; sent = []; await B.fn('tgCommands')(null); return sent.join('\n'); };

test('a member marked NOT halal is replaced by the first reserve marked halal (unmarked and NOT halal reserves are passed over)', () => {
  const s = src();
  assert.deepEqual(s.reserves.slice(0, 5), ['CVX', 'COST', 'KO', 'ORCL', 'PG']);   // today's line: Shariah list minus members, then squad17, then squad10
  const P = plan(s, { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail', COST: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P.replaced, [{ out: 'PLTR', in: 'KO' }]);
  assert.deepEqual(P.skipped, [{ sym: 'CVX', zad: 'unmarked' }, { sym: 'COST', zad: 'fail' }]);
  const ko = P.rows.find(r => r.sym === 'KO'); assert.equal(ko.pct, 10); assert.equal(ko.replaces, 'PLTR'); assert.equal(ko.usd, 100);
  assert.ok(!P.rows.some(r => r.sym === 'PLTR'));
  const P2 = plan(s, { NVDA: 'ok', AAPL: 'fail', MSFT: 'ok', PLTR: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P2.replaced, [{ out: 'AAPL', in: 'KO' }, { out: 'PLTR', in: 'ORCL' }]);
});

test('weights are renormalised to 100% after a NOT halal member with no halal reserve is dropped', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail' }, 1000);
  assert.deepEqual(P.dropped, ['PLTR']);
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct]), [['NVDA', 45], ['AAPL', 33], ['MSFT', 22]]);   // 44.4 / 33.3 / 22.2
  assert.equal(sum(pcts(P)), 100); assert.equal(P.basketUsd, 1000); assert.equal(P.spusUsd, 0); assert.equal(sum(usds(P)), 1000);
});

test('an unmarked member is listed to check in ZAD first and, on a buy, its share goes to SPUS until marked', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', PLTR: 'fail', KO: 'ok' }, 1000);   // MSFT not checked
  assert.deepEqual(P.unmarked.map(x => [x.sym, x.usd]), [['MSFT', 200]]);
  assert.ok(!P.rows.some(r => r.sym === 'MSFT'));
  assert.equal(P.basketUsd, 800); assert.equal(P.spusUsd, 200);
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct, r.usd]), [['NVDA', 50, 400], ['AAPL', 38, 304], ['KO', 12, 96]]);   // 50 / 37.5 / 12.5
  assert.equal(sum(pcts(P)), 100); assert.equal(sum(usds(P)), 1000);
  const P0 = plan(src(), {}, 1000); assert.equal(P0.spusUsd, 1000); assert.equal(P0.basketUsd, 0); assert.equal(P0.rows.length, 0);
});

test('top 10 whole-number %: total exactly 100, min 1%, today = NVDA 15, AAPL 15, GOOGL 15, MSFT 15, AMZN 11, META 7, AVGO 7, TSLA 6, MU 5, LLY 4', () => {
  const P = plan(src(T10(LIVE10)), okAll(LIVE10), 1000);
  assert.equal(P.rows.length, 10);
  for (const x of pcts(P)) { assert.ok(Number.isInteger(x), 'whole number: ' + x); assert.ok(x >= 1, 'min 1%: ' + x); }
  assert.equal(sum(pcts(P)), 100); assert.deepEqual(asMap(P), TODAY);
  // no SH10-C15 list: the 10 largest of the top 20, re-capped at 15% (iteratively) give the same whole numbers
  const d = src(T10(LIVE20, {}, 'SQ10-SH20-C15'));
  assert.equal(d.derived, true); assert.equal(d.members.length, 10);
  assert.ok(d.members.every(m => m.w <= 0.15 + 1e-9)); assert.equal(+d.members.reduce((a, m) => a + m.w, 0).toFixed(9), 1);
  assert.deepEqual(d.reserves.slice(0, 3), ['WMT', 'SPCX', 'AMD']);   // the rest of the top 20 (today's Shariah list) comes first in the line
  const PD = plan(d, okAll(LIVE20), 1000); assert.deepEqual(asMap(PD), TODAY); assert.equal(sum(pcts(PD)), 100);
  // a member of the derived top 10 marked NOT halal takes the next of the top 20 that is marked halal
  const PR = plan(d, { ...okAll(LIVE20), TSLA: 'fail' }, 1000); assert.equal(PR.replaced[0].out, 'TSLA'); assert.ok(['WMT', 'SPCX', 'AMD', 'XOM'].includes(PR.replaced[0].in));
  // the cap itself
  const cap = S.fn('basketCap'), c = cap([{ sym: 'A', w: 5 }, { sym: 'B', w: 1 }, { sym: 'C', w: 1 }, { sym: 'D', w: 1 }, { sym: 'E', w: 1 }, { sym: 'F', w: 1 }, { sym: 'G', w: 1 }, { sym: 'H', w: 1 }, { sym: 'I', w: 1 }, { sym: 'J', w: 1 }]);
  assert.equal(c[0].sym, 'A'); assert.equal(+c[0].w.toFixed(6), 0.15); assert.equal(+c[1].w.toFixed(6), +(0.85 / 9).toFixed(6));
  // the 1% minimum: names below 1% are raised and flagged, the extra points come off the holdings with the smallest remainders
  const wp = S.fn('basketWholePct');
  assert.deepEqual(wp([{ sym: 'A', w: 0.97 }, { sym: 'B', w: 0.01 }, { sym: 'C', w: 0.005 }, { sym: 'D', w: 0.005 }]).map(r => [r.sym, r.pct, r.raised]), [['A', 97, false], ['B', 1, false], ['C', 1, true], ['D', 1, true]]);
  assert.deepEqual(wp([]), []); assert.deepEqual(wp([{ sym: 'X', w: 0.2 }]).map(r => r.pct), [100]);
});

test('monthly split: Basket 2 = 65% (SPUS 54% / IAUM 46%, cents to SPUS), 35% set aside as cash for Basket 1', () => {
  const m = S.fn('basketMonth');
  assert.deepEqual(m(1000), { amount: 1000, b2: 650, spus: 351, gold: 299, aside: 350 });
  assert.deepEqual(m(1500), { amount: 1500, b2: 975, spus: 526.5, gold: 448.5, aside: 525 });
  for (const amt of [1000, 1500, 1234.56, 777]) { const x = m(amt); assert.equal(+(x.b2 + x.aside).toFixed(2), amt); assert.equal(+(x.spus + x.gold).toFixed(2), x.b2);
    assert.equal(x.b2, Math.round(amt * 65) / 100); assert.equal(x.gold, Math.round(x.b2 * 46) / 100); }
  // a Basket 1 buy of the saved cash adds up to the cent
  const s10 = src(T10(LIVE10)); for (const amt of [1400, 1234.56, 2100]) { const P = plan(s10, okAll(LIVE10), amt); assert.equal(sum(usds(P)), amt); assert.equal(sum(P.rows.map(r => r.usd)), P.basketUsd); }
});

test('Basket 1 buy days: first US trading day of January, May and September', () => {
  const nb = S.fn('basketNextBuy');
  assert.equal(nb('2026-10-26'), '2027-01-04');   // 1 Jan holiday, 2-3 Jan weekend
  assert.equal(nb('2027-01-04'), '2027-01-04');   // the day itself
  assert.equal(nb('2027-01-05'), '2027-05-03');   // 1 May 2027 is a Saturday
  assert.equal(nb('2027-05-04'), '2027-09-01');
  assert.equal(nb('2027-09-02'), '2028-01-03');
});

test('fee check: 10 stocks x 3 USD = 30 USD; warning above 2% of the buy (save longer)', () => {
  const s10 = src(T10(LIVE10)), fee = S.fn('basketFee');
  const F14 = fee(plan(s10, okAll(LIVE10), 1400), 3); assert.equal(F14.orders, 10); assert.equal(F14.usd, 30); assert.equal(F14.pct.toFixed(2), '2.14'); assert.equal(F14.high, true); assert.equal(F14.minAmount, 1500);
  assert.equal(fee(plan(s10, okAll(LIVE10), 1500), 3).high, false);   // exactly 2% is not above 2%
  assert.equal(fee(plan(s10, okAll(LIVE10), 3000), 3).pct, 1);
  const un = { ...okAll(LIVE10) }; delete un.MU; const FU = fee(plan(s10, un, 1400), 3); assert.equal(FU.stocks, 9); assert.equal(FU.orders, 10);   // + 1 SPUS order
});

test('rebalance change detection: members in/out or a weight change at a new formation; drift-free repeats are silent', () => {
  const f = S.fn('basketFormation'), ch = S.fn('basketChange');
  const a = f(T10(FOUR)), same = f(T10(FOUR));
  assert.equal(a.id, 'SQ10-SH10-C15'); assert.equal(ch(a, same), null);
  const swap = f(T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('ORCL', 0.1)], { lastReview: '2027-01-04' }));
  assert.deepEqual(ch(a, swap), { ins: ['ORCL'], outs: ['PLTR'], moved: [], review: '2027-01-04' });
  const rew = f(T10([mem('NVDA', 0.35), mem('AAPL', 0.35), mem('MSFT', 0.2), mem('PLTR', 0.1)], { lastReview: '2027-01-04' }));
  assert.deepEqual(ch(a, rew).moved.sort(), ['AAPL', 'NVDA']);
  assert.equal(ch(a, f(T10([mem('NVDA', 0.4004), mem('AAPL', 0.2996), mem('MSFT', 0.2), mem('PLTR', 0.1)]))), null);   // rounding noise
});

test('rebalance notice: baseline silent (also over an old top-20 state); a new top-10 list is sent once with the % for the next Basket 1 buy and no selling', async () => {
  // (27 Oct 2026, owner-approved: "no basket, I will buy SPUS and IAUM") Basket 1 notices are OFF by default; this test pins them with
  // settings.basket1 === true (the 6th argument). The default-off behaviour is pinned in test/leader-dip.test.mjs.
  const due = (...a) => S.fn('basketDue')(...a.slice(0, 5), true), SAT = Date.parse('2026-10-24T15:00:00Z');
  let r = due(SAT, {}, T10(FOUR), T17, {});
  assert.equal(r.msgs.length, 0); assert.equal(r.state.formation.review, '2026-10-02'); assert.equal(r.state.formation.id, 'SQ10-SH10-C15');
  const old = due(SAT, { formation: { review: '2026-10-02', w: Object.fromEntries(LIVE20.map(m => [m.sym, m.weightAtReview])) }, monthly: '2026-10' }, T10(FOUR), T17, {});
  assert.equal(old.msgs.length, 0); assert.equal(old.state.formation.id, 'SQ10-SH10-C15'); assert.equal(old.state.monthly, '2026-10');
  const next = T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('ORCL', 0.1)], { lastReview: '2027-01-04' });
  r = due(SAT, r.state, next, T17, { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', ORCL: 'ok' });
  assert.equal(r.msgs.length, 1);
  assert.match(r.msgs[0], /^THE BASKET: NEW TOP-10 LIST \(formed 4 Jan 2027\)/);
  assert.match(r.msgs[0], /IN: ORCL/); assert.match(r.msgs[0], /OUT: PLTR/);
  assert.match(r.msgs[0], /NEW PERCENTAGES for your next Basket 1 buy \(4 Jan 2027\) \(whole numbers, total 100%, after ZAD checks\):\nNVDA 40%, AAPL 30%, MSFT 20%, ORCL 10%\.\nBasket 2 stays SPUS 54% \/ IAUM 46% every month\./);
  assert.match(r.msgs[0], /Old holdings are never sold \(no extra commissions\)/);
  assert.equal(due(SAT, r.state, next, T17, {}).msgs.length, 0);   // once
});

test('monthly reminder: first US trading day of each month after the open, once; Jan / May / Sep add the Basket 1 buy-day line', async () => {
  // (27 Oct 2026, owner-approved) the Basket 1 buy-day line now needs settings.basket1 === true (6th argument); Basket 2 is unchanged.
  const due = (...a) => S.fn('basketDue')(...a.slice(0, 5), true), first = S.fn('firstSessionOfMonth');
  assert.equal(first('2026-11-02'), true); assert.equal(first('2026-11-03'), false); assert.equal(first('2026-11-01'), false);
  const base = due(Date.parse('2026-10-24T15:00:00Z'), {}, T10(FOUR), T17, {}).state;
  assert.equal(due(Date.parse('2026-11-02T13:00:00Z'), base, T10(FOUR), T17, {}).msgs.length, 0);   // before the open
  const after = due(Date.parse('2026-11-02T16:00:00Z'), base, T10(FOUR), T17, {});
  assert.deepEqual(after.msgs, [MONTHLY]);
  assert.equal(due(Date.parse('2026-11-02T18:00:00Z'), after.state, T10(FOUR), T17, {}).msgs.length, 0);
  assert.equal(due(Date.parse('2026-11-03T16:00:00Z'), base, T10(FOUR), T17, {}).msgs.length, 0);
  for (const d of ['2027-01-04', '2027-05-03', '2027-09-01']) assert.deepEqual(due(Date.parse(d + 'T16:00:00Z'), base, T10(FOUR), T17, {}).msgs, [MONTHLY + '\n' + BUYDAY], d);
  for (const d of ['2026-12-01', '2027-04-01', '2027-07-01', '2027-10-01']) assert.deepEqual(due(Date.parse(d + 'T16:00:00Z'), base, T10(FOUR), T17, {}).msgs, [MONTHLY], d);
  const B = await loadScan({ env, files: { 'data/settings.json': { quiet: true }, 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17, 'data/tg-state.json': { offset: 3 } } });
  sent = [];
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:00:00Z'));
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:30:00Z'));
  assert.deepEqual(sent, [MONTHLY]);
  assert.equal(B.readJson('data/basket-state.json').monthly, '2026-11');
  assert.equal(B.readJson('data/tg-state.json').offset, 3);
});

test('basket text: 65/35 month, next Basket 1 buy day with 4 months saved, top-10 whole % list, ZAD notes, tested record', async () => {
  const B = await loadScan({ env, files: { 'data/squad10-today.json': T10(LIVE10), 'data/squad17-today.json': T17, 'data/halal.json': halal(LIVE10.map(m => m.sym)) } });
  const t = B.fn('basketText')(1000, Date.parse('2026-10-26T15:00:00Z'));
  assert.match(t, /^THE BASKET \(one of the system’s ways: long-term core\)\nThis month: Basket 2 = 65% of 1,000 USD = 650\.00 USD \(SPUS 54% = 351\.00 USD, IAUM 46% = 299\.00 USD\)\. Set aside 35% = 350\.00 USD in cash for Basket 1\.\n/);
  assert.match(t, /\nBasket 1 \(top 10\) is bought on 4 Jan 2027; with 4 months saved that is about 1,400 USD\. On that day send  basket buy 1400 /);
  assert.match(t, /Percentages for your next Basket 1 buy \(whole numbers, total 100%\):\nAAPL 15%, GOOGL 15%, MSFT 15%, NVDA 15%, AMZN 11%, META 7%, AVGO 7%, TSLA 6%, MU 5%, LLY 4%\.\n/);
  assert.match(t, /CHECK IN ZAD FIRST: none/);
  assert.match(t, /old holdings are never sold \(no extra commissions\)/);
  assert.match(t, /16\.7% a year vs SPUS 12\.2%; it beat SPUS in both halves .*worst fall -42% vs -28%\. NOT PROVEN/);
  assert.match(t, /\nMore fragile than the top 20: without NVDA, AAPL or MSFT it lost to SPUS in 2022-23/);
  assert.match(t, /\nWith 30% gold \(Squad 23 test, run on the top-20 basket: 70% basket \+ 30% gold\): ~17\.5% a year vs 16\.2%, worst fall -26% vs -33%; NOT PROVEN/);
  assert.doesNotMatch(t, /20 stocks/);
  const t2 = B.fn('basketText')(2000, Date.parse('2027-05-03T15:00:00Z'));
  assert.match(t2, /Set aside 35% = 700\.00 USD/); assert.match(t2, /bought on 3 May 2027 \(TODAY\); with 4 months saved that is about 2,800 USD/);
  // a replacement and an unmarked member are named
  const R = await loadScan({ env, files: { 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17, 'data/halal.json': halal(['NVDA', 'AAPL', 'KO'], { PLTR: { s: 'fail', d: '2026-10-24', by: 'ZAD (you)' } }) } });
  const t3 = R.fn('basketText')(1000, Date.parse('2026-10-26T15:00:00Z'));
  assert.match(t3, /REPLACED: PLTR is NOT halal in ZAD, so KO/);
  assert.match(t3, /CHECK IN ZAD FIRST: MSFT \(on the buy day its share goes to SPUS until you mark it\)/);
  const w = B.fn('waysText')();
  assert.match(w, /a\) THE BASKET \(core\): every month 65%.*halal top 10.*3 times a year/); assert.match(w, /b\) TRY SMALL: 1,000 USD/); assert.match(w, /c\) OPTIONS PAPER LANE/);
  assert.match(B.value('HELP'), /\nbasket   \(THE BASKET/); assert.match(B.value('HELP'), /\nbasket buy 1400   \(Basket 1 buy day/); assert.match(B.value('HELP'), /\nways   \(your ways to trade/);
  const none = await loadScan({ env });
  assert.match(none.fn('basketText')(1000), /Set aside 35% = 350\.00 USD.*top-10 list is not ready yet/s);
  assert.deepEqual(blocked, []);
});

test('basket buy text: top-10 dollar split of the saved cash, fee line and the save-longer warning; Telegram commands', async () => {
  const B = await loadScan({ env, files: { 'data/squad10-today.json': T10(LIVE10), 'data/squad17-today.json': T17, 'data/halal.json': halal(LIVE10.map(m => m.sym)) } });
  const t = B.fn('basketBuyText')(1400, Date.parse('2026-10-26T15:00:00Z'));
  assert.match(t, /^THE BASKET: BASKET 1 BUY \(halal top 10\) with 1,400 USD saved/);
  assert.match(t, /\n- NVDA 15% = 210\.00 USD \(ZAD halal\)\n/); assert.match(t, /\n- AMZN 11% = 154\.00 USD/); assert.match(t, /\n- LLY 4% = 56\.00 USD/);
  assert.match(t, /\nTotal: 1,400\.00 USD = 1,400\.00 \(Basket 1\)\./);
  assert.match(t, /\nFees: 10 stocks x 3 USD = 30 USD = 2\.14% of this buy\.\nWARNING: the fees are above 2% of this buy: save longer before buying \(1,500 USD or more/);
  assert.match(t, /Old holdings are never sold/);
  const t2 = B.fn('basketBuyText')(2000, Date.parse('2027-01-04T15:00:00Z'));
  assert.match(t2, /Fees: 10 stocks x 3 USD = 30 USD = 1\.50% of this buy\./); assert.doesNotMatch(t2, /WARNING/); assert.match(t2, /4 Jan 2027, a Basket 1 buy day/);
  // an unmarked member: its share goes to SPUS and costs one more order
  const U = await loadScan({ env, files: { 'data/squad10-today.json': T10(LIVE10), 'data/halal.json': halal(LIVE10.map(m => m.sym).filter(s => s !== 'MU')) } });
  const tu = U.fn('basketBuyText')(2000, Date.parse('2026-10-26T15:00:00Z'));
  assert.match(tu, /- SPUS \(Basket 2\) = \d+\.\d\d USD for MU until checked in ZAD/); assert.match(tu, /Fees: 9 stocks \+ 1 SPUS order = 10 orders x 3 USD = 30 USD/);
  assert.match(tu, /CHECK IN ZAD FIRST: MU \(/);
  // the commands
  assert.match(await send(B, 'basket buy 1400'), /BASKET 1 BUY \(halal top 10\) with 1,400 USD saved/);
  assert.match(await send(B, 'basket buy'), /Send the cash you saved for Basket 1, for example  basket buy 1400 \./);
  assert.match(await send(B, 'basket 1000'), /This month: Basket 2 = 65% of 1,000 USD/);
  assert.match(await send(B, 'basket'), /This month: Basket 2 = 65% of 1,000 USD/);
  assert.deepEqual(blocked, []);
});
