// Offline preparation only: consumes already obtained captures and independent review metadata; never fetches or activates a file.
import {createHash} from 'node:crypto';import {instrumentType} from './instrument-type.mjs';
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
