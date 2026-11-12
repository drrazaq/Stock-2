// Development-only research presentation. No rule adoption, trading gate or side effect.
import {createHash} from 'node:crypto';
const text=(x,n=220)=>typeof x==='string'?x.replace(/[\r\n]+/g,' ').slice(0,n):'';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function researchRuleAssessment(record){
 if(!record||typeof record!=='object')return {state:'NO_RESEARCH_RULE',label:'No research rule supplied',actionAuthority:false};
 // An external ID or a legacy verdict does not authenticate the rule definition.
 const d=record.definition,identified=typeof record.id==='string'&&record.id.length>0&&d&&typeof d==='object'&&!Array.isArray(d)&&typeof d.entry==='string'&&d.entry.trim()&&typeof d.exit==='string'&&d.exit.trim()&&d.parameters&&typeof d.parameters==='object'&&!Array.isArray(d.parameters);
 const version=identified?digest(canonical(d)):null;
 const matches=identified&&record.version===version;
 const state=!identified?'UNKEYED_RESEARCH_RULE':!matches?'RULE_VERSION_UNVERIFIED':/^(?:tested:\s*)?(?:rejected|failed(?: discovery)?|stop)(?:$|[\s(_;:-])/i.test(typeof record.verdict==='string'?record.verdict.trim():'')?'FAILED_RESEARCH_RULE':record.adopted!==true?'UNADOPTED_RESEARCH_RULE':'UNPROVEN_RESEARCH_RULE';
 return {state,ruleId:identified?record.id:null,ruleVersion:matches?version:null,label:state+'; rule NOT PROVEN',actionAuthority:false,entry:matches?text(d.entry):null,exit:matches?text(d.exit):null,holdSessions:matches&&Number.isInteger(d.holdSessions)&&d.holdSessions>0?d.holdSessions:null,verdict:matches?text(record.verdict):'UNKNOWN',note:'Research evidence only; adoption and live gates remain with the existing caller'};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
export function researchRuleVersion(definition){return digest(canonical(definition));}
export function conciseResearchDecision({symbol,record,asOf,now=Date.now(),existingExit}={}){
 const rule=researchRuleAssessment(record),at=Date.parse(asOf||''),validClock=typeof asOf==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(asOf)&&Number.isFinite(at)&&Number.isFinite(now)&&at<=now;
 // Only preserve an explicitly supplied, still-valid existing holding exit. Never derive a sell from research.
 const e=existingExit,until=Date.parse(e?.expiresAt||''),observed=Date.parse(e?.evidenceAt||'');
 const sell=validClock&&e?.authority==='EXISTING_HOLDING_EXIT'&&e?.symbol===symbol&&e?.status==='SELL'&&typeof e.reason==='string'&&e.reason.trim()&&typeof e.condition==='string'&&e.condition.trim()&&Number.isFinite(observed)&&observed<=at&&Number.isFinite(until)&&until>now&&positive(e.quantity)&&Number.isInteger(e.quantity);
 const status=sell?'SELL':rule.state==='FAILED_RESEARCH_RULE'?'NO BUY':'WAIT';
 return {symbol:text(symbol,16)||'UNKNOWN',status,asOf:validClock?asOf:null,expiresAt:sell?e.expiresAt:null,entry:null,quantity:sell?e.quantity:null,exit:sell?text(e.condition):null,horizon:sell?text(e.horizon):rule.holdSessions?rule.holdSessions+' research sessions; not adopted':null,costs:'$3 each executed side; spread/slippage additional; $1,000 whole-share research reference',reason:sell?text(e.reason):!validClock?'Assessment clock UNKNOWN; no action supported':rule.state==='FAILED_RESEARCH_RULE'?'Exact research rule failed; no entry authority':rule.state==='NO_RESEARCH_RULE'?'No adopted entry/exit evidence supplied':rule.label,ruleState:rule.state,zad:'UNKNOWN; existing owner ZAD evidence remains authoritative',buyAuthority:false,details:'check '+(text(symbol,16)||'UNKNOWN')};
}
export function conciseResearchDecisionText(input){const r=conciseResearchDecision(input);return [r.status+' '+r.symbol,r.quantity?'quantity '+r.quantity:null,r.exit?'exit '+r.exit:null,'as of '+(r.asOf||'UNKNOWN')+(r.expiresAt?'; expires '+r.expiresAt:'; action expiry not established'),r.horizon,r.costs,r.reason,'ZAD '+r.zad,'Details: '+r.details].filter(Boolean).join(' | ');}
