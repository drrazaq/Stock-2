// Prepared service adapters. Every external client is injected; no global fetch,
// credentials from environment, SDK installation or implicit activation.
import path from 'node:path';
import {captureJson} from './capture-json.mjs';
import {immutableRead,FIXED_UNIVERSE} from './paper-capture-wrapper.mjs';
const need=(x,c)=>{if(!x)throw Error(c);};
export function providerPort({fetcher,keyId,secret}){
 need(typeof fetcher==='function'&&typeof keyId==='string'&&typeof secret==='string','EXPLICIT_PROVIDER_CLIENT_REQUIRED');
 return (url,o)=>{const u=new URL(url);need(u.username===''&&u.password===''&&u.hash===''&&u.origin==='https://data.alpaca.markets'&&u.pathname==='/v2/stocks/snapshots'&&u.searchParams.get('feed')==='sip'&&u.searchParams.get('symbols')===FIXED_UNIVERSE.join(',')&&[...u.searchParams.keys()].sort().join('|')==='feed|symbols'&&o.method==='GET'&&o.redirect==='error'&&o.signal,'PROVIDER_ENDPOINT_SCOPE');return fetcher(url,{method:'GET',redirect:'error',signal:o.signal,headers:{'APCA-API-KEY-ID':keyId,'APCA-API-SECRET-KEY':secret}});};
}
export function historyPort({fetcher,token}){
 need(typeof fetcher==='function'&&typeof token==='string','EXPLICIT_HISTORY_CLIENT_REQUIRED');return async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetcher('https://api.github.com/repos/drrazaq/Stock-2/actions/workflows/sec-paper-capture.yml/runs?per_page=100',{method:'GET',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});need(r.status===200,'HISTORY_UNAVAILABLE');const reader=r.body.getReader(),parts=[];let count=0;try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;need(count<=262144,'HISTORY_BODY_BUDGET');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}return captureJson(Buffer.concat(parts).toString());}finally{clearTimeout(timer);controller.abort();}
 };
}
export function eventFilePort({file}){return async()=>immutableRead(file,131072).bytes.toString();}
export function artifactPort({uploadArtifact}){
 need(typeof uploadArtifact==='function','EXPLICIT_ARTIFACT_CLIENT_REQUIRED');return async x=>{
  const original=immutableRead(x.file,16*1024*1024);need(original.hash===x.sha256&&original.bytes.length===x.bytes.length&&path.basename(x.file)===x.name&&x.retentionDays===3,'ARTIFACT_FILE_SCOPE');
  // Same method/response shape as the Actions artifact client; no retry is added here.
  const r=await uploadArtifact('paper-capture-'+String(x.sequence).padStart(3,'0'),[x.file],path.dirname(x.file),{retentionDays:3});
  const current=immutableRead(x.file,16*1024*1024);need(current.hash===original.hash&&current.signature===original.signature,'ARTIFACT_FILE_MUTATION');
  return {success:true,artifactId:r.id,archiveSha256:r.digest,archiveBytes:r.size,fileSha256:original.hash,fileBytes:original.bytes.length,retentionDays:3};
 };
}
