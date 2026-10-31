// Local Git/object preparation only. Does not apply/install/run the patch.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname),[base,out]=process.argv.slice(2);
if(!/^[a-f0-9]{40}$/.test(base||'')||!out||process.argv.length!==4)throw Error('PINNED_BASE_AND_NEW_OUTPUT_REQUIRED');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function git(args,cwd=root){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-git-')),out=path.join(dir,'out'),err=path.join(dir,'err'),of=fs.openSync(out,'wx'),ef=fs.openSync(err,'wx');try{return await new Promise((resolve,reject)=>{const child=spawn('git',args,{cwd,stdio:['ignore',of,ef],env:{PATH:process.env.PATH,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('LOCAL_GIT_TIMEOUT'));},5000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(fs.statSync(out).size>2097152)reject(Error('LOCAL_GIT_BUDGET'));else resolve({code,stdout:fs.readFileSync(out)});});});}finally{fs.closeSync(of);fs.closeSync(ef);fs.rmSync(dir,{recursive:true,force:true});}}
const read=async p=>{const r=await git(['--no-replace-objects','-c','protocol.allow=never','show',base+':'+p]);if(r.code!==0)throw Error('BASE_FILE_UNAVAILABLE');return r.stdout;};
const before={'ignition-watch.mjs':await read('ignition-watch.mjs'),'.github/workflows/ignition.yml':await read('.github/workflows/ignition.yml')};let code=before['ignition-watch.mjs'].toString();
const once=(s,from,to)=>{if(s.split(from).length!==2)throw Error('PRODUCTION_BASE_ANCHOR_MISMATCH');return s.replace(from,to);};
code=once(code,"import { parseAtom, nyMinuteOf } from './edgar-feed.mjs';","import { parseAtom, nyMinuteOf } from './edgar-feed.mjs';\nimport {createNativeSecShadow} from './native-sec-shadow.mjs';");
code=once(code,'async function pollEdgar(m) {',"const NATIVE_SEC_SHADOW=createNativeSecShadow({enabled:env.IG_NATIVE_SEC_SHADOW==='1',directory:'runtime/native-sec-events/'+INCIDENT_RUN_ID,runId:INCIDENT_RUN_ID,sourceSha:INCIDENT_SHA});\nasync function pollEdgar(m) {");
const request="    const r = await fetch(SEC_WWW + '/cgi-bin/browse-edgar?action=getcurrent&type=' + encodeURIComponent(type) + '&company=&dateb=&owner=include&start=' + start + '&count=100&output=atom', H).catch(() => null);";
code=once(code,request,"    const nativeRequestAt=new Date().toISOString(),nativeUrl=SEC_WWW + '/cgi-bin/browse-edgar?action=getcurrent&type=' + encodeURIComponent(type) + '&company=&dateb=&owner=include&start=' + start + '&count=100&output=atom';\n    const r = await fetch(nativeUrl, H).catch(() => null);\n    const nativeHeadersAt=r?new Date().toISOString():null;");
code=once(code,'EF.polls++; if (!r || !r.ok) { EF.fails++; break; }',"EF.polls++; if (!r || !r.ok) { NATIVE_SEC_SHADOW.observe({body:Buffer.alloc(0),url:nativeUrl,httpStatus:r?.status||0,requestStartedAt:nativeRequestAt,headersReceivedAt:nativeHeadersAt,bodyReceivedAt:null,observedAt:new Date().toISOString(),legacySeen:EF.seen}); EF.fails++; break; }");
code=once(code,'    const ents = parseAtom(await r.text()); let older = false;',`    let nativeText;
    if(NATIVE_SEC_SHADOW.report().enabled){
      let nativeBody;try{nativeBody=Buffer.from(await r.arrayBuffer());}catch(error){NATIVE_SEC_SHADOW.observe({body:Buffer.alloc(0),url:nativeUrl,httpStatus:0,requestStartedAt:nativeRequestAt,headersReceivedAt:nativeHeadersAt,bodyReceivedAt:null,observedAt:new Date().toISOString(),legacySeen:EF.seen});throw error;}
      const nativeBodyAt=new Date().toISOString();nativeText=new TextDecoder().decode(nativeBody);
      NATIVE_SEC_SHADOW.observe({body:nativeBody,url:nativeUrl,httpStatus:r.status,requestStartedAt:nativeRequestAt,headersReceivedAt:nativeHeadersAt,bodyReceivedAt:nativeBodyAt,observedAt:new Date().toISOString(),legacySeen:EF.seen});
    }else nativeText=await r.text();
    const ents = parseAtom(nativeText); let older = false;`);
code=once(code,'const incidentSnapshot=',"if(NATIVE_SEC_SHADOW.report().enabled)console.log('NATIVE_SEC_SHADOW_STATUS='+JSON.stringify(NATIVE_SEC_SHADOW.report()));\nconst incidentSnapshot=");
let workflow=before['.github/workflows/ignition.yml'].toString();workflow=once(workflow,'      NODE_OPTIONS: --max-old-space-size=8192',"      NODE_OPTIONS: --max-old-space-size=8192\n      IG_NATIVE_SEC_SHADOW: '1'  # Only after separate exact-patch approval");workflow=once(workflow,'            runtime/watcher-message-state/','            runtime/watcher-message-state/\n            runtime/native-sec-events/');
const after={'ignition-watch.mjs':Buffer.from(code),'.github/workflows/ignition.yml':Buffer.from(workflow)};for(const file of ['native-sec-events.mjs','native-sec-shadow.mjs','capture-json.mjs']){try{await read(file);throw Error('NEW_FILE_ALREADY_ON_PRODUCTION');}catch(e){if(e.message==='NEW_FILE_ALREADY_ON_PRODUCTION')throw e;}after[file]=fs.readFileSync(path.join(root,file));}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-shadow-patch-'));try{for(const [which,files]of [['old',before],['new',after]])for(const [p,b]of Object.entries(files)){const f=path.join(temp,which,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);}
 const diff=await git(['diff','--no-index','--no-ext-diff','--no-textconv','--','old','new'],temp);if(diff.code!==1)throw Error('LOCAL_DIFF_FAILED');let patch=diff.stdout.toString();patch=patch.replace(/([ab])\/(?:old|new)\//g,'$1/');
 fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'native-sec-shadow.patch'),patch,{flag:'wx'});
 const manifest={kind:'INACTIVE_NATIVE_SEC_SHADOW_PATCH_V1',productionBase:base,patchSha256:hash(patch),files:Object.keys(after).sort(),before:Object.fromEntries(Object.entries(before).map(([p,b])=>[p,hash(b)])),after:Object.fromEntries(Object.entries(after).map(([p,b])=>[p,hash(b)])),unchangedDependencies:{'edgar-feed.mjs':hash(await read('edgar-feed.mjs'))},providerRequestsAdded:0,acceptanceProofFetchesAdded:0,messagesAdded:0,scoringFormulaChanges:0,enabledOnlyAfterPatchApproval:true,artifactPath:'runtime/native-sec-events/',artifactRetentionDays:7,productionChanged:false};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 // Write proposed result only for offline syntax inspection; never execute it.
 fs.writeFileSync(path.join(out,'ignition-watch.proposed.mjs'),code,{flag:'wx'});console.log(JSON.stringify({status:'PREPARED_NOT_APPLIED',patchSha256:manifest.patchSha256,files:manifest.files.length}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
