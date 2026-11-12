"""New coverage-only classifier capacity, synthetic only, no network/outcomes.
Close to observed6,882,012rows:1260sessions*(3436main+2026tail)=6,882,120.
"""
import gzip,json,hashlib,pathlib,subprocess,sys,tempfile,time,resource,os
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE/'frozen'));from evaluate import sessions
D=sessions('2021-11-01','2026-11-06');assert len(D)==1260
def part(n,prefix,px):return {'T':[prefix+str(i) for i in range(n)],'o':[px]*n,'h':[px+1]*n,'l':[max(.1,px-1)]*n,'c':[px]*n,'v':[1000000]*n}
row={**part(3436,'M',10),'x':part(2026,'X',2)};dup=json.loads(json.dumps(row));dup['x']['T'][0]='M0'
normal=json.dumps(row,separators=(',',':')).encode();duplicate=json.dumps(dup,separators=(',',':')).encode();source={str(p.relative_to(HERE)):hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.rglob('*') if p.is_file() and p.suffix in ['.py','.json'] and p.name!='SCALE_RECEIPT.json'}
with tempfile.TemporaryDirectory(prefix='duplicate-capacity-') as d:
 p=pathlib.Path(d)/'synthetic.gz';start=time.monotonic()
 with gzip.open(p,'wb',compresslevel=1) as z:
  z.write(b'{"days":{')
  for i,day in enumerate(D):z.write((b',' if i else b'')+json.dumps(day).encode()+b':'+(duplicate if i<125 else normal))
  z.write(b'}}')
 pin=hashlib.sha256(p.read_bytes()).hexdigest();out=pathlib.Path(d)/'out'
 # Test-only wrapper pins the synthetic fixture; production script has no
 # alternate-input switch and remains pinned to the authentic retained hash.
 code='import diagnose as D; D.EXPECTED='+repr(pin)+'; D.main()'
 r=subprocess.run([sys.executable,'-c',code,'--input',str(p),'--output-dir',str(out)],cwd=HERE,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True)
 usage=resource.getrusage(resource.RUSAGE_CHILDREN);assert r.returncode==0,r.stderr
 diag=json.loads((out/'diagnostic.json').read_text());assert diag['status']=='COVERAGE_ONLY_CLASSIFIED_NOT_REPAIRED' and diag['outcomesAccessed'] is False and diag['counts']['duplicateOccurrences']==125 and diag['groupClassification']['conflictingRelevantValues']==125
 assert all(hashlib.sha256((HERE/n).read_bytes()).hexdigest()==h for n,h in source.items())
 receipt={'kind':'SYNTHETIC_NEW_COVERAGE_DIAGNOSTIC_RESOURCE_REHEARSAL_NOT_MARKET_EVIDENCE','rows':len(D)*5462,'sessions':len(D),'tickerLabels':5462,'duplicateOccurrences':125,'compressedBytes':p.stat().st_size,'uncompressedBytes':125*(len(duplicate)+15)+(len(D)-125)*(len(normal)+15),'elapsedIncludingGenerationSeconds':time.monotonic()-start,'childCpuSeconds':usage.ru_utime+usage.ru_stime,'peakChildRssKiB':usage.ru_maxrss,'exitCode':r.returncode,'sourceUnchanged':True,'sourceHashes':source,'stdout':r.stdout,'aggregateHashes':{n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in ['coverage.json','diagnostic.json']},'diagnostic':diag,'limits':'No original CPU/memory/stream/row/output limit raised; lower entropy and different identity distribution than authentic cache; not performance evidence'}
 (HERE/'SCALE_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:receipt[k] for k in ['rows','childCpuSeconds','peakChildRssKiB','exitCode']}))
