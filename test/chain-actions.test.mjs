// Seams in scan.mjs for the CHAIN DECODER (chain-decoder.mjs writes data/chain-today.json weekly):
//   chainLines(sig, pos)  the 'CHAIN (tier 2 ...)' section of ACTIONS: a buy appears ONLY when its rule's frozen verdict is TRADABLE SMALL
//                         (tier2 switch on, its own ledger not negative) or PROVEN; buy range = next open up to +3%, the rule's stop and
//                         sell date, the chain/layer and the source event on one line; halal (unknown -> 'check ZAD first'), lottery,
//                         dilution and held stocks checked; each shown line logged once in data/tier2-ledger.jsonl as 'chain:<rule>'.
//   chainsText()          the  chains  command: hot layers now and the decoder's verdicts.
//   chainGraphLine(sym)   what  check SYM  adds: the stock's chain(s) and layer from the point-in-time graph.
// Run: node test/chain-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

const sig = { session: '2026-10-23', stocks: [{ sym: 'MU', last: 10 }, { sym: 'WDC', last: 20 }], lottery: {} };
const buy = (o = {}) => ({ rule: 'CHAIN-MOM1', sym: 'MU', buy: '2026-10-26', sell: '2026-11-24', stopPct: null, lastClose: 9.9, chainLayer: 'AI build-out|Memory and storage (HBM)', event: 'layer in the top 3 of 52 by 3-month return vs the S&P 500 (+31.0%)', halal: 'ok', ...o });
const today = (rules, buys = [buy()]) => ({ generatedAt: new Date().toISOString(), lastClose: '2026-10-23', sessions: ['2026-10-26', '2026-10-27'], rules: { 'CHAIN-MOM1': null, 'CHAIN-DEMAND1': null, 'CHAIN-LAG1': null, 'CHAIN-READ1': null, ...rules },
  verdicts: { 'CHAIN-MOM1': 'TRADABLE SMALL', 'CHAIN-DEMAND1': 'NOT PROVEN', 'CHAIN-LAG1': 'NO REPEATING ORDER FOUND', 'CHAIN-READ1': 'REJECTED' },
  hot: [{ layer: 'AI build-out|Memory and storage (HBM)', excess: 0.31, n: 4 }, { layer: 'Gold and silver miners|Gold producers', excess: 0.22, n: 11 }], cold: [{ layer: 'Shipping|Tankers', excess: -0.12, n: 8 }], spy63: 0.05,
  buys, members: { MU: [{ chain: 'AI build-out', layer: 'Memory and storage (HBM)', li: 3, of: 11, since: '2001-03-01', status: 'point-in-time' }, { chain: 'Semiconductor cycle', layer: 'Memory', li: 2, of: 4, since: '2001-03-01', status: 'point-in-time' }] } });
const files = (rules, extra = {}, buys) => ({ 'data/settings.json': { tier2: true }, 'data/chain-today.json': today(rules, buys), 'data/halal.json': { MU: { s: 'ok', d: new Date().toISOString().slice(0, 10) } }, ...extra });

test('no rule qualified -> ACTIONS shows nothing new, nothing is logged', async () => {
  const S = await loadScan({ files: files({}) });
  assert.deepEqual(S.fn('chainLines')(sig, {}), []);
  assert.throws(() => S.read('data/tier2-ledger.jsonl'));
});

test('TRADABLE SMALL -> one line: BUY at the next open up to +3%, the sell date, the chain/layer and the source event; logged as chain:CHAIN-MOM1', async () => {
  const S = await loadScan({ files: files({ 'CHAIN-MOM1': 'TRADABLE SMALL' }) });
  const out = S.fn('chainLines')(sig, {});
  assert.match(out[0], /^CHAIN \(tier 2/);
  const line = out.find(l => /BUY MU/.test(l));
  assert.match(line, /BUY MU at the open on 2026-10-26, up to 10\.30 /);
  assert.match(line, /SELL at the close on 2026-11-24/);
  assert.match(line, /AI build-out > Memory and storage \(HBM\)/);
  assert.match(line, /top 3 of 52/);
  assert.match(line, /STOP 15% under your buy/);   // MOM1 has no tested stop: the house 15% safety stop is shown
  const L = S.read('data/tier2-ledger.jsonl').trim().split('\n').map(x => JSON.parse(x));
  assert.equal(L.length, 1); assert.equal(L[0].kind, 'chain:CHAIN-MOM1'); assert.equal(L[0].px, 10);
});

test('a rule with a tested stop shows that stop (CHAIN-DEMAND1: 20%)', async () => {
  const S = await loadScan({ files: files({ 'CHAIN-DEMAND1': 'TRADABLE SMALL' }, {}, [buy({ rule: 'CHAIN-DEMAND1', stopPct: 0.2, sell: '2026-12-21', chainLayer: 'customer disclosure', event: 'MSFT earnings 8-K filed 2026-10-22: capital expenditures will increase', source: 'https://www.sec.gov/x' })]) });
  const line = S.fn('chainLines')(sig, {}).find(l => /BUY MU/.test(l));
  assert.match(line, /STOP 20% under your buy/); assert.match(line, /MSFT earnings 8-K filed 2026-10-22/);
});

test('halal unknown -> shown with "check ZAD first"; ZAD not halal, lottery-like, an offering filing, held, or another buy day -> not shown', async () => {
  const bs = [buy({ sym: 'WDC', halal: 'unknown' }), buy({ sym: 'NOTH', halal: 'fail' }), buy({ sym: 'LOTT' }), buy({ sym: 'OFFR' }), buy({ sym: 'HELD' }), buy({ sym: 'LATE', buy: '2026-10-27' })];
  const ev = { events: [{ sym: 'OFFR', f: 'OFFERING 424B5', p: new Date().toISOString() }] };
  const S = await loadScan({ files: files({ 'CHAIN-MOM1': 'TRADABLE SMALL' }, { 'data/events-recent.json': ev, 'data/halal.json': {} }, bs) });
  const out = S.fn('chainLines')({ ...sig, lottery: { LOTT: 0.2 } }, { HELD: { entry: 5 } }).join('\n');
  assert.match(out, /BUY WDC[^\n]*check ZAD first/);
  for (const s of ['NOTH', 'LOTT', 'OFFR', 'HELD', 'LATE']) assert.doesNotMatch(out, new RegExp('BUY ' + s));
});

test('tier2 off -> nothing; PROVEN still shown; its own ledger negative (20+ finished) -> off', async () => {
  let S = await loadScan({ files: { ...files({ 'CHAIN-MOM1': 'TRADABLE SMALL' }), 'data/settings.json': { tier2: false } } });
  assert.deepEqual(S.fn('chainLines')(sig, {}), []);
  S = await loadScan({ files: { ...files({ 'CHAIN-MOM1': 'PROVEN' }), 'data/settings.json': { tier2: false } } });
  assert.match(S.fn('chainLines')(sig, {}).join('\n'), /^CHAIN \(PROVEN/);
  const L = Array.from({ length: 20 }, (_, i) => ({ d: '2026-08-01', sym: 'S' + i, kind: 'chain:CHAIN-MOM1', px: 10, out: '2026-09-01', px1: 9, pct: -0.108 }));
  S = await loadScan({ files: files({ 'CHAIN-MOM1': 'TRADABLE SMALL' }, { 'data/tier2-ledger.jsonl': L }) });
  assert.deepEqual(S.fn('chainLines')(sig, {}), []);
});

test('the  chains  command: hot and cold layers now and every decoder verdict', async () => {
  const S = await loadScan({ files: files({}) });
  const t = S.fn('chainsText')();
  assert.match(t, /HOT NOW/); assert.match(t, /AI build-out > Memory and storage \(HBM\): \+31\.0% vs the S&P 500/);
  assert.match(t, /Shipping > Tankers: -12\.0%/);
  assert.match(t, /CHAIN-LAG1[^\n]*NO REPEATING ORDER FOUND/);
  assert.match(t, /INFORMATION ONLY/);
});

test('check SYM: the stock\'s chain(s) and layer from the point-in-time graph', async () => {
  const S = await loadScan({ files: files({}) });
  assert.match(S.fn('chainGraphLine')('MU'), /AI build-out, layer 4 of 11: Memory and storage \(HBM\).*Semiconductor cycle, layer 3 of 4: Memory/);
  assert.equal(S.fn('chainGraphLine')('ZZZZ'), null);
});

test('the  chains  command is routed by the bot', async () => {
  let sent = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
    let out = { ok: true, result: true }; if (/\/getUpdates/.test(req.url)) out = { ok: true, result: [{ update_id: 1, message: { message_id: 1, chat: { id: 42 }, text: 'chains' } }] }; else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ files: files({}), env: { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: B, TD_BASE: B, FH_BASE: B } });
  await S.fn('tgCommands')(null); server.close();
  assert.match(sent.join('\n'), /CHAINS \(/);
});

test('no network was used', () => { assert.deepEqual(blocked, []); });
