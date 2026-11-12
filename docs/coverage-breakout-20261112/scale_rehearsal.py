"""Synthetic only, no network. Does not authorize any hosted run."""
import gzip,json,pathlib,sys,time,subprocess,tempfile,os,resource,hashlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent));from evaluate import sessions
root=pathlib.Path(__file__).resolve().parent;D=sessions('2021-11-01','2026-11-06');main=6000;tail=2026

def pack(n,prefix,price,volume):
 return {'T':[prefix+str(i).zfill(5) for i in range(n)],'o':[price+(i%1000)*.001 for i in range(n)],'h':[price+1+(i%1000)*.001 for i in range(n)],'l':[price-1+(i%1000)*.001 for i in range(n)],'c':[price+(i%1000)*.001 for i in range(n)],'v':[volume+i for i in range(n)]}
source_hashes={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['evaluate.py','stream_cache.py','analyze.py','CONTRACT.json','AMENDMENT.json','MISSINGNESS_ADDENDUM.json','OWN_POOL_ADDENDUM.json']}
row=pack(main,'M',10,1000000);row['x']=pack(tail,'X',2,100);encoded=json.dumps(row,separators=(',',':')).encode();cut=1100;after={k:([*v[1:]] if k!='x' else v) for k,v in row.items()};encoded_after=json.dumps(after,separators=(',',':')).encode();start=time.monotonic()
with tempfile.TemporaryDirectory(prefix='stock2-synthetic-scale-') as d:
 f=pathlib.Path(d)/'grouped.json.gz'
 with gzip.open(f,'wb',compresslevel=1) as z:
  z.write(b'{"days":{')
  for i,day in enumerate(D):z.write((b',' if i else b'')+json.dumps(day).encode()+b':'+(encoded if i<cut else encoded_after))
  z.write(b'}}')
 out=pathlib.Path(d)/'out';log=root/'SCALE_TIME.txt'
 with log.open('w') as stream:
  result=subprocess.run([sys.executable,str(root/'evaluate.py'),'--input',str(f),'--output-dir',str(out)],stdout=stream,stderr=stream,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
 usage=resource.getrusage(resource.RUSAGE_CHILDREN)
 assert source_hashes=={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in source_hashes}, 'SOURCE_CHANGED_DURING_REHEARSAL'
 receipt={'sourceHashes':source_hashes,'sourceStableThroughout':True,'peakChildRssKiB':usage.ru_maxrss,'childCpuSeconds':usage.ru_utime+usage.ru_stime,'kind':'SYNTHETIC_RESOURCE_REHEARSAL_NOT_MARKET_EVIDENCE','sessions':len(D),'mainRows':len(D)*main-max(0,len(D)-cut),'tailRows':len(D)*tail,'totalRows':len(D)*(main+tail)-max(0,len(D)-cut),'compressedBytes':f.stat().st_size,'uncompressedBytes':min(cut,len(D))*(len(encoded)+15)+max(0,len(D)-cut)*(len(encoded_after)+15),'exitCode':result.returncode,'elapsedIncludingGenerationSeconds':round(time.monotonic()-start,3),'syntheticTerminalAbsence':'One synthetic main ticker has no later retained bars afterday1100, to exercise both model scenarios; not actual delisting','shapeLimit':'Matches approximate row count, not actual symbols, entropy, prices or signal density; no profitable inference','noProviderCalls':True,'diagnostic':json.loads((out/'diagnostic.json').read_text()) if (out/'diagnostic.json').exists() else None}
 (root/'SCALE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:receipt[k] for k in ['sessions','totalRows','compressedBytes','exitCode','elapsedIncludingGenerationSeconds']}))
