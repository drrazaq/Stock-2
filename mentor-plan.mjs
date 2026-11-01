// Read-only contract explanation for an existing lane; never an executable BUY gate.
import {createHash} from 'node:crypto';
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
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]))):x;
const fingerprint=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
export function captureLeaderDipContract(source){
 if(source?.rule!=='SQ11-PB12'||!session(source.day)||!positive(source.close)||!(/^[a-f0-9]{64}$/).test(source.sha256||''))return null;
 const contract={version:'LEADER_DIP_CONTRACT_V1',status:'CAPTURED_SOURCE_NOT_AUTHENTICATED',source:{rule:source.rule,day:source.day,close:source.close,generatedAt:source.generatedAt||null,sha256:source.sha256},entryPolicy:'NEXT_SESSION_OPEN_ONLY',hold:126,targetPct:.2,stopBasis:'NONE_REGISTERED',exitPolicy:'SESSION_126_CLOSE',costModel:{roundTrip:.008,stress:.012}};
 return {...contract,fingerprint:fingerprint(contract)};
}
export function savedLeaderDipSignal(contract){
 if(!contract||typeof contract!=='object')return null;
 const {fingerprint:expected,...body}=contract;
 try{if(fingerprint(body)!==expected)return null;const rebuilt=captureLeaderDipContract(body.source);if(!rebuilt||rebuilt.fingerprint!==expected)return null;return {...body.source};}catch{return null;}
}
export function leaderDipMentorPlan({symbol,position=null,signal=null,quantity=null,asOfDay,asOfMs=null,zadStatus='UNKNOWN'}={}){
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
 if(!entrySession)issues.push('ENTRY_WINDOW_UNRESOLVED');if(selected&&!validSignal)issues.push('ORIGINAL_SIGNAL_IDENTITY_UNKNOWN');
 if(selected&&entrySession&&buySession!==entrySession)issues.push('RECORDED_ENTRY_DIFFERS_FROM_NEXT_OPEN_SESSION');
 if(selected)issues.push('EXACT_OPEN_FILL_NOT_VERIFIED');
 let clock=null;
 if(Number.isFinite(asOfMs)&&Number.isFinite(new Date(asOfMs).getTime())){const parts={};for(const p of new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(asOfMs)))parts[p.type]=p.value;const day=parts.year+'-'+parts.month+'-'+parts.day;if(day===asOfDay)clock=+parts.hour*3600+ +parts.minute*60+ +parts.second;else issues.push('CLOCK_DAY_MISMATCH');}
 const entryState=!entrySession||!marketSession(asOfDay).known||issues.includes('CLOCK_DAY_MISMATCH')?'UNKNOWN':asOfDay>entrySession?'EXPIRED':asOfDay<entrySession?'NEXT_OPEN_ONLY':clock===null?'OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED':clock>marketSession(entrySession).open*60?'EXPIRED':clock<marketSession(entrySession).open*60?'BEFORE_REGISTERED_OPEN':'OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED';
 const holdingState=!exitSession||!marketSession(asOfDay).known||buySession>asOfDay?'UNKNOWN':asOfDay>exitSession?'REGISTERED_DEADLINE_PASSED':asOfDay===exitSession?'REGISTERED_CLOSE_DUE_TODAY':'MONITOR_CONTRACT_NOT_A_HOLD_APPROVAL';
 const structuralIssues=issues.filter(x=>x!=='EXACT_OPEN_FILL_NOT_VERIFIED');
 const planStatus=structuralIssues.length?'UNRESOLVED':selected?'LOCAL_CONTRACT_ONLY_UNVERIFIED':entryState==='EXPIRED'?'EXPIRED_ENTRY':'RESEARCH_CONTEXT_UNVERIFIED';
 const plan={version:'LEADER_DIP_MENTOR_V1',symbol,scope:selected?'RECORDED_LEADER_DIP':p?'OTHER_LANE_UNSUPPORTED':validSignal?'SOURCE_LEAD':'NO_PLAN',decision:'EXPLANATION_ONLY',actionability:'NOT_ACTIONABLE',planStatus,evidence:'NOT PROVEN; target exit not adopted under the frozen comparison',rule:'SQ11-PB12 / A-TGT-TGT20-PB12',horizonSessions:126,zadStatus,
  asOf:{day:asOfDay,clockSeconds:clock},
  selection:{rule:'SQ11-PB12',condition:'Prior-month-end top20% 12-1 momentum leaders among300 largest eligible US companies; first close at least12% below50-session highest close, still above200-session average; previous close less than12% below its own50-session high',verified:false},
  source:validSignal?{day:signal.day,referenceClose:signal.close,sha256:signal.sha256||null,generatedAt:signal.generatedAt||null}:null,
  entry:{session:entrySession,state:entryState,range:null,recordedFill:fill,recordedSession:buySession,fillAtOpenVerified:false},
  risk:{quantity:units,notional,maximumAllocationPerSlot:1000,maximumSlots:3,stopDefinedLossCap:null,feesSlippage:'UNKNOWN'},
  exit:{referenceState:holdingState,baseRule:'SQ11-PB12',baseExit:'SESSION_126_CLOSE_NO_FIXED_TARGET',targetStudy:'A-TGT-TGT20-PB12',targetStudyVerdict:'NOT PROVEN',targetStudyAdopted:false,recordedStop:positive(p?.stop)?p.stop:null,storedTarget:target,session:exitSession,time:'REGISTERED_SESSION_CLOSE',storedTargetMatchesOverlay:fill!==null&&target!==null&&!issues.includes('TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT')},holdingState:planStatus==='UNRESOLVED'?'UNRESOLVED_PLAN_NOT_HOLD_GUIDANCE':holdingState,issues};
 plan.guide=leaderDipDecisionGuide(plan);return plan;
}
export function leaderDipDecisionGuide(p){
 const close=p.exit.session?marketSession(p.exit.session).close:null,clock=p.asOf.clockSeconds;
 const deadlineState=!p.exit.session?'UNKNOWN':p.asOf.day>p.exit.session?'PASSED':p.asOf.day<p.exit.session?'FUTURE':clock===null?'CLOSE_TODAY_CLOCK_UNKNOWN':clock<close*60?'CLOSE_TODAY_PENDING':'PASSED';
 const stage=p.planStatus==='UNRESOLVED'?'RECONCILE_PLAN':p.scope==='RECORDED_LEADER_DIP'?deadlineState==='PASSED'?'CLOSE_REACHED_EXECUTION_UNVERIFIED':deadlineState==='CLOSE_TODAY_PENDING'?'REGISTERED_CLOSE_TODAY':deadlineState==='CLOSE_TODAY_CLOCK_UNKNOWN'?'VERIFY_EXIT_CLOCK':'MONITOR_RESEARCH_CONTRACT':p.entry.state==='EXPIRED'?'ENTRY_EXPIRED':'VERIFY_BEFORE_NEXT_OPEN';
 const next={RECONCILE_PLAN:'Resolve the listed source/fill/variant contradictions before treating the stored plan as guidance; keep original records.',CLOSE_REACHED_EXECUTION_UNVERIFIED:'Verify whether the registered close exit occurred and reconcile actual holding status. If missed, next-open recovery is an unvalidated timing variant, not the frozen exit.',REGISTERED_CLOSE_TODAY:'The frozen reference ends at today’s close. Confirm actual holdings, eligibility and executable exit evidence; this view does not issue an order.',VERIFY_EXIT_CLOCK:'Verify the New York clock before classifying the registered close as pending or missed.',MONITOR_RESEARCH_CONTRACT:'Review the unchanged contract and current eligibility/execution evidence; this is not approval to hold.',ENTRY_EXPIRED:'Do not present this lead as a current next-open entry. A later entry is a different, unvalidated variant.',VERIFY_BEFORE_NEXT_OPEN:'Verify source selection, identity, current ZAD, executable opening evidence, costs and portfolio capacity. No executable entry range is established.'}[stage];
 return {version:'LEADER_DIP_DECISION_GUIDE_V1',stage,next,referenceCloseMinute:close,deadlineState,executable:false,changes:[
  {event:'OPEN_PASSES_WITHOUT_VERIFIED_FILL',effect:'Entry expires; no chase or invented replacement price.'},
  {event:'SOURCE_FILL_OR_RULE_DIFFERS',effect:'Reconcile as unresolved; do not borrow a later signal or tested returns.'},
  {event:'ELIGIBILITY_OR_EXECUTION_EVIDENCE_MISSING',effect:'Keep identity/ZAD/BBO/size/liquidity/cost and portfolio checks unresolved; no approved BUY.'},
  {event:'REGISTERED_SESSION_126_CLOSE',effect:'Frozen base time exit; missed-close recovery differs from the tested rule.'},
  {event:'STORED_TARGET_TOUCHED',effect:'Unadopted overlay only; daily high is not a confirmed fill or sale.'},
  {event:'REPORTED_SALE',effect:'Only an actual owner-reported execution enters existing transaction recording; this read-only view never records a sale.'}
 ]};
}
const money=n=>positive(n)?n.toFixed(2):'UNKNOWN';
export function renderLeaderDipMentor(p){return [
 'MENTOR '+p.symbol+' | LEADER DIP | up to126 sessions (about6months)',
 'EXPLANATION ONLY: no new BUY or HOLD approval. '+p.evidence+'.',
 'Plan status: '+p.planStatus+' | '+p.actionability+'. Unsupported/contradictory plans are unresolved, never an action.',
 'Scope: '+p.scope+'.',
 'Workflow: '+p.guide.stage+'; '+p.guide.next,
 'Entry condition (not independently verified): '+p.selection.condition+'.',
 'Selection: existing owner lane, chosen for contract/accounting continuity; not a proven winner.',
 'Source: '+(p.source?p.source.day+' close '+money(p.source.referenceClose)+' (reference, not executable price)':'UNKNOWN; no source signal matched')+'.',
 'Original-input fingerprint: '+(p.source?.sha256||'UNKNOWN')+'; checksum is not provider authentication.',
 'Entry: next session OPEN only; '+(p.entry.session||'UNKNOWN')+'; '+p.entry.state+'. No executable price/range is established. The legacy +3% ceiling is not the registered next-open fill.',
 'Recorded fill: '+money(p.entry.recordedFill)+' on '+(p.entry.recordedSession||'UNKNOWN')+'; exact opening fill NOT VERIFIED.',
 'Position: '+(p.risk.quantity||'UNKNOWN')+' whole shares; recorded notional '+money(p.risk.notional)+'. Existing lane limits:1,000USD per slot,3slots; allocation is not a loss budget.',
 'Risk: the frozen baseline and target study model no stop; recorded stop '+money(p.exit.recordedStop)+' is not a validated change to that contract. No stop-defined loss cap is established here. A cash-stock purchase can lose its full notional, plus costs. Gaps, halts, dilution and unavailable quotes can prevent exit; actual fees/slippage UNKNOWN.',
 'Frozen base exit (SQ11-PB12, NOT PROVEN): close of session126; no fixed profit target. Separate target study: +20%, A-TGT-TGT20-PB12, NOT PROVEN; adoption=false.',
 'Unadopted owner-lane overlay: stored target '+money(p.exit.storedTarget)+(p.exit.storedTargetMatchesOverlay?' arithmetically matches recorded fill +20%; this does not validate or adopt the overlay':' is UNKNOWN or inconsistent with the unadopted overlay')+'; a touched daily high does not prove a limit fill.',
 'Time exit reference (not an actionable instruction): '+(p.exit.session||'UNKNOWN')+' at that session CLOSE in both frozen base and target study, counting the buy session as1. Reference state: '+p.exit.referenceState+'; guidance state: '+p.holdingState+'.',
 'Timing mismatch: current legacy reminder says next open; that recovery timing differs from the registered close and is not validated by the frozen returns. No reminder or exit rule was changed by this view.',
 'Holding checks: recheck current ZAD, identity, filings, fresh executable bid/ask, liquidity and portfolio exposure. ZAD summary: '+p.zadStatus+'. Identity/quotes/liquidity are not verified by this view. Do not infer approval from a recorded holding.',
 'What changes the decision: entry expiry, changed source/fill/rule, lost eligibility or execution evidence, session126 close, or a confirmed reported sale. A target touch alone is not execution. Portfolio-wide capacity is not verified.',
 'Costs/evidence: historical model0.8% round trip,1.2% stress; actual executable costs/depth and admitted prospective outcomes remain unestablished. No target return is promised.',
 'Unresolved: '+(p.issues.join(', ')||'no structural contract issue found; execution/prospective evidence still missing')+'.',
].join('\n');}
