// Inactive normalization of retained daily bars. A bar close is not a closing-auction fill.
import {captureJson} from './capture-json.mjs';
import {marketSession} from './market-session.mjs';
import {inspectSourceResponse,sourceInstant,sourceHash} from './a-native-source-join.mjs';
const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(at){return Object.fromEntries(ny.formatToParts(new Date(Number(sourceInstant(at)/1000000n))).map(p=>[p.type,p.value]));}
function dayOf(at){const p=parts(at);return p.year+'-'+p.month+'-'+p.day;}
// Relevant bar values define the revision; response order/neighboring sessions do not.
const barHash=b=>sourceHash(JSON.stringify({t:String(sourceInstant(b.t)),o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,n:b.n,vw:b.vw}));
export function normalizeRetainedClose(response,{symbol,session,securityId}){
 const out={status:'UNKNOWN',allowBuy:false,sourceAuthentication:'UNVERIFIED',priceBasis:'AGGREGATE_BAR_CLOSE_NOT_AUCTION_OR_EXECUTABLE_FILL',symbol,securityId,session,bodySha256:response?.bodySha256??null,requestedFeed:null,returnedFeed:null,close:null,barTimestamp:null,availableAt:response?.bodyReceivedAt??null,sessionCloseAt:null,reasons:[]};
 const refuse=reason=>({...out,reasons:[reason]});
 if(typeof symbol!=='string'||!/^[-A-Z0-9.]{1,15}$/.test(symbol)||typeof securityId!=='string'||!securityId.length)return refuse('IDENTITY_UNVERIFIED');
 const cal=marketSession(session);if(!cal.known||cal.closed)return refuse('SESSION_UNKNOWN_OR_CLOSED');
 const inspected=inspectSourceResponse(response);if(inspected.status==='UNKNOWN')return refuse(inspected.reason);
 let u;try{u=new URL(response.url);}catch{return refuse('SOURCE_ROUTE_UNVERIFIED');}
 if(u.origin!=='https://data.alpaca.markets'||u.pathname!=='/v2/stocks/'+symbol+'/bars'||u.searchParams.getAll('feed').length!==1||u.searchParams.getAll('adjustment').length!==1||u.searchParams.getAll('timeframe').length!==1||u.searchParams.get('timeframe')!=='1Day')return refuse('SOURCE_ROUTE_UNVERIFIED');
 out.requestedFeed=u.searchParams.get('feed');
 if(!['sip','iex','delayed_sip'].includes(out.requestedFeed))return refuse('FEED_UNVERIFIED');
 if(u.searchParams.get('adjustment')!=='raw')return refuse('ADJUSTMENT_BASIS_UNRESOLVED');
 let d;try{d=captureJson(new TextDecoder('utf-8',{fatal:true}).decode(inspected.bytes));}catch{return refuse('MALFORMED_RESPONSE');}
 if(d.symbol!==symbol||!Array.isArray(d.bars))return refuse('MALFORMED_OR_WRONG_SYMBOL');
 if(d.next_page_token!==null&&d.next_page_token!==undefined)return refuse('PAGINATION_INCOMPLETE');
 const matches=[];let invalid=false;
 for(const b of d.bars){if(sourceInstant(b?.t)===null){invalid=true;continue;}if(dayOf(b.t)===session)matches.push(b);}
 if(invalid)return refuse('BAR_TIMESTAMP_INVALID');
 if(!matches.length)return refuse(d.bars.length?'SESSION_BAR_MISSING':'GENUINELY_EMPTY_RESPONSE');
 const hashes=new Set(matches.map(barHash));if(hashes.size!==1)return refuse('CONFLICTING_SESSION_BARS');
 const b=matches[0];
 if(typeof b.c!=='number'||!Number.isFinite(b.c)||b.c<=0)return refuse('CLOSE_PRICE_INVALID');
 // Derive only the calendar boundary, never a source publication/ingestion time.
 const noon=session+'T12:00:00Z',p=parts(noon),offset=Number(p.hour)*60+Number(p.minute)-720;
 out.sessionCloseAt=new Date(Date.parse(session+'T00:00:00Z')+(cal.close-offset)*60000).toISOString();
 if(sourceInstant(response.bodyReceivedAt)<sourceInstant(out.sessionCloseAt))return refuse('SESSION_NOT_COMPLETED_AT_RECEIPT');
 out.close=b.c;out.barTimestamp=b.t;out.barRevisionHash=barHash(b);out.volume=typeof b.v==='number'&&Number.isFinite(b.v)&&b.v>=0?b.v:null;out.volumeBasis='PROVIDER_BAR_VOLUME_NOT_VERIFIED_TOTAL_TRADED_VOLUME';
 // Query feed and bar timestamp do not establish response-specific entitlement or publication age.
 return {...out,status:'NORMALIZED_RESEARCH_ONLY',reasons:['SOURCE_AUTHENTICATION_UNVERIFIED','RESPONSE_FEED_NOT_ATTESTED','FINALITY_AND_CLOSE_EXECUTION_CONTRACT_UNADOPTED']};
}

// Persistent first value/conflict survives reversion; original bytes are never edited.
export function retainClose({store,token,response,context}){
 if(store.head().pending!==0)throw Error('PENDING_INTENT_REQUIRES_RECOVERY');
 const normalized=normalizeRetainedClose(response,context),bytes=Buffer.from(response.bodyBase64||'','base64');
 if(bytes.length>2097152)throw Error('BODY_HASH_OR_BUDGET');
 const retain=()=>store.append(token,'ORIGINAL','CLOSE_RESPONSE:'+sourceHash(JSON.stringify(response)),response,bytes);
 if(normalized.status!=='NORMALIZED_RESEARCH_ONLY'){retain();return normalized;}
 const id='CLOSE:'+context.securityId+':'+context.session;
 const first=store.lookup(token,'ACQUISITION',id);
 if(first.status!=='FOUND'){
  try{store.append(token,'ACQUISITION',id,normalized);}catch(e){if(e.message!=='LOGICAL_RECORD_CONFLICT')throw e;}
 }
 const original=store.lookup(token,'ACQUISITION',id).record.payload;
 if(original.barRevisionHash!==normalized.barRevisionHash||original.symbol!==normalized.symbol||original.requestedFeed!==normalized.requestedFeed){
  const conflictId=id+':FIRST_CONFLICT',prior=store.lookup(token,'ACQUISITION',conflictId);
  if(prior.status!=='FOUND')try{store.append(token,'ACQUISITION',conflictId,{original,revised:normalized});}catch(e){if(e.message!=='LOGICAL_RECORD_CONFLICT')throw e;}
 }
 const conflict=store.lookup(token,'ACQUISITION',id+':FIRST_CONFLICT');
 retain();
 const state=store.head();if(state.pending!==0)throw Error('PENDING_INTENT_REQUIRES_RECOVERY');if(state.transition)throw Error('GENERATION_TRANSITION_PENDING');if(state.token!==token)throw Error('STALE_FENCE');
 if(state.unresolved>0)return {...normalized,status:'UNKNOWN',reasons:[...normalized.reasons,'STORE_EVIDENCE_UNRESOLVED'],...(conflict.status==='FOUND'?{firstConflict:conflict.record.payload}:{})};
 return conflict.status==='FOUND'?{...normalized,status:'UNKNOWN',reasons:['REVISION_CONFLICT_PERSISTENT'],firstConflict:conflict.record.payload}:normalized;
}
