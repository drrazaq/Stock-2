// MARKET-03 batch 2 (Claude, 2 Nov 2026): the ACTUAL smart-money.mjs against local fake Finnhub / Massive / FMP answers.
// Thresholds are unchanged; these cases check what counts as evidence. No network, no credentials, no Telegram.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {latestCompletedSession,nextSession} from '../source-contract.mjs';
const root=path.resolve(import.meta.dirname,'..');
const day=ms=>new Date(ms).toISOString().slice(0,10),today=day(Date.now()),ago=n=>day(Date.now()-n*864e5);
const prevSession=d=>{let x=d;for(let i=0;i<10;i++){x=day(Date.parse(x+'T12:00:00Z')-864e5);if(nextSession(x,{inclusive:true})===x)return x;}return null;};
const L=latestCompletedSession(Date.now()),P1=prevSession(L),P2=prevSession(P1);
const SYMS=['AAA','BBB','DDD','EEE','FFF','GGG'],bar=T=>({T,c:20,v:1e6,o:19,h:21,l:19});
const buy=(name,usd,d=ago(3))=>({name,transactionCode:'P',change:1000,transactionPrice:usd/1000,transactionDate:d,filingDate:d});
const rec=(period,sb,b,h)=>({symbol:undefined,period,strongBuy:sb,buy:b,hold:h,sell:0,strongSell:0});
const m=(k)=>{const t=new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7)-1-k,1));return t.toISOString().slice(0,10);};
function routes({grouped}){return u=>{
 if(u.pathname.startsWith('/v2/aggs/grouped/')){const d=u.pathname.split('/').pop();return grouped(d);}
 if(u.pathname==='/stock/insider-transactions'){const s=u.searchParams.get('symbol');
  if(s==='AAA')return [200,{symbol:'AAA',data:[buy('smith  john',26000),buy('SMITH JOHN',26500)]}];                  // one person, two spellings, two real buys
  if(s==='BBB')return [200,{symbol:'BBB',data:[buy('Doe Jane',30000),buy('Doe Jane',30000),buy('Roe Rich',15000)]}];  // amended duplicate row
  if(s==='DDD')return [500,{error:'upstream'}];
  if(s==='EEE')return [200,{symbol:'XYZ',data:[buy('A One',60000),buy('B Two',60000)]}];                            // answers for another ticker
  if(s==='FFF')return [200,{symbol:'FFF',data:[buy('C Three',30000),buy('D Four',30000),buy('E Five',90000,ago(-3))]}]; // one future-dated row
  return [200,{symbol:s,data:[]}];}
 if(u.pathname==='/stock/recommendation'){const s=u.searchParams.get('symbol');
  if(s==='AAA')return [200,[rec(m(1),2,2,6),rec(m(0),4,3,3)]];      // oldest first: must be sorted before comparing
  if(s==='GGG')return [200,[rec(m(0),4,3,3),rec(m(2),2,2,6)]];      // a month is missing: not a month-on-month change
  return [200,[]];}
 if(u.pathname==='/stable/grades-latest-news')return [402,{error:'plan'}];
 return [200,{}];};}
async function fixture(t,opts){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sm-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const route=routes(opts),hits=[];const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');hits.push(u.pathname);const [st,body]=route(u);res.statusCode=st;res.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 await new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,'smart-money.mjs')],{cwd:dir,env:{PATH:process.env.PATH,FINNHUB_KEY:'fixture',FH_BASE:base,MASSIVE_KEY:'fixture',MASSIVE_BASE:base,FMP_KEY:'fixture',FMP_BASE:base,SM_MAX:'20'}});
  let out='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>out+=x);c.on('exit',code=>code===0?resolve(out):reject(Error('exit '+code+': '+out.slice(-1500))));});
 const doc=JSON.parse(fs.readFileSync(path.join(dir,'data/smart-money.json'),'utf8')),tips=fs.existsSync(path.join(dir,'data/tips.jsonl'))?fs.readFileSync(path.join(dir,'data/tips.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
 return {doc,tips,hits};
}

test('insider clusters: duplicates and spelling variants cannot inflate a cluster; failures and foreign answers are counted, not read as quiet', async t=>{
 const {doc,tips}=await fixture(t,{grouped:d=>d===L?[200,{status:'OK',results:[...SYMS.map(bar),{T:'BAD',c:'x',v:1}]}]:[200,{status:'OK',results:[]}]});
 assert.deepEqual(doc.insiders.map(x=>x.sym),['FFF'],'only the genuine two-buyer cluster qualifies');
 const S=doc.sourceStatus.FINNHUB_INSIDER;assert.equal(S.status,'PARTIAL');assert.equal(S.failed,1);assert.equal(S.identityMismatch,1);
 assert.equal(S.duplicateRows,1);assert.equal(S.malformedRows,1,'the future-dated row');
 assert.equal(doc.insiders[0].n,2);assert.equal(doc.insiders[0].usd,60000);
 assert.equal(doc.sourceStatus.GROUPED_PRICES.status,'OBSERVED');assert.equal(doc.sourceStatus.GROUPED_PRICES.day,L);assert.equal(doc.sourceStatus.GROUPED_PRICES.rejectedBars,1);
 assert.equal(doc.sourceStatus.GROUPED_PRICES.basis,'SPLIT_ADJUSTED_AS_OF_FETCH');
 assert.ok(tips.some(x=>x.sym==='FFF'&&x.src==='Insider buying'&&x.p0===20),'tip starts at the current close');
});

test('analyst turns use sorted, consecutive months only; an FMP refusal is a status, not "no upgrades"', async t=>{
 const {doc}=await fixture(t,{grouped:d=>d===L?[200,{status:'OK',results:SYMS.map(bar)}]:[200,{status:'OK',results:[]}]});
 assert.deepEqual(doc.analysts.map(x=>x.sym),['AAA']);assert.equal(doc.analysts[0].now,7);assert.equal(doc.analysts[0].was,4);
 const R=doc.sourceStatus.FINNHUB_RECOMMENDATION;assert.equal(R.unordered,1);assert.equal(R.notConsecutive,1);
 assert.equal(doc.sourceStatus.FMP_UPGRADES.status,'REFUSED');assert.deepEqual(doc.upgrades,[]);
});

test('prices: an error day falls back on the exchange calendar; a stale or missing price day logs no tips', async t=>{
 let r=await fixture(t,{grouped:d=>d===L?[200,{status:'ERROR',error:'x'}]:d===P1?[200,{status:'OK',results:SYMS.map(bar)}]:[200,{status:'OK',results:[]}]});
 assert.equal(r.doc.sourceStatus.GROUPED_PRICES.day,P1);assert.deepEqual(r.doc.sourceStatus.GROUPED_PRICES.triedDays.slice(0,2),[L,P1]);
 assert.equal(r.doc.sourceStatus.GROUPED_PRICES.status,'OBSERVED');assert.ok(r.tips.length>0);
 r=await fixture(t,{grouped:d=>d===P2?[200,{status:'OK',results:SYMS.map(bar)}]:[200,{status:'OK',results:[]}]});
 assert.equal(r.doc.sourceStatus.GROUPED_PRICES.status,'STALE');assert.equal(r.tips.length,0,'no tip is scored from a two-session-old price');
 assert.ok(r.doc.picks.includes('FFF'),'the evidence itself is still handed to the scan, which prices it independently');
 r=await fixture(t,{grouped:()=>[503,{}]});
 assert.equal(r.doc.sourceStatus.GROUPED_PRICES.status,'UNAVAILABLE');assert.equal(r.tips.length,0);
});
