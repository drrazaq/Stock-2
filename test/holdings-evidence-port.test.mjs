// Exact approved-scanner successor: synthetic holdings and loopback services only.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';
import '../tests/instrument-type.test.mjs';
import {loadScan,blocked} from './load-scan.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ORIGINAL_NOW=Date.now;
function dailyValues(end){
 const out=[];let ms=Date.parse(end+'T12:00:00Z');while(out.length<300){const d=new Date(ms);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)out.push(d.toISOString().slice(0,10));ms-=864e5;}
 return out.reverse().map((d,i)=>({datetime:d,open:String(10+i*.01),high:String(10.2+i*.01),low:String(9.8+i*.01),close:String(10+i*.01),volume:'1000000'}));
}
async function holdingsFixture(t,{end='2026-11-09',age=60000,dated=true,bars=300,deliveryMode='ack',afterSendAdvance=0,quotePrice={value:7}}={}){
 const clock={now:Date.parse('2026-11-10T15:00:00Z')},sent=[],requests=[];
 const server=http.createServer((req,res)=>{requests.push(req.url);let b='';req.on('data',x=>b+=x);req.on('end',()=>{
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/sendMessage')){sent.push(JSON.parse(b).text);clock.now+=afterSendAdvance;if(deliveryMode==='ambiguous'||deliveryMode==='stopAmbiguous'&&sent.at(-1).startsWith('YOUR STOPS')){res.destroy();return;}if(deliveryMode==='stop429'&&sent.at(-1).startsWith('YOUR STOPS')&&sent.filter(x=>x.startsWith('YOUR STOPS')).length===1){clock.now+=5*60000;res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}if(deliveryMode==='429'&&sent.length===1){res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}}));}
  if(req.url.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[]}));
  if(req.url.includes('/time_series'))return res.end(JSON.stringify({values:dailyValues(end).slice(-bars)}));
  if(req.url.includes('/quote?'))return res.end(JSON.stringify({c:quotePrice.value,...(dated?{t:(clock.now-age)/1000}:{})}));
  if(req.url.includes('/stock/split'))return res.end('[]');
  res.end(JSON.stringify({values:[],splits:[],earningsCalendar:[]}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,old=Date.now;Date.now=()=>clock.now;t.after(()=>{Date.now=ORIGINAL_NOW;process.chdir(root);});
 const S=await loadScan({files:{'data/settings.json':{focus:false},'data/signals.json':{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},'data/my-positions.json':{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}},env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base,FINNHUB_KEY:'synthetic',TG_BASE:base,TG_TOKEN:'synthetic',TG_CHAT:'synthetic'}});
 return {S,clock,sent,requests,sig:{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},pos:{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}};
}
test('actual holdings caller does not turn stale or undated quotes into stop-reached facts',async t=>{
 for(const spec of [{age:3600000},{dated:false}]){
  const f=await holdingsFixture(t,spec);f.pos.ZZA.stop=20;f.S.write('data/my-positions.json',f.pos);const before=f.S.read('data/my-positions.json'),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
  assert.match(text,/close-based 2026-11-09/);assert.match(text,/current stop UNKNOWN/);assert.doesNotMatch(text,/the stop 20.00 is reached|SELL ALL\. the stop/);assert.equal(f.S.read('data/my-positions.json'),before);
 }
});

test('actual stale-close caller preserves original position and recorded exit instead of minting a current HOLD',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06',age:3600000});f.pos.ZZA.exitFlag={d:'2026-11-06',why:'existing close-based exit'};f.pos.ZZA.lastAct={act:'SELL ALL',d:'2026-11-06',since:'2026-11-06'};const before=JSON.stringify(f.pos);
 const text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(text,/ASSESSMENT UNKNOWN/);assert.match(text,/RECORDED CLOSE-BASED EXIT dated 2026-11-06/);assert.match(text,/existing instruction is not cancelled/);assert.equal(JSON.stringify(f.pos),before);assert.doesNotMatch(text,/ZZA[^\n]*: HOLD,/);
});

test('actual fresh stop, send-time expiry and private-body logging boundaries preserve the adopted thresholds',async t=>{
 const f=await holdingsFixture(t),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(text,/the stop 8.00 is reached/);assert.match(text,/do not sell twice/);
 const before=f.S.read('data/my-positions.json');f.clock.now+=6*60000;const r=await f.S.fn('telegram')(text+'\nSYNTHETIC footer');
 assert.equal(r.ok,false);assert.equal(r.reason,'PRICE_EVIDENCE_EXPIRED');assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});

test('actual review and holdings keep a fresh stop fact even when the daily assessment is stale',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06'}),review=await f.S.fn('reviewReply')('ZZA',f.sig,f.pos),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(review,/STOP LEVEL REACHED/);assert.doesNotMatch(review.split('\n')[0],/as of .* close/);assert.match(review,/do not sell again/);assert.match(text,/the stop 8.00 is reached/);assert.doesNotMatch(text,/ZZA[^\n]*: HOLD,/);
});


test('actual when-to-sell caller separates stale quote, dated exit and current stop; send expiry is checked',async t=>{
 for(const spec of [{age:3600000},{dated:false}]){
  const f=await holdingsFixture(t,spec),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);
  assert.match(text,/HOLD context as of 2026-11-09 close only/);assert.match(text,/Current stop observation: UNKNOWN/);assert.doesNotMatch(text,/SELL NOW:|stop 8.00 is reached/);
 }
 const f=await holdingsFixture(t),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);assert.match(text,/do not sell again/);assert.match(text,/observed/);
 const before=f.S.read('data/my-positions.json');f.clock.now+=6*60000;const r=await f.S.fn('telegram')(text);assert.equal(r.ok,false);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});

test('actual when-to-sell preserves old exits without stale HOLD or fresh-level calculations',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06',age:3600000});f.sig.session='2026-11-06';f.sig.posVerdict={ZZA:'existing close-based exit'};
 const before=JSON.stringify(f.pos),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);
 assert.match(text,/RECORDED PRIOR EXIT, source session 2026-11-06/);assert.match(text,/does not cancel it or establish a current HOLD/);assert.match(text,/Daily level\/time-exit calculation UNKNOWN or stale/);assert.doesNotMatch(text,/Not yet\. HOLD|IN ONE LINE:/);assert.equal(JSON.stringify(f.pos),before);
});

test('actual scanner sender rechecks holding evidence at retry/multipart boundaries and never replays ambiguous delivery',async t=>{
 for(const deliveryMode of ['429','ack','ambiguous']){
  const f=await holdingsFixture(t,{deliveryMode,afterSendAdvance:6*60000}),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
  const before=f.S.read('data/my-positions.json'),r=await f.S.fn('telegram')(deliveryMode==='ack'?text+'\n'+'SYNTHETIC '.repeat(900):text);
  assert.equal(r.ok,false);assert.equal(f.sent.length,1);assert.equal(r.reason,deliveryMode==='ambiguous'?'NETWORK_ERROR':'PRICE_EVIDENCE_EXPIRED');assert.equal(f.S.read('data/my-positions.json'),before);
 }
});

test('bounded evidence registry never evicts the guard from a previously rendered report',async t=>{
 const f=await holdingsFixture(t),remember=f.S.fn('rememberHoldingEvidence'),check=f.S.fn('holdingSendEvidence');
 const first=remember('SYNTHETIC GUARDED 0',[n=>n<100]);for(let i=1;i<64;i++)remember('SYNTHETIC GUARDED '+i,[()=>true]);
 assert.match(remember('SYNTHETIC GUARDED overflow',[()=>true]),/ASSESSMENT UNAVAILABLE/);assert.equal(check(first,101),false);assert.equal(check(first,99),true);
});



test('actual sell-check uses structured stop evidence rather than its displayed prior close',async t=>{
 const f=await holdingsFixture(t,{age:3600000});f.pos.ZZA.stop=20;f.S.write('data/my-positions.json',f.pos);const text=await f.S.fn('sellCheckText')(f.sig);
 assert.doesNotMatch(text,/TESTED:.*at or under your stop|TESTED:.*stop 20.00 is reached/);assert.match(text,/current stop UNKNOWN/);
 const old=await holdingsFixture(t,{end:'2026-11-06',age:3600000}),unknown=await old.S.fn('sellCheckText')(old.sig);assert.match(unknown,/ASSESSMENT UNKNOWN/);
});

test('actual legacy plan and conclusion callers never treat numeric prices as timestamped holding evidence',async t=>{
 const f=await holdingsFixture(t),stale={...f.sig,session:'2026-11-06',stocks:[],quick:[],leaders:[]},current={...f.sig,stocks:[{sym:'ZZA',last:7,state:'No action'}],quick:[],leaders:[]};
 for(const name of ['planText','conclusion','conclusionLive']){
  const x=f.S.fn(name)(stale,f.pos,{ZZA:7});const text=Array.isArray(x)?x.join('\n'):x;
  assert.match(text,/ZZA: ASSESSMENT UNKNOWN/);assert.doesNotMatch(text,/ZZA: SELL NOW|ZZA \(yours\): HOLD/);
  const y=f.S.fn(name)(current,f.pos,{ZZA:7}),dated=Array.isArray(y)?y.join('\n'):y;assert.match(dated,/saved scan session 2026-11-09 is current, but this interface has no dated stock-specific assessment/);assert.match(dated,/no current HOLD inferred/);assert.match(dated,/current stop\/target observation UNKNOWN/);
 }
});

test('actual rebalancing refuses stale or undated scan basis without record mutation',async t=>{
 const f=await holdingsFixture(t),before=f.S.read('data/my-positions.json');
 for(const sig of [{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z'}, {session:'2026-11-09'}, {session:'2026-11-09',generatedAt:'2026-11-09T13:00:00Z'}]){
  assert.match(f.S.fn('rebalanceText')(sig),/REBALANCE ASSESSMENT UNKNOWN/);assert.equal(f.S.read('data/my-positions.json'),before);
 }
});

test('saved-close identity requires dated generation after that source session actually completed',async t=>{
 const f=await holdingsFixture(t),current=f.S.fn('scanCloseCurrent');assert.equal(current(f.sig),true);
 for(const generatedAt of [undefined,'2026-11-09T23:00:00','2026-11-09T13:00:00Z','2026-11-11T00:00:00Z'])assert.equal(current({...f.sig,generatedAt}),false);
});



test('actual scanner sender classifies an evidence-check exception as local unsent, never transport uncertainty',async t=>{
 const f=await holdingsFixture(t),before=f.S.read('data/my-positions.json'),r=await f.S.fn('telegram')('SYNTHETIC LOCAL GUARD',null,()=>{throw Error('synthetic guard failure');});
 assert.equal(r.ok,false);assert.equal(r.reason,'PRICE_EVIDENCE_EXPIRED');assert.equal(r.localEvidenceRefusal,true);assert.equal(r.definitelyUnsentPart,true);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});



test('actual rebalancing retains existing stop exclusion without claiming a saved-close live crossing',async t=>{
 const f=await holdingsFixture(t);process.env.PRIVATE_KEY='SYNTHETIC_TEST_ONLY_NOT_A_CREDENTIAL';f.S.fn('privWrite')({shares:{ZZA:100},buys:[],budget:5000});assert.equal(f.S.fn('privRead')().shares.ZZA,100);
 const before=f.S.read('data/my-positions.json'),text=f.S.fn('rebalanceText')({...f.sig,stocks:[{sym:'ZZA',last:7}]});
 assert.match(text,/DATED CLOSE \/ STOP RECONCILIATION: ZZA/);assert.match(text,/excluded from trim\/add calculations under the existing stop safeguard/);assert.doesNotMatch(text,/SELL FIRST|at or under your stop/);assert.equal(f.S.read('data/my-positions.json'),before);
});

test('actual plan and live conclusion preserve existing filing-exit rules while numeric stop claims remain unknown',async t=>{
 const f=await holdingsFixture(t);f.S.write('data/events-study.json',{fam:{X:{warn:true,name:'synthetic warning',drift:{newer:{avg:-.02,n:40,vs:-.03},older:{avg:-.02,vs:-.03}}}}});f.S.write('data/events-recent.json',{events:[{sym:'ZZA',f:'X',p:'2026-11-09T12:00:00Z'}]});
 const sig={...f.sig,stocks:[],quick:[],leaders:[]},plan=f.S.fn('planText')(sig,f.pos,{ZZA:7}),live=f.S.fn('conclusionLive')(sig,f.pos,{ZZA:7}).join('\n');
 for(const text of [plan,live]){assert.match(text,/synthetic warning/);assert.match(text,/Existing filing-based rule/);assert.doesNotMatch(text,/SELL NOW.*stop 8.00/);}
});



test('actual intraday stop fallback checks after earlier messages and at retry, preserving owner records and offsets',async t=>{
 for(const spec of [{afterSendAdvance:5*60000},{deliveryMode:'stop429'}]){
  const f=await holdingsFixture(t,spec);process.env.BOT_ONLY='';f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});f.S.write('data/tg-state.json',{offset:42});
  const before=f.S.read('data/my-positions.json');await f.S.fn('intraday')(false);
  const stops=f.sent.filter(x=>x.startsWith('YOUR STOPS'));assert.equal(stops.length,spec.deliveryMode==='stop429'?1:0);
  const state=f.S.readJson('data/alert-state.json');assert.equal(state.sent.ZZAmyst,undefined);assert.equal(state.delivery?.ZZAmyst,undefined,'local refusal before any stop-part ACK remains eligible, not falsely UNKNOWN');
  assert.equal(f.S.read('data/my-positions.json'),before);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
 }
});

test('actual intraday stop fallback keeps ambiguous delivery UNKNOWN without replay or owner-record edits',async t=>{
 const f=await holdingsFixture(t,{deliveryMode:'stopAmbiguous'});process.env.BOT_ONLY='';f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});f.S.write('data/tg-state.json',{offset:42});
 const before=f.S.read('data/my-positions.json');await f.S.fn('intraday')(false);
 assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,1);const state=f.S.readJson('data/alert-state.json');assert.equal(state.sent.ZZAmyst,'UNKNOWN','legacy reader suppresses replay; this flag is not an ACK');assert.equal(state.delivery.ZZAmyst.status,'UNKNOWN');assert.equal(f.S.read('data/my-positions.json'),before);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
});



test('actual short-history callers preserve own trade rules and independent current-stop evidence',async t=>{
 const f=await holdingsFixture(t,{bars:5}),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC SHORT HISTORY',false);
 assert.match(text,/the stop 8.00 is reached/);assert.match(text,/do not sell twice/);
 const old=await holdingsFixture(t,{end:'2026-11-06',age:3600000,bars:5});old.pos.ZZA.exitFlag={d:'2026-11-06',why:'TIME EXIT: SELL at the next open.'};const before=JSON.stringify(old.pos),raw=await old.S.fn('holdingsText')(old.sig,old.pos,null,true);
 assert.match(raw.acts.sell.join('\n'),/RECORDED CLOSE-BASED EXIT dated 2026-11-06: TIME EXIT/);assert.match(raw.acts.unknown.join('\n'),/ASSESSMENT UNKNOWN/);assert.equal(JSON.stringify(old.pos),before);
});



test('actual position save preserves byte-identical no-op input and refuses corrupt original state',async t=>{
 const f=await holdingsFixture(t),raw='{ \n "ZZA" : {"stop":8, "entry":10,"since":"2026-11-06","q":"gap","kind":"quick"}\n}\n';
 f.S.write('data/my-positions.json',raw);const candidate={ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}};
 f.S.fn('savePos')(candidate);assert.equal(f.S.read('data/my-positions.json'),raw);
 f.S.write('data/my-positions.json','{SYNTHETIC BROKEN ORIGINAL');assert.throws(()=>f.S.fn('savePos')(candidate),/POSITION_STATE_UNREADABLE/);assert.equal(f.S.read('data/my-positions.json'),'{SYNTHETIC BROKEN ORIGINAL');
});



test('actual Telegram caller refuses corrupt positions before polling or advancing offsets',async t=>{
 const f=await holdingsFixture(t),raw='{SYNTHETIC BROKEN ORIGINAL';f.S.write('data/my-positions.json',raw);f.S.write('data/tg-state.json',{offset:42});
 await assert.rejects(f.S.fn('tgCommands')(f.sig),/POSITION_STATE_UNREADABLE/);
 assert.equal(f.requests.length,0);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),raw);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
});



test('all actual caller requests stayed on loopback',()=>assert.deepEqual(blocked,[]));

test('actual holdings and review do not replace an old recorded exit with a fresh above-stop HOLD',async t=>{
 const f=await holdingsFixture(t,{age:3600000});f.sig.session='2026-11-06';f.sig.posVerdict={ZZA:'existing close-based exit'};
 const old=JSON.stringify(f.pos),review=await f.S.fn('reviewReply')('ZZA',f.sig,f.pos),holdings=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(review,/RECORDED PRIOR EXIT/);assert.doesNotMatch(review.split('\n')[0],/→ HOLD/);
 assert.match(holdings,/RECORDED PRIOR EXIT/);assert.match(holdings,/no replacement HOLD inferred/);assert.doesNotMatch(holdings,/ZZA[^\n]*: HOLD,/);assert.equal(JSON.stringify(f.pos),old);
});

test('actual ACTIONS output carries holding evidence into every send attempt',async t=>{
 const f=await holdingsFixture(t),text=await f.S.fn('actionsText')({...f.sig,stocks:[],quick:[],leaders:[]},f.pos,null,'SYNTHETIC ACTIONS');
 f.clock.now+=6*60000;const r=await f.S.fn('telegram')(text);assert.equal(r.reason,'PRICE_EVIDENCE_EXPIRED');assert.equal(f.sent.length,0);
});
test('corrupt stop-delivery quarantine is not reset to an empty state',async t=>{
 const f=await holdingsFixture(t);process.env.BOT_ONLY='';f.S.write('data/alert-state.json',{day:'2026-11-10',sent:{},delivery:[]});const before=f.S.read('data/alert-state.json');
 await assert.rejects(f.S.fn('intraday')(false),/STOP_DELIVERY_STATE_UNREADABLE/);assert.equal(f.S.read('data/alert-state.json'),before);
});

test('B1 actual next-day caller allows a new stop evaluation after yesterday UNKNOWN; same-day remains once only',async t=>{
 const price={value:9},f=await holdingsFixture(t,{quotePrice:price});process.env.BOT_ONLY='';
 f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});
 f.S.write('data/alert-state.json',{day:'2026-11-09',sent:{ZZAmyst:'UNKNOWN'},delivery:{ZZAmyst:{status:'UNKNOWN',at:'2026-11-09T15:00:00Z'}}});
 const owner=f.S.read('data/my-positions.json');await f.S.fn('intraday')(false);
 assert.equal(f.S.readJson('data/alert-state.json').day,'2026-11-10');assert.equal(f.S.readJson('data/alert-state.json').delivery?.ZZAmyst,undefined);assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,0);
 price.value=7;f.clock.now+=60000;await f.S.fn('intraday')(false);assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,1);
 await f.S.fn('intraday')(false);assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,1);assert.equal(f.S.read('data/my-positions.json'),owner);
});
test('B1 actual same-day UNKNOWN is not cleared or replayed',async t=>{
 const f=await holdingsFixture(t);process.env.BOT_ONLY='';f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});
 f.S.write('data/alert-state.json',{day:'2026-11-10',sent:{ZZAmyst:'UNKNOWN'},delivery:{ZZAmyst:{status:'UNKNOWN',at:'2026-11-10T14:50:00Z'}}});
 await f.S.fn('intraday')(false);assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,0);assert.equal(f.S.readJson('data/alert-state.json').delivery.ZZAmyst.status,'UNKNOWN');
});
