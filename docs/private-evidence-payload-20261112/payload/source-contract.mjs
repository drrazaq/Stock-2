// SOURCE CONTRACT (MARKET-03 / CATALYST-03, Claude, 2 Nov 2026). Shared, pure helpers for provider ingress:
// symbol identity, units, clocks, New York session, earnings timing, price adjustment basis and revisions.
// Rules of this module:
//  - It never guesses. An alias, unit, zone or timing it cannot establish is returned as an explicit non-OK status,
//    never coerced into a plausible value. Dot and dash share classes stay distinct (market-symbol.mjs).
//  - Missing, unavailable, malformed, conflicting, stale and future evidence keep different statuses, so a source
//    failure can never read as a successful empty check.
//  - It reads no files, makes no requests and has no strategy inputs, gates or thresholds.
import {createHash} from 'node:crypto';
import {marketSymbol} from './market-symbol.mjs';
import {marketSession} from './market-session.mjs';

export const SOURCE_STATUS=Object.freeze(['OBSERVED','EMPTY','PARTIAL','NOT_FETCHED','MISSING','UNAVAILABLE','REFUSED','RATE_LIMITED','MALFORMED','IDENTITY_MISMATCH','CONFLICT','STALE','FUTURE','UNKNOWN']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const canonicalJson=x=>JSON.stringify(x,(k,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
export const digest=x=>createHash('sha256').update(canonicalJson(x)).digest('hex');

// ---- symbol identity -----------------------------------------------------------------------------------------------
// Class shares: no provider's separator convention is treated as verified, so a class symbol is kept exactly as the
// provider wrote it (BRK.B and BRK-B are two different keys) and labelled; nothing maps one onto the other.
export function providerSymbol(raw,{provider='UNKNOWN',requested=null}={}){
 if(raw===undefined||raw===null||raw==='')return {status:'MISSING',symbol:null,provider,raw:raw??null};
 // Mixed case is a provider notation (Massive writes preferreds as XYZpA); upper-casing it would silently alias another ticker.
 if(typeof raw==='string'&&/[a-z]/.test(raw)&&/[A-Z]/.test(raw))return {status:'INVALID',symbol:null,provider,raw:raw.slice(0,32),reason:'MIXED_CASE_PROVIDER_NOTATION'};
 const symbol=marketSymbol(raw);
 if(!symbol)return {status:'INVALID',symbol:null,provider,raw:typeof raw==='string'?raw.slice(0,32):String(raw).slice(0,32)};
 if(requested!==null){const want=marketSymbol(requested);if(!want||want!==symbol)return {status:'IDENTITY_MISMATCH',symbol:null,provider,raw:String(raw).slice(0,32),requested:String(requested).slice(0,32)};}
 const classShare=/[.\-]/.test(symbol);
 return {status:'OK',symbol,provider,classShare,identityBasis:classShare?'PROVIDER_CLASS_SYMBOL_UNMAPPED':'PROVIDER_TICKER_NOT_SECURITY_ID'};
}

// ---- strict numbers and units --------------------------------------------------------------------------------------
const MISSING_TOKENS=new Set(['','none','null','n/a','na','-','--','nan']);
export function strictNumber(x,{min=-Infinity,max=Infinity}={}){
 if(x===undefined||x===null)return {status:'MISSING',value:null};
 if(typeof x==='string'){const s=x.trim();if(MISSING_TOKENS.has(s.toLowerCase()))return {status:'MISSING',value:null};
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return {status:'INVALID',value:null};x=Number(s);}
 if(typeof x!=='number'||!Number.isFinite(x))return {status:'INVALID',value:null};
 if(x<min||x>max)return {status:'OUT_OF_RANGE',value:null};
 return {status:'OK',value:x};
}

// ---- clocks --------------------------------------------------------------------------------------------------------
const MIN_MS=Date.parse('2000-01-01T00:00:00Z'),MAX_MS=Date.parse('2100-01-01T00:00:00Z');
// A JS Date holds |ms| <= 8.64e15; outside that, Date/Intl formatting throws. Every formatter below checks first.
const inRange=ms=>typeof ms==='number'&&Number.isFinite(ms)&&Math.abs(ms)<=8.64e15;
// Review R1 (Codex, 1 Nov): an impossible day (month 13 or 00, day 32, 30 Feb) is false, never a thrown RangeError.
const validDay=d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const ms=Date.parse(d+'T00:00:00Z');return inRange(ms)&&new Date(ms).toISOString().slice(0,10)===d;};
export const isDay=validDay;
export function nyParts(ms){
 if(!inRange(ms))return {day:null,minute:null};
 const p={};for(const x of new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)))p[x.type]=x.value;
 return {day:p.year+'-'+p.month+'-'+p.day,minute:+p.hour*60+ +p.minute};
}
// kind: 'epoch_s' | 'epoch_ms' | 'iso' (explicit Z or +hh:mm required) | 'date' (YYYY-MM-DD, day precision)
export function parseSourceTime(value,{kind,at,maxFutureMs=0,maxAgeMs=null}={}){
 const now=typeof at==='string'?Date.parse(at):at;
 if(!inRange(now))throw new TypeError('parseSourceTime needs an explicit observation clock');
 if(value===undefined||value===null||value==='')return {status:'MISSING'};
 let ms,precision='INSTANT',basis;
 if(kind==='epoch_s'||kind==='epoch_ms'){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return {status:'INVALID'};
  // A seconds clock read as milliseconds (or the reverse) lands decades away; report the unit, never rescale.
  if(kind==='epoch_s'&&value>1e11||kind==='epoch_ms'&&value<1e11)return {status:'UNIT_MISMATCH'};
  ms=kind==='epoch_s'?value*1000:value;basis='UTC_EPOCH';
 }else if(kind==='iso'){
  if(typeof value!=='string')return {status:'INVALID'};
  const m=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/);
  if(!m||!validDay(m[1])||+m[2]>23||+m[3]>59||m[4]!==undefined&&+m[4]>59)return {status:'INVALID'};
  if(!m[5])return {status:'AMBIGUOUS_ZONE'};
  ms=Date.parse(value);basis='EXPLICIT_OFFSET';
 }else if(kind==='date'){
  if(!validDay(value))return {status:'INVALID'};
  ms=Date.parse(value+'T00:00:00Z');precision='DAY';basis='DATE_ONLY';
 }else throw new TypeError('unknown time kind');
 if(!Number.isFinite(ms)||ms<MIN_MS||ms>=MAX_MS)return {status:'INVALID'};
 if(precision==='DAY'){
  const today=nyParts(now).day;if(value>today)return {status:'FUTURE',day:value,precision,basis};
  if(maxAgeMs!==null&&Date.parse(today+'T00:00:00Z')-ms>maxAgeMs)return {status:'STALE',day:value,precision,basis};
  return {status:'OK',day:value,precision,basis};
 }
 const iso=new Date(ms).toISOString();
 if(ms>now+maxFutureMs)return {status:'FUTURE',iso,precision,basis};
 if(maxAgeMs!==null&&now-ms>maxAgeMs)return {status:'STALE',iso,precision,basis};
 return {status:'OK',iso,ms,precision,basis,nyDay:nyParts(ms).day};
}

// ---- New York session --------------------------------------------------------------------------------------------
// Phases use the exchange calendar in market-session.mjs; a day outside it is CALENDAR_UNKNOWN, never assumed open.
export function sessionPhase(ms){
 if(!inRange(ms))return {phase:'INVALID'};
 const {day,minute}=nyParts(ms),s=marketSession(day);
 if(!s.known)return {phase:'CALENDAR_UNKNOWN',day};
 if(s.closed)return {phase:'CLOSED',day};
 const halfDay=s.close<960,phase=minute<240?'OVERNIGHT':minute<s.open?'PREMARKET':minute<s.close?'REGULAR':minute<1200?'AFTER_HOURS':'OVERNIGHT';
 return {phase,day,halfDay,openMinute:s.open,closeMinute:s.close};
}
export function nextSession(day,{inclusive=false}={}){
 if(!validDay(day))return null;let d=day;
 for(let i=0;i<15;i++){if(!(inclusive&&i===0))d=new Date(Date.parse(d+'T12:00:00Z')+864e5).toISOString().slice(0,10);const s=marketSession(d);if(!s.known)return null;if(!s.closed)return d;}
 return null;
}

// ---- earnings timing -----------------------------------------------------------------------------------------------
const TIMING={FINNHUB:{bmo:'BMO',amc:'AMC',dmh:'DMH'},ALPHA_VANTAGE:{'pre-market':'BMO','post-market':'AMC'}};
export function earningsTiming(provider,raw){
 const t=typeof raw==='string'?TIMING[provider]?.[raw.trim().toLowerCase()]:null;
 return t||'UNKNOWN';
}
// First regular session whose prices can reflect a report. UNKNOWN timing is not resolved by guessing: both
// candidate sessions are returned (the Nasdaq/no-time case in CLAUDE.md open items).
export function reactionSession(day,timing){
 if(!validDay(day))return {status:'INVALID'};
 if(!marketSession(day).known)return {status:'CALENDAR_UNKNOWN'};
 const same=nextSession(day,{inclusive:true}),next=nextSession(day);
 if(!same||!next)return {status:'CALENDAR_UNKNOWN'};
 const tradingDay=!marketSession(day).closed;
 if(timing==='BMO'||timing==='DMH')return {status:'OK',session:same};
 if(timing==='AMC')return {status:'OK',session:tradingDay?next:same};
 return {status:'AMBIGUOUS',session:null,candidates:tradingDay?[same,next]:[same]};
}

// ---- price adjustment basis ----------------------------------------------------------------------------------------
export function adjustmentBasis({provider,adjusted}={}){
 if(['MASSIVE','POLYGON'].includes(provider)){if(adjusted===true)return 'SPLIT_ADJUSTED_AS_OF_FETCH';if(adjusted===false)return 'RAW_UNADJUSTED';}
 if(provider==='LAB_REPORTED')return 'LAB_REPORTED_BASIS_UNVERIFIED';
 return 'UNKNOWN';
}

// ---- revisions -----------------------------------------------------------------------------------------------------
// A generic, bounded revision book. The first content seen for a key is the original; any different content later
// latches CONFLICT for that key permanently (a later reversion does not clear it). Capacity and chronology failures
// are explicit statuses, never silent admission.
export function validRevisionBook(book){
 return object(book)&&Object.entries(book).every(([k,e])=>/^[a-f0-9]{64}$/.test(k)&&object(e)&&['OBSERVED','CONFLICT'].includes(e.status)&&/^[a-f0-9]{64}$/.test(e.first)&&object(e.revisions)&&!!e.revisions[e.first]&&Object.values(e.revisions).every(v=>object(v)&&Number.isFinite(Date.parse(v.firstObservedAt))));
}
export function observeRevision(book,{key,content,at,capacity=10000,maxRevisions=16}){
 if(!object(book)||typeof key!=='string'||!key||!Number.isFinite(Date.parse(at)))throw new TypeError('REVISION_BOOK_UNREADABLE');
 const id=digest(key),rev=digest(content);let e=book[id];
 if(e&&!validRevisionBook({[id]:e}))throw new TypeError('REVISION_BOOK_UNREADABLE');
 if(!e){if(Object.keys(book).length>=capacity)return {status:'CAPACITY',id,revision:rev};e=book[id]={status:'OBSERVED',first:rev,revisions:{[rev]:{firstObservedAt:at}}};return {status:'FIRST',id,revision:rev,firstObservedAt:at};}
 if(Date.parse(at)<Date.parse(e.revisions[e.first].firstObservedAt))return {status:'CHRONOLOGY',id,revision:rev};
 if(e.revisions[rev]&&e.status==='OBSERVED')return {status:'SAME',id,revision:rev,firstObservedAt:e.revisions[e.first].firstObservedAt};
 if(!e.revisions[rev]&&Object.keys(e.revisions).length<maxRevisions)e.revisions[rev]={firstObservedAt:at};
 e.status='CONFLICT';
 return {status:'CONFLICT',id,revision:rev,original:e.first,firstObservedAt:e.revisions[e.first].firstObservedAt};
}

// ---- combining provider statuses ---------------------------------------------------------------------------------
// A lane is OBSERVED only when every required provider observed; any failure keeps the lane non-OBSERVED.
export function combineStatus(statuses){
 const s=statuses.filter(Boolean);if(!s.length)return 'NOT_FETCHED';
 if(s.every(x=>x==='OBSERVED'||x==='EMPTY'))return s.every(x=>x==='EMPTY')?'EMPTY':'OBSERVED';
 if(s.includes('CONFLICT'))return 'CONFLICT';
 if(s.some(x=>x==='OBSERVED'||x==='EMPTY'||x==='PARTIAL'))return 'PARTIAL';
 return 'UNKNOWN';
}

// ---- bounded JSON transport ------------------------------------------------------------------------------------------
// One request, no redirect, a hard deadline even if the fetcher ignores AbortSignal, a counted byte cap and distinct
// failure statuses. A refused/limited/oversized/unparseable answer is never returned as an observed empty body.
export const JSON_SOURCE_LIMITS=Object.freeze({bytes:4194304,timeoutMs:15000});
export async function readJsonSource(fetcher,url,{maxBytes=JSON_SOURCE_LIMITS.bytes,timeoutMs=JSON_SOURCE_LIMITS.timeoutMs}={}){
 const controller=new AbortController(),requestedAt=new Date().toISOString();let timer,reader;
 const out=(status,extra={})=>({status,requestedAt,receivedAt:new Date().toISOString(),body:null,...extra});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SOURCE_TIMEOUT'));},timeoutMs);});
 const task=async()=>{
  const r=await fetcher(url,{redirect:'error',signal:controller.signal});
  if(!r.ok){try{r.body?.cancel?.()?.catch?.(()=>{});}catch{}return out(r.status===429?'RATE_LIMITED':[401,402,403].includes(r.status)?'REFUSED':'HTTP_ERROR',{httpStatus:r.status});}
  let text;
  if(r.body?.getReader){reader=r.body.getReader();const parts=[];let bytes=0;
   for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>maxBytes)return out('BODY_LIMIT',{httpStatus:r.status});parts.push(Buffer.from(p.value));}
   try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts));}catch{return out('INVALID_JSON',{httpStatus:r.status});}}
  else return out('INVALID_JSON',{httpStatus:r.status});
  let body;try{body=JSON.parse(text);}catch{return out('INVALID_JSON',{httpStatus:r.status});}
  return out('OK',{httpStatus:r.status,body});
 };
 try{return await Promise.race([task(),deadline]);}catch(e){return out(e.message==='SOURCE_TIMEOUT'?'TIMEOUT':'NETWORK_ERROR');}
 finally{clearTimeout(timer);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
}

// ---- daily-close freshness ---------------------------------------------------------------------------------------------
// The newest regular session whose close has happened at `ms` (New York calendar). Weekends and holidays do not age a close:
// Friday's close is current until Monday's close. Outside the known calendar the answer is null (unknown), never a guess.
export function latestCompletedSession(ms){
 if(!inRange(ms))return null;const {day,minute}=nyParts(ms);let d=day;
 for(let i=0;i<15;i++){const s=marketSession(d);if(!s.known)return null;if(!s.closed&&(d<day||minute>=s.close))return d;d=new Date(Date.parse(d+'T12:00:00Z')-864e5).toISOString().slice(0,10);}
 return null;
}
// Sessions between a data day and the latest completed session (0 = current close). null when the calendar cannot say.
export function closeLagSessions(day,ms){
 const latest=latestCompletedSession(ms);if(!latest||!validDay(day))return null;if(day>latest)return -1;
 let n=0,d=latest;while(d>day&&n<60){d=new Date(Date.parse(d+'T12:00:00Z')-864e5).toISOString().slice(0,10);const s=marketSession(d);if(!s.known)return null;if(!s.closed)n++;}
 return d===day||d<day?n:null;
}
