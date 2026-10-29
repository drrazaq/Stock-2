import {collectDiscovery} from '../discovery-runtime.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
async function fixture(t,{stale=false,future=false,macro=false,unknown=false,premarket=false,unacknowledged=false,corrupt=false,sourceFailure=null,generalNews=false,remoteJournal=false,crashAfterSend=false,journalFailure=null,journalRace=false,companyId=1}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'news-delivery-'));fs.mkdirSync(path.join(dir,'data'));
 const put=(name,value)=>fs.writeFileSync(path.join(dir,'data',name),JSON.stringify(value));
 put('my-positions.json',macro?{}:{AAA:{entry:10,stop:9}});
 put('news-meta.json',{AAA:{at:new Date().toISOString(),name:'Example',peers:[],words:[]}});
 if(corrupt)fs.writeFileSync(path.join(dir,'data/news-delivery.json'),'{broken');
 let activeChild;let ack=false,headline='AAA offering';const publication=Math.floor(Date.now()/1000)+(future?3600:-30);const messages=[];
 const git=(args,cwd=dir)=>{const r=spawnSync('git',args,{cwd,env:{PATH:process.env.PATH,HOME:dir,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 let origin;
 if(remoteJournal){origin=fs.mkdtempSync(path.join(os.tmpdir(),'s2-news-origin-'));git(['init','--bare',origin]);git(['init','-b','fixture']);git(['add','data']);git(['commit','-m','seed']);git(['remote','add','origin',origin]);git(['push','-u','origin','fixture']);t.after(()=>fs.rmSync(origin,{recursive:true,force:true}));}
 let childPath=process.env.PATH;if(journalFailure==='commit'){fs.writeFileSync(path.join(dir,'.git/hooks/pre-commit'),'#!/bin/sh\nprintf x > "$NEWS_TEST_FAILURE_MARKER"\nexit 1\n',{mode:0o755});}if(journalFailure==='push'){const bin=path.join(dir,'bin');fs.mkdirSync(bin);const real=spawnSync('sh',['-c','command -v git'],{encoding:'utf8'}).stdout.trim();fs.writeFileSync(path.join(bin,'git'),'#!/bin/sh\nif [ "$1" = push ]; then printf x > "$NEWS_TEST_FAILURE_MARKER"; exit 1; fi\nexec '+real+' "$@"\n',{mode:0o755});childPath=bin+path.delimiter+childPath;}
 const remoteBook=()=>JSON.parse(git(['--git-dir='+origin,'show','refs/heads/fixture:data/news-delivery.json']));
 const server=http.createServer(async(req,res)=>{if(journalRace&&req.url.startsWith('/company-news')){journalRace=false;const other=fs.mkdtempSync(path.join(os.tmpdir(),'s2-news-race-'));try{git(['clone','--branch','fixture',origin,other]);fs.writeFileSync(path.join(other,'data/news-delivery.json'),JSON.stringify({unknown:{'AAA|1':{reason:'competing writer'}},sent:{},delivery:{'AAA|1':{status:'UNKNOWN'}}}));git(['add','data/news-delivery.json'],other);git(['commit','-m','competing unknown'],other);git(['push'],other);}finally{fs.rmSync(other,{recursive:true,force:true});}}let raw='';for await(const part of req)raw+=part;const u=new URL(req.url,'http://localhost');let body={};
  if(u.pathname.includes('/sendMessage')){if(!premarket){const book=JSON.parse(fs.readFileSync(path.join(dir,'data/news-delivery.json'),'utf8'));assert.ok(Object.values(book.delivery).some(x=>x.status==='PENDING'));}if(remoteJournal)assert.ok(Object.values(remoteBook().delivery).some(x=>x.status==='PENDING'&&x.reservationOwner));messages.push(JSON.parse(raw).text);if(crashAfterSend){crashAfterSend=false;activeChild.kill('SIGKILL');res.destroy();return;}if(unknown&&!ack){res.destroy();return;}res.statusCode=ack||unacknowledged?200:403;body=ack?{ok:true,result:{message_id:messages.length}}:unacknowledged?{ok:true,result:{}}:{ok:false,error_code:403,description:'refused'};}
  else if(u.pathname.includes('/snapshots'))body={AAA:{latestTrade:{p:8,t:new Date(Date.now()-(stale?3600000:1000)).toISOString()},prevDailyBar:{c:8}}};
  else if(u.pathname==='/news')body=generalNews?[{id:2,headline,datetime:publication}]:[];
  else if(u.pathname==='/company-news'&&sourceFailure){res.statusCode=sourceFailure;body={error:'fixture source failure'};}
  else if(u.pathname==='/company-news')body=[{id:companyId,headline,datetime:publication}];
  else if(u.pathname==='/quote')body={c:8,dp:u.searchParams.get('symbol')==='SPY'?(macro?-3:0):-20,t:Math.floor(Date.now()/1000)-30-(stale?3600:0)};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const run=({allowDeliveryFailure=false,allowStateFailure=false,allowKilled=false}={})=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,premarket?'premarket-check.mjs':'news-watch.mjs')],{cwd:dir,env:{PATH:childPath,ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',ALPACA_DATA_BASE:base,FINNHUB_KEY:'fixture',FH_BASE:base,TG_BASE:base,TG_TOKEN:'fixture',TG_CHAT:'fixture',NEWS_TEST_FAILURE_MARKER:path.join(dir,'failure-reached'),...(remoteJournal?{NEWS_REMOTE_INTENT_REQUIRED:'1',NEWS_JOURNAL_LOCAL_FIXTURE:'1'}:{})}});activeChild=c;let out='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>out+=d);c.on('error',reject);c.on('exit',code=>code===0||allowKilled&&code===null||allowDeliveryFailure&&code===2||allowStateFailure&&code===1?resolve(out):reject(Error(out)));});
 return {run,messages,remoteFiles:()=>[...new Set(git(['--git-dir='+origin,'log','-2','--format=','--name-only','refs/heads/fixture']).split('\n').filter(Boolean))],failureReached:()=>fs.existsSync(path.join(dir,'failure-reached')),remoteBook,restoreRemote:()=>put('news-delivery.json',remoteBook()),revise:value=>{headline=value;},ack:()=>{ack=true;},write:(name,value)=>put(name,value),raw:name=>fs.readFileSync(path.join(dir,'data',name),'utf8'),read:name=>JSON.parse(fs.readFileSync(path.join(dir,'data',name),'utf8'))};
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

test('same provider ID with revised content is retained as a conflict across acknowledged jobs',async t=>{const f=await fixture(t);f.ack();await f.run();assert.equal(f.messages.length,1);f.revise('AAA bankruptcy');await f.run();assert.equal(f.messages.length,1);const entries=Object.values(f.read('news-delivery.json').sourceRevisions);assert.equal(entries[0].status,'CONFLICT');assert.equal(Object.keys(entries[0].revisions).length,2);const audit=f.raw('news-log.jsonl').trim().split('\n').map(JSON.parse).find(x=>x.recordType==='SOURCE_REVISION_QUARANTINE');assert.equal(audit.headline,'AAA bankruptcy');assert.equal(audit.h,undefined);assert.equal(audit.sym,undefined);const ingress=collectDiscovery({cutoff:new Date().toISOString(),readText:p=>f.raw(p.slice(5))});assert.equal(ingress.observations.length,0);await f.run();assert.equal(f.messages.length,1);assert.ok(f.read('news-seen.json')['AAA|1']);});
test('revised source cannot bypass unknown delivery in a separate job',async t=>{const f=await fixture(t,{unacknowledged:true});await f.run({allowDeliveryFailure:true});f.revise('AAA bankruptcy');f.ack();await f.run();assert.equal(f.messages.length,1);assert.equal(f.read('news-delivery.json').delivery['AAA|1'].status,'UNKNOWN');assert.equal(Object.values(f.read('news-delivery.json').sourceRevisions)[0].status,'CONFLICT');});
test('legacy ACK without a known content revision remains unresolved and cannot replay',async t=>{const f=await fixture(t);f.write('news-delivery.json',{unknown:{},sent:{'AAA|1':1},delivery:{'AAA|1':{status:'ACK'}}});f.ack();await f.run();assert.equal(f.messages.length,0);assert.ok(Object.values(f.read('news-delivery.json').sourceRevisions).some(x=>x.status==='LEGACY_UNRESOLVED'));});

test('general/macro source revisions are captured before legacy headline suppression',async t=>{const f=await fixture(t,{macro:true,generalNews:true});f.revise('Tariffs emergency');f.ack();await f.run();const n=f.messages.length;assert.ok(n>0);f.revise('Tariffs revoked');await f.run();assert.equal(f.messages.length,n);assert.ok(Object.values(f.read('news-delivery.json').sourceRevisions).some(x=>x.status==='CONFLICT'));});

test('corrupt persisted revision evidence fails before any outbound request',async t=>{for(const sourceRevisions of [null,false,{bad:{status:'OBSERVED'}}]){const f=await fixture(t);f.write('news-delivery.json',{unknown:{},sent:{},delivery:{},sourceRevisions});f.ack();await f.run({allowStateFailure:true});assert.equal(f.messages.length,0);}});

test('real news caller confirms remote intent before mocked delivery and ACK before success',async t=>{const f=await fixture(t,{remoteJournal:true});f.ack();await f.run();assert.equal(f.remoteBook().delivery['AAA|1'].status,'ACK');assert.deepEqual(f.remoteFiles(),['data/news-delivery.json']);f.restoreRemote();await f.run();assert.equal(f.messages.length,1);});
test('lost news process leaves remotely confirmed intent that a restored job cannot replay',async t=>{const f=await fixture(t,{remoteJournal:true,crashAfterSend:true});f.ack();await f.run({allowKilled:true});assert.equal(f.messages.length,1);assert.equal(f.remoteBook().delivery['AAA|1'].status,'PENDING');f.restoreRemote();await f.run();assert.equal(f.messages.length,1);assert.equal(f.remoteBook().delivery['AAA|1'].status,'PENDING');});

for(const journalFailure of ['commit','push'])test('news publication '+journalFailure+' refusal prevents outbound delivery',async t=>{const f=await fixture(t,{remoteJournal:true,journalFailure});f.ack();await f.run({allowDeliveryFailure:true});assert.equal(f.failureReached(),true);assert.equal(f.messages.length,0);assert.equal(f.read('news-delivery.json').delivery['AAA|1'].status,'PENDING');});
test('competing remote unknown journal cannot be overwritten to authorize another send',async t=>{const f=await fixture(t,{remoteJournal:true,journalRace:true});f.ack();await f.run({allowDeliveryFailure:true});assert.equal(f.messages.length,0);assert.equal(f.remoteBook().delivery['AAA|1'].status,'UNKNOWN');assert.equal(f.remoteBook().unknown['AAA|1'].reason,'competing writer');});

test('malformed provider identifiers cannot become source identity or trigger delivery',async t=>{const f=await fixture(t,{companyId:{bad:'id'}});f.ack();await f.run();assert.equal(f.messages.length,0);const audit=f.raw('news-log.jsonl').trim().split('\n').map(JSON.parse).find(x=>x.recordType==='SOURCE_REVISION_QUARANTINE');assert.equal(audit.reason,'INVALID_REVISION_RECORD');assert.equal(audit.reportedId,null);});
