// Admission checks for NEW evidence only. Never rewrites or reruns frozen studies.
const timestamp=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const source=x=>typeof x==='string'&&/^https:\/\/[^/\s]+\//.test(x);
export function identityAt(symbol,at,records){
 const t=timestamp(at);if(t===null||typeof symbol!=='string'||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)||!Array.isArray(records))return {status:'UNRESOLVED',reason:'INVALID_IDENTITY_INPUT'};
 const matches=records.filter(r=>r&&r.symbol===symbol&&typeof r.securityId==='string'&&r.securityId.length>0&&typeof r.issuerCik==='string'&&/^\d{1,10}$/.test(r.issuerCik)&&Number(r.issuerCik)>0&&source(r.source)
  &&timestamp(r.knownAt)!==null&&timestamp(r.knownAt)<=t&&timestamp(r.validFrom)!==null&&timestamp(r.validFrom)<=t
  &&(r.validTo===null||timestamp(r.validTo)!==null&&t<timestamp(r.validTo)));
 const ids=new Set(matches.map(r=>r.securityId+'|'+r.issuerCik.padStart(10,'0')));
 if(ids.size!==1)return {status:'UNRESOLVED',reason:ids.size?'AMBIGUOUS_SECURITY_IDENTITY':'NO_POINT_IN_TIME_SECURITY_IDENTITY'};
 return {status:'DOCUMENTED_MAPPING',securityId:matches[0].securityId,issuerCik:matches[0].issuerCik.padStart(10,'0'),evidence:matches.map(r=>r.source),note:'Source reference/shape checked; authenticity not established by this function'};
}
export function auditHistoricalEvidence({protocol,trades,identities,universe,cutoff}){
 const errors=[],end=timestamp(cutoff),p=protocol||{},reg=timestamp(p.registeredAt),train=timestamp(p.trainEnd),hold=timestamp(p.holdoutStart),holdEnd=timestamp(p.holdoutEnd);
 const reject=(reason,id=null)=>errors.push({reason,id});
 if(end===null||reg===null||train===null||hold===null||reg>hold||train>=hold||holdEnd===null||holdEnd<hold||holdEnd>end)reject('INVALID_OR_UNREGISTERED_HOLDOUT_BOUNDARY');
 if(typeof p.parameterHash!=='string'||!/^[a-f0-9]{64}$/.test(p.parameterHash)||p.parameterHash!==p.registeredParameterHash||p.selectedUsingHoldout!==false)reject('PARAMETER_SELECTION_OR_REGISTRATION_UNVERIFIED');
 if(p.universeBasis!=='POINT_IN_TIME'||!Array.isArray(universe)||!universe.length)reject('SURVIVORSHIP_DENOMINATOR_UNVERIFIED');
 if(!Array.isArray(trades)||!trades.length)reject('MISSING_TRADES');
 const ids=new Set();
 for(const t of Array.isArray(trades)?trades:[]){
  const id=t?.id;if(typeof id!=='string'||!id||ids.has(id)){reject('MISSING_OR_DUPLICATE_TRADE_ID',id);continue;}ids.add(id);
  const entry=timestamp(t.entryAt),exit=timestamp(t.exitAt),decision=timestamp(t.decisionAt);
  if(entry===null||exit===null||decision===null||decision>entry||exit<entry||end===null||exit>end){reject('INVALID_OR_UNRESOLVED_TRADE_CLOCK',id);continue;}
  if(t.split==='train'&&(train===null||decision>train||entry>train))reject('TRAINING_SAMPLE_AFTER_TRAIN_END',id);
  if(t.split==='train'&&(hold===null||exit>=hold))reject('TRAINING_OUTCOME_OVERLAPS_HOLDOUT',id);
  else if(t.split==='holdout'&&(hold===null||entry<hold||holdEnd===null||exit>holdEnd))reject('HOLDOUT_OUTSIDE_REGISTERED_BOUNDARY',id);
  else if(!['train','holdout'].includes(t.split))reject('UNDECLARED_SAMPLE_SPLIT',id);
  const identity=identityAt(t.symbol,t.decisionAt,identities);
  if(identity.status!=='DOCUMENTED_MAPPING'||identity.securityId!==t.securityId)reject(identity.reason||'SECURITY_ID_MISMATCH',id);
  // Decision ticker identity alone cannot authenticate entry/exit price symbols.
  const entryIdentity=identityAt(t.entrySymbol??t.symbol,t.entryAt,identities);
  if(entryIdentity.status!=='DOCUMENTED_MAPPING'||entryIdentity.securityId!==t.securityId)reject('ENTRY_SECURITY_IDENTITY_UNVERIFIED',id);
  const exitIdentity=identityAt(t.exitSymbol??t.entrySymbol??t.symbol,t.exitAt,identities);
  if(exitIdentity.status!=='DOCUMENTED_MAPPING'||exitIdentity.securityId!==t.securityId){
   const documentedTerminal=t.delisted===true&&t.terminalSecurityId===t.securityId&&source(t.terminalSource)&&Number.isFinite(t.exitPrice)&&t.exitPrice>=0&&timestamp(t.terminalKnownAt)!==null&&timestamp(t.terminalKnownAt)<=end;
   if(!documentedTerminal)reject('EXIT_OR_TERMINAL_SECURITY_IDENTITY_UNVERIFIED',id);
  }
  const member=(Array.isArray(universe)?universe:[]).some(u=>u.securityId===t.securityId&&timestamp(u.knownAt)!==null&&timestamp(u.knownAt)<=decision&&timestamp(u.validFrom)!==null&&timestamp(u.validFrom)<=decision&&(u.validTo===null||timestamp(u.validTo)!==null&&decision<timestamp(u.validTo))&&source(u.source));
  if(!member)reject('NOT_IN_DOCUMENTED_POINT_IN_TIME_UNIVERSE',id);
  if(t.delisted===true&&(!source(t.terminalSource)||!Number.isFinite(t.exitPrice)||t.exitPrice<0||timestamp(t.terminalKnownAt)===null||timestamp(t.terminalKnownAt)>end))reject('DELISTING_TERMINAL_VALUE_UNVERIFIED',id);
  if(!['raw','split_adjusted','total_return'].includes(t.priceBasis)||t.entryPriceBasis!==t.priceBasis||t.exitPriceBasis!==t.priceBasis)reject('CORPORATE_ACTION_PRICE_BASIS_MISMATCH',id);
  if(!Number.isFinite(t.entryPrice)||t.entryPrice<=0||!Number.isFinite(t.exitPrice)||t.exitPrice<0||!Number.isFinite(t.costs)||t.costs<0)reject('INVALID_PRICE_OR_COST_EVIDENCE',id);
 }
 return {structureRevision:'ENTRY_EXIT_IDENTITY_V2',status:errors.length?'INELIGIBLE_FOR_PERFORMANCE_CLAIM':'STRUCTURE_VALID_ONLY',errors,trades:Array.isArray(trades)?trades.length:0,approvedBuy:false,
  limitation:'No source-authenticity, universe-completeness or profitability certification. Missing delisting outcomes are unresolved; neither dropped winners/losers nor automatic -100% imputations are permitted.'};
}
export function auditFrozenDocument(doc){
 const result={firstRunPaths:[],correctedRunPaths:[],verdictCounts:{},protocolFields:[],identityFields:[],holdoutFields:[],warnings:[]};
 const walk=(x,path,depth)=>{
  if(!x||typeof x!=='object'||depth>8||Array.isArray(x))return;
  for(const [k,v] of Object.entries(x)){
   const p=path?path+'.'+k:k;
   if(k==='firstRun')result.firstRunPaths.push({path:p,entries:v&&typeof v==='object'?Object.keys(v).length:null});
   if(k==='correctedRun')result.correctedRunPaths.push({path:p,entries:v&&typeof v==='object'?Object.keys(v).length:null});
   if(k==='verdict'&&typeof v==='string')result.verdictCounts[v]=(result.verdictCounts[v]||0)+1;
   if(/register|protocol/i.test(k))result.protocolFields.push(p);
   if(/cik|surviv|delist|securityId/i.test(k))result.identityFields.push(p);
   if(/holdout|embargo|purge|splitDate/i.test(k))result.holdoutFields.push(p);
   walk(v,p,depth+1);
  }
 };walk(doc,'',0);
 if(!result.firstRunPaths.length)result.warnings.push('NO_STRUCTURED_FIRST_RUN_FIELD');
 if(!result.protocolFields.length)result.warnings.push('PROTOCOL_REGISTRATION_NOT_STRUCTURED_HERE');
 if(!result.identityFields.length)result.warnings.push('IDENTITY_SURVIVORSHIP_PROVENANCE_NOT_STRUCTURED_HERE');
 if(!result.holdoutFields.length)result.warnings.push('HOLDOUT_BOUNDARIES_NOT_STRUCTURED_HERE');
 result.scope='Object metadata through depth 8, arrays not inspected; missing metadata is unverified, not proof the study was never registered elsewhere';
 return result;
}
