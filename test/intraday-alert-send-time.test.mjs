// R1 rev16 (Codex 6725294448 R1): price-bearing alerts are checked at EVERY network attempt (after earlier Telegram awaits and on a 429 retry).
// Adapted from Codex's reproducer docs/reviews/r1-preparation/09f58ca5/actual-send.test.mjs (cbc0d1662); only ROOT now points at this checkout.
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
const ROOT=new URL('..', import.meta.url).pathname.replace(/\/$/, '');const {loadScan,blocked}=await import(pathToFileURL(ROOT+'/test/load-scan.mjs'));

const T = Date.parse('2026-11-05T14:40:00Z');   // Thu 9:40 am New York
const SESSION_SRC = fs.readFileSync(ROOT+'/market-session.mjs', 'utf8');
// quotes: SYM -> { c, ageSec } | { c, t } ; advance: SYM -> ms added to the clock once that symbol is fetched (a slow fetch loop)
async function run(t, { pos = {}, sig = {}, quotes, advance = {}, state, sendDelay=0, retryDelay=0 }) {
  const sent = [], transmissions=[]; let clock = T, retried=false;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const text=JSON.parse(b).text, limited=retryDelay && /^Market hours check/.test(text) && !retried;transmissions.push({at:clock,text,status:limited?429:200});if(limited){retried=true;clock+=retryDelay;res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:1}}));}sent.push(text);if(/FIRST MARKET-HOURS CHECK/.test(text))clock+=sendDelay;return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}})); }
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
  const S = await loadScan({ root:ROOT, files, env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const alerts = sent.find(x => /^Market hours check/.test(x)) || '';
  return { sent, transmissions, alerts, finalClock:clock, state: JSON.parse(S.read('data/alert-state.json') || '{}') };
}
const HOLD = { ZZT: { entry: 100, t2: 110, stop: 50 } };


test('holding target is checked after earlier Telegram awaits, not only before the batch',async t=>{
 const r=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:290}},sendDelay:30000});
 console.log(JSON.stringify({case:'holding',messages:r.transmissions,state:r.state},null,2));assert.equal(r.finalClock,T+30000);assert.ok(r.transmissions.some(x=>/FIRST MARKET-HOURS CHECK/.test(x.text)&&x.at===T));
 assert.doesNotMatch(r.alerts,/TARGET 2 REACHED|ZZT at 115/, 'age320s after the first-check Telegram await: no current holding target');
 assert.equal(r.state.sent.ZZTmyt2,undefined,'an alert withheld at its actual send must remain eligible next run');
});
test('plan alert is checked after earlier Telegram awaits under the unchanged20min gate',async t=>{
 const r=await run(t,{sig:{openTrades:[{sym:'ZZP',since:'2026-11-01',stop:5,target:20}]},quotes:{ZZP:{c:21,ageSec:1190}},sendDelay:30000});
 console.log(JSON.stringify({case:'plan',messages:r.transmissions,state:r.state},null,2));assert.equal(r.finalClock,T+30000);assert.ok(r.transmissions.some(x=>/FIRST MARKET-HOURS CHECK/.test(x.text)&&x.at===T));
 assert.doesNotMatch(r.alerts,/ZZP at 21/,'age1220s after first-check Telegram await: no current paper-target claim');
 assert.equal(r.state.sent['ZZPtg2026-11-01'],undefined);
});
test('rate-limited retry rechecks the holding quote at the next network attempt',async t=>{
 const r=await run(t,{pos:HOLD,quotes:{ZZT:{c:115,ageSec:290}},retryDelay:20000});
 const attempts=r.transmissions.filter(x=>/^Market hours check/.test(x.text));console.log(JSON.stringify({case:'429_retry',attempts,state:r.state},null,2));
 assert.equal(r.finalClock,T+20000);assert.ok(attempts.some(x=>x.status===429),'fixture must exercise the real retry loop');
 assert.ok(!attempts.some(x=>x.at>T+10000 && x.status===200 && /ZZT at 115|TARGET 2 REACHED/.test(x.text)),'current target payload must not survive retry at source age310s');
});
test('loopback only',()=>assert.deepEqual(blocked,[]));
