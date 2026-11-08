"""Offline descriptive extension; no selection, acquisition or changed scoring arm.
Run from repository root. Original contract, cases and four views are read-only.
"""
import hashlib
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent / 'retained-diagnostics.json'
RA = Path(__file__).resolve().parent / 'analysis.json'
PB = ROOT / 'data/squad11-lab.json'
assert hashlib.sha256(RA.read_bytes()).hexdigest() == 'e846ad00b7522cc8508f7df692336b93610d435b9445bcefb40d598ec1135f9e'
assert hashlib.sha256(PB.read_bytes()).hexdigest() == '77e49a4b263a694112f5e26b40b4419fe6f82cd462a5865b0726067261defd1a'

def mean_interval(values):
    return [statistics.mean(x[i] for x in values) for i in (0, 1)]

def interval(row, multiplier, slip):
    e = row['views']['legacy_base']['effectiveEntryUpperBound'] * (1 + slip)
    invested = [max(0, 997-e), 997]
    returns = [(1+g)*(1-slip)/(1+slip)-1-multiplier*row['inferredOriginalFriction']
               for g in row['grossReturnInterval']]
    corners = [(i*r-6)/1000 for i in invested for r in returns]
    return [min(corners), max(corners)]

def summarize(rows, view):
    values = [r['views'][view]['fixedBudgetWholeShareNetInterval'] for r in rows]
    return dict(n=len(rows), mean=mean_interval(values),
                definitelyPositive=sum(lo>0 for lo,hi in values),
                definitelyNegative=sum(hi<0 for lo,hi in values),
                crossesZero=sum(lo<=0<=hi for lo,hi in values))

def headroom(rows, multiplier):
    # Prove every corner is decreasing over [0,.02], so bisection is justified.
    bounds=[]
    for r in rows:
        e=r['views']['legacy_base']['effectiveEntryUpperBound']
        for g in r['grossReturnInterval']:
            assert g>-1 and 997-e*1.02>0
            n2=(1+g)*.98/1.02-1-multiplier*r['inferredOriginalFriction']
            upper=e*max(0,-n2)-(997-e*1.02)*2*(1+g)/(1.02**2)
            assert upper<0
            bounds.append(upper)
    def f(s, side):
        return statistics.mean(interval(r,multiplier,s)[side] for r in rows)
    roots=[]
    for side in (0,1):
        if f(0,side)<=0:
            roots.append(None)
            continue
        assert f(.02,side)<0
        lo,hi=0,.02
        for _ in range(70):
            mid=(lo+hi)/2
            if f(mid,side)>0: lo=mid
            else: hi=mid
        roots.append((lo+hi)/2)
    return dict(extraPerSideBreakEvenInterval=roots,
                maximumCornerDerivativeUpperBound=max(bounds),
                interpretation='Saved fixed-path cost sensitivity only; not a fifth scoring arm or executable fill estimate.')

j=json.loads(RA.read_text()); rows=j['caseRows']
views={'legacy_base':(1,0),'legacy_existing_stress':(1.5,0),
       'legacy_plus_2pct_each_way':(1,.02),
       'legacy_existing_stress_plus_2pct_each_way':(1.5,.02)}
errors=[]
for r in rows:
    for v,(m,s) in views.items():
        errors.extend(abs(a-b) for a,b in zip(interval(r,m,s),r['views'][v]['fixedBudgetWholeShareNetInterval']))
assert len(rows)==89 and max(errors)<1e-12
retained=[r for r in rows if r['group']=='RETAINED68']
rejected=[r for r in rows if r['group']=='REJECTED21']
matched=[r for r in retained if r['candidateKey'][:10]<='2026-10-21']
later=[r for r in retained if r['candidateKey'][:10]>'2026-10-21']
assert (len(retained),len(rejected),len(matched),len(later))==(68,21,30,38)
audit={}
for v in views:
    lost=[r for r in rejected if r['views'][v]['fixedBudgetWholeShareNetInterval'][1]<0]
    won=[r for r in rejected if r['views'][v]['fixedBudgetWholeShareNetInterval'][0]>0]
    uncertain=[r for r in rejected if r not in lost and r not in won]
    avoided=[sum(-r['views'][v]['fixedBudgetWholeShareNetInterval'][1-i] for r in lost)/51 for i in (0,1)]
    forgone=[sum(r['views'][v]['fixedBudgetWholeShareNetInterval'][i] for r in won)/51 for i in (0,1)]
    net=[sum(-r['views'][v]['fixedBudgetWholeShareNetInterval'][1-i] for r in rejected)/51 for i in (0,1)]
    # Direct paired effect cancels common retained rows; canonical interval unchanged.
    expected=j['summary'][v]['matched51GateEffectWithRejectedUnitsCash']
    assert max(abs(net[i]-expected[k]) for i,k in enumerate(('lower','upper')))<1e-12
    audit[v]=dict(retained68=summarize(retained,v), matchedRetained30=summarize(matched,v),
                  complementaryLater38=summarize(later,v), rejected21=summarize(rejected,v),
                  avoidedLossContribution=avoided,forgoneWinnerContribution=forgone,
                  uncertainRejected=len(uncertain),pairedGateEffectFixed51=net,
                  canonicalConservativeGateEffectUnchanged=j['summary'][v]['matched51GateEffectWithRejectedUnitsCash'])

pb=json.loads(PB.read_text()); recovery={}
for name in ('SQ11-PB8','SQ11-PB12'):
    rs=pb['trades'][name]; controls={}
    for control in ('sameStock','fixedDate','avgStock','spy'):
        pairs=[(r['net'],r[control]) for r in rs
               if isinstance(r.get(control),(int,float)) and math.isfinite(r[control])]
        delta=[a-b for a,b in pairs]
        controls[control]=dict(n=len(pairs),missing=len(rs)-len(pairs),
                              meanDifference=statistics.mean(delta),medianDifference=statistics.median(delta),
                              beat=sum(x>0 for x in delta),tie=sum(x==0 for x in delta),lose=sum(x<0 for x in delta))
    recovery[name]=dict(n=len(rs),meanStoredNet=statistics.mean(r['net'] for r in rs),
                        medianStoredNet=statistics.median(r['net'] for r in rs),
                        goneRows=[r for r in rs if r['kind']=='gone'],pairedControls=controls,
                        basis='Current saved arrays, not frozen firstRun. net/stock controls subtract original COST; SPY is raw. No executable prices/whole-share fees recovered.')

result=dict(kind='EXISTING_EVIDENCE_DESCRIPTIVE_DIAGNOSTICS',
            inputs={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (RA,PB)},
            intervalReproduction=dict(cases=89,views=4,maxAbsoluteError=max(errors)),
            recommendation=audit,retained68CostHeadroom={k:headroom(retained,m) for k,m in [('base',1),('existingStress',1.5)]},
            recovery=recovery,
            disclosureArithmetic=dict(bloomContractedFractionOfUpperHeadline=1.2/2.8,
                bloomUncontractedUpperDifferenceGW=2.8-1.2,
                bloomMaximumConditionalWarrantExerciseCashUSD=3531073*113.28,
                constellationInvestmentLowerBoundPerUprateMWUSD=4300000000/890),
            limits=['No new authentic outcome chains; all 102 original attempts remain incomplete.',
                    'No unknown/no-fill outcome imputation, new filters, p-values, optimized dates or changed exits.',
                    'Dollar fees and original friction remain as approved; roots are fixed-path diagnostics only.',
                    'Primary-disclosure arithmetic is not trading performance, probability, margin or realized financing.'])
OUT.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
