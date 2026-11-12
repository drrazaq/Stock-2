"""Frozen coverage-gated legacy-panel diagnostic. No provider/network/live rule path."""
import argparse,calendar,collections,datetime,hashlib,json,math,pathlib,resource,statistics
from array import array
from stream_cache import days
from analyze import finite,KEYS
HERE=pathlib.Path(__file__).resolve().parent
NAN=float('nan')
def mean(a):return sum(a)/len(a) if a else None
def rd(x):return round(x,4) if x is not None and math.isfinite(x) else None
def tstat(a):
 if len(a)<2:return None
 s=statistics.stdev(a);return round(mean(a)/(s/math.sqrt(len(a))),2) if s>0 else None
def observed(d):return d+datetime.timedelta(days=1 if d.weekday()==6 else -1 if d.weekday()==5 else 0)
def nth(y,m,w,n):return datetime.date(y,m,1)+datetime.timedelta(days=(w-datetime.date(y,m,1).weekday())%7+7*(n-1))
def easter(y):
 a=y%19;b=y//100;c=y%100;d=b//4;e=b%4;f=(b+8)//25;g=(b-f+1)//3;h=(19*a+b-d-g+15)%30;i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7;m=(a+11*h+22*l)//451;return datetime.date(y,(h+l-7*m+114)//31,(h+l-7*m+114)%31+1)
def sessions(start,end):
 lo=datetime.date.fromisoformat(start);hi=datetime.date.fromisoformat(end);hol=set()
 for y in range(lo.year,hi.year+1):
  ny=datetime.date(y,1,1)
  if ny.weekday()!=5:hol.add(observed(ny))
  hol.update([nth(y,1,0,3),nth(y,2,0,3),easter(y)-datetime.timedelta(days=2),nth(y,5,0,5) if nth(y,5,0,5).month==5 else nth(y,5,0,4),observed(datetime.date(y,7,4)),nth(y,9,0,1),nth(y,11,3,4),observed(datetime.date(y,12,25))])
  if y>=2022:hol.add(observed(datetime.date(y,6,19)))
 hol.add(datetime.date(2025,1,9));out=[];d=lo
 while d<=hi:
  if d.weekday()<5 and d not in hol:out.append(d.isoformat())
  d+=datetime.timedelta(days=1)
 return out
def filehash(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def coverage(path,c):
 dates=[];syms=set();n=tail=bad=dup=missing=0;headers={}
 if pathlib.Path(path).stat().st_size>c['limits']['compressedBytes']:raise ValueError('COMPRESSED_CAP')
 for d,row in days(path,headers):
  datetime.date.fromisoformat(d);dates.append(d);seen=set()
  if len(dates)>c['limits']['maxSessions']:raise ValueError('SESSION_CAP')
  if not isinstance(row,dict):raise ValueError('DAY_SCHEMA')
  if not isinstance(row.get('x'),dict):missing+=1
  for name,r in [('main',row),('tail',row.get('x'))]:
   if r is None:continue
   if not isinstance(r,dict) or not all(isinstance(r.get(k),list) for k in KEYS) or len({len(r[k]) for k in KEYS})!=1:raise ValueError('PARALLEL_ARRAYS')
   n+=len(r['T']);tail+=len(r['T']) if name=='tail' else 0
   if n>c['limits']['maxRows']:raise ValueError('ROW_CAP')
   for j,s in enumerate(r['T']):
    if not isinstance(s,str) or not s:raise ValueError('SYMBOL_SCHEMA')
    if s in seen:dup+=1
    seen.add(s);syms.add(s)
    o,h,l,close,v=(r[k][j] for k in ('o','h','l','c','v'))
    if not all(finite(z) for z in (o,h,l,close,v)) or not finite(close*v) or min(o,h,l,close)<=0 or v<0 or not l<=min(o,close)<=max(o,close)<=h:bad+=1
   if len(syms)>c['limits']['maxSymbols']:raise ValueError('SYMBOL_CAP')
 rng=c['range'];D=sessions(rng['warmupFrom'],rng['outcomesThrough']);issues=[]
 if not set(D).issubset(set(dates)):issues.append('MISSING_FROZEN_REGULAR_SESSIONS')
 if missing:issues.append('MISSING_TAIL_ARRAYS')
 if dup:issues.append('DUPLICATE_SYMBOL_DAY')
 if bad:issues.append('INVALID_NUMERIC_ROWS')
 # Never infer identity/PIT completeness from a current ref flag; diagnostic explicitly inherits this bias.
 return {'kind':'PRE_OUTCOME_COVERAGE','inputSha256':filehash(path),'status':'PASS_LEGACY_STRUCTURAL_ONLY' if not issues else 'INCONCLUSIVE','exactContract':'INCONCLUSIVE','outcomesAccessed':False,'issues':issues,'counts':{'sessions':len(dates),'tickerLabels':len(syms),'rows':n,'tailRows':tail,'missingTailDays':missing,'badNumericRows':bad,'duplicateSymbolDays':dup},'first':min(dates) if dates else None,'last':max(dates) if dates else None,'rawDollarPITIdentitySettlements':'NOT_AUTHENTICATED','calendarBasis':'frozen computed regular-session calendar, not original provider clock'},D,sorted(syms)
def load_panel(path,D,syms):
 T=len(D);idx={d:i for i,d in enumerate(D)};P={s:{k:array('d',[NAN])*T for k in ('o','h','c','v')} for s in syms}
 for d,row in days(path):
  if d not in idx:continue
  t=idx[d]
  for r in (row,row.get('x')):
   if not isinstance(r,dict):continue
   for j,s in enumerate(r['T']):
    for k in ('o','h','c','v'):P[s][k][t]=r[k][j]
 return P

def mark_outcome(p,e,x,scenario='HARSH'):
 O,C,V=(p[k] for k in ('o','c','v'));T=len(C)
 if not finite(O[e]) or O[e]<=0 or not finite(V[e]) or V[e]<=0:return None,'NO_FILL_OR_UNKNOWN',False,None
 def available(j):return finite(C[j]) and C[j]>0 and finite(V[j]) and V[j]>0
 if available(x):return min(C[x]/O[e]-1,3),'MODELED_RESOLVED',False,x
 for j in range(x+1,min(T,x+6)):
  if available(j):return min(C[j]/O[e]-1,3),'GAP_MARK_PROXY_NOT_EXECUTED_EXIT',True,j
 later=any(available(j) for j in range(x+6,T))
 last=next((j for j in range(x-1,e-1,-1) if available(j)),None)
 g=min(C[last]/O[e]-1,3) if scenario=='LAST_RETAINED_MARK' and last is not None else -1.
 return g,'GAP_BEYOND5_STRESS_PROXY' if later else 'NO_FURTHER_BAR_STRESS_PROXY_NOT_PROVEN_DELISTING',True,last if scenario=='LAST_RETAINED_MARK' else None

def stock_events(s,p,D,c,scenario='HARSH'):
 T=len(D);C,H,O,V=(p[k] for k in ('c','h','o','v'));pc=[0.];pv=[0.];pd=[0.];valid=[0];mq=collections.deque();events=[]
 for i in range(T):
  ok=all(finite(a[i]) and a[i]>0 for a in (C,H,O)) and finite(V[i]) and V[i]>=0
  pc.append(pc[-1]+(C[i] if ok else 0));pv.append(pv[-1]+(V[i] if ok else 0));pd.append(pd[-1]+(C[i]*V[i] if ok else 0));valid.append(valid[-1]+ok)
 for t in range(60,T-10):
  if not c['range']['signalFrom']<=D[t]<=c['range']['signalThrough']:continue
  if valid[t]-valid[t-60]!=60 or valid[t+1]-valid[t]!=1:continue
  if C[t]<5 or (pd[t]-pd[t-20])/20<5000000:continue
  e=t+1;x=t+10
  g,status,proxy,mark_t=mark_outcome(p,e,x,scenario)
  level=max(H[t-60:t]);base=C[t]>level and C[t]<=level*1.05 and C[t-1]<=level and C[t]>(pc[t+1]-pc[t-49])/50 and V[t]>=1.5*(pv[t]-pv[t-20])/20
  touches=0;last=-99
  if base:
   for j in range(t-60,t):
    if level*.99<=H[j]<=level and j-last>=5:touches+=1;last=j
  events.append({'s':s,'t':t,'e':e,'x':x,'g':g,'status':status,'proxy':proxy,'markSession':mark_t,'exactExitStatus':'UNKNOWN' if proxy else status,'base':base,'repeat':base and touches>=3})
 return events

def conditional_bounds(g,slip):
 # Conditional only: split-consistent ratio, all raw entries affordable, exactly2executedorders.
 a=(1+g)*(1-slip)/(1+slip)-1-.008;v=[(cash*a-6)/1000 for cash in (498.5,997.)];return min(v),max(v)
def stats(rows,D,avg,own,base,spy,slip=0):
 resolved=[z for z in rows if z['g'] is not None];v=[(1+z['g'])*(1-slip)/(1+slip)-1-.008 for z in resolved];byday=collections.defaultdict(list);ow=[];paired=[];paired_day=collections.defaultdict(list);sp=[];year=collections.defaultdict(list)
 for z in resolved:
  g=(1+z['g'])*(1-slip)/(1+slip)-1;control=avg.get(z['t']);o=own.get((z['s'],D[z['t']]<'2024-01-01'))
  if control is not None:byday[z['t']].append(g-.008-control)
  if o is not None:ow.append(g-o)
  if z['t'] in base:paired.append(g-base[z['t']]);paired_day[z['t']].append(g-base[z['t']])
  if z['t'] in spy:sp.append(g-.008-spy[z['t']]);year[D[z['t']][:4]].append(g-.008-spy[z['t']])
 blocks=collections.defaultdict(list)
 for t,a in byday.items():blocks[t//10].append(mean(a))
 paired_blocks=collections.defaultdict(list)
 for t,z in paired_day.items():paired_blocks[t//10].append(mean(z))
 sortedv=sorted(v,reverse=True);bounds={str(s):[mean([conditional_bounds(z['g'],s)[j] for z in resolved]) for j in (0,1)] for s in (0,.005,.02)}
 return {'n':len(v),'attempts':len(rows),'resolvedOrStressModeled':len(v),'noFillOrUnknownEntry':len(rows)-len(v),'proxyOutcomes':sum(z.get('proxy',False) for z in resolved),'noFurtherBarCount':sum(z['status'].startswith('NO_FURTHER_BAR') for z in resolved),'gapBeyond5Count':sum(z['status'].startswith('GAP_BEYOND5') for z in resolved),'gapWithin5Count':sum(z['status'].startswith('GAP_MARK') for z in resolved),'proxyShare':sum(z.get('proxy',False) for z in resolved)/len(v) if v else None,'days':len(byday),'blocks':len(blocks),'avg':rd(mean(v)),'median':rd(statistics.median(v) if v else None),'avgStress':rd(mean([x-.004 for x in v])),'losses':sum(x<0 for x in v),'winRate':rd(sum(x>0 for x in v)/len(v)) if v else None,'worst':rd(min(v) if v else None),'withoutBest2':rd(mean(sortedv[2:])),'withoutBest5pct':rd(mean(sortedv[max(1,math.ceil(len(v)*.05)):])),'edgeLegacyNetVsGross':rd(mean([mean(x) for x in byday.values()])),'tBlock':tstat([mean(x) for x in blocks.values()]) if len(blocks)>=3 else None,'vsOwn':rd(mean(ow)),'ownCovered':len(ow),'pairedBaseDifference':rd(mean(paired)),'pairedBaseCovered':len(paired),'pairedBaseBlockT':tstat([mean(x) for x in paired_blocks.values()]) if len(paired_blocks)>=3 else None,'spyNetVsGross':rd(mean(sp)),'spyCovered':len(sp),'yearSpyDifferences':{y:rd(mean(a)) for y,a in year.items()},'conditionalWholeShareBounds':None if any(z.get('proxy') for z in resolved) else bounds,'boundsAssumptions':'Every raw entry affordable<=997; split-consistent normalized ratio; two orders; legacy0.8% flat execution cost PLUS6USD fees PLUS stated adverse fractions; NOT actual quantities or fills','executablePerformance':None}
def evaluate(P,D,c,a,scenario='HARSH'):
 market=collections.defaultdict(list);market_n=collections.Counter();market_proxy=collections.Counter();market_no_entry=collections.Counter();market_terminal=collections.Counter();base_terminal=collections.Counter();baseall=collections.defaultdict(list);base_proxy=collections.Counter();selected={'base':[],'repeat':[]};unknown=collections.Counter();own={'base':{},'repeat':{}};own_proxy={'base':{},'repeat':{}};own_terminal={'base':{},'repeat':{}}
 for s,p in P.items():
  if s in ('SPY','IWM'):continue
  events=stock_events(s,p,D,c,scenario=scenario)
  for z in events:
   if z['g'] is not None:
    market_n[z['t']]+=1;market[z['t']].append(z['g']);market_proxy[z['t']]+=z.get('proxy',False);market_terminal[z['t']]+=z['status'].startswith('NO_FURTHER_BAR')
   else:market_no_entry[z['t']]+=1
   if z['base'] and z['g'] is not None:baseall[z['t']].append(z['g']);base_proxy[z['t']]+=z.get('proxy',False);base_terminal[z['t']]+=z['status'].startswith('NO_FURTHER_BAR')
  for variant in ('base','repeat'):
   busy=-1
   for half in (True,False):
    other=[z['g'] for z in events if not z[variant] and z['g'] is not None and (D[z['t']]<'2024-01-01')==half];own[variant][s,half]=mean(other);own_proxy[variant][s,half]=sum(z.get('proxy',False) for z in events if not z[variant] and z['g'] is not None and (D[z['t']]<'2024-01-01')==half)/len(other) if other else None;own_terminal[variant][s,half]=sum(z['status'].startswith('NO_FURTHER_BAR') for z in events if not z[variant] and z['g'] is not None and (D[z['t']]<'2024-01-01')==half)
   for z in events:
    if z[variant] and z['e']>busy:
     selected[variant].append(z)
     if len(selected[variant])>a['limits']['maxEventsEachVariant']:raise ValueError('EVENT_CAP')
     if z['g'] is not None:busy=z['x']
     unknown[variant]+=z['g'] is None
 avg={t:mean(v) for t,v in market.items() if len(v)>=50};base={t:mean(v) for t,v in baseall.items()};spy={};spy_proxy={};spy_terminal={}
 if 'SPY' in P:
  p=P['SPY'];spy_proxy={};spy_terminal={}
  for t in market:
   g,status,proxy,mark_t=mark_outcome(p,t+1,t+10,scenario)
   if g is not None:spy[t]=g;spy_proxy[t]=proxy;spy_terminal[t]=status.startswith('NO_FURTHER_BAR')
 result={};reasons=[]
 for variant in ('base','repeat'):
  R={}
  for half in ('older','newer'):
   rows=[z for z in selected[variant] if (D[z['t']]<'2024-01-01')==(half=='older')];h=stats(rows,D,avg,own[variant],base,spy);h['smallStock2pctEachSide']=stats(rows,D,avg,own[variant],base,spy,.02)['avg'];R[half]=h
  result[variant]=R
 for half,h in result['repeat'].items():
  if h['ownCovered']<h['resolvedOrStressModeled'] or h['spyCovered']<h['resolvedOrStressModeled'] or h['pairedBaseCovered']<h['resolvedOrStressModeled'] or h['days']<len({z['t'] for z in selected['repeat'] if z['g'] is not None and (D[z['t']]<'2024-01-01')==(half=='older')}):reasons.append(half+':MISSING_SELECTED_OUTCOME_OR_CONTROL')
  selected_half=[z for z in selected['repeat'] if (D[z['t']]<'2024-01-01')==(half=='older')];formation=set(z['t'] for z in selected_half if z['g'] is not None)
  market_den=sum(market_n[t] for t in formation);base_den=sum(len(baseall[t]) for t in formation)
  h['controlProxyShares']={'average':sum(market_proxy[t] for t in formation)/market_den if market_den else None,'base':sum(base_proxy[t] for t in formation)/base_den if base_den else None,'spy':sum(spy_proxy.get(t,False) for t in formation)/len(formation) if formation else None,'ownWorstStock':max((own_proxy['repeat'].get((z['s'],half=='older')) or 0 for z in selected_half),default=0)}
  h['noFurtherBarControlCounts']={'average':sum(market_terminal[t] for t in formation),'averageDenominator':market_den,'base':sum(base_terminal[t] for t in formation),'baseDenominator':base_den,'spy':sum(spy_terminal.get(t,False) for t in formation),'spyDenominator':len(formation),'ownOtherDates':sum(own_terminal['repeat'].get((sym,half=='older'),0) for sym in {z['s'] for z in selected_half})}
  h['averageControlNoEntryCount']=sum(market_no_entry[t] for t in formation)
  if h['proxyShare'] is not None and h['proxyShare']>.02:reasons.append(half+':SELECTED_PROXY_SHARE_OVER2PCT')
  if any(v is None or v>.02 for v in h['controlProxyShares'].values()):reasons.append(half+':CONTROL_PROXY_SHARE_OVER2PCT_OR_MISSING')
  if h['n']<20 or h['days']<10 or h['blocks']<3:reasons.append(half+':INSUFFICIENT_SAMPLE')
 missing=bool(reasons)
 if not missing:
  for half,h in result['repeat'].items():
   for k in ['avg','avgStress','withoutBest2','edgeLegacyNetVsGross','vsOwn','pairedBaseDifference','smallStock2pctEachSide']:
    if h[k] is None or h[k]<=0:reasons.append(half+':'+k)
   if h['tBlock'] is None or h['tBlock']<4.1:reasons.append(half+':BLOCK_T_BELOW_LEAGUE4.1')
   if h['pairedBaseBlockT'] is None or h['pairedBaseBlockT']<4.1:reasons.append(half+':PAIRED_BASE_BLOCK_T_BELOW_LEAGUE4.1')
   if not h['yearSpyDifferences'] or any(v is None or v<=0 for v in h['yearSpyDifferences'].values()):reasons.append(half+':SPY_YEAR_GATE')
 events=collections.Counter();positive=collections.Counter()
 for z in selected['repeat']:
  if z['g'] is None:continue
  events[z['e']]+=1;events[z['x']+1]-=1
  if z['g'] is not None and z['g']>.008:positive[z['s']]+=z['g']-.008
 cap=mx=0
 for t in sorted(events):cap+=events[t];mx=max(mx,cap)
 return {'kind':'LEGACY_PANEL_DIAGNOSTIC_NOT_EXACT_OWNER_STRATEGY','scenario':scenario,'anyProxyRows':sum(market_proxy.values()),'status':'INCONCLUSIVE' if missing else ('RETIRED_ON_LEGACY_CONSERVATIVE_STRESS' if any(z.get('proxy') for z in selected['repeat']) else 'RETIRED_ON_LEGACY_PANEL') if reasons else 'FORWARD_PAPER_ONLY_NOT_PROVEN','reasons':reasons,'halves':result,'concurrency':{'maximumPositions':mx,'referenceNotional':mx*1000,'accountReturn':None,'portfolioDrawdown':None},'concentration':{'largestPositiveShare':max(positive.values())/sum(positive.values()) if positive else None,'top5PositiveShare':sum(sorted(positive.values(),reverse=True)[:5])/sum(positive.values()) if positive else None},'proxyMeaning':'Gap marks and -100% no-further-bar values are symmetric conservative stress assumptions, NOT actual fills, proven delistings or actual cash recoveries; exact exit economics remain UNKNOWN','identityAndRawDollarLimits':'Adjusted ticker panel includesADRs/reusednames/oncequalifiedbias; NOT authenticatedPITordinarysmallcap universe or actualfills','exactContract':'INCONCLUSIVE','executablePerformance':None,'historicZad':'UNKNOWN','zangerReference':'Untouched publishedDEC2-ZANGER frozenREJECTED older-.0088/newer-.0103; not replicated or new head-to-head exit claim','iwmCoverage':'PRESENT' if 'IWM' in P else 'UNKNOWN_MISSING'}
def evaluate_scenarios(P,D,c,a):
 harsh=evaluate(P,D,c,a,'HARSH')
 last=evaluate(P,D,c,a,'LAST_RETAINED_MARK') if harsh['anyProxyRows'] else {**harsh,'scenario':'LAST_RETAINED_MARK','sameAsHarshBecauseNoProxyRows':True}
 passed=lambda r:r['status']=='FORWARD_PAPER_ONLY_NOT_PROVEN'
 failed=lambda r:r['status'].startswith('RETIRED_ON_LEGACY')
 if passed(harsh) and passed(last):status='FORWARD_PAPER_ONLY_NOT_PROVEN'
 elif failed(harsh) and failed(last):status='RETIRED_ON_LEGACY_PANEL'
 elif (passed(harsh) and failed(last)) or (failed(harsh) and passed(last)):status='INCONCLUSIVE_MISSINGNESS_SENSITIVE'
 else:status='INCONCLUSIVE'
 return {'kind':'TWO_LEGACY_SENSITIVITY_SCENARIOS_NOT_EXECUTABLE_PERFORMANCE','status':status,'harsh':harsh,'lastRetainedMark':last,'exactContract':'INCONCLUSIVE','economicMechanism':'INCONCLUSIVE_WHEN_PROXY_RECOVERIES_UNKNOWN' if harsh['anyProxyRows'] else 'LEGACY_MODEL_ONLY','execution':None,'lastMarkWarning':'Not an executed sale or mathematical upper bound on cash-merger/settlement recovery; exact missing exits stay UNKNOWN','noAdoption':True}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output-dir',required=True);args=ap.parse_args();c=json.loads((HERE/'CONTRACT.json').read_text());a=json.loads((HERE/'AMENDMENT.json').read_text());addendum=json.loads((HERE/'MISSINGNESS_ADDENDUM.json').read_text());assert addendum['maxProxyShare']==.02 and addendum['gapMarkMaxSessions']==5 and addendum['scenarios']==['HARSH','LAST_RETAINED_MARK'];resource.setrlimit(resource.RLIMIT_AS,(a['limits']['memoryBytes'],a['limits']['memoryBytes']));resource.setrlimit(resource.RLIMIT_CPU,(a['limits']['cpuSeconds'],a['limits']['cpuSeconds']));out=pathlib.Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
 if (out/'coverage.json').exists() or (out/'diagnostic.json').exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
 try:
  cov,D,syms=coverage(args.input,c)
  coverage_bytes=(json.dumps(cov,indent=2)+'\n').encode()
  if len(coverage_bytes)>131072:raise ValueError('COVERAGE_REPORT_CAP')
  with (out/'coverage.json').open('xb') as f:f.write(coverage_bytes)
  if cov['status']!='PASS_LEGACY_STRUCTURAL_ONLY':r={'status':'INCONCLUSIVE','outcomesAccessed':False,'coverageIssues':cov['issues']}
  else:
   P=load_panel(args.input,D,syms)
   if filehash(args.input)!=cov['inputSha256']:raise ValueError('INPUT_CHANGED')
   r=evaluate_scenarios(P,D,c,a);r['outcomesAccessed']=True
 except (OSError,ValueError,TypeError,MemoryError) as e:r={'status':'INCONCLUSIVE','outcomesAccessed':False,'issues':['INPUT_OR_RESOURCE_FAILURE',type(e).__name__]}
 b=(json.dumps(r,indent=2,allow_nan=False)+'\n').encode()
 if len(b)>a['limits']['reportBytes']:raise ValueError('REPORT_CAP')
 with (out/'diagnostic.json').open('xb') as f:f.write(b)
 print(json.dumps({'status':r['status'],'reportSha256':hashlib.sha256(b).hexdigest(),'providerRequests':0}))
if __name__=='__main__':main()
