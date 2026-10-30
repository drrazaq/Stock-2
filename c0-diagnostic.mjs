// Dedicated bounded coverage diagnostic. No strategy, owner state, orders or delivery.
// Imported functions use injected I/O in tests. Only the guarded CLI may run live.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {marketSession} from './market-session.mjs';
import {marketSymbol} from './market-symbol.mjs';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
export const C0_CAPS=Object.freeze({attempts:400,perMinute:60,assets:20000,batch:200,body:8*1024*1024,allBodies:128*1024*1024,compressed:64*1024*1024,sealed:96*1024*1024,plain:128*1024*1024,timeoutMs:15000});
export const c0Hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const object=x=>x&&typeof x==='object'&&!Array.isArray(x),sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const instant=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===(x.includes('.')?x:x.replace('Z','.000Z'));
const fail=code=>{throw Error(code);};
const cancel=body=>{try{Promise.resolve(body?.cancel()).catch(()=>{});}catch{}};
function abortable(promise,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('REQUEST_TIMEOUT'));return;}const abort=()=>reject(Error('REQUEST_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
const fieldTime=x=>typeof x==='string'&&new Date(x.slice(0,10)+'T00:00:00Z').toString()!=='Invalid Date'&&new Date(x.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===x.slice(0,10)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
export function parseC0Json(text){
 let at=0,nodes=0;const ws=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]))at++;};
 const str=()=>{const from=at++;while(at<text.length){if(text[at]==='\\'){at+=2;continue;}if(text[at++]==='"')return JSON.parse(text.slice(from,at));}fail('JSON_SCHEMA');};
 function value(depth){if(depth>64||++nodes>500000)fail('JSON_SCHEMA');ws();const ch=text[at];
  if(ch==='"'){str();return;}if(ch==='{'||ch==='['){at++;ws();const end=ch==='{'?'}':']',keys=new Set();if(text[at]===end){at++;return;}while(at<text.length){if(ch==='{'){if(text[at]!=='"')fail('JSON_SCHEMA');const key=str();if(keys.has(key))fail('JSON_SCHEMA');keys.add(key);ws();if(text[at++]!==':')fail('JSON_SCHEMA');}value(depth+1);ws();if(text[at]===end){at++;return;}if(text[at++]!==',')fail('JSON_SCHEMA');ws();}fail('JSON_SCHEMA');}
  const from=at;while(at<text.length&&!/[ ,}\]\t\r\n]/.test(text[at]))at++;if(at===from)fail('JSON_SCHEMA');
 }
 value(0);ws();if(at!==text.length)fail('JSON_SCHEMA');return JSON.parse(text,(_,x)=>{if(typeof x==='number'&&!Number.isFinite(x))fail('JSON_SCHEMA');return x;});
}
export function validateC0Approval(a,sourceSha){
 if(!object(a)||a.kind!=='STOCK2_C0_APPROVAL_V1'||a.granted!==true||a.mode!=='RESEARCH_ONLY'||a.sourceSha!==sourceSha||!sha(sourceSha)||typeof a.workflowSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.workflowSha256)||typeof a.ownerApprovalReference!=='string'||!a.ownerApprovalReference.trim()||a.ownerApprovalReference.length>200||a.entitlementConfirmed!==true||typeof a.entitlementEvidenceReference!=='string'||!a.entitlementEvidenceReference.trim()||a.entitlementEvidenceReference.length>300||a.attempt!==1||a.feed!=='sip'||a.runGuard!=='PUBLIC_GITHUB_WORKFLOW_DATE_V1'||typeof a.allowDelayedBaseline!=='boolean')fail('APPROVAL_REQUIRED_OR_SCOPE_INVALID');
 if(!instant(a.approvedAt)||!instant(a.start)||!instant(a.expires)||Date.parse(a.approvedAt)>Date.parse(a.start)||Date.parse(a.start)-Date.parse(a.approvedAt)>86400000||Date.parse(a.expires)-Date.parse(a.start)!==900000)fail('APPROVAL_CLOCK_OR_WINDOW_INVALID');
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(a.start)).forEach(x=>p[x.type]=x.value);
 const day=p.year+'-'+p.month+'-'+p.day,s=marketSession(day);
 if(!s.known||s.closed||p.hour!=='08'||p.minute!=='45'||new Date(a.start).getUTCSeconds()!==0||new Date(a.start).getUTCMilliseconds()!==0)fail('UNREVIEWED_OR_WRONG_SESSION');
 if(!object(a.limits)||Object.keys(C0_CAPS).some(k=>!Number.isSafeInteger(a.limits[k])||a.limits[k]<1||a.limits[k]>C0_CAPS[k]))fail('APPROVAL_BUDGET_INVALID');
 return {sourceSha,approvalHash:c0Hash(a),day,start:Date.parse(a.start),expires:Date.parse(a.expires),limits:{...a.limits}};
}
function noLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())fail('OUTPUT_SYMLINK_BLOCKED');if(path.dirname(p)===p)break;}}
export function openC0Journal({directory,secret,sourceSha,approvalHash,limits,create=false}){
 if(!sha(sourceSha)||!/^[a-f0-9]{64}$/.test(approvalHash||''))fail('JOURNAL_SCOPE_INVALID');
 sealResearch(Buffer.alloc(0),secret,{sourceSha,path:'key-check'});noLinks(directory);
 if(create)fs.mkdirSync(directory,{mode:0o700});else if(!fs.statSync(directory).isDirectory())fail('JOURNAL_DIRECTORY_REQUIRED');
 const frames=[];let sealedBytes=0,compressedBytes=0,plainBytes=0;
 const files=[];for(const name of fs.readdirSync(directory)){
  if(!/^cycle-[0-2]$/.test(name))fail('JOURNAL_UNEXPECTED_ENTRY');const dir=path.join(directory,name);noLinks(dir);if(!fs.statSync(dir).isDirectory())fail('JOURNAL_UNEXPECTED_ENTRY');
  for(const file of fs.readdirSync(dir)){if(!/^checkpoint-\d{3}\.json\.gz\.enc$/.test(file))fail('JOURNAL_INCOMPLETE_OR_UNEXPECTED_FILE');files.push({file:path.join(dir,file),cycle:Number(name.slice(-1)),name:file});}
 }
 files.sort((a,b)=>a.name.localeCompare(b.name));
 for(const {file,cycle,name} of files){noLinks(file);const st=fs.statSync(file);sealedBytes+=st.size;if(!st.isFile()||st.size>12*1024*1024||sealedBytes>limits.sealed)fail('JOURNAL_INPUT_BUDGET');
  const env=JSON.parse(fs.readFileSync(file,'utf8')),relative=name.slice(0,-4);if(env.context?.sourceSha!==sourceSha||env.context?.path!==relative)fail('JOURNAL_SOURCE_PATH_MISMATCH');
  const zipped=openResearch(env,secret);compressedBytes+=zipped.length;if(compressedBytes>limits.compressed)fail('JOURNAL_COMPRESSED_BUDGET');
  const bytes=zlib.gunzipSync(zipped,{maxOutputLength:limits.body+1024*1024});plainBytes+=bytes.length;if(plainBytes>limits.plain)fail('JOURNAL_PLAIN_BUDGET');
  const x=JSON.parse(bytes.toString());if(x.kind!=='C0_DIAGNOSTIC_FRAME_V1'||x.sourceSha!==sourceSha||x.approvalHash!==approvalHash||x.sequence!==frames.length||x.frame?.cycle!==cycle||!['intent','response','cycle_end','failure'].includes(x.frame?.type))fail('JOURNAL_FRAME_SCOPE_INVALID');frames.push(x.frame);
 }
 function append(frame){
  noLinks(directory);if(frames.length>=900||!Number.isInteger(frame.cycle)||frame.cycle<0||frame.cycle>2)fail('JOURNAL_FRAME_BUDGET');
  const payload={kind:'C0_DIAGNOSTIC_FRAME_V1',sourceSha,approvalHash,sequence:frames.length,frame},plain=Buffer.from(JSON.stringify(payload));
  if(plain.length>limits.body+1024*1024||plainBytes+plain.length>limits.plain)fail('JOURNAL_PLAIN_BUDGET');
  const zipped=zlib.gzipSync(plain);if(compressedBytes+zipped.length>limits.compressed)fail('JOURNAL_COMPRESSED_BUDGET');
  const relative='checkpoint-'+String(frames.length).padStart(3,'0')+'.json.gz',encoded=Buffer.from(JSON.stringify(sealResearch(zipped,secret,{sourceSha,path:relative})));
  if(encoded.length>12*1024*1024||sealedBytes+encoded.length>limits.sealed)fail('JOURNAL_SEALED_BUDGET');
  const dir=path.join(directory,'cycle-'+frame.cycle);noLinks(dir);fs.mkdirSync(dir,{recursive:true,mode:0o700});noLinks(dir);
  const tmp=path.join(dir,'.pending-'+randomUUID()),dest=path.join(dir,relative+'.enc');
  try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.linkSync(tmp,dest);const fdDir=fs.openSync(dir,'r');try{fs.fsyncSync(fdDir);}finally{fs.closeSync(fdDir);}}finally{try{fs.unlinkSync(tmp);}catch{}}
  frames.push(frame);sealedBytes+=encoded.length;compressedBytes+=zipped.length;plainBytes+=plain.length;
 }
 return {append,frames,report:()=>({files:frames.length,sealedBytes,compressedBytes,plainBytes,remoteDurability:'NOT_ESTABLISHED'})};
}
export async function runC0Cycle({approval,sourceSha,directory,secret,cycle,credentials,previousUploadConfirmed=false,runId,fetcher=fetch,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const scope=validateC0Approval(approval,sourceSha),L=scope.limits;
 if(typeof runId!=='string'||!/^\d{1,20}$/.test(runId))fail('RUN_ID_REQUIRED');
 if(!Number.isInteger(cycle)||cycle<0||cycle>2||cycle>0&&previousUploadConfirmed!==true)fail('CYCLE_OR_PRIOR_UPLOAD_UNCONFIRMED');
 if(!object(credentials)||typeof credentials.alpacaKey!=='string'||!credentials.alpacaKey||typeof credentials.alpacaSecret!=='string'||!credentials.alpacaSecret||approval.allowDelayedBaseline&&(!credentials.massiveKey||typeof credentials.massiveKey!=='string'))fail('CREDENTIAL_UNAVAILABLE');
 const journal=openC0Journal({directory,secret,sourceSha,approvalHash:scope.approvalHash,limits:L,create:cycle===0});
 const monotonicStart=performance.now();
 const expected=Array.from({length:cycle},(_,i)=>i),ends=journal.frames.filter(f=>f.type==='cycle_end');
 if(ends.length!==cycle||ends.some((f,i)=>f.cycle!==expected[i]||f.status!=='LOCAL_COLLECTION_COMPLETE')||journal.frames.some(f=>f.cycle>=cycle)||journal.frames.some(f=>f.type==='failure'))fail('RESTART_OR_INCOMPLETE_PRIOR_CYCLE_BLOCKED');
 let intents=journal.frames.filter(f=>f.type==='intent'),attempts=intents.length,totalBody=journal.frames.filter(f=>f.type==='response').reduce((n,f)=>n+f.bytes,0),last=intents.at(-1)?.at||null;
 const due=scope.start+cycle*300000,deadline=due+300000,guard=()=>{const t=now();if(performance.now()-monotonicStart>=600000)fail('RUNTIME_TIME_BUDGET');if(!Number.isFinite(t)||t>=scope.expires||t>=deadline||t<scope.start||last!==null&&t<last)fail('EXPIRED_OR_RETROGRADE_CLOCK');return t;};
 let universe,requests=0;const responses=[],metrics={requested:0,returned:0,missing:0,invalidRows:0,interpretableBbo:0,futureBbo:0,freshBbo120:0,spread200bp:0,interpretableTrade:0,futureTrade:0,freshTrade180:0,bothClocksInterpretable:0,latencyMs:[]};
 const bboAges=[],tradeAges=[];const percentile=(a,q)=>a.length?[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*q))]:null;
 const sealFailure=reason=>{try{journal.append({type:'failure',cycle,at:now(),reason,attempts});}catch{}return {status:'FAILED_OR_INCOMPLETE',reason,cycle,attempts,journal:journal.report(),approvedBuy:false,orders:false,remoteUploadVerified:false};};
 try{
  while(now()<due){const before=now();await wait(Math.min(50000,due-before));if(now()<=before)fail('CLOCK_NOT_ADVANCING');if(performance.now()-monotonicStart>=600000)fail('RUNTIME_TIME_BUDGET');}
  if(now()>due+30000)fail('LATE_CYCLE_NO_BACKFILL');guard();
  async function get(kind,symbols=[]){
   guard();if(attempts>=L.attempts)fail('REQUEST_BUDGET');if(last!==null){const pause=Math.ceil(60000/L.perMinute)-(now()-last);if(pause>0){const before=now();await wait(pause);if(now()<=before)fail('CLOCK_NOT_ADVANCING');}}const started=guard();
   const id=attempts++;last=started;requests++;journal.append({type:'intent',cycle,id,at:started,kind,symbols});
   let url,headers;
   if(kind==='run_guard'){url='https://api.github.com/repos/drrazaq/Stock-2/actions/workflows/c0-diagnostic.yml/runs?event=workflow_dispatch&created='+approval.start.slice(0,10)+'&per_page=100';headers={Accept:'application/vnd.github+json'};}
   else if(kind==='assets'){url='https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity';headers={'APCA-API-KEY-ID':credentials.alpacaKey,'APCA-API-SECRET-KEY':credentials.alpacaSecret};}
   else if(kind==='sip'){url='https://data.alpaca.markets/v2/stocks/snapshots?feed=sip&symbols='+symbols.map(encodeURIComponent).join(',');headers={'APCA-API-KEY-ID':credentials.alpacaKey,'APCA-API-SECRET-KEY':credentials.alpacaSecret};}
   else if(kind==='massive'){url='https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers';headers={Authorization:'Bearer '+credentials.massiveKey};}
   else fail('UNAUTHORIZED_ENDPOINT');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(L.timeoutMs,deadline-started,scope.expires-started));let response,bytes;
   try{
    response=await abortable(fetcher(url,{method:'GET',redirect:'error',headers,signal:controller.signal}),controller.signal);
    guard();if(response.redirected)fail('REDIRECT_BLOCKED');if(kind==='assets'&&(response.headers?.get('link')||response.headers?.get('x-next-page-token')))fail('PAGINATED_REFERENCE_UNSUPPORTED');if(!response.ok){cancel(response.body);fail('HTTP_'+response.status);}
    const length=response.headers?.get('content-length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>(kind==='run_guard'?Math.min(L.body,1024*1024):L.body))){cancel(response.body);fail('BODY_BUDGET');}
    if(!response.body)fail('BODY_MISSING');const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const v=await abortable(reader.read(),controller.signal);if(v.done)break;size+=v.value.length;totalBody+=v.value.length;if(size>(kind==='run_guard'?Math.min(L.body,1024*1024):L.body)||totalBody>L.allBodies){Promise.resolve(reader.cancel()).catch(()=>{});fail('BODY_BUDGET');}if(parts.length>=8192)fail('SOURCE_CHUNK_BUDGET');parts.push(v.value);guard();}bytes=Buffer.concat(parts,size);}finally{reader.releaseLock();}
   }finally{clearTimeout(timer);controller.abort();cancel(response?.body);}
   guard();let rawJson;try{rawJson=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail('INVALID_UTF8');}
   const elapsed=now()-started;metrics.latencyMs.push(elapsed);journal.append({type:'response',cycle,id,at:now(),kind,bytes:bytes.length,rawJson,bodySha256:createHash('sha256').update(bytes).digest('hex'),delayLabel:kind==='massive'?'MASSIVE_STARTER_NOMINAL_15_MINUTES_NOT_REALTIME':null});
   try{return parseC0Json(rawJson);}catch{fail('JSON_SCHEMA');}
  }
  const history=await get('run_guard');if(!object(history)||history.total_count!==1||!Array.isArray(history.workflow_runs)||history.workflow_runs.length!==1||String(history.workflow_runs[0].id)!==runId||history.workflow_runs[0].run_attempt!==1||history.workflow_runs[0].event!=='workflow_dispatch'||history.workflow_runs[0].head_branch!=='Stock2-safety-fixes')fail('PRIOR_RUN_OR_HISTORY_UNVERIFIABLE');
  if(cycle===0){
   const assets=await get('assets');if(!Array.isArray(assets)||!assets.length||assets.length>L.assets)fail('ASSET_REFERENCE_BUDGET_OR_SCHEMA');
   const seen=new Set(),ids=new Set();for(const r of assets){if(!object(r)||typeof r.id!=='string'||!r.id||r.id.length>128||marketSymbol(r.symbol)!==r.symbol||seen.has(r.symbol)||ids.has(r.id))fail('ASSET_IDENTITY_OR_SCOPE');seen.add(r.symbol);ids.add(r.id);}
   const records=assets.filter(r=>r.status==='active'&&r.class==='us_equity'&&r.tradable===true).sort((a,b)=>a.symbol.localeCompare(b.symbol));if(!records.length)fail('EMPTY_ELIGIBLE_REFERENCE');universe={referenceReceived:assets.length,excludedReference:assets.length-records.length,records,universeId:c0Hash(records),knownAt:now(),scope:'CURRENT_PROVIDER_REFERENCE_NOT_AUTHENTICATED_COMMON_STOCK_OR_HISTORY'};
  }else{
   const first=ends[0];const assetResponse=journal.frames.find(f=>f.type==='response'&&f.kind==='assets');const assetData=assetResponse?parseC0Json(assetResponse.rawJson):null;if(!assetData||c0Hash(assetData.filter(r=>r.status==='active'&&r.class==='us_equity'&&r.tradable===true).sort((a,b)=>a.symbol.localeCompare(b.symbol)))!==first.universeId)fail('UNIVERSE_CHANGED');
   universe={referenceReceived:assetData.length,excludedReference:first.excludedReference,records:assetData.filter(r=>r.status==='active'&&r.class==='us_equity'&&r.tradable===true).sort((a,b)=>a.symbol.localeCompare(b.symbol)),universeId:first.universeId,knownAt:assetResponse.at,scope:'CURRENT_PROVIDER_REFERENCE_NOT_AUTHENTICATED_COMMON_STOCK_OR_HISTORY'};
  }
  const symbols=universe.records.map(r=>r.symbol),batches=[];for(let i=0;i<symbols.length;i+=L.batch)batches.push(symbols.slice(i,i+L.batch));
  if(batches.length>100||4+3*batches.length+(approval.allowDelayedBaseline?3:0)>L.attempts)fail('PLAN_REQUEST_BUDGET_INSUFFICIENT');
  for(const wanted of batches){
   const data=await get('sip',wanted);if(!object(data)||data.error||data.message||Object.keys(data).some(s=>!wanted.includes(s)))fail('SNAPSHOT_SCHEMA_OR_UNSOLICITED_SYMBOL');
   const at=now();metrics.requested+=wanted.length;
   for(const s of wanted){const r=data[s];if(r===undefined){metrics.missing++;continue;}if(!object(r)){metrics.invalidRows++;continue;}metrics.returned++;
    const q=r.latestQuote||{},t=r.latestTrade||{},qt=fieldTime(q.t),tt=fieldTime(t.t);
    if(Number.isFinite(qt)){metrics.interpretableBbo++;if(qt>at)metrics.futureBbo++;else {bboAges.push((at-qt)/1000);if(at-qt<=120000&&Number.isFinite(q.bp)&&q.bp>0&&Number.isFinite(q.ap)&&q.ap>=q.bp){metrics.freshBbo120++;if((q.ap-q.bp)/((q.ap+q.bp)/2)<=.02)metrics.spread200bp++;}}}
    if(Number.isFinite(tt)){metrics.interpretableTrade++;if(tt>at)metrics.futureTrade++;else {tradeAges.push((at-tt)/1000);if(at-tt<=180000&&Number.isFinite(t.p)&&t.p>0)metrics.freshTrade180++;}}
    if(Number.isFinite(qt)&&Number.isFinite(tt))metrics.bothClocksInterpretable++;
   }
   responses.push({symbols:wanted.length,received:Object.keys(data).length,at});
  }
  if(approval.allowDelayedBaseline){const data=await get('massive');if(!object(data)||data.error||data.message||data.status!==undefined&&!['OK','DELAYED'].includes(data.status)||!Array.isArray(data.tickers)||data.tickers.length>L.assets)fail('DELAYED_BASELINE_SCHEMA_OR_BUDGET');}
  guard();Object.assign(metrics,{bboClockAgeP50Seconds:percentile(bboAges,.5),bboClockAgeP95Seconds:percentile(bboAges,.95),tradeClockAgeP50Seconds:percentile(tradeAges,.5),tradeClockAgeP95Seconds:percentile(tradeAges,.95),requestLatencyP50Ms:percentile(metrics.latencyMs,.5),requestLatencyP95Ms:percentile(metrics.latencyMs,.95),returnedRequestedFraction:metrics.requested?metrics.returned/metrics.requested:null,freshBbo120RequestedFraction:metrics.requested?metrics.freshBbo120/metrics.requested:null,quoteSizeUnits:'PROVIDER_RAW_UNVERIFIED_NOT_EXECUTION'});const frame={type:'cycle_end',cycle,runId,at:now(),status:'LOCAL_COLLECTION_COMPLETE',universeId:universe.universeId,universeCount:universe.records.length,referenceReceived:universe.referenceReceived,excludedReference:universe.excludedReference,metrics,responses,attempts,totalBody,requests,previousUploadConfirmed,approvedBuy:false,orders:false};journal.append(frame);
  return {...frame,journal:journal.report(),remoteUploadVerified:false,conclusion:'OPERATIONAL_DIAGNOSTIC_ONLY_NOT_STRATEGY_OR_PROFITABILITY_EVIDENCE'};
 }catch(e){return sealFailure(/^HTTP_[1-5]\d{2}$/.test(e?.message)||['REQUEST_TIMEOUT','REQUEST_BUDGET','BODY_BUDGET','BODY_MISSING','REDIRECT_BLOCKED','PAGINATED_REFERENCE_UNSUPPORTED','JSON_SCHEMA','INVALID_UTF8','SOURCE_CHUNK_BUDGET','EXPIRED_OR_RETROGRADE_CLOCK','RUNTIME_TIME_BUDGET','LATE_CYCLE_NO_BACKFILL','CLOCK_NOT_ADVANCING','ASSET_REFERENCE_BUDGET_OR_SCHEMA','ASSET_IDENTITY_OR_SCOPE','EMPTY_ELIGIBLE_REFERENCE','PLAN_REQUEST_BUDGET_INSUFFICIENT','SNAPSHOT_SCHEMA_OR_UNSOLICITED_SYMBOL','DELAYED_BASELINE_SCHEMA_OR_BUDGET','UNIVERSE_CHANGED','PRIOR_RUN_OR_HISTORY_UNVERIFIABLE','JOURNAL_PLAIN_BUDGET','JOURNAL_COMPRESSED_BUDGET','JOURNAL_SEALED_BUDGET','JOURNAL_FRAME_BUDGET'].includes(e?.message)?e?.message:'TRANSPORT_OR_STORAGE_UNAVAILABLE');}
}
