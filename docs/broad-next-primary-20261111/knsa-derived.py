"""Offline arithmetic over the accepted period-bound extraction; no download or trading rule."""
import json,sys,hashlib
from decimal import Decimal as D
from pathlib import Path
p=Path(sys.argv[1]);source=json.loads(p.read_text());d=source['KNSA-issuer-release']
assert d['sha256']=='df7c1d0bc2fcffb153f051ccd326b7ce00a7515d9695ca820c13a3b9c1a2b934'
rows={x['label']:x['periodValues'] for x in d['checks']}
r=rows['Product revenue, net'];n=rows['Net income'];s=rows['Weighted average ordinary shares outstanding—basic']
a,b=D(r['Q3_2026']),D(r['Q3_2025']);na,nb=D(n['Q3_2026']),D(n['Q3_2025']);sa,sb=D(s['Q3_2026']),D(s['Q3_2025'])
def out(x):return float(round(x,6))
result={'scope':'RETAINED_BUSINESS_ARITHMETIC_NOT_STRATEGY_OR_EXECUTABLE_PERFORMANCE','periods':['Q3_2026','Q3_2025'],'originalSha256':d['sha256'],'extractionSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'revenueGrowthPct':out((a/b-1)*100),'basicWeightedShareGrowthPct':out((sa/sb-1)*100),'revenuePerBasicWeightedShareGrowthPct':out(((a/sa)/(b/sb)-1)*100),'netMarginPct':[out(na/a*100),out(nb/b*100)],'netMarginChangePercentagePoints':out((na/a-nb/b)*100),'netIncomeGrowthPct':out((na/nb-1)*100),'netIncomePerBasicWeightedShareGrowthPct':out(((na/sa)/(nb/sb)-1)*100),'quarterlyCashConversion':'UNSCORABLE_CFO_STATEMENT_NOT_RETAINED','marketExpectationSurprise':'UNSCORABLE_CONTEMPORANEOUS_EXPECTATIONS_NOT_RETAINED','currentExecution':'UNSCORABLE_CURRENT_IDENTITY_BOUND_BBO_NOT_RETAINED','zad':'EXISTING_PRIVATE_OWNER_STATUS_NOT_REPUBLISHED','decision':'INVESTIGATE_CASH_REALIZATION_NOT_ENTRY_APPROVAL'}
print(json.dumps(result,indent=2))
