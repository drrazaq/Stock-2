#!/usr/bin/env python3
"""Fixed retained-model analysis: exact review corrections, no acquisition or new study producers.
Extra slippage is cost-only on unchanged saved paths, not stop-path resimulation or actual fills.
"""
import hashlib,json,statistics
from decimal import Decimal as D, getcontext
from pathlib import Path
getcontext().prec=36
ROOT=Path(__file__).resolve().parents[1];pins={}
def read(p,lines=False,expected=None):
 b=(ROOT/p).read_bytes();h=hashlib.sha256(b).hexdigest()
 if expected and h!=expected:raise ValueError('Pinned evidence changed: '+p)
 pins[p]={'bytes':len(b),'sha256':h}
 return [json.loads(x) for x in b.decode().splitlines() if x.strip()] if lines else json.loads(b)
old=read('docs/a-first-capture-continuation/feasibility-executed-20261107.json');gate=read('docs/recommendation-audit-20261108/rejection-gates-results.json')
res=read('data/ignition-results.json',expected=old['inputs']['data/ignition-results.json']['sha256'])['done'];paper=read('data/ignition-paper.jsonl',lines=True,expected=old['inputs']['data/ignition-paper.jsonl']['sha256']);paper={r['d']+'|'+r['sym']+'|'+r['rule']:r for r in paper if r.get('rule')=='IG1'}
for p in ['ignition-core.mjs','ignition-paper.mjs','squad25-core.mjs','yardstick.mjs','zad-compliance.mjs']:
 b=(ROOT/p).read_bytes();pins[p]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
by={r['candidateKey']:r for r in old['recommendationAudit']['IG1']['rows']};records=[]
for k,r in by.items():
 if r['modeledCloseNet'] is not None:records.append((k,res[k]['close'],res[k]['close_s'],'RETAINED68'))
for r in gate['recoveredRejectedRows']:
 v=r['latestNumeric'];records.append((r['candidateKey'],v['close'],v['stress'],'REJECTED21'))
views=[('legacy_base',D(1),D(0)),('legacy_existing_stress',D('1.5'),D(0)),('legacy_plus_2pct_each_way',D(1),D('.02')),('legacy_existing_stress_plus_2pct_each_way',D('1.5'),D('.02'))]
rows=[]
for key,b,s,group in records:
 b,s=D(str(b)),D(str(s));costs=[c for c in [D('.012'),D('.014'),D('.021')] if abs((b-s)-c/2)<=D('.0001')];assert len(costs)==1,(key,b,s,costs)
 c=costs[0];lo=max(b+c-D('.00005'),s+D('1.5')*c-D('.00005'));hi=min(b+c+D('.00005'),s+D('1.5')*c+D('.00005'));assert lo<=hi,(key,lo,hi)
 record={'candidateKey':key,'group':group,'sourceSignalSha256':by[key]['signalRowSha256'],'inferredOriginalFriction':float(c),'grossReturnInterval':[float(lo),float(hi)],'views':{}}
 for name,m,slip in views:
  ratio=(1-slip)/(1+slip);nl=(1+lo)*ratio-1-m*c;nu=(1+hi)*ratio-1-m*c
  emax=D(str(paper[key]['price']))*D('1.03')*(1+slip);imin=max(D(0),D(997)-emax);imax=D(997);assert emax<D(997)
  corners=[(i*n-D(6))/1000 for i in [imin,imax] for n in [nl,nu]]
  record['views'][name]={'percentageModelNetInterval':[float(nl),float(nu)],'effectiveEntryUpperBound':float(emax),'investedNotionalInterval':[float(imin),float(imax)],'fixedBudgetWholeShareNetInterval':[float(min(corners)),float(max(corners))]}
 rows.append(record)
def means(rr,name,field):
 return {'n':len(rr),'lower':statistics.mean(r['views'][name][field][0] for r in rr),'upper':statistics.mean(r['views'][name][field][1] for r in rr)}
summary={}
for name,_,_ in views:
 kept=[r for r in rows if r['group']=='RETAINED68'];rej=[r for r in rows if r['group']=='REJECTED21'];matched=[r for r in kept if r['candidateKey'].split('|')[0]<='2026-10-21'];assert len(matched)==30
 jl=[r['views'][name]['fixedBudgetWholeShareNetInterval'][0] for r in rej];ju=[r['views'][name]['fixedBudgetWholeShareNetInterval'][1] for r in rej]
 summary[name]={'retained68PercentageCostOnly':means(kept,name,'percentageModelNetInterval'),'retained68HypotheticalWholeShareFixedFee':means(kept,name,'fixedBudgetWholeShareNetInterval'),'rejected21HypotheticalWholeShareFixedFee':means(rej,name,'fixedBudgetWholeShareNetInterval'),'matched51UngatedHypotheticalWholeShareFixedFee':means(matched+rej,name,'fixedBudgetWholeShareNetInterval'),'matched51GateEffectWithRejectedUnitsCash':{'lower':-sum(ju)/51,'upper':-sum(jl)/51,'fixedDenominator':51},'matched51GatedHypotheticalMean':{'lower':sum(r['views'][name]['fixedBudgetWholeShareNetInterval'][0] for r in matched)/51,'upper':sum(r['views'][name]['fixedBudgetWholeShareNetInterval'][1] for r in matched)/51}}
known=[r['modeledCloseNet'] for r in by.values() if r['modeledCloseNet'] is not None];rej=[r['latestNumeric']['close'] for r in gate['recoveredRejectedRows']]
unseen={'kind':'ARITHMETIC_NOT_AN_OBSERVED_ATTEMPT','hypotheticalAdditionalNetWinner':2.9,'retained68RemoveBestTwo':statistics.mean(sorted(known)[:-2]),'withOneUnseenCappedWinnerRemoveBestTwo':statistics.mean(sorted(known+[2.9])[:-2]),'fixed23UpperRemoveBestTwo':statistics.mean(sorted(rej+[3,3])[:-2]),'withOneAdditionalUnseenCappedWinnerUpperRemoveBestTwo':statistics.mean(sorted(rej+[3,3,2.9])[:-2]),'meaning':'Subset failures do not establish a full-population STOP without complete source/attempt denominator or a proved bound on unseen attempts.'}
out={'kind':'EXECUTED_RA_C2_FINAL_COST_AND_DENOMINATOR_ANALYSIS','asOf':'2026-11-08','inputs':pins,'caseRows':rows,'summary':summary,'unknownDenominatorSensitivity':unseen,'entryModelBasis':'IG1 simulate enters the next-minute open; saved guard requires it <=1.03*recorded signal reference. All89 recovered/scored modeled rows have positive quantities under the inferred upper entry. No actual fill/quantity inferred.','roundingTreatment':'Intersect base+cost and stress+1.5cost intervals of +/-0.00005. Retain bounds; no invented exact gross/entry price.','notionalProof':'q=floor(997/E) implies 997-E < qE <=997. With E<=Emax, relaxed notional interval [997-Emax,997] is conservative. Enumerate interval corners and subtract $6 on each modeled completed trade.','evidenceClass':'CONDITIONAL_SAVED_PATH_COST_RECONSTRUCTION_NOT_AUTHENTIC_EXECUTABLE_PERFORMANCE','limits':['All views preserve each original inferred legacy friction tier. They are NOT recomputations of the new CNBC 0.8%/1.2% contract or its controls.','Extra2% is applied to unchanged saved entry/exit price ratio; stops/targets are not resimulated without bars.','Whole-share intervals are conservative bounds, not exact reconstructed quantities, broker fills or funded-account return.','Freshness gain is only the recoverable matched51 subset. Two recorded stale cases and any unobserved source attempts remain unresolved.','No source extraction, providers, keys, original changes or production actions.'],'externalCorpusComplete':False,'externalAttemptCountBound':None,'externalDecision':'INCONCLUSIVE_ALL_VIEWS','newAuthenticChains':0}
print(json.dumps(out,indent=2,sort_keys=True,allow_nan=False))
