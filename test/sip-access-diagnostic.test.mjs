import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {LIMITS,validatePlan,requestsFor,runSipDiagnostic,createBoundedSipRequest} from '../sip-access-diagnostic.mjs';
const plan=JSON.parse(fs.readFileSync(new URL('../docs/validation/sip-access-plan.proposed.json',import.meta.url),'utf8'));
const T=Date.parse(plan.t0),stamp=new Date(T-60000).toISOString();
const b={t:stamp,o:10,h:11,l:9,c:10,v:100,n:3,vw:10};
const approval={granted:true,scope:'SIP_ACCESS_SAMPLE_V1'};
function body(id){
 if(id==='snapshots')return {SPY:{latestQuote:{t:stamp}},AAPL:{latestQuote:{t:stamp}}};
 if(id==='quotes')return {quotes:{SPY:{t:stamp,bp:10,ap:11},AAPL:{t:stamp,bp:10,ap:11}}};
 if(id==='trades-latest')return {trades:{SPY:{t:stamp,p:10},AAPL:{t:stamp,p:10}}};
 if(id==='trades-window')return {trades:{AAPL:[{t:stamp,p:10,s:1}]},next_page_token:null};
 return {bars:{SPY:[{...b}],AAPL:[{...b}]},next_page_token:null};
}
const response=(slot,over={})=>({status:200,body:body(slot.id),bytes:100,...over});
function harness({badAt=-1,over={},start=T,waitChange=ms=>ms}={}){
 let time=start;const calls=[],waits=[];
 return {calls,waits,ports:{approval,now:()=>time,wait:async ms=>{waits.push(ms);time+=waitChange(ms);},request:async slot=>{calls.push(slot);return response(slot,calls.length===badAt?over:{});}},set:n=>{time=n;}};
}
test('one fixed plan: seven SIP GET routes, no reference calls, identical five-minute repeat window',()=>{
 const slots=requestsFor(plan);assert.equal(slots.length,7);
 for(const s of slots){const u=new URL(s.url);assert.equal(u.origin,'https://data.alpaca.markets');assert.equal(u.searchParams.get('feed'),'sip');}
 assert.equal(slots[3].url,slots[4].url);assert.equal(slots[4].due,T+90000);
 assert.equal(new URL(slots[3].url).searchParams.get('end'),new Date(T-1).toISOString());
});
test('complete mocked orchestration: exactly seven calls, fixed wait, aggregate-only report',async()=>{
 const h=harness(),r=await runSipDiagnostic(plan,h.ports);
 assert.equal(r.status,'COMPLETE_SAMPLED');assert.equal(r.applicationAttempts,7);assert.deepEqual(h.waits,[90000]);
 assert.equal(r.results[4].changedMinutes,0);assert.equal(r.claims.generalCoverageEstablished,false);
 assert.ok(Buffer.byteLength(JSON.stringify(r))<=LIMITS.reportBytes);
 assert.doesNotMatch(JSON.stringify(r),/"bp"|"ap"|"latestQuote"|"SPY"|"AAPL"|API-KEY|synthetic-secret/);
});
test('approval, plan changes and late/early startup fail before any transport',async()=>{
 for(const change of [{symbols:['SPY','AAPL','ZZQ']},{limits:{...plan.limits,requests:8}},{t0:'2026-11-03T00:00:00Z'},{approved:true}]){
  const h=harness();await assert.rejects(runSipDiagnostic({...plan,...change},h.ports));assert.equal(h.calls.length,0);
 }
 for(const start of [T-1,T+30001]){const h=harness({start});await assert.rejects(runSipDiagnostic(plan,h.ports),/CLOCK/);assert.equal(h.calls.length,0);}
 const h=harness();await assert.rejects(runSipDiagnostic(plan,{...h.ports,approval:{granted:false}}),/APPROVAL_REQUIRED/);assert.equal(h.calls.length,0);
});
test('401/403/429/500 stop with no fallback or retry',async()=>{
 for(const status of [401,403,429,500]){
  const h=harness({badAt:2,over:{status}}),r=await runSipDiagnostic(plan,h.ports);
  assert.equal(r.status,'STOPPED');assert.equal(r.applicationAttempts,2);assert.equal(h.calls.length,2);
  assert.equal(r.reason,status===500?'HTTP_ERROR':'HTTP_'+status);
 }
});
test('pagination, foreign symbols, provider errors and body bounds remain incomplete',async()=>{
 for(const over of [{body:{quotes:{SPY:{t:stamp}},next_page_token:'more'}},{body:{quotes:{ZZQ:{t:stamp}}}},{body:{message:'PRIVATE PROVIDER TEXT'}},{bytes:LIMITS.bodyBytes+1}]){
  const h=harness({badAt:2,over}),r=await runSipDiagnostic(plan,h.ports);assert.equal(r.status,'STOPPED');assert.equal(h.calls.length,2);assert.doesNotMatch(JSON.stringify(r),/PRIVATE PROVIDER TEXT/);
 }
});
test('clock regression and expired deadline stop before more requests',async()=>{
 const h=harness({waitChange:()=>-1000}),r=await runSipDiagnostic(plan,h.ports);assert.equal(r.reason,'CLOCK');assert.equal(h.calls.length,4);
 const x=harness({waitChange:()=>LIMITS.wallMs+1}),q=await runSipDiagnostic(plan,x.ports);assert.equal(q.reason,'DEADLINE');assert.equal(x.calls.length,4);
 assert.equal(q.applicationAttempts,4,'waiting is not a provider attempt');
});
test('every changed bar field is counted in sample revisions; duplicates refuse comparison',async()=>{
 for(const field of ['o','h','l','c','v','n','vw']){
  const h=harness();h.ports.request=async slot=>{h.calls.push(slot);const r=response(slot);if(slot.id==='bars-repeat')r.body.bars.SPY[0][field]+=1;return r;};
  const r=await runSipDiagnostic(plan,h.ports);assert.equal(r.results[4].changedMinutes,1,field);
 }
 const h=harness();h.ports.request=async slot=>{h.calls.push(slot);const r=response(slot);if(slot.id==='bars-repeat')r.body.bars.SPY.push({...b});return r;};
 assert.equal((await runSipDiagnostic(plan,h.ports)).reason,'SCHEMA_ERROR');
});
test('missing, invalid and future quote clocks get no freshness credit',async()=>{
 const h=harness({badAt:2,over:{body:{quotes:{SPY:{t:'not-a-clock'},AAPL:{t:new Date(T+1).toISOString()}}}}}),r=await runSipDiagnostic(plan,h.ports);
 assert.equal(r.results[1].unknownClock,1);assert.equal(r.results[1].future,1);assert.equal(r.results[1].clocked,0);
});
const slot=()=>({...requestsFor(plan)[0],timeoutMs:50,maxBytes:LIMITS.bodyBytes});
const headers={'APCA-API-KEY-ID':'synthetic-key','APCA-API-SECRET-KEY':'synthetic-secret'};
test('real HTTP adapter with mock transport: GET, redirects refused, SIP and bounded parsed output',async()=>{
 let observed;
 const request=createBoundedSipRequest({headers,fetcher:async(url,opts)=>{observed={url,opts};return new Response(JSON.stringify(body('snapshots')),{status:200,headers:{'x-ratelimit-limit':'10000','x-ratelimit-remaining':'untrusted-text'}});}});
 const r=await request(slot());assert.equal(observed.opts.method,'GET');assert.equal(observed.opts.redirect,'error');assert.equal(r.rateLimitSample.limit,10000);assert.equal(r.rateLimitSample.remaining,null);
 assert.equal(observed.opts.signal.aborted,true,'request scope closes after reading');
 await assert.rejects(request({...slot(),url:'https://evil.invalid/v2/stocks/snapshots?feed=sip'}),/TRANSPORT_ERROR/);
});
test('body timeout, ignored abort, invalid JSON and excessive streamed bytes are bounded',async()=>{
 for(const fetcher of [
  async()=>new Promise(()=>{}),
  async()=>({status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{}})}})
 ]){
  const request=createBoundedSipRequest({headers,fetcher});await assert.rejects(request({...slot(),timeoutMs:10}),/TIMEOUT/);
 }
 await assert.rejects(createBoundedSipRequest({headers,fetcher:async()=>new Response('not json')})(slot()),/INVALID_JSON/);
 await assert.rejects(createBoundedSipRequest({headers,fetcher:async()=>new Response(new Uint8Array(LIMITS.bodyBytes+1))})(slot()),/TOO_LARGE/);
});
test('actual CLI refuses ordinary execution even with synthetic keys; no provider transport is created',()=>{
 const child=spawnSync(process.execPath,['tools/run-sip-access-diagnostic.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{PATH:process.env.PATH,ALPACA_KEY:'synthetic-key',ALPACA_SECRET:'synthetic-secret'}});
 assert.equal(child.status,2);assert.equal(child.stdout.trim(),'BLOCKED_CONTEXT');assert.doesNotMatch(child.stdout+child.stderr,/synthetic-key|synthetic-secret/);
});

test('actual protected runner succeeds only with complete synthetic pins; bad pins and existing partial output fail before transport',t=>{
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'sip-guard-'));t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const hash=s=>createHash('sha256').update(s).digest('hex'),root=path.join(top,'code');fs.mkdirSync(path.join(root,'tools'),{recursive:true});fs.mkdirSync(path.join(root,'docs/validation'),{recursive:true});
 const files=['sip-access-diagnostic.mjs','sip-access-result.mjs','tools/run-sip-access-diagnostic.mjs','tools/validate-sip-access-result.mjs','docs/validation/sip-access-plan.proposed.json'];
 for(const f of files)fs.copyFileSync(new URL('../'+f,import.meta.url),path.join(root,f));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-q');git('add','.');git('-c','user.name=synthetic','-c','user.email=synthetic@example.invalid','commit','-qm','synthetic source');const source=git('rev-parse','HEAD');
 const workflow=path.join(top,'workflow.yml');fs.writeFileSync(workflow,'# synthetic installed workflow\n');
 const preload=path.join(top,'mock.mjs'),calls=path.join(top,'calls.txt');
 fs.writeFileSync(preload,`import fs from 'node:fs';const D=Date;let now=${T};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};const timer=setTimeout;globalThis.setTimeout=(f,ms,...a)=>{if(ms===90000){now+=ms;return timer(f,0,...a);}return timer(f,ms,...a);};globalThis.fetch=async url=>{fs.appendFileSync(${JSON.stringify(calls)},'attempt\\n');if(!String(url).startsWith('https://data.alpaca.markets/'))throw Error('NO_NETWORK');const t=new D(${T}-60000).toISOString();let body;if(url.includes('/snapshots'))body={SPY:{latestQuote:{t}},AAPL:{latestQuote:{t}}};else if(url.includes('/quotes/latest'))body={quotes:{SPY:{t},AAPL:{t}}};else if(url.includes('/trades/latest'))body={trades:{SPY:{t},AAPL:{t}}};else if(url.includes('/trades?'))body={trades:{AAPL:[{t}]}};else body={bars:{SPY:[{t,v:1}],AAPL:[{t,v:1}]}};return new Response(JSON.stringify(body));};`);
 const base={granted:true,scope:'SIP_ACCESS_SAMPLE_V1',sourceSha:source,workflowSha256:hash(fs.readFileSync(workflow)),sourceHashes:Object.fromEntries(files.slice(0,-1).map(f=>[f,hash(fs.readFileSync(path.join(root,f)))])),planSha256:hash(fs.readFileSync(path.join(root,files.at(-1)))),approvedAt:new Date(T-3600000).toISOString(),existingBindingsOnly:true,sampledResponsesOnly:true};
 const run=(over={},partial=false)=>{const dir=fs.mkdtempSync(path.join(top,'run-')),approvalFile=path.join(dir,'approval.json');fs.writeFileSync(approvalFile,JSON.stringify({...base,...over}));if(partial)fs.writeFileSync(path.join(dir,'sip-access-report.json'),'original partial');
 const before=fs.existsSync(calls)?fs.readFileSync(calls,'utf8').length:0;
 const r=spawnSync(process.execPath,['--import',preload,'tools/run-sip-access-diagnostic.mjs','--approval',approvalFile,workflow],{cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF_NAME:'main',GITHUB_WORKFLOW_REF:'drrazaq/Stock-2/.github/workflows/sip-access-diagnostic.yml@refs/heads/main',SIP_APPROVED_SOURCE:source,RUNNER_TEMP:dir,ALPACA_KEY:'synthetic-key',ALPACA_SECRET:'synthetic-secret'}});
 const after=fs.existsSync(calls)?fs.readFileSync(calls,'utf8').length:0;return {r,dir,attempts:(after-before)/8};};
 const good=run();assert.equal(good.r.status,0,good.r.stderr);assert.equal(good.r.stdout.trim(),'PASS');assert.equal(good.attempts,7);assert.equal(JSON.parse(fs.readFileSync(path.join(good.dir,'sip-access-report.json'))).applicationAttempts,7);
 for(const over of [{planSha256:'0'.repeat(64)},{workflowSha256:'0'.repeat(64)},{sourceSha:'0'.repeat(40)},{sourceHashes:{}},{approvedAt:'2026-02-30T15:00:00Z'}]){const bad=run(over);assert.equal(bad.r.status,2,bad.r.stderr);assert.equal(bad.attempts,0);}
 const partial=run({},true);assert.equal(partial.r.status,2);assert.equal(partial.attempts,0);assert.equal(fs.readFileSync(path.join(partial.dir,'sip-access-report.json'),'utf8'),'original partial');
});
