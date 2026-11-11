"""Offline frozen-row audit. Git objects only; no model runner/network/provider calls."""
from pathlib import Path
import subprocess,json,hashlib,statistics,math,collections,gzip
P=Path(__file__).resolve().parent
FROZEN='e9ad49ae13cd5302a8fae5ae41d687865deea3f4'; PRE='9e27afd92d9ea6a16615819a5e5267ffdfc72129'
def raw(ref,path):return subprocess.check_output(['git','show',ref+':'+path])
def mean(a):return statistics.mean(a) if a else None
def tstat(a):return mean(a)/(statistics.stdev(a)/math.sqrt(len(a))) if len(a)>1 and statistics.stdev(a)>0 else None
def grouped(a,key,value):
 d=collections.defaultdict(list)
 for r in a:
  v=value(r)
  if v is not None:d[key(r)].append(v)
 return {k:mean(v) for k,v in d.items()}
def stats(a):
 vals=[r['net'] for r in a];n=len(a);sort=sorted(vals,reverse=True);top=math.ceil(n*.05);by=grouped(a,lambda r:r['d'],lambda r:r['net']-r['avgStock']-.008);byfair=grouped(a,lambda r:r['d'],lambda r:r['net']-r['avgStock']);own=grouped(a,lambda r:r['d'],lambda r:None if r['sameStock'] is None else r['net']-r['sameStock']);sym=collections.defaultdict(list)
 for r in a:sym[r['s']].append(r['net'])
 return {'n':n,'days':len(by),'stocks':len(sym),'meanNet008':mean(vals),'medianNet008':statistics.median(vals),'meanNet012':mean(vals)-.004,'win':sum(v>0 for v in vals)/n,'losses':sum(v<0 for v in vals),'zero':sum(v==0 for v in vals),'lossesBelow50Pct':sum(v<-.5 for v in vals),'best':max(vals),'worst':min(vals),'removeTop2Mean':mean(sort[2:]),'top5PctN':top,'top5PctContributionToSignedSum':sum(sort[:top])/sum(vals),'remaining95PctMean':mean(sort[top:]),'matchedAvgStockTradeWeightedNet':mean([r['avgStock'] for r in a]),'tradeWeightedCommonCostEdge':mean([r['net']-r['avgStock'] for r in a]),'frozenConservativeDayEdge':mean(list(by.values())),'frozenDayTReproduced':tstat(list(by.values())),'commonCostDayEdge':mean(list(byfair.values())),'commonCostDayT':tstat(list(byfair.values())),'sameStockDayEdge':mean(list(own.values())),'sameStockCoveredDays':len(own),'topContributors':[{'symbol':s,'n':len(v),'sumModeledNet':sum(v),'mean':mean(v)} for s,v in sorted(sym.items(),key=lambda z:sum(z[1]),reverse=True)[:10]],'allRowNetWith2PctEachWayPlus008Mean':mean([(1+r['net']+.008)*.98/1.02-1-.008 for r in a]),'allRowNetWith2PctEachWayPlus012Mean':mean([(1+r['net']+.008)*.98/1.02-1-.012 for r in a])}
j=json.loads(raw(FROZEN,'data/value-lab.json'));fr=j['firstRun']['B-FCFN1'];rows=j['trades']['B-FCFN1'];split=fr['split'];halves={'older':[r for r in rows if r['d']<split],'newer':[r for r in rows if r['d']>=split],'all':rows};result={h:stats(a) for h,a in halves.items()}
for h in ['older','newer','all']:
 for k,fk in [('meanNet008','avg'),('medianNet008','median'),('meanNet012','avgStress'),('removeTop2Mean','noTop2'),('frozenConservativeDayEdge','edge')]:assert abs(result[h][k]-fr['results'][h][fk])<=.00011,(h,k)
 assert round(result[h]['frozenDayTReproduced'],2)==fr['results'][h]['tDay']
years={y:stats([r for r in rows if r['d'].startswith(y)]) for y in sorted({r['d'][:4] for r in rows})}
# Exact arithmetic on SYNTHETIC reference-price grids. These are not actual fills
# or estimates of this strategy's executable performance. No entry price is retained.
grid=[]
for px in [5,25,100,500,1000]:
 for slip in [.004,.006,.02]:
  q=math.floor(997/(px*(1+slip)))
  for h in ['older','newer']:
   pnl=[q*px*((1+r['net']+.008)*(1-slip)-(1+slip))-6 for r in halves[h]] if q else []
   grid.append({'half':h,'SYNTHETIC_unchangedReferenceEntryPrice':px,'assumedAdverseFractionEachSide':slip,'wholeShares':q,'entryCashWithFee':q*px*(1+slip)+3 if q else 0,'modeledMeanPnlDollars':mean(pnl),'modeledMeanReturnOn1000':mean(pnl)/1000 if pnl else None,'filledRows':len(pnl),'notTradedIfUnaffordable':q==0,'notActualExecutionOrEstimatedPriceDistribution':True})
# Historical ZAD is never backfilled from current classifications.
sh=json.loads(gzip.decompress(raw(FROZEN,'data/shares.json.gz')))
provenance={'preregistration':PRE,'frozenOutputCommit':FROZEN,'firstRunAt':fr['at'],'frozenAt':fr['frozenAt'],'window':j['window'],'split':split,'cap':3,'holdSessions':63,'sourceFingerprints':[],'cache':{'prices':'leaders-study-42455753549','pricesArchiveBytes':119475894,'factsInput':'value-cache-42487502111','factsOutput':'value-cache-42811574377','factsAt':j['cover']['factsAt'],'localPathsPresent':False,'cacheRetrieval':'connector endpoint unsupported400; availability not disproved'},'sharesMetadata':{k:sh[k] for k in ['tAt','at','lagDays']},'rowFields':sorted(rows[0]),'rawRows':len(rows),'frozenDiagnostics':j['diagnostics']['B-FCFN1']}
for path in ['value-lab.mjs','value-core.mjs','yardstick.mjs','first-run.mjs','data/shares.json.gz','data/value-lab.json','.github/workflows/value-lab.yml']:
 b=raw(FROZEN,path);provenance['sourceFingerprints'].append({'path':path,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlob':subprocess.check_output(['git','rev-parse',FROZEN+':'+path]).decode().strip()})
# Latest and frozen rows must be aligned before aggregate audit.
assert j['latest']['results']['B-FCFN1']['results']==fr['results']
controls={h:{'frozen':fr['vsSameFilings'][h],'spyGrossMean':fr['vsSpy'][h]['spy'],'ruleNetMinusGrossSpy':fr['vsSpy'][h]['rule']-fr['vsSpy'][h]['spy'],'earningsNewsDifference':fr['vsSameFilings'][h]['rule']-fr['vsSameFilings'][h]['earningsNewsOnly'],'allFilingsDifference':fr['vsSameFilings'][h]['rule']-fr['vsSameFilings'][h]['allFilings'],'originalBlockT':fr['results'][h]['tBlock'],'originalBlocks':fr['results'][h]['blocks'],'originalBlockReplay':'NOT independently reconstructible: original full session-index array absent'} for h in ['older','newer']}
current=json.loads(raw(FROZEN,'data/value-today.json'))['research']['B-FCFN1'];provenance['retainedResearchList']={'formed':current['formed'],'tier':current['tier'],'count':len(current['picks']),'halalCounts':dict(collections.Counter(r['halal'] for r in current['picks'])),'blockedCount':sum(r['blocked'] for r in current['picks']),'okSymbols':[r['sym'] for r in current['picks'] if r['halal']=='ok'],'failedSymbols':[r['sym'] for r in current['picks'] if r['halal']=='fail'],'historicalZADJoin':'NOT_ESTABLISHED; current labels are not backfilled'}
(P/'results.json').write_text(json.dumps({'status':'NOT_PROVEN_MODELED_EVIDENCE_EXECUTION_AND_PIT_INCONCLUSIVE','unchangedFirstRun':fr,'replayedRoundedRows':result,'years':years,'comparisons':controls,'syntheticPriceOnlyEconomics':grid,'rounding':'four-decimal row returns: +/-0.00005 per row; no raw price reconstruction','uncertainty':'Reproduced day t is not independent-trade evidence: 63-session holds overlap. Retain original block t1.02/9blocks in newer half; no new proof test or threshold.'},indent=2)+'\n')
(P/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(json.dumps({'aggregate':result,'controls':controls,'gridExample100':[r for r in grid if r['SYNTHETIC_unchangedReferenceEntryPrice']==100]},indent=2))
