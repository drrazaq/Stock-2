// Offline evidence adapter, immutable paper ledger and economic measurement.
// No I/O, production imports, provider calls, notifications or BUY promotion.
import {createHash} from 'node:crypto';
import {assessReclaim} from './catalyst-reclaim-prototype.mjs';

const fail = message => { throw new Error(message); };
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const canonical = x => {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number' && Number.isFinite(x)) return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && Object.getPrototypeOf(x) === Object.prototype) return '{' + Object.keys(x).sort().map(k => JSON.stringify(k)+':'+canonical(x[k])).join(',') + '}';
  return fail('NON_JSON_EVIDENCE');
};
export const evidenceHash = x => createHash('sha256').update(canonical(x)).digest('hex');
export function evidenceTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const [date,clock] = value.split('T'), [y,m,d] = date.split('-').map(Number);
  const check = new Date(Date.UTC(y,m-1,d));
  if (check.getUTCFullYear()!==y || check.getUTCMonth()!==m-1 || check.getUTCDate()!==d || +clock.slice(0,2)>23 || +clock.slice(3,5)>59 || +clock.slice(6,8)>59) return NaN;
  return Date.parse(value);
}
const ny = ms => Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const nyDate = ms => {const p=ny(ms);return `${p.year}-${p.month}-${p.day}`;};
export function freezeProposal(policy) {
  if (!policy || policy.mode!=='OFFLINE_RESEARCH_ONLY' || policy.adopted!==false || policy.version!==1 || !/^[A-Z0-9_-]{1,80}$/.test(policy.id||'')) fail('UNAPPROVED_RESEARCH_POLICY_REQUIRED');
  const numeric = ['minPrice','minDollarVolume','maxSpreadPct','maxQuoteAgeMs','materialityRatio','openingBarMs','maxTriggerAgeMs'];
  if (!numeric.every(k=>positive(policy[k])) || policy.maxSpreadPct>100 || policy.materialityRatio>1 || !Number.isInteger(policy.openingBarMs) || policy.openingBarMs%60000!==0) fail('INVALID_THRESHOLDS');
  if (!Number.isInteger(policy.maxHoldSessions) || policy.maxHoldSessions<1 || policy.maxHoldSessions>20 || policy.exitRule!=='FIRST_CLOSE_BELOW_OPENING_LOW_ELSE_MAX_SESSION_CLOSE' || policy.exitContract!==`PROPOSED ONLY: max ${policy.maxHoldSessions} sessions; close below opening low exits next session open` || policy.invalidationContract!=='PROPOSED ONLY: close below opening low; no intraday stop or target') fail('AMBIGUOUS_EXIT_CONTRACT');
  if (!positive(policy.minOpeningVolumeRatio) || policy.commissionPerSideUsd!==3 || !Number.isFinite(policy.slippagePerSidePct) || policy.slippagePerSidePct<0 || policy.slippagePerSidePct>=100 || !positive(policy.maxExitQuoteAgeMs)) fail('INVALID_ECONOMICS_OR_OPENING_GATE');
  return {policy:structuredClone(policy),policyHash:evidenceHash(policy)};
}
function sessionsOf(input) {
  if (!input.calendar || !input.calendar.source || !input.calendar.evidenceId || !Array.isArray(input.calendar.sessions) || !input.calendar.sessions.length) fail('MISSING_CALENDAR_EVIDENCE');
  let last=0;
  return input.calendar.sessions.map(s=>{
    const open=evidenceTime(s.open),close=evidenceTime(s.close),p=Number.isFinite(open)?ny(open):{};
    if (!Number.isFinite(open)||!Number.isFinite(close)||open<=last||close<=open||p.hour!=='09'||p.minute!=='30'||['Sat','Sun'].includes(p.weekday)||nyDate(open)!==nyDate(close)||s.date!==nyDate(open)||!s.evidenceId) fail('INVALID_SESSION_EVIDENCE');
    const c=ny(close);if (!((c.hour==='16'||c.hour==='13')&&c.minute==='00')) fail('INVALID_REGULAR_OR_EARLY_CLOSE');
    last=close;return {...s,openMs:open,closeMs:close};
  });
}
function validationReason(input,policy) {
  try {
    if (!input || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(input.symbol||'') || !input.observationId || !input.securityId || !input.identityEvidenceId) fail('MISSING_SECURITY_IDENTITY_EVIDENCE');
    const now=evidenceTime(input.asOf);if(!Number.isFinite(now))fail('INVALID_AS_OF');
    const sessions=sessionsOf(input),session=sessions.find(s=>s.open===input.sessionOpen&&s.close===input.sessionClose);
    if(!session)fail('SESSION_NOT_IN_SUPPLIED_CALENDAR');
    const c=input.catalyst;
    if(!c || c.securityId!==input.securityId || c.currency!=='USD' || c.contractValueBasis!=='FIXED_COMMITTED_NOT_CEILING' || !/^https:\/\//.test(c.sourceUrl||'') || !/^[a-f0-9]{64}$/.test(c.documentHash||'')) fail('UNRESOLVED_CONTRACT_EVIDENCE');
    for(const v of [c.publishedAt,c.observedAt,c.marketCapAsOf,input.liquidityAsOf,input.zadAsOf,input.identityAsOf]) if(!Number.isFinite(evidenceTime(v))||evidenceTime(v)>now)fail('INVALID_POINT_IN_TIME_EVIDENCE');
    if(evidenceTime(input.liquidityAsOf)>=session.openMs || !input.liquidityEvidenceId || !input.zadEvidenceId || evidenceTime(input.identityAsOf)>session.openMs)fail('MISSING_PRIOR_PANEL_OR_OWNER_EVIDENCE');
    const published=evidenceTime(c.publishedAt), prior=sessions.find(s=>s.closeMs<published&&s.date===c.priorSessionDate);
    if(!prior || published>=session.openMs || sessions.some(s=>s.openMs>published&&s.openMs<session.openMs) || c.firstTradableSessionOpen!==session.open || published<prior.closeMs)fail('FIRST_SESSION_OR_PRIOR_CLOSE_NOT_ESTABLISHED');
    // Evidence must cover the interval from the prior session through entry.
    if(sessions.indexOf(session)!==sessions.indexOf(prior)+1 || evidenceTime(c.marketCapAsOf)>prior.closeMs)fail('NONCONSECUTIVE_SESSION_OR_LATE_MARKET_CAP');
    const q=input.quote,qt=evidenceTime(q?.at),seen=evidenceTime(q?.observedAt);
    if(!q || q.securityId!==input.securityId || q.sizeUnits!=='SHARES' || !Number.isFinite(qt)||!Number.isFinite(seen)||seen<qt||seen>now||!Number.isFinite(q.sourceDelayMs)||q.sourceDelayMs<0||qt+q.sourceDelayMs>now)fail('QUOTE_AVAILABILITY_OR_IDENTITY_UNKNOWN');
    if(!Array.isArray(input.bars))fail('MISSING_BAR_EVIDENCE');
    for(const b of input.bars) {
      const end=evidenceTime(b.end),available=evidenceTime(b.availableAt);
      if(!Number.isFinite(evidenceTime(b.start))||!Number.isFinite(end)||!Number.isFinite(available)||available<end||available>now||b.securityId!==input.securityId||!positive(b.volume)||!positive(b.dollarVolume)||!positive(b.prior20SessionMedianVolume)||!b.priorVolumeEvidenceId)fail('BAR_AVAILABILITY_OR_PANEL_UNKNOWN');
    }
    const opening=input.bars[0];
    if(!opening || opening.volume/opening.prior20SessionMedianVolume<policy.minOpeningVolumeRatio)fail('OPENING_VOLUME_GATE_NOT_MET');
    if(now-evidenceTime(input.bars.at(-1).end)>policy.maxTriggerAgeMs)fail('TRIGGER_EXPIRED');
    return null;
  } catch(error) { return error.message; }
}
export function evaluateObservation(input,policy) {
  const frozen=freezeProposal(policy),reason=validationReason(input,policy);
  const result=reason?{status:'UNKNOWN',reason,actionable:false,realDollars:0}:assessReclaim(input,policy);
  return {schemaVersion:1,type:'OBSERVATION',observationId:input?.observationId||null,symbol:input?.symbol||null,securityId:input?.securityId||null,asOf:input?.asOf||null,policyHash:frozen.policyHash,inputHash:evidenceHash(input),result};
}
export function appendObservation(ledger,input,policy) {
  const frozen=freezeProposal(policy),event=evaluateObservation(input,policy);
  if(!event.observationId)fail('OBSERVATION_ID_REQUIRED');
  const old=ledger||{schemaVersion:1,status:'OFFLINE_RESEARCH_ONLY',allowBuy:false,policyHash:frozen.policyHash,events:[]};
  if(old.schemaVersion!==1||old.status!=='OFFLINE_RESEARCH_ONLY'||old.allowBuy!==false||old.policyHash!==frozen.policyHash||!Array.isArray(old.events))fail('LEDGER_POLICY_OR_SCHEMA_CONFLICT');
  let previous='GENESIS';
  for(const row of old.events){const {eventHash,...body}=row;if(body.previousHash!==previous||evidenceHash(body)!==eventHash)fail('LEDGER_INTEGRITY_FAILURE');previous=eventHash;}
  const existing=old.events.find(e=>e.observationId===event.observationId);
  if(existing){if(existing.inputHash!==event.inputHash)fail('OBSERVATION_ID_CONTENT_CONFLICT');return structuredClone(old);}
  const body={...event,previousHash:previous},row={...body,eventHash:evidenceHash(body)};
  return {...structuredClone(old),events:[...structuredClone(old.events),row]};
}
export function renderDecisionCard(event) {
  const clean=x=>String(x).replace(/[\r\n\x00-\x1f]/g,' ').slice(0,500);
  if(event.result.status!=='PAPER_SETUP_ONLY')return `${clean(event.symbol)}: ${clean(event.result.status)} — ${clean(event.result.reason)}. No live entry.`;
  const c=event.result.card;
  return [`${clean(event.symbol)} — RESEARCH / PAPER ONLY — $0 REAL`,c.reason,`Reference ask ${c.entryReferenceAsk}; ${c.paperShares} hypothetical shares. No fill established.`,`Entry expires ${c.expiry}.`,`Invalidation: ${c.invalidation}`,`Exit: ${c.exit}`,`Source ${clean(c.quoteSource)}, quote ${clean(c.quoteAt)}.`,`Commission $3 per side; spread included by ask/bid; slippage additional.`,`Policy ${event.policyHash}; evidence ${event.inputHash}.`,`NOT PROVEN. No automatic promotion.`].join('\n');
}
export function measurePaperExit(input,policy,exitEvidence) {
  const event=evaluateObservation(input,policy);
  const unresolved=reason=>({status:'UNRESOLVED',reason,allowBuy:false});
  if(event.result.status!=='PAPER_SETUP_ONLY')return unresolved('NO_VALID_PAPER_SETUP');
  try {
    const sessions=sessionsOf(input),entryIndex=sessions.findIndex(s=>s.open===input.sessionOpen),holding=sessions.slice(entryIndex,entryIndex+policy.maxHoldSessions);
    if(holding.length!==policy.maxHoldSessions) return unresolved('INCOMPLETE_HOLDING_CALENDAR');
    const asOf=evidenceTime(exitEvidence?.asOf);if(!Number.isFinite(asOf))return unresolved('INVALID_OUTCOME_CLOCK');
    const closes=exitEvidence?.sessionCloses;if(!Array.isArray(closes))return unresolved('MISSING_SESSION_CLOSES');
    const floor=input.bars[0].low;let target=holding.at(-1).closeMs,kind='MAX_SESSION_CLOSE';
    for(const s of holding){
      if(s.closeMs>asOf)return unresolved('HOLDING_PATH_NOT_YET_OBSERVABLE');
      const rows=closes.filter(c=>c.sessionDate===s.date);if(rows.length!==1)return unresolved('MISSING_OR_DUPLICATE_SESSION_CLOSE');
      const c=rows[0],at=evidenceTime(c.at),available=evidenceTime(c.availableAt);
      if(c.securityId!==input.securityId||!c.evidenceId||!positive(c.close)||at!==s.closeMs||!Number.isFinite(available)||available<at||available>asOf)return unresolved('INVALID_CLOSE_EVIDENCE');
      if(c.close<floor && s.closeMs<holding.at(-1).closeMs){const next=sessions[sessions.indexOf(s)+1];if(!next)return unresolved('MISSING_NEXT_EXIT_SESSION');target=next.openMs;kind='CLOSE_INVALIDATION_NEXT_OPEN';break;}
    }
    const q=exitEvidence.quote,t=evidenceTime(q?.at),seen=evidenceTime(q?.observedAt);
    const closeExit=kind==='MAX_SESSION_CLOSE';
    if(!q||q.securityId!==input.securityId||q.symbol!==input.symbol||q.sizeUnits!=='SHARES'||!q.source||!q.evidenceId||!positive(q.bid)||!positive(q.ask)||q.bid>q.ask||!positive(q.bidSize)||!Number.isFinite(t)||!Number.isFinite(seen)||seen<t||seen>asOf||t>asOf||!Number.isFinite(q.sourceDelayMs)||q.sourceDelayMs<0||t+q.sourceDelayMs>asOf)return unresolved('INVALID_EXIT_QUOTE');
    // Pre-close quote models an intended close execution, not an auction fill.
    if(closeExit?!(t>=target-policy.maxExitQuoteAgeMs&&t<target):!(t>=target&&t<=target+policy.maxExitQuoteAgeMs))return unresolved('EXIT_QUOTE_NOT_PAIRED_TO_RULE_CLOCK');
    const slip=policy.slippagePerSidePct/100,entry=input.quote.ask*(1+slip),exit=q.bid*(1-slip),budget=input.paperBudgetUsd,shares=Math.floor((budget-3)/entry);
    if(shares<1||input.quote.askSize<shares||q.bidSize<shares)return unresolved('INSUFFICIENT_DISPLAYED_EXECUTION_SIZE');
    const netUsd=shares*(exit-entry)-6;
    return {status:'MODELED_PAPER_ECONOMICS_ONLY',allowBuy:false,realDollars:0,policyHash:event.policyHash,inputHash:event.inputHash,exitEvidenceHash:evidenceHash(exitEvidence),exitKind:kind,ruleExitAt:new Date(target).toISOString(),shares,entryAsk:input.quote.ask,exitBid:q.bid,modeledEntry:entry,modeledExit:exit,commissionsUsd:6,netUsd,returnOnBudgetPct:netUsd/budget*100,uninvestedCashUsd:budget-shares*entry-3,limits:['Quote-based model, not actual fills','Cash-inclusive independent unit, not account return','Full failed/rejected cohort and matched controls still required','No proof or live BUY promotion']};
  }catch(error){return unresolved(error.message);}
}
