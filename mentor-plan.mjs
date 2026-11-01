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
 if(selected){if(!buySession)issues.push('BUY_SESSION_UNKNOWN');if(!fill)issues.push('FILL_UNKNOWN');if(!exitSession)issues.push('TIME_EXIT_UNRESOLVED');if(p.ldHold!==undefined&&p.ldHold!==null&&p.ldHold!==126)issues.push('HOLD_PERIOD_DIFFERS_FROM_REGISTERED_126');
  if(!target)issues.push('TARGET_UNKNOWN');else if(fill&&Math.abs(target-Number((fill*1.2).toFixed(2)))>0.005)issues.push('TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT');
  if(p.stop!==undefined&&p.stop!==null&&p.stop!==0)issues.push('STOP_VARIANT_NOT_TESTED_BY_THIS_RULE');
  if(!units)issues.push('WHOLE_SHARE_QUANTITY_UNKNOWN');if(notional>1000)issues.push('RECORDED_NOTIONAL_EXCEEDS_SLOT_ALLOCATION');if(buySession&&buySession>asOfDay)issues.push('BUY_SESSION_FUTURE');
 }else if(!validSignal)issues.push('NO_VALID_SOURCE_SIGNAL');
 if(!entrySession)issues.push('ENTRY_WINDOW_UNRESOLVED');if(selected&&!validSignal)issues.push('ORIGINAL_SIGNAL_IDENTITY_UNKNOWN');
 if(selected&&entrySession&&buySession&&buySession!==entrySession)issues.push('RECORDED_ENTRY_DIFFERS_FROM_NEXT_OPEN_SESSION');
 if(selected)issues.push('EXACT_OPEN_FILL_NOT_VERIFIED');
 let clock=null;
 if(Number.isFinite(asOfMs)&&Number.isFinite(new Date(asOfMs).getTime())){const parts={};for(const p of new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(asOfMs)))parts[p.type]=p.value;const day=parts.year+'-'+parts.month+'-'+parts.day;if(day===asOfDay)clock=+parts.hour*3600+ +parts.minute*60+ +parts.second;else issues.push('CLOCK_DAY_MISMATCH');}
 const entryState=!entrySession||!marketSession(asOfDay).known||issues.includes('CLOCK_DAY_MISMATCH')?'UNKNOWN':asOfDay>entrySession?'EXPIRED':asOfDay<entrySession?'NEXT_OPEN_ONLY':clock===null?'OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED':clock>marketSession(entrySession).open*60?'EXPIRED':clock<marketSession(entrySession).open*60?'BEFORE_REGISTERED_OPEN':'OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED';
 const holdingState=!exitSession||!marketSession(asOfDay).known||buySession>asOfDay?'UNKNOWN':asOfDay>exitSession?'REGISTERED_DEADLINE_PASSED':asOfDay===exitSession?'REGISTERED_CLOSE_DUE_TODAY':'MONITOR_CONTRACT_NOT_A_HOLD_APPROVAL';
 const contradictionCodes=new Set(['TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT','STOP_VARIANT_NOT_TESTED_BY_THIS_RULE','RECORDED_NOTIONAL_EXCEEDS_SLOT_ALLOCATION','BUY_SESSION_FUTURE','RECORDED_ENTRY_DIFFERS_FROM_NEXT_OPEN_SESSION','HOLD_PERIOD_DIFFERS_FROM_REGISTERED_126','CLOCK_DAY_MISMATCH']);
 const contradictions=issues.filter(x=>contradictionCodes.has(x)),evidenceGaps=issues.filter(x=>!contradictionCodes.has(x));
 const missingFacts=selected&&(!buySession||!fill||!exitSession||!marketSession(asOfDay).known);
 const planStatus=p&&!selected?'UNSUPPORTED':contradictions.length?'UNRESOLVED':selected?missingFacts?'INCOMPLETE_RECORDED_PLAN':!validSignal?'RECORDED_PLAN_PROVENANCE_MISSING':!units?'RECORDED_PLAN_DETAILS_MISSING':'LOCAL_CONTRACT_ONLY_UNVERIFIED':!validSignal?'NO_PLAN':entryState==='EXPIRED'?'EXPIRED_ENTRY':'RESEARCH_CONTEXT_UNVERIFIED';
 const plan={version:'LEADER_DIP_MENTOR_V2',symbol,scope:selected?'RECORDED_LEADER_DIP':p?'OTHER_LANE_UNSUPPORTED':validSignal?'SOURCE_LEAD':'NO_PLAN',decision:'EXPLANATION_ONLY',actionability:'NOT_ACTIONABLE',planStatus,evidence:'NOT PROVEN; target exit not adopted under the frozen comparison',rule:'SQ11-PB12 / A-TGT-TGT20-PB12',horizonSessions:126,zadStatus,
  asOf:{day:asOfDay,clockSeconds:clock},
  selection:{rule:'SQ11-PB12',condition:'Prior-month-end top20% 12-1 momentum leaders among300 largest eligible US companies; first close at least12% below50-session highest close, still above200-session average; previous close less than12% below its own50-session high',verified:false},
  source:validSignal?{day:signal.day,referenceClose:signal.close,sha256:signal.sha256||null,generatedAt:signal.generatedAt||null}:null,
  entry:{session:entrySession,state:entryState,range:null,recordedFill:fill,recordedSession:buySession,fillAtOpenVerified:false},
  risk:{quantity:units,notional,maximumAllocationPerSlot:1000,maximumSlots:3,stopDefinedLossCap:null,feesSlippage:'UNKNOWN'},
  exit:{referenceState:holdingState,baseRule:'SQ11-PB12',baseExit:'SESSION_126_CLOSE_NO_FIXED_TARGET',targetStudy:'A-TGT-TGT20-PB12',targetStudyVerdict:'NOT PROVEN',targetStudyAdopted:false,recordedStop:positive(p?.stop)?p.stop:null,storedTarget:target,session:exitSession,time:'REGISTERED_SESSION_CLOSE',storedTargetMatchesOverlay:fill!==null&&target!==null&&!issues.includes('TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT')},recordedLane:p?.src||p?.kind||null,contradictions,evidenceGaps,holdingState:planStatus==='UNRESOLVED'?'UNRESOLVED_PLAN_NOT_HOLD_GUIDANCE':holdingState,issues};
 plan.guide=leaderDipDecisionGuide(plan);return plan;
}
export function leaderDipDecisionGuide(p){
 const close=p.exit.session?marketSession(p.exit.session).close:null,clock=p.asOf.clockSeconds;
 const deadlineState=!p.exit.session?'UNKNOWN':p.asOf.day>p.exit.session?'PASSED':p.asOf.day<p.exit.session?'FUTURE':clock===null?'CLOSE_TODAY_CLOCK_UNKNOWN':clock<close*60?'CLOSE_TODAY_PENDING':'PASSED';
 const stage=p.planStatus==='UNRESOLVED'?'RECONCILE_PLAN':p.planStatus==='INCOMPLETE_RECORDED_PLAN'?'VERIFY_RECORDED_DETAILS':p.scope==='RECORDED_LEADER_DIP'?deadlineState==='PASSED'?'CLOSE_REACHED_EXECUTION_UNVERIFIED':deadlineState==='CLOSE_TODAY_PENDING'?'REGISTERED_CLOSE_TODAY':deadlineState==='CLOSE_TODAY_CLOCK_UNKNOWN'?'VERIFY_EXIT_CLOCK':'MONITOR_RESEARCH_CONTRACT':p.entry.state==='EXPIRED'?'ENTRY_EXPIRED':'VERIFY_BEFORE_NEXT_OPEN';
 const next={VERIFY_RECORDED_DETAILS:'Verify the missing recorded fill, buy date or hold before calculating a complete holding reference; do not invent the original signal.',RECONCILE_PLAN:'Resolve the listed source/fill/variant contradictions before treating the stored plan as guidance; keep original records.',CLOSE_REACHED_EXECUTION_UNVERIFIED:'Verify whether the registered close exit occurred and reconcile actual holding status. If missed, next-open recovery is an unvalidated timing variant, not the frozen exit.',REGISTERED_CLOSE_TODAY:'The frozen reference ends at today’s close. Confirm actual holdings, eligibility and executable exit evidence; this view does not issue an order.',VERIFY_EXIT_CLOCK:'Verify the New York clock before classifying the registered close as pending or missed.',MONITOR_RESEARCH_CONTRACT:'Review the unchanged contract and current eligibility/execution evidence; this is not approval to hold.',ENTRY_EXPIRED:'Do not present this lead as a current next-open entry. A later entry is a different, unvalidated variant.',VERIFY_BEFORE_NEXT_OPEN:'Verify source selection, identity, current ZAD, executable opening evidence, costs and portfolio capacity. No executable entry range is established.'}[stage];
 return {version:'LEADER_DIP_DECISION_GUIDE_V1',stage,next,referenceCloseMinute:close,deadlineState,executable:false,changes:[
  {event:'OPEN_PASSES_WITHOUT_VERIFIED_FILL',effect:'Entry expires; no chase or invented replacement price.'},
  {event:'SOURCE_FILL_OR_RULE_DIFFERS',effect:'Reconcile as unresolved; do not borrow a later signal or tested returns.'},
  {event:'ELIGIBILITY_OR_EXECUTION_EVIDENCE_MISSING',effect:'Keep identity/ZAD/BBO/size/liquidity/cost and portfolio checks unresolved; no approved BUY.'},
  {event:'REGISTERED_SESSION_126_CLOSE',effect:'Frozen base time exit; missed-close recovery differs from the tested rule.'},
  {event:'STORED_TARGET_TOUCHED',effect:'Unadopted overlay only; daily high is not a confirmed fill or sale.'},
  {event:'REPORTED_SALE',effect:'Only an actual owner-reported execution enters existing transaction recording; this read-only view never records a sale.'}
 ]};
}
const money=n=>positive(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'unknown';
const date=day=>day?new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}):'unknown';
const plainIssues={TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT:'Stored target differs from the unadopted +20% overlay.',STOP_VARIANT_NOT_TESTED_BY_THIS_RULE:'The recorded stop is a variant outside the tested no-stop rule.',RECORDED_NOTIONAL_EXCEEDS_SLOT_ALLOCATION:'Recorded size exceeds the $1,000 slot limit.',BUY_SESSION_FUTURE:'Recorded buy date is in the future.',RECORDED_ENTRY_DIFFERS_FROM_NEXT_OPEN_SESSION:'Recorded buy date differs from the saved signal’s next-open session.',HOLD_PERIOD_DIFFERS_FROM_REGISTERED_126:'Recorded holding period differs from 126 sessions.',CLOCK_DAY_MISMATCH:'The supplied clock and date disagree.'};
export function renderLeaderDipMentor(p){
 const safe='Explanation only; NOT PROVEN. No new BUY or HOLD approval.';
 if(p.scope==='OTHER_LANE_UNSUPPORTED')return 'MENTOR '+p.symbol+' — LEADER DIP only.\nRecorded lane: '+(typeof p.recordedLane==='string'?p.recordedLane.replace(/\s+/g,' ').slice(0,60):'unknown')+'. This view does not cover that lane. '+safe;
 if(p.scope==='NO_PLAN')return 'MENTOR '+p.symbol+' — no LEADER DIP signal or holding on file.\n'+safe;
 const held=p.scope==='RECORDED_LEADER_DIP',r=p.risk,ex=p.exit;
 const close=ex.session?marketSession(ex.session).close:null,closeText=close===null?'':String(Math.floor(close/60)).padStart(2,'0')+':'+String(close%60).padStart(2,'0');
 const overlay=ex.storedTarget?money(ex.storedTarget)+(p.entry.recordedFill?' ('+((ex.storedTarget/p.entry.recordedFill-1)*100).toFixed(0)+'% vs recorded entry)':'')+' target on file; order/fill unverified. The target study is not adopted.':'none recorded. The tested base has no fixed profit target.';
 const entryStates={EXPIRED:'expired; do not treat this as a current entry',NEXT_OPEN_ONLY:'next open only',BEFORE_REGISTERED_OPEN:'not open yet',OPEN_ONLY_TIME_AND_QUOTE_UNVERIFIED:'opening time and quote not verified',UNKNOWN:'not established'};
 const limitations=p.contradictions.length?'Check recorded plan differences below.':held&&!p.source?'Original signal not on file; this is missing history, not a contradiction.':held?'Original input checksum is not provider authentication.':'Selection and execution are not verified.';
 const first=[
  'MENTOR '+p.symbol+' — LEADER DIP (NOT PROVEN; EXPLANATION ONLY)',
  held?'1. Position: '+(r.quantity===null?'unknown quantity':r.quantity+' whole shares')+'; recorded entry '+money(p.entry.recordedFill)+'; bought '+date(p.entry.recordedSession)+'.':'1. Lead: '+money(p.source?.referenceClose)+' reference close on '+date(p.source?.day)+'; not an executable price.',
  held?'2. Owner overlay: '+overlay:'2. Entry: '+date(p.entry.session)+' New York OPEN only; '+entryStates[p.entry.state]+'.',
  '3. Tested exit reference: '+(ex.session?date(ex.session)+' at '+closeText+' New York CLOSE.':'126 sessions, counting the buy day; no filled-position exit date established.'),
  '4. Size/risk: '+(held?money(r.notional)+' recorded; ':'')+'$1,000 per slot, 3 slots. Base has no stop'+(ex.recordedStop?'; recorded stop '+money(ex.recordedStop)+' is an untested variant':'')+': full notional can be lost, plus costs.',
  '5. Limits: '+limitations+' Current ZAD, identity, BBO, fees/slippage and portfolio capacity are unverified.',
  '6. Timing: bot reminder says next open; the tested exit is the close. Neither rule is changed here.',
  'No new BUY or HOLD approval.'
 ];
 const details=[
  'Details:',
  ...(p.contradictions.length?p.contradictions.map(x=>'Check: '+plainIssues[x]):[]),
  ...(held&&!p.source?['Original signal not on file. Recorded buy date: '+date(p.entry.recordedSession)+'. It does not establish an original signal date or an exact opening fill.']:[]),
  ...(!p.entry.recordedSession&&held?['Recorded buy session is missing; the exit date cannot be calculated.']:[]),
  'Entry rule (not independently verified): prior-month top 20% by 12–1 momentum among 300 largest eligible US companies; first close at least 12% below its 50-session highest close, still above its 200-session average; previous close less than 12% below its own 50-session high.',
  ...(p.source?['Source: '+p.source.day+' close '+money(p.source.referenceClose)+' (reference, not executable price). No executable price/range is established.']:['No executable price/range is established.']),
  ...(p.guide.deadlineState==='PASSED'?['The registered close has passed. Verify actual holding/sale status; a reached date or target does not prove a sale.']:[]),
  'A touched daily high does not prove a limit fill.',
  'Historical costs: 0.8% round trip; 1.2% stress. Actual costs/fills remain unknown. Halts, gaps, dilution and unavailable quotes can prevent an exit.'
 ];
 return [...first,...details].join('\n');
}
