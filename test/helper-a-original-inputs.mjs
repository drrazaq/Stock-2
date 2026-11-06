// Synthetic prior originals and review/owner ports. No acquisition or real keys.
import {createHash} from 'node:crypto';import {entryPanelsFixture} from './helper-a-entry-panels.mjs';
const iso=s=>new Date(s).toISOString(),sha=b=>createHash('sha256').update(b).digest('hex');
export function originalInputsFixture(t){return entryPanelsFixture(t,f=>{
 const input=f.input,prior=input.calendar.sessions.find(s=>s.date===input.catalyst.priorSessionDate);
 input.catalyst.firstTradableSessionOpen=iso(input.sessionOpen);input.catalyst.marketCapAsOf=iso(prior.close);
 f.bundle.review=f.signed(f.raw({sourceSha256:input.catalyst.documentHash,claims:input.catalyst}),'REVIEW','2026-11-04T13:02:00Z');
 const envelope=(url,value,at)=>{const bytes=Buffer.from(JSON.stringify(value));return {url,responseUrl:url,redirected:false,httpStatus:200,requestStartedAt:at,headersReceivedAt:at,bodyReceivedAt:at,observedAt:at,bodyBase64:bytes.toString('base64'),bodySha256:sha(bytes)};};
 const pair=e=>{const ref=f.raw(e);return {capture:f.signed(ref,'CAPTURE',e.bodyReceivedAt),witness:f.signed(ref,'WITNESS',e.bodyReceivedAt)};};
 const rows=input.calendar.sessions.map(s=>({date:s.date,open:'09:30',close:'16:00'})),url='https://paper-api.alpaca.markets/v2/calendar?start='+rows[0].date+'&end='+rows.at(-1).date+'&date_type=TRADING',calendar=pair(envelope(url,rows,'2026-11-04T13:00:42Z'));
 const priorCap=pair(envelope('https://api.massive.com/v3/reference/tickers/TEST?date='+prior.date,{results:{ticker:input.symbol,share_class_figi:input.securityId,cik:'1',currency_name:'usd',market_cap:100000000}},'2026-11-03T21:00:01Z'));
 f.bundle.nativeBinding.entryInputs={version:1,calendar:calendar.capture,calendarWitness:calendar.witness,calendarReview:f.signed(f.raw({kind:'A_CALENDAR_ORIGINAL_REVIEW_V1',envelopeHash:calendar.capture.sha256,timezone:'America/New_York',complete:true}),'REVIEW','2026-11-04T13:00:43Z'),priorCap:priorCap.capture,priorCapWitness:priorCap.witness,priorCapReview:f.signed(f.raw({kind:'A_PRIOR_MARKET_CAP_REVIEW_V1',envelopeHash:priorCap.capture.sha256,securityId:input.securityId,basis:'PRIOR_CLOSE_TIMELY_ORIGINAL',capAsOf:iso(prior.close)}),'REVIEW','2026-11-04T13:02:01Z')};
 },{loss:true});}
