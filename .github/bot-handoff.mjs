// Inactive until separately approved marker activation. Repo metadata only:
// no market/provider keys, Telegram, orders, workflow cancellation or settings.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash,randomUUID}from'node:crypto';import{execFile}from'node:child_process';import{promisify}from'node:util';import{performance}from'node:perf_hooks';import{fileURLToPath}from'node:url';
const exec=promisify(execFile),LEDGER='data/bot-handoffs.jsonl',MARKER='.github/bot-handoff-enabled',SOURCES=['.github/workflows/bot.yml','.github/bot-handoff.mjs'];
const digest=b=>createHash('sha256').update(b).digest('hex'),day=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),validClock=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const outcomes=new Set(['SUPPRESSED_AFTER_RESERVATION','SUPPRESSED_SOURCE_CHANGED','SUPPRESSED_TIMEOUT','DISPATCH_CORRELATED','ATTRIBUTION_UNKNOWN','DISPATCH_REFUSED','UNKNOWN','TIMEOUT_UNKNOWN']);
export function parseHandoffLedger(text,now=Date.now()){
 if(Buffer.byteLength(text)>4*1024*1024)throw Error('UNKNOWN_LEDGER');const lines=text.split('\n').filter(Boolean);if(lines.length>8192)throw Error('UNKNOWN_LEDGER');
 const rows=[],reservations=new Map(),finished=new Map(),reconciled=new Set();
 for(const line of lines){if(Buffer.byteLength(line)>=512)throw Error('UNKNOWN_LEDGER');const r=JSON.parse(line);if(!['RESERVED','OUTCOME','RECONCILED'].includes(r.kind)||!/^\d+\/\d+$/.test(r.id||'')||!validClock(r.at)||Date.parse(r.at)>now||r.day!==day(Date.parse(r.at)))throw Error('UNKNOWN_LEDGER');
  if(r.kind==='RESERVED'){if(reservations.has(r.id))throw Error('UNKNOWN_LEDGER');reservations.set(r.id,r);}
  if(r.kind==='OUTCOME'){if(!outcomes.has(r.status)||finished.has(r.id))throw Error('UNKNOWN_LEDGER');finished.set(r.id,r);}
  if(r.kind==='RECONCILED'){if(typeof r.by!=='string'||!r.by||typeof r.evidence!=='string'||!r.evidence||reconciled.has(r.id))throw Error('UNKNOWN_LEDGER');reconciled.add(r.id);}
  rows.push(r);
 }
 if([...finished.keys(),...reconciled].some(id=>!reservations.has(id)))throw Error('UNKNOWN_LEDGER');
 for(const d of new Set(rows.map(r=>r.day)))if(rows.filter(r=>r.day===d).length>18||[...reservations.values()].filter(r=>r.day===d).length>6)throw Error('UNKNOWN_LEDGER');
 const pending=[...reservations].filter(([id])=>!reconciled.has(id)&&(!finished.has(id)||['UNKNOWN','TIMEOUT_UNKNOWN'].includes(finished.get(id).status))).map(([id])=>id);
 return {rows,reservations,finished,pending};
}
export function appendHandoffLine(text,row){const line=JSON.stringify(row);if(Buffer.byteLength(line)>=512)throw Error('UNKNOWN_LEDGER');return text+(text&&!text.endsWith('\n')?'\n':'')+line+'\n';}
export function statusSuccessor(pages,currentId){
 if(!Array.isArray(pages)||pages.length!==5)return {unknown:true};const all=[];
 for(const p of pages){if(p.error||!Number.isInteger(p.total_count)||p.total_count<0||p.total_count>100||/rel\s*=\s*"?next/i.test(p.link||'')||!Array.isArray(p.workflow_runs)||p.workflow_runs.length!==p.total_count)return {unknown:true};all.push(...p.workflow_runs);}
 const current=pages[1].workflow_runs.find(r=>String(r.id)===currentId&&r.status==='in_progress');if(!current||!Number.isInteger(current.workflow_id))return {unknown:true};
 if(all.some(r=>r.head_branch!=='main'||r.workflow_id!==current.workflow_id||!['queued','in_progress','waiting','requested','pending'].includes(r.status)))return {unknown:true};
 return {present:all.some(r=>String(r.id)!==currentId),workflowId:current.workflow_id};
}
// Real orchestration, with bounded I/O ports for offline tests. It never retries a POST.
export async function runHandoff(context,io){
 const id=context.runId+'/'+context.attempt,stamp=()=>({id,day:day(io.now()),at:new Date(io.now()).toISOString()});
 let reservation=null,posted=false;
 const finish=async status=>{if(reservation){const r={...stamp(),kind:'OUTCOME',status};try{await io.outcome(r);}catch{return {status:'OUTCOME_UNPUBLISHED_UNKNOWN',dispatchAttempted:posted};}}return {status,dispatchAttempted:posted};};
 try{
  if(!context.enabled)return {status:'DISABLED',dispatchAttempted:false};
  if(!/^\d+$/.test(context.runId||'')||!/^\d+$/.test(context.attempt||'')||!Number.isFinite(context.loopStart)||io.now()-context.loopStart<3600000)return {status:'EARLY_EXIT_NO_HANDOFF',dispatchAttempted:false};
  const first=await io.fresh();if(!first.marker)return {status:'SUPPRESSED',dispatchAttempted:false};if(!first.sourceMatches)return {status:'SOURCE_CHANGED_NO_DISPATCH',dispatchAttempted:false};
  const book=parseHandoffLedger(first.ledger,io.now());if(book.reservations.has(id))return {status:'ALREADY_RECORDED',dispatchAttempted:false};if(book.pending.length)return {status:'BLOCKED_PENDING',dispatchAttempted:false};
  const d=day(io.now()),today=book.rows.filter(r=>r.day===d),reserved=[...book.reservations.values()];
  if(reserved.filter(r=>r.day===d).length>=6||today.length+2>18||book.rows.length+2>8192||Buffer.byteLength(first.ledger)>4*1024*1024-1024)return {status:'EXHAUSTED',dispatchAttempted:false};
  if(reserved.some(r=>io.now()-Date.parse(r.at)<7200000))return {status:'SPACING_HOLD',dispatchAttempted:false};
  const active=statusSuccessor(await io.statusPages(),context.runId);if(active.unknown)return {status:'UNKNOWN_HISTORY_NO_DISPATCH',dispatchAttempted:false};if(active.present)return {status:'SKIPPED_SUCCESSOR_PRESENT',dispatchAttempted:false};
  const r={...stamp(),kind:'RESERVED',nonce:io.nonce?.()||randomUUID()};
  const pushed=await io.reserve(first,r);if(!pushed){const observed=await io.fresh();const b=parseHandoffLedger(observed.ledger,io.now());if(b.reservations.get(id)?.nonce!==r.nonce)return {status:'RESERVATION_UNPUBLISHED_NO_DISPATCH',dispatchAttempted:false};reservation=r;return finish('SUPPRESSED_AFTER_RESERVATION');}reservation=r;
  const last=await io.fresh();const updated=parseHandoffLedger(last.ledger,io.now());if(!updated.reservations.has(id)||updated.reservations.get(id).nonce!==r.nonce)return finish('UNKNOWN');
  if(updated.pending.some(x=>x!==id))return finish('SUPPRESSED_AFTER_RESERVATION');if(!last.marker)return finish('SUPPRESSED_AFTER_RESERVATION');if(!last.sourceMatches)return finish('SUPPRESSED_SOURCE_CHANGED');
  const at=io.now();posted=true;let code;try{code=await io.post();}catch{return finish('UNKNOWN');}
  if(code===204){await io.wait(30000);let p;try{p=await io.readback(at);}catch{return finish('ATTRIBUTION_UNKNOWN');}
   const candidates=Array.isArray(p?.workflow_runs)?p.workflow_runs.filter(x=>x.event==='workflow_dispatch'&&x.head_branch==='main'&&x.workflow_id===active.workflowId&&validClock(x.created_at)&&Date.parse(x.created_at)>=Math.floor(at/1000)*1000&&Date.parse(x.created_at)<=io.now()):[];
   return finish(Number.isInteger(p?.total_count)&&p.total_count===p?.workflow_runs?.length&&p.total_count<=100&&!/rel\s*=\s*"?next/i.test(p?.link||'')&&candidates.length===1?'DISPATCH_CORRELATED':'ATTRIBUTION_UNKNOWN');}
  return finish(code>=400&&code<500?'DISPATCH_REFUSED':'UNKNOWN');
 }catch(e){const timeout=e?.name==='TimeoutError'||/TIME_BUDGET|ETIMEDOUT/.test(e?.message||'');return reservation?finish(posted?(timeout?'TIMEOUT_UNKNOWN':'UNKNOWN'):(timeout?'SUPPRESSED_TIMEOUT':'SUPPRESSED_AFTER_RESERVATION')):{status:timeout?'TIMEOUT_NO_DISPATCH':'UNVERIFIED_NO_DISPATCH',dispatchAttempted:false};}
}
export function makeDeadline(seconds=180){const end=performance.now()+seconds*1000;return {remaining:()=>Math.max(0,end-performance.now()),timeout(ms){const n=Math.min(ms,end-performance.now());if(n<=0)throw Error('TIME_BUDGET');return Math.max(1,Math.floor(n));}};}
const gitOptions=(budget,extra={})=>({encoding:'utf8',maxBuffer:6*1024*1024,timeout:budget.timeout(20000),...extra});
export async function ledgerCommit(root,head,text,budget){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bot-handoff-index-'));const env={...process.env,GIT_INDEX_FILE:path.join(dir,'index'),GIT_AUTHOR_NAME:'scanner handoff',GIT_AUTHOR_EMAIL:'actions@users.noreply.github.com',GIT_COMMITTER_NAME:'scanner handoff',GIT_COMMITTER_EMAIL:'actions@users.noreply.github.com'};
 const g=async args=>(await exec('git',args,gitOptions(budget,{cwd:root,env}))).stdout.trim();
 try{await g(['read-tree',head]);
  // execFile has no stdin input option: use a temporary owned ledger file for hash-object.
  const file=path.join(dir,'ledger');fs.writeFileSync(file,text,{mode:0o600});const oid=await g(['hash-object','-w',file]);await g(['update-index','--add','--cacheinfo','100644,'+oid+','+LEDGER]);const tree=await g(['write-tree']);
  const msg=path.join(dir,'message');fs.writeFileSync(msg,'bounded bot handoff metadata\n');const commit=await g(['commit-tree',tree,'-p',head,'-F',msg]);const changed=await g(['diff-tree','--no-commit-id','--name-only','-r',head,commit]);if(changed!==LEDGER)throw Error('SCOPE_MISMATCH');return commit;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
export async function casLedger(root,head,text,budget){const commit=await ledgerCommit(root,head,text,budget);try{await exec('git',['push','origin',commit+':refs/heads/main'],gitOptions(budget,{cwd:root,timeout:budget.timeout(15000)}));return true;}catch{return false;}}
export async function main(){
 const root=process.cwd(),env=process.env;
 if(!fs.existsSync(path.join(root,MARKER)))return {status:'DISABLED',dispatchAttempted:false};
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF_NAME!=='main'||!env.GITHUB_TOKEN||!/^\w[\w.-]*\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||''))return {status:'NO_ACTIONS_CONTEXT',dispatchAttempted:false};
 const budget=makeDeadline(),g=async(args,ms=10000)=>(await exec('git',args,gitOptions(budget,{cwd:root,timeout:budget.timeout(ms)}))).stdout;
 const localSources=Object.fromEntries(SOURCES.map(p=>[p,digest(fs.readFileSync(path.join(root,p)))]));
 const witnesses=[env.BOT_HANDOFF_WORKFLOW_SHA256,env.BOT_HANDOFF_HELPER_SHA256];
 if(!/^[a-f0-9]{40}$/.test(env.GITHUB_WORKFLOW_SHA||''))return {status:'LOADED_WORKFLOW_UNKNOWN_NO_DISPATCH',dispatchAttempted:false};
 const loadedWorkflow=await g(['show',env.GITHUB_WORKFLOW_SHA+':'+SOURCES[0]]);if(digest(loadedWorkflow)!==localSources[SOURCES[0]])return {status:'LOADED_WORKFLOW_CHANGED_NO_DISPATCH',dispatchAttempted:false};if(SOURCES.some((p,i)=>!(/^[a-f0-9]{64}$/).test(witnesses[i]||'')||localSources[p]!==witnesses[i]))return {status:'EXECUTING_SOURCE_CHANGED_NO_DISPATCH',dispatchAttempted:false};let reads=0,fetches=0,getCount=0,pushCount=0,last=null;
 const fresh=async(check=true)=>{if(++fetches>4)throw Error('FETCH_BUDGET');let expected=null;if(check){if(++reads>2)throw Error('REF_BUDGET');expected=(await g(['ls-remote','origin','refs/heads/main'])).split(/\s/)[0];}
  await g(['fetch','--no-tags','--depth=1','origin','refs/heads/main'],20000);const head=(await g(['rev-parse','FETCH_HEAD'])).trim();if(expected&&head!==expected)throw Error('HEAD_MOVED');
  const read=async p=>{const entry=(await g(['ls-tree',head,'--',p])).trim();if(!entry)return null;if(!/^100644 blob [a-f0-9]+\t/.test(entry))throw Error('UNREADABLE_TREE_PATH');return g(['show',head+':'+p]);};const marker=await read(MARKER),sourceBodies=await Promise.all(SOURCES.map(read)),ledger=(await read(LEDGER))??'';
  last={head,marker:marker?.trim()==='enabled',sourceMatches:sourceBodies.every((b,i)=>b!==null&&digest(b)===localSources[SOURCES[i]]),ledger};return last;};
 const request=async(url,method='GET')=>{if(method==='GET'&&++getCount>6)throw Error('GET_BUDGET');const r=await fetch('https://api.github.com/repos/'+env.GITHUB_REPOSITORY+url,{method,redirect:'manual',signal:AbortSignal.timeout(budget.timeout(10000)),headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({ref:'main'})}:{})});if(method==='POST')return r.status;
  if(!r.ok)throw Error('HISTORY_UNAVAILABLE');const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>2*1024*1024){await r.body.cancel().catch(()=>{});throw Error('HISTORY_OVERSIZE');}chunks.push(chunk);}return {...JSON.parse(Buffer.concat(chunks).toString('utf8')),link:r.headers.get('link')||''};};
 const io={now:()=>Date.now(),fresh:()=>fresh(true),statusPages:()=>Promise.all(['queued','in_progress','waiting','requested','pending'].map(s=>request('/actions/workflows/bot.yml/runs?branch=main&status='+s+'&per_page=100'))),
  reserve:async(state,row)=>{if(++pushCount>1)throw Error('RESERVATION_BUDGET');return casLedger(root,state.head,appendHandoffLine(state.ledger,row),budget);},
  outcome:async row=>{for(let n=0;n<3;n++){const s=n?await fresh(false):last,book=parseHandoffLedger(s.ledger);if(book.finished.has(row.id)){if(JSON.stringify(book.finished.get(row.id))===JSON.stringify(row))return;throw Error('OUTCOME_CONFLICT');}if(!book.reservations.has(row.id))throw Error('RESERVATION_MISSING');if(++pushCount>4)throw Error('PUSH_BUDGET');if(await casLedger(root,s.head,appendHandoffLine(s.ledger,row),budget))return;}throw Error('OUTCOME_UNPUBLISHED');},
  post:()=>request('/actions/workflows/bot.yml/dispatches','POST'),wait:ms=>{if(budget.remaining()<ms)throw Error('TIME_BUDGET');return new Promise(resolve=>setTimeout(resolve,ms));},readback:()=>request('/actions/workflows/bot.yml/runs?branch=main&event=workflow_dispatch&per_page=100')};
 return runHandoff({enabled:true,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,loopStart:Number(env.BOT_RUN_START_MS)},io);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(x=>console.log('bot handoff: '+JSON.stringify(x))).catch(()=>{console.log('bot handoff: UNVERIFIED; no retry');process.exitCode=1;});
