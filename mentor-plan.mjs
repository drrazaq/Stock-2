// Read-only contract explanation for an existing lane; never an executable BUY gate.
import {marketSession} from './market-session.mjs';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const session=d=>marketSession(d).known&&!marketSession(d).closed;
export function mentorSessionAfter(day,count){
 if(!session(day)||!Number.isSafeInteger(count)||count<0||count>126)return null;
 let d=day;for(let n=0,steps=0;n<count&&steps<400;steps++){
  d=new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const s=marketSession(d);if(!s.known)return null;if(!s.closed)n++;
 }return d;
}
export function leaderDipMentorPlan({symbol,position=null,signal=null,quantity=null,asOfDay,zadStatus='UNKNOWN'}={}){
 const p=position&&typeof position==='object'&&!Array.isArray(position)?position:null;
 const selected=p?.src==='leader dip';
 const validSignal=signal?.rule==='SQ11-PB12'&&session(signal.day)&&marketSession(asOfDay).known&&signal.day<=asOfDay&&positive(signal.close);
 const entrySession=validSignal?mentorSessionAfter(signal.day,1):null;
 const buySession=selected&&session(p.boughtSession)?p.boughtSession:null;
 const fill=selected&&positive(p.entry)?p.entry:null;
 const target=selected&&positive(p.target)?p.target:null;
 const exitSession=buySession&&p.ldHold===126?mentorSessionAfter(buySession,125):null;
 const units=Number.isSafeInteger(quantity)&&quantity>0?quantity:null;
 const notional=fill&&units&&Number.isFinite(fill*units)?fill*units:null;
 const issues=[];
 if(!marketSession(asOfDay).known)issues.push('AS_OF_CALENDAR_UNKNOWN');
 if(p&&!selected)issues.push('OTHER_LANE_NOT_SUPPORTED');
 if(selected){if(!buySession)issues.push('BUY_SESSION_UNKNOWN');if(!fill)issues.push('FILL_UNKNOWN');if(!exitSession)issues.push('TIME_EXIT_UNRESOLVED');
  if(!target)issues.push('TARGET_UNKNOWN');else if(fill&&Math.abs(target-Number((fill*1.2).toFixed(2)))>0.005)issues.push('TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT');
  if(p.stop!==undefined&&p.stop!==null&&p.stop!==0)issues.push('STOP_VARIANT_NOT_TESTED_BY_THIS_RULE');
  if(!units)issues.push('WHOLE_SHARE_QUANTITY_UNKNOWN');if(notional>1000)issues.push('RECORDED_NOTIONAL_EXCEEDS_SLOT_ALLOCATION');if(buySession&&buySession>asOfDay)issues.push('BUY_SESSION_FUTURE');
 }else if(!validSignal)issues.push('NO_VALID_SOURCE_SIGNAL');
 if(!entrySession)issues.push('ENTRY_WINDOW_UNRESOLVED');
 if(selected&&entrySession&&buySession!==entrySession)issues.push('RECORDED_ENTRY_DIFFERS_FROM_NEXT_OPEN_SESSION');
 if(selected)issues.push('EXACT_OPEN_FILL_NOT_VERIFIED');
 const entryState=!entrySession?'UNKNOWN':!marketSession(asOfDay).known?'UNKNOWN':asOfDay>entrySession?'EXPIRED':asOfDay<entrySession?'NEXT_OPEN_ONLY':'OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED';
 const holdingState=!exitSession||!marketSession(asOfDay).known||buySession>asOfDay?'UNKNOWN':asOfDay>exitSession?'REGISTERED_DEADLINE_PASSED':asOfDay===exitSession?'REGISTERED_CLOSE_DUE_TODAY':'MONITOR_CONTRACT_NOT_A_HOLD_APPROVAL';
 return {version:'LEADER_DIP_MENTOR_V1',symbol,scope:selected?'RECORDED_LEADER_DIP':p?'OTHER_LANE_UNSUPPORTED':validSignal?'SOURCE_LEAD':'NO_PLAN',decision:'EXPLANATION_ONLY',evidence:'NOT PROVEN; target exit not adopted under the frozen comparison',rule:'SQ11-PB12 / A-TGT-TGT20-PB12',horizonSessions:126,zadStatus,
  source:validSignal?{day:signal.day,referenceClose:signal.close}:null,
  entry:{session:entrySession,state:entryState,range:null,recordedFill:fill,recordedSession:buySession,fillAtOpenVerified:false},
  risk:{quantity:units,notional,maximumAllocationPerSlot:1000,maximumSlots:3,stopDefinedLossCap:null,feesSlippage:'UNKNOWN'},
  exit:{storedTarget:target,session:exitSession,time:'REGISTERED_SESSION_CLOSE',storedTargetConfirmed:fill!==null&&target!==null&&!issues.includes('TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT')},holdingState,issues};
}
const money=n=>positive(n)?n.toFixed(2):'UNKNOWN';
export function renderLeaderDipMentor(p){return [
 'MENTOR '+p.symbol+' | LEADER DIP | up to126 sessions (about6months)',
 'EXPLANATION ONLY: no new BUY or HOLD approval. '+p.evidence+'.',
 'Scope: '+p.scope+'.',
 'Selection: existing owner lane, chosen for contract/accounting continuity; not a proven winner.',
 'Source: '+(p.source?p.source.day+' close '+money(p.source.referenceClose)+' (reference, not executable price)':'UNKNOWN; no source signal matched')+'.',
 'Entry: next session OPEN only; '+(p.entry.session||'UNKNOWN')+'; '+p.entry.state+'. No executable price/range is established. The legacy +3% ceiling is not the registered next-open fill.',
 'Recorded fill: '+money(p.entry.recordedFill)+' on '+(p.entry.recordedSession||'UNKNOWN')+'; exact opening fill NOT VERIFIED.',
 'Position: '+(p.risk.quantity||'UNKNOWN')+' whole shares; recorded notional '+money(p.risk.notional)+'. Existing lane limits:1,000USD per slot,3slots; allocation is not a loss budget.',
 'Risk: no stop by registered design; no stop-defined loss cap. A cash-stock purchase can lose its full notional, plus costs. Gaps, halts, dilution and unavailable quotes can prevent exit; actual fees/slippage UNKNOWN.',
 'Exit: stored target '+money(p.exit.storedTarget)+(p.exit.storedTargetConfirmed?' matches recorded fill +20%':' is UNKNOWN or does not establish the registered target')+'; a touched daily high does not prove a limit fill.',
 'Time exit: '+(p.exit.session||'UNKNOWN')+' at that session CLOSE, counting the buy session as1. '+p.holdingState+'.',
 'Timing mismatch: current legacy reminder says next open; that recovery timing differs from the registered close and is not validated by the frozen returns. No reminder or exit rule was changed by this view.',
 'Holding checks: recheck current ZAD, identity, filings, fresh executable bid/ask, liquidity and portfolio exposure. ZAD summary: '+p.zadStatus+'. Identity/quotes/liquidity are not verified by this view. Do not infer approval from a recorded holding.',
 'Costs/evidence: historical model0.8% round trip,1.2% stress; actual executable costs/depth and admitted prospective outcomes remain unestablished. No target return is promised.',
 'Unresolved: '+(p.issues.join(', ')||'no structural contract issue found; execution/prospective evidence still missing')+'.',
].join('\n');}
