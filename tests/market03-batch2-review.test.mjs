// Regressions for Codex's batch-2 review B2-1..B2-4 (Claude, 2 Nov 2026): the ACTUAL calendar.mjs and smart-money.mjs against loopback
// providers with synthetic data and a synthetic encryption key. No network, credentials or messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),KEY='synthetic-review-key';
const decrypt=f=>{const k=crypto.createHash('sha256').update(KEY).digest(),b=Buffer.from(fs.readFileSync(f,'utf8'),'base64'),d=crypto.createDecipheriv('aes-256-gcm',k,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)),d.final()])).toString());};
async function run(t,script,route,positions={AAA:{entry:10}}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b2rev-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'data/settings.json'),'{"quiet":true}');fs.writeFileSync(path.join(dir,'data/my-positions.json'),JSON.stringify(positions));
 const server=http.createServer((q,s)=>{const [st,body]=route(new URL(q.url,'http://x'));s.statusCode=st;s.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port;
 const c=spawn(process.execPath,[path.join(root,script)],{cwd:dir,env:{PATH:process.env.PATH,PRIVATE_KEY:KEY,MASSIVE_KEY:'synthetic',FINNHUB_KEY:'synthetic',FMP_KEY:'synthetic',PX_BASE:base,MASSIVE_BASE:base,FH_BASE:base,FMP_BASE:base,BLS_BASE:base,FED_BASE:base,SM_MAX:'10'}});
 let log='';c.stdout.on('data',x=>log+=x);c.stderr.on('data',x=>log+=x);const code=await new Promise(r=>c.on('close',r));assert.equal(code,0,log.slice(-1200));
 return {json:f=>JSON.parse(fs.readFileSync(path.join(dir,'data',f),'utf8')),cal:()=>decrypt(path.join(dir,'data/calendar.enc')),text:f=>fs.readFileSync(path.join(dir,'data',f),'utf8')};
}
const today=new Date().toISOString().slice(0,10),month=n=>new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7)-1+n,1)).toISOString().slice(0,10);
const cal=({holidays=[],div=()=>({results:[]})})=>u=>u.pathname==='/v1/marketstatus/upcoming'?[200,holidays]:u.pathname==='/v3/reference/dividends'?[200,div(u.searchParams.get('ticker'))]:[404,{}];

test('B2-1: impossible holiday and ex-dividend days are malformed rows; valid neighbours are kept; the process never aborts', async t=>{
 const f=await run(t,'calendar.mjs',cal({holidays:[{date:'2026-13-01',exchange:'NYSE',status:'closed'},{date:'2026-00-10',exchange:'NASDAQ',status:'closed'},{date:'2026-02-30',exchange:'NYSE',status:'closed'},{date:'2026-11-26',exchange:'NYSE',status:'closed',name:'Thanksgiving'}],
  div:()=>({results:[{ticker:'AAA',ex_dividend_date:'2026-13-05',cash_amount:1},{ticker:'AAA',ex_dividend_date:'2026-11-20',cash_amount:0.5,currency:'USD'}]})}));
 const c=f.cal();assert.deepEqual(c.holidays.map(h=>h.d),['2026-11-26']);assert.equal(f.json('calendar-status.json').massiveContract.holidays.malformedRows,3);
 assert.deepEqual(c.div.AAA.map(x=>x.ex),['2026-11-20']);assert.equal(c.privateStatus.dividends.malformedRows,1);
});

test('B2-1: impossible insider-transaction and upgrade dates are malformed rows in the actual smart-money producer', async t=>{
 const d=new Date(Date.now()-3*864e5).toISOString().slice(0,10),buy=(name,date)=>({name,transactionCode:'P',change:1000,transactionPrice:30,transactionDate:date,filingDate:date});
 const f=await run(t,'smart-money.mjs',u=>u.pathname.startsWith('/v2/aggs/grouped/')?[200,{status:'OK',results:[{T:'AAA',c:20,v:1e6}]}]
  :u.pathname==='/stock/insider-transactions'?[200,{symbol:'AAA',data:[buy('A One','2026-13-01'),buy('B Two',d),buy('C Three',d)]}]
  :u.pathname==='/stock/recommendation'?[200,[]]:u.pathname==='/stable/grades-latest-news'?[200,[{symbol:'AAA',action:'upgrade',publishedDate:'2026-02-30T10:00:00Z'},{symbol:'AAA',action:'upgrade',publishedDate:today+'T10:00:00Z',gradingCompany:'X'}]]:[200,[]]);
 const s=f.json('smart-money.json');assert.equal(s.sourceStatus.FINNHUB_INSIDER.malformedRows,1);assert.deepEqual(s.insiders.map(x=>[x.sym,x.n]),[['AAA',2]]);
 assert.equal(s.sourceStatus.FMP_UPGRADES.malformedRows,1);assert.deepEqual(s.upgrades.map(x=>x.sym),['AAA']);
});

test('B2-2: a dividend row without a returned ticker is never attached to the holding; named rows still are; nothing is published', async t=>{
 let f=await run(t,'calendar.mjs',cal({div:()=>({results:[{ex_dividend_date:'2026-11-20',cash_amount:1,currency:'USD'},{ticker:null,ex_dividend_date:'2026-11-21',cash_amount:2},{ticker:'',ex_dividend_date:'2026-11-22',cash_amount:3}]})}));
 let c=f.cal();assert.equal(c.div.AAA,undefined);assert.equal(c.divUnattributed.length,1);assert.equal(c.divUnattributed[0].rows.length,3);
 assert.equal(c.privateStatus.dividends.identityMissing,1);assert.equal(f.json('calendar-status.json').massiveContract.dividends.status,'UNAVAILABLE');
 f=await run(t,'calendar.mjs',cal({div:s=>s==='AAA'?{results:[{ticker:'AAA',ex_dividend_date:'2026-11-20',cash_amount:0.5,currency:'USD'},{ex_dividend_date:'2026-11-27',cash_amount:9}]}:{results:[{ticker:'BBB',ex_dividend_date:'2026-11-23',cash_amount:0.2,currency:'USD'}]}}),{AAA:{entry:10},BBB:{entry:20}});
 c=f.cal();assert.deepEqual(c.div.AAA.map(x=>x.ex),['2026-11-20']);assert.deepEqual(c.div.BBB.map(x=>x.ex),['2026-11-23']);assert.equal(c.privateStatus.dividends.identityMissing,1);
 assert.equal(f.json('calendar-status.json').massiveContract.dividends.status,'PARTIAL');
 const pub=f.text('calendar-status.json');for(const s of ['AAA','BBB'])assert.equal(pub.includes(s),false);
 assert.deepEqual(Object.keys(f.json('calendar-status.json').massiveContract.dividends),['status'],'holding-derived counts stay encrypted');assert.doesNotMatch(f.json('calendar-status.json').massive,/held/);
});

const smart=(rec)=>u=>u.pathname.startsWith('/v2/aggs/grouped/')?[200,{status:'OK',results:[{T:'AAA',c:20,v:1e6}]}]:u.pathname==='/stock/recommendation'?[200,rec]:u.pathname==='/stock/insider-transactions'?[200,{symbol:'AAA',data:[]}]:[200,[]];
const R=(period,sb,b,h,extra={})=>({symbol:'AAA',period,strongBuy:sb,buy:b,hold:h,sell:0,strongSell:0,...extra});

test('B2-3: future periods are excluded and counted; the turn is judged on the latest two started, consecutive months', async t=>{
 let s=(await run(t,'smart-money.mjs',smart([R(month(1),9,9,0),R(month(0),2,2,6)]))).json('smart-money.json');
 assert.deepEqual(s.analysts,[]);assert.equal(s.sourceStatus.FINNHUB_RECOMMENDATION.futureRows,1);assert.equal(s.sourceStatus.FINNHUB_RECOMMENDATION.status,'PARTIAL');
 s=(await run(t,'smart-money.mjs',smart([R(month(3),9,9,0),R(month(0),4,3,3),R(month(-1),2,2,6)]))).json('smart-money.json');
 assert.deepEqual(s.analysts.map(x=>[x.sym,x.now,x.was,x.period]),[['AAA',7,4,month(0)]]);assert.equal(s.sourceStatus.FINNHUB_RECOMMENDATION.futureRows,1);
});

test('B2-4: every count must be a finite whole number >= 0; missing and invalid are counted apart and never become zero', async t=>{
 for(const [bad,field] of [['not-a-number','malformedRows'],[-1,'malformedRows'],[2.5,'malformedRows'],[true,'malformedRows'],[null,'missingCountRows'],[undefined,'missingCountRows']]){
  const s=(await run(t,'smart-money.mjs',smart([R(month(0),bad,3,3),R(month(-1),0,1,6)]))).json('smart-money.json'),S=s.sourceStatus.FINNHUB_RECOMMENDATION;
  assert.equal(S[field],1,JSON.stringify(bad));assert.equal(S.status,'PARTIAL');assert.deepEqual(s.analysts,[],'a row with a bad count is not a turn: '+JSON.stringify(bad));}
 const s=(await run(t,'smart-money.mjs',smart([R(month(0),'4',3,3),R(month(-1),2,2,6)]))).json('smart-money.json');
 assert.deepEqual(s.analysts.map(x=>x.now),[7],'a numeric string count is still a valid count');
});

test('follow-up: a genuine empty dividend answer counts as none; unnamed or all-malformed rows never do; counts stay encrypted', async t=>{
 let f=await run(t,'calendar.mjs',cal({div:()=>({status:'OK',results:[]})}));let d=f.cal().privateStatus.dividends;
 assert.deepEqual([d.observed,d.none,d.malformedOnly,d.identityMissing],[0,1,0,0]);assert.equal(f.json('calendar-status.json').massiveContract.dividends.status,'OBSERVED');
 f=await run(t,'calendar.mjs',cal({div:()=>({results:[{ticker:'AAA',ex_dividend_date:'2026-13-01',cash_amount:1},{ticker:'AAA',ex_dividend_date:'2026-11-20',cash_amount:'x'}]})}));d=f.cal().privateStatus.dividends;
 assert.deepEqual([d.observed,d.none,d.malformedOnly,d.malformedRows],[0,0,1,2]);assert.equal(f.cal().div.AAA,undefined);assert.equal(f.json('calendar-status.json').massiveContract.dividends.status,'UNAVAILABLE');
 f=await run(t,'calendar.mjs',cal({div:()=>({results:[{ex_dividend_date:'2026-11-20',cash_amount:1}]})}));d=f.cal().privateStatus.dividends;
 assert.deepEqual([d.none,d.identityMissing],[0,1]);
 f=await run(t,'calendar.mjs',cal({div:s=>s==='AAA'?{results:[]}:s==='BBB'?{results:[{ticker:'BBB',ex_dividend_date:'2026-11-23',cash_amount:0.2,currency:'USD'}]}:{results:[{ticker:'CCC',ex_dividend_date:'bad',cash_amount:1}]}}),{AAA:{entry:1},BBB:{entry:2},CCC:{entry:3}});
 d=f.cal().privateStatus.dividends;assert.deepEqual([d.held,d.observed,d.none,d.malformedOnly],[3,1,1,1]);assert.equal(f.json('calendar-status.json').massiveContract.dividends.status,'PARTIAL');
 assert.deepEqual(Object.keys(f.json('calendar-status.json').massiveContract.dividends),['status']);for(const s of ['AAA','BBB','CCC'])assert.equal(f.text('calendar-status.json').includes(s),false);
});
