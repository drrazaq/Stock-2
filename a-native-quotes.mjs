// Shared pure native quote normalization; semantics unchanged from the reviewed A collector.
import {createHash} from 'node:crypto';
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const time=x=>{const n=evidenceTime(x);need(Number.isFinite(n),'CLOCK_INVALID');return n;};
const iso=n=>new Date(n).toISOString();
export function nativeNs(s){
 need(typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(s),'NATIVE_QUOTE_CLOCK_INVALID');
 const [main,fraction='']=s.slice(0,-1).split('.');return BigInt(time(main+'Z'))*1000000n+BigInt(fraction.padEnd(9,'0'));
}
export function normalizeAlpacaAQuotes(payload,{symbol,securityId,slot,receivedAt,profile}){
 need(payload&&Object.getPrototypeOf(payload)===Object.prototype&&Array.isArray(payload.quotes)&&payload.next_page_token===null&&(!payload.symbol||payload.symbol===symbol),'QUOTE_ENVELOPE_OR_PAGINATION_UNKNOWN');
 need(profile?.sizeUnits==='SHARES'&&Array.isArray(profile.firmConditions)&&profile.firmConditions.length>0,'QUOTE_SEMANTICS_UNVERIFIED');
 need(payload.quotes.length<=10000,'QUOTE_COUNT_CAP');need(payload.quotes.length||profile.emptyMeansNoEvents===true,'EMPTY_RESPONSE_UNVERIFIED');
 const seen=new Map(),events=[];
 for(const q of payload.quotes){
  const n=nativeNs(q?.t),start=BigInt(time(slot.start))*1000000n,end=BigInt(time(slot.end))*1000000n;
  need(n>=start&&(slot.atEndInclusive?n<=end:n<end)&&n<=BigInt(time(receivedAt))*1000000n,'QUOTE_OUTSIDE_WINDOW_OR_FUTURE');
  need(['bp','ap','bs','as'].every(k=>typeof q[k]==='number'&&Number.isFinite(q[k])&&q[k]>0)&&q.ap>=q.bp&&Number.isInteger(q.bs)&&Number.isInteger(q.as),'QUOTE_VALUES_UNKNOWN');
  need(Array.isArray(q.c)&&q.c.length>0&&q.c.every(c=>profile.firmConditions.includes(c))&&typeof q.bx==='string'&&typeof q.ax==='string'&&typeof q.z==='string','QUOTE_FIRMNESS_UNKNOWN');
  const id=evidenceHash({symbol,native:q});if(seen.has(id))continue;seen.set(id,true);
  events.push({type:'BBO',record:{symbol,securityId,source:'ALPACA_SIP',evidenceId:'ALPACA_NATIVE_'+id,at:iso(Number(n/1000000n)),nativeTimestamp:q.t,nativeTimestampNs:n.toString(),observedAt:receivedAt,sourceDelayMs:0,sizeUnits:'SHARES',bid:q.bp,ask:q.ap,bidSize:q.bs,askSize:q.as,conditions:q.c,bidExchange:q.bx,askExchange:q.ax,tape:q.z}});
 }
 events.sort((a,b)=>BigInt(a.record.nativeTimestampNs)<BigInt(b.record.nativeTimestampNs)?-1:BigInt(a.record.nativeTimestampNs)>BigInt(b.record.nativeTimestampNs)?1:0);
 return events;
}
