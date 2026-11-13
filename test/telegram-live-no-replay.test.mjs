// Synthetic loopback only: exercise approved-scanner caller, not a replacement transport.
import { splitSignals } from './split-signals-fixture.mjs';
import fs from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
async function run(t,mode){
 let calls=0;const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
 calls++;if(mode==='network'||mode==='partial'&&calls===2){res.destroy();return;}
 res.setHeader('content-type','application/json');
 if(mode==='400'||mode==='503'){res.statusCode=+mode;res.end('refused');return;}
 if(mode==='invalid'){res.end('{}');return;}
 if(mode==='429'&&calls===1){res.statusCode=429;res.end(JSON.stringify({ok:false,parameters:{retry_after:1}}));return;}
 res.end(JSON.stringify({ok:true,result:{message_id:calls}}));
 });});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const S=await loadScan({env:{TG_TOKEN:'synthetic',TG_CHAT:'synthetic',TG_BASE:'http://127.0.0.1:'+server.address().port,TD_BASE:'http://127.0.0.1:'+server.address().port}});
 let renders=0;const sent=await S.fn('telegramLive')((now,acked)=>{renders++;if(mode==='partial')return acked.length===0?'first\n'+('x'.repeat(3800))+'\nsecond':acked.length===1?'second':null;return acked.length?null:'synthetic message';});
 return {calls,sent,renders};
}
test('actual telegramLive connection reset: one POST, UNKNOWN, zero acknowledged parts',async t=>{const r=await run(t,'network');assert.equal(r.calls,1);assert.equal(r.sent.length,0);assert.equal(r.sent.deliveryState,'UNKNOWN');});
test('actual refusal is not counted sent; 5xx and malformed200 remain UNKNOWN',async t=>{for(const mode of ['400','503','invalid']){const r=await run(t,mode);assert.equal(r.calls,1);assert.equal(r.sent.length,0);assert.equal(r.sent.deliveryState,mode==='400'?'REFUSED':'UNKNOWN');}});
test('actual partial delivery then lost reply: acknowledged prefix only, no replay',async t=>{const r=await run(t,'partial');assert.equal(r.calls,2);assert.equal(r.sent.length,1);assert.equal(r.sent.deliveryState,'UNKNOWN');});
test('explicit429 retry rerenders; only complete ACK counted',async t=>{const r=await run(t,'429');assert.equal(r.calls,2);assert.equal(r.sent.length,1);assert.ok(r.renders>=2);});
test('sell timing: threshold evidence is not equivalence or a15minute sell policy',async()=>{const S=await loadScan({files:{'data/timing-study.json':{buy:'EITHER',sell:'EITHER'}}});const x=S.fn('timingNote')();const sell=x.slice(x.indexOf('; sell'));assert.match(sell,/next regular-session open/);assert.match(sell,/did not meet the preference threshold/);assert.match(sell,/does not establish equivalence/);assert.doesNotMatch(sell,/after the first 15|tested: no difference/);});
test('all requests remained loopback',()=>assert.deepEqual(blocked,[]));

const T = Date.parse('2026-11-05T14:40:00Z');
const SESSION_SRC = fs.readFileSync(new URL('../market-session.mjs', import.meta.url), 'utf8');
const rec = (n) => ({ sym: 'ZZE', live: true, buyLo: 100, buyHi: 110, stop: 90, hold: 10, sma20: 90, sur: 0.2, up: 0.1, test: { n, avg: 0.02, win: 0.6 } });
const SIG = { pead: [rec(40), rec(41), rec(42), rec(43)] };
const EXTRA = { 'data/earnings-study.json': { verdict: 'PROMISING' }, 'data/halal.json': { ZZE: { s: 'ok' } } };
// afterFirstBuyPart: ms added to the clock once the first BUY NOW part is accepted; limitSecond: the next part first gets a 429
async function runIntraday(t, { ageSec, mode }) {
  const msgs = [], attemptedBuys=[]; let clock = T, buyParts = 0, limited = false; const afterFirstBuyPart=0,limitSecond=0;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const m = JSON.parse(b); if(/^BUY NOW: /.test(m.text)){attemptedBuys.push(m.text);if(mode==='network'){res.destroy();return;}if(mode==='400'){res.statusCode=400;return res.end(JSON.stringify({ok:false,description:'synthetic refusal'}));}}
      const inCard = buyParts > 0 && buyParts < 99, isBuy = /^BUY NOW/.test(m.text) || inCard;
      if (isBuy && buyParts === 1 && limitSecond && !limited) { limited = true; clock += limitSecond; res.statusCode = 429; return res.end(JSON.stringify({ ok: false, parameters: { retry_after: 1 } })); }
      msgs.push({ at: clock, text: m.text, buttons: !!m.reply_markup });
      if (/^BUY NOW: /.test(m.text)) { buyParts = 1; clock += afterFirstBuyPart; } else if (inCard) buyParts = 99;
      return res.end(JSON.stringify({ ok: true, result: { message_id: msgs.length } })); }
    if (req.url.includes('/quote')) return res.end(JSON.stringify({ c: 105, t: (clock - ageSec * 1000) / 1000 }));
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': {}, ...splitSignals({ session: '2026-11-04', stocks: [], quick: [], leaders: [], ...SIG }), 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC, 'data/settings.json': { quiet: false }, ...EXTRA };
  const S = await loadScan({ files, env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const i = msgs.findIndex(m => /^BUY NOW: /.test(m.text));
  return { attemptedBuys, card: i < 0 ? [] : msgs.slice(i), state: JSON.parse(S.read('data/alert-state.json') || '{}'), failures:S.read('data/tg-failures.jsonl') };
}


test('actual intraday BUY caller never replays connection-reset or refused card',async t=>{for(const mode of ['network','400']){const r=await runIntraday(t,{ageSec:10,mode});assert.equal(r.attemptedBuys.length,1);assert.equal(r.card.length,0);assert.match(r.failures,mode==='network'?/UNKNOWN/:/400/);}});
