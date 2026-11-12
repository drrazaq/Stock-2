"""Synthetic real tmpfs/non-root tar regression and frozen evaluator publication.
Run only inside a disposable privileged local container with --network none.
Never downloads a cache, contacts GitHub/providers or changes any research source.
"""
import os,pathlib,subprocess,json,hashlib,gzip,sys,stat,zipfile,time
ROOT=pathlib.Path(os.environ.get('REHEARSAL_ROOT','/work'));SOURCE=pathlib.Path(os.environ.get('REHEARSAL_SOURCE','/source'));OUT=pathlib.Path(os.environ.get('REHEARSAL_RECEIPT','/receipt'));UID=1001;GID=1001
PLAIN=os.environ.get('REHEARSAL_PLAIN_TAR')=='1';EXACT_REMOUNT=os.environ.get('REHEARSAL_EXACT_REMOUNT')=='1'
def h(b):return hashlib.sha256(b).hexdigest()
def run(args,user=False,check=True):
 if user:args=['setpriv','--reuid',str(UID),'--regid',str(GID),'--clear-groups',*args]
 p=subprocess.run(args,text=True,capture_output=True)
 if check and p.returncode:raise RuntimeError({'args':args,'rc':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
 return p
def metadata(p):
 s=p.stat();return {'uid':s.st_uid,'gid':s.st_gid,'mode':oct(stat.S_IMODE(s.st_mode)),'mtimeNs':s.st_mtime_ns,'filesystem':run(['stat','-f','-c','%T',str(p)]).stdout.strip()}
ROOT.mkdir();os.chmod(ROOT,0o755);OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(SOURCE));from evaluate import sessions
bound=['evaluate.py','analyze.py','stream_cache.py','CONTRACT.json','AMENDMENT.json','MISSINGNESS_ADDENDUM.json','OWN_POOL_ADDENDUM.json']
before={n:h((SOURCE/n).read_bytes()) for n in bound}
receipt={'kind':'SYNTHETIC_REAL_TMPFS_TAR_EVALUATOR_PUBLICATION_NOT_MARKET_EVIDENCE','uid':UID,'gid':GID,'archiveEncoding':'plain-tar' if PLAIN else 'zstd','tools':{'tar':run(['/usr/bin/tar','--version']).stdout.splitlines()[0],'zstd':None if PLAIN else run(['/usr/bin/zstd','--version']).stdout.strip(),'python':sys.version,'kernel':os.uname().release},'sourceHashes':before,'cases':[]}
dates=sessions('2022-01-03','2026-10-30')
for name,incomplete in [('complete_synthetic',False),('missing_session',True)]:
 work=ROOT/name;work.mkdir();os.chmod(work,0o755);staging=work/'staging';staging.mkdir();cached=staging/'study-cache';cached.mkdir()
 row={'T':['SPY','IWM']+['S'+str(i) for i in range(52)],'o':[10]*54,'h':[11]*54,'l':[9]*54,'c':[10]*54,'v':[1000000]*54,'x':{k:[] for k in ['T','o','h','l','c','v']}}
 data={'days':{d:row for d in (dates[1:] if incomplete else dates)}}
 (cached/'grouped.json.gz').write_bytes(gzip.compress(json.dumps(data,separators=(',',':')).encode()))
 # Exact representative failing root-entry mode and old mtime from cached metadata.
 os.chmod(cached,0o1755);os.utime(cached,(1609459200,1609459200))
 archive=work/('cache.tar' if PLAIN else 'cache.tzst');run(['/usr/bin/tar',* ([] if PLAIN else ['--zstd']),'-cf',str(archive),'-C',str(staging),'study-cache'])
 archive_hash=h(archive.read_bytes());case={'name':name,'archiveSha256':archive_hash,'compressedArchiveBytes':archive.stat().st_size,'cachedDirectoryMetadata':metadata(cached)}
 # Same pinned-action tar command, real root-owned tmpfs and separate non-root UID.
 for fix in [False,True]:
  dest=work/('fixed' if fix else 'original');dest.mkdir();cache=dest/'study-cache';cache.mkdir();transfer=dest/'transfer';transfer.mkdir()
  opts='size=512m,nodev,nosuid,noexec,mode=0755,uid=1001,gid=1001' if fix else 'size=512m,nodev,nosuid,noexec,mode=1777'
  for mount in [cache,transfer]:run(['mount','-t','tmpfs','-o',opts,'tmpfs',str(mount)])
  record={'mountOptions':opts,'before':metadata(cache),'transferBefore':metadata(transfer)}
  # Cache-action transfer destination is mounted and written as the extractor UID.
  copied=transfer/'cache.tzst';run(['cp',str(archive),str(copied)],user=True);assert h(copied.read_bytes())==archive_hash
  command=['/usr/bin/tar','-xf',str(copied),'-P','-C',str(dest),* ([] if PLAIN else ['--use-compress-program','unzstd'])];p=run(command,user=True,check=False)
  record.update(command=command,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr,after=metadata(cache))
  print(json.dumps({'fixed' if fix else 'originalRegression':record}),flush=True)
  if not fix:
   assert p.returncode==2 and 'Cannot utime' in p.stderr and 'Cannot change mode' in p.stderr
   case['original']=record
  else:
   # Non-root GNU tar strips the archived sticky bit by default; normal0755
   # is the observed safe result, with the original mtime restored exactly.
   assert p.returncode==0 and record['after']['uid']==UID and record['after']['mode']=='0o755'
   assert record['after']['mtimeNs']==case['cachedDirectoryMetadata']['mtimeNs']
   remount=run(['mount','-o','remount,ro',str(cache)],check=False)
   record['productionRemountInRootlessContainer']={'exitCode':remount.returncode,'stderr':remount.stderr}
   if remount.returncode:
    assert not EXACT_REMOUNT,'EXACT_PRODUCTION_REMOUNT_REQUIRED'
    # Rootless Docker locks inherited safety flags; explicitly preserve all
    # three for this local namespace. Production command is left unchanged.
    run(['mount','-o','bind,ro',str(cache),str(cache)])
    record['localNamespaceRemountAdaptation']='read-only bind of same restored tmpfs, preserving underlying size/nodev/nosuid/noexec; production remount separately verified by Claude'
   denied=run(['touch',str(cache/'forbidden-write')],user=True,check=False);assert denied.returncode!=0 and 'Read-only file system' in denied.stderr
   record['readOnlyWriteRejected']=True
   record['mountReadback']=run(['findmnt','-n','-o','FSTYPE,OPTIONS','--target',str(cache)]).stdout.strip();assert all(o in record['mountReadback'] for o in ['ro','nodev','nosuid','noexec'])
   output=dest/'output';output.mkdir();os.chown(output,UID,GID)
   # Actual disconnected namespace, cleared environment, unchanged frozen CLI.
   evaluator=['unshare','--net','env','-i','PATH=/usr/local/bin:/usr/bin:/bin','PYTHONDONTWRITEBYTECODE=1','/usr/bin/python3',str(SOURCE/'evaluate.py'),'--input',str(cache/'grouped.json.gz'),'--output-dir',str(output)]
   evaluated=run(evaluator);assert evaluated.returncode==0
   cov=json.loads((output/'coverage.json').read_text());diag=json.loads((output/'diagnostic.json').read_text())
   assert cov['status']==('INCONCLUSIVE' if incomplete else 'PASS_LEGACY_STRUCTURAL_ONLY')
   assert diag['status']=='INCONCLUSIVE' and diag['outcomesAccessed'] is (not incomplete)
   assert (output/'coverage.json').stat().st_size<=131072 and (output/'diagnostic.json').stat().st_size<=1048576
   hashes={n:h((output/n).read_bytes()) for n in ['coverage.json','diagnostic.json']}
   publication=OUT/(name+'-aggregate.zip')
   # Local artifact-publication analog only; no Actions artifact upload is claimed.
   with zipfile.ZipFile(publication,'w',zipfile.ZIP_DEFLATED) as z:
    for n in hashes:z.write(output/n,n)
   with zipfile.ZipFile(publication) as z:assert set(z.namelist())==set(hashes) and all(h(z.read(n))==digest for n,digest in hashes.items())
   for n in hashes:(OUT/(name+'-'+n)).write_bytes((output/n).read_bytes())
   record.update(evaluatorStdout=evaluated.stdout,coverageStatus=cov['status'],outcomesAccessed=diag['outcomesAccessed'],diagnosticStatus=diag['status'],aggregateHashes=hashes,localPublicationSha256=h(publication.read_bytes()),publication='LOCAL_AGGREGATES_ONLY_NOT_HOSTED_UPLOAD')
   case['fixed']=record
  for mount in [cache,transfer]:run(['umount',str(mount)])
 receipt['cases'].append(case)
assert before=={n:h((SOURCE/n).read_bytes()) for n in bound}
receipt['sourceUnchanged']=True;receipt['providerRequests']=0;receipt['network']='Docker --network none plus evaluator unshare --net';receipt['limitations']=['Local privileged rootless-Docker mount/user semantics, not an actual GitHub-hosted runner or authenticated cache/artifact service','Synthetic cache only; same retained tar command/decompressor, not a new authentic-data run','Published aggregate ZIP is local; hosted artifact upload remains unexecuted']
(OUT/'RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'originalTarExit':2,'fixedTarExit':0,'cases':len(receipt['cases']),'sourceUnchanged':True,'providerRequests':0}))
