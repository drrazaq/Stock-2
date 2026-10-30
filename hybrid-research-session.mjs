// Offline/pure session admission. No credentials, fetch, orders, alerts or live CLI.
// A provider reference ID is not independent historical-security authentication.
import {createHash} from 'node:crypto';
import {marketSymbol} from './market-symbol.mjs';
import {alpacaSnapshot} from './snapshot-fields.mjs';
import {researchSession} from './research-collector.mjs';
import {collectDiscovery,discoveryState,updateDiscovery,discoveryReport} from './discovery-runtime.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clock=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const fresh=(t,at,limit)=>positive(t)&&t<=at&&at-t<=limit;
const q=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]:null;
export function freezeResearchUniverse({records,asOf,knownAt,tradableOnly=true}){
 if(!Array.isArray(records)||records.length>30000||clock(asOf)===null||clock(knownAt)===null||clock(asOf)>clock(knownAt)||typeof tradableOnly!=='boolean')throw Error('INVALID_UNIVERSE_REFERENCE');
 const bySymbol=new Map(),ids=new Map(),conflicts=new Set(),excluded={},bump=k=>excluded[k]=(excluded[k]||0)+1;let exactDuplicates=0;
 for(const x of records){
  if(!object(x)||marketSymbol(x.symbol)!==x.symbol){bump('INVALID_SYMBOL');continue;}
  if(typeof x.id!=='string'||!x.id||x.id.length>128){bump('MISSING_PROVIDER_ID');continue;}
  const row={symbol:x.symbol,providerSecurityId:x.id,status:x.status,assetClass:x.class,tradable:x.tradable,exchange:typeof x.exchange==='string'?x.exchange:null};
  const signature=JSON.stringify(row),old=bySymbol.get(x.symbol);
  if(old){if(old.signature===signature)exactDuplicates++;else conflicts.add(x.symbol);}else bySymbol.set(x.symbol,{row,signature});
  if(ids.has(x.id)&&ids.get(x.id)!==x.symbol){conflicts.add(x.symbol);conflicts.add(ids.get(x.id));}else ids.set(x.id,x.symbol);
 }
 const rows=[];for(const {row}of bySymbol.values()){
  if(conflicts.has(row.symbol)){bump('CONFLICTING_IDENTITY_OR_REFERENCE');continue;}
  if(row.status!=='active'){bump('NOT_ACTIVE');continue;}if(row.assetClass!=='us_equity'){bump('WRONG_ASSET_CLASS');continue;}
  if(tradableOnly&&row.tradable!==true){bump('NOT_DECLARED_TRADABLE');continue;}rows.push(row);
 }
 rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));if(!rows.length)throw Error('EMPTY_DECLARED_UNIVERSE');
 const reference={asOf:new Date(clock(asOf)).toISOString(),knownAt:new Date(clock(knownAt)).toISOString(),policy:{tradableOnly,assetClass:'us_equity',securityType:'PROVIDER_CLASS_ONLY_NOT_COMMON_STOCK_CERTIFIED'},rows};
 return {...reference,universeId:hash(reference),receivedRecords:records.length,exactDuplicates,excluded,identityStatus:'CURRENT_PROVIDER_REFERENCE_NOT_AUTHENTICATED_HISTORY'};
}
function checkUniverse(u){
 if(!object(u)||!Array.isArray(u.rows)||!u.rows.length||u.rows.length>30000||clock(u.asOf)===null||clock(u.knownAt)===null||hash({asOf:u.asOf,knownAt:u.knownAt,policy:u.policy,rows:u.rows})!==u.universeId)throw Error('UNIVERSE_CHANGED_OR_MALFORMED');
}
export function planResearchSweeps(universe,{batchSize=200,cycles=330,maxRequests=23000,reservedRequests=500,requestsPerMinute=80}={}){
 checkUniverse(universe);for(const [v,cap]of [[batchSize,200],[cycles,330],[maxRequests,30000],[requestsPerMinute,1000]])if(!Number.isInteger(v)||v<1||v>cap)throw Error('INVALID_SWEEP_BUDGET');
 if(!Number.isInteger(reservedRequests)||reservedRequests<0||reservedRequests>maxRequests)throw Error('INVALID_SWEEP_BUDGET');
 const batches=[];for(let i=0;i<universe.rows.length;i+=batchSize)batches.push(universe.rows.slice(i,i+batchSize).map(x=>x.symbol));
 const requiredRequests=batches.length*cycles+reservedRequests,errors=[];if(requiredRequests>maxRequests)errors.push('REQUEST_BUDGET_INSUFFICIENT');if(batches.length>requestsPerMinute)errors.push('PACING_CAPACITY_INSUFFICIENT');
 return {kind:'OFFLINE_RESEARCH_SWEEP_PLAN',universeId:universe.universeId,batches,cycles,batchSize,maxRequests,reservedRequests,requestsPerMinute,requiredRequests,status:errors.length?'BLOCKED':'FIXTURE_PLANNABLE_NOT_LIVE_APPROVAL',errors,endpointBatchCapacityVerified:false,liveAuthorized:false};
}
export const hybridSessionState=()=>({version:1,day:null,lastCycleAt:null,universeId:null,minutes:[],cycles:0,lastCompleteSweepAt:null,telemetry:{completeSweeps:0,incompleteSweeps:0,missingSymbolObservations:0,freshTradeObservations:0,freshBboObservations:0},discovery:discoveryState()});
export function observeResearchSweep(state,{universe,plan,cutoff,responses,delayedRows=[],readText=()=>{throw Error('missing');},live=[]}){
 checkUniverse(universe);const at=clock(cutoff);if(at===null||!object(state)||state.version!==1||!object(state.discovery)||!Array.isArray(state.minutes)||!Array.isArray(responses)||responses.length>1000||!Array.isArray(delayedRows)||delayedRows.length>30000||!Array.isArray(live))throw Error('INVALID_SWEEP_INPUT');
 if(!Number.isInteger(state.cycles)||state.cycles<0||state.cycles>330||state.minutes.length!==state.cycles||new Set(state.minutes).size!==state.minutes.length||state.minutes.some(m=>!Number.isInteger(m)||m<240||m>=570))throw Error('INVALID_SESSION_STATE');
 if(!object(state.telemetry)||['completeSweeps','incompleteSweeps','missingSymbolObservations','freshTradeObservations','freshBboObservations'].some(k=>!Number.isSafeInteger(state.telemetry[k])||state.telemetry[k]<0)||state.telemetry.completeSweeps+state.telemetry.incompleteSweeps!==state.cycles)throw Error('INVALID_SESSION_TELEMETRY');
 if(clock(universe.knownAt)>at||plan?.universeId!==universe.universeId||plan.status!=='FIXTURE_PLANNABLE_NOT_LIVE_APPROVAL')throw Error('UNAVAILABLE_UNIVERSE_OR_BLOCKED_PLAN');
 // Recompute the plan to reject mutated batch scopes and budgets after restart.
 const expected=planResearchSweeps(universe,plan);if(JSON.stringify(expected)!==JSON.stringify(plan))throw Error('PLAN_CHANGED');
 if(state.universeId&&state.universeId!==universe.universeId)throw Error('SESSION_UNIVERSE_CHANGED');
 const session=researchSession(at);if(!session.eligible)return {status:'OUTSIDE_PREMARKET',session,approvedBuy:false,orders:false};
 if(state.day&&state.day!==session.day)throw Error('SESSION_DAY_CHANGED');
 if(state.lastCycleAt!==null&&(clock(state.lastCycleAt)===null||at<=clock(state.lastCycleAt))||state.minutes.includes(session.minute))return {status:'DUPLICATE_OR_RETROGRADE',approvedBuy:false,orders:false};
 if(state.cycles>=plan.cycles)throw Error('CYCLE_BUDGET_EXHAUSTED');
 const groups=new Map(),providers=[],latencies=[],wanted=new Set(universe.rows.map(x=>x.symbol));
 for(const r of responses){if(!object(r)||!Number.isInteger(r.batch)||r.batch<0||r.batch>=plan.batches.length)throw Error('UNSOLICITED_BATCH');const rows=groups.get(r.batch)||[];rows.push(r);groups.set(r.batch,rows);}
 const received=new Map();let attemptedBatches=0,completedBatches=0,duplicateBatches=0,invalidRows=0;
 for(let i=0;i<plan.batches.length;i++){
  const records=groups.get(i),symbols=plan.batches[i];if(!records){providers.push({batch:i,status:'MISSING_BATCH'});continue;}attemptedBatches++;
  if(records.length!==1){duplicateBatches++;providers.push({batch:i,status:'DUPLICATE_BATCH_EXCLUDED'});continue;}
  const r=records[0],requestAt=clock(r.requestedAt),receipt=clock(r.receivedAt);
  if(r.feed!=='sip'||requestAt===null||receipt===null||requestAt>receipt||receipt>at||requestAt<at-60000||receipt<at-60000){providers.push({batch:i,status:'WRONG_FEED_OR_CLOCK'});continue;}
  latencies.push(receipt-requestAt);
  if(r.httpStatus!==200){providers.push({batch:i,status:'HTTP_OR_TRANSPORT_FAILURE',httpStatus:Number.isInteger(r.httpStatus)?r.httpStatus:null});continue;}
  if(!object(r.rows)||r.rows.error||r.rows.message||Object.entries(r.rows).some(([s,x])=>!symbols.includes(s)||!object(x)||!['latestTrade','latestQuote','dailyBar','prevDailyBar'].some(k=>Object.hasOwn(x,k)))){providers.push({batch:i,status:'INVALID_SCHEMA_OR_UNSOLICITED_SYMBOL'});continue;}
  completedBatches++;let n=0;for(const [s,x]of Object.entries(r.rows)){
   if(['latestTrade','latestQuote','dailyBar','prevDailyBar'].some(k=>x[k]!==undefined&&x[k]!==null&&!object(x[k]))){invalidRows++;continue;}
   const row=alpacaSnapshot(s,x,true);row.observedAt=r.receivedAt;row.priceClockAtReceiptValid=!positive(row.t)||row.t<=receipt;row.quoteClockAtReceiptValid=!positive(row.qt)||row.qt<=receipt;
   // A timestamp future at ingestion stays invalid even if the sweep finishes later.
   if(!row.priceClockAtReceiptValid){row.price=0;row.t=0;}if(!row.quoteClockAtReceiptValid){row.bid=0;row.ask=0;row.qt=0;}if(row.vt>receipt){row.vol=null;row.vt=0;}
   received.set(s,row);n++;
  }
  providers.push({batch:i,status:'RESPONSE_OBSERVED',requested:symbols.length,received:n,missing:symbols.length-n});
 }
 // Delayed context contributes only independently clocked previous-close context;
 // it can never become the price/BBO for a symbol absent from the SIP response.
 const context=new Map(),conflicts=new Set();for(const row of delayedRows){if(!object(row)||!wanted.has(row.sym))continue;if(context.has(row.sym)){conflicts.add(row.sym);continue;}context.set(row.sym,row);}
 const normalized=[];for(const [s,observed]of received){const c=!conflicts.has(s)?context.get(s):null,row={...observed};if(!positive(row.prevC)&&c&&positive(c.prevC)){row.prevC=c.prevC;row.previousCloseProvider='MASSIVE_DELAYED_CONTEXT';}else row.previousCloseProvider=positive(row.prevC)?'ALPACA':'UNKNOWN';normalized.push(row);}
 const prices=normalized.filter(r=>positive(r.price)&&fresh(r.t,at,180000)),quotes=normalized.filter(r=>positive(r.bid)&&positive(r.ask)&&r.ask>=r.bid&&fresh(r.qt,at,120000));
 const ingress=collectDiscovery({readText,cutoff,live});const added=updateDiscovery(state.discovery,{...ingress,rows:normalized,cutoff});
 state.day=session.day;state.universeId=universe.universeId;state.lastCycleAt=cutoff;state.minutes.push(session.minute);state.cycles++;
 const complete=completedBatches===plan.batches.length&&received.size===universe.rows.length&&invalidRows===0;if(complete){state.lastCompleteSweepAt=cutoff;state.telemetry.completeSweeps++;}else state.telemetry.incompleteSweeps++;state.telemetry.missingSymbolObservations+=universe.rows.length-received.size;state.telemetry.freshTradeObservations+=prices.length;state.telemetry.freshBboObservations+=quotes.length;
 const denominator=universe.rows.length;
 return {kind:'RESEARCH_ONLY_HYBRID_SWEEP',status:complete?'DECLARED_UNIVERSE_RETURNED':'INCOMPLETE_SWEEP',at:cutoff,session,universeId:universe.universeId,metrics:{declaredSymbols:denominator,returned:received.size,missing:denominator-received.size,attemptedBatches,completedBatches,expectedBatches:plan.batches.length,duplicateBatches,invalidRows,freshTrades:prices.length,freshBbo:quotes.length,freshTradePct:100*prices.length/denominator,freshBboPct:100*quotes.length/denominator,futureTradeClocksAtReceipt:normalized.filter(r=>!r.priceClockAtReceiptValid).length,futureQuoteClocksAtReceipt:normalized.filter(r=>!r.quoteClockAtReceiptValid).length,unknownTradeClocks:normalized.filter(r=>!positive(r.t)).length,unknownQuoteClocks:normalized.filter(r=>!positive(r.qt)).length,tradeAgeP95Ms:q(normalized.filter(r=>positive(r.t)&&r.t<=at).map(r=>at-r.t),.95),quoteAgeP95Ms:q(normalized.filter(r=>positive(r.qt)&&r.qt<=at).map(r=>at-r.qt),.95),batchLatencyP95Ms:q(latencies,.95)},providers,rows:normalized,discovery:{added,sources:ingress.sources},lastCompleteSweepAt:state.lastCompleteSweepAt,claims:{wholeMarketCoverage:'DECLARED_PROVIDER_UNIVERSE_ONLY_NOT_INDEPENDENTLY_VERIFIED',delayedContext:'NOT_REALTIME_DISCOVERY',approvedBuy:false,orders:false,filledTrades:false,profitability:'NOT_ESTABLISHED'}};
}
export function hybridSessionReport(state,{cutoff}){
 return {kind:'RESEARCH_ONLY',cycles:state.cycles,intendedMinutes:330,observedDistinctMinutes:state.minutes.length,clockWindowComplete:state.minutes.length===330&&state.minutes.every((m,i)=>m===240+i),allDeclaredSweepsReturned:state.cycles===330&&state.telemetry.completeSweeps===330,telemetry:structuredClone(state.telemetry),lastCompleteSweepAt:state.lastCompleteSweepAt,discovery:discoveryReport(state.discovery,{cutoff,sources:[],completeSession:false}),profitability:'NOT_ESTABLISHED',approvedBuy:false,orders:false};
}
