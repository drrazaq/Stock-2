import fs from 'node:fs';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const W='<WORKTREE_E8AC76D7>';const {bridgeFixture}=await import(W+'/test/helper-a-source-bridge.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const out=[];const K=Number(process.argv[2]||4),TRIALS=Number(process.argv[3]||4);
for(let trial=0;trial<TRIALS;trial++){const cleanups=[];const t={after:f=>cleanups.push(f)};try{
 const x=bridgeFixture(t,{local:true});await x.ready();const signatures={},scope=evidenceHash(x.plan);
 for(const c of x.contexts)for(const item of x.required.items){const e=item.envelope,envelope={url:e.url,responseUrl:e.responseUrl,redirected:false,httpStatus:200,...Object.fromEntries(['requestStartedAt','headersReceivedAt','bodyReceivedAt','observedAt'].map(k=>[k,new Date(Date.parse(e[k])).toISOString()])),bodySha256:e.bodySha256,bodyBase64:e.bodyBase64},body={scope,role:c.role,collectorId:c.collectorId,contractHash:x.plan.contractHash,envelopeHash:createHash('sha256').update(Buffer.from(JSON.stringify(envelope))).digest('hex'),recordedAt:envelope.bodyReceivedAt,signedAt:envelope.bodyReceivedAt,executionContextId:c.executionContextId,writeAuthorityId:c.writeAuthorityId,transportReference:c.transportReference,sourceCodeSha:c.sourceCodeSha,itemId:item.id};signatures[evidenceHash(body)]=c.signReceipt(body);}
 const config={signatures,local:x.localAddress(),plan:x.plan,request:x.request,token:x.f.token,evaluationDirectory:x.f.root+'/store',originalsDirectory:x.f.directory,contexts:x.contexts.map(({store,client,signReceipt,clock,...rest})=>rest)},file=x.f.root+'/cfg.json';fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});
 const go=Date.now()+1500;const run=()=>new Promise(res=>{const c=spawn(process.execPath,['--import','<NOEXT_GUARD>','<PROBE_DIR>/racer.mjs',file,String(go)],{stdio:['ignore','pipe','pipe']});let s='',e='';c.stdout.on('data',b=>s+=b);c.stderr.on('data',b=>e+=b);c.on('exit',code=>res({code,out:s.trim(),err:e.slice(0,200)}));});
 const results=await Promise.all(Array.from({length:K},run));const counts={};for(const call of x.calls){const k=call.role+':'+call.id;counts[k]=(counts[k]||0)+1;}
 out.push({trial,racers:K,plannedMax:x.plan.items.length*2,serverGets:x.calls.length,maxPerItem:Math.max(...Object.values(counts)),results:results.map(r=>r.out||('EXIT'+r.code+':'+r.err))});
 // restart after all: no further GETs
 const before=x.calls.length;const again=await run();out[out.length-1].rerunExtraGets=x.calls.length-before;out[out.length-1].rerun=again.out;
}finally{for(const f of cleanups.reverse())try{await f();}catch{}}}
console.log(JSON.stringify(out,null,1));
