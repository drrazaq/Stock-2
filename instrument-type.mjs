// Admission uses an explicitly reviewed digest of archived official reference bytes.
// No ticker-suffix guesses, API calls, or new collection permissions are introduced.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const unknown=reason=>({status:'UNKNOWN',reason,policyExcluded:false,sourceFailure:false,securityId:null});
export function instrumentType(symbol,{bytes,pinnedSha256,now=Date.now()}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>4*1024*1024||!/^[a-f0-9]{64}$/.test(pinnedSha256||'')||sha(bytes)!==pinnedSha256)return unknown('UNAUTHENTICATED_OR_UNAVAILABLE_REFERENCE');
 let ref;try{ref=JSON.parse(bytes.toString('utf8'));}catch{return unknown('MALFORMED_REFERENCE');}
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
 if(instrument.policyExcluded)return {known:false,tags:[],status:'INSTRUMENT_POLICY_EXCLUDED',sourceFailure:false,policyExcluded:true,admissionBlocked:true,instrument};
 let sec;try{sec=await lookup(symbol);}catch{sec={known:false,tags:[]};}
 return {...sec,instrument,admissionBlocked:instrument.status!=='ELIGIBLE_COMMON_STOCK',sourceFailure:sec?.known!==true,status:sec?.known===true?(instrument.status==='ELIGIBLE_COMMON_STOCK'?'SEC_KNOWN':'INSTRUMENT_IDENTITY_UNKNOWN'):'SEC_SOURCE_UNAVAILABLE'};
}
