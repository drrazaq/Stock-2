// Inactive independent-capture contract; this module never acquires data.
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const clock=s=>{const n=evidenceTime(s);need(Number.isFinite(n),'COVERAGE_CLOCK_INVALID');return n;};
const iso=n=>new Date(n).toISOString();
export function aCoveragePlan(input,policy){
 const holding=input.calendar.sessions.filter(s=>clock(s.open)>=clock(input.sessionOpen)).slice(0,policy.maxHoldSessions);
 need(holding.length===policy.maxHoldSessions,'INCOMPLETE_HOLDING_CALENDAR');
 const slots=[];
 for(let i=0;i<holding.length;i++){
  const s=holding[i];
  slots.push({id:'CLOSE_'+s.date,type:'CLOSE',start:s.close,end:i+1<holding.length?holding[i+1].open:iso(clock(s.close)+policy.maxExitQuoteAgeMs),atStartInclusive:true,atEndInclusive:true});
  if(i>0)slots.push({id:'OPEN_BBO_'+s.date,type:'BBO',start:s.open,end:iso(clock(s.open)+policy.maxExitQuoteAgeMs),atStartInclusive:true,atEndInclusive:true});
 }
 const last=holding.at(-1);slots.push({id:'FINAL_CLOSE_BBO_'+last.date,type:'BBO',start:iso(clock(last.close)-policy.maxExitQuoteAgeMs),end:last.close,atStartInclusive:true,atEndInclusive:false});
 return {schema:1,kind:'A_ALL_POSSIBLE_RULE_EXIT_WINDOWS_V1',inputHash:evidenceHash(input),policyHash:evidenceHash(policy),securityId:input.securityId,slots};
}
function belongs(event,slot){const t=clock(event.record.at),s=clock(slot.start),e=clock(slot.end);return event.type===slot.type&&t>=s&&(slot.atEndInclusive?t<=e:t<e);}
export function verifyIndependentCoverage({input,policy,tape,reference,contract,read,signedOriginal}){
 const plan=aCoveragePlan(input,policy),planHash=evidenceHash(plan);
 need(reference,'INDEPENDENT_COVERAGE_REQUIRED');
 const {body,bytes}=signedOriginal(reference,'WITNESS',contract,read,input.securityId);
 let witness;try{witness=JSON.parse(bytes);}catch{throw Error('COVERAGE_ORIGINAL_INVALID');}
 need(witness.schema===1&&witness.planHash===planHash&&witness.securityId===input.securityId&&witness.inputHash===evidenceHash(input)&&witness.policyHash===evidenceHash(policy)&&witness.complete===true,'COVERAGE_CONTEXT_OR_COMPLETENESS_UNKNOWN');
 need(Array.isArray(witness.frames)&&witness.frames.length===plan.slots.length,'COVERAGE_SLOT_MISSING_OR_DUPLICATE');
 need(clock(body.recordedAt)>=Math.max(...plan.slots.map(s=>clock(s.end))),'COVERAGE_SEAL_EARLY');
 const seen=new Set(),records=[],sourceIds=new Set();
 for(const frame of witness.frames){
  const slot=plan.slots.find(s=>s.id===frame.slotId);
  need(slot&&!seen.has(slot.id),'COVERAGE_SLOT_MISSING_OR_DUPLICATE');seen.add(slot.id);
  need(frame.start===slot.start&&frame.end===slot.end&&frame.status==='COMPLETE'&&frame.transportComplete===true&&frame.nextPage===null,'COVERAGE_GAP_OR_PARTIAL_RESPONSE');
  need(clock(frame.receivedAt)>=clock(slot.end)&&clock(frame.receivedAt)<=clock(body.recordedAt),'COVERAGE_RECEIPT_INVALID');
  let original;try{original=JSON.parse(read(frame.original));}catch{throw Error('COVERAGE_ORIGINAL_INVALID');}
  need(original.schema==='A_INDEPENDENT_FRAME_V1'&&original.planHash===planHash&&original.slotId===slot.id&&original.securityId===input.securityId&&Array.isArray(original.events)&&original.events.length===frame.recordCount&&original.events.length<=10000,'COVERAGE_ORIGINAL_CONTEXT');
  for(const event of original.events){
   need(event.record?.securityId===input.securityId&&belongs(event,slot),'COVERAGE_EVENT_OUTSIDE_SCOPE');
   const seenAt=clock(event.type==='CLOSE'?event.record.availableAt:event.record.observedAt);need(seenAt>=clock(event.record.at)&&seenAt<=clock(frame.receivedAt)&&seenAt<=clock(slot.end),'INDEPENDENT_RECEIPT_LATE');
   const id=event.type+':'+event.record.evidenceId;need(typeof event.record.evidenceId==='string'&&!sourceIds.has(id),'COVERAGE_REVISION_OR_DUPLICATE');sourceIds.add(id);records.push({type:event.type,record:event.record});
   need(records.length<=10000,'COVERAGE_EVENT_CAP');
  }
 }
 // Compare the FULL independently retained event set, never merely a chosen quote/digest.
 const actual=tape.events.map(e=>({type:e.type,record:e.record}));
 need(actual.every(e=>plan.slots.filter(s=>belongs(e,s)).length===1),'UNREGISTERED_OUTCOME_EVENT');
 const native=e=>{const {observedAt,availableAt,...record}=e.record;return {type:e.type,record};};
 const hashes=a=>a.map(e=>evidenceHash(native(e))).sort();
 need(evidenceHash(hashes(actual))===evidenceHash(hashes(records)),'INDEPENDENT_CAPTURE_SET_MISMATCH');
 return {status:'MATCHED_INDEPENDENT_CAPTURE_UNDER_SUPPLIED_TRUST',planHash,slots:seen.size,records:records.length,witnessHash:reference.sha256,collectorId:body.collectorId,limitations:'Physical independence, actual acquisition and provider completeness require external provenance; signatures alone are insufficient'};
}
