// Synthetic actual-caller regression only; not evidence of market performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan,blocked} from './load-scan.mjs';
const originalNow=Date.now;
async function fixture(t,P,files={},sig={session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},opts={}){
 const days=[];let ms=Date.parse((opts.end||'2026-11-09')+'T12:00:00Z');while(days.length<300){const d=new Date(ms);if(![0,6].includes(d.getUTCDay()))days.push(d.toISOString().slice(0,10));ms-=864e5;}
 const values=days.reverse().map((datetime,i)=>({datetime,open:String(30-i*.05),high:String(30.2-i*.05),low:String(29.8-i*.05),close:String(30-i*.05),volume:'1000000'}));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.includes('/time_series')?{values}:{values:[],splits:[]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());Date.now=()=>Date.parse('2026-11-10T13:00:00Z');t.after(()=>{Date.now=originalNow;});
 const base='http://127.0.0.1:'+server.address().port,S=await loadScan({files,env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base}}),evidence={};
 const text=await S.fn('reviewReply')('ZZA',sig,{ZZA:P},evidence);
 return {S,text,evidence};
}
const dip={entry:20,src:'leader dip',kind:'leader dip',since:'2026-11-06',boughtSession:'2026-11-06',target:24,ldHold:126};
test('Leader Dip review preserves its target/time/no-stop policy despite weak trend',async t=>{
 const f=await fixture(t,dip);assert.match(f.text,/→ HOLD/);assert.doesNotMatch(f.text,/→ SELL|Stop to use:|To set this stop:/);assert.match(f.text,/No stop by design/);assert.match(f.text,/24\.00/);assert.equal(f.evidence.disposition.status,'HOLD');
});
test('recognized system holding cannot inherit generic trend SELL',async t=>{
 const f=await fixture(t,{entry:20,kind:'quick',q:'gap',stop:10,since:'2026-11-06'});assert.match(f.text,/→ HOLD/);assert.doesNotMatch(f.text,/→ SELL/);
});
test('TRY SMALL review preserves original fixed stop and time exit',async t=>{
 const f=await fixture(t,{entry:20,src:'try small',kind:'manual',stop:10,tryHold:63,since:'2026-11-06'});assert.match(f.text,/→ HOLD/);assert.match(f.text,/63 sessions/);assert.match(f.text,/10\.00/);assert.doesNotMatch(f.text,/2 daily moves|To set this stop:/);
});
test('Leader Dip target and time exits remain operative',async t=>{
 for(const P of [{...dip,target:14},{...dip,ldHold:2}]){const f=await fixture(t,P);assert.match(f.text,/→ SELL/);assert.match(f.text,/TARGET \+20% REACHED|TIME EXIT/);assert.equal(f.evidence.disposition.status,'SELL');}
});
test('Leader Dip hard ZAD fail and F6 SELL remain above lane HOLD',async t=>{
 for(const files of [{'data/halal.json':{ZZA:{s:'fail',d:'2026-11-10',by:'synthetic'}}},{'data/squad29-flags-today.json':{flags:[{sym:'ZZA',verdict:'SELL-WARNING',flag:'F6',filed:'2026-11-09',items:'3.01',url:'https://example.invalid/synthetic'}]}}]){
 const f=await fixture(t,dip,files);assert.match(f.text,/→ SELL/);assert.match(f.text,/NOT HALAL|listing-standard notice/);assert.equal(f.evidence.disposition.status,'SELL');}
});
test('non-system holding retains its general trend assessment',async t=>{
 const f=await fixture(t,{entry:20,kind:'manual',since:'2026-11-06'});assert.match(f.text,/→ SELL/);assert.match(f.text,/trend is broken/);assert.match(f.text,/Stop to use:/);assert.equal(blocked.length,0);
});

test('recorded prior exit is not cancelled by a later lane HOLD',async t=>{
 const f=await fixture(t,dip,{}, {session:'2026-11-06',generatedAt:'2026-11-06T23:00:00Z',posVerdict:{ZZA:'existing instruction'}});assert.match(f.text,/→ ASSESSMENT UNKNOWN/);assert.match(f.text,/RECORDED PRIOR EXIT/);assert.equal(f.evidence.disposition.status,'UNVERIFIED');
});
test('TRY SMALL recorded time exit is explicit and unchanged',async t=>{
 const f=await fixture(t,{entry:20,src:'try small',kind:'manual',stop:10,tryHold:2,since:'2026-11-06'});assert.match(f.text,/TRY SMALL TIME EXIT/);assert.equal(f.evidence.disposition.status,'SELL');
});

test('independent ZAD SELL survives stale closes and prior-exit reconciliation',async t=>{
 const files={'data/halal.json':{ZZA:{s:'fail',d:'2026-11-10',by:'synthetic'}}};
 for(const spec of [{sig:{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},end:'2026-11-06'},{sig:{session:'2026-11-06',generatedAt:'2026-11-06T23:00:00Z',posVerdict:{ZZA:'prior exit'}},end:'2026-11-09'}]){
 const f=await fixture(t,dip,files,spec.sig,{end:spec.end});assert.match(f.text,/→ SELL/);assert.match(f.text,/NOT HALAL/);if(spec.sig.posVerdict)assert.match(f.text,/RECORDED PRIOR EXIT/);assert.equal(f.evidence.disposition.status,'SELL');assert.equal(f.evidence.disposition.currentEvidence(Date.now()),true);assert.equal(f.evidence.disposition.currentEvidence(Date.now()+300000),false);}
});
test('LONGER HOLDS preserves recorded stop with untested disclosure instead of generic SELL',async t=>{
 const f=await fixture(t,{entry:20,src:'longer hold',kind:'manual',stop:10,since:'2026-11-06'});assert.match(f.text,/→ HOLD/);assert.match(f.text,/untested for this lane/);assert.match(f.text,/six-month review/);assert.doesNotMatch(f.text,/Stop to use:|2 daily moves|To set this stop:/);
});
