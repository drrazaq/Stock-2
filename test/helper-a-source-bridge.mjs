// SYNTHETIC original responses and local services only. Never a retained/prospective capture.
import fs from 'node:fs';import http from 'node:http';
import {nativeImportFixture} from './helper-a-native-import.mjs';
import {createAFencedStore} from '../a-fenced-store.mjs';
import {createABoundedResponseClient,nativeResponseRequirements,runAResponseBoundImport} from '../a-source-acquisition-bridge.mjs';
import {runASourceEvidenceBindings} from '../tools/a-acquisition-rehearsal.mjs';
import {evidenceHash} from '../reclaim-research-workflow.mjs';
export function bridgeFixture(t,{local=false,loss=false,change=null}={}){
 const f=nativeImportFixture({loss});t.after(f.cleanup);if(change)change(f);const request=f.request(),required=nativeResponseRequirements({request,originalsDirectory:f.directory});
 const plan={version:1,origin:'SYNTHETIC',adopted:false,cohortHash:f.store.head().cohortHash,createdAt:'2026-11-02T00:00:00Z',contractHash:evidenceHash(f.contract),items:required.items.map(({envelope,original,securityId,...i})=>i)};
 const calls=[],overrides=new Map(),contexts=[];let server,port;
 const bytes=(item,role)=>{const old=required.items.find(x=>x.id===item.id),change=overrides.get(role+':'+item.id)||{};return {bytes:change.bytes??Buffer.from(old.envelope.bodyBase64,'base64'),status:change.status??200,hang:change.hang||false};};
 if(local){server=http.createServer((req,res)=>{const [role,id]=req.url.slice(1).split('/'),item=plan.items.find(x=>x.id===id),data=bytes(item,role);calls.push({role,id,route:item.url,local:true});res.writeHead(data.status);if(data.hang){res.write('SYNTHETIC_PREFIX');return;}res.end(data.bytes);});t.after(()=>{server.closeAllConnections();server.close();});}
 function ready(){return local?new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{port=server.address().port;resolve();})):Promise.resolve();}
 for(const role of ['CAPTURE','WITNESS']){
  const directory=f.root+'/'+role,store=createAFencedStore(directory,{origin:'SYNTHETIC',cohortHash:'a'.repeat(64),contractHash:evidenceHash(f.contract)}),token=store.claim({expectedToken:null,owner:'SYNTHETIC_'+role,at:plan.createdAt,boundaryEvidenceHash:'b'.repeat(64)}).token;
  const spoolDirectory=f.root+'/'+role+'-spool';fs.mkdirSync(spoolDirectory,{mode:0o700});const pending=new Set(),clock={value:Date.parse(plan.createdAt),set(value){this.value=value;for(const id of [...pending])if(id.due<=value){pending.delete(id);clearTimeout(id.wall);id.fn();}}},timers={set(fn,delay){const id={fn,due:clock.value+delay,wall:setTimeout(()=>{pending.delete(id);fn();},1000)};pending.add(id);return id;},clear(id){if(id){pending.delete(id);clearTimeout(id.wall);}}},c={role,collectorId:'SYNTHETIC_COLLECTOR_'+role,executionContextId:'SYNTHETIC_HOST_'+role,writeAuthorityId:'SYNTHETIC_WRITER_'+role,transportReference:f.contract.collectors.find(r=>r.role===role).provenanceReference,sourceCodeSha:f.native.sourceSha,directory,spoolDirectory,store,token,clock};
  const transport=async(url,options)=>{const item=c.active;
   if(local){const response=await fetch('http://127.0.0.1:'+port+'/'+role+'/'+item.id,options);return {url,redirected:false,status:response.status,body:response.body};}
   calls.push({role,id:item.id,route:url,local:false});const data=bytes(item,role);return {url,redirected:false,status:data.status,body:(async function*(){yield data.bytes;})()};
  };
  const client=createABoundedResponseClient({fetcher:transport,clock:()=>clock.value,timers,limits:{requests:32,bodyBytes:65536,totalBytes:1024*1024,timeoutMs:1000}});
  c.client={get:item=>{c.active=item;clock.set(Date.parse(item.notBefore));return client.get(item);},now:client.now,stats:client.stats};
  c.signReceipt=body=>f.signed({file:'unused',sha256:body.envelopeHash},role,body.recordedAt,body).receipt;contexts.push(c);
 }
 const run=()=>runASourceEvidenceBindings({store:f.store,originalsDirectory:f.directory,requestRef:f.raw(request),planRef:f.raw(plan),contexts});
 const reopen=()=>{f.store=createAFencedStore(f.root+'/store');for(const c of contexts)c.store=createAFencedStore(c.directory);};
 const snapshot=dir=>Object.fromEntries(fs.readdirSync(dir).map(n=>[n,fs.readFileSync(dir+'/'+n)]));
 return {f,request,required,plan,contexts,calls,overrides,ready,run,reopen,snapshot,localAddress:()=>local?'http://127.0.0.1:'+port:null};
}
