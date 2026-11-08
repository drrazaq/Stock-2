#!/usr/bin/env python3
"""Fixed authorized evidence only. No network, producer execution or archive discovery.
Run from any directory; stdout JSON is deterministic. Returns are saved-model diagnostics.
"""
import collections, datetime as dt, hashlib, json, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RECEIPT='docs/a-first-capture-continuation/feasibility-executed-20261107.json'
pins={}
def read(name, expected=None):
    b=(ROOT/name).read_bytes(); h=hashlib.sha256(b).hexdigest()
    if expected and h!=expected: raise ValueError('Pinned evidence changed: '+name)
    pins[name]={'sha256':h,'bytes':len(b)}
    return b.decode()
old=json.loads(read(RECEIPT)); rec=old['recommendationAudit']
# Original files opened solely for previously unused stress/method/control fields, not another archive search.
def original(name): return read(name,old['inputs'][name]['sha256'])
results=json.loads(original('data/ignition-results.json'))['done'].values()
stress={(x['d'],x['sym'],x['rule']):x.get('close_s') for x in results if x.get('rule')=='IG1'}
rows=[]
for x in rec['IG1']['rows']:
    if x['modeledCloseNet'] is not None:
        day,symbol,rule=x['candidateKey'].split('|'); rows.append(dict(x,day=day,symbol=symbol,stress=stress[(day,symbol,rule)]))
assert len(rows)==68 and all(isinstance(x['stress'],(int,float)) for x in rows)
values=[x['modeledCloseNet'] for x in rows]; total=sum(values)
def stats(xs):
    v=[r['modeledCloseNet'] for r in xs]; vs=[r['stress'] for r in xs]
    return {'n':len(v),'mean':statistics.mean(v),'median':statistics.median(v),'stressMean':statistics.mean(vs),'positiveCount':sum(z>0 for z in v)}
def grouped(field):
    groups=collections.defaultdict(list)
    for x in rows: groups[x[field]].append(x)
    output=[]
    for k,rr in sorted(groups.items()):
        remaining=[r for r in rows if r[field]!=k]
        output.append({'label':k,**stats(rr),'sumModeledUnitReturns':sum(x['modeledCloseNet'] for x in rr),
                       'withoutThisGroup':stats(remaining)})
    return output
ordered=sorted(rows,key=lambda x:(-x['modeledCloseNet'],x['candidateKey']))
ig={'evidenceClass':'SAVED_MINUTE_BAR_MODEL_ONLY_NOT_EXECUTABLE_PERFORMANCE','completeAuthenticChains':0,'incompleteAuthenticChains':102,
    'allScored':stats(rows),'dateGroups':grouped('day'),'symbolGroups':grouped('symbol'),
    'symbolGroupsAreNotVerifiedSecurityIDs':True,
    'topTwo':[{'candidateKey':x['candidateKey'],'modeledCloseNet':x['modeledCloseNet'],'stress':x['stress']} for x in ordered[:2]],
    'withoutBestTwo':stats(ordered[2:]),'topTwoShareOfSumModeledUnitReturns':sum(x['modeledCloseNet'] for x in ordered[:2])/total,
    'allLeaveOneDateMeansPositive':all(x['withoutThisGroup']['mean']>0 for x in grouped('day')),
    'allLeaveOneSymbolMeansPositive':all(x['withoutThisGroup']['mean']>0 for x in grouped('symbol')),
    'excludedOrUnscored':rec['IG1']['unscoredReasons'],
    'limitations':['Diagnostics on an already inspected cohort, not new variants or independent holdout tests.',
      'Sums/means are arithmetic across saved independent-unit percentages, never funded account returns.',
      '102 unique row links do not prove security identity, timely delivery, BBO execution, fees or controls.',
      '34 rejected/unpriced rows are not 34 missing executed trades; none is imputed zero or replaced.',
      'No t-test/p-value or resampled confidence interval: eight signal dates and unverified identities do not establish independent blocks.']}
s6=[json.loads(x) for x in original('data/squad6-paper.jsonl').splitlines() if x.strip()]
sig=[x for x in s6 if x['type']=='signal']; rr=[x for x in s6 if x['type']=='result']; rids={x['id'] for x in rr}
methods=[]
for method in sorted({x['m'] for x in sig}):
    ss=[x for x in sig if x['m']==method]; rs=[x for x in rr if x['m']==method]
    methods.append({'method':method,'signals':len(ss),'results':len(rs),'withoutResult':sum(x['id'] not in rids for x in ss)})
# The source establishes percentage-friction semantics; retained avgStock is not a new PIT universe replay.
read('squad6-lab.mjs',old['inputs']['squad6-lab.mjs']['sha256'])
squad={'evidenceClass':'SAVED_DAILY_MODEL_ONLY_NOT_EXECUTABLE_PERFORMANCE','methods':methods,
    'results':[{'id':x['id'],'net':x['net'],'savedAvgStock':x['avgStock'],'savedExcess':x['net']-x['avgStock'],'buy':x['buy'],'sell':x['sell']} for x in rr],
    'observedTailMean':statistics.mean(x['net'] for x in rr),
    'observedTailSavedExcessMean':statistics.mean(x['net']-x['avgStock'] for x in rr),
    'unresolvedSignals':len(sig)-len(rr),'matchedResults':len(rr),'observedResultFraction':len(rr)/len(sig),
    'conditionalMissing136MeanFor139MeanZero':-sum(x['net'] for x in rr)/(len(sig)-len(rr)),
    'conditionalSensitivityMeaning':'Only IF all 139 became comparable modeled closed trades; not an assumption that missing signals were entered, mature, lost or zero.',
    'cohortConclusion':'INCONCLUSIVE: all three retained results are same-day TD9 stop exits; there is no random-sampling basis for the missing 136. Saved avgStock is not the frozen CNBC/PIT comparator.'}
# Official NYSE calendar reconfirmed 2026-11-08. No October closures; Thanksgiving closed, Nov 27 closes at 13:00 NY.
def session(d): return d.weekday()<5 and d!=dt.date(2026,11,26)
dates=[dt.date(2026,10,1)+dt.timedelta(days=i) for i in range(80)]; dates=[d for d in dates if session(d)]
windows=[]
for i,d in enumerate(dates):
    if d>dt.date(2026,11,2): break
    end=dates[i+19]
    windows.append({'entry':str(d),'session20':str(end),'intendedExitNY':str(end)+('T13:00:00' if end==dt.date(2026,11,27) else 'T16:00:00'),'matureAsOf20261108':end<=dt.date(2026,11,6)})
calendar={'source':'https://www.nyse.com/trade/hours-calendars','sourceCheckedUTC':'2026-11-08','asOf':'2026-11-08',
    'kind':'POSSIBLE_CALENDAR_WINDOWS_NOT_OBSERVED_RECOMMENDATIONS','possiblePrimaryEntryWindows':windows,
    'sameStockCandidateOpens':[x['entry'] for x in windows[1:]],
    'maxPossibleSameStockCandidateOpens':len(windows)-1,
    'potentialPrimaryWindowsMature':sum(x['matureAsOf20261108'] for x in windows),
    'allSameStockCalendarWindowsOneConnectedOverlapComponent':True,
    'reason':'Successive 20-session windows overlap by 19 sessions; transitive connectivity is not statistical independence.',
    'latestPossibleSession20':windows[-1]['session20'],
    'limits':'Actual publication timestamps/episodes unknown. Before-open Oct1 publications could enter Oct1; typical evening publication is not assumed. Universe membership, emergency halts/closures and actual fills are not established by calendar arithmetic.'}
out={'kind':'EXECUTED_RECOMMENDATION_AUDIT_EXTENSION_V1','asOf':'2026-11-08','inputs':pins,'IG1':ig,'squad6':squad,'externalCalendar':calendar,
    'externalCorpus':{'authenticatedEpisodes':0,'totalEpisodeDenominator':None,'authenticatedMentions':0,'completeOutcomeChains':0,'primaryContrasts':None},
    'verdict':'LEGACY_MODEL_CONCENTRATION_AND_ATTRITION_REPORTED; AUTHENTIC_SYSTEM_AND_EXTERNAL_ECONOMICS_INCONCLUSIVE',
    'noAcquisition':True,'noOriginalChanged':True,'noProducerRun':True}
print(json.dumps(out,indent=2,sort_keys=True,allow_nan=False))
