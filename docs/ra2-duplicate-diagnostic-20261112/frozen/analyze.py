"""Frozen offline coverage gate. It intentionally does NOT evaluate signals/outcomes.
Raw cache stays in place. stdout contains only aggregate status. Python standard library only.
"""
import argparse,datetime,gzip,hashlib,json,math,pathlib,resource,sys
HERE=pathlib.Path(__file__).resolve().parent
KEYS=('T','o','h','l','c','v')
def sha(b):return hashlib.sha256(b).hexdigest()
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def inspect(store,contract,input_hash):
 """No return, signal, drawdown, pairwise price or outcome computations permitted here."""
 issues=[];counts={'sessions':0,'mainRows':0,'tailRows':0,'sessionsMissingTail':0,'malformedArrays':0,'badNumericRows':0,'duplicateSymbolDays':0,'tailOnlySymbols':0};syms=set();main=set();tail=set();dates=[]
 if not isinstance(store,dict) or not isinstance(store.get('days'),dict):
  return {'status':'INCONCLUSIVE','outcomesAccessed':False,'issues':['NO_VALID_DAY_STORE'],'inputSha256':input_hash,'counts':counts}
 days=store['days'];dates=sorted(days)
 if not dates:return {'status':'INCONCLUSIVE','outcomesAccessed':False,'issues':['EMPTY_CACHE'],'inputSha256':input_hash,'counts':counts}
 lim=contract['limits'];counts['sessions']=len(dates)
 if len(dates)>lim['maxSessions']:raise ValueError('SESSION_CAP')
 for d in dates:
  try:datetime.date.fromisoformat(d)
  except (ValueError,TypeError):raise ValueError('INVALID_SESSION_DATE')
  row=days[d]
  if not isinstance(row,dict):counts['malformedArrays']+=1;continue
  if not isinstance(row.get('x'),dict):counts['sessionsMissingTail']+=1
  seen=set()
  for kind,pack in [('main',row),('tail',row.get('x'))]:
   if pack is None:continue
   if not isinstance(pack,dict) or not all(isinstance(pack.get(k),list) for k in KEYS) or len({len(pack[k]) for k in KEYS})!=1:
    counts['malformedArrays']+=1;continue
   for i,s in enumerate(pack['T']):
    if not isinstance(s,str) or not s:counts['badNumericRows']+=1;continue
    syms.add(s);(main if kind=='main' else tail).add(s);counts[kind+'Rows']+=1
    if s in seen:counts['duplicateSymbolDays']+=1
    seen.add(s)
    o,h,l,c,v=[pack[k][i] for k in ('o','h','l','c','v')]
    if not all(finite(x) for x in (o,h,l,c,v)) or min(o,h,l,c)<=0 or v<0 or not l<=min(o,c)<=max(o,c)<=h:counts['badNumericRows']+=1
    if counts['mainRows']+counts['tailRows']>lim['maxRows']:raise ValueError('ROW_CAP')
    if len(syms)>lim['maxSymbols']:raise ValueError('SYMBOL_CAP')
 counts['uniqueTickerLabels']=len(syms);counts['tailOnlySymbols']=len(tail-main)
 if counts['malformedArrays']:issues.append('MALFORMED_PARALLEL_ARRAYS')
 if counts['badNumericRows']:issues.append('INVALID_OHLCV_ROWS')
 if counts['duplicateSymbolDays']:issues.append('DUPLICATE_SYMBOL_SESSION')
 if counts['sessionsMissingTail']:issues.append('TAIL_NOT_PRESENT_EVERY_SESSION')
 # Range presence is NOT completeness: a genuine exchange calendar is also required.
 rng=contract['range']
 if dates[0]>rng['warmupFrom'] or dates[-1]<rng['outcomesThrough']:issues.append('FIXED_RANGE_NOT_COVERED')
 required=[d for d in dates if rng['warmupFrom']<=d<=rng['outcomesThrough']]
 expected=store.get('sessionCalendar')
 calendar_ok=isinstance(expected,dict) and expected.get('sourceSha256') and isinstance(expected.get('dates'),list) and expected.get('completeThrough','')>=rng['outcomesThrough'] and all(isinstance(d,str) for d in expected['dates'])
 if not calendar_ok:issues.append('AUTHENTIC_SESSION_CALENDAR_MISSING')
 else:
  want=[d for d in expected['dates'] if rng['warmupFrom']<=d<=rng['outcomesThrough']]
  if want!=sorted(set(want)) or set(want)!=set(required):issues.append('MISSING_OR_EXTRA_REGULAR_SESSIONS')
 # Existing ref.syms/current complete flag cannot establish dated eligibility or extinct firms.
 # No boolean provenance flag can produce a PASS in this bounded coverage-only inspector.
 issues += ['PIT_SECURITY_IDENTITY_AND_COMPLETE_DEAD_POPULATION_NOT_AUTHENTICATED','RAW_DOLLAR_PRICE_CHAIN_NOT_AUTHENTICATED','SPLIT_DIVIDEND_SYMBOL_AND_DELISTING_SETTLEMENT_BASIS_NOT_AUTHENTICATED','ORIGINAL_SOURCE_AND_RECEIPT_CHAIN_NOT_AUTHENTICATED','SAME_INDUSTRY_CONTROL_COVERAGE_NOT_AUTHENTICATED']
 return {'kind':'COVERAGE_ONLY_NOT_STRATEGY_RESULT','study':contract['id'],'status':'INCONCLUSIVE','outcomesAccessed':False,'signalsEnumerated':False,'inputSha256':input_hash,'counts':counts,'rangeObserved':{'first':dates[0],'last':dates[-1],'withinFrozenRange':len(required)},'identity':'ticker-label counts only; not verified company counts','tailMeaning':'x rows can preserve some collapsed-name prices; presence does not prove full delisted population or actual settlements','rawAdjusted':'Legacy grouped cache is split-adjusted/heuristically repaired; cannot reverse into raw executed-dollar prices without verified factors','historicalCap':'UNKNOWN; deliberately absent from new cap-free specification','issues':issues,'next':'Review exact coverage evidence before any separate analysis authorization; no post-coverage threshold tuning','executablePerformance':None}
def main(argv=None):
 p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);args=p.parse_args(argv)
 c=json.loads((HERE/'CONTRACT.json').read_text());lim=c['limits'];resource.setrlimit(resource.RLIMIT_CPU,(lim['cpuSeconds'],lim['cpuSeconds']));resource.setrlimit(resource.RLIMIT_AS,(lim['addressSpaceBytes'],lim['addressSpaceBytes']))
 source=pathlib.Path(args.input);out=pathlib.Path(args.output)
 if out.exists():raise ValueError('OUTPUT_ALREADY_EXISTS')
 if source.resolve()==out.resolve():raise ValueError('INPUT_OUTPUT_COLLISION')
 try:
  if source.is_symlink():raise ValueError('SYMLINK_INPUT')
  if source.stat().st_size>lim['compressedBytes']:raise ValueError('COMPRESSED_BYTE_CAP')
  b=source.read_bytes();digest=sha(b)
  with gzip.GzipFile(fileobj=__import__('io').BytesIO(b)) as f:
   raw=f.read(lim['uncompressedBytes']+1)
  if len(raw)>lim['uncompressedBytes']:raise ValueError('UNCOMPRESSED_BYTE_CAP')
  result=inspect(json.loads(raw),c,digest)
 except (OSError,ValueError,TypeError,MemoryError) as e:
  # Never echo raw data, paths, environment, provider response or exception strings.
  result={'kind':'COVERAGE_ONLY_NOT_STRATEGY_RESULT','study':c['id'],'status':'INCONCLUSIVE','outcomesAccessed':False,'signalsEnumerated':False,'inputSha256':locals().get('digest'),'issues':['INPUT_UNAVAILABLE_OR_INVALID',type(e).__name__],'executablePerformance':None}
 encoded=(json.dumps(result,indent=2,sort_keys=True)+'\n').encode()
 if len(encoded)>lim['coverageOutputBytes']:raise ValueError('OUTPUT_BYTE_CAP')
 out.parent.mkdir(parents=True,exist_ok=True)
 with out.open('xb') as f:f.write(encoded)
 print(json.dumps({'status':result['status'],'outcomesAccessed':False,'providerRequests':0,'reportSha256':sha(encoded)}))
 return 0
if __name__=='__main__':sys.exit(main())
