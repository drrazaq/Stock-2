"""Read-only reconciliation of complete pinned ledgers; no market result recomputation."""
import pathlib,json,gzip,hashlib,re
root=pathlib.Path('/workspace/research-batch20-20261112');out=pathlib.Path(__file__).resolve().parent
paths=['data/strategy-library.json','data/experiments.jsonl','data/shares.json.gz','shares.mjs']
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
a=json.loads((root/paths[0]).read_text())['strategies'];e=[json.loads(s) for s in (root/paths[1]).read_text().splitlines() if s.strip()]
patterns={'momentum_reversal_cap':r'12.?1|12.month|RSI|leader.?dip|market.cap|Connors|Frog', 'repeated_level_volume':r'breakout|double.bottom|three.weeks|volume.profile|Zanger|tight.base|retest|resistance'}
selected={}
for k,p in patterns.items():
 r=re.compile(p,re.I);selected[k]={'libraryMatches':[{'id':x['id'],'name':x.get('name'),'status':x.get('status'),'originalVerdict':(x.get('result') or {}).get('verdict'),'study':x.get('study')} for x in a if r.search(' '.join(str(x.get(f,'')) for f in ['id','name','explain','rule','family']))],'experimentMatches':[x for x in e if r.search(json.dumps(x))]}
s=json.loads(gzip.decompress((root/'data/shares.json.gz').read_bytes()));rows=[p for v in s['raw'].values() for p in v];arity={str(len(p)) for p in rows}
expected=[]
for r in pathlib.Path('/workspace').iterdir():
 if r.is_dir():
  for p in ['study-cache/grouped.json.gz','anomaly-cache/facts.json.gz','value-cache/facts.json.gz','ev-cache/events-cache.json.gz']:
   f=r/p
   if f.is_file():expected.append({'path':str(f),'bytes':f.stat().st_size})
x={'kind':'FEASIBILITY_AUDIT_NOT_NEW_STRATEGY_TEST','pinnedInput':'7db2c83b574bbe0d85d4c9972ad2230a36004816','hashes':hashes,'completeScannedLibraryIds':len(a),'completeScannedExperimentRows':len(e),'uniqueExperimentWhereName':len({(x.get('where'),x.get('name')) for x in e}),'matches':selected,'shares':{'issuers':len(s['raw']),'observations':len(rows),'rowArities':sorted(arity),'storedFields':['period/cover date','share count'],'lagDays':s['lagDays'],'acceptanceTimestampsRetained':False,'currentTickerMapAt':s['tAt'],'archiveReceiptAt':s['at'],'pointInTimeStatus':'NOT_AUTHENTICATED: fixed30-day lag and current ticker map do not prove availability or historical identity; S.c additionally uses later split evidence'},'expectedCachesPresent':expected,'decisions':{'candidateA':'BLOCKED: complete OHLCV/security/corporate-action chain and actual PIT cap absent; two rejected components are not a distinct family','candidateB':'BLOCKED: no complete retained daily OHLCV and PIT small-cap identity/cap; do not reconstruct intraday from daily bars','fallbackNewMechanisms':'BLOCKED: no retained complete facts/event/price/control chains; same19 documents not searched again'},'newMarketTests':0,'newReturns':None}
(out/'CANDIDATE_AUDIT.json').write_text(json.dumps(x,indent=2)+'\n');print(json.dumps({'library':len(a),'experiments':len(e),'shares':x['shares'],'matches':{k:{j:len(v) for j,v in z.items()} for k,z in selected.items()},'cachesPresent':len(expected)}))
