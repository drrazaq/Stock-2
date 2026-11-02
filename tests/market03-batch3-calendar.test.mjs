// MARKET-03 batch 3 (Claude, 2 Nov 2026): the ACTUAL calendar.mjs (MODE=fetch) Massive block against local fake answers.
// Synthetic positions and a synthetic encryption key; BLS/Fed answer 404 locally. No network, credentials or Telegram.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),KEY='synthetic-test-key';
const decrypt=f=>{const k=crypto.createHash('sha256').update(KEY).digest(),b=Buffer.from(fs.readFileSync(f,'utf8'),'base64'),d=crypto.createDecipheriv('aes-256-gcm',k,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)),d.final()])).toString());};
async function run(t,route,positions={AAA:{entry:10},BBB:{entry:20},CCC:{entry:30},DDD:{entry:40}}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cal-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'data/my-positions.json'),JSON.stringify(positions));
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');const [st,body]=route(u);res.statusCode=st;res.end(typeof body==='string'?body:JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const go=()=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,'calendar.mjs')],{cwd:dir,env:{PATH:process.env.PATH,PRIVATE_KEY:KEY,MASSIVE_KEY:'fixture',PX_BASE:base,BLS_BASE:base,FED_BASE:base}});
  let out='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>out+=x);c.on('exit',code=>code===0?resolve(out):reject(Error('exit '+code+': '+out.slice(-1500))));});
 await go();return {cal:()=>decrypt(path.join(dir,'data/calendar.enc')),status:()=>JSON.parse(fs.readFileSync(path.join(dir,'data/calendar-status.json'),'utf8')),go,dir};
}
const H=(date,exchange,status,name='Holiday')=>({date,exchange,status,name});
const upcoming=[H('2026-11-26','NYSE','closed','Thanksgiving'),H('2026-11-26','NASDAQ','closed','Thanksgiving'),H('2026-11-27','NYSE','early-close','Day after Thanksgiving'),H('2026-11-27','NASDAQ','closed','Day after Thanksgiving'),
 H('2026-12-25','NYSE','closed','Christmas'),H('2026-12-30','NYSE','closed','Not a holiday'),H('2026-10-01','NYSE','closed','Past'),H('bad','NYSE','closed'),H('2027-01-01','NYSE','shut')];
function route({holidays=[200,upcoming],div}={}){return u=>{
 if(u.pathname==='/v1/marketstatus/upcoming')return holidays;
 if(u.pathname==='/v3/reference/dividends'){const s=u.searchParams.get('ticker');return div?div(s):[200,{results:[]}];}
 return [404,'not here'];};}

test('holidays: past and malformed rows dropped; exchange disagreement and exchange-calendar disagreement kept as CONFLICT', async t=>{
 const f=await run(t,route());const c=f.cal(),S=f.status().massiveContract.holidays;
 const by=Object.fromEntries(c.holidays.map(h=>[h.d,h]));
 assert.deepEqual(Object.keys(by).sort(),['2026-11-26','2026-11-27','2026-12-25','2026-12-30']);
 assert.equal(by['2026-11-26'].calendar,'AGREES');assert.equal(by['2026-11-26'].conflict,undefined);
 assert.equal(by['2026-11-27'].conflict,'EXCHANGES_DISAGREE','NYSE half day vs Nasdaq closed');
 assert.equal(by['2026-12-30'].calendar,'DISAGREES');assert.equal(by['2026-12-30'].conflict,'EXCHANGE_CALENDAR_DISAGREES');
 assert.equal(S.status,'CONFLICT');assert.equal(S.pastRows,1);assert.equal(S.malformedRows,2);
 assert.match(f.status().massive,/^holidays CONFLICT/);
});

test('a failed holiday request keeps the old list but is never reported as ok', async t=>{
 const f=await run(t,route());let r=f.status();assert.equal(r.massiveContract.holidays.kept,4);
 // second run: Massive fails
 const dir=f.dir,server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');res.statusCode=u.pathname==='/v1/marketstatus/upcoming'?503:u.pathname==='/v3/reference/dividends'?200:404;res.end(u.pathname==='/v3/reference/dividends'?'{"results":[]}':'{}');});
 await new Promise(x=>server.listen(0,'127.0.0.1',x));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 await new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,'calendar.mjs')],{cwd:dir,env:{PATH:process.env.PATH,PRIVATE_KEY:KEY,MASSIVE_KEY:'fixture',PX_BASE:base,BLS_BASE:base,FED_BASE:base}});c.on('exit',code=>code===0?resolve():reject(Error('exit '+code)));});
 r=JSON.parse(fs.readFileSync(path.join(dir,'data/calendar-status.json'),'utf8'));
 assert.equal(r.massiveContract.holidays.status,'UNAVAILABLE');assert.doesNotMatch(r.massive,/\bok\b/);
 assert.equal(decrypt(path.join(dir,'data/calendar.enc')).holidays.length,4,'previous future holidays are kept for display');
});

test('dividends: wrong ticker, malformed rows, failed lookups and non-USD amounts are distinct; the public status has no symbols', async t=>{
 const f=await run(t,route({div:s=>s==='AAA'?[200,{results:[{ticker:'AAA',ex_dividend_date:'2026-11-20',pay_date:'2026-12-01',cash_amount:0.25,currency:'USD'}]}]
  :s==='BBB'?[200,{results:[{ticker:'BBBX',ex_dividend_date:'2026-11-20',cash_amount:9}]}]
  :s==='CCC'?[500,{}]
  :[200,{results:[{ticker:'DDD',ex_dividend_date:'2026-11-21',cash_amount:1.1,currency:'CAD'},{ticker:'DDD',ex_dividend_date:'nope',cash_amount:1}]}]}));
 const c=f.cal(),D=c.privateStatus.dividends;                    // holding-derived counts live only in the encrypted file
 assert.deepEqual(Object.keys(f.status().massiveContract.dividends),['status'],'public status: outcome word only');assert.equal(f.status().massiveContract.dividends.status,'PARTIAL');
 assert.deepEqual(Object.keys(c.div).sort(),['AAA','DDD']);assert.equal(c.div.AAA[0].currency,'USD');assert.equal(c.div.DDD[0].currency,'CAD');
 assert.equal(D.identityMismatch,1);assert.equal(D.failed,1);assert.equal(D.malformedRows,1);assert.equal(D.nonUsd,1);assert.equal(D.status,'PARTIAL');
 const pub=fs.readFileSync(path.join(f.dir,'data/calendar-status.json'),'utf8');for(const s of ['AAA','BBB','CCC','DDD'])assert.equal(pub.includes(s),false,'held symbol '+s+' in the public status');
});
