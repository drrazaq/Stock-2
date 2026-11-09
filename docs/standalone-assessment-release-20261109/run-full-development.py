import os,subprocess,json,time,hashlib,concurrent.futures
from pathlib import Path
root=Path('/workspace/g2-verification/engineering-a497');out=Path('/workspace/g2-verification/product-assessment-20261109/implementation-exact-full-final');out.mkdir(exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();assert sha=='a0f51bc520cb658a9f4b61f404b71c1a83eb73e9'
files=sorted(str(p.relative_to(root))for d in('test','tests')for p in(root/d).glob('*.test.mjs'));assert len(files)==316
env={'PATH':'/workspace/g2-verification/node20-runtime/node-v20.20.0-linux-x64/bin:/usr/bin:/bin','HOME':'/tmp','NODE_OPTIONS':'--import=/workspace/g2-verification/offline-network-guard.mjs','GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_NOSYSTEM':'1'}
tracked_before=subprocess.check_output(['git','diff','HEAD','--'],cwd=root);assert not tracked_before
started=time.monotonic();rows=[]
def run(f):
 t=time.monotonic();body=(root/f).read_bytes();log=out/(f.replace('/','__')+'.log')
 with log.open('wb')as h:r=subprocess.run(['node',f],cwd=root,env=env,stdout=h,stderr=subprocess.STDOUT,timeout=900)
 return {'file':f,'sha256':hashlib.sha256(body).hexdigest(),'exit':r.returncode,'seconds':round(time.monotonic()-t,3)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:
 for fut in concurrent.futures.as_completed([pool.submit(run,f)for f in files]):
  r=fut.result();rows.append(r);(out/'progress.json').write_text(json.dumps({'source':sha,'registered':len(files),'completed':len(rows),'rows':rows},indent=2)+'\n')
  if r['exit']or len(rows)%25==0:print('progress',len(rows),'/',len(files),r['file'],'exit',r['exit'],flush=True)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==sha
assert subprocess.check_output(['git','diff','HEAD','--'],cwd=root)==tracked_before
result={'source':sha,'registered':len(files),'passed':sum(r['exit']==0 for r in rows),'failed':[r for r in rows if r['exit']],'rows':sorted(rows,key=lambda r:r['file']),'noWaivers':True,'execution':'4 isolated Node20 child processes; every registered file included, no source mutation during run','seconds':round(time.monotonic()-started,3)};(out/'receipt.json').write_text(json.dumps(result,indent=2)+'\n');print('COMPLETE',result['passed'],'/',len(files),'failed',result['failed'],flush=True)
