// COMEBACK today-file provenance (CATALYST-03, Claude, 2 Nov 2026). Pure; called by comeback-lab.mjs after todayOut().
// Each COMEBACK method's signals come from its lab's own today file. A missing, undated or stale lab file (close older than
// the previous completed session) cannot supply current signals: its lines move to retainedSignals with the reason. Every
// emitted line carries its close day, identity basis and revision id. The pre-registered rule (comeback-core.mjs) is unchanged.
import {closeLagSessions,providerSymbol,adjustmentBasis,digest} from './source-contract.mjs';
export function withComebackProvenance(todayDoc,todays,{nowMs=Date.now(),spyStatus=null}={}){
 const labState={};
 for(const [rule,m] of Object.entries(todayDoc.methods||{})){
  const T=todays[m.lab],close=T&&typeof T.lastClose==='string'?T.lastClose:null,lag=close?closeLagSessions(close,nowMs):null;
  const st=!T?'MISSING':!(typeof T.generatedAt==='string'&&Number.isFinite(Date.parse(T.generatedAt)))||!close?'MALFORMED':lag===null?'UNKNOWN':lag<0?'FUTURE':lag>1?'STALE':'OBSERVED';
  labState[m.lab]={status:st,lastClose:close,lagSessions:lag};
  const rows=[],kept=[];
  for(const p of m.newSignals||[]){const id=providerSymbol(p&&p.sym,{provider:'LAB:'+m.lab});
   if(st!=='OBSERVED'||id.status!=='OK'){kept.push({...p,withheld:st!=='OBSERVED'?'LAB_TODAY_FILE_'+st:'SYMBOL_'+id.status});continue;}
   rows.push({...p,sym:id.symbol,lastCloseDay:close,sourceId:digest(['COMEBACK',m.lab,rule,id.symbol,close]),sourceRevisionId:digest(p),sourceClockBasis:'LAB_TODAY_FILE_LAST_CLOSE',priceBasis:adjustmentBasis({provider:'LAB_REPORTED'}),sourceIdentityBasis:id.identityBasis});}
  m.newSignals=rows;if(kept.length)m.retainedSignals=kept;m.sourceStatus=labState[m.lab];
 }
 const used=Object.values(labState);
 todayDoc.sourceStatus={LAB_TODAY_FILES:{status:used.length?'OBSERVED':'EMPTY',labs:used.length,withheldLabs:used.filter(x=>x.status!=='OBSERVED').length,detail:labState},...(spyStatus?{SPY_BARS:spyStatus}:{})};
 return todayDoc;
}

// SPY aggregates envelope (review R2 residual, Codex 2 Nov): one pure classification of a Massive /v2/aggs answer.
// Each documented field is validated on its own and only justified relationships are enforced:
//  - status OK or DELAYED, ticker SPY; adjusted, when present, exactly true;
//  - queryCount and resultsCount, when present, are non-negative safe integers (a present string, fraction, negative, null or NaN
//    is MALFORMED: never a missing optional field, never zero);
//  - results, when present, is an array and a present resultsCount equals its length (queryCount is NOT tied to the array:
//    queried base aggregates and returned aggregates can differ);
//  - results absent: EMPTY needs positive zero evidence that nothing contradicts: resultsCount 0, or (resultsCount absent)
//    queryCount 0. A positive returned count without results is MALFORMED.
// Returns { kind: 'MALFORMED' | 'EMPTY' | 'ROWS', reason }.
const COUNT=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
export function spyEnvelope(j){
 if(!j||typeof j!=='object'||Array.isArray(j))return {kind:'MALFORMED',reason:'NOT_AN_OBJECT'};
 if(!['OK','DELAYED'].includes(j.status))return {kind:'MALFORMED',reason:'STATUS'};
 if(j.ticker!=='SPY')return {kind:'MALFORMED',reason:'TICKER'};
 if('adjusted' in j&&j.adjusted!==true)return {kind:'MALFORMED',reason:'ADJUSTED'};
 for(const f of ['queryCount','resultsCount'])if(f in j&&!COUNT(j[f]))return {kind:'MALFORMED',reason:'INVALID_'+f.toUpperCase()};
 const hasRC='resultsCount' in j,hasQC='queryCount' in j;
 if(!('results' in j)||j.results===undefined){
  if(hasRC)return j.resultsCount===0?{kind:'EMPTY',reason:'RESULTS_COUNT_ZERO'}:{kind:'MALFORMED',reason:'COUNT_WITHOUT_RESULTS'};
  return hasQC&&j.queryCount===0?{kind:'EMPTY',reason:'QUERY_COUNT_ZERO'}:{kind:'MALFORMED',reason:'NO_RESULTS_NO_ZERO_EVIDENCE'};
 }
 if(!Array.isArray(j.results))return {kind:'MALFORMED',reason:'RESULTS_NOT_ARRAY'};
 if(hasRC&&j.resultsCount!==j.results.length)return {kind:'MALFORMED',reason:'RESULTS_COUNT_MISMATCH'};
 return j.results.length?{kind:'ROWS',reason:'RESULTS'}:{kind:'EMPTY',reason:'EMPTY_RESULTS_ARRAY'};
}
