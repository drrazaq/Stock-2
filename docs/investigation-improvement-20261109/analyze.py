"""Offline arithmetic and provenance diagnostic; no network or producer execution."""
from pathlib import Path
from datetime import datetime, timedelta
import hashlib, json, subprocess

HERE = Path(__file__).resolve().parent
I = json.loads((HERE / 'inputs.json').read_text())
OLD = HERE.parent / 'stock-investigations-20261109/retained-evidence.json'
R = json.loads(OLD.read_text())
P = I['primary']
prices = {r['symbol']: r['scanner']['last'] for r in R['rows']}
growth = lambda pair: 100 * (pair[0] / pair[1] - 1)
def discovery_period(day):
    lagged = datetime.fromisoformat(day) - timedelta(days=75)
    quarter = (lagged.month - 1) // 3
    return f'CY{lagged.year if quarter else lagged.year-1}Q{quarter or 4}'

g, e, k, c, b = (P[s] for s in ['GRMN','ETON','KNSA','CEG','BE'])
result = {
 'kind': 'RETAINED_REFERENCE_AND_PRIMARY_DISCLOSURE_DIAGNOSTIC_NOT_PERFORMANCE',
 'inputSha256': hashlib.sha256((HERE/'inputs.json').read_bytes()).hexdigest(),
 'retainedPacketSha256': hashlib.sha256(OLD.read_bytes()).hexdigest(),
 'GRMN': {
  'refundPctOfReportedOperatingIncomeIncrease': 100*g['tariffRefundM']/(g['operatingIncomeM']-g['priorOperatingIncomeM']),
  'referencePriceOverFullYearProFormaGuidance': prices['GRMN']/g['proFormaGuidanceEps'],
  'caution':'Refund contribution is arithmetic, not a company earnings bridge or normalized forecast.'},
 'ETON': {
  'taxBenefitPctOfGaapNetIncome':100*e['taxBenefitM']/e['netIncomeM'],
  'debtCarryingAmountM':sum(e['debtCarryingM']),
  'quarterlyBasicWeightedShareGrowthPct':growth(e['basicWeightedShares']),
  'quarterlyDilutedWeightedShareGrowthPct':growth(e['dilutedWeightedShares']),
  'caution':'Loss-to-profit makes diluted/basic comparison effects material; not all new share issuance.'},
 'KNSA': {
  'quarterlyBasicWeightedShareGrowthPct':growth(k['basicWeightedShares']),
  'quarterlyDilutedWeightedShareGrowthPct':growth(k['dilutedWeightedShares']),
  'discoveryPeriodByDate':{d:discovery_period(d) for d in ['2026-11-07','2026-11-09','2026-12-14','2026-12-15']},
  'caution':'Quarterly weighted averages do not replace the existing annual >10% block; original annual source values missing.'},
 'CEG': {
  'referencePriceOverCurrentFullYearAdjustedGuidanceRange':sorted(prices['CEG']/x for x in c['fullYearAdjustedGuidance']),
  'caution':'Uses Nov6 reference price and Nov9 disclosure. Ex-post assessment arithmetic, never a Nov6 known-then multiple/current price/target.'},
 'BE': {
  'receivablePlusContractAssetCashUseM':b['q3ReceivableCashUseM']+b['q3ContractAssetCashUseM'],
  'operatingCashMinusCapexM':b['q3OperatingCashFlowM']-b['q3CapexM'],
  'caution':'Cash absorption can reflect growth/timing; not proof of bad receivables or a realized financing shortfall.'},
 'evaluation':{'newHypothesesScored':0,'authenticExecutableReturnsComputed':0,'reason':'No eligible PIT original fact/expectation join and full execution/control denominator; selected six cases are development illustrations.'}
}
(HERE/'results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
