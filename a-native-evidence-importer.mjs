// Inactive local-file producer -> strict evaluator -> paper-card/outcome integration.
// Never acquires data, signs receipts, reads credentials, changes policy or enables BUY.
import {captureJson} from './capture-json.mjs';
import {withOriginals,validateTrustContract} from './a-evidence-contract.mjs';
import {joinNativePrimary,sourceHash} from './a-native-source-join.mjs';
import {retainClose} from './a-close-source.mjs';
import {nativeRunDigest} from './native-sec-events.mjs';
import {renderDecisionCard,evidenceHash} from './reclaim-research-workflow.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const parse=b=>captureJson(new TextDecoder('utf-8',{fatal:true}).decode(b));
const code=e=>/^[A-Z_]+$/.test(e?.message)?e.message:'NATIVE_IMPORT_IO_OR_SCHEMA_UNKNOWN';
function reportEvaluation(evaluation,dataset){
 const cases=dataset.observations.map(input=>{const r=evaluation.result?.results?.find(x=>x.observationId===input.observationId),event=evaluation.result?.structuralNotAuthenticated?.ledger?.events?.find(x=>x.observationId===input.observationId),verified=r?.status==='VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT'&&r.derived?.outcome?.status==='MODELED_PAPER_ECONOMICS_ONLY'&&!!event;
  const reason=verified?null:r?.reason||(r?.status==='VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT'?'STRATEGY_OR_OUTCOME_NOT_ADMISSIBLE':evaluation.status)||'EVIDENCE_UNKNOWN';
  return {observationId:input.observationId,status:verified?'RESEARCH_ONLY_UNDER_SUPPLIED_TRUST':'UNKNOWN',reason,paperCard:verified&&event?renderDecisionCard(event):renderDecisionCard({symbol:input.symbol,result:{status:'UNKNOWN',reason}}),outcome:verified&&r.derived?r.derived.outcome:{status:'UNKNOWN',reason,allowBuy:false},native:r?.native||null,allowBuy:false};});
 return {status:cases.some(c=>c.status==='UNKNOWN')?'UNKNOWN':'OFFLINE_RESEARCH_ONLY',origin:dataset.origin,synthetic:dataset.origin==='SYNTHETIC',cases,allowBuy:false,prospectiveAdmissions:0,realDollars:0,sourceAuthentication:'NOT_INDEPENDENTLY_ESTABLISHED',strategy:'NOT_PROVEN',policyAdopted:false};
}
export function importNativeAEvidence({store,token,originalsDirectory,request}){
 let dataset=null;
 try{return withOriginals(originalsDirectory,read=>{
  need(request?.version===1&&request.dataset&&request.contract&&request.nativeRuns,'NATIVE_IMPORT_REQUEST_REQUIRED');
  const bytesByName=new Map(),table=[];let total=0;
  function collect(ref){need(ref&&typeof ref.file==='string'&&typeof ref.sha256==='string','ORIGINAL_REFERENCE_REQUIRED');const old=bytesByName.get(ref.file);if(old){need(old.sha256===ref.sha256,'NATIVE_IMPORT_FILENAME_CONFLICT');return old.bytes;}const bytes=read(ref);total+=bytes.length;need(total<=16777216&&bytesByName.size<400,'NATIVE_IMPORT_BUDGET');bytesByName.set(ref.file,{bytes,sha256:ref.sha256});let value;try{value=parse(bytes);}catch{return bytes;}walk(value);return bytes;}
  function walk(value){if(!value||typeof value!=='object')return;if(typeof value.file==='string'&&typeof value.sha256==='string')collect(value);for(const v of Object.values(value))if(v&&typeof v==='object')walk(v);}
  dataset=parse(collect(request.dataset));const contract=parse(collect(request.contract));validateTrustContract(contract);need(['SYNTHETIC','RETAINED_RESEARCH'].includes(dataset.origin)&&Array.isArray(dataset.observations)&&dataset.observations.length>0&&dataset.observations.length<=100,'NATIVE_IMPORT_DATASET_REQUIRED');
  const state=store.head();need(state.token===token,'STALE_FENCE');
  // Store origin cannot be silently replaced by a synthetic fixture label.
  need(request.storeOrigin===dataset.origin&&state.origin===dataset.origin,'NATIVE_IMPORT_ORIGIN_MISMATCH');
  const put=(id,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),sha256=sourceHash(bytes);store.append(token,'ORIGINAL',id,{},bytes);return {file:'raw-'+sha256+'.bin',sha256};};
  for(const [file,r]of bytesByName){store.append(token,'ORIGINAL','A_IMPORT_ORIGINAL:'+evidenceHash({file,sha256:r.sha256}),{sourceFilename:file,sourceSha256:r.sha256},r.bytes);table.push({file,sha256:r.sha256,stored:'raw-'+r.sha256+'.bin'});}
  const derived=(id,value)=>{const ref=put(id,value);table.push({...ref,stored:ref.file});return ref;};
  const copied=structuredClone(dataset);
  for(const input of copied.observations){const b=copied.evidence?.[input.observationId]?.nativeBinding;need(b?.version===1,'NATIVE_BINDING_REQUIRED');const config=request.nativeRuns[input.observationId];need(config,'NATIVE_RUN_REQUIRED');const sealed=parse(collect(b.archive));need(nativeRunDigest(config.directory).sha256===sealed.sha256&&sealed.runId===config.expectedRunId&&sealed.sourceSha===config.expectedSourceSha,'NATIVE_ARCHIVE_PIN_MISMATCH');
   const primary=parse(collect(b.primary)),joined=joinNativePrimary({store,token,native:config,primaryResponses:[primary]});const row=joined.results.find(x=>x.eventId===input.catalyst.sourceId);need(row,'NATIVE_EVENT_MISSING');b.join=derived('A_NATIVE_JOIN:'+sourceHash(JSON.stringify(row)),row);
   need(Array.isArray(b.closes),'NATIVE_CLOSE_BINDINGS_REQUIRED');for(const close of b.closes){const p=parse(collect(close.envelope));const normalized=retainClose({store,token,response:p,context:{symbol:input.symbol,securityId:input.securityId,session:close.sessionDate}});close.normalized=derived('A_NATIVE_CLOSE:'+sourceHash(JSON.stringify(normalized)),normalized);}
  }
  copied.nativeImport={version:1,files:table};const datasetRef=put('A_NATIVE_DATASET:'+sourceHash(JSON.stringify(copied)),copied),contractRef={file:'raw-'+request.contract.sha256+'.bin',sha256:request.contract.sha256};
  const evaluation=store.evaluate(token,'A_NATIVE_EVALUATION:'+datasetRef.sha256,datasetRef,contractRef),report=reportEvaluation(evaluation,copied);
  const reportRef=put('A_NATIVE_REPORT:'+sourceHash(JSON.stringify(report)),report);return {...report,reportRef,evaluationReceipt:evaluation.status,datasetRef};
 });}catch(e){return {status:'UNKNOWN',reason:code(e),allowBuy:false,prospectiveAdmissions:0,realDollars:0,origin:dataset?.origin||'UNKNOWN',cases:(dataset?.observations||[]).map(x=>({observationId:x.observationId,status:'UNKNOWN',reason:code(e),paperCard:renderDecisionCard({symbol:x.symbol,result:{status:'UNKNOWN',reason:code(e)}}),outcome:{status:'UNKNOWN',reason:code(e),allowBuy:false},allowBuy:false})),reportSaved:false};}
}
