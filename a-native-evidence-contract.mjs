// Strict, inactive retained-original binding. No acquisition, signing, policy adoption or default trust.
import {captureJson} from './capture-json.mjs';
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
import {sourceHash,sourceInstant,inspectSourceResponse} from './a-native-source-join.mjs';
import {normalizeRetainedClose} from './a-close-source.mjs';
import {normalizeAlpacaAQuotes} from './a-native-quotes.mjs';
import {readNativeRun} from './native-sec-events.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const parse=b=>captureJson(new TextDecoder('utf-8',{fatal:true}).decode(b));
const ns=x=>{const n=sourceInstant(x);need(n!==null,'NATIVE_BOUND_CLOCK_UNKNOWN');return n;};
const eq=(a,b)=>evidenceHash(a)===evidenceHash(b);
function noPersistentConflict(logicalId,read){const key=evidenceHash({kind:'ACQUISITION',logicalId});let c;try{c=parse(read.control('commit-'+key+'.json'));}catch(e){if(e.code==='ENOENT')return;throw e;}const record=parse(read.control('record-'+key+'.json'));need(evidenceHash(record)===c.recordHash&&record.logicalId===logicalId,'NATIVE_CONFLICT_RECORD_CORRUPT');throw Error('NATIVE_PERSISTENT_CONFLICT');}

function original(ref,role,ctx){const r=ctx.signedOriginal(ref,role,ctx.contract,ctx.read,ctx.input.securityId);return {...r,value:parse(r.bytes)};}
function response(ref,ctx){const r=original(ref,'CAPTURE',ctx),v=inspectSourceResponse(r.value);need(v.status!=='UNKNOWN','NATIVE_RESPONSE_UNKNOWN');need(ns(r.body.recordedAt)===ns(r.value.bodyReceivedAt),'NATIVE_RESPONSE_RECEIPT_MISMATCH');return {...r,envelope:r.value,document:()=>parse(v.bytes)};}
export function nativeAliasedRead(read,table){
 need(Array.isArray(table)&&table.length<=2000,'NATIVE_IMPORT_FILES_REQUIRED');const map=new Map();
 for(const r of table){need(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(r.file||'')&&/^[a-f0-9]{64}$/.test(r.sha256||'')&&r.stored==='raw-'+r.sha256+'.bin','NATIVE_IMPORT_FILE_INVALID');need(!map.has(r.file)||eq(map.get(r.file),r),'NATIVE_IMPORT_FILENAME_CONFLICT');map.set(r.file,r);}
 const aliased=ref=>{need(ref&&map.has(ref.file)&&map.get(ref.file).sha256===ref.sha256,'NATIVE_IMPORT_ORIGINAL_MISSING');return read({...ref,file:map.get(ref.file).stored});};aliased.control=read.control;return aliased;
}
function identity(binding,at,knownBy,ctx){
 need(binding?.review&&binding.sources?.massive&&binding.sources?.alpaca&&binding.sources?.sec,'IDENTITY_PROVENANCE_REQUIRED');
 const m=response(binding.sources.massive,ctx),a=response(binding.sources.alpaca,ctx),s=response(binding.sources.sec,ctx),review=original(binding.review,'REVIEW',ctx),r=review.value;
 for(const p of [m,a,s])need(ns(p.envelope.bodyReceivedAt)<=ns(review.body.recordedAt),'IDENTITY_REVIEW_BEFORE_ORIGINAL');
 need(ns(review.body.recordedAt)<=ns(knownBy)&&ns(r.validFrom)<=ns(at)&&ns(at)<ns(r.validUntil),'IDENTITY_NOT_KNOWN_OR_VALID');
 const md=m.document().results,ad=a.document(),sd=s.document(),cik=String(md?.cik||'').padStart(10,'0');
 need(m.envelope.url.startsWith('https://api.massive.com/v3/reference/tickers/'+ctx.input.symbol+'?')&&new URL(m.envelope.url).pathname==='/v3/reference/tickers/'+ctx.input.symbol,'IDENTITY_SOURCE_ROUTE_UNKNOWN');
 need(a.envelope.url==='https://paper-api.alpaca.markets/v2/assets/'+ctx.input.symbol&&s.envelope.url==='https://data.sec.gov/submissions/CIK'+cik+'.json','IDENTITY_SOURCE_ROUTE_UNKNOWN');
 const exchanges={XNAS:'NASDAQ',XNYS:'NYSE',XASE:'AMEX',ARCX:'ARCA',BATS:'BATS'};
 need(md?.ticker===ctx.input.symbol&&ad.symbol===ctx.input.symbol&&/^BBG[A-Z0-9]{9}$/.test(md.share_class_figi||'')&&md.share_class_figi===ctx.input.securityId&&/^\d{10}$/.test(cik)&&Number(cik)>0&&Number(sd.cik)===Number(cik)&&ctx.input.issuerId==='CIK'+cik,'IDENTITY_REFERENCE_CONFLICT');
 need(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(ad.id||'')&&md.type==='CS'&&md.active===true&&ad.class==='us_equity'&&ad.status==='active'&&ad.tradable===true&&exchanges[md.primary_exchange]===ad.exchange,'IDENTITY_INSTRUMENT_UNKNOWN');
 const id='A_IDENTITY_'+evidenceHash({massive:binding.sources.massive.sha256,alpaca:binding.sources.alpaca.sha256,sec:binding.sources.sec.sha256,validFrom:r.validFrom,validUntil:r.validUntil});
 need(r.kind==='A_IDENTITY_REVIEW_V1'&&r.symbol===ctx.input.symbol&&r.securityId===ctx.input.securityId&&r.issuerCik===cik&&r.providerAssetId===ad.id&&r.instrument==='US_COMMON_STOCK'&&eq(r.sourceHashes,{massive:binding.sources.massive.sha256,alpaca:binding.sources.alpaca.sha256,sec:binding.sources.sec.sha256}),'IDENTITY_REVIEW_NOT_BOUND');
 return {id,issuerCik:cik,knownAt:review.body.recordedAt,status:'BOUND_UNDER_SUPPLIED_REFERENCE_REVIEW',independentTruth:'NOT_ESTABLISHED_BY_SIGNATURE_ALONE'};
}
function quote(ref,profileRef,slot,ctx){
 const q=response(ref,ctx),pr=original(profileRef,'REVIEW',ctx);need(ns(pr.body.recordedAt)<=ns(q.envelope.bodyReceivedAt),'QUOTE_SEMANTICS_REVIEW_LATE');
 const u=new URL(q.envelope.url);need(u.origin==='https://data.alpaca.markets'&&u.pathname==='/v2/stocks/'+ctx.input.symbol+'/quotes'&&u.searchParams.get('feed')==='sip','QUOTE_NATIVE_ROUTE_UNKNOWN');
 return normalizeAlpacaAQuotes(q.document(),{symbol:ctx.input.symbol,securityId:ctx.input.securityId,slot,receivedAt:q.envelope.bodyReceivedAt,profile:pr.value});
}
export function verifyNativeAInput({input,bundle,contract,read,signedOriginal,origin,policy}){
 const binding=bundle.nativeBinding;need(binding?.version===1,'NATIVE_BINDING_REQUIRED');const ctx={input,contract,read,signedOriginal};
 const id=identity(binding.identity,input.asOf,input.asOf,ctx);need(id.id===input.identityEvidenceId&&ns(id.knownAt)===ns(input.identityAsOf),'IDENTITY_INPUT_MISMATCH');
 const prefix=original(binding.archive,'CAPTURE',ctx),snapshot=prefix.value;need(snapshot.sha256===sourceHash(JSON.stringify(snapshot.files)),'NATIVE_ARCHIVE_DIGEST_MISMATCH');
 const archive=readNativeRun({expectedRunId:snapshot.runId,expectedSourceSha:snapshot.sourceSha,_files:snapshot.files});
 need(archive.status==='INTEGRITY_CHECKED_UNAUDITED'&&archive.issues.length===0&&ns(prefix.body.recordedAt)<=ns(input.asOf)&&ns(prefix.body.recordedAt)>=ns(archive.lastObservedAt),'NATIVE_ARCHIVE_INCOMPLETE_OR_LATE');
 need((origin==='SYNTHETIC')===(archive.meta.provenance==='SYNTHETIC_FIXTURE'),'NATIVE_ORIGIN_MISMATCH');
 const event=archive.observations.find(e=>'SEC_FILING_V1:'+e.issuerCik+':'+e.accession===input.catalyst.sourceId);
 need(event&&event.issuerCik===id.issuerCik&&event.nativeEvidenceStatus==='COMPLETE_ORIGINAL_EVIDENCE'&&event.revisionCount===1,'NATIVE_EVENT_UNKNOWN_OR_CONFLICT');
 noPersistentConflict('SEC_FIRST_CONFLICT:'+input.catalyst.sourceId,read);
 const primary=response(binding.primary,ctx),c=input.catalyst;need(primary.envelope.bodySha256===c.documentHash&&primary.envelope.url===c.sourceUrl&&ns(primary.envelope.bodyReceivedAt)===ns(c.observedAt)&&ns(event.acceptance.at)===ns(c.publishedAt)&&ns(c.observedAt)<=ns(input.asOf),'PRIMARY_INPUT_CLOCK_OR_BYTES_MISMATCH');
 const proof=archive.acceptanceResponses.find(p=>p.sha256===event.acceptance.sha256);need(proof,'NATIVE_ACCEPTANCE_ORIGINAL_MISSING');const rows=parse(Buffer.from(proof.bodyBase64,'base64')).filings.recent;const ix=rows.accessionNumber.indexOf(event.accession),doc=rows.primaryDocument?.[ix];need(rows.form?.[ix]===event.form&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/.test(doc||'')&&!doc.includes('..'),'NATIVE_PRIMARY_DOCUMENT_UNKNOWN');
 need(c.sourceUrl==='https://www.sec.gov/Archives/edgar/data/'+Number(id.issuerCik)+'/'+event.accession.replaceAll('-','')+'/'+doc,'NATIVE_PRIMARY_IDENTITY_CONFLICT');
 const join=parse(read(binding.join));need(join.eventId===c.sourceId&&join.joinStatus==='MATCHED_RESEARCH_ONLY'&&!join.firstConflict&&join.primaryResponseHashes.includes(c.documentHash)&&ns(join.original.firstObservedAt)===ns(event.observations[0].observedAt),'NATIVE_JOIN_UNKNOWN_OR_CONFLICT');
 const provenance=original(binding.provenance,'REVIEW',ctx),pv=provenance.value;need(pv.kind==='A_NATIVE_PROVENANCE_REVIEW_V1'&&pv.archiveHash===binding.archive.sha256&&pv.primaryEnvelopeHash===binding.primary.sha256&&pv.identityReviewHash===binding.identity.review.sha256&&pv.sourceCodeSha===snapshot.sourceSha&&pv.origin===origin&&ns(provenance.body.recordedAt)<=ns(input.asOf),'NATIVE_PROVENANCE_REQUIRED');
 const capture=original(pv.captureHost,'CAPTURE',ctx),witness=original(pv.witnessHost,'WITNESS',ctx);
 for(const [p,role]of [[capture,'CAPTURE'],[witness,'WITNESS']])need(p.value.kind==='A_CAPTURE_HOST_CONTEXT_V1'&&p.value.collectorId===p.body.collectorId&&contract.collectors.some(c=>c.id===p.body.collectorId&&c.role===role&&c.provenanceReference===p.value.transportReference)&&p.value.sourceCodeSha===snapshot.sourceSha&&typeof p.value.hostId==='string'&&p.value.hostId&&ns(p.body.recordedAt)<=ns(provenance.body.recordedAt),'AUTHENTICATED_HOST_CONTEXT_REQUIRED');
 need(capture.value.hostId!==witness.value.hostId,'INDEPENDENT_HOST_CONTEXT_REQUIRED');
 const closeContract=original(binding.closeContract,'REVIEW',ctx);need(closeContract.value.kind==='A_RAW_AGGREGATE_TRIGGER_CONTRACT_V1'&&closeContract.value.adopted===false&&closeContract.value.execution==='SEPARATE_BBO_ONLY'&&closeContract.value.adjustment==='raw'&&closeContract.value.finalityEvidenceRequired===true&&ns(closeContract.body.recordedAt)<=ns(input.asOf),'CLOSE_SOURCE_CONTRACT_REQUIRED');
 const events=quote(binding.entryQuote,binding.quoteProfile,{type:'BBO',start:new Date(evidenceTime(input.asOf)-policy.maxQuoteAgeMs).toISOString(),end:input.asOf,atEndInclusive:true},ctx);need(events.some(e=>eq(e.record,input.quote)),'ENTRY_NATIVE_QUOTE_MISMATCH');
 return {status:'NATIVE_BOUND_UNDER_SUPPLIED_TRUST',identity:id,eventId:c.sourceId,archiveHash:binding.archive.sha256,primaryHash:c.documentHash,sourceAuthentication:'ATTESTED_CONTEXT_NOT_INDEPENDENTLY_ESTABLISHED',globalFirstIngestionEstablished:false};
}
export function verifyNativeAOutcome({input,bundle,contract,read,signedOriginal}){
 const b=bundle.nativeBinding;need(Array.isArray(b?.closes)&&b.closes.length<=20,'NATIVE_CLOSE_BINDINGS_REQUIRED');const ctx={input,contract,read,signedOriginal};
 const tape=original(bundle.outcomes,'CAPTURE',ctx).value,closes=tape.events.filter(e=>e.type==='CLOSE');need(closes.length===b.closes.length,'NATIVE_CLOSE_COVERAGE_MISMATCH');
 for(const e of closes){noPersistentConflict('CLOSE:'+input.securityId+':'+e.record.sessionDate+':FIRST_CONFLICT',read);const bindings=b.closes.filter(x=>x.evidenceId===e.record.evidenceId);need(bindings.length===1,'NATIVE_CLOSE_BINDING_MISSING_OR_DUPLICATE');const x=bindings[0];identity(x.identity,e.record.at,e.record.availableAt,ctx);const p=response(x.envelope,ctx),n=normalizeRetainedClose(p.envelope,{symbol:input.symbol,securityId:input.securityId,session:e.record.sessionDate});need(n.status==='NORMALIZED_RESEARCH_ONLY'&&n.close===e.record.close&&ns(n.sessionCloseAt)===ns(e.record.at)&&ns(n.availableAt)===ns(e.record.availableAt),'NATIVE_CLOSE_PRICE_CLOCK_OR_BASIS_MISMATCH');const stored=parse(read(x.normalized));need(stored.status==='NORMALIZED_RESEARCH_ONLY'&&stored.barRevisionHash===n.barRevisionHash,'NATIVE_CLOSE_UNKNOWN_OR_CONFLICT');const review=original(x.finality,'REVIEW',ctx);need(review.value.kind==='A_CLOSE_ORIGINAL_REVIEW_V1'&&review.value.envelopeHash===x.envelope.sha256&&review.value.barRevisionHash===n.barRevisionHash&&review.value.priceBasis==='RAW_AGGREGATE_TRIGGER_NOT_FILL'&&review.value.finality==='REVIEWED_UNDER_SUPPLIED_CONTEXT'&&ns(review.body.recordedAt)<=ns(e.record.availableAt),'CLOSE_FINALITY_EVIDENCE_REQUIRED');}
 // Raw quote responses cover the entire signed BBO event set, not a favorable selected exit.
 need(Array.isArray(b.exitQuotes)&&b.exitQuotes.length<=100,'NATIVE_EXIT_QUOTES_REQUIRED');const observed=[];
 for(const x of b.exitQuotes){const end=x.slot?.end;need(end,'NATIVE_EXIT_SLOT_REQUIRED');observed.push(...quote(x.envelope,b.quoteProfile,x.slot,ctx));}
 const actual=tape.events.filter(e=>e.type==='BBO').map(e=>e.record),key=e=>evidenceHash(e);need(eq(actual.map(key).sort(),observed.map(e=>key(e.record)).sort()),'NATIVE_EXIT_QUOTE_SET_MISMATCH');
 return {status:'NATIVE_OUTCOME_BOUND_UNDER_SUPPLIED_TRUST',closes:closes.length,quotes:actual.length,execution:'MODELED_BBO_ONLY_NOT_FILLS'};
}
