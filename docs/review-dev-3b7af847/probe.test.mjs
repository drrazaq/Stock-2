// R1 rev15 (Codex 6724441072 / 6724603156, N1): the intraday alerts ("Market hours check") make a price claim only on evidence that was
// valid WHEN FETCHED and is still valid WHEN SENT, each route under its EXISTING rule:
//   holding (YOUR POSITION target lines): the holding rule of holdingAction()/quoteEvidence() (5 minutes);
//   plan (BUY NOW cards and the planned-entry review lines: QUICK, LEADER, signal range, breakout trigger, paper trades): the 20-minute
//   BUY NOW gate. Undated or future-dated prices never qualify. A held-back holding alert is reported once as NOT CONFIRMED.
// Synthetic only: the ACTUAL intraday() caller, invented tickers and prices, loopback services, no owner records or real messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';const ROOT=process.env.REVIEW_TREE||fileURLToPath(new URL('..',import.meta.url));const {loadScan,blocked}=await import(pathToFileURL(ROOT+'/test/load-scan.mjs'));

const T = Date.parse('2026-11-05T14:40:00Z');   // Thu 9:40 am New York
const SESSION_SRC = fs.readFileSync(ROOT+'/market-session.mjs', 'utf8');
// quotes: SYM -> { c, ageSec } | { c, t } ; advance: SYM -> ms added to the clock once that symbol is fetched (a slow fetch loop)
async function run(t, { pos = {}, sig = {}, quotes, advance = {}, state, sendDelay=0, retryDelay=0, partDelay=0, extraFiles={} }) {
  const sent = [], transmissions=[]; let clock = T, retried=false, delayedPart=false;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const text=JSON.parse(b).text, limited=retryDelay && /^Market hours check/.test(text) && !retried;transmissions.push({at:clock,text,status:limited?429:200});if(limited){retried=true;clock+=retryDelay;res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:1}}));}sent.push(text);if(/FIRST MARKET-HOURS CHECK/.test(text))clock+=sendDelay;if(partDelay && /^ENTRY REVIEW/.test(text) && !delayedPart){delayedPart=true;clock+=partDelay;}return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}})); }
    if (req.url.includes('/quote')) { const sym = new URL(req.url, 'http://x').searchParams.get('symbol'), q = quotes[sym];
      const body = !q ? { c: 0, t: 0 } : { c: q.c, t: 't' in q ? q.t : (clock - q.ageSec * 1000) / 1000 };
      if (advance[sym]) clock += advance[sym];
      return res.end(JSON.stringify(body)); }
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': pos, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [], ...sig }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC };
  if (state) files['data/alert-state.json'] = state;
  files['data/settings.json'] = { quiet: false };   // paper-trade lines are only sent outside quiet mode
  Object.assign(files,extraFiles);
  const S = await loadScan({ root:ROOT, files, env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const alerts = sent.find(x => /^Market hours check/.test(x)) || '';
  return { sent, transmissions, alerts, finalClock:clock, state: JSON.parse(S.read('data/alert-state.json') || '{}') };
}
const HOLD2 = { ZZT: { entry: 100, t2: 110, stop: 50 }, ZZU: { entry: 100, t2: 110, stop: 50 } };
test('P1: expiry during a 429 retry of a mixed message releases BOTH keys (current price + unverified warning); next run delivers both',async t=>{
 const r=await run(t,{pos:HOLD2,quotes:{ZZT:{c:115,ageSec:170}},retryDelay:20000});
 assert.ok(r.transmissions.some(x=>x.status===429),'429 exercised');
 assert.ok(!r.sent.some(x=>/^Market hours check/.test(x)),'nothing from the expired message delivered');
 assert.equal(r.state.delivery?.ZZTmyt2,undefined);assert.equal(r.state.delivery?.ZZUpriceUnknown,undefined,'warning key released, not quarantined');
 const n=await run(t,{pos:HOLD2,quotes:{ZZT:{c:115,ageSec:10}},state:r.state});
 assert.match(n.alerts,/TARGET 2 REACHED/);assert.match(n.alerts,/ZZU: YOUR POSITION: PRICE UNVERIFIED/);
});
test('P2: current alert stale before send is held back; the unverified warning still goes out in the same run',async t=>{
 const r=await run(t,{pos:HOLD2,quotes:{ZZT:{c:115,ageSec:175}},sendDelay:30000});
 assert.doesNotMatch(r.alerts,/ZZT at 115|TARGET 2 REACHED/);assert.match(r.alerts,/ZZU: YOUR POSITION: PRICE UNVERIFIED/);
 assert.equal(r.state.delivery?.ZZTmyt2,undefined);assert.equal(r.state.delivery.ZZUpriceUnknown.status,'ACK');
});
test('P3: exactly 180 s at send is still current (inclusive, same as the fetch gate); 181 s is not',async t=>{
 const a=await run(t,{pos:{ZZT:HOLD2.ZZT},quotes:{ZZT:{c:115,ageSec:150}},sendDelay:0,retryDelay:30000});assert.match(a.alerts,/TARGET 2 REACHED/);
 const b=await run(t,{pos:{ZZT:HOLD2.ZZT},quotes:{ZZT:{c:115,ageSec:151}},sendDelay:0,retryDelay:30000});assert.doesNotMatch(b.alerts,/TARGET 2 REACHED/);
});
test('loopback only',()=>assert.deepEqual(blocked,[]));
