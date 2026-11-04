// Synthetic public discovery records only; no provider access or strategy outcomes.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
const candidates=['AII','ARX','NTSK','GOOD','QUICK','FAIL','MISSING'].map(sym=>({sym}));
test('actual scanner records the 599/600 boundary, unavailable input and distinct enrollment without inventing rejection',async()=>{
 const scan=await loadScan({files:{'data/discovery.json':{generatedAt:'2026-11-04T10:00:00Z',session:'2026-11-03',candidates}}});
 const loaded={AII:{candles:Array(599)},ARX:{candles:[]},NTSK:{candles:Array(201)},GOOD:{candles:Array(600)},QUICK:{candles:Array(600)}};
 const r=scan.fn('discoveryCoverage')({candidates},['AII','ARX','NTSK','GOOD','QUICK','FAIL'],loaded,[{sym:'GOOD'}],[{sym:'QUICK'}],scan.value('DISCINPUT'));
 assert.deepEqual(r.candidates.map(x=>x.status),['INSUFFICIENT_HISTORY','INSUFFICIENT_HISTORY','INSUFFICIENT_HISTORY','ASSESSED','QUICK_ONLY','HISTORY_UNAVAILABLE','NOT_ENROLLED']);
 assert.equal(r.candidates[0].completedBars,599);assert.equal(r.candidates[3].completedBars,600);assert.ok(r.candidates.every(x=>x.rejectionInferred===false));
 assert.equal(r.input.sha256,crypto.createHash('sha256').update(scan.read('data/discovery.json')).digest('hex'));assert.equal(r.input.priceSession,'2026-11-03');assert.ok(Date.parse(r.input.readAt)>Date.parse(r.input.generatedAt));
 const text=scan.fn('checkOne')('AII',{session:'2026-11-03',stocks:[],discoveryCoverage:r});assert.match(text,/599\/600/);assert.match(text,/not a strategy rejection/);assert.doesNotMatch(text,/add it to watchlist|too new|under three/);
 assert.equal(blocked.length,0);
});
test('actual check caller distinguishes legacy unknown coverage from assessment and never invents a missing model result',async()=>{
 const scan=await loadScan();const text=scan.fn('checkOne')('AII',{session:'2026-11-03',stocks:[]});assert.match(text,/coverage UNKNOWN/);assert.match(text,/not a strategy rejection/);assert.doesNotMatch(text,/add it to watchlist|under three/);
 const assessed=scan.fn('checkOne')('GOOD',{session:'2026-11-03',stocks:[{sym:'GOOD',last:10,uptrend:false,mom6:0,rule:'synthetic',proven:false,state:'No action',why:'No cross'}]});assert.match(assessed,/did not pass its tests/);assert.doesNotMatch(assessed,/coverage UNKNOWN/);
});
test('real daily scanner persists short-history dispositions while omitting them from core models, without changing enrollment',async t=>{
 const asked=[];const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');asked.push(u.pathname);if(u.pathname!=='/time_series'){res.statusCode=404;return res.end('{}');}const sym=u.searchParams.get('symbol'),n=sym==='SPY'?650:sym==='AII'?599:sym==='ARX'?120:250;
 const values=Array.from({length:n},(_,i)=>({datetime:new Date(Date.UTC(2023,0,1)+i*864e5).toISOString().slice(0,10),open:'10',high:'11',low:'9',close:'10',volume:'1000000'}));res.end(JSON.stringify({values}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const scan=await loadScan({env:{TD_BASE:base,SEC_BASE:base,CT_BASE:base,NO_QUICK_EXTRA:'1',WIDE_N:'0',WIDE_ALL:'0',NO_CROWD:'1'},files:{'watchlist.txt':'SPY','data/discovery.json':{generatedAt:'2026-11-04T10:00:00Z',session:'2026-11-03',candidates:candidates.slice(0,3)},'data/channels.json':[]}});
 await scan.fn('daily')();const sig=scan.readJson('data/signals.json');assert.deepEqual(sig.discoveryCoverage.candidates.map(x=>[x.sym,x.status,x.completedBars]),[['AII','INSUFFICIENT_HISTORY',599],['ARX','INSUFFICIENT_HISTORY',120],['NTSK','INSUFFICIENT_HISTORY',250]]);assert.ok(sig.stocks.some(x=>x.sym==='SPY'),'600+ bar control remains model-assessed');assert.ok(!sig.stocks.some(x=>['AII','ARX','NTSK'].includes(x.sym)));assert.equal(asked.filter(x=>x==='/time_series').length,4);const reply=await scan.fn('checkLive')('AII');assert.match(reply,/599\/600 completed daily bars/);assert.match(reply,/not a strategy rejection/);assert.doesNotMatch(reply,/under three years|no rule can be tested/);assert.equal(blocked.length,0);
});

test('coverage metadata cannot make a malformed discovery row terminate the scanner',async()=>{const scan=await loadScan();const f=scan.fn('discoveryCoverage');const r=f({candidates:[null,{sym:'VALID'},{sym:42},{}]},['VALID'],{},[],[]);assert.equal(r.rejectedInputRows,3);assert.deepEqual(r.candidates.map(x=>x.sym),['VALID']);assert.equal(r.candidates[0].status,'HISTORY_UNAVAILABLE');assert.deepEqual(f({candidates:{}},[],{},[],[]).candidates,[]);assert.deepEqual(f(null,[],{},[],[]).candidates,[]);});

test('actual opportunities caller labels discovery price session separately from any executable quote',async()=>{const scan=await loadScan({files:{'data/discovery.json':{session:'2026-11-03',candidates:[{sym:'SYNTH',price:20,mom6:.5}]}}});const text=scan.fn('opportunitiesText')({stocks:[],quick:[],quickHeld:[]},true);assert.match(text,/2026-11-03 completed-close references, not live BBO/);assert.match(text,/SYNTH.*20/);assert.equal(blocked.length,0);});
