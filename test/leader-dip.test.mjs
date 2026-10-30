// LEADER DIP lane (owner's decision 27 Oct 2026): rule SQ11-PB12 with a +20% sell limit and a 126-session time exit, NO stop, as tested
// (A-TGT-TGT20-PB12 in data/agent-a-tgt-lab.json; 3-slot account in data/account-replay-pb12t20.json). 3 slots of 1,000 USD, real by
// default (settings.leaderDip = false -> PAPER). Also pinned here: Basket 1 reminders OFF by default (settings.basket1 === true turns them
// on), Basket 2 monthly reminder unchanged, and SQ11-PB12 no longer in the TRY SMALL list.
// Run: node --test test/leader-dip.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

const now = new Date().toISOString();
const S0 = await loadScan({});
const isS = S0.fn('isSession'), nyd = S0.fn('ny')(Date.now()).d;
const sessAgo = (n) => { let x = nyd, k = 0; while (k < n) { x = new Date(Date.parse(x) - 864e5).toISOString().slice(0, 10); if (isS(x)) k++; } return x; };
const LAST = sessAgo(1), OLD = sessAgo(9);
const ok = (s) => ({ s: 'ok', d: '2026-10-27', by: 'you' }), fail = { s: 'fail', d: '2026-10-27', by: 'you' };
const HAL = { AAA: ok(), BBB: ok(), CCC: ok(), DDD: ok(), EEE: ok() };
const sig = (syms, lastClose = LAST, extra = {}) => ({ 'data/halal.json': HAL,
  'data/squad11-today.json': { generatedAt: now, lastClose, methods: { 'SQ11-PB12': { hold: 126, newSignals: syms.map(sym => ({ sym, close: 100, halal: 'unknown', d: lastClose })) } } }, ...extra });

test('a fresh pick is a BUY of 1,000 USD with the +20% sell limit, no stop and the time exit; at most 3 slots', async () => {
  const S = await loadScan({ files: sig(['AAA', 'BBB', 'CCC', 'DDD']) });
  const L = S.fn('ldipLines')({}, {}, null, LAST), t = L.join('\n'), exitDay = S.fn('sessionPlus')(LAST, 126);
  assert.equal(L[0], 'LEADER DIP (your trading lane, 27 Oct: 3 slots of 1,000 USD, sell at +20%)');
  assert.equal(L[1], '- BUY AAA 1,000 USD at the open (up to 103.00). Right after you buy, put a SELL LIMIT at your buy price +20% (good-till-cancelled) in ZAD. No stop: this rule was tested without one. If it has not sold by about ' + exitDay + ' (6 months, 126 sessions), sell; the bot reminds you. Rule: leader dip (a top-300 company 12% off its high, still in its uptrend). Tested: 3 of 4 trades won; as an account about equal to SPY; some losers fell 20–55%. Then send  bought AAA PRICE .');
  assert.equal((t.match(/- BUY /g) || []).length, 3); assert.doesNotMatch(t, /BUY DDD/); assert.match(t, /all 3 slots are in use, so no buy of DDD/);
  assert.doesNotMatch(t, /STOP \d/);
  // the offers are logged with date, price and rule; one open leader dip leaves 2 slots
  const rows = S.read('data/leaderdip-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.deepEqual(rows.map(r => [r.sym, r.kind, r.rule, r.px]), [['AAA', 'offer', 'SQ11-PB12', 100], ['BBB', 'offer', 'SQ11-PB12', 100], ['CCC', 'offer', 'SQ11-PB12', 100]]);
  const L2 = S.fn('ldipLines')({ ZZZ: { entry: 50, src: 'leader dip' }, AAA: { entry: 90 } }, { BBB: 110 }, new Set(['CCC']), LAST).join('\n');
  assert.doesNotMatch(L2, /BUY AAA|BUY CCC/);   // already held / already a BUY elsewhere in the message
  assert.match(L2, /- BUY BBB 1,000 USD at the open \(up to 113\.30\)/); assert.match(L2, /- BUY DDD/); assert.equal((L2.match(/- BUY /g) || []).length, 2);
});

test('a stale list (older close than the newest session, or 9 sessions old) shows nothing: no late entries', async () => {
  const S = await loadScan({ files: sig(['AAA'], OLD) });
  assert.deepEqual(S.fn('ldipLines')({}, {}, null, LAST), []);
  assert.deepEqual(S.fn('ldipLines')({}, {}), []);
  const S2 = await loadScan({ files: sig(['AAA'], sessAgo(2)) });
  assert.deepEqual(S2.fn('ldipLines')({}, {}, null, LAST), []);   // the scan knows a newer session than the list's close
});

test('halal: unknown -> MARK HALAL FIRST; NOT halal (your mark or the ZAD list) -> dropped; danger filing -> dropped', async () => {
  const S = await loadScan({ files: sig(['UNK', 'BAD', 'ZZL', 'AAA'], LAST, { 'data/halal.json': { ...HAL, BAD: fail }, 'data/zad-list.json': { effective: '2026-10-22', notHalal: ['ZZL'] } }) });
  const t = S.fn('ldipLines')({}, {}, null, LAST).join('\n');
  assert.match(t, /- BUY AAA/); assert.doesNotMatch(t, /BUY (UNK|BAD|ZZL)/);
  assert.match(t, /MARK HALAL FIRST \(leader dip picks, no ZAD mark of yours yet: not a buy until you mark them\): UNK\./); assert.match(t, /\nhalal UNK yes   or   halal UNK no/); assert.doesNotMatch(t, /halal SYM/);   // (28 Oct) the exact command, never a generic one assert.doesNotMatch(t, /BAD|ZZL/);
  const S2 = await loadScan({ files: sig(['AAA'], LAST, { 'data/squad29-flags-today.json': { flags: [{ sym: 'AAA', verdict: 'SELL-WARNING', flag: 'F4', form: 'NT 10-K', filed: new Date().toISOString().slice(0, 10), url: 'x' }] } }) });
  assert.match(S2.fn('dangerFlag')('AAA'), /late-filing notice/);
  assert.deepEqual(S2.fn('ldipLines')({}, {}, null, LAST), []);
});

test('settings.leaderDip = false: the same picks as PAPER lines, no BUY', async () => {
  const S = await loadScan({ files: { ...sig(['AAA', 'BBB']), 'data/settings.json': { leaderDip: false } } });
  const L = S.fn('ldipLines')({}, {}, null, LAST), t = L.join('\n');
  assert.match(L[0], /^LEADER DIP: PAPER ONLY/); assert.doesNotMatch(t, /- BUY/);
  assert.match(t, /- PAPER AAA at about 100\.00, sell limit 120\.00, or sell after 126 sessions/); assert.match(t, /- PAPER BBB/);
});

test('auto-off: 10+ finished real trades averaging below 0 stop NEW buys', async () => {
  const res = Array.from({ length: 10 }, (_, i) => ({ d: '2026-01-0' + (i % 9 + 1), sym: 'Q' + i, kind: 'result', pct: -0.05 }));
  const S = await loadScan({ files: { ...sig(['AAA']), 'data/leaderdip-ledger.jsonl': res } });
  const t = S.fn('ldipLines')({}, {}, null, LAST).join('\n');
  assert.match(t, /^LEADER DIP: new buys are OFF/); assert.doesNotMatch(t, /- BUY/);
  assert.match(S.fn('ldipRecordLine')(), /LEADER DIP record: 10 finished, 0 won, average -5\.0%/);
  const S2 = await loadScan({ files: { ...sig(['AAA']), 'data/leaderdip-ledger.jsonl': res.slice(0, 9) } });
  assert.match(S2.fn('ldipLines')({}, {}, null, LAST).join('\n'), /- BUY AAA/);
});

test('the exits: a day\'s HIGH at the +20% target -> SELL; 126 sessions counting the buy day -> TIME EXIT', async () => {
  const f = S0.fn('ldipCloseFlags'), bars = (n, h) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse('2026-01-02') + i * 864e5).toISOString().slice(0, 10), o: 100, h: i === n - 1 ? h : 101, l: 99, c: 100 }));
  const P = { src: 'leader dip', since: '2026-01-02', boughtSession: '2026-01-02', target: 120, ldHold: 126 };
  assert.deepEqual(f(P, bars(20, 119.99)).fl, []);
  assert.match(f(P, bars(20, 120)).fl.join(), /^TARGET \+20% REACHED: if your sell limit did not fill, SELL at the next open/);
  assert.deepEqual(f(P, bars(125, 101)).fl, []);
  assert.match(f(P, bars(126, 101)).fl.join(), /^TIME EXIT: SELL/);
});

// a small local server: Telegram (getUpdates / sendMessage) and daily bars (TD time_series)
const mkServer = (text, bars) => { const sent = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) out = { ok: true, result: text ? [{ update_id: 1, message: { message_id: 1, chat: { id: 42 }, text } }] : [] };
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  else if (/time_series/.test(req.url) && bars) out = { values: bars.map(b => ({ datetime: b.d, open: b.o, high: b.h, low: b.l, close: b.c, volume: 1e6 })) };
  else out = {};
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
  return { sent, server, start: async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); return 'http://127.0.0.1:' + server.address().port; } }; };

test('bought SYM PRICE: tagged LEADER DIP (target +20%, 126 sessions, no stop), before TRY SMALL; the review never says SET A STOP', async () => {
  const M = mkServer('bought AAA 50 10 shares'); const B = await M.start();
  const good = { verdict: 'NOT PROVEN', hold: 126, results: { older: { avgStress: 0.02, edge: 0.01, noTop2: 0.015, n: 50 }, newer: { avgStress: 0.04, edge: 0.02, noTop2: 0.03, n: 50 } } };
  const files = { ...sig(['AAA']), 'data/squad11-lab.json': { firstRun: { 'SQ11-PB12': good } },
    'data/leaderdip-ledger.jsonl': [{ d: sessAgo(3), sym: 'AAA', kind: 'offer', rule: 'SQ11-PB12', px: 49 }],
    'data/tier2-ledger.jsonl': [{ d: new Date().toISOString().slice(0, 10), sym: 'AAA', kind: 'try:SQ11-PB12', px: 49, hold: 126, stopPct: 0.35 }] };
  const S = await loadScan({ files, env: { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: B, TD_BASE: B, FH_BASE: B, SEC_BASE: B } });
  await S.fn('tgCommands')(null); M.server.close();
  const P = S.readJson('data/my-positions.json').AAA;
  assert.equal(P.src, 'leader dip'); assert.equal(P.target, 60); assert.equal(P.ldHold, 126); assert.equal(P.boughtSession, nyd);
  assert.equal(P.stop, undefined); assert.equal(P.stopWhy, 'no stop by design (tested without one)');
  const msg = M.sent.join('\n');
  assert.match(msg, /Tracking AAA as LEADER DIP: bought 50\.00\. Put a SELL LIMIT at 60\.00/); assert.doesNotMatch(msg, /Suggested stop|NO STOP|SET A STOP/);
  // an offer older than 10 sessions does not tag
  const S2 = await loadScan({ files: { 'data/leaderdip-ledger.jsonl': [{ d: sessAgo(11), sym: 'AAA', kind: 'offer', px: 49 }] } });
  assert.equal(S2.fn('ldipHit')('AAA'), null);
});

test('holdings review: HOLD shows the target and time exit (no stop nag); a HIGH at the target gives a SELL', async () => {
  const since = sessAgo(5), days = []; { let x = since; for (let k = 0; k < 6; x = new Date(Date.parse(x) + 864e5).toISOString().slice(0, 10)) if (S0.fn('isSession')(x)) { days.push(x); k++; } }
  const mk = (hi) => days.map((d, i) => ({ d, o: 50, h: i === days.length - 2 ? hi : 52, l: 49, c: 51 }));
  const P = { entry: 50, since, boughtSession: since, kind: 'leader dip', src: 'leader dip', target: 60, ldHold: 126, own: true, stopWhy: 'no stop by design (tested without one)' };
  for (const [hi, want] of [[55, 'hold'], [60.5, 'sell']]) {
    const M = mkServer(null, mk(hi)); const B = await M.start();
    const S = await loadScan({ files: { 'data/halal.json': HAL }, env: { TD_BASE: B, FH_BASE: B, SEC_BASE: B } });
    const r = await S.fn('holdingsText')(null, { AAA: { ...P } }, null, true); M.server.close();
    const t = [...r.acts.sell, ...r.acts.hold, ...r.holdShort].join('\n');
    assert.doesNotMatch(t, /SET A STOP|NO STOP|stop not set|stop NOT SET/);
    if (want === 'hold') { assert.match(r.acts.hold.join('\n'), /^AAA[^:]*: HOLD, target 60\.00 \(sell limit at your broker\), time exit about \d{4}-\d\d-\d\d\. No stop by design/); assert.equal(r.acts.sell.length, 0); }
    else assert.match(r.acts.sell.join('\n'), /^AAA[^:]*: SELL ALL\. TARGET \+20% REACHED: if your sell limit did not fill, SELL at the next open/);
  }
  // NOT halal in ZAD is still a SELL for a leader dip holding
  const M = mkServer(null, mk(55)); const B = await M.start();
  const S = await loadScan({ files: { 'data/halal.json': { AAA: fail } }, env: { TD_BASE: B, FH_BASE: B, SEC_BASE: B } });
  const r = await S.fn('holdingsText')(null, { AAA: { ...P } }, null, true); M.server.close();
  assert.match(r.acts.sell.join('\n'), /^AAA[^:]*: SELL ALL\. NOT HALAL \(ZAD\)/);
});

test('sold SYM PRICE on a leader dip position: the result goes to the leader dip ledger', async () => {
  const M = mkServer('sold AAA 60'); const B = await M.start();
  const S = await loadScan({ files: { 'data/my-positions.json': { AAA: { entry: 50, since: sessAgo(4), boughtSession: sessAgo(4), kind: 'leader dip', src: 'leader dip', target: 60, ldHold: 126, own: true } } },
    env: { PRIVATE_KEY:'synthetic-test-key', TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: B, TD_BASE: B, FH_BASE: B, SEC_BASE: B } });
  await S.fn('tgCommands')(null); M.server.close();
  const rows = S.read('data/leaderdip-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'result'); assert.equal(rows[0].sym, 'AAA'); assert.equal(rows[0].pct, +(0.2 - 0.008).toFixed(5));
  assert.match(M.sent.join('\n'), /LEADER DIP record: 1 finished, 1 won, average \+19\.2%/);
});

test('SQ11-PB12 is no longer in the TRY SMALL list (it is the LEADER DIP lane); other rules still are', async () => {
  const good = { verdict: 'NOT PROVEN', hold: 126, results: { older: { avgStress: 0.02, edge: 0.01, noTop2: 0.015 }, newer: { avgStress: 0.04, edge: 0.02, noTop2: 0.03 } } };
  const files = { 'data/halal.json': HAL, 'data/value-lab.json': { firstRun: {} },
    'data/squad11-lab.json': { firstRun: { 'SQ11-PB12': good, 'SQ11-OTHER': good } },
    'data/squad11-today.json': { generatedAt: now, lastClose: LAST, methods: { 'SQ11-PB12': { hold: 126, newSignals: [{ sym: 'AAA', close: 100, d: LAST }] }, 'SQ11-OTHER': { hold: 126, newSignals: [{ sym: 'BBB', close: 100, d: LAST }] } } } };
  for (const st of [{}, { trySmallReal: true }]) {
    const S = await loadScan({ files: { ...files, 'data/settings.json': st } });
    const t = S.fn('trySmallLines')({}, {}, null, LAST).join('\n');
    assert.doesNotMatch(t, /SQ11-PB12|AAA/); assert.match(t, /BBB/);
  }
});

test('Basket 1 reminders are OFF by default; Basket 2 monthly reminder takes the whole amount; settings.basket1 = true turns Basket 1 back on', async () => {
  const MONTHLY0 = 'Monthly basket day: put your monthly amount in SPUS 54% + IAUM 46% (2 orders in ZAD). Send  basket 1000  for the exact dollars.';
  const MONTHLY = 'Monthly basket day: Basket 2 (SPUS 54% / IAUM 46%) with 65% of your amount; keep 35% as cash for Basket 1. Send  basket 1000 .';
  const BUYDAY = 'Basket 1 buy day: buy the top 10 with your saved cash. Send  basket buy AMOUNT .';
  const mem = (sym, w) => ({ sym, weightAtReview: w, weightNow: w });
  const T10 = (members, review = '2026-10-02') => ({ lastClose: '2026-10-23', methods: { 'SQ10-SH10-C15': { lastReview: review, members, reserves: [] } } });
  const A = T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('PLTR', 0.1)]), Bn = T10([mem('NVDA', 0.4), mem('AAPL', 0.3), mem('MSFT', 0.2), mem('ORCL', 0.1)], '2027-01-04');
  const S = await loadScan({}), due = S.fn('basketDue'), SAT = Date.parse('2026-10-24T15:00:00Z');
  const base = due(SAT, {}, A, null, {}).state;
  const r = due(SAT, base, Bn, null, {});   // a new top-10 list: no message by default, but followed silently
  assert.deepEqual(r.msgs, []); assert.equal(r.state.formation.review, '2027-01-04');
  assert.deepEqual(due(Date.parse('2027-01-04T16:00:00Z'), base, A, null, {}).msgs, [MONTHLY0]);   // January: Basket 2 only, no Basket 1 buy day
  assert.deepEqual(due(Date.parse('2026-12-01T16:00:00Z'), base, A, null, {}).msgs, [MONTHLY0]);
  const M = S.fn('basketMonth')(1000); assert.equal(M.b2, 1000); assert.equal(M.aside, 0);   // whole amount to SPUS + IAUM
  const S2 = await loadScan({ files: { 'data/settings.json': { basket1: true } } }), due2 = S2.fn('basketDue');
  assert.deepEqual(due2(Date.parse('2027-01-04T16:00:00Z'), base, A, null, {}).msgs, [MONTHLY + '\n' + BUYDAY]);
  assert.match(due2(SAT, base, Bn, null, {}).msgs[0], /^THE BASKET: NEW TOP-10 LIST/);
});

test('nightly close checks: leader dip exits are flagged (also for a short history) and kept as the exit flag; the nightly line has no stop nag', async () => {
  const fs = await import('node:fs'), src = fs.readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(P\.src === 'leader dip'\) flags\.push\(\.\.\.ldipCloseFlags\(P, c\)\.fl\)/);
  assert.match(src, /P\.src === 'leader dip' \? ldipCloseFlags\(P, c\) : trySmallCloseFlags\(P, c\)/);
  assert.match(src, /const xf = flags\.find\(f => \/STOP\|EXIT\|TARGET \\\+20%\/\.test\(f\)\)/);
  const line = S0.fn('posLine')('AAA', { entry: 50, src: 'leader dip', target: 60 }, 55);
  assert.match(line, /leader dip: no stop by design, sell limit 60\.00/); assert.doesNotMatch(line, /NOT SET/);
});

test('no network was used', () => assert.deepEqual(blocked, []));

// 27 Oct 2026: the owner asked why the Alpaca practice account's winners were "hidden". ACTIONS shows its trades AND its total, labelled practice.
test('practice line shows the Alpaca paper total, wins and losses, labelled not a buy', async () => {
  const S = await loadScan({ files: { 'data/alpaca-paper.json': { start: { d: '2026-10-12', equity: 100000 }, equity: { d: '2026-10-26', equity: 99645.41 },
    plans: { WGO: { entry: 25.5 } }, closed: [{ sym: 'ROIV', net: 0.0377 }, { sym: 'CLS', net: -0.2187 }] } } });
  const t = S.fn('practiceLine')({ WGO: 28.11 });
  assert.match(t, /PRACTICE ACCOUNT .*NOT buys for you/);
  assert.match(t, /Closed 2: 1 won, 1 lost/);
  assert.match(t, /WGO \+10\.2%/);
});
