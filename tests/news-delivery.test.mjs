import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
async function fixture(t,{stale=false,future=false,macro=false,unknown=false,premarket=false,unacknowledged=false,corrupt=false,sourceFailure=null}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-delivery-'));fs.mkdirSync(path.join(dir,'data'));
 const put=(name,value)=>fs.writeFileSync(path.join(dir,'data',name),JSON.stringify(value));
 put('my-positions.json',macro?{}:{AAA:{entry:10,stop:9}});
 put('news-meta.json',{AAA:{at:new Date().toISOString(),name:'Example',peers:[],words:[]}});
 if(corrupt)fs.writeFileSync(path.join(dir,'data/news-delivery.json'),'{broken');
 let ack=false;const messages=[];
 const server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const u=new URL(req.url,'http://localhost');let body={};
  if(u.pathname.includes('/sendMessage')){if(!premarket){const book=JSON.parse(fs.readFileSync(path.join(dir,'data/news-delivery.json'),'utf8'));assert.ok(Object.values(book.delivery).some(x=>x.status==='PENDING'));}messages.push(JSON.parse(raw).text);if(unknown&&!ack){res.destroy();return;}res.statusCode=ack||unacknowledged?200:403;body=ack?{ok:true,result:{message_id:messages.length}}:unacknowledged?{ok:true,result:{}}:{ok:false,error_code:403,description:'refused'};}
  else if(u.pathname.includes('/snapshots'))body={AAA:{latestTrade:{p:8,t:new Date(Date.now()-(stale?3600000:1000)).toISOString()},prevDailyBar:{c:8}}};
  else if(u.pathname==='/news')body=[];
  else if(u.pathname==='/company-news'&&sourceFailure){res.statusCode=sourceFailure;body={error:'fixture source failure'};}
  else if(u.pathname==='/company-news')body=[{id:1,headline:'AAA offering',datetime:Math.floor(Date.now()/1000)+(future?3600:-30)}];
  else if(u.pathname==='/quote')body={c:8,dp:u.searchParams.get('symbol')==='SPY'?(macro?-3:0):-20,t:Math.floor(Date.now()/1000)-30-(stale?3600:0)};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const run=({allowDeliveryFailure=false,allowStateFailure=false}={})=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,premarket?'premarket-check.mjs':'news-watch.mjs')],{cwd:dir,env:{PATH:process.env.PATH,ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',ALPACA_DATA_BASE:base,FINNHUB_KEY:'fixture',FH_BASE:base,TG_BASE:base,TG_TOKEN:'fixture',TG_CHAT:'fixture'}});let out='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);c.on('error',reject);c.on('exit',code=>code===0||allowDeliveryFailure&&code===2||allowStateFailure&&code===1?resolve(out):reject(Error(out)));});
 return {run,messages,ack:()=>{ack=true;},write:(name,value)=>put(name,value),raw:name=>fs.readFileSync(path.join(dir,'data',name),'utf8'),read:name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'))};
}
test('news is marked delivered only after real ACK and duplicate cycles do not resend',async t=>{
 const f=await fixture(t);await f.run({allowDeliveryFailure:true});assert.deepEqual(f.read('news-seen.json'),{});f.ack();await f.run();assert.ok(f.read('news-seen.json')['AAA|1']);await f.run();assert.equal(f.messages.length,2);
});
test('stale news price cannot produce a current-price SELL instruction',async t=>{
 const f=await fixture(t,{stale:true});f.ack();await f.run();assert.match(f.messages[0],/PRICE UNVERIFIED/);assert.doesNotMatch(f.messages[0],/SELL NOW/);
});
test('future headlines cannot enter the news decision path',async t=>{
 const f=await fixture(t,{future:true});f.ack();await f.run();assert.equal(f.messages.length,0);assert.deepEqual(f.read('news-seen.json'),{});
});
test('macro delivery refusal does not consume the daily threshold',async t=>{
 const f=await fixture(t,{macro:true});await f.run({allowDeliveryFailure:true});assert.deepEqual(f.read('macro-state.json').sent,[]);f.ack();await f.run();assert.deepEqual(f.read('macro-state.json').sent,['down2.5']);await f.run();assert.equal(f.messages.length,2);
});

test('ambiguous news outcome is quarantined, never marked ACK or blindly replayed',async t=>{
 const f=await fixture(t,{unknown:true});await f.run({allowDeliveryFailure:true});assert.deepEqual(f.read('news-seen.json'),{});assert.equal(f.read('news-delivery.json').unknown['AAA|1'].reason,'NETWORK_ERROR');f.ack();await f.run();assert.equal(f.messages.length,1);
});
test('premarket prior close and old trade cannot create a live-price stop SELL',async t=>{
 const f=await fixture(t,{premarket:true,stale:true});f.ack();await f.run();assert.match(f.messages[0],/PRICE UNVERIFIED/);assert.doesNotMatch(f.messages[0],/SELL at the open/);
});

test('HTTP200 without a message ID is quarantined across later processes',async t=>{
 const f=await fixture(t,{unacknowledged:true});await f.run({allowDeliveryFailure:true});
 assert.equal(f.read('news-delivery.json').delivery['AAA|1'].status,'UNKNOWN');
 f.ack();await f.run();assert.equal(f.messages.length,1);
});
test('persisted intent and malformed delivery state fail closed before Telegram',async t=>{
 const f=await fixture(t);f.write('news-delivery.json',{unknown:{},sent:{},delivery:{'AAA|1':{status:'PENDING',at:new Date().toISOString()}}});
 f.ack();await f.run();assert.equal(f.messages.length,0);
 const broken=await fixture(t,{corrupt:true});await broken.run({allowStateFailure:true});assert.equal(broken.messages.length,0);assert.equal(broken.raw('news-delivery.json'),'{broken');
});
test('news workflow saves state after failure and cannot conceal exhausted publication retries',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/news.yml'),'utf8');
 assert.match(workflow,/if: always\(\) && hashFiles/);assert.doesNotMatch(workflow,/rebase -X theirs/);assert.match(workflow,/\[ "\$ok" = 1 \]/);
});

for(const status of [429,503])test('news fetch failure '+status+' is unavailable without delivery/seen credit',async t=>{const f=await fixture(t,{sourceFailure:status});f.ack();const out=await f.run({allowDeliveryFailure:true});assert.match(out,status===429?/RATE_LIMITED/:/HTTP_ERROR/);assert.equal(f.messages.length,0);assert.deepEqual(f.read('news-seen.json'),{});});
