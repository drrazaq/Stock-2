// THE BASKET lane (owner's decision 24 Oct 2026): every ~1,000 USD, half SPUS + half the halal top-20 basket (SQ10-SH20-C15) at the
// tested percentages, bought by the owner in ZAD. Seams in scan.mjs: basketSource / basketPlan (replacement, renormalisation,
// unmarked -> SPUS, dollar split), basketChange / basketDue (quarterly rebalance notice, monthly reminder), basketNotices, basketText.
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
const S = await loadScan({ env });
const src = (t10 = T10(FOUR), t17 = T17) => S.fn('basketSource')(t10, t17), plan = (...a) => S.fn('basketPlan')(...a);

test('a member marked NOT halal is replaced by the first reserve marked halal (unmarked and NOT halal reserves are passed over)', () => {
  const s = src();
  assert.deepEqual(s.reserves.slice(0, 5), ['CVX', 'COST', 'KO', 'ORCL', 'PG']);   // today's line: Shariah list minus members, then squad17, then squad10
  const P = plan(s, { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail', COST: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P.replaced, [{ out: 'PLTR', in: 'KO' }]);
  assert.deepEqual(P.skipped, [{ sym: 'CVX', zad: 'unmarked' }, { sym: 'COST', zad: 'fail' }]);
  const ko = P.rows.find(r => r.sym === 'KO'); assert.equal(ko.pct, 10); assert.equal(ko.replaces, 'PLTR');
  assert.ok(!P.rows.some(r => r.sym === 'PLTR'));
  // two NOT halal members take two different reserves, in line order
  const P2 = plan(s, { NVDA: 'ok', AAPL: 'fail', MSFT: 'ok', PLTR: 'fail', KO: 'ok', ORCL: 'ok' }, 1000);
  assert.deepEqual(P2.replaced, [{ out: 'AAPL', in: 'KO' }, { out: 'PLTR', in: 'ORCL' }]);
});

test('weights are renormalised to 100% after a NOT halal member with no halal reserve is dropped', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail' }, 1000);   // no reserve marked halal
  assert.deepEqual(P.dropped, ['PLTR']);
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct]), [['NVDA', 44.5], ['AAPL', 33.3], ['MSFT', 22.2]]);
  assert.equal(+P.rows.reduce((a, r) => a + r.pct, 0).toFixed(1), 100);
  assert.equal(P.spusUsd, 500); assert.equal(sum(P.rows.map(r => r.usd)), 500);
});

test('an unmarked member is listed to check in ZAD first and its money goes to SPUS until marked', () => {
  const P = plan(src(), { NVDA: 'ok', AAPL: 'ok', PLTR: 'fail', KO: 'ok' }, 1000);   // MSFT not checked
  assert.deepEqual(P.unmarked.map(x => [x.sym, x.usd]), [['MSFT', 100]]);
  assert.equal(P.spusUsd, 600); assert.equal(P.basketUsd, 400);
  assert.ok(!P.rows.some(r => r.sym === 'MSFT'));
  assert.equal(+P.rows.reduce((a, r) => a + r.pct, 0).toFixed(1), 100);   // the ZAD basket itself still adds up to 100%
  assert.deepEqual(P.rows.map(r => [r.sym, r.pct, r.usd]), [['NVDA', 50, 200], ['AAPL', 37.5, 150], ['KO', 12.5, 50]]);
  assert.equal(sum([P.spusUsd, ...P.rows.map(r => r.usd)]), 1000);
  // nothing marked at all: the whole amount goes to SPUS
  const P0 = plan(src(), {}, 1000); assert.equal(P0.spusUsd, 1000); assert.equal(P0.rows.length, 0);
});

test('dollar split for 1000 and 2000: SPUS half, the basket half by the percentages, to the cent', () => {
  const marks = { NVDA: 'ok', AAPL: 'ok', MSFT: 'ok', PLTR: 'fail', KO: 'ok' };
  const P1 = plan(src(), marks, 1000), P2 = plan(src(), marks, 2000);
  assert.equal(P1.spusUsd, 500); assert.equal(P2.spusUsd, 1000);
  assert.deepEqual(P1.rows.map(r => [r.sym, r.usd]), [['NVDA', 200], ['AAPL', 150], ['MSFT', 100], ['KO', 50]]);
  assert.deepEqual(P2.rows.map(r => [r.sym, r.usd]), [['NVDA', 400], ['AAPL', 300], ['MSFT', 200], ['KO', 100]]);
  // awkward weights still add up exactly
  const odd = src(T10([mem('A', 0.3333), mem('B', 0.3333), mem('C', 0.3334)]));
  for (const amt of [1000, 2000, 1234.56]) { const P = plan(odd, { A: 'ok', B: 'ok', C: 'ok' }, amt);
    assert.equal(+P.rows.reduce((a, r) => a + r.pct, 0).toFixed(1), 100); assert.equal(sum([P.spusUsd, ...P.rows.map(r => r.usd)]), amt); }
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
  assert.match(r.msgs[0], /NVDA 40\.0%, AAPL 30\.0%, MSFT 20\.0%, ORCL 10\.0%/);
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
  assert.deepEqual(after.msgs, ['Monthly basket day: $500 SPUS + $500 basket (send  basket  for the amounts)']);
  assert.equal(due(Date.parse('2026-11-02T18:00:00Z'), after.state, T10(FOUR), T17, {}).msgs.length, 0);
  assert.equal(due(Date.parse('2026-11-03T16:00:00Z'), base, T10(FOUR), T17, {}).msgs.length, 0);
  // sent by the bot through Telegram (in quiet mode too: it is an action reminder) and remembered in data/basket-state.json
  const B = await loadScan({ env, files: { 'data/settings.json': { quiet: true }, 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17, 'data/tg-state.json': { offset: 3 } } });
  sent = [];
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:00:00Z'));
  await B.fn('basketNotices')(Date.parse('2026-11-02T16:30:00Z'));
  assert.deepEqual(sent, ['Monthly basket day: $500 SPUS + $500 basket (send  basket  for the amounts)']);
  assert.equal(B.readJson('data/basket-state.json').monthly, '2026-11');
  assert.equal(B.readJson('data/tg-state.json').offset, 3);
});

test('basket text: header, SPUS half, ZAD percentages, replacement note, next rebalance, tested record; ways lists the three lanes', async () => {
  const B = await loadScan({ env, files: { 'data/squad10-today.json': T10(FOUR), 'data/squad17-today.json': T17,
    'data/halal.json': { NVDA: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }, AAPL: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' }, PLTR: { s: 'fail', d: '2026-10-24', by: 'ZAD (you)' }, COST: { s: 'fail', d: '2026-10-24', by: 'ZAD (you)' }, KO: { s: 'ok', d: '2026-10-24', by: 'ZAD (you)' } } } });
  const t = B.fn('basketText')(2000, Date.parse('2026-10-24T15:00:00Z'));
  assert.match(t, /^THE BASKET \(one of the system’s ways: long-term core\)\nFor 2,000 USD/);
  assert.match(t, /1\) SPUS: 1,200\.00 USD/);   // 1,000 + MSFT's 200 while it is not checked in ZAD
  assert.match(t, /- KO 12\.5% = 100\.00 USD \(ZAD halal; replaces PLTR\)/);
  assert.match(t, /REPLACED: PLTR is NOT halal in ZAD, so KO/);
  assert.match(t, /CHECK IN ZAD FIRST: MSFT \(200\.00 USD, in SPUS until you mark it\)/);
  assert.match(t, /enter THESE percentages, not an equal split/);
  assert.match(t, /Next rebalance: about 4 Jan 2027/);
  assert.match(t, /14\.2% a year vs SPUS 12\.0%; worst fall -30% vs -29%/);
  assert.match(t, /16\.2% a year, worst fall -33%\. NOT PROVEN by the luck test/);
  const w = B.fn('waysText')();
  assert.match(w, /a\) THE BASKET \(core\)/); assert.match(w, /b\) TRY SMALL: 1,000 USD/); assert.match(w, /c\) OPTIONS PAPER LANE/);
  assert.match(B.value('HELP'), /\nbasket   \(THE BASKET/); assert.match(B.value('HELP'), /\nways   \(your ways to trade/);
  const none = await loadScan({ env });
  assert.match(none.fn('basketText')(1000), /not ready yet.*whole amount into SPUS/s);
  assert.deepEqual(blocked, []);
});
