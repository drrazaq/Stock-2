// Proposed V2 outcome evidence only. V1, frozen costs and admission remain unchanged.
import {createHash} from 'node:crypto';import {PAPER_PROTOCOL as P} from './discovery-paper.mjs';import {captureJson} from './capture-json.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),pos=x=>typeof x==='number'&&Number.isFinite(x)&&x>0,at=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(x))return NaN;const d=new Date(x.slice(0,10)+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x.slice(0,10)?Date.parse(x):NaN;};
function valid(q,f,leg){
 if(!q||q.symbol!==leg.symbol||q.securityId!==leg.securityId||q.provider!=='ALPACA'||q.feed!=='sip'||q.at!==f.at||!pos(q.bid)||!pos(q.ask)||q.ask<q.bid)return false;
 const t=at(q.quoteAsOf),n=at(f.at);if(!Number.isFinite(t)||t>n||n-t>P.maxQuoteAgeSeconds*1000)return false;
 const raw=captureJson(f.rawResponse)[q.symbol]?.latestQuote;
 return !!raw&&raw.bp===q.bid&&raw.ap===q.ask&&at(raw.t)===t&&raw.as===q.askSizeShares&&raw.bs===q.bidSizeShares;
}
export function evaluateProposedV2Outcomes({frames,pairs,ledger=[],cutoffAt,expectedFrames=41}){
 if(!Array.isArray(frames)||frames.length>41||!Array.isArray(pairs)||pairs.length>3||!Number.isFinite(at(cutoffAt))||expectedFrames!==41)throw Error('V2_OUTCOME_SCOPE');
 const by=new Map();let prev=-Infinity;
 for(const f of frames){if(!Number.isFinite(at(f.at))||!Number.isFinite(at(f.requestedAt))||at(f.requestedAt)>at(f.at)||at(f.at)-at(f.requestedAt)>10000||!Number.isInteger(f.sequence)||f.sequence<0||f.sequence>=41||by.has(f.sequence)||at(f.at)<=prev||f.at!==f.receivedAt||f.feed!=='sip'||f.provider!=='ALPACA'||typeof f.rawResponse!=='string'||Buffer.byteLength(f.rawResponse)>65536||sha(f.rawResponse)!==f.rawResponseSha256)throw Error('V2_FRAME_INTEGRITY');by.set(f.sequence,f);prev=at(f.at);}
 const universe=['AMD','INTC','NVDA','AMAT','LRCX','KLAC'];const missingSymbols=frames.flatMap(f=>universe.filter(symbol=>!f.quotes?.some(q=>q.symbol===symbol)).map(symbol=>({sequence:f.sequence,symbol})));
 const cases=[];
 for(const pair of pairs){
  const entry=at(pair.entryAt),due=entry+P.holdMinutes*60000,entryFrame=by.get(pair.entrySequence);
  const reasons=[];if(pair.primaryAdmission!==false||at(pair.exitDueAt)!==due||!entryFrame||entryFrame.at!==pair.entryAt)reasons.push('PAIR_ENTRY_BINDING');
  const legs={};
  for(const role of ['candidate','control']){
   const leg=pair[role]||{},r=[];if(!leg?.securityId||!Number.isSafeInteger(leg.quantity)||leg.quantity<1||!pos(leg.entryAsk)||leg.entryAt!==pair.entryAt)r.push('LEG_IDENTITY_OR_ENTRY');
   const original=entryFrame?.quotes?.find(q=>q.symbol===leg?.symbol&&q.securityId===leg?.securityId);
   if(!original||!valid(original,entryFrame,leg)||original.ask!==leg.entryAsk||Math.floor((P.notional-P.feePerOrder)/original.ask)!==leg.quantity||!Number.isSafeInteger(original.askSizeShares)||original.askSizeShares<leg.quantity)r.push('ENTRY_RAW_OR_CAPACITY');
   const path=frames.filter(f=>at(f.at)>=entry&&at(f.at)<=Math.min(at(cutoffAt),due+P.maxExitWaitMinutes*60000)).map(f=>({f,q:f.quotes?.find(q=>q.symbol===leg?.symbol&&q.securityId===leg?.securityId)}));
   const exit=path.find(x=>at(x.f.at)>=due&&valid(x.q,x.f,leg));
   if(!exit)r.push(at(cutoffAt)<due?'EXIT_NOT_DUE':'NO_FRESH_EXIT_WITHIN_WINDOW');
   else if(!Number.isSafeInteger(exit.q.bidSizeShares)||exit.q.bidSizeShares<leg.quantity)r.push('FIRST_FRESH_EXIT_CAPACITY_UNVERIFIED');
   const endSeq=exit?.f.sequence??Math.max(pair.entrySequence,...path.map(x=>x.f.sequence));
   const missing=[];for(let seq=pair.entrySequence;seq<=endSeq;seq++)if(!by.has(seq))missing.push(seq);
   if(missing.length)r.push('MISSING_FOLLOWUP_FRAMES');
   if(path.some(x=>(!exit||x.f.sequence<=exit.f.sequence)&&!valid(x.q,x.f,leg)))r.push('MISSING_OR_INVALID_FOLLOWUP_QUOTE');
   let peak=P.notional,dd=0;
   for(const x of path.filter(x=>valid(x.q,x.f,leg)&&(!exit||x.f.sequence<=exit.f.sequence))){const equity=P.notional+leg.quantity*(x.q.bid-leg.entryAsk)-2*P.feePerOrder;if(!Number.isFinite(equity)){r.push('NONFINITE_ARITHMETIC');break;}peak=Math.max(peak,equity);dd=Math.min(dd,equity/peak-1);}
   let net=null,stress=null;if(exit&&pos(leg.entryAsk)&&Number.isSafeInteger(leg.quantity)){net=(leg.quantity*(exit.q.bid-leg.entryAsk)-2*P.feePerOrder)/P.notional;stress=(leg.quantity*(exit.q.bid*(1-P.stressSlippagePerSide)-leg.entryAsk*(1+P.stressSlippagePerSide))-2*P.feePerOrder)/P.notional;if(!Number.isFinite(net)||!Number.isFinite(stress)){r.push('NONFINITE_ARITHMETIC');net=stress=null;}}
   legs[role]={status:r.length?'UNRESOLVED':'QUOTED_PAPER_PATH_RESOLVED',securityId:leg?.securityId||null,entryAt:pair.entryAt,exitAt:exit?.f.at||null,quantity:leg?.quantity||null,netAfterSpreadAndFees:net,stressNet:stress,observedLiquidationDrawdown:dd,missingFrameSequences:missing,reasons:[...new Set(r)],fillClaim:false};
  }
  const resolved=!reasons.length&&Object.values(legs).every(x=>x.status==='QUOTED_PAPER_PATH_RESOLVED');
  cases.push({entrySequence:pair.entrySequence,status:resolved?'PAIRED_QUOTED_PATH_RESOLVED':'UNRESOLVED',...legs,pairReasons:reasons,matchedEdge:resolved?legs.candidate.netAfterSpreadAndFees-legs.control.netAfterSpreadAndFees:null,primaryAdmission:false});
 }
 const events=new Map();for(const r of ledger)if(r?.eventId){const item=events.get(r.eventId)||new Set();if(r.reason)item.add(r.reason);events.set(r.eventId,item);}
 const uniqueExclusionReasons={};for(const reasons of events.values())for(const reason of reasons)uniqueExclusionReasons[reason]=(uniqueExclusionReasons[reason]||0)+1;
 return {kind:'PROPOSED_V2_PATH_EVIDENCE_NOT_ADMISSION',policyApproved:false,primaryAdmission:false,genuineAdmissions:0,expectedFrames:41,receivedFrames:frames.length,missingSymbols,captureScheduleComplete:frames.length===41&&missingSymbols.length===0,missingSequences:Array.from({length:41},(_,i)=>i).filter(i=>!by.has(i)),counts:{uniqueEvents:events.size,pairs:pairs.length,resolved:cases.filter(c=>c.status==='PAIRED_QUOTED_PATH_RESOLVED').length,unresolved:cases.filter(c=>c.status==='UNRESOLVED').length},uniqueExclusionReasons,cases,costs:{notional:P.notional,feePerOrder:P.feePerOrder,stressSlippagePerSide:P.stressSlippagePerSide,spreadDeductedAgain:false},conclusion:'No profitability, fill, untouched confirmation or approved BUY verdict'};
}
