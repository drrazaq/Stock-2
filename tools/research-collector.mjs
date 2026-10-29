// Artifact-only CLI. Live collection requires a separately approved, pinned manifest.
// This interlock records authorization scope; possession of a file is not approval.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createResearchCollector,researchSession} from '../research-collector.mjs';
const args=process.argv.slice(2),env=process.env,now=Date.now();
let mode=args[0],manifest,fixtures;
if(mode==='--fixture'){
 if(args.length!==2)throw Error('fixture input required');fixtures=JSON.parse(fs.readFileSync(args[1],'utf8'));
 if(!Array.isArray(fixtures.cycles)||fixtures.cycles.length>331)throw Error('invalid fixture cycles');
 manifest={sourceSha:'fixture',maxCycles:fixtures.cycles.length,maxCompressedBytes:8*1024*1024,maxRequests:420};
}else if(mode==='--collect'){
 if(args.length!==2)throw Error('approved manifest required');manifest=JSON.parse(fs.readFileSync(args[1],'utf8'));
 if(env.GITHUB_ACTIONS!=='true'||!['main','Stock2-safety-fixes'].includes(env.GITHUB_REF_NAME)||manifest.mode!=='RESEARCH_ONLY'||!/^[a-f0-9]{40}$/.test(manifest.sourceSha)||manifest.sourceSha!==env.STOCK2_SOURCE_SHA)throw Error('collection source/approval interlock blocked');
 const approved=Date.parse(manifest.approvedAt),expires=Date.parse(manifest.expiresAt);
 if(!Number.isFinite(approved)||!Number.isFinite(expires)||approved>now||now>=expires||expires-approved>86400000||manifest.sessionDay!==researchSession(now).day)throw Error('expired/invalid collection approval');
 if(!Number.isInteger(manifest.maxCycles)||manifest.maxCycles<1||manifest.maxCycles>330||!Number.isInteger(manifest.maxCompressedBytes)||manifest.maxCompressedBytes<1||manifest.maxCompressedBytes>128*1024*1024)throw Error('invalid collection budget');
}else throw Error('use --fixture INPUT or --collect APPROVED_MANIFEST; no default live mode');
const id=mode==='--fixture'?'fixture':String(env.GITHUB_RUN_ID)+'-'+String(env.GITHUB_RUN_ATTEMPT);
if(!(mode==='--fixture'?id==='fixture':/^\d+-\d+$/.test(id)))throw Error('invalid artifact run identity');
const out=path.join('research-output',id);fs.mkdirSync(out,{recursive:true});
let payloads=[];
const collector=createResearchCollector({env:mode==='--fixture'?{MASSIVE_KEY:'fixture',FINNHUB_KEY:'fixture'}:env,maxRequests:manifest.maxRequests,
 ...(mode==='--fixture'?{fetcher:async()=>{const body=payloads.shift();if(body===undefined)throw Error('unexpected fixture request');return {ok:true,status:200,json:async()=>body};}}:{})});
let bytes=0,lastAt,failed=false;
const summary={mode:'RESEARCH_ONLY',sourceSha:manifest.sourceSha,startedAt:new Date(now).toISOString(),attempt:id,cycles:0,observedCycles:0,lateStart:false,termination:null,orders:false,approvedBuy:false};
// An early authorized runner may wait, but never request data before 04:00 NY.
while(mode==='--collect'&&researchSession(Date.now()).market.known&&!researchSession(Date.now()).market.closed&&researchSession(Date.now()).minute<240&&Date.now()<Date.parse(manifest.expiresAt))await new Promise(r=>setTimeout(r,Math.min(60000,Date.parse(manifest.expiresAt)-Date.now())));
for(let i=0;i<manifest.maxCycles;i++){
 const tick=mode==='--fixture'?fixtures.cycles[i].at:new Date().toISOString(),ms=Date.parse(tick);
 if(mode==='--collect'&&ms>=Date.parse(manifest.expiresAt)){summary.termination='APPROVAL_EXPIRED';failed=true;break;}
 if(mode==='--fixture')payloads=fixtures.cycles[i].responses.slice();
 if(i===0)summary.lateStart=researchSession(ms).minute>240;
 const r=await collector.cycle({now:ms,readText:f=>fs.readFileSync(f,'utf8')});lastAt=tick;
 if(r.status==='OUTSIDE_PREMARKET'){summary.termination='OUTSIDE_PREMARKET';break;}
 const gz=zlib.gzipSync(JSON.stringify(r));
 if(bytes+gz.length>manifest.maxCompressedBytes){summary.termination='ARTIFACT_BUDGET_EXCEEDED';failed=true;break;}
 fs.writeFileSync(path.join(out,String(i).padStart(3,'0')+'.json.gz'),gz,{flag:'wx'});bytes+=gz.length;summary.cycles++;
 if(r.status==='OBSERVED')summary.observedCycles++;
 fs.writeFileSync(path.join(out,'heartbeat.json'),JSON.stringify({at:tick,metrics:r.metrics,lastSuccessfulCycle:r.lastSuccessfulCycle,requests:r.requests,status:r.status}));
 if(r.providers?.some(x=>x.status==='REQUEST_BUDGET_EXHAUSTED')){summary.termination='REQUEST_BUDGET_EXHAUSTED';failed=true;break;}
 if(mode==='--collect')await new Promise(resolve=>setTimeout(resolve,Math.max(1,60000-(Date.now()-ms))));
}
summary.termination||='CYCLE_LIMIT';summary.bytes=bytes;summary.requests=collector.state.requests;summary.uniqueMinutes=collector.state.minutes.length;
summary.executionWindowComplete=summary.uniqueMinutes===330&&!summary.lateStart;
summary.allMinutesHadSomeFreshPrices=summary.executionWindowComplete&&summary.observedCycles===330;
summary.tradableUniverseCoverage='UNVERIFIED';
summary.lastSuccessfulCycle=collector.state.lastSuccessfulCycle;
if(lastAt)fs.writeFileSync(path.join(out,'discovery.json'),JSON.stringify(collector.report(lastAt)));
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(failed)process.exitCode=1;
