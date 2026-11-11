"""Invalid-invocation rehearsal: local bare repository only, zero network/pushes."""
import datetime as dt,json,os,subprocess,tempfile
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=P.parents[1];objects=json.loads((P/'objects.json').read_text())
binding=ROOT/'docs/watcher-price-followon-20261110/binding-successor.json';inverse=ROOT/'docs/watcher-price-followon-20261110/inverse-successor-to-stage1.json'
common=Path(subprocess.check_output(['git','rev-parse','--git-common-dir'],cwd=ROOT).decode().strip())
if not common.is_absolute():common=ROOT/common
objects_path=str(common.resolve()/'objects')+'\n'
now=dt.datetime.now(dt.timezone.utc);iso=lambda minutes:(now+dt.timedelta(minutes=minutes)).isoformat();results=[]
with tempfile.TemporaryDirectory(prefix='stage2-config-only-') as tmp:
 w=Path(tmp);bare=w/'remote.git';subprocess.run(['git','init','-q','--bare',str(bare)],check=True)
 (bare/'objects/info/alternates').write_text(objects_path)
 subprocess.run(['git','--git-dir',str(bare),'update-ref','refs/heads/main',objects['baseHypotheticalStage1']],check=True)
 op=w/'op';subprocess.run(['git','clone','-q','--shared',str(bare),str(op)],check=True,capture_output=True)
 base=['python3',str(P/'stage2_retry.py'),'--binding',str(binding),'--inverse',str(inverse),'--tested',objects['testedStage2'],'--deadline',iso(20)]
 badinv=json.loads(inverse.read_text());badinv['restore'][0]['sha']='0'*40;(w/'badinverse.json').write_text(json.dumps(badinv))
 duplicate=json.loads(inverse.read_text());duplicate['restore'][-1]=duplicate['restore'][0];(w/'duplicate.json').write_text(json.dumps(duplicate))
 badbinding=json.loads(binding.read_text());badbinding['dependencyPaths'].append(badbinding['writePaths'][0]);(w/'badbinding.json').write_text(json.dumps(badbinding))
 cases=[('C1 cap zero',['--cap','0']),('C2 cap four',['--cap','4']),('C3 missing originalD',['--mode','inverse']),('C4 future originalD',['--mode','inverse','--decision',iso(1)]),('C5 duplicate inverse',['--inverse',str(w/'duplicate.json')]),('C6 inverse mismatches BEFORE',['--inverse',str(w/'badinverse.json')]),('C7 overlapping dependency/write',['--binding',str(w/'badbinding.json')]),('C8 partial late authority',['--mode','inverse','--decision',iso(-60),'--deadline',iso(-30),'--late-cutoff',iso(2)]),('C9 missing UTC',['--deadline','2099-01-01T00:00:00']),('C10 originalD+30 violation',['--mode','inverse','--decision',iso(0),'--deadline',iso(31)])]
 for name,args in cases:
  before=subprocess.check_output(['git','--git-dir',str(bare),'rev-parse','refs/heads/main']).decode().strip()
  r=subprocess.run(base+args,cwd=op,capture_output=True,text=True,timeout=20)
  after=subprocess.check_output(['git','--git-dir',str(bare),'rev-parse','refs/heads/main']).decode().strip()
  assert r.returncode==2 and before==after,(name,r.returncode,r.stdout,r.stderr)
  results.append({'case':name,'pass':True,'rc':r.returncode,'noRemoteChange':True,'diagnostic':r.stderr.splitlines()[-1]})
print(json.dumps({'offlineOnly':True,'pass':len(results),'fail':0,'cases':results},indent=2))
