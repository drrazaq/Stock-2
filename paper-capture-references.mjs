import {captureJson} from './capture-json.mjs';
import {sha} from './prospective-paper-capture.mjs';
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&/Z$/.test(x)?Date.parse(x):NaN;
const cik=x=>/^\d{1,10}$/.test(String(x))&&Number(x)>0?String(x).padStart(10,'0'):null;
const mic={XNAS:'NASDAQ',XNYS:'NYSE',XASE:'AMEX',ARCX:'ARCA',BATS:'BATS'};
function need(ok,code){if(!ok)throw Error(code);}
export function validateReferenceBundle(raw,approval){
 need(Buffer.byteLength(raw)<=2*1024*1024&&sha(raw)===approval.referenceSha256,'REFERENCE_PIN');
 const b=captureJson(raw),p=approval.plan,start=Date.parse(p.start);need(b.version===1&&Array.isArray(b.records)&&b.records.length===6&&new Set(b.records.map(x=>x.symbol)).size===6,'REFERENCE_SCOPE');
 need(Array.isArray(approval.referenceReviews)&&approval.referenceReviews.length===6&&new Set(approval.referenceReviews.map(x=>x.symbol)).size===6,'REFERENCE_REVIEW_SCOPE');
 const metadata=[],reasons=[];
 for(const symbol of p.universe){
  const r=b.records.find(r=>r.symbol===symbol),review=approval.referenceReviews?.find(x=>x.symbol===symbol);need(r&&review,'REFERENCE_REVIEW_REQUIRED');
  let known=-Infinity;const objects={};
  for(const kind of ['massive','alpaca','sec']){
   const d=r[kind],limit=kind==='alpaca'?32768:262144;need(d&&typeof d.raw==='string'&&Buffer.byteLength(d.raw)<=limit&&sha(d.raw)===review[kind+'Sha256'],'REFERENCE_RAW_REVIEW_PIN');
   const t=stamp(d.capturedAt);need(Number.isFinite(t)&&t<=start&&start-t<=86400000,'REFERENCE_FRESHNESS');known=Math.max(known,t);objects[kind]=captureJson(d.raw);
  }
  need(r.massive.url==='https://api.massive.com/v3/reference/tickers/'+symbol&&r.alpaca.url==='https://paper-api.alpaca.markets/v2/assets/'+symbol,'REFERENCE_OFFICIAL_URL');
  const m=objects.massive.results,a=objects.alpaca,s=objects.sec;
  need(m&&typeof m==='object'&&a,'REFERENCE_RESPONSE_SCHEMA');
  const issuer=cik(m.cik);need(issuer?r.sec.url==='https://data.sec.gov/submissions/CIK'+issuer+'.json':r.sec.url===null&&s===null,'REFERENCE_SEC_ID_URL');
  const clocks=[stamp(r.validFrom),stamp(r.validTo),stamp(r.zad?.asOf),stamp(r.zad?.expires),stamp(review.reviewedAt)];
  need(clocks.every(Number.isFinite)&&clocks[0]<=start&&clocks[1]>Date.parse(p.end)&&clocks[2]<=start&&clocks[3]>Date.parse(p.end)&&clocks[4]>=known&&clocks[4]<=stamp(approval.approvedAt)&&typeof review.reviewReference==='string'&&review.reviewReference.length>0,'REFERENCE_VALIDITY_OR_REVIEW_CLOCK');
  need(sha(JSON.stringify(r.zad))===review.zadSha256&&['PASS','FAIL','UNKNOWN'].includes(r.zad.status),'REFERENCE_ZAD_PIN');
  let reason=null;
  if(objects.massive.status!=='OK'||objects.massive.error||a.error||s?.error||r.massive.httpStatus!==200||r.alpaca.httpStatus!==200||(issuer&&r.sec.httpStatus!==200))reason='REFERENCE_SOURCE_FAILURE';
  else if(m.ticker!==symbol||a.symbol!==symbol||(!issuer||issuer!==cik(s?.cik))||String(m.sic_code)!==String(s?.sic)||!/^\d{4}$/.test(String(s?.sic))||!/^BBG[A-Z0-9]{9}$/.test(m.share_class_figi||'')||!mic[m.primary_exchange]||mic[m.primary_exchange]!==a.exchange||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(a.id||''))reason='IDENTITY_CLASS_OR_INDUSTRY_CONFLICT';
  else if(m.type!=='CS'||m.active!==true||a.status!=='active'||a.class!=='us_equity'||a.tradable!==true)reason='INSTRUMENT_POLICY_EXCLUDED';
  else if(r.zad.status!=='PASS')reason='CURRENT_ZAD_'+r.zad.status;
  metadata.push({symbol,securityId:reason?null:m.share_class_figi,issuerCik:issuer,industry:reason?null:String(s?.sic),asOf:new Date(known).toISOString(),validFrom:r.validFrom,validTo:r.validTo,instrumentType:m.type||'UNKNOWN',identityAudit:reason?'UNKNOWN':'DOCUMENTED_SOURCE_REVIEW',zad:r.zad.status,referenceSha256:sha(JSON.stringify(r)),sourceAuthenticity:'OWNER_PINNED_OFFICIAL_RESPONSE_REVIEW_REQUIRED',eligibility:reason?'RESEARCH_ONLY':'ELIGIBLE_REQUIRES_SOURCE_AUDIT'});
  reasons.push({symbol,status:reason?'RESEARCH_ONLY':'ELIGIBLE_REQUIRES_SOURCE_AUDIT',reason});
 }
 return {metadata,reasons,raw,sha256:sha(raw)};
}
