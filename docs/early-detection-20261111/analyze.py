"""Retained-only denominator and linkage audit. No provider calls, imports of trading code or private inputs."""
import collections,datetime,hashlib,json,subprocess
from pathlib import Path
REF='716b158307a9d09e5ac39b5f562a7f12245f604e'
P=Path(__file__).parent
inputs={}
def read(path):
 b=subprocess.check_output(['git','show',REF+':'+path]);inputs[path]={'gitBlob':subprocess.check_output(['git','rev-parse',REF+':'+path]).decode().strip(),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 return json.loads(b) if path.endswith('.json') else [json.loads(s) for s in b.decode().splitlines() if s.strip()]
def count(rows,key):return dict(sorted(collections.Counter(r.get(key,'MISSING') for r in rows).items()))
def minute(s):
 try:h,m=s.split(':');return int(h)*60+int(m)
 except:return None
def clock_bucket(s):
 m=minute(s)
 if m is None:return 'UNDATED_OR_UNPARSEABLE'
 if m<570:return 'PREMARKET_CLOCK'
 if m<960:return 'REGULAR_CLOCK'
 return 'POSTMARKET_CLOCK'
miss=read('data/ignition-missed-history.jsonl');days=read('data/ignition-days.jsonl');early=read('data/early-wave-obs.jsonl');old=read('data/missed-runners.json');events=read('data/catalyst-events.jsonl')
latest=[r for r in miss if r['d']>old['asOfDay']]
def summarize(rows):
 keys=collections.Counter((r['d'],r['sym']) for r in rows)
 return {'rows':len(rows),'uniqueDaySymbol':len(keys),'duplicateRowsBeyondDaySymbol':sum(v-1 for v in keys.values()),'sessions':sorted({r['d'] for r in rows}),'codes':count(rows,'code'),'clockBuckets':dict(collections.Counter(clock_bucket(r.get('firstSeen')) for r in rows)),'firstQuoteAgeMissing':sum(not isinstance(r.get('firstQuoteAgeMin'),(int,float)) for r in rows),'firstQuoteAgeOver3m':sum(isinstance(r.get('firstQuoteAgeMin'),(int,float)) and r['firstQuoteAgeMin']>3 for r in rows),'subsequentlyLiveRecorded':sum(bool(r.get('firstLive')) for r in rows),'subsequentlyLiveAfterOldFirstQuote':sum(isinstance(r.get('firstQuoteAgeMin'),(int,float)) and r['firstQuoteAgeMin']>3 and bool(r.get('firstLive')) for r in rows)}
# Retained top rows are a selected, capped set, not all n opportunities or matched controls.
early_rows=[dict(r,day=d['day']) for d in early for r in d['top']]
latest_early=[r for r in early_rows if r['day']>old['asOfDay']]
# Join only exact day/symbol; no forward filling a liquidity measure or class from another date.
eidx={(r['day'],r['sym']):r for r in early_rows}
liq=collections.Counter();ident=collections.Counter()
for r in latest:
 e=eidx.get((r['d'],r['sym']));liq['NO_SAME_DAY_EARLY_ROW' if not e else ('RV_LT1' if e.get('rv',0)<1 else 'RV_GE1')]+=1
 ident['NO_SECURITY_CLASS_EVIDENCE']+=1
byday={}
for d in sorted({r['day'] for r in days}):
 rs=[r for r in days if r['day']==d];byday[d]={'runRecords':len(rs),'firstMinute':[r.get('firstMinute') for r in rs],'minutes':[r.get('minutes') for r in rs],'moversCounts':[r.get('movers') for r in rs],'alerts':[r.get('alerts') for r in rs]}
newday=[r for r in days if r['day']>old['asOfDay']]
event_new=[r for r in events if str(r.get('publishedAt',''))[:10] in {x['d'] for x in latest}]
source_model=sum('not Stock-2 capture' in str(r.get('source','')) for r in events)
control=old['controls'];cs=control.get('list',[]);runners=old['runners']
results={'kind':'NEW_RETAINED_DENOMINATOR_AUDIT_NOT_RETURN_STUDY','ref':REF,'inputs':inputs,'staleSummary':{'asOf':old['asOfDay'],'generatedAt':old['generatedAt'],'watchedRecords':old['window'].get('watchedDays'),'uniqueWatchedDates':len(set(old['window'].get('days',[]))),'runnerN':runners.get('n'),'controlClaimedN':control.get('n'),'controlRetainedN':len(cs)},'allMissRecords':summarize(miss),'incrementBeyondSummary':summarize(latest),'dailyRunRecords':byday,'newDailyTallies':{r['day']:r.get('tally') for r in newday},'incrementLiquidityRelativeVolumeProxyOnly':dict(liq),'incrementIdentity':dict(ident),'earlyRows':{'retainedRows':len(early_rows),'newRetainedRows':len(latest_early),'newNonRunnersBelow15pct':sum(r.get('maxChange',0)<.15 for r in latest_early),'newAtLeast15pct':sum(r.get('maxChange',0)>=.15 for r in latest_early),'newAdvertisedPopulationCounts':{r['day']:r['n'] for r in early if r['day']>old['asOfDay']},'notMatchedControls':True},'catalystJoin':{'allRetainedEvents':len(events),'newSameDayEvents':len(event_new),'modeledDisseminationNotActualIngestion':source_model,'noNewExactPrimaryToPriceChains':not event_new},'verdict':'INCONCLUSIVE_FOR_EDGE_OR_FEED_DELAY; descriptive missing-observation audit completed','executionBlockers':['No original all-symbol per-poll response and requested universe: top rows cannot establish all-stock/liquidity/class detection probability.','firstQuoteAgeMin measures last trade age; no paired request/receipt/feed timestamp chain proves provider transport delay.','No same-day primary catalyst chain for the new sessions in catalyst-events; older modeled acceptance+60sec is not bot capture.','No stable security-class/corporate-action mapping on each new missed row; symbols do not prove common-stock eligibility.','Relative volume is a proxy, not dollar liquidity, BBO, displayed size or executable fill evidence.','15:00 endpoint does not cover 15:00–16:00 New York; regular-clock label alone does not prove continuous observation.','No untouched matched nonrunner/control execution paths for these new sessions. $1000 whole shares and $3 each executed side cannot be scored from maxUp/last snapshots.']}
(P/'results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({k:results[k] for k in ['staleSummary','incrementBeyondSummary','earlyRows','catalystJoin','incrementLiquidityRelativeVolumeProxyOnly']},indent=2))
