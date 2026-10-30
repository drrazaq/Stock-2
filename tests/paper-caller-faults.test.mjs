import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan} from '../test/load-scan.mjs';
const original={plans:{AAA:{entry:10,qty:1,stop:9,kind:'entry',since:'2026-10-01',maxHold:1}},pendingBuy:{},pendingExit:{},closed:[],start:{d:'2026-10-01',equity:10000}};
async function fixture(t,{positions={error:'provider unavailable'},positionStatus=200,account={equity:'10000'},book=original,closedStatus=200,orderBody=[],openBody=[],extraEnv={}}={}){
 const calls=[];const server=http.createServer((req,res)=>{calls.push({method:req.method,path:req.url});res.setHeader('content-type','application/json');if(req.url==='/v2/account')res.end(JSON.stringify(account));else if(req.url==='/v2/positions'){res.statusCode=positionStatus;res.end(JSON.stringify(positions));}else{res.statusCode=closedStatus;res.end(JSON.stringify(req.url.includes('nested=true')?orderBody:req.url.includes('status=open')?openBody:[]));}});
 t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',ALPACA_BASE:base,STOCK2_ENABLE_PAPER_ORDERS:'1',...extraEnv},files:{'data/alpaca-paper.json':book}});
 return {S,calls,run:(loaded={})=>S.fn('alpacaPaper')({stocks:[],quick:[],market:{}},loaded,'2026-10-29')};
}
test('position HTTP failure, malformed arrays and duplicate/invalid positions never mean empty account',async t=>{
 for(const opts of [{positionStatus:503},{positions:null},{positions:[null]},{positions:[{symbol:'AAA',qty:'NaN',avg_entry_price:'10'}]},{positions:[{symbol:'AAA',qty:'1',avg_entry_price:'10'},{symbol:'AAA',qty:'1',avg_entry_price:'10'}]}]){
  const f=await fixture(t,opts),before=f.S.read('data/alpaca-paper.json');await f.run();assert.equal(f.S.read('data/alpaca-paper.json'),before);assert.ok(f.calls.every(x=>x.method==='GET'));assert.equal(f.calls.length,2);
 }
});
test('corrupt local book and unusable/blocked account fail before orders or state writes',async t=>{
 for(const opts of [{book:'{bad'},{book:null},{book:{plans:[]}},{book:{plans:{AAA:null}}},{account:{equity:'NaN'}},{account:{equity:'10000',trading_blocked:true}}]){const f=await fixture(t,opts),before=f.S.read('data/alpaca-paper.json');await f.run();assert.equal(f.S.read('data/alpaca-paper.json'),before);assert.ok(f.calls.length<=1);}
});
test('missing closed-order evidence preserves a tracked position rather than deleting it',async t=>{
 const f=await fixture(t,{positions:[],closedStatus:503}),before=f.S.read('data/alpaca-paper.json');await f.run();assert.equal(f.S.read('data/alpaca-paper.json'),before);assert.ok(f.calls.some(x=>x.path.includes('status=closed')));assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('a genuinely empty valid account retains observation-only state updates without broker mutation',async t=>{
 const f=await fixture(t,{positions:[],book:{plans:{},pendingBuy:{},pendingExit:{},closed:[],start:null}});await f.run();assert.equal(f.S.readJson('data/alpaca-paper.json').equity.equity,10000);assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('absent position without a verified exit stays unresolved instead of vanishing from paper history',async t=>{
 const f=await fixture(t,{positions:[]});await f.run();const a=f.S.readJson('data/alpaca-paper.json');assert.ok(a.plans.AAA);assert.equal(a.plans.AAA.reconciliationStatus,'MISSING_OR_INVALID_EXIT_EVIDENCE');assert.equal(a.closed.length,0);assert.ok(f.calls.every(x=>x.method==='GET'));
});
test('open or unpriced filled buys remain pending; missing quantity never becomes an invented one-share fill',async t=>{
 for(const orderBody of [{status:'accepted'},{status:'filled',filled_avg_price:'10',filled_qty:'1',legs:[]},{status:'filled',filled_avg_price:'10',filled_qty:null}]){
  const book={plans:{},pendingBuy:{AAA:{id:'12345678-1234-1234-1234-123456789abc',d:'2026-10-28',plan:{kind:'entry'}}},pendingExit:{},closed:[]},f=await fixture(t,{positions:[],book,orderBody});await f.run();const a=f.S.readJson('data/alpaca-paper.json');assert.ok(a.pendingBuy.AAA);assert.equal(a.closed.length,0);assert.ok(f.calls.every(x=>x.method==='GET'));
 }
});
test('actual exit path stops after unconfirmed cancellation intent instead of proceeding to another order',async t=>{
 const id='12345678-1234-1234-1234-123456789abc',f=await fixture(t,{positions:[{symbol:'AAA',qty:'1',avg_entry_price:'10'}],openBody:[{id}],extraEnv:{PRIVATE_DATA_TOKEN:'synthetic-private-token',GITHUB_REPOSITORY:'drrazaq/Stock-2',GITHUB_REF_NAME:'Stock2-safety-fixes'}});
 const prior=globalThis.fetch;let journalReads=0;globalThis.fetch=async(u,o)=>{if(String(u).startsWith('https://api.github.com/repos/drrazaq/stock-2-private-data/contents/data/broker-intents/')){journalReads++;assert.equal(o.method,'GET');return new Response('{}',{status:503});}return prior(u,o);};
 const candles=Array.from({length:300},(_,i)=>({d:new Date(Date.parse('2026-01-01T00:00:00Z')+i*86400000).toISOString().slice(0,10),o:10,h:11,l:9,c:10,v:1000}));
 try{await f.run({AAA:{candles}});assert.ok(f.calls.some(x=>x.path.includes('status=open')));assert.equal(journalReads,1);assert.ok(f.calls.every(x=>x.method==='GET'));}finally{globalThis.fetch=prior;}
});
