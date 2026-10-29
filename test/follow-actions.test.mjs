// Seams: followSection(sig, pos) in scan.mjs (the FOLLOWING section of ACTIONS, fed by data/follow-today.json from follow-lane.mjs)
// and the Telegram command  traders  (the leaderboard from data/follow-board.json).
// Gates: a stock ZAD marks not halal is removed; a lottery-like stock (15%+ one-day jump last month) is removed; a stock with a recent
// offering filing (424B4 / 424B5) is removed; unknown halal stays with "check ZAD first"; a trader whose own tier-2 ledger is negative
// (20+ resolved 'follow:<trader>' cases) is switched off; tier 2 off hides the section. Each shown call is logged to the tier-2 ledger.
// Run: node test/follow-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

const today = new Date().toISOString().slice(0, 10), recent = new Date().toISOString();
const rec = '42 calls on 18 days, at 20 sessions: +3.1% a call after costs';
const call = (sym, o = {}) => ({ trader: 'Good Trader', source: 'YouTube', tr: 'yt:UCgood', sym, pub: recent, title: sym + ' breakout', H: 20, st: null, tg: null, last: 10, halal: 'unknown', record: rec, ...o });
const files = (calls, extra = {}) => ({ 'data/settings.json': { tier2: true }, 'data/follow-today.json': { at: recent, asOf: today, calls }, 'data/halal.json': { BADH: { s: 'fail', d: today, by: 'ZAD (you)' }, GOOD: { s: 'ok', d: today, by: 'ZAD (you)' } }, ...extra });
const sig = { lottery: { LOTO: 0.4 }, stocks: [] };
const show = async (calls, extra, s = sig) => { const S = await loadScan({ files: files(calls, extra) }); return { S, text: S.fn('followSection')(s, {}).join('\n') }; };

test('a FOLLOW trader’s halal-ok call is shown with his record, the entry range up to +3%, the 15% stop and his horizon', async () => {
  const { text } = await show([call('GOOD')]);
  assert.match(text, /^FOLLOWING \(traders whose own call history wins; tier 2, 1,000 USD, stop 15% unless the trader gave one\)/);
  assert.match(text, /BUY GOOD .*up to 10\.30/);
  assert.match(text, /STOP 15% under your buy/);
  assert.match(text, /SELL at the close of the 20th session/);
  assert.match(text, /From Good Trader \[YouTube\]/); assert.match(text, /42 calls on 18 days/);
  assert.doesNotMatch(text, /check ZAD first/);
});

test('each FOLLOW is labelled with its source type (a 13F fund here)', async () => {
  const { text } = await show([call('GOOD', { trader: '13F: PERSHING SQUARE', source: 'SEC 13F fund', H: 60 })]);
  assert.match(text, /From 13F: PERSHING SQUARE \[SEC 13F fund\]/); assert.match(text, /close of the 60th session/);
});

test('the trader’s own stop is used when he gave one', async () => {
  const { text } = await show([call('GOOD', { st: 9.1 })]);
  assert.match(text, /STOP 9\.10 \(the trader’s own\)/);
});

test('halal fail is removed; unknown halal is shown with "check ZAD first"', async () => {
  const { text } = await show([call('BADH'), call('UNKN')]);
  assert.doesNotMatch(text, /BADH/);
  assert.match(text, /RESEARCH ONLY — MARK HALAL FIRST: UNKN .*check ZAD first/);
});

test('a lottery-like stock is removed', async () => {
  const { text } = await show([call('LOTO'), call('GOOD')]);
  assert.doesNotMatch(text, /LOTO/); assert.match(text, /GOOD/);
});

test('a stock with an offering filing in the last 30 days is removed (dilution)', async () => {
  const { text } = await show([call('DILU'), call('GOOD')], { 'data/events-recent.json': { events: [{ sym: 'DILU', p: recent.slice(0, 16), f: 'OFFERING' }] } });
  assert.doesNotMatch(text, /DILU/); assert.match(text, /GOOD/);
});

test('every shown call is logged once to the tier-2 ledger as follow:<trader>', async () => {
  const { S } = await show([call('GOOD')]);
  S.fn('followSection')(sig, {});   // shown twice: logged once
  const L = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.deepEqual(L.map(r => [r.sym, r.kind, r.px]), [['GOOD', 'follow:Good Trader', 10]]);
});

test('a trader whose own ledger has 20+ resolved negative cases is switched off', async () => {
  const old = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), L = Array.from({ length: 20 }, (_, i) => ({ d: old, sym: 'L' + i, kind: 'follow:Good Trader', px: 10, px1: 9, pct: -0.108, out: today }));
  const { text } = await show([call('GOOD')], { 'data/tier2-ledger.jsonl': L });
  assert.equal(text, '');
});

test('tier 2 switched off, or no new calls: no section', async () => {
  const S = await loadScan({ files: { ...files([call('GOOD')]), 'data/settings.json': { tier2: false } } });
  assert.deepEqual(S.fn('followSection')(sig, {}), []);
  assert.equal((await show([])).text, '');
});

// the bot command
let queue = [], sent = [], uid = 500;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => { let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
const tr = (name, level, t, n = 40) => ({ tr: 'yt:' + name, name, src: 'YouTube', H: 20, level, calls: n, record: n + ' calls, t ' + t, atH: { n, days: 15, t } });
test('"traders" shows FOLLOW, FADE and the closest others with numbers, the count screened and the luck line', async () => {
  const board = { generatedAt: recent, screened: 3, judged: 3, counts: { FOLLOW: 1, FADE: 1, 'NO EDGE': 1, WATCH: 0 }, luck: { judged: 3, followByLuckAtMost: 0.02 }, calls: { total: 120, scored: 110 }, traders: [tr('Alpha', 'FOLLOW', 3.1), tr('Beta', 'FADE', -2.9), tr('Gamma', 'NO EDGE', 1.2)] };
  const S = await loadScan({ env, files: { 'data/follow-board.json': board } });
  queue = ['traders']; sent = []; await S.fn('tgCommands')(null); const out = sent.join('\n');
  assert.match(out, /TRADERS/); assert.match(out, /3 traders screened/); assert.match(out, /FOLLOW Alpha/); assert.match(out, /FADE Beta/); assert.match(out, /NO EDGE Gamma/); assert.match(out, /luck/i);
  server.close();
});

// FADE -> AVOID: a buy call by a FADE trader in the last 20 sessions blocks that stock everywhere (planCands, gateVerdict, the ACTIONS AVOID line)
const quick = (sym) => ({ sym, n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, maxHold: 5 });
const sigQ = { session: '2026-10-21', market: { above50: true, up: true }, quick: [quick('AAA'), quick('BBB')] };
const until = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
test('a stock a FADE trader called in the last 20 sessions is not a buy, says why, and is listed under AVOID', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': sigQ, 'data/follow-fade.json': { at: recent, avoid: { AAA: { trader: 'Hot Trades', pub: recent, until: until(20) }, BBB: { trader: 'Old Fade', pub: recent, until: until(-1) } } } } });
  const pc = S.fn('planCands')(sigQ, {}), a = pc.find(x => x.sym === 'AAA'), b = pc.find(x => x.sym === 'BBB');
  assert.equal(a.ok, false); assert.equal(a.fade, 'Hot Trades'); assert.match(a.avoid, /AVOID: tipped by Hot Trades/);
  assert.equal(b.ok, true);   // its 20 sessions are over
  assert.match(S.fn('gateVerdict')('AAA', sigQ), /Hot Trades.*FADE/);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
