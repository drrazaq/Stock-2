// Development-only public research ingress. Importing never fetches, sends or changes a rule.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {marketSymbol} from './market-symbol.mjs';
import fs from 'node:fs';
import {appendRadarRows,readRadarLedger} from './radar-ledger.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const clock=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const clean=x=>typeof x==='string'?x.replace(/[\r\n\t]+/g,' ').trim().slice(0,500):'';
export const PUBLIC_RESEARCH_HORIZON_AGE=Object.freeze({SHORT:72*3600000,MID:30*86400000,LONG:180*86400000});
export const PUBLIC_RESEARCH_LIMITS=Object.freeze({requests:8,sources:12,bytesPerResponse:131072,records:30,timeoutMs:10000,cycleMs:120000});
// Seeds are registry proposals, not enabled subscriptions or independently verified issuer references.
export const PUBLIC_RESEARCH_SEEDS=Object.freeze([
 {id:'apple-newsroom',category:'ISSUER',url:'https://www.apple.com/newsroom/rss-feed.rss',format:'ATOM',issuer:{name:'Apple Inc.',symbol:'AAPL',securityId:'SEC_CIK:0000320193',identityState:'SEEDED_REQUIRES_REFERENCE'}},
 {id:'sec-current',category:'SEC',url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',format:'ATOM'},
 {id:'fda-press',category:'FDA',url:'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',format:'RSS'},
 {id:'fed-press',category:'GOVERNMENT',url:'https://www.federalreserve.gov/feeds/press_all.xml',format:'RSS'},
 {id:'semiconductor-industry',category:'INDUSTRY',url:'https://www.semiconductors.org/feed/',format:'RSS'},
 {id:'public-video',category:'YOUTUBE',url:'https://www.youtube.com/@BankingWithBilly',format:'ACCESS_PROPOSAL'},
 {id:'public-social',category:'SOCIAL',url:'https://bsky.app/',format:'ACCESS_PROPOSAL'},
 {id:'public-research',category:'RESEARCH',url:'https://www.nber.org/rss/new.xml',format:'RSS'},
 {id:'github-tensorrt',category:'GITHUB',url:'https://github.com/NVIDIA/TensorRT/releases.atom',format:'ATOM'}
].map(x=>Object.freeze({...x,reviewed:false,enabled:false})));
export function publicResearchUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{const u=new URL(raw),h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(h)||h.includes(':')||!h.includes('.')||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(h))return null;
 for(const k of u.searchParams.keys())if(/token|secret|password|credential|api.?key|auth/i.test(k))return null;u.hash='';return u.href;}catch{return null;}
}
const unescape=x=>x.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
const tag=(s,n)=>{const m=s.match(new RegExp('<(?:[\\w-]+:)?'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?'+n+'>','i'));return m?unescape(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'' )).trim():null;};
export function publicFeedEntries(body,source){
 if(typeof body!=='string'||Buffer.byteLength(body)>PUBLIC_RESEARCH_LIMITS.bytesPerResponse||/<!DOCTYPE|<!ENTITY/i.test(body))throw Error('UNSUPPORTED_OR_OVERSIZE_FEED');
 const atom=source.format==='ATOM',blocks=[...body.matchAll(atom?/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi:/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)].map(x=>x[0]);
 if(!blocks.length)throw Error('NO_PARSEABLE_ENTRIES_NOT_NO_NEWS');
 return blocks.slice(0,PUBLIC_RESEARCH_LIMITS.records).map(b=>({url:atom?(b.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]||tag(b,'id')):tag(b,'link'),claim:tag(b,'title'),publishedAt:atom?tag(b,'published'):tag(b,'pubDate'),updatedAt:tag(b,'updated'),contentHash:hash(b)}));
}
function qualifiedTime(raw){if(!raw||typeof raw!=='string'||!/(?:Z|[+-]\d\d:?\d\d|GMT|UTC)$/i.test(raw.trim()))return null;const t=Date.parse(raw);return Number.isFinite(t)?new Date(t).toISOString():null;}
function leadBody(r){const {evidenceVersion,...body}=r;return body;}
export function makePublicLead(source,entry,{receivedAt,processedAt=receivedAt,prior=[]}={}){
 const url=publicResearchUrl(entry.url),sourceUrl=publicResearchUrl(source.url),claim=clean(entry.claim),pub=qualifiedTime(entry.publishedAt),updated=qualifiedTime(entry.updatedAt);
 if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(source.id||''))throw Error('INVALID_SOURCE_ID');
 if(!clock(receivedAt)||!clock(processedAt)||Date.parse(processedAt)<Date.parse(receivedAt))throw Error('INVALID_RECEIPT_CLOCK');
 if(!url||!sourceUrl||new URL(url).hostname!==new URL(sourceUrl).hostname||!claim||!/^[a-f0-9]{64}$/.test(entry.contentHash||''))throw Error('SOURCE_IDENTITY_OR_CONTENT_UNVERIFIED');
 const now=Date.parse(processedAt),leadId=hash([source.id,url]),old=prior.filter(x=>validPublicLead(x,now)&&x.leadId===leadId).sort((a,b)=>String(a.firstObservedAt).localeCompare(String(b.firstObservedAt)))[0];
 const future=[pub,updated].filter(Boolean).some(t=>Date.parse(t)>Date.parse(receivedAt)),age=pub||updated,expired=age&&now-Date.parse(age)>PUBLIC_RESEARCH_HORIZON_AGE.LONG;
 const identity=source.issuer&&marketSymbol(source.issuer.symbol)===source.issuer.symbol?{name:clean(source.issuer.name),symbol:source.issuer.symbol,securityId:clean(source.issuer.securityId),identityState:'SEEDED_REQUIRES_REFERENCE'}:null;
 const row={type:'public-lead',schema:'PUBLIC_RESEARCH_LEAD_V1',id:hash([source.id,url,entry.contentHash]),leadId,sourceId:source.id,sourceCategory:source.category,sourceUrl,url,contentHash:entry.contentHash,claim,issuer:identity,symbol:identity?.symbol||null,publicationAt:pub,updatedAt:updated,firstObservedAt:old?.firstObservedAt||receivedAt,receivedAt,processedAt,expiresAt:age?new Date(Date.parse(age)+PUBLIC_RESEARCH_HORIZON_AGE.LONG).toISOString():null,expiryByHorizon:Object.fromEntries(Object.entries(PUBLIC_RESEARCH_HORIZON_AGE).map(([h,ms])=>[h,age?new Date(Date.parse(age)+ms).toISOString():null])),
  syndicationCandidateKey:hash([identity?.securityId||source.id,claim.toLowerCase(),pub||updated||null]),syndicationState:'EXACT_CLAIM_CLOCK_SEEDED_IDENTITY_CANDIDATE_NOT_INDEPENDENT_EVIDENCE',
  quality:future?'REJECTED_FUTURE_TIMESTAMP':expired?'EXPIRED':!pub?'PUBLICATION_TIME_UNKNOWN':'OBSERVED_PUBLIC_DOCUMENT',horizons:['SHORT','MID','LONG'],primaryCorroboration:source.category==='ISSUER'?'ISSUER_SELF_REPORT_ONLY_NOT_INDEPENDENT':source.category==='SEC'?'REGULATORY_DOCUMENT_REQUIRES_ISSUER_JOIN':'NOT_ESTABLISHED',contradictions:[],corporateActions:'UNKNOWN_REQUIRES_DATED_REFERENCE',offersDilution:'UNKNOWN_REQUIRES_FILING_CHECK',quote:'UNKNOWN',frozenRule:null,actionAuthority:false,fill:'NO_OBSERVED_FILL'};
 row.evidenceVersion=hash(leadBody(row));return row;
}
export function validPublicLead(r,now=Date.now()){
 return r?.type==='public-lead'&&r.schema==='PUBLIC_RESEARCH_LEAD_V1'&&r.actionAuthority===false&&typeof r.sourceId==='string'&&r.sourceId.length>0&&publicResearchUrl(r.url)===r.url&&publicResearchUrl(r.sourceUrl)===r.sourceUrl&&new URL(r.url).hostname===new URL(r.sourceUrl).hostname&&/^[a-f0-9]{64}$/.test(r.contentHash||'')&&r.id===hash([r.sourceId,r.url,r.contentHash])&&r.leadId===hash([r.sourceId,r.url])&&r.evidenceVersion===hash(leadBody(r))&&[r.receivedAt,r.processedAt,r.firstObservedAt].every(t=>clock(t)&&Date.parse(t)<=now)&&Date.parse(r.firstObservedAt)<=Date.parse(r.receivedAt)&&Date.parse(r.receivedAt)<=Date.parse(r.processedAt)&&clean(r.claim)===r.claim&&r.symbol===(r.issuer?.symbol||null)&&(!r.symbol||marketSymbol(r.symbol)===r.symbol)&&[r.publicationAt,r.updatedAt].every(t=>t===null||clock(t))&&(![r.publicationAt,r.updatedAt].filter(Boolean).some(t=>Date.parse(t)>Date.parse(r.receivedAt))||r.quality==='REJECTED_FUTURE_TIMESTAMP');
}
export function publicLeadResearchCard(r,{now=Date.now(),horizon='SHORT'}={}){
 if(!validPublicLead(r,now))return 'WAIT | public lead UNVERIFIED; no entry or exit authority';
 const horizonExpiry=r.expiryByHorizon?.[horizon]||r.expiresAt,expired=r.quality==='EXPIRED'||horizonExpiry&&Date.parse(horizonExpiry)<=now,rejected=r.quality==='REJECTED_FUTURE_TIMESTAMP',status=expired||rejected?'NO BUY':'WAIT';
 return [status+' '+(r.symbol||'ISSUER UNKNOWN'),'PUBLIC SOURCE RESEARCH; NOT AN APPROVED BUY',r.claim,r.url,'published '+(r.publicationAt||'UNKNOWN')+'; updated '+(r.updatedAt||'UNKNOWN')+'; first observed '+r.firstObservedAt,'quality '+(expired?'EXPIRED':r.quality),'identity '+(r.issuer?.identityState||'UNKNOWN')+'; corroboration '+r.primaryCorroboration,'corporate actions / offering / dilution UNKNOWN; absent news is not no event','entry / sizing / exit / executable quote / costs UNKNOWN; no frozen eligible rule','no observed fill; '+(horizonExpiry?horizon+' content expiry '+horizonExpiry:'expiry UNKNOWN')].join(' | ');
}
export function publicSourceCandidates(leads,registry=[]){
 const known=new Set(registry.map(s=>s.url)),out=[];
 for(const r of leads){if(!validPublicLead(r))continue;const u=publicResearchUrl(r.url);if(!u||known.has(u))continue;known.add(u);out.push({id:hash(u),url:u,discoveredFrom:r.id,category:r.sourceCategory,state:'DISCOVERED_UNREVIEWED_NOT_FETCHED',enabled:false});if(out.length>=PUBLIC_RESEARCH_LIMITS.sources)break;}
 return out;
}
async function boundedBody(response){
 if(Number(response.headers?.get?.('content-length'))>PUBLIC_RESEARCH_LIMITS.bytesPerResponse)throw Error('RESPONSE_BYTE_CAP');
 const reader=response.body?.getReader?.();if(!reader)throw Error('STREAM_READER_REQUIRED');let size=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>PUBLIC_RESEARCH_LIMITS.bytesPerResponse)throw Error('RESPONSE_BYTE_CAP');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
 return Buffer.concat(parts).toString('utf8');
}
export async function publicResearchCycle({enabled=false,sources=PUBLIC_RESEARCH_SEEDS,state={},prior=[],fetcher=globalThis.fetch,now=()=>Date.now()}={}){
 if(!enabled)return {state:'DISABLED_NO_ACTION',requests:0,leads:[],receipts:[],next:state};
 if(!Array.isArray(sources)||sources.length>PUBLIC_RESEARCH_LIMITS.sources||!Number.isInteger(state.cursor??0)||(state.cursor??0)<0)throw Error('INVALID_REGISTRY_OR_CURSOR');
 const started=now(),leads=[],receipts=[],discovered=[];let cursor=(state.cursor||0)%Math.max(1,sources.length),requests=0;
 for(let n=0;n<sources.length&&leads.length<PUBLIC_RESEARCH_LIMITS.records&&requests<PUBLIC_RESEARCH_LIMITS.requests&&now()-started<PUBLIC_RESEARCH_LIMITS.cycleMs;n++){
  const source=sources[cursor];cursor=(cursor+1)%sources.length;if(!source.enabled||!source.reviewed){receipts.push({sourceId:source.id,state:'NOT_FETCHED_UNREVIEWED_OR_DISABLED'});continue;}
  const url=publicResearchUrl(source.url),requestedAt=new Date(now()).toISOString();if(!url){receipts.push({sourceId:source.id,state:'INVALID_PUBLIC_SOURCE_URL'});continue;}
  requests++;try{
   const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(PUBLIC_RESEARCH_LIMITS.timeoutMs),headers:{Accept:'application/atom+xml, application/rss+xml, application/xml'}});
   if(!response.ok)throw Error('HTTP_'+response.status);if(response.url&&response.url!==url)throw Error('UNREVIEWED_REDIRECT');
   const body=await boundedBody(response);for(const m of body.matchAll(/href=["']([^"']+)["']/gi)){const candidate=publicResearchUrl(unescape(m[1]));if(candidate&&discovered.length<PUBLIC_RESEARCH_LIMITS.sources&&!sources.some(s=>s.url===candidate)&&!discovered.some(s=>s.url===candidate))discovered.push({id:hash(candidate),url:candidate,discoveredFrom:source.id,state:'DISCOVERED_UNREVIEWED_NOT_FETCHED',enabled:false});}const receivedAt=new Date(now()).toISOString(),entries=publicFeedEntries(body,source),fresh=[];
   for(const entry of entries){try{fresh.push(makePublicLead(source,entry,{receivedAt,prior:[...prior,...leads]}));}catch{receipts.push({sourceId:source.id,state:'ENTRY_REJECTED_IDENTITY_CONTENT_OR_CLOCK'});}}
   leads.push(...fresh.slice(0,Math.max(0,PUBLIC_RESEARCH_LIMITS.records-leads.length)));
   receipts.push({sourceId:source.id,url,requestedAt,receivedAt,state:'BOUNDED_RESPONSE_OBSERVED',bytes:Buffer.byteLength(body),responseHash:hash(body),entriesParsed:entries.length,retainedLeads:fresh.length,observedRequestInterval:{from:requestedAt,to:receivedAt},publicationIntervalCoverage:'UNKNOWN',coverage:'ONLY_RETURNED_DOCUMENTS; historical interval completeness UNKNOWN',cursorAdvancesKnowledge:false});
  }catch(e){receipts.push({sourceId:source.id,url,requestedAt,receivedAt:new Date(now()).toISOString(),state:'ACCESS_OR_PARSE_FAILURE',reason:/^(?:HTTP_\d+|RESPONSE_BYTE_CAP|STREAM_READER_REQUIRED|UNSUPPORTED_OR_OVERSIZE_FEED|NO_PARSEABLE_ENTRIES_NOT_NO_NEWS|UNREVIEWED_REDIRECT)$/.test(e.message)?e.message:'ACCESS_FAILED',coverage:'UNKNOWN_NOT_NO_NEWS',cursorAdvancesKnowledge:false});}
 }
 return {state:'DEVELOPMENT_OBSERVATION_ONLY',requests,leads,receipts,candidates:[...discovered,...publicSourceCandidates(leads,sources)].slice(0,PUBLIC_RESEARCH_LIMITS.sources),next:{cursor},unvisitedSources:sources.filter(s=>!receipts.some(r=>r.sourceId===s.id)).map(s=>s.id),limits:PUBLIC_RESEARCH_LIMITS,coverage:'PARTIAL; no full-web or complete source-history claim',actionAuthority:false};
}

// Reuses the existing fsynced, recoverable append and exact-identity lock. No new delivery store.
export function recordPublicResearchCycle(file,cycle){
 if(cycle?.state!=='DEVELOPMENT_OBSERVATION_ONLY'||cycle.actionAuthority!==false||!Array.isArray(cycle.leads)||cycle.leads.length>PUBLIC_RESEARCH_LIMITS.records||cycle.leads.some(r=>!validPublicLead(r)))throw Error('INVALID_RESEARCH_CYCLE');
 const previous=readRadarLedger(file),have=new Set(previous.filter(r=>r.type==='public-lead').map(r=>r.id));
 const leads=cycle.leads.filter(r=>!have.has(r.id));
 const summary={type:'public-source-cycle',schema:'PUBLIC_RESEARCH_CYCLE_V1',recordedAt:new Date().toISOString(),requests:cycle.requests,receipts:cycle.receipts,next:cycle.next,actionAuthority:false};summary.id=hash(summary);
 const rows=[...leads,summary];if((fs.existsSync(file)?fs.statSync(file).size:0)+Buffer.byteLength(rows.map(r=>JSON.stringify(r)).join('\n'))>8*1024*1024)throw Error('PUBLIC_RESEARCH_JOURNAL_CAP_NO_PRUNING');
 return appendRadarRows(file,rows);
}
export function publicLeadHorizons(r,now=Date.now()){
 if(!validPublicLead(r,now)||r.quality==='REJECTED_FUTURE_TIMESTAMP')return [];
 return ['SHORT','MID','LONG'].filter(h=>{const expiry=r.expiryByHorizon?.[h]||r.expiresAt;return expiry&&Date.parse(expiry)>now;});
}
export function publicLeadInputs(journal,now=Date.now()){
 const groups=new Map();for(const r of journal){if(!publicLeadHorizons(r,now).length)continue;const key=r.syndicationCandidateKey||r.id;
 // Deduplicate attention only. All source/version rows remain in the journal; seeded identities never become verified counts.
 const old=groups.get(key);if(!old||Date.parse(r.processedAt)>Date.parse(old.processedAt))groups.set(key,r);}
 return [...groups.values()];
}

export function publicResearchCursor(journal){
 const rows=journal.filter(r=>r.type==='public-source-cycle');if(!rows.length)return {cursor:0};
 const r=rows.at(-1),{id,...body}=r;if(id!==hash(body)||!Number.isInteger(r.next?.cursor)||r.next.cursor<0||r.actionAuthority!==false)throw Error('UNVERIFIED_SOURCE_CURSOR');return r.next;
}
