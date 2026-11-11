// Admission uses an explicitly reviewed digest of archived official reference bytes.
// No ticker-suffix guesses, API calls, or new collection permissions are introduced.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const unknown=reason=>({status:'UNKNOWN',reason,policyExcluded:false,sourceFailure:false,securityId:null});
export function instrumentType(symbol,{bytes,pinnedSha256,now=Date.now()}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>4*1024*1024||!/^[a-f0-9]{64}$/.test(pinnedSha256||'')||sha(bytes)!==pinnedSha256)return unknown('UNAUTHENTICATED_OR_UNAVAILABLE_REFERENCE');
 let ref;try{ref=JSON.parse(bytes.toString('utf8'));}catch{return unknown('MALFORMED_REFERENCE');}
 if(ref?.kind===BULK_REFERENCE_KIND)return bulkInstrumentType(symbol,ref,{pinnedSha256,now});
 if(ref?.kind!=='REVIEWED_OFFICIAL_INSTRUMENT_CAPTURE_V1'||!Array.isArray(ref.records)||ref.records.length>20000)return unknown('MALFORMED_REFERENCE');
 const rows=ref.records.filter(x=>x?.raw?.results?.ticker===symbol);
 if(rows.length!==1)return unknown(rows.length?'AMBIGUOUS_REFERENCE_IDENTITY':'MISSING_REFERENCE_IDENTITY');
 const r=rows[0],x=r.raw.results,at=typeof r.observedAt==='string'&&/T.*Z$/.test(r.observedAt)?Date.parse(r.observedAt):NaN;
 let url;try{url=new URL(r.url);}catch{return unknown('UNSUPPORTED_REFERENCE_ORIGIN');}
 if(url.protocol!=='https:'||!['api.massive.com','api.polygon.io'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/v3/reference/tickers/'+encodeURIComponent(symbol)||r.transport!=='HTTPS_OFFICIAL_CAPTURE'||r.raw.status!=='OK')return unknown('UNSUPPORTED_REFERENCE_ORIGIN');
 if(!Number.isFinite(now)||!Number.isFinite(at)||at>now||now-at>7*86400000)return unknown('STALE_FUTURE_OR_MISSING_REFERENCE_CLOCK');
 const identity=x.share_class_figi||x.composite_figi;
 if(x.market!=='stocks'||x.locale!=='us'||typeof identity!=='string'||!/^[A-Z0-9]{12}$/.test(identity))return unknown('UNSUPPORTED_OR_AMBIGUOUS_SECURITY_IDENTITY');
 const common={type:x.type,securityId:identity,sourceUrl:r.url,observedAt:r.observedAt,referenceSha256:pinnedSha256,sourceFailure:false};
 if(x.type==='CS')return {...common,status:'ELIGIBLE_COMMON_STOCK',policyExcluded:false,reason:'OFFICIAL_COMMON_STOCK_TYPE; NOT_ZAD_OR_EXECUTION_APPROVAL'};
 if(['WARRANT','RIGHT','RT','UNIT','ETF','ETN','ETV','PFD','ADRW','ADRR','ADRP'].includes(x.type))return {...common,status:'POLICY_EXCLUDED',policyExcluded:true,reason:'COMMON_STOCK_ONLY_POLICY:'+x.type};
 return {...unknown('UNSUPPORTED_INSTRUMENT_TYPE'),...common};
}
export function readInstrumentType(symbol,{file,pinnedSha256,now=Date.now()}={}){
 try{if(!file)return unknown('REFERENCE_NOT_CONFIGURED');const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>4*1024*1024)return unknown('REFERENCE_FILE_UNUSABLE');return instrumentType(symbol,{bytes:fs.readFileSync(file),pinnedSha256,now});}catch{return unknown('REFERENCE_FILE_UNAVAILABLE');}
}
export async function instrumentAwareSec(symbol,lookup,options={}){
 const instrument=readInstrumentType(symbol,options);
 const reviewed=researchInstrumentScope(symbol,instrument);
 if(reviewed.policyExcluded)return {known:false,tags:[],status:'INSTRUMENT_POLICY_EXCLUDED',sourceFailure:false,policyExcluded:true,admissionBlocked:true,instrument:reviewed};
 let sec;try{sec=await lookup(symbol);}catch{sec={known:false,tags:[]};}
 if(instrument.referenceContract===BULK_REFERENCE_KIND&&instrument.status==='ELIGIBLE_COMMON_STOCK'&&sec?.known===true){const current=String(sec.issuerCik??'');if(!/^\d{1,10}$/.test(current)||Number(current)!==Number(instrument.cik))return {...sec,referenceInstrument:instrument,instrument:{...instrument,status:'UNKNOWN',reason:'CURRENT_SEC_ISSUER_IDENTITY_UNESTABLISHED'},admissionBlocked:true,sourceFailure:false,status:'ISSUER_IDENTITY_UNVERIFIED'};}
 return {...sec,instrument,admissionBlocked:instrument.status!=='ELIGIBLE_COMMON_STOCK'||sec?.status==='NO_ISSUER_RECORD',sourceFailure:sec?.sourceFailure??sec?.known!==true,status:sec?.status==='NO_ISSUER_RECORD'?'NO_ISSUER_RECORD':sec?.known===true?(instrument.status==='ELIGIBLE_COMMON_STOCK'?'SEC_KNOWN':'INSTRUMENT_IDENTITY_UNKNOWN'):'SEC_UNAVAILABLE'};
}

// Reviewed public issuer/exchange facts, not a complete or point-in-time universe.
// Instrument restrictions do not constitute a ZAD decision. Unknown stays unknown.
export const REVIEWED_RESEARCH_EXCLUSIONS=Object.freeze({
 ZXZZT:{kind:'TEST_SECURITY',sourceUrl:'https://www.txse.com/alerts/5059533f-8b82-4a4f-944c-7b126dbb7176',sourceDate:'2026-07-06'},
 CRWX:{kind:'LEVERAGED_ETF',underlying:'CRWV',sourceUrl:'https://www.cboe.com/us/equities/listings/listed_products/symbols/CRWX/'},
 CWVX:{kind:'LEVERAGED_ETF',underlying:'CRWV',sourceUrl:'https://www.tradretfs.com/cwvx'},
 CRWG:{kind:'LEVERAGED_ETF',underlying:'CRWV',sourceUrl:'https://leverageshares.com/us/etfs/leverage-shares-2x-long-crwv-daily-etf'},
 AXTU:{kind:'LEVERAGED_ETF',underlying:'AXTI',sourceUrl:'https://www.cboe.com/us/equities/listings/listed_products/symbols/AXTU'},
 BDRY:{kind:'FREIGHT_FUTURES_ETF',sourceUrl:'https://amplifyetfs.com/bdry/'}
});
export function researchInstrumentScope(symbol,instrument){
 const known=REVIEWED_RESEARCH_EXCLUSIONS[symbol];
 if(known)return {status:'POLICY_EXCLUDED',...known,evidence:'PUBLIC_PRIMARY_REVIEW_6802098006',verifiedAt:'2026-11-11',policyExcluded:true};
 if(instrument?.status==='POLICY_EXCLUDED'&&instrument.policyExcluded===true)return {...instrument,status:'POLICY_EXCLUDED'};
 if(instrument?.status==='ELIGIBLE_COMMON_STOCK'&&instrument.securityId&&instrument.referenceSha256)return {...instrument,status:'ELIGIBLE_COMMON_STOCK',policyExcluded:false};
 return {status:'UNKNOWN',policyExcluded:false,reason:'NO_VERIFIED_SECURITY_CLASS',securityId:null};
}

// New, inactive bulk-reference contract. Original list-page provenance is never
// relabelled as a per-ticker GET; the old capture contract above is unchanged.
export const BULK_REFERENCE_KIND='REVIEWED_OFFICIAL_INSTRUMENT_BULK_V1';
export function bulkReferenceUrl(value,{first=false}={}){
 let u;try{u=new URL(value);}catch{throw Error('BULK_ORIGIN_UNKNOWN');}
 if(u.protocol!=='https:'||u.hostname!=='api.massive.com'||u.port||u.username||u.password||u.hash||u.pathname!=='/v3/reference/tickers')throw Error('BULK_ORIGIN_UNKNOWN');
 if([...u.searchParams.keys()].some(k=>!['market','active','limit','sort','order','cursor'].includes(k)))throw Error('BULK_QUERY_UNREVIEWED');
 if(new Set([...u.searchParams.keys()]).size!==[...u.searchParams.keys()].length)throw Error('BULK_QUERY_UNREVIEWED');
 if(first){if(u.searchParams.get('market')!=='stocks'||u.searchParams.get('active')!=='true'||u.searchParams.get('limit')!=='1000'||u.searchParams.get('sort')!=='ticker'||u.searchParams.get('order')!=='asc'||u.searchParams.has('cursor'))throw Error('BULK_QUERY_UNREVIEWED');}
 else if(!u.searchParams.get('cursor')||u.searchParams.get('cursor').length>4096)throw Error('BULK_CURSOR_UNKNOWN');
 return u.href;
}
const bulkClock=v=>typeof v==='string'&&/T.*(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
export function bulkInstrumentType(symbol,ref,{pinnedSha256,now=Date.now()}={}){
 const fail=reason=>unknown(reason);
 if(!Number.isFinite(now)||ref?.kind!==BULK_REFERENCE_KIND||!Array.isArray(ref.pages)||!ref.pages.length||ref.pages.length>14||ref.complete!==true||ref.review?.status!=='INDEPENDENT_PROVENANCE_REVIEWED'||!bulkClock(ref.issuerReceiptAt)||Date.parse(ref.issuerReceiptAt)>now||now-Date.parse(ref.issuerReceiptAt)>7*86400000||!bulkClock(ref.review.at)||Date.parse(ref.review.at)>now)return fail('BULK_REFERENCE_UNVERIFIED');
 let prior='',expected=null,firstAt=null,lastAt=null,total=0,found=[];
 try{for(let i=0;i<ref.pages.length;i++){
  const p=ref.pages[i],url=bulkReferenceUrl(p.url,{first:i===0});
  if(i&&url!==expected||!bulkClock(p.requestAt)||!bulkClock(p.receiptAt)||Date.parse(p.receiptAt)<Date.parse(p.requestAt)||Date.parse(p.receiptAt)>now||now-Date.parse(p.receiptAt)>7*86400000||!/^[a-f0-9]{64}$/.test(p.bodySha256||'')||!Array.isArray(p.records)||p.records.length>1000)return fail('BULK_PAGE_OR_CLOCK_UNKNOWN');
  if(i&&(Date.parse(p.requestAt)-lastAt<0||Date.parse(p.requestAt)-Date.parse(ref.pages[i-1].requestAt)<13000))return fail('BULK_PAGE_OR_CLOCK_UNKNOWN');
  firstAt??=Date.parse(p.requestAt);lastAt=Date.parse(p.receiptAt);expected=p.nextUrl?bulkReferenceUrl(p.nextUrl):null;
  if((i<ref.pages.length-1)!==!!expected)return fail('BULK_PAGINATION_INCOMPLETE');
  for(let k=0;k<p.records.length;k++){const r=p.records[k];if(typeof r?.ticker!=='string'||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(r.ticker)||r.ticker<=prior)return fail('BULK_DUPLICATE_OR_REGRESSING_TICKER');prior=r.ticker;total++;if(r.ticker===symbol)found.push({r,p,index:k});}
 }}catch{return fail('BULK_ORIGIN_UNKNOWN');}
 if(total>14000||lastAt-firstAt>210000||Date.parse(ref.review.at)<lastAt||found.length!==1)return fail(found.length?'BULK_REFERENCE_UNVERIFIED':'MISSING_REFERENCE_IDENTITY');
 return bulkRecordType(found[0],{pinnedSha256,now,ref});
}
// Used only after original-page validation by the consumer or offline assembler.
export function bulkRecordType({r:x,p,index},{pinnedSha256,now=Date.now(),ref}={}){
 const fail=reason=>unknown(reason),identity=x.share_class_figi||x.composite_figi;
 if(x.market!=='stocks'||x.locale!=='us'||x.active!==true||typeof identity!=='string'||!/^[A-Z0-9]{12}$/.test(identity)||x.last_updated_utc&&(!bulkClock(x.last_updated_utc)||Date.parse(x.last_updated_utc)>now))return fail('UNSUPPORTED_OR_AMBIGUOUS_SECURITY_IDENTITY');
 const common={type:x.type,securityId:identity,cik:x.cik||null,sourceUrl:p.url,sourcePageSha256:p.bodySha256,sourceRecordIndex:index,observedAt:p.receiptAt,referenceSha256:pinnedSha256,sourceFailure:false,referenceContract:BULK_REFERENCE_KIND,identityScope:'CLASS_AS_OBSERVED; NOT_CURRENT_TRADABILITY_OR_EXECUTION'};
 if(x.type==='CS')return x.issuerJoin==='MATCHED'&&typeof x.cik==='string'&&/^\d{1,10}$/.test(x.cik)&&Number(x.cik)>0&&!x.securityIdentityConflict&&/^[a-f0-9]{64}$/.test(ref.issuerSha256||'')?{...common,status:'ELIGIBLE_COMMON_STOCK',policyExcluded:false,reason:'OFFICIAL_COMMON_STOCK_TYPE; NOT_ZAD_OR_EXECUTION_APPROVAL'}:{...fail('BULK_ISSUER_'+(x.issuerJoin||'UNVERIFIED')),...common};
 if(['WARRANT','RIGHT','RT','UNIT','ETF','ETN','ETV','PFD','ADRW','ADRR','ADRP'].includes(x.type))return {...common,status:'POLICY_EXCLUDED',policyExcluded:true,reason:'COMMON_STOCK_ONLY_POLICY:'+x.type};
 return {...fail('UNSUPPORTED_INSTRUMENT_TYPE'),...common};
}
