// Offline preparation only: consumes already obtained captures and independent review metadata; never fetches or activates a file.
import {createHash} from 'node:crypto';import {instrumentType,bulkReferenceUrl,bulkRecordType,BULK_REFERENCE_KIND} from './instrument-type.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function prepareInstrumentReference({captureBytes,issuerBytes,review,universe,now=Date.now()}={}){
 if(!Buffer.isBuffer(captureBytes)||captureBytes.length>4*1024*1024||!Buffer.isBuffer(issuerBytes)||issuerBytes.length>4*1024*1024)throw Error('bounded captured inputs required');
 if(!Array.isArray(universe)||!universe.length||universe.length>100||new Set(universe).size!==universe.length||!universe.every(x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x)))throw Error('predeclared unique research universe required');
 if(review?.status!=='INDEPENDENT_PROVENANCE_REVIEWED'||review.captureSha256!==sha(captureBytes)||review.issuerSha256!==sha(issuerBytes)||!review.reviewer||review.issuerUrl!=='https://www.sec.gov/files/company_tickers.json'||!Number.isFinite(Date.parse(review.issuerObservedAt))||now<Date.parse(review.issuerObservedAt)||now-Date.parse(review.issuerObservedAt)>86400000)throw Error('reviewed exact provider and current official issuer captures required');
 const capture=JSON.parse(captureBytes),issuers=JSON.parse(issuerBytes),rows=Object.values(issuers),records=[];const issues=[];
 if(capture.kind!=='REVIEWED_OFFICIAL_INSTRUMENT_CAPTURE_V1'||!Array.isArray(capture.records))throw Error('unsupported capture contract');
 for(const symbol of universe){const hits=capture.records.filter(x=>x?.raw?.results?.ticker===symbol);if(hits.length!==1){issues.push({symbol,status:'UNKNOWN',reason:'MISSING_OR_AMBIGUOUS_PROVIDER_IDENTITY'});continue;}const item=hits[0],ref={kind:capture.kind,records:[item]},bytes=Buffer.from(JSON.stringify(ref)),type=instrumentType(symbol,{bytes,pinnedSha256:sha(bytes),now});
  const providerCik=String(item.raw.results.cik||'').replace(/^0+/,'');const mapped=rows.filter(x=>x?.ticker===symbol);const issuerMatch=type.status!=='ELIGIBLE_COMMON_STOCK'||/^[1-9][0-9]{0,9}$/.test(providerCik)&&mapped.length===1&&String(+mapped[0].cik_str)===providerCik;
  if(type.status==='UNKNOWN'||!issuerMatch){issues.push({symbol,status:'UNKNOWN',reason:issuerMatch?type.reason:'CIK_IDENTITY_UNESTABLISHED'});continue;}
  records.push(item);issues.push({symbol,status:type.status,securityId:type.securityId,issuerMatch});
 }
 const bytes=Buffer.from(JSON.stringify({kind:capture.kind,records}));return {candidateBytes:bytes,candidateSha256:sha(bytes),report:{universeCount:universe.length,retained:records.length,unknown:issues.filter(x=>x.status==='UNKNOWN').length,issues,status:'PREPARED_NOT_ACTIVATED',sourceSha256:sha(captureBytes),issuerSha256:sha(issuerBytes),authority:'Review attests capture provenance; hashes alone do not authenticate provider facts. This never approves ZAD, executable quotes, BUY or deployment.'}};
}

// Fixture-first offline AllTickers assembler. No network, key access, writes or
// activation. Public facts and per-ticker captures are not relabelled as pages.
export function prepareBulkInstrumentReference({pages,issuer,review,now=Date.now()}={}){
 if(!Array.isArray(pages)||!pages.length||pages.length>14||!Buffer.isBuffer(issuer?.bytes)||issuer.bytes.length>4*1024*1024)throw Error('BULK_BOUNDED_ORIGINALS_REQUIRED');
 if(review?.status!=='INDEPENDENT_PROVENANCE_REVIEWED'||!review.reviewer||!Number.isFinite(Date.parse(review.at))||Date.parse(review.at)>now||review.issuerSha256!==sha(issuer.bytes)||issuer.url!=='https://www.sec.gov/files/company_tickers.json'||!Array.isArray(review.pageSha256)||review.pageSha256.length!==pages.length)throw Error('BULK_INDEPENDENT_PROVENANCE_REQUIRED');
 const clock=v=>typeof v==='string'&&/T.*(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
 const intervals=[issuer,...pages];for(const p of intervals)if(p.transport!=='HTTPS_OFFICIAL_CAPTURE'||!clock(p.requestAt)||!clock(p.receiptAt)||Date.parse(p.requestAt)>Date.parse(p.receiptAt)||Date.parse(p.receiptAt)>now||now-Date.parse(p.receiptAt)>86400000)throw Error('BULK_ORIGINAL_CLOCK_UNKNOWN');
 const first=Math.min(...intervals.map(p=>Date.parse(p.requestAt))),last=Math.max(...intervals.map(p=>Date.parse(p.receiptAt)));if(last-first>210000||Date.parse(review.at)<last)throw Error('BULK_SESSION_BOUND_EXCEEDED');
 const ordered=[...intervals].sort((a,b)=>Date.parse(a.requestAt)-Date.parse(b.requestAt));if(ordered.some((p,i)=>i&&Date.parse(p.requestAt)-Date.parse(ordered[i-1].requestAt)<13000))throw Error('BULK_REQUEST_SPACING');
 const map=JSON.parse(issuer.bytes),issuers=Object.values(map);if(!map||Array.isArray(map)||issuers.length>20000)throw Error('BULK_ISSUER_MAP_UNKNOWN');
 const issuerByTicker=new Map();for(const row of issuers){const list=issuerByTicker.get(row?.ticker)||[];list.push(row);issuerByTicker.set(row?.ticker,list);}
 const filtered=[],issues=[],ids=new Map();let previous='',next=null,stored=issuer.bytes.length;
 const joinCounts={matched:0,conflict:0,missing:0,notRequiredForNonCommon:0};
 for(let i=0;i<pages.length;i++){
  const p=pages[i];if(!Buffer.isBuffer(p.bytes)||p.bytes.length>1024*1024||review.pageSha256[i]!==sha(p.bytes))throw Error('BULK_ORIGINAL_HASH_OR_BYTES');stored+=p.bytes.length;
  const url=bulkReferenceUrl(p.url,{first:i===0});if(i&&url!==next)throw Error('BULK_CURSOR_NOT_FROM_PREVIOUS_PAGE');
  if(i&&(Date.parse(p.requestAt)-Date.parse(pages[i-1].requestAt)<13000||Date.parse(p.requestAt)<Date.parse(pages[i-1].receiptAt)))throw Error('BULK_REQUEST_SPACING');
  const raw=JSON.parse(p.bytes);if(raw?.status!=='OK'||!Array.isArray(raw.results)||raw.results.length>1000)throw Error('BULK_SOURCE_SCHEMA_UNKNOWN');
  let redactedNext=null;if(raw.next_url){const u=new URL(raw.next_url);u.searchParams.delete('apiKey');redactedNext=bulkReferenceUrl(u.href);}next=redactedNext;
  if((i<pages.length-1)!==!!next)throw Error('BULK_PAGINATION_INCOMPLETE');
  const records=[];
  for(let index=0;index<raw.results.length;index++){
   const x=raw.results[index];if(typeof x?.ticker!=='string'||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x.ticker)||x.ticker<=previous)throw Error('BULK_DUPLICATE_OR_REGRESSING_TICKER');previous=x.ticker;
   const r=Object.fromEntries(['ticker','name','market','locale','active','type','cik','composite_figi','share_class_figi','last_updated_utc'].filter(k=>k in x).map(k=>[k,x[k]]));
   if(typeof r.name==='string')r.name=r.name.slice(0,256);
   const mapped=issuerByTicker.get(x.ticker)||[],cik=typeof x.cik==='string'&&/^\d{1,10}$/.test(x.cik)?String(+x.cik):null;
   if(x.type!=='CS'){r.issuerJoin='NOT_REQUIRED_FOR_NON_COMMON';joinCounts.notRequiredForNonCommon++;}
   else if(!cik||cik==='0'||!mapped.length){r.issuerJoin='MISSING';joinCounts.missing++;}
   else if(mapped.length!==1||String(+mapped[0].cik_str)!==cik){r.issuerJoin='CONFLICT';joinCounts.conflict++;}
   else{r.issuerJoin='MATCHED';joinCounts.matched++;}
   const figi=x.share_class_figi||x.composite_figi;if(x.type==='CS'&&typeof figi==='string'){const old=ids.get(figi);if(old){r.securityIdentityConflict=true;old.securityIdentityConflict=true;}else ids.set(figi,r);}
   records.push(r);issues.push({symbol:x.ticker,page:i,index,issuerJoin:r.issuerJoin});
  }
  filtered.push({url,requestAt:p.requestAt,receiptAt:p.receiptAt,bodySha256:sha(p.bytes),requestId:typeof raw.request_id==='string'?raw.request_id:null,nextUrl:redactedNext,records});
 }
 const ref={kind:BULK_REFERENCE_KIND,complete:true,pages:filtered,issuerSha256:sha(issuer.bytes),issuerReceiptAt:issuer.receiptAt,review:{status:review.status,reviewer:review.reviewer,at:review.at}};
 const candidateBytes=Buffer.from(JSON.stringify(ref));if(candidateBytes.length>4*1024*1024||stored+candidateBytes.length>24*1024*1024)throw Error('BULK_STORAGE_BOUND_EXCEEDED');
 const pinnedSha256=sha(candidateBytes);for(const issue of issues){const p=filtered[issue.page],t=bulkRecordType({r:p.records[issue.index],p,index:issue.index},{pinnedSha256,now,ref});Object.assign(issue,{status:t.status,reason:t.reason});}
 // Exercise the real outer consumer without O(N²) full-book hashing/parsing.
 for(const issue of [issues[0],issues.at(-1)].filter(Boolean)){const t=instrumentType(issue.symbol,{bytes:candidateBytes,pinnedSha256,now});if(t.status!==issue.status)throw Error('BULK_CONSUMER_PARITY_FAILED');}
 const eligible=issues.filter(x=>x.status==='ELIGIBLE_COMMON_STOCK').map(x=>filtered[x.page].records[x.index]);
 const report={kind:'BULK_PREPARED_NOT_ACTIVATED',pages:pages.length,records:issues.length,missingSourceUpdateTimes:filtered.flatMap(p=>p.records).filter(r=>!r.last_updated_utc).length,verifiedCommonStockSecurityIds:new Set(eligible.map(r=>r.share_class_figi||r.composite_figi)).size,verifiedCommonStockIssuerCiks:new Set(eligible.map(r=>String(+r.cik))).size,joinCounts,issues,firstRequestAt:new Date(first).toISOString(),lastReceiptAt:new Date(last).toISOString(),originalBytes:stored,candidateBytes:candidateBytes.length,externalRequests:0,limitations:'Current reference bracket only; <=7day expiry, no historical knowledge/tradability/quotes/ZAD or automatic refresh/binding.'};
 if(stored+candidateBytes.length+Buffer.byteLength(JSON.stringify(report))+1024*1024>24*1024*1024)throw Error('BULK_STORAGE_BOUND_EXCEEDED');
 return {candidateBytes,candidateSha256:pinnedSha256,report};
}
