#!/usr/bin/env python3
"""Rejection-gate diagnostics on the existing fixed 102 IG1 keys and local retained Git objects only.
No fetching, market requests, rule changes, new bars or producer execution.
"""
import collections, hashlib, json, math, statistics, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
P='docs/a-first-capture-continuation/feasibility-executed-20261107.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,stderr=subprocess.DEVNULL)
raw=(ROOT/P).read_bytes();old=json.loads(raw);rows=old['recommendationAudit']['IG1']['rows'];by={r['candidateKey']:r for r in rows}
# Fixed existing file history identified by the new rejected-outcome recovery lead. No broad search or new remote reads.
commits=['894c6e9148735ba0403988df2cdf574901b00d47','ed057c2dbc8cbd1e579e1690cd0e56b8cced31ac','ef54233782cfaedfcbe1be61c382e78da202a336','bba35ca0de33742c73b69d593ccfeca8756678f1','5e951289899b34753a0aa3b87fd3875aa4dd3aec','d710db7e5a2f8bfcff84aa4aa124f3cc4e1d2a6f','b77eac39b7cbdc652458b48256ed6731d728ed24','b752c5bc3f68510d9d5f6aa51fe7d12939d5a86e','2d6ccb92a8b2438c4aaf04eaa454e8dbf1548e4f','2018f6ead6d55b534f674d55717d5f83bbee9ccb','f9faf2de346db86efcdd1a379d9520576ce136ab','ac7398bb844e8711d480d4aed660d88a955afc3e','d1213696833f442d26e29f08a966db3e05c3e4b5','311a65fce7037a131b97aa9eaee82da98f6ea016','b810f700a45ae223e4f81d70a7aad97b01af110a','43b018188f1972c99bd85dfa8c47c52920c8dde7','623177534f53fbb8424241ac288921f86058f766']
versions=[];found=collections.defaultdict(list);archive={}
for c in commits:
    b=git('show',c+':data/ignition-results.json');j=json.loads(b);archive[c]=j['done'];versions.append({'commit':c,'blob':git('rev-parse',c+':data/ignition-results.json').decode().strip(),'bytes':len(b),'sha256':sha(b)})
    for key,r in j['done'].items():
        if key in by and by[key]['modeledCloseNet'] is None and isinstance(r.get('close'),(int,float)):
            found[key].append({'commit':c,'close':r['close'],'stress':r.get('close_s'),'rowSha256':sha(json.dumps(r,sort_keys=True,separators=(',',':')).encode())})
recovered=[]
for key,v in sorted(found.items()):
    latest=v[0];recovered.append({'candidateKey':key,'currentReason':by[key]['reason'],'signalPriceAgeMinutes':by[key]['signalPriceAgeMinutes'],'latestNumeric':latest,'distinctNumericPairs':sorted({(x['close'],x['stress']) for x in v}),'retainedNumericVersions':len(v)})
assert len(recovered)==21 and all(str(r['currentReason']).startswith('stale signal') for r in recovered)
assert all(len(r['distinctNumericPairs'])==1 for r in recovered)
def kind(r):return 'scored' if r['modeledCloseNet'] is not None else 'stale_label' if str(r['reason']).startswith('stale signal') else 'no_fill_label' if str(r['reason']).startswith('no fill') else 'no_bars_label'
def fresh(r):
    a=r['signalPriceAgeMinutes'];return isinstance(a,(int,float)) and math.isfinite(a) and 0<=a<=3
ct=collections.Counter(('age_pass' if fresh(r) else 'age_fail',kind(r)) for r in rows)
def stats(v):return {'n':len(v),'mean':statistics.mean(v),'sumOfIndependentUnitReturns':sum(v),'wins':sum(x>0 for x in v),'losses':sum(x<0 for x in v)}
rvalues=[r['latestNumeric']['close'] for r in recovered];stresses=[r['latestNumeric']['stress'] for r in recovered]
source='d1213696833f442d26e29f08a966db3e05c3e4b5';snap=archive[source];keep=[r for k,r in snap.items() if k in by and by[k]['modeledCloseNet'] is not None and isinstance(r.get('close'),(int,float))];excluded=[r for k,r in snap.items() if k in found and isinstance(r.get('close'),(int,float))]
assert len(keep)==30 and len(excluded)==21
assert all(snap[k]['close']==r['modeledCloseNet'] for k,r in by.items() if k in snap and isinstance(snap[k].get('close'),(int,float)) and r['modeledCloseNet'] is not None)
comparison={}
for label,field in [('base','close'),('stress','close_s')]:
    a=[r[field] for r in keep];b=[r[field] for r in excluded];n=len(a)+len(b)
    comparison[label]={'retained30Mean':statistics.mean(a),'rejected21Mean':statistics.mean(b),'all51UngatedMean':statistics.mean(a+b),'conditionalMeanDifference':statistics.mean(a)-statistics.mean(a+b),'fixed51GatedMeanWith21RuleNoOrdersCashZero':sum(a)/n,'fixed51ModelDifference':-sum(b)/n}
dateDiagnostic=[]
for day in sorted({r['d'] for r in excluded}):
    a=[r['close'] for r in keep if r['d']==day];b=[r['close'] for r in excluded if r['d']==day]
    dateDiagnostic.append({'date':day,'retainedN':len(a),'rejectedN':len(b),'retainedMean':statistics.mean(a),'rejectedMean':statistics.mean(b),'ungatedMean':statistics.mean(a+b),'fixedAttemptCashGateEffect':-sum(b)/(len(a)+len(b))})
coreOld=git('rev-parse',source+':ignition-core.mjs').decode().strip();coreCurrent=git('rev-parse','HEAD:ignition-core.mjs').decode().strip();assert coreOld==coreCurrent
producer=git('show',source+':fastmover-lab.mjs').decode();assert 'nx[1] > t.price * 1.03' in producer and 'costOf: igCost' in producer
unrecovered=[r['candidateKey'] for r in rows if kind(r)=='stale_label' and r['candidateKey'] not in found]
out={'kind':'EXECUTED_FIXED_COHORT_REJECTION_GATE_DIAGNOSTICS_V1','asOf':'2026-11-08','fixedCohort':102,'pinnedReceipt':{'path':P,'sha256':sha(raw)},'historyVersions':versions,
    'crossTab':[{'agePredicate':k[0],'savedDisposition':k[1],'n':v} for k,v in sorted(ct.items())],
    'agePredicateFail':sum(not fresh(r) for r in rows),'savedStaleLabels':23,'overlapAgeFailAndNoFill':8,'uniqueRejectedOrUnpriced':34,
    'recoveredRejectedRows':recovered,'rejected21Base':stats(rvalues),'rejected21Stress':stats(stresses),'unrecoveredStaleKeys':unrecovered,
    'missingTwoMeanForAll23ZeroBase':-sum(rvalues)/2,'missingTwoMeanForAll23ZeroStress':-sum(stresses)/2,
    'sameSnapshotPairedModel':{'source':source,'retainedScored':30,'rejectedScored':21,'currentRetainedValuesIdentical':True,'coreBlobIdentical':coreOld,'producerBlob':git('rev-parse',source+':fastmover-lab.mjs').decode().strip(),'literalThreePercentLimitPresent':True,'comparisons':comparison,'allRecoveredDateDiagnostics':dateDiagnostic},
    'gateVerdicts':{'freshness':'HELPED_RECOVERABLE_SAVED_MODEL_SUBSET; FULL_23_AND_AUTHENTIC_ECONOMIC_EFFECT_INCONCLUSIVE','literalThreePercent':'INCONCLUSIVE_ECONOMIC_EFFECT: 10 no-fill labels, eight also fail freshness; no scored counterfactuals retained for these ten. Never relax limit.','noBars':'DATA_UNAVAILABLE_NOT_ECONOMIC_REJECTION','otherGates':'NO_CASE_COMPLETE_COUNTERFACTUAL: the fixed signal rows do not contain complete halted/dilution/compliance/instrument/halal gate decisions or rejected-case paths.'},
    'interpretation':['21 rejected rows contain 17 modeled losses and four modeled wins: the gate did not perfectly select outcomes.',
      'Paired51 is the recoverable pre-purge subset of the fixed102, not a new strategy, full102 experiment, funded account or authentic executable result.',
      'The same-snapshot ungated and gated arithmetic uses saved minute-bar percentage friction, not $3 whole-share/BBO execution.',
      'Freshness rejection protects valid known-then evidence; invalid/stale entries are not made tradable by their hypothetical subsequent gain.',
      'Two missing stale outcomes can reverse the 23-row model sign; no finite upper bound supplied, no zero imputation.',
      'A no-fill label conflates price above limit with absent next bar in the producer; raw bar/quote originals are needed to separate these ten cases.',
      'The gate had eight overlaps with no-fill; reporting only exclusive saved reasons would undercount age predicate failures.',
      'No attribution of historical public recommendation delivery, actual operator orders or filled shares is possible.'],
    'noAcquisition':True,'noRulesChanged':True,'noOriginalChanged':True}
print(json.dumps(out,indent=2,sort_keys=True,allow_nan=False))
