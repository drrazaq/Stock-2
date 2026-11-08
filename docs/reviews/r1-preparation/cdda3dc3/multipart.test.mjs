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
const ROOT=process.env.REVIEW_TREE;const {loadScan,blocked}=await import(pathToFileURL(ROOT+'/test/load-scan.mjs'));

const T = Date.parse('2026-11-05T14:40:00Z');   // Thu 9:40 am New York
const SESSION_SRC = fs.readFileSync(ROOT+'/market-session.mjs', 'utf8');
// quotes: SYM -> { c, ageSec } | { c, t } ; advance: SYM -> ms added to the clock once that symbol is fetched (a slow fetch loop)
async function run(t, { pos = {}, sig = {}, quotes, advance = {}, state, sendDelay=0, retryDelay=0, extraFiles={}, partDelay=0, remainderRetry=0 }) {
  const sent = [], transmissions=[]; let clock = T, retried=false, delayedPart=false, firstBuySeen=false;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const text=JSON.parse(b).text, limited=!retried && ((retryDelay && /^Market hours check/.test(text)) || (remainderRetry && firstBuySeen && /Now: 105\.00/.test(text)));transmissions.push({at:clock,text,status:limited?429:200});if(limited){retried=true;clock+=(remainderRetry || retryDelay);res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:1}}));}sent.push(text);if(/^BUY NOW/.test(text))firstBuySeen=true;if(/FIRST MARKET-HOURS CHECK/.test(text))clock+=sendDelay;if(partDelay && /^BUY NOW/.test(text) && !delayedPart){delayedPart=true;clock+=partDelay;}return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}})); }
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



const SIG_BUY={pead:[{sym:'ZZE',live:true,buyLo:100,buyHi:110,stop:90,hold:10,sma20:90,sur:0.2,up:0.1,test:{n:40,avg:0.02,win:0.6}}]};
const EXTRA={'data/earnings-study.json':{verdict:'PROMISING'},'data/halal.json':{ZZE:{s:'ok'}}};

test('multipart BUY NOW rechecks the quote before later price-bearing parts',async t=>{
 const sig=structuredClone(SIG_BUY);sig.pead=Array.from({length:4},(_,i)=>({...sig.pead[0],test:{...sig.pead[0].test,n:40+i}}));
 const r=await run(t,{sig,quotes:{ZZE:{c:105,ageSec:1190}},extraFiles:EXTRA,partDelay:30000});
 const first=r.transmissions.find(x=>/^BUY NOW/.test(x.text));assert.ok(first,'fixture must dispatch the first card part');assert.ok(first.text.length<=3800);assert.equal(r.finalClock,T+30000,'delay must be after the first card network attempt');
 assert.ok(r.transmissions.some(x=>x.at>=T+30000),'fixture must exercise a later card part');const late=r.transmissions.filter(x=>x.at>=T+30000 && /Now: 105\.00|OK to buy|BUY [0-9]|Buy 100\.00|inside its buy range/.test(x.text));
 console.log(JSON.stringify({case:'multipart_buy',firstPartLength:first.text.length,lateMessages:r.transmissions.filter(x=>x.at>=T+30000),state:r.state},null,2));
 assert.equal(late.length,0,'later card part uses static shown text without rechecking source age1220s');
});
test('retry of a later BUY NOW part rechecks its quote',async t=>{
 const sig=structuredClone(SIG_BUY);sig.pead=Array.from({length:4},(_,i)=>({...sig.pead[0],test:{...sig.pead[0].test,n:40+i}}));
 const r=await run(t,{sig,quotes:{ZZE:{c:105,ageSec:1190}},extraFiles:EXTRA,remainderRetry:30000});assert.equal(r.finalClock,T+30000);assert.ok(r.transmissions.some(x=>x.status===429),'must exercise actual later-part retry');
 console.log(JSON.stringify({case:'multipart_buy_retry',attempts:r.transmissions.filter(x=>x.status===429||x.at>=T+30000)},null,2));
 assert.ok(!r.transmissions.some(x=>x.status===200&&x.at>=T+30000&&/Now: 105\.00|OK to buy/.test(x.text)),'later-part retry must not bypass quote eligibility');
});
test('timely multipart card preserves its eligible remainder',async t=>{
 const sig=structuredClone(SIG_BUY);sig.pead=Array.from({length:4},(_,i)=>({...sig.pead[0],test:{...sig.pead[0].test,n:40+i}}));
 const r=await run(t,{sig,quotes:{ZZE:{c:105,ageSec:10}},extraFiles:EXTRA,partDelay:30000});assert.equal(r.finalClock,T+30000);assert.ok(r.transmissions.some(x=>x.at>=T+30000&&/Now: 105\.00/.test(x.text)),'timely remaining price must still reach its actual later dispatch');
});
test('loopback only',()=>assert.deepEqual(blocked,[]));
