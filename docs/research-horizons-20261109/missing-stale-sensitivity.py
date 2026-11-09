"""New missing-outcome accounting on the existing four-view model; no new scores."""
from pathlib import Path
from decimal import Decimal, getcontext
import hashlib,json
getcontext().prec=35
ROOT=Path(__file__).resolve().parents[2]
INPUT=ROOT/'docs/recommendation-audit-20261108/ra-c2/final/retained-diagnostics.json'
EXPECTED='55f5a6b486370ebbf55af96d2308f26c510b5f6d38554d5d425399846909e647'
b=INPUT.read_bytes()
assert hashlib.sha256(b).hexdigest()==EXPECTED
j=json.loads(b,parse_float=Decimal)
rows={}
for view, v in j['recommendation'].items():
    n=v['rejected21']['n']; assert n==21
    lo,hi=v['rejected21']['mean'];assert lo<=hi<0
    # The two unobserved rows remain symbolic; no imputation or invented price.
    known_sum=[Decimal(n)*lo,Decimal(n)*hi]
    threshold=[-known_sum[1]/2,-known_sum[0]/2]
    # 53 is ONLY the declared extension of the fixed30+21 comparison by these
    # two stale labels, not all102 or all31age failures (8overlap no-fill).
    effect_intercept=[-known_sum[1]/53,-known_sum[0]/53]
    rows[view]={'knownRejects':21,'missingStaleLabels':2,
      'knownNetReturnSum':list(map(str,known_sum)),
      'requiredMissingPairMeanNetReturnForFull23Zero':list(map(str,threshold)),
      'requiredMeanPct':list(map(lambda x:str(x*100),threshold)),
      'fixed53GateEffectAtSymbolicMissingMeanM':{
          'interceptInterval':list(map(str,effect_intercept)),
          'minusCoefficientTimesM':str(Decimal(2)/53)}}
result={'kind':'MISSING_STALE_WHOLE_SHARE_SENSITIVITY_NOT_NEW_ARM',
 'input':str(INPUT.relative_to(ROOT)),'sha256':EXPECTED,
 'missingIds':['2026-10-22|MACIU|IG1','2026-10-22|XCUR|IG1'],
 'unitUSD':1000,'feePerExecutedSideUSD':3,
 'viewsUnchanged':True,'missingRowsImputed':False,'ruleChanges':False,
 'interpretation':'If the unknown pair mean is below the lower threshold, rejecting all23 helps this extended model; above the upper threshold it harms; between depends on retained intervals. No feasible return bound excludes either result. This is not full102 or all31age-fail effect, executable performance, new trading threshold or fill claim.',
 'views':rows,'terminal':'FULL23_AND_AUTHENTIC_GATE_EFFECT_INCONCLUSIVE'}
Path(__file__).with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v['requiredMeanPct'] for k,v in rows.items()},indent=2))
