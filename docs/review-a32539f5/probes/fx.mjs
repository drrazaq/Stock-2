// All bytes, identities, keys and receipts are SYNTHETIC demonstrations, never prospective evidence.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {evidenceFixture} from '<WORKTREE>/test/helper-a-evidence.mjs';
import {createAFencedStore} from '<WORKTREE>/a-fenced-store.mjs';
import {sourceHash} from '<WORKTREE>/a-native-source-join.mjs';
import {normalizeAlpacaAQuotes} from '<WORKTREE>/a-native-quotes.mjs';
import {normalizeRetainedClose} from '<WORKTREE>/a-close-source.mjs';
import {evidenceHash} from '<WORKTREE>/reclaim-research-workflow.mjs';
import {openNativeRun,appendNativeSubmissions,appendNativeResponse,nativeRunDigest} from '<WORKTREE>/native-sec-events.mjs';
export function nativeImportFixture({loss=false,lateAcceptance=false,nativeProv='SYNTHETIC_FIXTURE',reviewOrigin='SYNTHETIC',storeOrigin='SYNTHETIC',authority=null}={}){
 const f=evidenceFixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'a-native-import-')),sid='BBG000000001',cik='0000000001',acc='0000000001-26-000001',symbol='TEST',sourceSha='a'.repeat(40);
 const clock=at=>({requestStartedAt:at,headersReceivedAt:at,bodyReceivedAt:at,observedAt:at});
 const envelope=(url,body,at)=>{const bytes=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));return {url,responseUrl:url,redirected:false,httpStatus:200,...clock(at),bodySha256:sourceHash(bytes),bodyBase64:bytes.toString('base64')};};
 const cap=(value,at)=>f.signed(f.raw(value),'CAPTURE',at),review=(value,at)=>f.signed(f.raw(value),'REVIEW',at);
 f.input.securityId=sid;f.input.issuerId='CIK'+cik;f.input.catalyst.securityId=sid;for(const b of f.input.bars)b.securityId=sid;
 const urls={massive:'https://api.massive.com/v3/reference/tickers/TEST?date=2026-11-03',alpaca:'https://paper-api.alpaca.markets/v2/assets/TEST',sec:'https://data.sec.gov/submissions/CIK'+cik+'.json'};
 const sources={massive:cap(envelope(urls.massive,{results:{ticker:symbol,share_class_figi:sid,cik:'1',type:'CS',active:true,primary_exchange:'XNAS'}},'2026-11-03T20:59:00Z'),'2026-11-03T20:59:00Z'),alpaca:cap(envelope(urls.alpaca,{symbol,id:'11111111-1111-4111-8111-111111111111',class:'us_equity',status:'active',tradable:true,exchange:'NASDAQ'},'2026-11-03T20:59:00Z'),'2026-11-03T20:59:00Z'),sec:cap(envelope(urls.sec,{cik:1},'2026-11-03T20:59:00Z'),'2026-11-03T20:59:00Z')};
 const ir={kind:'A_IDENTITY_REVIEW_V1',symbol,securityId:sid,issuerCik:cik,providerAssetId:'11111111-1111-4111-8111-111111111111',instrument:'US_COMMON_STOCK',sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.sha256])),validFrom:'2026-11-03T00:00:00Z',validUntil:'2026-11-12T00:00:00Z'};
 const identity={sources,review:review(ir,'2026-11-03T21:00:00Z')};f.input.identityEvidenceId='A_IDENTITY_'+evidenceHash({...ir.sourceHashes,validFrom:ir.validFrom,validUntil:ir.validUntil});f.input.identityAsOf='2026-11-03T21:00:00Z';
 const native=openNativeRun({directory:root+'/native',runId:'SYNTHETIC_PREFIX',sourceSha,provenance:nativeProv}),sub={cik:1,filings:{recent:{form:['8-K'],accessionNumber:[acc],acceptanceDateTime:['2026-11-04T13:00:00Z'],primaryDocument:['synthetic.htm']}}};
 const atom=()=>appendNativeResponse(native,{body:Buffer.from(`<feed><entry><title>8-K - SYNTHETIC ISSUER (0000000001) (Filer)</title><updated>2026-11-04T12:59:59Z</updated><id>urn:tag:sec.gov,2008:accession-number=${acc}</id></entry></feed>`),url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',responseUrl:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',redirected:false,httpStatus:200,legacySeen:new Set(),...clock('2026-11-04T13:00:30Z')});
 if(lateAcceptance)atom();appendNativeSubmissions(native,{body:Buffer.from(JSON.stringify(sub)),url:urls.sec,responseUrl:urls.sec,redirected:false,httpStatus:200,...clock(lateAcceptance?'2026-11-04T13:00:31Z':'2026-11-04T13:00:20Z')});if(!lateAcceptance)atom();
 const snapshot={...nativeRunDigest(native.directory),runId:native.runId,sourceSha},archive=cap(snapshot,'2026-11-04T13:00:32Z'),primaryBody=Buffer.from('SYNTHETIC ONLY: committed contract USD20m, prior cap USD100m; not a filing.'),primaryUrl='https://www.sec.gov/Archives/edgar/data/1/000000000126000001/synthetic.htm',primary=envelope(primaryUrl,primaryBody,'2026-11-04T13:01:00Z');
 Object.assign(f.input.catalyst,{sourceId:'SEC_FILING_V1:'+cik+':'+acc,sourceUrl:primaryUrl,documentHash:sourceHash(primaryBody),publishedAt:'2026-11-04T13:00:00Z',observedAt:'2026-11-04T13:01:00Z'});
 f.bundle.source=f.signed(f.raw(primaryBody),'CAPTURE',f.input.catalyst.observedAt,{sourceUrl:primaryUrl});f.bundle.review=review({sourceSha256:sourceHash(primaryBody),claims:f.input.catalyst},'2026-11-04T13:02:00Z');
 const primaryRef=cap(primary,primary.bodyReceivedAt),profile={sizeUnits:'SHARES',firmConditions:['R'],emptyMeansNoEvents:true,source:'SYNTHETIC_NOT_PROVIDER_CONFIRMATION'},profileRef=review(profile,'2026-11-03T21:00:00Z');
 const qrow=(t,bid,ask)=>({t,bp:bid,ap:ask,bs:1000,as:1000,bx:'V',ax:'V',z:'C',c:['R']});
 const quoteEnvelope=(rows,at)=>envelope('https://data.alpaca.markets/v2/stocks/TEST/quotes?feed=sip',{symbol,quotes:rows,next_page_token:null},at);
 const qe=quoteEnvelope([qrow('2026-11-04T14:45:04.000000000Z',10.49,10.5)],f.input.asOf),entryQuote=cap(qe,qe.bodyReceivedAt);
 f.input.quote=normalizeAlpacaAQuotes(JSON.parse(Buffer.from(qe.bodyBase64,'base64')),{symbol,securityId:sid,slot:{start:'2026-11-04T14:44:35Z',end:f.input.asOf,atEndInclusive:true},receivedAt:qe.bodyReceivedAt,profile})[0].record;
 const captureHost=cap({kind:'A_CAPTURE_HOST_CONTEXT_V1',hostId:'SYNTHETIC_HOST_CAPTURE',collectorId:'SYNTHETIC_COLLECTOR_CAPTURE',transportReference:f.contract.collectors[0].provenanceReference,sourceCodeSha:sourceSha},'2026-11-04T13:02:10Z'),witnessHost=f.signed(f.raw({kind:'A_CAPTURE_HOST_CONTEXT_V1',hostId:'SYNTHETIC_HOST_WITNESS',collectorId:'SYNTHETIC_COLLECTOR_WITNESS',transportReference:f.contract.collectors[1].provenanceReference,sourceCodeSha:sourceSha}),'WITNESS','2026-11-04T13:02:20Z');
 const provenance=review({kind:'A_NATIVE_PROVENANCE_REVIEW_V1',archiveHash:archive.sha256,primaryEnvelopeHash:primaryRef.sha256,identityReviewHash:identity.review.sha256,sourceCodeSha:sourceSha,origin:reviewOrigin,captureHost,witnessHost},'2026-11-04T13:03:00Z');
 const closeContract=review({kind:'A_RAW_AGGREGATE_TRIGGER_CONTRACT_V1',adopted:false,execution:'SEPARATE_BBO_ONLY',adjustment:'raw',finalityEvidenceRequired:true},'2026-11-03T21:00:00Z');
 const closes=[],records=[];
 for(const s of f.input.calendar.sessions.slice(1,6)){
  const availableAt=s.date+'T21:00:01Z',price=loss&&s.date==='2026-11-04'?9.5:11,p=envelope('https://data.alpaca.markets/v2/stocks/TEST/bars?feed=sip&adjustment=raw&timeframe=1Day',{symbol,bars:[{t:s.date+'T05:00:00Z',c:price,v:1000}],next_page_token:null},availableAt),ref=cap(p,availableAt),normalized=normalizeRetainedClose(p,{symbol,securityId:sid,session:s.date}),evidenceId='SYNTHETIC_NATIVE_CLOSE_'+s.date;
  closes.push({evidenceId,sessionDate:s.date,envelope:ref,identity,finality:review({kind:'A_CLOSE_ORIGINAL_REVIEW_V1',envelopeHash:ref.sha256,barRevisionHash:normalized.barRevisionHash,priceBasis:'RAW_AGGREGATE_TRIGGER_NOT_FILL',finality:'REVIEWED_UNDER_SUPPLIED_CONTEXT'},availableAt)});records.push({type:'CLOSE',record:{securityId:sid,sessionDate:s.date,evidenceId,at:s.close,availableAt,close:price}});
 }
 const endDate=loss?'2026-11-05':'2026-11-10',slot=loss?{type:'BBO',start:endDate+'T14:30:00Z',end:endDate+'T14:30:30Z',atEndInclusive:true}:{type:'BBO',start:endDate+'T20:59:30Z',end:endDate+'T21:00:00Z',atEndInclusive:false},q=quoteEnvelope(loss?[qrow(endDate+'T14:30:00.000000000Z',9.2,9.21),qrow(endDate+'T14:30:02.000000000Z',12,12.01)]:[qrow(endDate+'T20:59:59.000000000Z',11,11.01)],loss?endDate+'T14:30:03Z':endDate+'T21:00:00Z');
 const exitQuotes=[{slot,envelope:cap(q,q.bodyReceivedAt)}];records.push(...normalizeAlpacaAQuotes(JSON.parse(Buffer.from(q.bodyBase64,'base64')),{symbol,securityId:sid,slot,receivedAt:q.bodyReceivedAt,profile}));
 f.zadRecord.securityId=sid;f.zadRecord.issuerId=f.input.issuerId;f.bundle.zad=[f.signed(f.raw(f.zadRecord),'OWNER',f.input.zadAsOf)];f.refreshDecision();f.bundle.outcomes=f.seal(f.makeTape(records));f.syncWitness(records);
 f.bundle.nativeBinding={version:1,identity,archive,primary:primaryRef,provenance,entryQuote,quoteProfile:profileRef,closeContract,closes,exitQuotes};
 const store=createAFencedStore(root+'/store',{origin:storeOrigin,...(authority?{recoveryAuthority:authority}:{}),cohortHash:'a'.repeat(64),contractHash:evidenceHash(f.contract)}),token=store.claim({expectedToken:null,owner:'SYNTHETIC',at:'2026-11-03T00:00:00Z',boundaryEvidenceHash:'b'.repeat(64)}).token;
 function request(){return {version:1,storeOrigin,storeDirectory:root+'/store',fenceToken:token,dataset:f.raw(f.dataset),contract:f.raw(f.contract),nativeRuns:{[f.input.observationId]:{directory:native.directory,expectedRunId:native.runId,expectedSourceSha:sourceSha}}};}
 return {...f,root,store,token,native,identity,primary,records,request,cleanup:()=>{f.cleanup();fs.rmSync(root,{recursive:true,force:true});}};
}
