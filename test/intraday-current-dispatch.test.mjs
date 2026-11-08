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
const HOLD = { ZZT: { entry: 100, t2: 110, stop: 50 } };



test('holding target expires after first-check await under development3minute rule and remains retryable',async t=>{
 const r=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:170}},sendDelay:30000});assert.equal(r.finalClock,T+30000);assert.doesNotMatch(r.alerts,/TARGET 2 REACHED|ZZT at 115/);assert.equal(r.state.sent.ZZTmyt2,undefined);assert.equal(r.state.delivery?.ZZTmyt2,undefined);
 const fresh=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:10}},state:r.state});assert.match(fresh.alerts,/TARGET 2 REACHED/);assert.equal(fresh.state.delivery.ZZTmyt2.status,'ACK');
});
test('explicit429 retry rechecks development3minute freshness and releases only the unsent intent',async t=>{
 const r=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:170}},retryDelay:20000});assert.equal(r.finalClock,T+20000);assert.ok(r.transmissions.some(x=>x.status===429));assert.doesNotMatch(r.alerts,/ZZT at 115|TARGET 2 REACHED/);assert.equal(r.state.sent.ZZTmyt2,undefined);assert.equal(r.state.delivery?.ZZTmyt2,undefined);
});
test('timely target is ACKed; the gate does not silently become5minutes',async t=>{
 const r=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:10}}});assert.match(r.alerts,/TARGET 2 REACHED/);assert.equal(r.state.delivery.ZZTmyt2.status,'ACK');const stale=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:240}}});assert.doesNotMatch(stale.alerts,/TARGET 2 REACHED|ZZT at 115/);
});
test('multipart ENTRY REVIEW expiry keeps partial delivery UNKNOWN and never blindly replays',async t=>{
 const sig={pead:Array.from({length:4},(_,i)=>({sym:'ZZE',live:true,buyLo:100,buyHi:110,stop:90,hold:10,sma20:90,sur:0.2,up:0.1,test:{n:40+i,avg:0.02,win:0.6}}))};const extraFiles={'data/earnings-study.json':{verdict:'PROMISING'},'data/halal.json':{ZZE:{s:'ok',d:'2026-11-01',by:'owner'}},'data/zad-list.json':{notHalal:[]}};
 const r=await run(t,{sig,quotes:{ZZE:{c:105,ageSec:170}},extraFiles,partDelay:30000});assert.equal(r.finalClock,T+30000);assert.ok(r.sent.some(x=>/^ENTRY REVIEW/.test(x)));assert.ok(!r.transmissions.some(x=>x.at>=T+30000&&/Now: 105\.00|OK to buy/.test(x.text)));assert.equal(r.state.sent.ZZEbuynow,undefined);assert.equal(r.state.delivery.ZZEbuynow.status,'UNKNOWN');
 const next=await run(t,{sig,quotes:{ZZE:{c:105,ageSec:10}},extraFiles,state:r.state});assert.ok(!next.sent.some(x=>/^ENTRY REVIEW/.test(x)),'partial UNKNOWN never becomes an automatic replay');assert.equal(next.state.delivery.ZZEbuynow.status,'UNKNOWN');
});
test('multipart first-check expiry preserves UNKNOWN rather than completing stale summary',async t=>{
 const pos={},quotes={};for(let i=0;i<40;i++){const sym='ZZ'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26);pos[sym]={entry:100,stop:50,t2:110};quotes[sym]={c:115,ageSec:170};}
 const r=await run(t,{pos,quotes,sendDelay:30000});assert.equal(r.finalClock,T+30000);assert.ok(r.sent.some(x=>/FIRST MARKET-HOURS CHECK/.test(x)));assert.ok(!r.transmissions.some(x=>x.at>=T+30000&&/Last price 115|TARGET 2 REACHED/.test(x.text)));assert.equal(r.state.delivery.__open.status,'UNKNOWN');assert.equal(r.state.sent.__open,undefined);
});
test('all requests stayed on loopback',()=>assert.deepEqual(blocked,[]));
