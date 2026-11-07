// Inactive three-request entry-reference adapter. No default socket, env read,
// credential, private-directory creation or acquisition on import/inspection.
// Reuses historical transport + sealed journal through an explicitly authorized
// private-context port. This is NOT the A importer or an authenticated outcome.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeNs} from '../a-native-quotes.mjs';
import {SealedAuditJournal} from './historical-sip-audit-client.mjs';
const BASE='docs/a-first-capture-continuation/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c);};
const reason=e=>/^[A-Z][A-Z0-9_]{1,80}$/.test(e?.message||'')?e.message:'INTERNAL_ERROR';
export function inspectIg1Entry(root=process.cwd()){
 const bytes=fs.readFileSync(path.join(root,BASE+'ig1-entry-resolution.proposed.json')),plan=JSON.parse(bytes);
 need(plan.id==='IG1_ONE_ENTRY_RESOLUTION_20261109_V1'&&plan.status==='PROPOSED_REVIEW_PENDING_NOT_AUTHORIZED','WRONG_PLAN');
 const paths=['/v3/reference/tickers/OPK?date=2026-10-15','/v2/stocks/meta/conditions/quote?tape=C','/v2/stocks/OPK/quotes?feed=sip&asof=2026-10-15&start=2026-10-15T13%3A49%3A00Z&end=2026-10-15T13%3A49%3A29.999999999Z&limit=10000&sort=asc'];
 need(plan.requests.length===3&&plan.requests.every((r,i)=>r.path===paths[i]&&r.provider===(i===0?'MASSIVE':'ALPACA')),'REQUEST_SCOPE_CHANGED');
 need(plan.bounds.providerRequests===3&&plan.bounds.perResponseBytes===1048576&&plan.bounds.allRawResponseBytes===3145728&&plan.bounds.sealedBytes===5242880&&plan.bounds.perFullResponseMs===10000&&plan.bounds.providerPhaseMs===60000&&plan.bounds.newSpendUsdMax===0,'BOUNDS_CHANGED');
 const signalBytes=fs.readFileSync(path.join(root,plan.selection.signalFile));need(sha(signalBytes)===plan.selection.signalFileSha256,'SIGNAL_INPUT_CHANGED');
 need(plan.selection.candidateKey==='2026-10-15|OPK|IG1'&&plan.selection.recordedMinuteNY===588&&plan.selection.recordedPrice===1.535&&plan.economics.adverseEntrySlippagePct===2&&plan.economics.budgetUsd===1000,'CASE_OR_COST_CHANGED');
 return {plan,planSha256:sha(bytes),providerCalls:0,authorized:false};
}
function identity(x){const r=x?.results;need(r?.ticker==='OPK'&&r.type==='CS'&&r.primary_exchange==='XNAS'&&/^\d{1,10}$/.test(r.cik||'')&&/^BBG[A-Z0-9]{9}$/.test(r.share_class_figi||''),'IDENTITY_UNRESOLVED');return r;}
function conditions(x){need(x&&typeof x.R==='string'&&/^regular(?: quote)?$/i.test(x.R),'QUOTE_CONDITION_UNRESOLVED');}
export function evaluateIg1Entry({reference,quoteConditions,quotePayload},plan){
 try{
  const id=identity(reference);conditions(quoteConditions);
  need(quotePayload?.symbol==='OPK'&&Array.isArray(quotePayload.quotes)&&quotePayload.next_page_token===null&&quotePayload.quotes.length<=10000,'QUOTE_PAGE_INCOMPLETE');
  const a=nativeNs('2026-10-15T13:49:00Z'),b=nativeNs('2026-10-15T13:49:29.999999999Z');let previous=a,chosen=null,chosenNs;
  for(const q of quotePayload.quotes){const n=nativeNs(q.t);need(n>=a&&n<=b&&n>=previous&&q.z==='C'&&Array.isArray(q.c),'QUOTE_CLOCK_OR_TAPE_UNKNOWN');previous=n;
   if(q.c.length!==1||q.c[0]!=='R')continue;
   need(['bp','ap','bs','as'].every(k=>Number.isFinite(q[k])&&q[k]>0)&&q.ap>=q.bp&&Number.isInteger(q.bs)&&Number.isInteger(q.as),'REGULAR_QUOTE_INVALID');
   if(!chosen){chosen=q;chosenNs=n;}
   else if(n===chosenNs)need(['bp','ap','bs','as'].every(k=>q[k]===chosen[k]),'FIRST_TIMESTAMP_AMBIGUOUS');
  }
  need(chosen,'NO_USABLE_REGULAR_QUOTE');
  const modeledEntry=chosen.ap*1.02,shares=Math.floor((1000-3)/modeledEntry),limit=plan.economics.literalAskLimit;
  const rawAskWithinLimit=chosen.ap<=limit,conservativeLimitPass=modeledEntry<=limit,displayedSizePass=shares>=1&&chosen.as>=shares;
  return {status:conservativeLimitPass&&displayedSizePass?'QUOTED_ENTRY_REFERENCE_PASSES':'QUOTED_ENTRY_REFERENCE_FAILS',rawAskWithinLimit,conservativeLimitPass,displayedSizePass,shares,entryAsk:chosen.ap,modeledEntry,entryCommissionUsd:3,uninvestedCashUsd:1000-shares*modeledEntry-3,quoteAt:chosen.t,securityId:id.share_class_figi,
   evidenceClass:'NEWLY_RETRIEVED_HISTORICAL_QUOTE_REFERENCE_ONLY',actualFillEstablished:false,firmOrProtectedExecutionGuaranteed:false,originalDetectionEstablished:false,outcomeChainComplete:false,profitability:'NOT_EVALUATED',strategyAdmission:false};
 }catch(e){return {status:'INCONCLUSIVE',reason:reason(e),actualFillEstablished:false,originalDetectionEstablished:false,outcomeChainComplete:false,profitability:'NOT_EVALUATED',strategyAdmission:false};}
}
// openPrivateContext is called only after approval/review/source/window gates.
// Its reviewed owner-local implementation supplies the existing explicit
// createHttpsPageTransport(headers) and SealedAuditJournal(privateDir,key,5MiB).
// No global binding reader or default implementation is provided here.
export async function collectIg1Entry({root=process.cwd(),approval,openPrivateContext,clock=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let journal,attempted=0,rawBytes=0;
 try{
  const {plan,planSha256}=inspectIg1Entry(root),runtimeBytes=fs.readFileSync(path.join(root,BASE+'ig1-entry-runtime.json')),runtime=JSON.parse(runtimeBytes);
  need(approval?.executionApproved===true&&approval.planSha256===planSha256&&approval.runtimeManifestSha256===sha(runtimeBytes)&&approval.independentClaudeReview?.verdict==='PASS'&&approval.independentClaudeReview.planSha256===planSha256&&approval.independentClaudeReview.runtimeManifestSha256===sha(runtimeBytes)&&typeof approval.independentClaudeReview.url==='string','APPROVAL_OR_EXACT_REVIEW_MISSING');
  for(const [file,h]of Object.entries(runtime.files))need(sha(fs.readFileSync(path.join(root,file)))===h,'SOURCE_CHANGED');
  need(approval.ownerLocalExecutorReady===true&&approval.applicableProviderTermsReviewed===true&&approval.incrementalSpendLimitUsd===0&&typeof approval.approvalRecordId==='string'&&approval.approvalRecordId.length>0&&typeof approval.privateDirectory==='string'&&path.isAbsolute(approval.privateDirectory)&&typeof openPrivateContext==='function','PRIVATE_SETUP_OR_TERMS_UNRESOLVED');
  const start=clock(),startLimit=Date.parse(plan.execution.latestStart),deadline=Date.parse(plan.execution.providerDeadline);
  need(start>=Date.parse(plan.execution.notBefore)&&start<=startLimit,'EXECUTION_WINDOW_CLOSED');
  const context=await openPrivateContext({planSha256,privateDirectory:approval.privateDirectory,maxSealedBytes:plan.bounds.sealedBytes});journal=context?.journal;
  need(journal instanceof SealedAuditJournal&&!journal.closed&&journal.directory===path.resolve(approval.privateDirectory)&&typeof context.transport==='function'&&context.ownerLocalOnly===true&&context.exclusiveNewRunClaim===true&&journal.maxBytes===plan.bounds.sealedBytes,'PRIVATE_CONTEXT_INVALID');
  journal.append({type:'RUN_CONTEXT',planSha256,runtimeManifestSha256:sha(runtimeBytes),approvalRecord:approval.approvalRecordId,startedAt:new Date(start).toISOString(),originalHistoricalDeliveryUnknown:true});
  const bodies=[];let last=start;
  for(let i=0;i<3;i++){
   if(i)await sleep(1000);const now=clock();need(now>=last&&now-start<60000&&now<deadline,'PROVIDER_PHASE_EXPIRED');last=now;
   const controller=new AbortController();let timer;attempted++;
   try{
    const response=await Promise.race([context.transport({...plan.requests[i],signal:controller.signal,maxBodyBytes:1048576}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('FULL_RESPONSE_TIMEOUT'));},Math.min(10000,deadline-now,60000-(now-start)));})]);
    const received=clock();need(received>=now&&received<=deadline&&received-start<=60000,'RESPONSE_CLOCK_UNKNOWN');last=received;
    need(Buffer.isBuffer(response?.body)&&response.body.length<=1048576,'RESPONSE_BODY_UNKNOWN');rawBytes+=response.body.length;need(rawBytes<=3145728,'RAW_BYTES_CAP');
    journal.append({type:'RESPONSE',request:plan.requests[i],status:response.status,requestStartedAt:new Date(now).toISOString(),bodyReceivedAt:new Date(received).toISOString(),headersReceivedAt:null,headerClockNotInstrumentedByReusedWire:true,bodyBase64:response.body.toString('base64'),bodySha256:sha(response.body)});
    need(response.status===200,'PROVIDER_REFUSAL');const body=JSON.parse(response.body.toString('utf8'));bodies.push(body);
    if(i===0)identity(body);if(i===1)conditions(body);
   }finally{clearTimeout(timer);controller.abort();}
  }
  const result=evaluateIg1Entry({reference:bodies[0],quoteConditions:bodies[1],quotePayload:bodies[2]},plan);
  journal.append({type:'TERMINAL',attempted,rawBytes,result,at:new Date(clock()).toISOString()});return {...result,attempted,rawBytes,custody:'SEALED_PENDING_OWNER_LOCAL_READBACK',privateReadbackRequired:true};
 }catch(e){const result={status:'INCONCLUSIVE',reason:reason(e),attempted,rawBytes,originalDetectionEstablished:false,outcomeChainComplete:false,profitability:'NOT_EVALUATED',strategyAdmission:false};
  try{journal?.append({type:'TERMINAL',result});}catch{return {...result,reason:'CUSTODY_WRITE_UNKNOWN'};}return result;
 }finally{journal?.close();}
}
