// HISTORY-03 B01/D15: counters describe retained observations, never current BUY approval.
// This view does not alter limits, message reservations, frozen scoring, or historical rows.
export function alertDeliveryCounts(triggers=[], legacyTotal=null) {
 const out={version:1,scope:'RETAINED_TRIGGER_OBSERVATIONS',ruleQualified:{recorded:0,sent:0,unsent:0,uncertain:0},earlyPaper:{recorded:0,sent:0,unsent:0,uncertain:0},legacyUnclassified:null,conflicts:0,invalidRecords:0};
 const events=new Map();
 for(const t of triggers){if(!t||!['RULE_QUALIFIED','EARLY_PAPER'].includes(t.deliveryKind))continue;
  if(typeof t.d!=='string'||!/^\d{4}-\d\d-\d\d$/.test(t.d)||typeof t.sym!=='string'||!t.sym||typeof t.rule!=='string'||!t.rule||!Number.isInteger(t.m)||t.m<0||t.m>=1440){out.invalidRecords++;continue;}
  const id=JSON.stringify([t.d,t.sym,t.rule,t.m]);const x={kind:t.deliveryKind,state:t.deliveryState||'UNCERTAIN'},old=events.get(id);
  if(!old)events.set(id,x);else if(old.kind!==x.kind||old.state!==x.state){events.set(id,{kind:old.kind,state:'CONFLICT'});out.conflicts++;}
 }
 for(const x of events.values()){const row=x.kind==='EARLY_PAPER'?out.earlyPaper:out.ruleQualified;row.recorded++;if(x.state==='ACKNOWLEDGED')row.sent++;else if(x.state==='UNSENT')row.unsent++;else row.uncertain++;}
 const known=out.ruleQualified.sent+out.earlyPaper.sent;
 if(Number.isSafeInteger(legacyTotal)&&legacyTotal>=0){out.legacyUnclassified=Math.max(0,legacyTotal-known);out.legacyCountMismatch=known>legacyTotal;}
 return out;
}
export function alertDeliveryLines(snapshot={}) {
 const c=snapshot.alertCounts,n=v=>Number.isSafeInteger(v)&&v>=0;
 const valid=r=>r&&['recorded','sent','unsent','uncertain'].every(k=>n(r[k]))&&r.sent+r.unsent+r.uncertain===r.recorded;
 if(c?.version!==1||c.scope!=='RETAINED_TRIGGER_OBSERVATIONS'||!valid(c.ruleQualified)||!valid(c.earlyPaper)||!(c.legacyUnclassified===null||n(c.legacyUnclassified)))return ['Legacy unsplit total: '+(n(snapshot.alerts)?snapshot.alerts:'unknown')+' watcher messages reported; rule-qualified/paper and delivery-state breakdown UNKNOWN.'];
 const line=(label,r)=>label+': '+r.recorded+' recorded, '+r.sent+' sent (acknowledged), '+r.unsent+' unsent, '+r.uncertain+' uncertain.';
 return [line('HISTORY/PAPER-GATE QUALIFIED',c.ruleQualified),line('EARLY PAPER ALERTS (NOT PROVEN)',c.earlyPaper),
  'Scope: retained trigger observations; '+(c.legacyUnclassified===null?'legacy delivery total unknown':c.legacyUnclassified+' legacy deliveries unclassified')+(c.legacyCountMismatch?'; legacy counter mismatch':'')+'. These are delivery records, not current purchase or ZAD approval.'];
}
