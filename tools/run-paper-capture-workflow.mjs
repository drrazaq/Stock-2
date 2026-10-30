// Offline host for the complete guarded wrapper. No --collect/live mode exists.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureJson} from '../capture-json.mjs';
import {runGuardedCapture,immutableRead} from '../paper-capture-wrapper.mjs';
import {fixtureZip} from '../capture-artifact.mjs';
import {sha} from '../prospective-paper-capture.mjs';
export async function simulateWorkflow(file,output){
 const x=captureJson(immutableRead(file,1024*1024).bytes.toString());if(x.fixtureMarker!=='STOCK2_SYNTHETIC_CAPTURE_ONLY')throw Error('SYNTHETIC_ONLY');
 const refs=captureJson(immutableRead(x.referenceFile,2*1024*1024).bytes.toString());if(!refs.records.every(r=>['massive','alpaca'].every(k=>captureJson(r[k].raw).synthetic===true)))throw Error('SYNTHETIC_REFERENCES_REQUIRED');
 let clock=x.nowMs,calls=0;const archives=new Map();
 const result=await runGuardedCapture({...x,output,key:'synthetic-paper-capture-key-only',now:()=>clock,wait:async ms=>{clock+=ms;},ports:{
  history:async()=>x.history,
  events:async({at})=>JSON.stringify({events:clock===Date.parse(x.start)?x.events:[]}),
  provider:async(url,options)=>{if(options.method!=='GET'||!url.startsWith('https://data.alpaca.markets/v2/stocks/snapshots?'))throw Error('MOCK_ENDPOINT');calls++;const minute=Math.floor((clock-Date.parse(x.start))/60000);const body=Object.fromEntries(x.universe.map((s,i)=>[s,{latestQuote:{t:new Date(clock).toISOString(),bp:i===0&&minute>=31?10.99:9.99,ap:i===0&&minute>=31?11.01:10.01,bs:1000,as:1000},minuteBar:{t:new Date(Date.parse(x.start)+(minute-1)*60000).toISOString(),l:9,h:11,v:250000}}]));return new Response(JSON.stringify(body));},
  upload:async({name,bytes,sha256,sequence,retentionDays})=>{const zip=fixtureZip(name,bytes),id=sequence+1;archives.set(id,zip);return {success:true,artifactId:id,archiveSha256:sha(zip),archiveBytes:zip.length,fileSha256:sha256,fileBytes:bytes.length,retentionDays};}
 }});
 const dir=path.join(output,'mock-downloads');fs.mkdirSync(dir);for(const [id,zip]of archives)fs.writeFileSync(path.join(dir,'artifact-'+id+'.zip'),zip,{flag:'wx',mode:0o600});
 return {status:result.status,providerRequests:0,simulatedProviderRequests:calls,confirmedUploads:result.confirmedUploads,receiptManifestSha256:result.receiptManifestSha256,genuineAdmissions:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{if(process.argv.length!==5||process.argv[2]!=='--simulate')throw Error('OFFLINE_ONLY');console.log(JSON.stringify(await simulateWorkflow(process.argv[3],process.argv[4])));}catch{console.error('PAPER_CAPTURE_WRAPPER_BLOCKED');process.exitCode=1;}}
