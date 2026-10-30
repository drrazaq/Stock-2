#!/usr/bin/env python3
"""Offline verification of exact review-only patches on their pinned production Git tree.
No fetch/push, providers, deployment or message dispatch. Tests use existing synthetic/local fixtures.
"""
import argparse,hashlib,io,json,os,re,subprocess,tarfile,tempfile
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--scope',choices=['watcher','accounting','combined'],required=True);parser.add_argument('--revision',choices=['2','3'],default='3');args=parser.parse_args()
repo=Path(__file__).resolve().parents[1];out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
scopes=['watcher','accounting'] if args.scope=='combined' else [args.scope];manifests=[]
for scope in scopes:
 prefix='watcher-core' if scope=='watcher' else 'accounting'
 m=json.loads((repo/f'docs/validation/{prefix}-production-manifest-v{args.revision}.json').read_text());patch=repo/f'docs/validation/{prefix}-production-fix-v{args.revision}.patch'
 assert sha(patch.read_bytes())==m['patchSha256'];assert all(not f.startswith(('data/','fm-cache/')) for f in m['files']);manifests.append((m,patch))
base=manifests[0][0]['baseMain'];assert all(m['baseMain']==base for m,_ in manifests)
raw=subprocess.check_output(['git','archive',base],cwd=repo)
with tempfile.TemporaryDirectory(prefix='stock2-production-review-') as directory:
 root=Path(directory)
 with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
  assert all(not p.name.startswith('/') and '..' not in Path(p.name).parts for p in archive.getmembers());archive.extractall(root,filter='data')
 subprocess.run(['git','init','-q'],cwd=root,check=True)
 for m,patch in manifests:
  subprocess.run(['git','apply','--check',str(patch)],cwd=root,check=True);subprocess.run(['git','apply',str(patch)],cwd=root,check=True)
  for f,digest in {**m['unchangedProductionDependencies'],**m['files']}.items():assert sha((root/f).read_bytes())==digest,(f,'result/dependency hash mismatch')
 expected={f:sha((root/f).read_bytes()) for m,_ in manifests for f in [*m['files'],*m['unchangedProductionDependencies']]}
 originals=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'test','tests'],cwd=repo,text=True).splitlines();original_tests=[f for f in originals if f.endswith('.test.mjs')]
 tests=sorted([*root.glob('test/*.test.mjs'),*root.glob('tests/*.test.mjs')]);failures=[];cases=0
 env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY']}
 temp=root/'isolated-test-temp';temp.mkdir();env['TMPDIR']=str(temp)
 if args.scope!='accounting':env['INCIDENT_WATCHER_SRC']=str(root/'ignition-watch.mjs')
 with (out/'node.log').open('w') as log:
  for file in tests:
   result=subprocess.run(['node',str(file)],cwd=root,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
   log.write('\nFILE '+str(file.relative_to(root))+'\n'+result.stdout);log.flush()
   found=re.findall(r'(?:^# tests |^ℹ tests )(\d+)',result.stdout,re.M);cases+=sum(map(int,found))
   if result.returncode:failures.append(str(file.relative_to(root)))
 static=[]
 for file in root.glob('*.mjs'):
  result=subprocess.run(['node','--check',str(file)],cwd=root,capture_output=True,text=True)
  if result.returncode:static.append(file.name)
 assert all(sha((root/f).read_bytes())==digest for f,digest in expected.items()),'tests modified a manifest file/dependency'
 result={'scope':args.scope,'baseMain':base,'patches':[m['patchSha256'] for m,_ in manifests],'originalMainNodeTestFiles':len(original_tests),'originalMainTestsRetained':all(root.joinpath(f).exists() for f in original_tests),'allNodeTestFiles':len(tests),'reportedCases':cases,'failures':failures,'rootModulesChecked':len(list(root.glob('*.mjs'))),'staticFailures':static,'allManifestAndDependencyHashesVerifiedBeforeAndAfter':True,'productionWrites':False,'liveRequestsOrMessaging':False}
 (out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(bool(failures or static))
