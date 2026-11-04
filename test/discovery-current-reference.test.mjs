// Run the real discovery producer with only local synthetic transport and changed legacy marks.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
async function run(t,oldPrice){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discovery-reference-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'data'));
 const original=JSON.stringify({sym:'ZZAAA',d:'2025-01-02',price:oldPrice,spy:100,score:999})+'\n';fs.writeFileSync(path.join(dir,'data/discovery-journal.jsonl'),original);
 const requests=[];const server=http.createServer((q,r)=>{const u=new URL(q.url,'http://local');requests.push(u.pathname);
 if(u.pathname.startsWith('/v2/aggs/grouped/')){const d=u.pathname.split('/').pop(),c=10*Math.exp((Date.parse(d)-Date.parse('2026-01-01'))/864e5*.004);const results=Array.from({length:600},(_,i)=>({T:i===0?'ZZAAA':('Z'+String(i).padStart(4,'A')),c,v:1e6,o:c,h:c+1,l:c-1}));results.push({T:'SPY',c:100,v:1e6,o:100,h:101,l:99});return r.end(JSON.stringify({status:'OK',adjusted:true,resultsCount:601,results}));}
 if(u.pathname==='/files/company_tickers.json')return r.end(JSON.stringify({0:{ticker:'ZZAAA',cik_str:1,title:'Synthetic company'}}));r.statusCode=404;r.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const child=spawn(process.execPath,[path.join(root,'discover.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'SYNTHETIC',MASSIVE_BASE:base,SEC_BASE:base,CT_BASE:base,FH_BASE:base,FMP_BASE:base,TG_BASE:base,AV_BASE:base}});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);const exit=await new Promise(r=>child.on('close',r));assert.equal(exit,0,log);
 const journal=fs.readFileSync(path.join(dir,'data/discovery-journal.jsonl'),'utf8');assert.ok(journal.startsWith(original),'original historical bytes preserved');assert.equal(journal.split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.sym==='ZZAAA').length,1);
 return {doc:JSON.parse(fs.readFileSync(path.join(dir,'data/discovery.json'))),requests};
}
test('actual producer: old journal prices change only legacy marks, never current candidate selection/order/reference prices or requests',async t=>{
 const a=await run(t,1),b=await run(t,9999);assert.ok(a.doc.candidates.length>0);assert.deepEqual(a.doc.candidates,b.doc.candidates);assert.deepEqual(a.requests,b.requests);assert.notEqual(a.doc.record.avgReturn,b.doc.record.avgReturn);
 const row=a.doc.candidates.find(x=>x.sym==='ZZAAA');assert.ok(row);assert.notEqual(row.price,1);assert.equal(row.priceEvidence.session,a.doc.session);assert.equal(row.priceEvidence.executableQuote,false);assert.equal(a.doc.recordBasis.executionCostsIncluded,false);assert.equal(a.doc.recordBasis.journalPricesAffectSelection,false);
});
test('actual discovery presentation labels daily references and variable-age gross model marks without promising entry plans',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),start=html.indexOf('function renderDiscovery()'),end=html.indexOf('  const halalMarks = ctx().halal;',start);const nodes={disc:{},discBody:{replaceChildren(){}},discNote:{}};
 const c=vm.createContext({$:id=>nodes[id],state:{disc:{candidates:[],session:'2026-11-03',swept:600,strong:10,record:{avgReturn:.1,avgSpy:.05,n:5}}},store:{get:()=>true},Number});vm.runInContext(html.slice(start,end)+'};renderDiscovery();',c);assert.match(nodes.discNote.textContent,/2026-11-03/);assert.match(nodes.discNote.textContent,/not live quotes/);assert.match(nodes.discNote.textContent,/without execution costs/);assert.doesNotMatch(nodes.discNote.textContent,/each gets a buy range/);
});

test('actual browser pickPlan cannot present an older or undated cached model as a current discovery entry; matching-session control is preserved',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),start=html.indexOf('function pickPlan(sym)'),end=html.indexOf('function renderDiscovery()',start);
 for(const date of ['2026-11-02',undefined,'2026-11-03']){
 const raw={candles:[{d:date}],last:10},s0={...raw,learned:{proven:true,v:{mult:2,tp:0}},ind:{atr:[1]},v:{act:true}};
 const c=vm.createContext({state:{disc:{session:'2026-11-03'},loaded:{SYNTH:raw},errors:{}},study:()=>s0,money:x=>'$'+x,sellLevel:()=>8});vm.runInContext(html.slice(start,end)+';result=pickPlan("SYNTH");',c);
 if(date==='2026-11-03'){assert.equal(c.result.tier,0);assert.match(c.result.label,/Entry confirmed/);assert.equal(c.result.rows[0][1],'$10 to $10.5');}
 else{assert.equal(c.result.tier,4);assert.match(c.result.label,/session unresolved/);assert.ok(!c.result.rows.some(r=>/Buy range|Sell to/.test(r[0])));}
 }
});
