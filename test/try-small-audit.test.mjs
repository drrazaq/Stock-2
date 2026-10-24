// Pre-Monday audit (24 Oct 2026) of the TRY SMALL lane in scan.mjs. Each test pins one bug that would have sent the owner a wrong or
// missing buy / stop / sell on Telegram:
//  1. a lab whose nightly run stopped kept showing its OLD new-signal list (and its old close as the price) for 10 days;
//  2. a value-lab pick with no price in sig.stocks used the lab's week-old close: wrong "up to" limit and wrong stop;
//  3. a stock already shown as a BUY elsewhere in the same message could be shown again by TRY SMALL (a second 1,000 USD);
//  4. 'bought SYM' only checked TODAY's lab files: a renewed signal list left the buy untagged (no lane stop, no time exit, not counted);
//  5. the HOLD line of a TRY SMALL holding said 'exit: target or 5 sessions';
//  6. a TRY SMALL holding with under 600 daily bars skipped the nightly exit checks (no stop-at-close, no time exit);
//  7. the anomaly and macro labs emptied newSignals when re-run on the same close (Sunday run, any 'run now'), so the Monday scan lost them.
// Run: node --test test/try-small-audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { loadScan, blocked } from './load-scan.mjs';

const half = (avgStress, edge, noTop2) => ({ avgStress, edge, noTop2, avg: avgStress + 0.004 });
const good = (hold) => ({ verdict: 'NOT PROVEN', hold, results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } });
const now = new Date().toISOString(), day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const HAL = { TPC: { s: 'ok', d: '2026-10-23', by: 'you' }, QLYS: { s: 'ok', d: '2026-10-23', by: 'you' }, RELY: { s: 'ok', d: '2026-10-23', by: 'you' } };
const lab = (lastClose, extra = {}) => ({ 'data/value-lab.json': { firstRun: {} }, 'data/halal.json': HAL,
  'data/squad6-lab.json': { firstRun: { 'SQ6-MTUM': good(126) } },
  'data/squad6-today.json': { generatedAt: now, lastClose, methods: { 'SQ6-MTUM': { name: 'MTUM-style momentum', hold: 126, newSignals: [{ sym: 'TPC', close: 78, d: lastClose }] } } }, ...extra });

test('1. a new-signal list from an older close than the newest session is not shown as a buy', async () => {
  const S = await loadScan({ files: lab('2026-10-16') });
  assert.deepEqual(S.fn('trySmallLines')({}, {}, null, '2026-10-23'), []);
  const S2 = await loadScan({ files: lab('2026-10-23') });
  assert.match(S2.fn('trySmallLines')({}, {}, null, '2026-10-23').join('\n'), /- BUY TPC 1000 USD up to 80\.34\. STOP 50\.70 at your broker \(35%\)\. SELL after about 6 months \(126 sessions\).*SQ6-MTUM/);
});

test('1b. without a session, a list whose close is more than 5 trading sessions old is not shown', async () => {
  const S = await loadScan({ files: lab(day(10)) });
  assert.deepEqual(S.fn('trySmallLines')({}, {}), []);
  const S2 = await loadScan({ files: lab(day(1)) });
  assert.match(S2.fn('trySmallLines')({}, {}).join('\n'), /- BUY TPC/);
});

const VALUE = { 'data/value-lab.json': { firstRun: { 'B-FCF1': good(63) } }, 'data/halal.json': HAL,
  'data/value-today.json': { generatedAt: now, lastClose: '2026-10-19', rules: { 'B-FCF1': { picks: [{ sym: 'QLYS', lastClose: 190.08, blocked: false }] } } } };

test('2. a value pick priced only by the lab\'s week-old close gets no stale limit or stop', async () => {
  const S = await loadScan({ files: VALUE });
  const L = S.fn('trySmallLines')({}, {}, null, '2026-10-23').join('\n');
  assert.match(L, /- BUY QLYS 1000 USD at the next open .*STOP 15% under your buy price/);
  assert.doesNotMatch(L, /195\.78|161\.57/);
  const L2 = S.fn('trySmallLines')({}, { QLYS: 216.82 }, null, '2026-10-23').join('\n');
  assert.match(L2, /- BUY QLYS 1000 USD up to 223\.32\. STOP 184\.30 at your broker \(15%\)/);
});

test('2b. ACTIONS prices TRY SMALL from sig.uni too (QLYS was only there on 23 Oct)', () => {
  const src = fs.readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8'), line = src.split('\n').find(l => /trySmallLines\(pos, lp/.test(l) || /sig\.uni\) \|\| \[\]\)\]\) if \(x\.last > 0 && !lp/.test(l));
  assert.ok(line && /sig\.uni/.test(line));
});

test('3. a stock already a BUY elsewhere in the message is not bought again by TRY SMALL', async () => {
  const S = await loadScan({ files: lab('2026-10-23') });
  assert.deepEqual(S.fn('trySmallLines')({}, { TPC: 78 }, new Set(['TPC']), '2026-10-23'), []);
});

test('3b. the TRY SMALL ledger row carries the hold and stop that were shown', async () => {
  const S = await loadScan({ files: lab('2026-10-23') });
  S.fn('trySmallLines')({}, { TPC: 78 }, null, '2026-10-23');
  const row = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x)).find(r => r.kind === 'try:SQ6-MTUM');
  assert.equal(row.hold, 126); assert.equal(row.stopPct, 0.35); assert.equal(row.sym, 'TPC');
});

test('4. bought SYM after the signal list changed: still tagged TRY SMALL with the shown hold and stop', async () => {
  let sent = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
    let out = { ok: true, result: true }; if (/\/getUpdates/.test(req.url)) out = { ok: true, result: [{ update_id: 1, message: { message_id: 1, chat: { id: 42 }, text: 'bought TPC 100 10 shares' } }] }; else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + server.address().port;
  // the lab's file was renewed since the message: TPC is no longer in newSignals; the ledger remembers what was shown
  const files = lab('2026-10-26', { 'data/squad6-today.json': { generatedAt: now, lastClose: '2026-10-26', methods: { 'SQ6-MTUM': { hold: 126, newSignals: [] } } },
    'data/tier2-ledger.jsonl': [{ d: new Date().toISOString().slice(0, 10), sym: 'TPC', kind: 'try:SQ6-MTUM', px: 78, hold: 126, stopPct: 0.35 }] });
  const S = await loadScan({ files, env: { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: B, TD_BASE: B, FH_BASE: B, SEC_BASE: B } });
  await S.fn('tgCommands')(null); server.close();
  const P = S.readJson('data/my-positions.json').TPC;
  assert.equal(P.src, 'try small'); assert.equal(P.tryHold, 126); assert.equal(P.stop, 65);
});

test('5. the HOLD line of a TRY SMALL holding names its real exits, not "target or 5 sessions"', async () => {
  const S = await loadScan({});
  const t = S.fn('trySmallExitText')({ src: 'try small', kind: 'manual', tryHold: 126, since: '2026-10-26' });
  assert.match(t, /sell after 126 sessions \(about 6 months after 2026-10-26/);
  assert.equal(S.fn('trySmallExitText')({ kind: 'manual' }), null);
});

test('6. a TRY SMALL holding\'s stop-at-close and time exit are computed from its own bars, however short its history', async () => {
  const S = await loadScan({}); const f = S.fn('trySmallCloseFlags');
  const bars = (n, c) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse('2026-01-02') + i * 864e5).toISOString().slice(0, 10), c }));
  const P = { src: 'try small', since: '2026-01-02', tryHold: 63, stop: 85 };
  // coordinator fix (24 Oct): the tested exit is the close of the 63rd session COUNTING the buy day, so the flag comes at that close
  assert.deepEqual(f(P, bars(62, 100)).fl, []);   // 61 sessions after the buy day = 62 counting it
  assert.match(f(P, bars(63, 100)).fl.join(), /TRY SMALL TIME EXIT: 63 sessions are up/);
  assert.match(f(P, bars(10, 84)).fl.join(), /CLOSED AT OR BELOW YOUR STOP 85/);
  const src = fs.readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(d\.candles\.length < 600\) \{[^\n]*\n[\s\S]{0,600}trySmallCloseFlags\(P, c\)/);
});

test('7. every lab keeps the newest close\'s signals when re-run on the same close', () => {
  for (const f of ['anomaly-lab.mjs', 'macro-lab.mjs', 'angles-lab.mjs', 'tipster-lab.mjs', 'squad1-lab.mjs', 'squad4-lab.mjs', 'squad7-lab.mjs', 'squad8-lab.mjs', 'squad13-lab.mjs']) {
    const line = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\n').find(l => /today\[id\] = \{.*newSignals:/.test(l));
    assert.ok(line, f); assert.doesNotMatch(line, /newLines\.includes/, f);
    assert.doesNotMatch(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /(newSignals|late): mine\.filter\([^\n]*newLines\.includes/, f);
  }
});

// ---- coordinator decisions, 24 Oct ----
const sessAgo = (S, n) => { let x = new Date().toISOString().slice(0, 10), k = 0; while (k < n) { x = new Date(Date.parse(x) - 864e5).toISOString().slice(0, 10); if (S.fn('isSession')(x)) k++; } return x; };

test('8. LATE ENTRIES: a value list is offered only within 5 sessions of its formation; older says when the next one is due', async () => {
  const mk = (formed) => ({ ...VALUE, 'data/value-today.json': { ...VALUE['data/value-today.json'], lastClose: formed, rules: { 'B-FCF1': { formed, picks: [{ sym: 'QLYS', lastClose: 190, blocked: false }] } } } });
  const S0 = await loadScan({}); const old = sessAgo(S0, 9), recent = sessAgo(S0, 2);
  const S = await loadScan({ files: mk(old) });
  const L = S.fn('trySmallLines')({}, { QLYS: 216.82 }).join('\n');
  assert.doesNotMatch(L, /- BUY/); assert.match(L, /no buy today.*Next B-FCF1 list due about \d{4}-\d\d-\d\d/);
  assert.equal(S.fn('sessionPlus')(old, 21) > old, true);
  const S2 = await loadScan({ files: mk(recent) });
  assert.match(S2.fn('trySmallLines')({}, { QLYS: 216.82 }).join('\n'), /- BUY QLYS 1000 USD up to 223\.32/);
});

test('8b. sessions are counted on the exchange calendar (weekends and holidays skipped)', async () => {
  const S = await loadScan({}); const n = S.fn('sessionsAfter');
  assert.equal(n('2026-10-23', '2026-10-26'), 1);   // Friday -> Monday
  assert.equal(n('2026-11-25', '2026-11-30'), 2);   // Thanksgiving 26 Nov skipped: 27, 30
  assert.equal(S.fn('sessionPlus')('2026-10-23', 1), '2026-10-26');
});

test('9. B-BASK1 (judged as one basket a month) never feeds TRY SMALL; B-FCF1 (judged per stock) still does', async () => {
  const S = await loadScan({}); const q = S.fn('tryQualifies');
  assert.deepEqual(q({ 'B-BASK1_3m': good(63), 'B-BASK1_1m': good(21), 'B-FCF1': good(63) }), ['B-FCF1']);
});

const bar = (d, o, l, c) => ({ d, o, h: Math.max(o, c), l, c });
test('10. AUTO-OFF: a TRY SMALL ledger row is resolved at its own hold, or at its stop', async () => {
  const S = await loadScan({}); const z = S.fn('tryResolveRow'), days = (n, f) => Array.from({ length: n }, (_, i) => f(i, new Date(Date.parse('2026-01-05') + i * 864e5).toISOString().slice(0, 10)));
  const flat = days(70, (i, d) => bar(d, 100, 99, i === 62 ? 110 : 100));
  const r = z({ d: '2026-01-05', kind: 'try:B-FCF1', hold: 63, stopPct: 0.15 }, flat);
  assert.equal(r.why, 'time exit'); assert.equal(r.out, flat[62].d); assert.equal(r.pct, +(0.1 - 0.008).toFixed(4));
  assert.equal(z({ d: '2026-01-05', kind: 'try:B-FCF1', hold: 63 }, flat.slice(0, 62)), null);   // still open
  const drop = days(70, (i, d) => i === 10 ? bar(d, 80, 75, 78) : bar(d, 100, 99, 100));   // gaps under the 85 stop
  const s = z({ d: '2026-01-05', kind: 'try:B-FCF1', hold: 63, stopPct: 0.15 }, drop);
  assert.equal(s.why, 'stop'); assert.equal(s.px1, 80);
  const late = z({ d: '2026-01-05', shownAt: '2026-01-05T22:00:00Z', kind: 'try:SQ6-MTUM', hold: 3, stopPct: 0.35 }, days(10, (i, d) => bar(d, 100 + i, 90, 100 + i)));
  assert.equal(late.px, 101);   // shown after the close: bought at the next session's open
});

test('10b. AUTO-OFF: every logged stock is priced from daily bars (not only the scan list), so 10 losers switch the rule off', async () => {
  const start = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const server = http.createServer((req, res) => { const t0 = Date.parse(start + 'T00:00:00Z'), results = Array.from({ length: 120 }, (_, i) => ({ t: t0 + i * 864e5, o: 100, h: 100, l: 95, c: 90 }));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(/\/v2\/aggs\//.test(req.url) ? { results } : {})); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + server.address().port;
  const rows = Array.from({ length: 10 }, (_, i) => ({ d: start, sym: 'ZZ' + i, kind: 'try:B-FCF1', px: 100, hold: 63, stopPct: 0.15 }));
  const S = await loadScan({ files: { 'data/tier2-ledger.jsonl': rows }, env: { MASSIVE_KEY: 'k', MASSIVE_BASE: B, TD_BASE: B } });
  await S.fn('tryLedgerResolve')(); server.close();
  const L = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.ok(L.every(r => r.pct === +(0.9 - 1 - 0.008).toFixed(4) && r.why === 'time exit'));
  assert.equal(S.fn('tryLedgerOff')('try:B-FCF1'), true);
  // the generic 30-day tier-2 resolver no longer touches try: rows
  const S2 = await loadScan({ files: { 'data/tier2-ledger.jsonl': [{ d: start, sym: 'ZZ0', kind: 'try:B-FCF1', px: 100, hold: 63 }] } });
  S2.fn('tier2Resolve')({ ZZ0: 50 }); assert.doesNotMatch(S2.read('data/tier2-ledger.jsonl'), /"pct"/);
});

test('no network was used', () => assert.deepEqual(blocked, []));
