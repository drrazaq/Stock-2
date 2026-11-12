"""Batch-specific offline economic evidence. Never imports/runs a downloading lab."""
import json,math,statistics as S,hashlib,collections,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
load=lambda p:json.loads((ROOT/p).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
C=load('docs/research-batch20-20261112/CONTRACT.json');A=load('docs/research-batch20-20261112/AMENDMENT.json')
assert sha(HERE/'CONTRACT.json')==A['contractSha256']
for p,m in {**C['inputs'],**A['inputs']}.items():
 if 'sha256' in m:assert sha(ROOT/p)==m['sha256'],p
 elif m.get('status')=='NOT_RETAINED':assert not (ROOT/p).exists(),p
mean=lambda a:S.fmean(a) if a else None
med=lambda a:S.median(a) if a else None
num=lambda x:isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def stats(a):
 a=[float(x) for x in a if num(x)];n=len(a)
 if not n:return {'n':0,'mean':None,'median':None,'losses':0}
 z=sorted(a);cut=math.ceil(n*.05);positive=sum(x for x in a if x>0)
 return {'n':n,'mean':mean(a),'median':med(a),'losses':sum(x<0 for x in a),'zero':sum(x==0 for x in a),'worst':min(a),'best':max(a),'withoutBest2':mean(z[:-2]) if n>2 else None,'withoutBest5pct':mean(z[:-cut]) if n>cut else None,'best5pctCount':cut,'best5pctShareOfPositiveGains':sum(max(0,x) for x in z[-cut:])/positive if positive else None}
def papers(x):
 p=ROOT/('data/'+str(x['lab'])+'-paper.jsonl')
 if not p.exists():return {'status':'NOT_RETAINED_OR_NO_IMPLEMENTED_LANE','signals':None,'resolved':None,'eligibleProspectiveResolved':None,'economicVerdict':'INCONCLUSIVE_NO_RETAINED_FORWARD_LANE'}
 records=[json.loads(l) for l in p.read_text().splitlines() if l.strip()];id=x['exactExistingId'];ss=[r for r in records if r.get('type')=='signal' and r.get('m')==id];rr=[r for r in records if r.get('type')=='result' and r.get('m')==id]
 if not ss and not rr:return {'status':'NO_COMPATIBLE_SELECTED_RULE_RECORDS','retainedOtherRows':len(records),'signals':0,'resolved':0,'eligibleProspectiveResolved':0,'economicVerdict':'INCONCLUSIVE_SELECTED_LANE_UNOBSERVED_NOT_PROOF_ZERO_OPPORTUNITIES'}
 def unique(rows):
  by=collections.defaultdict(list)
  for r in rows:by[r.get('id')].append(r)
  conflicts={k for k,v in by.items() if k is None or len({json.dumps(r,sort_keys=True) for r in v})>1}
  return {k:v[0] for k,v in by.items() if k not in conflicts},len(rows)-len(by),len(conflicts)
 signals,ds,cs=unique(ss);results,dr,cr=unique(rr);groups={'PROSPECTIVE':[],'LATE_OR_BACKFILLED':[],'CLOCK_UNKNOWN':[]};signalClasses=collections.Counter();unmatched=[];matched=[]
 for k,s in signals.items():
  date,entry,record=s.get('d'),s.get('entryDate'),s.get('recordedAfter')
  flag='LATE_OR_BACKFILLED' if s.get('late') is True or isinstance(record,str) and isinstance(entry,str) and record>=entry else 'PROSPECTIVE' if s.get('late') is False and all(isinstance(v,str) and len(v)==10 for v in [date,entry,record]) and date<=record<entry else 'CLOCK_UNKNOWN'
  signalClasses[flag]+=1;r=results.get(k)
  if r is None:continue
  if r.get('sym')!=s.get('sym') or r.get('d')!=s.get('d') or r.get('buy')!=entry or not r.get('sell') or not num(r.get('net')):unmatched.append(k);continue
  groups[flag].append(r);matched.append(k)
 eligible=groups['PROSPECTIVE'];days=len({r['d'] for r in eligible});rowStats={k:stats([r.get('net') for r in v]) for k,v in groups.items()}
 return {'status':'RETAINED_PAPER_ROWS_NOT_EXECUTED_TRADES','signals':len(signals),'resolved':len(matched),'unresolved':len(signals)-len(matched),'signalTimingClasses':dict(signalClasses),'duplicateSignals':ds,'duplicateResults':dr,'conflictingSignals':cs,'conflictingResults':cr,'unmatchedOrIdentityMismatchedResults':len(set(results)-set(matched)),'eligibleProspectiveResolved':len(eligible),'eligibleFormationDays':days,'gate30on10':len(eligible)>=30 and days>=10,'returnStatsByTimingClass':rowStats,'economicVerdict':'INCONCLUSIVE_BELOW_FORWARD_EVIDENCE_FLOOR' if len(eligible)<30 or days<10 else 'FULL_ORIGINAL_PROOF_AND_EXECUTION_REVIEW_REQUIRED_NOT_PROMOTION','execution':'NULL_NO_ENTRY_EXIT_USD_BBO_OR_FILL_CHAIN','historicalZad':'Retained signal mark not promoted to historical certification; no current-mark backfill','firstSignal':min((s.get('d','') for s in signals.values()),default=None),'lastSignal':max((s.get('d','') for s in signals.values()),default=None)}
def raw_diagnostic(x,d):
 rows=d.get('trades',{}).get(x['exactExistingId'],[]) if isinstance(d.get('trades'),dict) else []
 if not rows:return {'status':'NO_RETAINED_RAW_COHORT','metrics':None}
 if x['exactExistingId'] not in ['SQ28-SUPDRIFT','SQ4-GROWLEAD']:return {'status':'RETIRED_ORIGINAL_REJECTED_VERSION_NOT_RE_SLICED','retainedRows':len(rows),'metrics':None}
 net=[r['net'] for r in rows if num(r.get('net'))];out={'status':'INDEPENDENT_RETAINED_ROW_DIAGNOSTIC_NOT_NEW_HOLDOUT','rows':len(rows),'net':stats(net),'nativeStress1p2PercentAggregate':stats([v-.004 for v in net]),'originalCostConvention':'net = rounded(model gross - 0.008); original embedded price/mark/slippage assumptions remain. Stress changes only original flat cost to0.012.','rowLineage':'Not automatically the firstRun cohort. Later generated rows and missing frozen trade IDs preclude firstRun replication.','exactWholeShareReturn':None,'portfolioReturnOrDrawdown':None}
 for field in ['avgStock','sameStock','spy']:
  pair=[(r['net'],r[field]) for r in rows if num(r.get('net')) and num(r.get(field))];out[field]={'n':len(pair),'meanControl':mean([b for a,b in pair]),'pairedMeanDifference':mean([a-b for a,b in pair]),'basis':'SPY gross; strategy net: NOT an equal-cost or whole-share comparison' if field=='spy' else 'Both reported net of0.008; original underlying execution/slippage may differ, not verified executable matching'}
 if x['exactExistingId']=='SQ28-SUPDRIFT':
  pair=[(r['net'],r['placebo']['net']) for r in rows if isinstance(r.get('placebo'),dict) and num(r['placebo'].get('net'))];out['existingCustomerDatePlacebo']={'n':len(pair),'meanDifference':mean([a-b for a,b in pair])}
 by=collections.defaultdict(list)
 for r in rows:
  if num(r.get('net')):by[r.get('sym') or r.get('s')].append(r['net'])
 gain=sum(max(0,v) for v in net);contrib=sorted(((s,sum(max(0,v) for v in a),len(a)) for s,a in by.items()),key=lambda z:z[1],reverse=True)
 out['concentration']={'symbols':len(by),'largestPositiveContributor':contrib[0][0] if contrib else None,'largestShareOfPositiveGains':contrib[0][1]/gain if gain and contrib else None,'top5SymbolShareOfPositiveGains':sum(z[1] for z in contrib[:5])/gain if gain else None,'formationMonths':len({(r.get('sig') or r.get('signal') or '')[:7] for r in rows}),'customers':len({r.get('customer') for r in rows if r.get('customer')})}
 events=[]
 for r in rows:
  if r.get('buy') and r.get('sell'):events.extend([(r['buy'],0,1),(r['sell'],1,-1)])
 active=peak=0
 for day,order,delta in sorted(events):active+=delta;peak=max(active,peak)
 out['capitalDemand']={'maxConcurrentRetainedPositions':peak,'referenceNotionalUsd':peak*1000,'method':'Buy-open before sell-close on same date; lower bound for incomplete cohort, not owner budget or feasible portfolio P&L'}
 out['singleOrderFeeSensitivity']={}
 if any((r.get('kind') or r.get('exit')) in ['gone','dead'] for r in rows):
  out['singleOrderFeeSensitivity']={'status':'INCONCLUSIVE_UNRESOLVED_EXIT_ORDER_COUNTS_ALL_LOSSES_RETAINED_IN_NATIVE_STATS'};return out
 for slip in [0,.005,.02]:
  bounds=[]
  for n in net:
   ratio=(1+n+.008)*(1-slip)/(1+slip)-1;vals=[498.5*ratio-6,997*ratio-6];bounds.append((min(vals)/1000,max(vals)/1000))
  out['singleOrderFeeSensitivity'][str(slip)]={'meanLowerConditionalBound':mean([a for a,b in bounds]),'meanUpperConditionalBound':mean([b for a,b in bounds]),'assumptions':'All trades affordable, one buy+one sell, dollar prices UNKNOWN; invested cash between498.5and997, plus3eachside. Reconstruct reported modelgross as roundednet+0.008, preserve original embedded assumptions, then add stated extra adverse fraction eachside. Mathematical bounds, NOT actual execution or a substitute for missing prices.'}
 return out
rows=[]
for x in C['selected']:
 p=ROOT/('data/'+str(x['lab'])+'-lab.json');d=json.loads(p.read_text()) if p.exists() else {};fr=d.get('firstRun',{});f=fr.get(x['exactExistingId'],{}) if isinstance(fr,dict) else {}
 if x['lab']=='swing':f=fr.get('results',{}).get('SW1',{})
 if x['lab']=='squad19':f=d.get('dailyFirstRun',{}).get(x['exactExistingId'],{})
 lib=next((z for z in load('data/strategy-library.json')['strategies'] if z['id']==x['exactExistingId']),{})
 row={'batchId':x['batchId'],'mechanism':x['mechanism'],'id':x['exactExistingId'],'family':x['economicFamily'],'frozenVerdict':f.get('verdict') or lib.get('status'),'frozenWhy':f.get('why'),'frozenResults':f.get('results'),'frozenAt':f.get('frozenAt') or f.get('at'),'hold':f.get('hold') or (A['bindings'].get(x['exactExistingId'],{}).get('hold')) or (x.get('sourceRule') or {}).get('hold'),'ruleDefinitionStatus':x['ruleIdentityStatus'],'forward':papers(x),'retainedDiagnostic':raw_diagnostic(x,d),'executableWholeShareResults':None,'missingExecutionFields':['original USD entry and exit references','entry/exit BBO, units and admissible order timestamps','halts/no-fills/last tradable exit and delisting proceeds','point-in-time security/corporate-action mapping','actual number of executed orders','historical ZAD status not current inference'],'selectionOrPITLimits':'Original universe and original fundamental/consensus/acceptance vintages cannot be independently replayed from summaries. No new holdout, no new significance claim.'}
 if x['exactExistingId'] is None:row['disposition']='INCONCLUSIVE_NO_FROZEN_TRADE_RULE_OR_COMPLETE_EVENT_CHAIN'
 elif 'REJECT' in str(row['frozenVerdict']).upper() or 'FAILED' in str(row['frozenVerdict']).upper():row['disposition']='STOP_EXACT_VERSION_RETIRED_NO_RESCUE'
 else:row['disposition']='INCONCLUSIVE_ORIGINAL_VERDICT_UNCHANGED_NO_EXECUTABLE_CONFIRMATION'
 rows.append(row)
lib=load('data/strategy-library.json')['strategies'];ex=[json.loads(l) for l in (ROOT/'data/experiments.jsonl').read_text().splitlines() if l.strip()]
result={'kind':'BATCH20_COMPLETED_RETAINED_EVIDENCE_NOT_TWENTY_NEW_BACKTESTS','contractSha256':sha(HERE/'CONTRACT.json'),'amendmentSha256':sha(HERE/'AMENDMENT.json'),'analyzerSha256':sha(Path(__file__)),'inputRef':C['inputRef'],'inventory':{'libraryRows':len(lib),'uniqueIds':len({x['id'] for x in lib}),'familyLabelsNotMechanisms':len({x.get('family') for x in lib}),'experimentRows':len(ex),'uniqueWhereName':len({(x.get('where'),x.get('name')) for x in ex}),'sumReportedTriedNotUniqueTests':sum(x.get('tried',0) for x in ex),'selectedChannels':20,'alreadyTestedExactIds':19,'newValidatedEconomicEdges':0},'hypotheses':rows,'newProviderRequests':0,'productionActions':0,'historicalVerdictChanges':0,'noCurrentBuy':True}
(HERE/'RESULTS.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
print(json.dumps({'hypotheses':len(rows),'dispositions':dict(collections.Counter(x['disposition'] for x in rows)),'forwardResolved':{x['batchId']:x['forward'].get('eligibleProspectiveResolved') for x in rows},'retainedDiagnostics':[x['batchId'] for x in rows if x['retainedDiagnostic'].get('metrics') is not None or x['retainedDiagnostic'].get('net')],'sha256':sha(HERE/'RESULTS.json')}))
