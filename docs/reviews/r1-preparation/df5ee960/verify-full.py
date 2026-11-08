import os,subprocess,json,time,pathlib
root='/workspace/g2-verification/rev14-fresh-unit';out=pathlib.Path('/workspace/g2-verification/rev14-full');out.mkdir(exist_ok=True)
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']};env['PATH']='/workspace/g2-verification/node20-runtime/node-v20.20.0-linux-x64/bin:'+env.get('PATH','');env['NODE_OPTIONS']='--import=/workspace/g2-verification/offline-network-guard.mjs';env['OFFLINE_GUARD_LOG']=str(out/'blocked-network.jsonl');env['TG_TOKEN']='';env['TG_CHAT']='';env['SEALED_SECRET']='';env['GIT_CONFIG_GLOBAL']='/dev/null';env['GIT_CONFIG_NOSYSTEM']='1'
files=sorted(str(p.relative_to(root)) for d in ['test','tests'] for p in (pathlib.Path(root)/d).glob('*.test.mjs'));rows=[]
for f in files:
 t=time.time();log=out/(f.replace('/','__')+'.log')
 with log.open('wb') as h:r=subprocess.run(['node',f],cwd=root,env=env,stdout=h,stderr=subprocess.STDOUT)
 rows.append({'file':f,'exit':r.returncode,'seconds':round(time.time()-t,3)});(out/'progress.json').write_text(json.dumps({'registered':len(files),'completed':len(rows),'rows':rows},indent=2));print(f,r.returncode,flush=True)
(out/'receipt.json').write_text(json.dumps({'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'registered':len(files),'passed':sum(x['exit']==0 for x in rows),'failed':[x for x in rows if x['exit']!=0],'rows':rows,'noFailureWaivers':True},indent=2))
