// Independent review reproducers for cf63a04a (dev dependency port). Synthetic tickers, loopback only.
// Run: REVIEW_TREE=<worktree> node --test port-review.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL,fileURLToPath } from 'node:url';
const root = process.env.REVIEW_TREE || fileURLToPath(new URL('..',import.meta.url));
const { loadScan, blocked } = await import(pathToFileURL(root + '/test/load-scan.mjs'));
const T = Date.parse('2026-11-05T14:40:00Z');
const SIG = { session: '2026-11-04', stocks: [], quick: [], leaders: [] };
const SESSION_SRC = fs.readFileSync(root + '/market-session.mjs', 'utf8');

// Residual probes (not part of the fixed-vs-unfixed criterion). Clock advances by ADV ms when the quote for ZZB is served,
// standing in for real fetch latency / Twelve Data rate-limit sleeps between the stop fallback (judged at fetch) and the first check (judged later).
async function setup2(t, { pos, quotes, advSym, adv }) {
  const sent = []; let clock = T;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(b).text); return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } })); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      if (sym === advSym) clock += adv;
      if (!q) return res.end(JSON.stringify({ c: 0, t: 0 }));
      return res.end(JSON.stringify({ c: q.c, t: Math.floor((T - q.ageSec * 1000) / 1000) })); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const S = await loadScan({ root, files: { 'data/my-positions.json': pos, 'data/signals.json': SIG, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC },
    env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const runOnce = async () => { const real = Date.now; Date.now = () => clock; try { await S.fn('intraday')(false); } finally { Date.now = real; } };
  return { S, sent, runOnce };
}
const firstOf = (sent) => sent.filter(x => /FIRST MARKET-HOURS CHECK/.test(x));
test('R1 (desired): stop quote 4m50s old at fetch, 30 s passes before the first check -> the two messages must not disagree', async t => {
  const r = await setup2(t, { pos: { ZZS: { entry: 100, stop: 80 }, ZZB: { entry: 10, stop: 8 } }, quotes: { ZZS: { c: 70, ageSec: 290 }, ZZB: { c: 12, ageSec: 30 } }, advSym: 'ZZB', adv: 30000 });
  await r.runOnce();
  const first = firstOf(r.sent)[0] || '', stopMsg = r.sent.find(x => /^YOUR STOPS/.test(x)) || '';
  console.log('FIRST-CHECK ZZS LINE:', (first.match(/^ZZS:.*$/m) || [''])[0]);
  console.log('YOUR STOPS:', stopMsg.split('\n').slice(0, 3).join(' | '));
  const reached = /STOP LEVEL REACHED: ZZS/.test(stopMsg), firstUnknown = /^ZZS: STOP STATUS UNKNOWN/m.test(first);
  assert.ok(!(reached && firstUnknown), 'same run: YOUR STOPS says REACHED while the first check says STOP STATUS UNKNOWN');
});
test('R2 (desired): stale holding alert must not print a price ("ZZS at 0.00")', async t => {
  const r = await setup2(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 90, ageSec: 30 * 60 } } });
  await r.runOnce();
  const m = r.sent.find(x => /PRICE UNVERIFIED/.test(x)) || ''; console.log('ALERT:', m.split('\n').slice(0, 3).join(' | '));
  assert.doesNotMatch(m, /ZZS at \d/);
});
test('R3 (wording probe): 30-min stale under stop -> first check vs STOP CHECK UNKNOWN cite which limit?', async t => {
  const r = await setup2(t, { pos: { ZZS: { entry: 100, stop: 80 } }, quotes: { ZZS: { c: 70, ageSec: 1800 } } });
  await r.runOnce();
  const first = firstOf(r.sent)[0] || '', unk = r.sent.find(x => /STOP CHECK UNKNOWN/.test(x)) || '';
  console.log('FIRST:', (first.match(/^ZZS:.*$/m) || [''])[0].replace(/^.*Current price/, 'Current price'));
  console.log('STOPS:', (unk.match(/ZZS:.*$/m) || [''])[0]);
  assert.doesNotMatch(first, /limit 3 min/, 'a stop-status line explains itself with the 3-minute (not 5-minute stop) limit');
});
test('loopback only', () => assert.deepEqual(blocked, []));

test('current holding assessment cannot freeze a3-minute quote gate while later quotes are fetched',async t=>{
 const r=await setup2(t,{pos:{ZZS:{entry:100,stop:80},ZZB:{entry:10,stop:8}},quotes:{ZZS:{c:90,ageSec:170},ZZB:{c:12,ageSec:30}},advSym:'ZZB',adv:30000});await r.runOnce();const first=firstOf(r.sent)[0]||'';assert.match(first,/ZZS: PRICE STATUS UNKNOWN/);assert.doesNotMatch(first,/ZZS: HOLD|% from your 100/);
});
test('historical first-check observation remains dated; a queued stale stop is refused without ACK',async t=>{
 const r=await setup2(t,{pos:{ZZS:{entry:100,stop:80},ZZB:{entry:10,stop:8}},quotes:{ZZS:{c:70,ageSec:10},ZZB:{c:12,ageSec:30}},advSym:'ZZB',adv:600000});await r.runOnce();const first=firstOf(r.sent)[0]||'',stop=r.sent.find(x=>/^YOUR STOPS/.test(x))||'';assert.match(first,/old when checked at/);assert.match(first,/no current price/);assert.equal(stop,'','queued stale stop is never transmitted as a current stop claim');assert.equal(r.S.readJson('data/alert-state.json').sent.ZZSmyst,undefined);assert.equal(r.S.readJson('data/alert-state.json').delivery?.ZZSmyst,undefined,'locally unsent stop remains eligible, never falsely ACK or UNKNOWN');assert.doesNotMatch(first,/% from your 100/);
});
