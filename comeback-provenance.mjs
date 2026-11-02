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
