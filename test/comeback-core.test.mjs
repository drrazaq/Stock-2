// COMEBACK BOARD (comeback-core.mjs, COMEBACK-1, 25 Oct 2026): a rule frozen as rejected / not proven can come back to TRY SMALL only on
// its FORWARD paper record (signals after its own frozenAt), with the luck bar raised by Bonferroni over every rule being watched.
// Covers: eligibility, the Bonferroni bar, the after-freeze filter, near-copy exclusion, and the output formats scan.mjs reads.
// Run: node --test test/comeback-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBoard, labFile, todayOut, bonferroniBar, zInv, scanSets, forwardTrades, sessionIndex, scoreboardLines, boardText, preRegister, LINE, SPEC_ID, MIN_N } from '../comeback-core.mjs';
import { loadScan } from './load-scan.mjs';

const FROZEN = '2026-10-24T10:00:00.000Z';
// NYSE sessions from 27 Oct 2026 (weekends and the published closures skipped)
const SESS = (() => { const o = []; let d = '2026-10-27'; while (o.length < 120) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w && w !== 6 && !['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18'].includes(d)) o.push(d); d = new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10); } return o; })();
// one trade a session; net = mu + noise (fixed pseudo-random), the average stock flat (net of cost: 0), SPY +0.05% a trade
function ledger(id, mu, n = 60, { seed = 7, from = 0, avgStock = 0, spread = 0.05 } = {}) { let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  return SESS.slice(from, from + n).map((d, i) => ({ type: 'result', id: id + '|S' + i + '|' + d, m: id, sym: 'S' + (i % 25), d, buy: d, sell: d, g: 0, net: +(mu + spread * rnd()).toFixed(5), avgStock, spy: 0.0005 })); }
const run = (verdict = 'REJECTED', extra = {}) => ({ verdict, hold: 5, frozenAt: FROZEN, ...extra });
const one = (lines, runs, opts) => buildBoard([{ lab: 'squad11', runs, lines }], opts);

test('eligibility: a strong forward record comes back; a weak one fades; a short one is too early', () => {
  const B = one([...ledger('SQ11-A', 0.03), ...ledger('SQ11-B', -0.01, 60, { seed: 3 }), ...ledger('SQ11-C', 0.05, 20, { seed: 5 })], { 'SQ11-A': run(), 'SQ11-B': run('NOT PROVEN'), 'SQ11-C': run() });
  const by = Object.fromEntries(B.board.map(r => [r.id, r]));
  assert.equal(by['SQ11-A'].status, 'COMEBACK', by['SQ11-A'].why.join('; '));
  assert.equal(by['SQ11-A'].n, 60); assert.equal(by['SQ11-A'].days, 60);
  assert.ok(by['SQ11-A'].avgStress > 0 && by['SQ11-A'].edgeVsAverageStock > 0 && by['SQ11-A'].noTop2 > 0 && by['SQ11-A'].blockT >= B.bar);
  assert.ok(by['SQ11-A'].vsSpy.rule > by['SQ11-A'].vsSpy.spy);
  assert.equal(by['SQ11-B'].status, 'FADING');
  assert.equal(by['SQ11-C'].status, 'TOO EARLY');
  assert.deepEqual(B.counts, { COMEBACK: 1, FADING: 1, 'TOO EARLY': 1 });
});

test('eligibility: every gate is needed (SPY, the average stock, 10 days, the halves)', () => {
  // behind SPY per year of capital: same record, SPY +5% a trade
  const spyHigh = ledger('SQ11-A', 0.03).map(l => ({ ...l, spy: 0.05 }));
  assert.equal(one(spyHigh, { 'SQ11-A': run() }).board[0].status, 'WATCHING');
  // SPY unknown for the trades (no spy field, no SPY bars): cannot pass
  const noSpy = ledger('SQ11-A', 0.03).map(({ spy, ...l }) => l);
  assert.match(one(noSpy, { 'SQ11-A': run() }).board[0].why.join(' '), /SPY known for only 0%/);
  // ...but with SPY bars it can
  assert.equal(one(noSpy, { 'SQ11-A': run() }, { spyOf: () => 0.0005 }).board[0].status, 'COMEBACK');
  // the average stock did better: fading
  assert.equal(one(ledger('SQ11-A', 0.03, 60, { avgStock: 0.05 }), { 'SQ11-A': run() }).board[0].status, 'FADING');
  // no average-stock yardstick in the lab's ledger: stays WATCHING
  const noYard = ledger('SQ11-A', 0.03).map(({ avgStock, ...l }) => l);
  const r = one(noYard, { 'SQ11-A': run() }).board[0]; assert.equal(r.status, 'WATCHING'); assert.match(r.why.join(' '), /no average-stock yardstick/);
  // 40 trades on 5 days: fewer than 10 distinct signal days
  const fewDays = ledger('SQ11-A', 0.03, 40).map((l, i) => ({ ...l, d: SESS[i % 5], buy: SESS[i % 5], sell: SESS[i % 5] }));
  assert.equal(one(fewDays, { 'SQ11-A': run() }).board[0].status, 'TOO EARLY');
  // 30 trades on 30 days passes the board count but not the TRY SMALL halves (20+ trades in each half): WATCHING
  const r30 = one(ledger('SQ11-A', 0.03, 30), { 'SQ11-A': run() }).board[0]; assert.equal(r30.n, MIN_N); assert.equal(r30.status, 'WATCHING'); assert.match(r30.why.join(' '), /a half fails/);
});

test('Bonferroni bar: max(2.5, one-sided z for 0.05 / rules with 30+ forward trades)', () => {
  assert.equal(bonferroniBar(0), 2.5); assert.equal(bonferroniBar(1), 2.5); assert.equal(bonferroniBar(10), 2.58);
  assert.equal(bonferroniBar(20), 2.81); assert.equal(bonferroniBar(100), 3.29); assert.equal(bonferroniBar(1000), 3.89);
  assert.ok(Math.abs(zInv(0.975) - 1.959964) < 1e-5); assert.ok(Math.abs(zInv(0.05) + 1.644854) < 1e-5);
  // a borderline rule (block t about 3.1) comes back alone, and not when 99 other rules with 30+ trades are being watched
  const lines = ledger('SQ11-A', 0.0135), runs = { 'SQ11-A': run() };
  const alone = one(lines, runs); assert.equal(alone.bar, 2.5); assert.equal(alone.watchedWith30, 1); assert.equal(alone.board[0].status, 'COMEBACK');
  assert.ok(alone.board[0].blockT > 2.5 && alone.board[0].blockT < 3.29, 'block t ' + alone.board[0].blockT);
  for (let k = 0; k < 99; k++) { const id = 'SQ11-N' + k; runs[id] = run(); lines.push(...ledger(id, 0, 30, { seed: 11 + k })); }
  const crowd = one(lines, runs); assert.equal(crowd.watchedWith30, 100); assert.equal(crowd.bar, 3.29);
  const a = crowd.board.find(r => r.id === 'SQ11-A'); assert.equal(a.status, 'WATCHING'); assert.match(a.why.join(' '), /under the bar 3.29/);
  // rules with fewer than 30 forward trades do not raise the bar
  const r2 = { 'SQ11-A': run(), 'SQ11-Z': run() }; assert.equal(one([...ledger('SQ11-A', 0.0135), ...ledger('SQ11-Z', 0, 29)], r2).bar, 2.5);
});

test('after-freeze filter: only signals dated after the rule\'s own frozenAt count', () => {
  const before = [{ type: 'result', id: 'SQ11-A|OLD|2026-10-20', m: 'SQ11-A', sym: 'OLD', d: '2026-10-20', net: -0.5, avgStock: 0, spy: 0 },
    { type: 'result', id: 'SQ11-A|SAME|2026-10-24', m: 'SQ11-A', sym: 'SAME', d: '2026-10-24', net: -0.5, avgStock: 0, spy: 0 }];
  const f = forwardTrades('squad11', [...before, ...ledger('SQ11-A', 0.03)], { 'SQ11-A': run() });
  assert.equal(f.trades.length, 60); assert.equal(f.beforeFreeze, 2);
  const B = one([...before, ...ledger('SQ11-A', 0.03)], { 'SQ11-A': run() }); assert.equal(B.board[0].n, 60); assert.equal(B.board[0].status, 'COMEBACK'); assert.equal(B.signalsBeforeFreeze, 2);
  // a later freeze date hides the earlier forward trades too
  const late = one(ledger('SQ11-A', 0.03), { 'SQ11-A': run('REJECTED', { frozenAt: SESS[40] + 'T23:00:00Z' }) }); assert.equal(late.board[0].n, 19);
  // a rule with no frozen verdict is not on the board; its trades are reported as unmatched
  const u = one(ledger('SQ11-Q', 0.03), { 'SQ11-A': run() }); assert.equal(u.rules, 1); assert.deepEqual(u.unmatched, { squad11: ['SQ11-Q'] });
  // unresolved lines (decoded 'pending' state, no net) are not trades
  assert.equal(forwardTrades('decoded', [{ type: 'result', id: 'x', m: 'SQ11-A', d: '2026-11-02', state: 'expired' }], { 'SQ11-A': run() }).trades.length, 0);
  assert.equal(sessionIndex('2026-11-27') - sessionIndex('2026-11-25'), 1);   // Thanksgiving is not a session
});

test('near-copies of a live rule (scan.mjs TRY_DUPLICATE), paused rules, baskets, options, intraday and live rules never come back', () => {
  const sets = scanSets(fs.readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8'));
  assert.ok(sets.duplicate.has('SQ14-PB12M') && sets.duplicate.has('SQ18-PB12-MON')); assert.ok(sets.paused.has('ANOM-SUESURGE')); assert.ok(sets.basket.has('B-BASK1_1m'));
  const B = buildBoard([{ lab: 'squad14', runs: { 'SQ14-PB12M': run('NOT PROVEN') }, lines: ledger('SQ14-PB12M', 0.03) }], { sets });
  assert.equal(B.board[0].status, 'WATCHING'); assert.match(B.board[0].excluded, /TRY_DUPLICATE/);
  const P = buildBoard([{ lab: 'anomaly', runs: { 'ANOM-SUESURGE': run('NOT PROVEN') }, lines: ledger('ANOM-SUESURGE', 0.03) }], { sets }); assert.match(P.board[0].excluded, /paused/);
  for (const lab of ['squad5', 'squad10', 'squad17', 'squad15', 'squad2']) { const X = buildBoard([{ lab, runs: { 'R-1': run() }, lines: ledger('R-1', 0.03) }], { sets }); assert.equal(X.board[0].status, 'WATCHING', lab); assert.ok(X.board[0].excluded, lab); }
  const good = { n: 300, blocks: 10, avgStress: 0.02, edge: 0.01, noTop2: 0.01 };
  const L = buildBoard([{ lab: 'squad11', runs: { 'SQ11-PB12': run('NOT PROVEN', { results: { older: good, newer: good } }) }, lines: ledger('SQ11-PB12', 0.03) }], { sets });
  assert.match(L.board[0].excluded, /already live/); assert.equal(Object.keys(labFile(L).firstRun).length, 0);
  // excluded rules still count toward the Bonferroni bar (every rule being watched)
  assert.equal(B.watchedWith30, 1);
});

test('format: board fields, comeback-lab.json passes scan.mjs tryQualifies, comeback-today.json copies the rule\'s own signals', async () => {
  const lines = [...ledger('SQ11-A', 0.03), ...ledger('SQ11-B', -0.01, 60, { seed: 3 })], runs = { 'SQ11-A': run(), 'SQ11-B': run() };
  const B = one(lines, runs), r = B.board.find(x => x.id === 'SQ11-A');
  for (const k of ['lab', 'id', 'n', 'days', 'avg', 'edgeVsAverageStock', 'vsSpy', 'blockT', 'bar', 'status']) assert.ok(k in r, k);
  assert.equal(r.lab, 'squad11'); assert.ok(['WATCHING', 'TOO EARLY', 'COMEBACK', 'FADING'].includes(r.status)); assert.equal(B.line, LINE);
  const LF = labFile(B); assert.deepEqual(Object.keys(LF.firstRun), ['SQ11-A']);
  const e = LF.firstRun['SQ11-A']; assert.equal(e.verdict, 'COMEBACK'); assert.equal(e.hold, 5);
  assert.ok(e.results.older.n >= 20 && e.results.newer.n >= 20 && e.results.older.to < e.results.newer.from);
  assert.ok(e.perYear.older.rule > e.perYear.older.spy && e.perYear.newer.rule > e.perYear.newer.spy);
  const todays = { squad11: { generatedAt: '2026-12-01T01:00:00Z', lastClose: '2026-11-30', methods: { 'SQ11-A': { name: 'leader dip', newSignals: [{ sym: 'AAPL', close: 200, halal: 'ok', d: '2026-11-27' }] }, 'SQ11-B': { newSignals: [{ sym: 'XOM' }] } } } };
  const T = todayOut(B, todays); assert.deepEqual(Object.keys(T.methods), ['SQ11-A']);
  assert.deepEqual(T.methods['SQ11-A'].newSignals, [{ sym: 'AAPL', close: 200, halal: 'ok', d: '2026-11-30', signalDay: '2026-11-27' }]); assert.equal(T.methods['SQ11-A'].hold, 5);
  // the same function scan.mjs uses for every lab accepts it; a frozen-style REJECTED entry would not
  const S = await loadScan({ files: { 'data/settings.json': {} } });
  assert.deepEqual(S.fn('tryQualifies')(LF.firstRun), ['SQ11-A']);
  assert.deepEqual(S.fn('tryQualifies')({ 'SQ11-A': { ...e, verdict: 'REJECTED' } }), []);
  // a 30-trade COMEBACK-style record with 15 trades a half would still fail the scan's 20-per-half gate
  assert.deepEqual(S.fn('tryQualifies')({ x: { ...e, results: { older: { ...e.results.older, n: 15 }, newer: e.results.newer } } }), []);
});

test('scoreboard section, bot text and the library entry', async () => {
  const B = one([...ledger('SQ11-A', 0.03), ...ledger('SQ11-B', -0.01, 60, { seed: 3 }), ...ledger('SQ11-C', 0.05, 20, { seed: 5 })], { 'SQ11-A': run(), 'SQ11-B': run(), 'SQ11-C': run() });
  const sl = scoreboardLines(B); assert.equal(sl[sl.length - 1], LINE); assert.equal(sl.filter(x => /^- /.test(x)).length, 3); assert.match(sl[2], /^- SQ11-C \(squad11\): 20 trades on 20 days, average \+\d+\.\d%, TOO EARLY$/);
  assert.match(boardText(B), /1 COMEBACK, 0 WATCHING, 1 FADING, 1 TOO EARLY/);
  assert.match(boardText(one([], { 'SQ11-A': run() })), /every rule is TOO EARLY/);
  B.text = boardText(B);
  const S = await loadScan({ files: { 'data/settings.json': {}, 'data/comeback-board.json': B } });
  const t = S.fn('scoreboardText')(); assert.match(t, /COMEBACK \(forward paper records, top 5/); assert.match(t, /- SQ11-C \(squad11\): 20 trades on 20 days, average \+\d+\.\d%, TOO EARLY/); assert.ok(t.includes(LINE));
  assert.equal(S.fn('comebackText')(), B.text);
  const S0 = await loadScan({ files: { 'data/settings.json': {} } }); assert.match(S0.fn('scoreboardText')(), /the comeback board has not run yet/); assert.match(S0.fn('comebackText')(), /not built yet/);
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 1); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies[1].id, SPEC_ID);
  const lib = JSON.parse(fs.readFileSync(new URL('../data/strategy-library.json', import.meta.url), 'utf8')); assert.ok(lib.strategies.some(e => e.id === SPEC_ID), 'COMEBACK-1 is in the library');
});

test('cosmetics and the +300% cap: the bar sentence before any rule has 30 trades; a +900% trade counts as +300%', () => {
  const t0 = boardText(one([], { 'SQ11-A': run() })); assert.match(t0, /bar 2\.5 until rules reach 30 forward trades/); assert.doesNotMatch(t0, /over the 0 rules/);
  assert.match(boardText(one(ledger('SQ11-A', 0.03), { 'SQ11-A': run() })), /Bonferroni over the 1 rule with 30\+ forward trades/);
  const f = forwardTrades('squad11', [{ type: 'result', id: 'a', m: 'SQ11-A', sym: 'X', d: '2026-11-02', g: 9, net: 8.992, avgStock: 0 }], { 'SQ11-A': run() });
  assert.equal(f.trades[0].net, 3 - 0.008);
});

test('decoded and expert paper lanes record the average stock (capped +300%) on every resolved trade', () => {
  for (const f of ['decoded-lab.mjs', 'expert-lab.mjs']) { const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.match(src, /type: 'result'[^\n]*avgStock: \(\(\) => \{ const c = [^\n]*paperCtrl\(/, f); assert.match(src, /const paperCtrl = [\s\S]{0,400}?yardPush\(v, y \/ e - 1, 'capBoth'\)[\s\S]{0,40}?yardMean\(v, 50\)/, f); }
});
