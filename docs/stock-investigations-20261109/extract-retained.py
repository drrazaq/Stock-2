"""Read existing Git blobs only. No providers, network, holdings or credentials."""
from pathlib import Path
import subprocess,json,hashlib,math
from decimal import Decimal,ROUND_FLOOR
BASE='3ebf21b53e7986ce0482c579278d98895f9d8703'
OUT=Path(__file__).resolve().parent
SYMS=['GRMN','TIGO','ETON','KNSA','CEG','BE']
inputs={}
def read(name):
 b=subprocess.check_output(['git','show',BASE+':data/'+name]);inputs['data/'+name]={'gitCommit':BASE,'sha256':hashlib.sha256(b).hexdigest()};return json.loads(b)
S=read('signals.json');D=read('discovery.json');H=read('horizons.json');Q=read('quality.json');E=read('earnings-recent.json');Z=read('zad-list.json');ES=read('earnings-study.json')
rows=[]
for sym in SYMS:
 st=next((x for x in S['stocks']if x['sym']==sym),None);pe=next((x for x in S['pead']if x['sym']==sym),None);lead=next((x for x in D['candidates']if x['sym']==sym),None)
 p=Decimal(str(st['last'])) if st else None;q=int((Decimal(1000)-Decimal(3))/p) if p else 0;n=p*q if p else None
 cost={'label':'Reference-price arithmetic ONLY; not executable/current sizing or a proposed order','budgetUsd':1000,'feeEachExecutedSideUsd':3,'referenceShares':q,'referenceNotionalUsd':float(n)if n is not None else None,'entryFeePlusNotionalUsd':float(n+3)if n is not None else None,'idleCashAfterEntryUsd':float(1000-n-3)if n is not None else None,'roundTripCommissionUsd':6 if q else 0,'roundTripCommissionPctOfNotional':float(Decimal(600)/n)if n else None,'actualQuantitySpreadSlippageFillAndNetResult':'UNKNOWN'}
 rows.append({'symbol':sym,'scanner':st,'earningsDrift':pe,'discovery':lead,'horizonSetups':[k for k,v in H['today'].items()if sym in v],'qualityRank':Q.get('rank',{}).get(sym),'recentReports':[x for x in E['reports']if x['sym']==sym],'zad':{'affirmativeCurrentStatus':'UNKNOWN','publicUpdateEffective':Z.get('effective'),'inPublicChangeLists':{k:sym in Z.get(k,[])for k in ['notHalal','halalAgain','newHalal']},'absenceDoesNotEstablishEligibility':True,'finalAuthority':'ZAD'},'costReference':cost})
result={'sourceCommit':BASE,'pricesSession':S['session'],'signalsGeneratedAt':S['generatedAt'],'sourceQuoteTimestamp':'NOT STORED in these rows','currentBBO':'UNKNOWN; no quote acquired','quickCandidates':len(S['quick']),'leadersCandidates':len(S['leaders']),'shortRecordedPortfolio':S['quickRecord'],'discoveryGeneratedAt':D['generatedAt'],'horizonsGeneratedAt':H['generatedAt'],'qualityGeneratedAt':Q['generatedAt'],'earningsFullVerdict':ES['verdict'],'earningsRule':ES['rule'],'inputFingerprints':inputs,'rows':rows,'noStrategyOrGateChanged':True,'noAuthenticExecutionPerformanceInferred':True}
(OUT/'retained-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
print('Extracted6 retained stock packets; zero network/provider calls; no private holdings/trades exported.')
