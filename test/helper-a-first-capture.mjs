import fs from 'node:fs';import http from 'node:http';
import {createABoundedResponseClient} from '../a-source-acquisition-bridge.mjs';
// Synthetic schedule and local-service oracle. Never original market/prospective evidence.
import {bridgeFixture} from './helper-a-source-bridge.mjs';
import {runASourceFirstCaptureBindings,advanceASourceFirstCaptureBindings} from '../tools/a-acquisition-rehearsal.mjs';
import {evidenceHash} from '../reclaim-research-workflow.mjs';
export function firstCaptureFixture(t,options={}){
 const x=bridgeFixture(t,{...options,local:false,change:f=>{
  // A new SYNTHETIC case, not rewritten retained evidence: discovery13:00:30, plan13:00:35, identity13:00:40.
  const binding=f.bundle.nativeBinding,id=binding.identity,at='2026-11-04T13:00:40Z';
  for(const k of Object.keys(id.sources)){const v=JSON.parse(fs.readFileSync(f.directory+'/'+id.sources[k].file));for(const key of ['requestStartedAt','headersReceivedAt','bodyReceivedAt','observedAt'])v[key]=at;id.sources[k]=f.signed(f.raw(v),'CAPTURE',at);}
  const review=JSON.parse(fs.readFileSync(f.directory+'/'+id.review.file));review.sourceHashes=Object.fromEntries(Object.entries(id.sources).map(([k,v])=>[k,v.sha256]));id.review=f.signed(f.raw(review),'REVIEW','2026-11-04T13:00:41Z');
  f.input.identityEvidenceId='A_IDENTITY_'+evidenceHash({...review.sourceHashes,validFrom:review.validFrom,validUntil:review.validUntil});f.input.identityAsOf='2026-11-04T13:00:41Z';
  const p=JSON.parse(fs.readFileSync(f.directory+'/'+binding.provenance.file));p.identityReviewHash=id.review.sha256;binding.provenance=f.signed(f.raw(p),'REVIEW','2026-11-04T13:03:00Z');
  f.refreshDecision();f.bundle.outcomes=f.seal(f.makeTape(f.records));f.syncWitness(f.records);
  if(options.change)options.change(f);
 }}),ordered=[...x.required.items].sort((a,b)=>Date.parse(a.notBefore)-Date.parse(b.notBefore)||a.id.localeCompare(b.id));
 const decisionAt=Date.parse(x.f.input.asOf),plan={kind:'A_FIRST_CAPTURE_SCHEDULE_PROPOSED_V1',version:1,origin:'SYNTHETIC',adopted:false,cohortHash:x.f.store.head().cohortHash,contractHash:evidenceHash(x.f.contract),policyHash:evidenceHash(x.f.policy),observationId:x.f.input.observationId,securityId:x.f.input.securityId,createdAt:'2026-11-04T13:00:35Z',startsAt:ordered[0].notBefore,decisionDeadline:new Date(decisionAt+1000).toISOString(),endsAt:new Date(Math.max(...ordered.map(i=>Date.parse(i.deadline)))).toISOString(),items:ordered.map((i,n)=>({id:'SLOT_'+n,phase:Date.parse(i.notBefore)<=decisionAt?'ENTRY':'FOLLOWUP',url:i.url,notBefore:i.notBefore,deadline:i.deadline}))};
 let now=Date.parse(plan.createdAt);const planRef=x.f.raw(plan),contractRef=x.f.raw(x.f.contract);const nativeOutputDirectory=x.f.root+'/frozen-native';fs.mkdirSync(nativeOutputDirectory,{mode:0o700});const nativeRef=x.f.raw({directory:x.f.native.directory,expectedRunId:x.f.native.runId,expectedSourceSha:x.f.native.sourceSha});
 let port,server;const local=options.local===true;
 if(local){server=http.createServer((req,res)=>{const [role,id]=req.url.slice(1).split('/'),index=plan.items.findIndex(i=>i.id===id),original=ordered[index],override=x.overrides.get(role+':'+original.id)||{};x.calls.push({role,id,route:original.url,local:true});if(override.reset){req.socket.destroy();return;}res.writeHead(override.status||200,{'Connection':'close'});res.end(override.bytes||Buffer.from(original.envelope.bodyBase64,'base64'));});t.after(()=>{server.closeAllConnections();server.close();});}
 const ready=()=>local?new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve();})):Promise.resolve();
 for(const c of x.contexts){const originalGet=c.client.get;if(!local){c.client.get=item=>{const old=ordered[plan.items.findIndex(i=>i.id===item.id)];return originalGet({...item,id:old.id});};continue;}
  const client=createABoundedResponseClient({clock:()=>c.clock.value,timers:{set:fn=>setTimeout(fn,1000),clear:clearTimeout},limits:{requests:32,bodyBytes:65536,totalBytes:1048576,timeoutMs:1000},fetcher:async(url,init)=>{const r=await fetch('http://127.0.0.1:'+port+'/'+c.role+'/'+c.active.id,init);return {url,status:r.status,body:r.body};}});
  c.client={get:item=>{c.active=item;c.clock.set(Date.parse(item.notBefore));return client.get(item);},now:client.now,stats:client.stats};
 }
 const at=v=>{now=typeof v==='number'?v:Date.parse(v);for(const c of x.contexts)c.clock.set(now);};
 const step=(action,extra={})=>runASourceFirstCaptureBindings({store:x.f.store,token:x.f.token,contexts:x.contexts,originalsDirectory:x.f.directory,planRef,contractRef,nativeRef,nativeOutputDirectory,clock:()=>now,action,...extra});
 const advance=(extra={})=>advanceASourceFirstCaptureBindings({store:x.f.store,token:x.f.token,contexts:x.contexts,originalsDirectory:x.f.directory,planRef,contractRef,nativeRef,nativeOutputDirectory,clock:()=>now,...extra});
 async function entry(){for(const i of plan.items.filter(i=>i.phase==='ENTRY')){at(i.notBefore);const r=await step('capture',{itemId:i.id});if(r.status!=='FIRST_RESPONSE_DURABLE')throw Error(JSON.stringify(r));}at(x.f.input.asOf);return step('freeze-decision',{decisionRef:x.f.raw(x.f.input)});}
 async function followups(){for(const i of plan.items.filter(i=>i.phase==='FOLLOWUP')){at(i.notBefore);const r=await step('capture',{itemId:i.id});if(r.status!=='FIRST_RESPONSE_DURABLE')throw Error(JSON.stringify(r));}at(plan.endsAt);}
 at(plan.createdAt);return {...x,ready,advance,nativeOutputDirectory,firstPlan:plan,firstPlanRef:planRef,contractRef,at,step,entry,followups,decisionAt,requestRef:()=>x.f.raw(x.request)};
}
