"""Pinned selected-trade economic audit, not an unobserved fill or fresh account replay."""
from pathlib import Path
import collections,hashlib,json,math,statistics,subprocess
P=Path(__file__).parent;c=json.loads((P/'CONTRACT.json').read_text());raw={p:subprocess.check_output(['git','show',c['sourceRef']+':'+p]) for p in c['pins']}
for p,b in raw.items():
 if hashlib.sha256(b).hexdigest()!=c['pins'][p]:raise ValueError('pin changed '+p)
j=json.loads(raw['data/account-replay-pb12t20.json']);rows=[json.loads(x) for x in raw['data/account-replay-pb12t20-trades.jsonl'].decode().splitlines() if x.strip()]
def wilson(w,n):
 if not n:return None
 z=1.95996398454;p=w/n;den=1+z*z/n;mid=(p+z*z/(2*n))/den;delta=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
 return [mid-delta,mid+delta]
def summary(rs):
 vals=[r['pnl'] for r in rs];closed=[r for r in rs if r['closed']];v=[r['pnl'] for r in closed];w=sum(x>0 for x in v)
 return {'rows':len(rs),'closed':len(closed),'openAtEnd':len(rs)-len(closed),'closedWins':w,'closedWinRate':w/len(v) if v else None,'closedWilson95pct':wilson(w,len(v)),'closedPnlSum':sum(v),'openMarkedPnl':sum(r['pnl'] for r in rs if not r['closed']),'closedMeanDollars':statistics.mean(v) if v else None,'closedMedianDollars':statistics.median(v) if v else None,'closedLosses':sum(x<0 for x in v),'worstClosedDollars':min(v) if v else None,'withoutTwoBestClosedPnlSum':sum(sorted(v)[:-2]) if len(v)>2 else None,'pricedClosedTradePnlNotPortfolio':sum(vals),'referenceNotionalOverBudget':sum(r['entryCost']>1000+1e-8 for r in rs),'zeroShareRows':sum(r['shares']==0 for r in rs),'executedBuyFees':sum(r['shares']>0 for r in rs)*3,'executedSellFees':sum(r['shares']>0 and r['closed'] for r in rs)*3}
closedPrimary=[r for r in rows if r['replay']==c['primary'] and not r.get('open')]
originalChecks={'closedRowsAcrossOverlappingWindows':len(closedPrimary),'maxPaidRoundingDifference':max(abs(r['paid']-r['shares']*r['px0']*1.004) for r in closedPrimary),'maxProceedsRoundingDifference':max(abs(r['proceeds']-r['shares']*r['px1']*.996) for r in closedPrimary)}
if originalChecks['maxPaidRoundingDifference']>.00501 or originalChecks['maxProceedsRoundingDifference']>.00501:raise ValueError('original model cost mismatch')
windows={}
for window,original in j['results'][c['primary']].items():
 selected=[r for r in rows if r['replay']==c['primary'] and r['window']==window];unpriced=[r for r in selected if r.get('open') is True];priced=[r for r in selected if r.get('open') is not True];scenarios={};details={}
 for bps in [0,10,25,50]:
  for sizing in ['originalShares','feeReserved1000']:
   out=[];q=bps/10000
   for r in priced:
    closed=r.get('open') is not True;sh=r['shares'] if sizing=='originalShares' else min(r['shares'],math.floor((1000-3)/(r['px0']*(1+q))))
    paid=sh*r['px0']*(1+q)+(3 if sh else 0);proceeds=sh*r['px1']*(1-q if closed else 1)-(3 if sh and closed else 0)
    out.append({'symbol':r['sym'],'buy':r['buy'],'sell':r['sell'],'kind':r['kind'],'closed':closed,'shares':sh,'entryCost':paid,'pnl':proceeds-paid,'originalPnl':r['pnl'],'note':'Conditional original selected trades; no unselected signals or daily mark path replayed.'})
   key=f'{bps}bpsPerSide_{sizing}';scenarios[key]=summary(out);details[key]=out
 # Original closed / open classification explicitly reconciled with producer counts.
 rawClosed=[r for r in selected if r.get('open') is not True];originalClosed=original['account']['closedTrades']
 windows[window]={'original':original,'openRowsUnpricedAndUnrecomputed':unpriced,'retainedRows':len(selected),'closedKinds':dict(collections.Counter(r.get('kind','OPEN_UNPRICED') for r in selected)),'closedCountMatchesSummary':len(rawClosed)==originalClosed,'roundedOriginalClosedPnlSum':sum(r['pnl'] for r in rawClosed),'originalCommissionModel':'0.4percent each side primary, not3USD','fixedFeeSensitivities':scenarios,'details':details,'originalRecordedOrderSensitivity':j['orderSensitivity'].get(window)}
report={'contractCommit':'b70be4b09','sourceRef':c['sourceRef'],'inputSha256':c['pins'],'originalCostArithmeticChecks':originalChecks,'allRetainedRows':len(rows),'populationByReplayWindow':{str(k):v for k,v in collections.Counter((r['replay'],r['window']) for r in rows).items()},'windows':windows,'originalSignalReproductionCheck':j['check'],'hindsightHalalVariantExcluded':True,'noProductionOrProviderActions':True,'interpretation':['Compare windows separately: older/newer/full/olderFromFirstSignal overlap, not427 independent bets.','Fixed fee returns are conditional selected-trade accounting, not a cost-adjusted whole-account rerun. Original models, row order and capital allocation remain untouched.','Open rows retain only symbol/buy/open flag: shares, paid and final price are absent, so no independent open valuation or corrected whole-account end value is calculated.','Target modeled from daily high or substituted close and next open gaps; no bid/ask, displayed size, queue, halts or limit-fill proof.','Original price adjustment/action and point-in-time eligible universe/leader inputs need original snapshots, not current history reconstruction.','No original daily equity path in retained trade rows; cannot independently reproduce drawdown/time-in-market or year mark-to-market returns. Preserve original summary separately.','Alternative ordering is original seeded sensitivity, not new ranked picks. Todays halal marks are hindsight and never made historical.','Per-trade return/closed wins do not show viable1000USD total portfolio; original account starts3000 and has3 slots.'], 'terminal':'NOT PROVEN: original older6/9 wins below70pct preregistered requirement; conditional fixed-fee arithmetic does not override it. Exact executable account performance INCONCLUSIVE.'}
(P/'RESULTS.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allRows':len(rows),'primary':{w:{'kinds':r['closedKinds'],'countMatches':r['closedCountMatchesSummary'],'10bps':r['fixedFeeSensitivities']['10bpsPerSide_feeReserved1000']} for w,r in windows.items()}},indent=2))
