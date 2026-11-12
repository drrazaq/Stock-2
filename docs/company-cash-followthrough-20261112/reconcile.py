"""Public-primary cash arithmetic, no fetch, rule creation or economic backtest."""
import json,hashlib
from pathlib import Path
from decimal import Decimal as D
root=Path(__file__).resolve().parent;p=root/'knsa-inputs.json';d=json.loads(p.read_text());out={}
assert d['sources']['nineMonths']['periodEnd']=='2026-09-30' and d['sources']['sixMonths']['periodEnd']=='2026-06-30'
for year in ['2026','2025']:
 n,s=d['nineMonths'][year],d['sixMonths'][year];q={k:n[k]-s[k] for k in ['netIncome','cfo','capexCashOutflow','sbc']};assert q['netIncome']==d['separatelyReportedQuarterNetIncome'][year]
 q['cfoLessCashCapex']=q['cfo']-q['capexCashOutflow'];q['cfoLessCashCapexLessSbcSensitivity']=q['cfoLessCashCapex']-q['sbc'];q['cfoToNetIncomePct']=float(D(q['cfo'])/D(q['netIncome'])*100);q['sbcAsPctOfCfo']=float(D(q['sbc'])/D(q['cfo'])*100);out[year]=q
n,s=d['nineMonths']['2026'],d['sixMonths']['2026'];cash={k:n[k]-s[k] for k in ['cfo','netInvesting','netFinancing','netCashChange']};assert cash['cfo']+cash['netInvesting']+cash['netFinancing']==cash['netCashChange']==n['endingCash']-s['endingCash']
r={'status':'BUSINESS_CASH_GAP_RESOLVED_BY_NEW_PRIMARY_READING_NOT_ENTRY_OR_RETURN_PROOF','inputSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'derivedQuarter':out,'quarterCashReconciliation':cash,'cfoGrowthPct':float((D(out['2026']['cfo'])/D(out['2025']['cfo'])-1)*100),'cfoLessCapexGrowthPct':float((D(out['2026']['cfoLessCashCapex'])/D(out['2025']['cfoLessCashCapex'])-1)*100),'method':'As-filed nine months minus as-filed six months; derived, not separately reported Q3 cash statement; cross-filing restatement/classification bridge not independently authenticated','currentExecutablePerformance':'INCONCLUSIVE_NO_IDENTITY_BOUND_BBO_FILL_OR_EXPECTATION_CHAIN','entryExitRule':'NO_NEW_RULE_OR_NUMERIC_STOP_CREATED','independentReview':'REQUESTED_SEPARATELY'}
(root/'results.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
