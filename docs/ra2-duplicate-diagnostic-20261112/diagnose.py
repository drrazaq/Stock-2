"""Coverage-only duplicate classification. No row selection, outcomes or normalization.
Uses the byte-identical frozen structural coverage gate, then one bounded second pass.
Only aggregate counts/digests leave the process; no symbols/dates/prices are exported.
"""
import argparse,collections,datetime,hashlib,json,math,pathlib,resource,sys
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'frozen'))
from evaluate import coverage,filehash
from stream_cache import days
FIELDS=('o','h','l','c','v')
EXPECTED='3a1fd0bd7f599b0084e7ee359e480a6c86705b434d27337dfa029b23ce584f2b'
def encode(x):return json.dumps(x,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(b):return hashlib.sha256(b).hexdigest()
def typed(x):
 if isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x):return None
 return ('int',str(x)) if isinstance(x,int) else ('float',x.hex())
def classify(path,c):
 totals=collections.Counter();field_conflicts=collections.Counter();symbols=set();affected_dates=0;day_digests=[]
 kinds=collections.Counter();origins=collections.Counter();metadata=collections.Counter();lag_buckets=collections.Counter();ratios=collections.Counter();qualification=collections.Counter();sumrows=0;nsessions=0;all_symbols=set()
 for day,row in days(path):
  datetime.date.fromisoformat(day);nsessions+=1
  if nsessions>c['limits']['maxSessions']:raise ValueError('SESSION_CAP')
  groups={}
  if not isinstance(row,dict):raise ValueError('DAY_SCHEMA')
  for partition,part in [('main',row),('tail',row.get('x'))]:
   if not isinstance(part,dict) or not all(isinstance(part.get(k),list) for k in ('T',*FIELDS)) or len({len(part[k]) for k in ('T',*FIELDS)})!=1:raise ValueError('PARALLEL_ARRAYS')
   sumrows+=len(part['T'])
   if sumrows>c['limits']['maxRows']:raise ValueError('ROW_CAP')
   for i,symbol in enumerate(part['T']):
    if not isinstance(symbol,str) or not symbol:raise ValueError('SYMBOL_SCHEMA')
    all_symbols.add(symbol)
    if len(all_symbols)>c['limits']['maxSymbols']:raise ValueError('SYMBOL_CAP')
    values=tuple(part[f][i] for f in FIELDS);sig=tuple(typed(x) for x in values)
    g=groups.setdefault(symbol,{'origins':collections.Counter(),'rows':collections.Counter(),'values':{},'byPartition':{'main':{},'tail':{}},'invalid':False})
    g['origins'][partition]+=1
    if None in sig:g['invalid']=True;continue
    g['rows'][sig]+=1;g['values'][sig]=values;g['byPartition'][partition][sig]=values
  audit=[];day_extra=0
  for symbol,g in groups.items():
   n=sum(g['origins'].values())
   if n<2:continue
   totals['duplicateOccurrences']+=n-1;day_extra+=n-1;totals['affectedDayLabelKeys']+=1;symbols.add(symbol)
   main=g['origins']['main'];tail=g['origins']['tail']
   totals['withinMainExtraOccurrences']+=max(0,main-1);totals['withinTailExtraOccurrences']+=max(0,tail-1)
   origin='crossPartition' if main and tail else 'withinMainOnly' if main else 'withinTailOnly';origins[origin]+=1
   numeric=list(g['values'].values());conflicts=[]
   if g['invalid']:kind='invalidOrNonfiniteUnresolved'
   elif len(g['rows'])==1:kind='decodedTypeAndValueIdentical'
   elif all(v==numeric[0] for v in numeric):kind='numericEquivalentRepresentationDiffers'
   else:kind='conflictingRelevantValues'
   kinds[kind]+=1
   if main and tail and not g['invalid']:
    m=list(g['byPartition']['main'].values());t=list(g['byPartition']['tail'].values())
    qualifies=lambda v:v[3]>=3 and v[3]*v[4]>=1000000
    qualification['anyMainCurrentlyQualifies']+=any(map(qualifies,m));qualification['anyTailCurrentlyQualifies']+=any(map(qualifies,t));qualification['allTailCurrentlyFailQualifies']+=not any(map(qualifies,t))
    if len(m)!=1 or len(t)!=1:ratios['multiValuedUnresolved']+=1
    else:
     ratio=m[0][3]/t[0][3] if t[0][3]>0 else None
     factors=[.01,.02,.04,.05,.1,.2,.25,1/3,.5,2/3,1.5,2,3,4,5,10,20,25,50,100]
     if ratio==1:ratios['equalClose']+=1
     elif ratio is not None and any(abs(ratio/f-1)<=.01 for f in factors):ratios['nearSimpleFactorPattern_NOT_AUTHENTICATED_SPLIT']+=1
     else:ratios['otherCloseRatio']+=1
   if not g['invalid']:
    for i,f in enumerate(FIELDS):
     if any(v[i]!=numeric[0][i] for v in numeric):field_conflicts[f]+=1;conflicts.append(f)
   # Private transient map only; its aggregate commitment is emitted, not its keys/rows.
   audit.append([symbol,sorted(g['origins'].items()),sorted((sig,count) for sig,count in g['rows'].items()),g['invalid']])
  if audit:
   affected_dates+=1;day_digests.append(digest(encode([day,sorted(audit)])))
   xat=row.get('xAt');valid=False
   try:valid=isinstance(xat,str) and datetime.date.fromisoformat(xat).isoformat()==xat
   except ValueError:pass
   metadata['validXAtPresent' if valid else 'xAtAbsentOrInvalid']+=1
   if valid:metadata['xAtAfterBarDay' if xat>day else 'xAtNotAfterBarDay']+=1
   lag=(datetime.date.fromisoformat(xat)-datetime.date.fromisoformat(day)).days if valid else None
   bucket='unknown' if lag is None else 'negative' if lag<0 else '0to10days' if lag<=10 else '11to60days' if lag<=60 else 'over60days'
   lag_buckets[bucket]+=day_extra
 return {'kind':'DUPLICATE_CLASSIFICATION_AGGREGATES_V1','key':'EXACT_DAY_AND_LITERAL_TICKER_STRING_SHARED_MAIN_TAIL','normalization':'NONE; no alias/case/whitespace/share-class mapping','counts':{k:totals[k] for k in ['duplicateOccurrences','affectedDayLabelKeys','withinMainExtraOccurrences','withinTailExtraOccurrences']},'affectedDates':affected_dates,'affectedTickerLabels':len(symbols),'groupOrigins':{k:origins[k] for k in ['crossPartition','withinMainOnly','withinTailOnly']},'groupClassification':{k:kinds[k] for k in ['decodedTypeAndValueIdentical','numericEquivalentRepresentationDiffers','conflictingRelevantValues','invalidOrNonfiniteUnresolved']},'conflictingKeysByField':{f:field_conflicts[f] for f in FIELDS},'crossPartitionCloseRatioBuckets':dict(sorted(ratios.items())),'crossPartitionCurrentQualifiesCounts':dict(sorted(qualification.items())),'affectedDateXAtMetadata':dict(sorted(metadata.items())),'xAtLagDuplicateOccurrenceBuckets':dict(sorted(lag_buckets.items())),'lagMeaning':'Mutable metadata age only, NOT lineage, original fetch path, basis authentication or input selection','backfilledVsFresh':'NOT_IDENTIFIABLE_FROM_XAT_ALONE; fresh and backfill paths set xAt, split pass overwrites it, no original main fetch clock retained','orderIndependentPrivateAuditCommitmentSha256':digest(encode(sorted(day_digests))),'rawRowByteIdentity':'NOT_ESTABLISHED; decoded JSON cannot prove source byte identity','splitAdjustmentOrIssuerLineage':'NOT_AUTHENTICATED; simple factor pattern is not an authenticated split or cause','canonicalization':'NONE; no rows selected/dropped/merged','outcomesAccessed':False,'providerRequests':0}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output-dir',required=True);a=ap.parse_args()
 c=json.loads((HERE/'frozen/CONTRACT.json').read_text());limits=json.loads((HERE/'frozen/AMENDMENT.json').read_text())['limits']
 resource.setrlimit(resource.RLIMIT_AS,(limits['memoryBytes'],limits['memoryBytes']));resource.setrlimit(resource.RLIMIT_CPU,(limits['cpuSeconds'],limits['cpuSeconds']))
 binding=json.loads((HERE/'SOURCE_BINDING.json').read_text())
 for n,h in binding['frozenFiles'].items():
  if digest((HERE/'frozen'/n).read_bytes())!=h:raise ValueError('FROZEN_SOURCE_DRIFT')
 out=pathlib.Path(a.output_dir);out.mkdir(parents=True,exist_ok=True)
 if (out/'coverage.json').exists() or (out/'diagnostic.json').exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
 try:
  cov,_,_=coverage(a.input,c)
  # Analyze ONLY the exact retained input whose authentic duplicate stop was witnessed.
  if cov['inputSha256']!=EXPECTED:r={'status':'INCONCLUSIVE','issues':['RETAINED_INPUT_IDENTITY_MISMATCH'],'outcomesAccessed':False}
  elif set(cov['issues'])-{'DUPLICATE_SYMBOL_DAY'}:r={'status':'INCONCLUSIVE','issues':['OTHER_STRUCTURAL_FAILURE'],'coverageIssues':cov['issues'],'outcomesAccessed':False}
  else:
   r=classify(a.input,c)
   if filehash(a.input)!=cov['inputSha256']:raise ValueError('INPUT_CHANGED')
   if r['counts']['duplicateOccurrences']!=cov['counts']['duplicateSymbolDays']:raise ValueError('DUPLICATE_COUNT_MISMATCH')
   r.update(status='COVERAGE_ONLY_CLASSIFIED_NOT_REPAIRED',retainedInputSha256=cov['inputSha256'],frozenCoverageStatus=cov['status'])
 except (OSError,ValueError,TypeError,MemoryError,OverflowError) as e:
  cov=locals().get('cov',{'status':'INCONCLUSIVE','issues':['INPUT_OR_RESOURCE_FAILURE'],'outcomesAccessed':False});r={'status':'INCONCLUSIVE','issues':['INPUT_OR_RESOURCE_FAILURE',type(e).__name__],'outcomesAccessed':False}
 for name,doc,cap in [('coverage.json',cov,131072),('diagnostic.json',r,1048576)]:
  b=encode(doc)+b'\n'
  if len(b)>cap:raise ValueError('REPORT_CAP')
  with (out/name).open('xb') as f:f.write(b)
 print(json.dumps({'status':r['status'],'reportSha256':digest((out/'diagnostic.json').read_bytes()),'outcomesAccessed':False,'providerRequests':0}))
if __name__=='__main__':main()
