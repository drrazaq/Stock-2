// CLI for an explicitly approved private runner. No command accepts ticker scope.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {quoteHash,createPrivateQuoteRetention,readPrivateAssessmentQuote,exportQuoteRecovery} from '../private-quote-retention.mjs';
import {publishPrivateAssessmentBook,readPrivateAssessment,traceResearchDecision} from '../research-assessment.mjs';
import {readInstrumentType} from '../assessment-instrument-type.mjs';import {captureTwoQuotes} from './bounded-quotes.mjs';
const names=['admission.json','policy.json','identities.json','assessment-policy.json','evaluation.json','journal.jsonl','instrument-reference.json'];
const h=x=>/^[a-f0-9]{64}$/.test(x||'');
function read(root,name,max=4*1048576){const p=path.join(root,name),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('INPUT_FILE_BOUND');return fs.readFileSync(p);}
function put(root,name,b){fs.writeFileSync(path.join(root,name),b,{mode:0o600,flag:'wx'});}
export function inspectInputs(input,manifestPin,{sourceSha,now=Date.now()}={}){
 if(!path.isAbsolute(input)||fs.lstatSync(input).isSymbolicLink())throw Error('INPUT_ROOT');
 if(JSON.stringify(fs.readdirSync(input).sort())!==JSON.stringify([...names].sort()))throw Error('INPUT_ALLOWLIST');
 const aRaw=read(input,'admission.json',65536);if(!h(manifestPin)||quoteHash(aRaw)!==manifestPin)throw Error('ADMISSION_PIN');const a=JSON.parse(aRaw);
 if(a.kind!=='BOUNDED_PRIVATE_EVIDENCE_ADMISSION_V1'||a.sourceSha!==sourceSha||a.authorizedPhase!=='quote-capture'||a.ownerLinked!==false||a.independentIssuerReview!==true||a.entitlementAndHostedTermsVerified!==true||a.enrollmentVerified!==true||a.zeroSpendVerified!==true||a.storageReservedMiB!==25||a.maxProviderGETs!==2||a.maxRunnerMinutes!==3||a.symbols?.join(',')!=='TWLO,COST'||Date.parse(a.notBefore)>now||!Number.isFinite(Date.parse(a.notBefore))||Date.parse(a.latestStart)<=now||Date.parse(a.latestStart)-now>1800000||!/^https:\/\/github.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(a.approvalComment||''))throw Error('ADMISSION_NOT_READY');
 const files={};for(const n of names.filter(x=>x!=='admission.json')){files[n]=read(input,n,n==='journal.jsonl'?16*1048576:4*1048576);if(!h(a.files?.[n])||quoteHash(files[n])!==a.files[n])throw Error('INPUT_HASH');}
 if(Object.keys(a.files).sort().join(',')!==names.filter(x=>x!=='admission.json').sort().join(','))throw Error('INPUT_HASH_ALLOWLIST');
 const qp=JSON.parse(files['policy.json']),ap=JSON.parse(files['assessment-policy.json']),evaluation=JSON.parse(files['evaluation.json']),ids=JSON.parse(files['identities.json']);
 if(qp.reviewedProducerShas?.length!==1||qp.reviewedProducerShas[0]!==sourceSha||qp.identity?.sha256!==quoteHash(files['identities.json'])||ap.evaluationSha256!==quoteHash(files['evaluation.json'])||evaluation.synthetic===true||!Array.isArray(ids.records)||ids.records.length!==2||ids.records.map(x=>x.symbol).sort().join(',')!=='COST,TWLO'||!Array.isArray(evaluation.evaluations)||evaluation.evaluations.length!==2||evaluation.evaluations.map(x=>x.symbol).sort().join(',')!=='COST,TWLO')throw Error('INPUT_POLICY_BINDING');
 for(const id of ids.records){
  const reviewed=id.review?.status==='INDEPENDENT_PROVENANCE_REVIEWED'&&/^https:\/\/github.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(id.review.comment||'')&&Number.isFinite(Date.parse(id.review.at))&&Date.parse(id.review.at)<=now;
  if(!reviewed||id.status!=='INDEPENDENT_ISSUER_REVIEWED'||id.securityType!=='CS'||typeof id.securityId!=='string'||!id.securityId||!/^\d{1,10}$/.test(id.issuerCik||'')||Number(id.issuerCik)<=0||!/^https:\/\//.test(id.source||'')||!Number.isFinite(Date.parse(id.knownAt))||Date.parse(id.knownAt)>now||!Number.isFinite(Date.parse(id.validFrom))||Date.parse(id.validFrom)>now||id.validTo!==null&&!(Date.parse(id.validTo)>now))throw Error('INDEPENDENT_IDENTITY_REQUIRED');
 }
 return {admission:a,files,quotePin:quoteHash(files['policy.json']),assessmentPin:quoteHash(files['assessment-policy.json'])};
}
export async function runCapture({input,manifestPin,sourceSha,checkout,output,privateBase,headers,fetcher,monotonic,now=()=>Date.now()}={}){
 // Validate every independently supplied witness BEFORE any network operation.
 const v=inspectInputs(input,manifestPin,{sourceSha,now:now()});
 for(const root of [output,privateBase]){if(!path.isAbsolute(root)||fs.existsSync(root)||path.resolve(root).startsWith(path.resolve(checkout)+path.sep))throw Error('FRESH_OUTSIDE_CHECKOUT_REQUIRED');fs.mkdirSync(root,{mode:0o700});}
 const qr=path.join(privateBase,'quote'),ar=path.join(privateBase,'assessment');for(const d of [qr,ar])fs.mkdirSync(d,{mode:0o700});
 for(const n of ['policy.json','identities.json'])put(qr,n,v.files[n]);for(const n of ['assessment-policy.json','evaluation.json'])put(ar,n,v.files[n]);
 const ao={root:ar,checkout,policySha256:v.assessmentPin,now:now()};publishPrivateAssessmentBook(v.files['journal.jsonl'],ao);
 const reference=path.join(privateBase,'instrument-reference.json');put(privateBase,'instrument-reference.json',v.files['instrument-reference.json']);
 for(const id of JSON.parse(v.files['identities.json']).records){const ref=readInstrumentType(id.symbol,{file:reference,pinnedSha256:quoteHash(v.files['instrument-reference.json']),now:now()});if(ref.status!=='ELIGIBLE_COMMON_STOCK'||ref.securityId!==id.securityId)throw Error('REFERENCE_IDENTITY_MISMATCH');}
 const qo={root:qr,checkout,policySha256:v.quotePin,sourceSha,runId:'bounded-two-symbols',now};
 const writer=createPrivateQuoteRetention(qo);let result;
 try{result=await captureTwoQuotes({headers,fetcher,monotonic,onReceipt:e=>writer.capture(e)});if(result.feed.retentionFailure)throw Error('RETENTION_FAILED');writer.publish();}finally{writer.close();}
 const at=new Date(now()).toISOString(),cards=[];
 for(const symbol of ['TWLO','COST']){
  const q=readPrivateAssessmentQuote(symbol,{...qo,now:now()}),b=readPrivateAssessment(symbol,{...ao,now:now()}),instrument=readInstrumentType(symbol,{file:reference,pinnedSha256:quoteHash(v.files['instrument-reference.json']),now:now()});
  // No ZAD owner marks or holdings enter this feasibility bundle. Missing data remain explicit.
  cards.push(traceResearchDecision({symbol,record:b.record,coverage:b.coverage,quote:q,instrument,zad:'UNKNOWN',asOf:at,now:now()}));
 }
 const ny=t=>t?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'long'}).format(new Date(t)):'UNKNOWN';
 const original=fs.readFileSync(path.join(qr,'receipts.jsonl'),'utf8').trim().split('\n').flatMap(line=>JSON.parse(line).quotes);
 const text=['AS-OF SNAPSHOT — NOT A CURRENT QUOTE','QUOTE/IDENTITY PLUMBING ONLY — NO BUY AUTHORITY','Generated '+at,...cards.map(c=>c.text),...original.map(q=>q.symbol+' '+q.provider+'/'+q.feed+' '+q.captureOutcome+' | provider UTC '+(q.quoteAsOf||'UNKNOWN')+'; New York '+ny(q.quoteAsOf)+' | receipt UTC '+q.at+'; New York '+ny(q.at)+' | original quote expiry UTC '+(q.expiresAt||'UNKNOWN')+'; New York '+ny(q.expiresAt)),'Static download never refreshes quote expiry. ZAD UNKNOWN. No orders or delivery attempted.'].join('\n')+'\n';
 put(output,'owner-report.txt',text);
 const bundle=exportQuoteRecovery(qr);if(bundle.bytes.length>3*1048576)throw Error('BOUNDED_QUOTE_EXPORT_CAP');put(output,'quote-recovery.json',bundle.bytes);
 // Byte-preserving assessment recovery; no fabricated evaluation or coverage upgrade.
 const assessment={};for(const n of fs.readdirSync(ar)){if(!/^(assessment-policy\.json|evaluation\.json|book-current\.json|book-[a-f0-9]{64}\.json|journal-[a-f0-9]{64}\.jsonl|assessment-delivery\.jsonl)$/.test(n))throw Error('ASSESSMENT_RECOVERY_ALLOWLIST');const b=read(ar,n,16*1048576);assessment[n]={sha256:quoteHash(b),data:b.toString('base64')};}
 put(output,'assessment-recovery.json',JSON.stringify({kind:'BOUNDED_ASSESSMENT_RECOVERY_V1',files:assessment}));
 put(output,'receipt.json',JSON.stringify({kind:'BOUNDED_QUOTE_FEASIBILITY_V1',sourceSha,admissionSha256:manifestPin,at,calls:result.transport.calls,bodyBytes:result.transport.bodyBytes,observations:writer.report().observations,quotePolicySha256:v.quotePin,assessmentPolicySha256:v.assessmentPin,quoteRecoverySha256:bundle.sha256,status:cards.every(c=>c.quote)?'DATED_CONTEXT_ONLY':'INCONCLUSIVE',entryApproval:false,deliveryAttempted:false}));
 const total=fs.readdirSync(output).reduce((n,f)=>n+fs.statSync(path.join(output,f)).size,0);if(total>3*1048576)throw Error('COMBINED_EXPORT_CAP');
 return {calls:result.transport.calls,status:'PRIVATE_FILES_ONLY_NO_SEND'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  if(process.argv[2]!=='capture')throw Error('PHASE');
  const headers={'APCA-API-KEY-ID':process.env.RESEARCH_ALPACA_KEY,'APCA-API-SECRET-KEY':process.env.RESEARCH_ALPACA_SECRET};
  delete process.env.RESEARCH_ALPACA_KEY;delete process.env.RESEARCH_ALPACA_SECRET;
  if(!headers['APCA-API-KEY-ID']||!headers['APCA-API-SECRET-KEY'])throw Error('ENROLLMENT');
  await runCapture({input:process.env.EVIDENCE_INPUT,manifestPin:process.env.ADMISSION_SHA256,sourceSha:process.env.EXPECTED_MAIN_SHA,checkout:process.cwd(),output:process.env.EVIDENCE_OUTPUT,privateBase:process.env.QUOTE_PRIVATE_ROOT,headers});
  console.log('BOUNDED_PRIVATE_CAPTURE_FINISHED_NO_SEND');
 }catch{console.error('BOUNDED_PRIVATE_CAPTURE_STOP_NO_RETRY');process.exitCode=1;}
}
