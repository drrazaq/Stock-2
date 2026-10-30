// Seams in scan.mjs for the OPTIONS LANE (options-lab.mjs -> data/options-lab.json, 23 Oct 2026):
//   the Telegram command  options lab  (tgCommands)        -> the lane's verdicts and data coverage; plain  options  keeps the paper trial
//   optionsLabTier(rule)                                    -> 'proven' / 'small' / null: only a rule at tier 2 or proven feeds a ticket
//   tier2Resolve(lastPx)                                    -> an option ticket in the ledger is never priced with the STOCK's price
//   optionsLabTicketText(tk, rule, tier, record)            -> the ticket names the rule, its record, 1 contract and the rule's sell date
//   'bought option ...' after a lane ticket                 -> the contract keeps the rule's sell date (not the trial's 14 days)
// Run: node test/options-lab-live.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let queue = [], sent = [], uid = 100;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
const send = async (S, text) => { queue = [text]; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };

const lab = (v = {}) => ({ generatedAt: '2026-10-23T07:00:00Z', window: ['2024-02-01', '2026-10-22'], proofBar: 4,
  coverage: { alpaca: { firstOptionBar: '2024-01-18', lastOptionBar: '2026-10-22', contractsCached: 51234, optionSeriesCached: 4100 }, note: 'Alpha Vantage: free key (25 calls a day; HISTORICAL_OPTIONS refused as premium)' },
  verdicts: { 'OPT-LH1': 'REJECTED', 'OPT-CAT1': 'NOT PROVEN', 'OPT-FOLLOW1': 'TOO FEW CASES', 'OPT-UOA1': 'NEEDS DATA', ...v },
  latest: { 'OPT-LH1': { verdict: 'REJECTED', n: 310, avg: -0.12, stock: 0.02, tBlock: -1.1, why: 'did not beat buying the same stock' }, 'OPT-CAT1': { verdict: 'NOT PROVEN', n: 250, avg: 0.03, stock: 0.01, tBlock: 1.2, why: 'block t 1.2' },
    'OPT-FOLLOW1': { verdict: 'TOO FEW CASES', why: '0 traders had 30+ calls' }, 'OPT-UOA1': { verdict: 'NEEDS DATA', why: 'no open-interest history' } },
  leaderboard: [{ name: 'StockTwits Skumaroptions', priced: 13, days: 13, avg: -0.17, level: 'WATCH' }] });

test('"options lab" prints each rule\'s verdict with its numbers, the data coverage and that no new ticket is shown', async () => {
  const S = await loadScan({ env, files: { 'data/options-lab.json': lab() } });
  const r = await send(S, 'options lab');
  assert.match(r, /OPT-LH1: REJECTED/);
  assert.match(r, /310 trades/);
  assert.match(r, /OPT-UOA1: NEEDS DATA/);
  assert.match(r, /2024-01-18/);
  assert.match(r, /Skumaroptions/);
  assert.match(r, /no options rule has reached tier 2/i);
});

test('plain "options" still answers with the paper trial, not the lane', async () => {
  const S = await loadScan({ env, files: { 'data/options-lab.json': lab(), 'data/options-shadow.json': { open: [], done: [], real: [] } } });
  const r = await send(S, 'options');
  assert.match(r, /OPTIONS LAB \(paper only/);
  assert.doesNotMatch(r, /OPT-LH1/);
});

test('"options lab" before the first run says so', async () => {
  const S = await loadScan({ env });
  assert.match(await send(S, 'options lab'), /has not run yet/);
});

const day = (k) => new Date(Date.now() - k * 864e5).toISOString().slice(0, 10);
test('tier: TRADABLE SMALL -> small only while tier 2 is on and its own option ledger is not negative; PROVEN -> proven; others -> null', async () => {
  const on = { 'data/settings.json': { tier2: true } };
  assert.equal((await loadScan({ files: { ...on, 'data/options-lab.json': lab({ 'OPT-LH1': 'TRADABLE SMALL' }) } })).fn('optionsLabTier')('OPT-LH1'), 'small');
  assert.equal((await loadScan({ files: { ...on, 'data/options-lab.json': lab({ 'OPT-LH1': 'PROVEN' }) } })).fn('optionsLabTier')('OPT-LH1'), 'proven');
  assert.equal((await loadScan({ files: { ...on, 'data/options-lab.json': lab() } })).fn('optionsLabTier')('OPT-CAT1'), null);
  assert.equal((await loadScan({ files: { 'data/settings.json': { tier2: false }, 'data/options-lab.json': lab({ 'OPT-LH1': 'TRADABLE SMALL' }) } })).fn('optionsLabTier')('OPT-LH1'), null);
  const neg = Array.from({ length: 20 }, (_, i) => ({ d: day(40 + i), sym: 'L' + i, kind: 'option:OPT-LH1', px: 2, px1: 1, pct: -0.5, out: day(20) }));
  assert.equal((await loadScan({ files: { ...on, 'data/options-lab.json': lab({ 'OPT-LH1': 'TRADABLE SMALL' }), 'data/tier2-ledger.jsonl': neg } })).fn('optionsLabTier')('OPT-LH1'), null);
});

test('the ledger never prices an option ticket with the stock\'s price; a stock row is still resolved', async () => {
  const rows = [{ d: day(40), sym: 'HQY', kind: 'option:OPT-LH1', px: 2.4, occ: 'HQY261218C00095000' }, { d: day(40), sym: 'WST', kind: 'longer hold', px: 100 }];
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/tier2-ledger.jsonl': rows } });
  const L = S.fn('tier2Resolve')({ HQY: 97.9, WST: 110 });
  assert.equal(L.find(r => r.sym === 'HQY').pct, undefined);
  assert.equal(L.find(r => r.sym === 'WST').pct, 0.092);
});

const tk = { sym: 'HQY', occ: 'HQY261218C00095000', exp: '2026-12-18', k: 95, ask: 2.4, bid: 2.2, spot: 96.1, sellBy: '2026-11-27' };
test('a lane ticket names its rule, tier and record, says 1-contract paper reference and no purchase approval, and gives the rule\'s sell date', async () => {
  const S = await loadScan({ files: { 'data/halal.json': {HQY:{s:'ok',d:new Date().toISOString().slice(0,10)}}, 'data/options-lab.json': lab({ 'OPT-LH1': 'TRADABLE SMALL' }) } });
  const t = S.fn('optionsLabTicketText')(tk, 'OPT-LH1', 'small', { n: 310, avg: 0.12, stock: 0.03, tBlock: 2.9 });
  assert.match(t, /OPT-LH1/); assert.match(t, /TRADABLE SMALL/); assert.match(t, /310 trades/); assert.match(t, /quantity 1/); assert.match(t, /NOT AN APPROVED BUY/); assert.doesNotMatch(t, /pick BUY CALL|> confirm/);
  assert.match(t, /2026-11-27/); assert.match(t, /245 USD/);
});

test('"bought option" for a lane ticket keeps the rule and its sell date', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const S = await loadScan({ env, files: { 'data/options-shadow.json': { open: [], real: [], labT: [{ d: today, sym: 'HQY', rule: 'OPT-LH1', occ: tk.occ, exp: tk.exp, strike: 95, ask: 2.4, sellBy: '2026-11-27' }] }, 'data/my-positions.json': {} } });
  const r = await send(S, 'bought option HQY 95 2026-12-18 2.40');
  const o = S.readJson('data/options-shadow.json').real[0];
  assert.equal(o.rule, 'OPT-LH1'); assert.equal(o.sellBy, '2026-11-27');
  assert.match(r, /2026-11-27/);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
test.after(() => server.close());
