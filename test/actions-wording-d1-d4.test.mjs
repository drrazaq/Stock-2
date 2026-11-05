// D1–D4 (5 Nov 2026) through the real ACTIONS caller. Entirely synthetic: invented tickers, loopback price stub, no owner message,
// holdings or private figures, no external request. D1 entry-window semantics are Codex 984a1c2 (see leader-dip-entry-window.test.mjs);
// these tests add the owner's 5 Nov case shape: a signal from the previous close, marked or unmarked, before and after the open.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

const CLOSE = '2026-11-04', GEN = '2026-11-05T05:26:00Z';   // previous-close signal list, generated before the open (shape of 5 Nov)
const OPEN = '2026-11-05T14:30:00.000Z';                      // 9:30 New York (EST) = 5:30 pm Kuwait
async function at(iso, fn) { const real = Date.now; Date.now = () => Date.parse(iso); try { return await fn(); } finally { Date.now = real; } }
async function setup(files = {}) {
  const server = http.createServer((req, res) => { const values = []; for (let i = 0; i < 290; i++) values.push({ datetime: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), open: 75, high: 76, low: 74, close: 75, volume: 1e6 });
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url.includes('time_series') ? { status: 'ok', values: values.reverse() } : {})); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/names.json': { ZZP: 'Synthetic' }, ...files }, env: { TD_BASE: base, FH_BASE: base, SEC_BASE: base } });
  return { S, close: () => server.close() };
}
const ld = (marked) => ({ 'data/halal.json': marked ? { ZZP: { s: 'ok', d: CLOSE, by: 'you' } } : {},
  'data/squad11-today.json': { generatedAt: GEN, lastClose: CLOSE, methods: { 'SQ11-PB12': { hold: 126, newSignals: [{ sym: 'ZZP', close: 100, halal: 'unknown', d: CLOSE }] } } } });
const sig = (extra = {}) => ({ session: CLOSE, market: { up: true, above50: true }, stocks: [], ...extra });
const actions = async (S, s = sig(), pos = {}) => S.fn('actionsText')(s, pos, null, 'SYNTHETIC');

// ---------- D1: exact opening cutoff, stale sessions, a halal mark alone never makes a buy
test('D1 actual ACTIONS: before the open an unmarked pick asks for the mark and names its single entry instant', () => at('2026-11-05T09:03:00Z', async () => {
  const { S, close } = await setup(ld(false)); try {
    const t = await actions(S);
    assert.match(t, /MARK HALAL FIRST \(leader dip picks[^)]*\): ZZP \(signal from the 2026-11-04 close; entry only at the 2026-11-05 open, 5:30 pm Kuwait; no late entry\)/);
    assert.doesNotMatch(t, /- BUY ZZP/);
  } finally { close(); } }));
test('D1 exact cutoff: marked before the open is a lane BUY until 14:30:00.000Z; one millisecond later it is expired, never a BUY', async () => {
  for (const [iso, buy] of [['2026-11-05T14:29:59.999Z', true], [OPEN, true], ['2026-11-05T14:30:00.001Z', false], ['2026-11-05T16:00:00Z', false], ['2026-11-06T09:00:00Z', false]]) await at(iso, async () => {
    const { S, close } = await setup(ld(true)); try {
      const t = await actions(S);
      if (buy) assert.match(t, /- BUY ZZP\b[^\n]*1,000 USD at the open/, iso); else { assert.doesNotMatch(t, /- BUY ZZP/, iso); assert.match(t, /LEADER DIP: no qualifying trade — next-open entry expired on 2026-11-05; no late entries/, iso); }
    } finally { close(); } });
});
test('D1 a halal mark given after the open does not revive the entry (the owner 5 Nov PSX case)', () => at('2026-11-05T15:10:00Z', async () => {
  const { S, close } = await setup(ld(false)); try {
    assert.doesNotMatch(await actions(S), /- BUY ZZP/);
    S.write('data/halal.json', { ZZP: { s: 'ok', d: '2026-11-05', by: 'you' } });
    const t = await actions(S); assert.doesNotMatch(t, /- BUY ZZP/); assert.doesNotMatch(t, /MARK HALAL FIRST \(leader dip/); assert.match(t, /entry expired on 2026-11-05/);
    assert.equal((t.match(/no qualifying trade/g) || []).length, 1, 'stated once, under APPROVED LANES only');
  } finally { close(); } }));
test('D1 stale or future source sessions are UNKNOWN, never a BUY, even when marked', async () => {
  for (const [files, s, iso] of [
    [{ ...ld(true), 'data/squad11-today.json': { generatedAt: GEN, lastClose: '2026-11-03', methods: { 'SQ11-PB12': { newSignals: [{ sym: 'ZZP', close: 100, d: '2026-11-03' }] } } } }, sig(), '2026-11-05T09:00:00Z'],   // behind the scanner
    [{ ...ld(true), 'data/squad11-today.json': { generatedAt: '2026-11-05T12:00:00Z', lastClose: CLOSE, methods: { 'SQ11-PB12': { newSignals: [{ sym: 'ZZP', close: 100, d: CLOSE }] } } } }, sig(), '2026-11-05T09:00:00Z'],   // generated in the future
    [ld(true), sig({ session: '2026-11-05' }), '2026-11-06T09:00:00Z']]) await at(iso, async () => {   // scanner already on a newer close
    const { S, close } = await setup(files); try { const t = await actions(S, s); assert.doesNotMatch(t, /- BUY ZZP/); assert.match(t, /no qualifying trade/); } finally { close(); } });
});
test('D1 gates kept: a marked in-window pick still needs a free slot; a NOT-halal mark drops it', () => at('2026-11-05T09:00:00Z', async () => {
  const full = Object.fromEntries(['ZA1', 'ZA2', 'ZA3'].map(s => [s, { entry: 50, since: '2025-06-02', src: 'leader dip', boughtSession: '2025-06-02' }]));
  const { S, close } = await setup(ld(true)); try {
    S.write('data/halal.json', { ZZP: { s: 'ok', d: CLOSE, by: 'you' }, ZA1: { s: 'ok', d: CLOSE, by: 'you' }, ZA2: { s: 'ok', d: CLOSE, by: 'you' }, ZA3: { s: 'ok', d: CLOSE, by: 'you' } });
    const tf = await actions(S, sig({ stocks: ['ZA1', 'ZA2', 'ZA3'].map(sym => ({ sym, last: 75 })) }), full); assert.doesNotMatch(tf, /- BUY ZZP/); assert.match(tf, /all 3 slots are in use, so no buy of ZZP/);
    S.write('data/halal.json', { ZZP: { s: 'fail', d: CLOSE, by: 'you' } }); const t = await actions(S); assert.doesNotMatch(t, /- BUY ZZP/); assert.doesNotMatch(t, /halal ZZP yes/);
  } finally { close(); } }));

// ---------- D2: market-shock line names its measurement time and never points at missing ranges
const shock = (at0, dp = 1.8533, kind = 'bigUp') => ({ 'data/macro-log.jsonl': JSON.stringify({ at: at0, dp, kind, why: ['move'], heads: [] }) + '\n' });
test('D2 previous-session intraday reading, no permitted buy: dated, not "today", no ranges', () => at('2026-11-05T09:03:00Z', async () => {
  const { S, close } = await setup(shock('2026-11-04T18:22:54Z')); try {
    const t = await actions(S);
    assert.match(t, /MARKET SHOCK \(S&P 500 \+1\.9% on 2026-11-04 at 1:22 pm New York, during the session, not a close\): HOLD; do not chase; no permitted buy today\./);
    assert.doesNotMatch(t, /MARKET SHOCK TODAY|ranges below/);
  } finally { close(); } }));
test('D2 same-day reading with a permitted buy keeps the original advice; big down without buys says so', async () => {
  await at('2026-11-05T09:00:00Z', async () => { const { S, close } = await setup({ ...shock('2026-11-05T08:30:00Z'), ...ld(true) }); try {
    const t = await actions(S); assert.match(t, /MARKET SHOCK TODAY \(S&P 500 \+1\.9% today at 3:30 am New York\): HOLD; do not chase; buy only inside the ranges below\./); assert.match(t, /- BUY ZZP\b/); } finally { close(); } });
  await at('2026-11-05T09:03:00Z', async () => { const { S, close } = await setup(shock('2026-11-04T18:22:54Z', -2.1, 'bigDown')); try {
    const t = await actions(S); assert.match(t, /HOLD everything, keep every stop; no panic-selling\. No permitted buy today\./); assert.doesNotMatch(t, /buys below stay valid/); } finally { close(); } });
});
test('D2 the 18-hour window is unchanged', () => at('2026-11-05T12:23:00Z', async () => {
  const { S, close } = await setup(shock('2026-11-04T18:22:54Z')); try { assert.doesNotMatch(await actions(S), /MARKET SHOCK/); } finally { close(); } }));

// ---------- D3: every held-back quick trade keeps its own reason
test('D3 saved legacy reasons (the 5 Nov signals) are grouped by the condition that failed; nothing is attributed to the wrong stock', () => at('2026-11-05T09:03:00Z', async () => {
  const legacy = (sym, n) => ({ sym, why: 'strict gate: needs 30+ unseen trades and a positive safety margin (has ' + n + ')' });
  const { S, close } = await setup(); try {
    const t = await actions(S, sig({ quickHeld: [legacy('ZQA', 41), legacy('ZQB', 49), legacy('ZQC', 50), legacy('ZQD', 19)] }));
    assert.match(t, /QUICK TRADES held back \(not strong enough; logged on paper; from the 2026-11-04 close\): ZQA, ZQB, ZQC: strict gate: safety margin not positive or not computable \(41, 49 and 50 unseen trades\); ZQD: strict gate: fewer than 30 unseen trades \(has 19\)\./);
    assert.match(t, /ZQD: strict gate: fewer than 30 unseen trades \(has 19\)/);
    assert.doesNotMatch(t, /\(has 41\)\./);
  } finally { close(); } }));
test('D3 new producer reasons and other reasons render per group', () => at('2026-11-05T09:03:00Z', async () => {
  const { S, close } = await setup(); try {
    const t = await actions(S, sig({ quickHeld: [{ sym: 'ZQA', why: 'strict gate: safety margin not positive (41 unseen trades)' }, { sym: 'ZQD', why: 'strict gate: fewer than 30 unseen trades (has 19)' }, { sym: 'ZQE', why: 'paper only: dips do not work on the whole market and a stock’s own record did not carry forward' }] }));
    assert.match(t, /ZQA: strict gate: safety margin not positive \(41 unseen trades\); ZQD: strict gate: fewer than 30 unseen trades \(has 19\); ZQE: paper only/);
  } finally { close(); } }));
test('D3 the strict gate itself is unchanged in the producer (30+ trades and a positive safety margin)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8');
  assert.match(src, /const strictOk = \(r\) => \{ const d = distOf\(r\.pcts, r\.last\); return \(r\.n \|\| 0\) >= 30 && d && d\.lb > 0; \};/);
  assert.match(src, /strictOk\(r\) \? null : strictWhy\(r\)/);
});

// ---------- D4: actionable sections name their source close
test('D4 SELL header names the source close; an invalid session is UNKNOWN, not invented', () => at('2026-11-05T09:03:00Z', async () => {
  const { S, close } = await setup({ 'data/halal.json': { ZZS: { s: 'ok', d: CLOSE, by: 'you' } } }); try {
    const pos = { ZZS: { entry: 100, stop: 80, since: '2025-06-02' } };
    const t = await actions(S, sig({ stocks: [{ sym: 'ZZS', last: 75 }] }), JSON.parse(JSON.stringify(pos)));
    assert.match(t, /SELL \(close-based exits[^\n]*; from the 2026-11-04 close\):/);
    const u = await actions(S, sig({ session: '2026-13-45', stocks: [{ sym: 'ZZS', last: 75 }] }), JSON.parse(JSON.stringify(pos)));
    assert.match(u, /SELL \(close-based exits[^\n]*; source close UNKNOWN\):/);
  } finally { close(); } }));
test('D4 leader-dip BUY block names its signal close', () => at('2026-11-05T09:00:00Z', async () => {
  const { S, close } = await setup(ld(true)); try { assert.match(await actions(S), /LEADER DIP \(your trading lane[^\n]*\| signal from the 2026-11-04 close; entry at the next open only \| horizon/); } finally { close(); } }));

test('all requests stayed on loopback', () => assert.deepEqual(blocked, []));
