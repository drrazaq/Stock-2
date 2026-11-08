#!/usr/bin/env python3
"""Read-only RA-C1 reconciliation calculations. No acquisition or strategy producer.
Preserves saved terminal rows; synthetic interval examples are explicitly labelled.
"""
import hashlib,json,statistics,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];pins={}
def read(p,expected=None):
 b=(ROOT/p).read_bytes();h=hashlib.sha256(b).hexdigest()
 if expected and h!=expected:raise ValueError('Pinned input changed: '+p)
 pins[p]={'bytes':len(b),'sha256':h};return json.loads(b)
old=read('docs/a-first-capture-continuation/feasibility-executed-20261107.json')
for name in ['CLAUDE.md','yardstick.mjs','ignition-core.mjs','squad6-core.mjs','zad-compliance.mjs']:
 b=(ROOT/name).read_bytes();pins[name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
paperName='data/ignition-paper.jsonl';paperBytes=(ROOT/paperName).read_bytes();assert hashlib.sha256(paperBytes).hexdigest()==old['inputs'][paperName]['sha256'];pins[paperName]={'bytes':len(paperBytes),'sha256':hashlib.sha256(paperBytes).hexdigest()};paper=[json.loads(z) for z in paperBytes.decode().splitlines() if z.strip()];paper=[z for z in paper if z.get('rule')=='IG1'];assert len(paper)==102
a=read('docs/recommendation-audit-20261108/results.json');g=read('docs/recommendation-audit-20261108/rejection-gates-results.json')
s=read('data/squad6-lab.json',old['inputs']['data/squad6-lab.json']['sha256']);league=read('data/agent-league.json')
gone=[r for r in s['trades']['SQ6-MTUM'] if r['kind']=='gone']
# Gross cap is 3; saved IG1 gross = saved base net + friction <= net + .021.
values=[r['modeledCloseNet'] for r in old['recommendationAudit']['IG1']['rows'] if r['modeledCloseNet'] is not None]
assert max(values)+.021<3
known=[r['latestNumeric']['close'] for r in g['recoveredRejectedRows']];ks=[r['latestNumeric']['stress'] for r in g['recoveredRejectedRows']]
bounds={}
for name,v,cost in [('base',known,.021),('stress',ks,.0315)]:
 lo=-1-cost;hi=3 # hi deliberately loose: costs would make attainable net smaller
 low=v+[lo,lo];high=v+[hi,hi]
 bounds[name]={'knownRows':len(v),'unknownRows':2,'perUnknownConservativeLower':lo,'perUnknownConservativeUpper':hi,'all23MeanLower':statistics.mean(low),'all23MeanUpper':statistics.mean(high),'all23RemoveBestTwoMeanLower':statistics.mean(sorted(low)[:-2]),'all23RemoveBestTwoMeanUpper':statistics.mean(sorted(high)[:-2]),'meanSignRobust':False,'removeTwoBestUpperBelowZero':statistics.mean(sorted(high)[:-2])<0,'kind':'LEGACY_MODEL_ONLY_CAPPED_SENSITIVITY_NOT_AN_EXECUTABLE_RESULT'}
# Old near-date calendar indexed in sessions. Candidate u = 1..22, treatment t=0..22, each length20.
geometry=[]
for t in range(23):
 us=[u for u in range(1,23) if u+19<t or u>t+19]
 geometry.append({'possibleTreatmentEntry':a['externalCalendar']['possiblePrimaryEntryWindows'][t]['entry'],'disjointNearDateCandidatesBeforeSourceExclusions':len(us)})
cluster={'signalDateGroups':len(a['IG1']['dateGroups']),'attemptWeightedMean':statistics.mean(values),'meanOfDateMeans':statistics.mean(r['mean'] for r in a['IG1']['dateGroups']),'dateMeansPositive':sum(r['mean']>0 for r in a['IG1']['dateGroups']),'stressMeanOfDateMeans':statistics.mean(r['stressMean'] for r in a['IG1']['dateGroups']),'stressDateMeansPositive':sum(r['stressMean']>0 for r in a['IG1']['dateGroups']),'episodeClusters':None,'controlExcessClusters':None,'limit':'Saved IG1 net values only. Episode IDs and matched controls absent. Date-weighted summary is secondary, never a replacement primary.'}
# Illustrative diagonal-endpoint error: both diagonal excesses positive while valid cross-arm extremes span zero.
T=(-1,3);C=(-1.01,2.99)
example={'kind':'SYNTHETIC_INTERVAL_COUNTEREXAMPLE_NOT_MARKET_DATA','treatment':T,'control':C,'uniformBothLowExcess':T[0]-C[0],'uniformBothHighExcess':T[1]-C[1],'validExcessLower':T[0]-C[1],'validExcessUpper':T[1]-C[0]}
out={'kind':'EXECUTED_RA_C1_RECONCILIATION_ANALYSIS','review':'d9ebfa4e676fb8f5ac4cbbd1546c506b371f2f16','inputs':pins,'symmetricCap':{'retained68RowsAffected':0,'savedNetMax':max(values),'maxGrossUpperBoundUsingLargestExistingFriction':max(values)+.021,'originalValuesPreserved':True},'rejected23Bounds':bounds,'oldNearDateGeometry':geometry,'oldPotentialTreatmentDatesWithZeroDisjointCandidates':sum(r['disjointNearDateCandidatesBeforeSourceExclusions']==0 for r in geometry),'newLookback':{'entrySessionOffsetsInclusive':[-270,-21],'candidateOpens':250,'latestControlSession20Offset':-2,'requiresYearOfMentionAbsence':False,'actualNewControlReturns':None},'dateClusters':cluster,'zeroOrderDiagnostic':{'recordedIG1ReferencePrices':len(paper),'maximumRecordedReferencePrice':max(z['price'] for z in paper),'referencePricesAbove997':sum(z['price']>997 for z in paper),'upperModeledEntryUsingThreePercentCapAndTwoPercentEntryStress':max(z['price'] for z in paper)*1.03*1.02,'legacyScored68ZeroSharesUnderThoseAssumptions':0,'actualExecutableQuantities':None,'externalAndComparatorZeroOrderCounts':None,'limitation':'Reference/assumed bar-fill arithmetic, not actual quotes or filled quantities; no unavailable external universe is assigned zero.'},'terminalRows':{'source':'data/squad6-lab.json trades.SQ6-MTUM','retainedEndpointRows':len(s['trades']['SQ6-MTUM']),'goneRows':len(gone),'rawRowsPreserved':gone,'savedNetMean':statistics.mean(r['net'] for r in gone),'savedPositive':sum(r['net']>0 for r in gone),'savedNegative':sum(r['net']<0 for r in gone),'actualLiquidationOrCashRecoveryVerified':False,'classification':'GONE_IS_ENGINE_LAST_CLOSE_MODEL_NOT_DOCUMENTED_DELISTING_RECOVERY','zeroReplacementPerformed':False},'crossArmBoundsExample':example,'multiplicity':{'snapshotGeneratedAt':league['generatedAt'],'snapshotTrials':league['trials'],'snapshotLuckBar':league['bar'],'newResearchAuditEntries':1,'snapshotPlusThisAuditLowerBound':league['trials']+1,'currentGlobalTotal':None,'productionRegistryChanged':False},'externalAuthenticResults':0,'noAcquisition':True,'noOriginalChanged':True}
print(json.dumps(out,indent=2,sort_keys=True,allow_nan=False))
