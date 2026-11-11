"""Offline Git objects only. No refs changed, no push, no working-tree data copied."""
import hashlib,json,os,subprocess,tempfile
from pathlib import Path
P=Path(__file__).parent;ROOT=P.resolve().parents[1]
MAIN='10a25bf67c506894a9da74d2ef0cab6aec75d169';SOURCE='93ab136cbab139b80882a45dabc09b17bacad1e1'
def git(*args,env=None):return subprocess.check_output(['git',*args],cwd=ROOT,env=env).decode().strip()
def overlay(base,updates):
 fd,idx=tempfile.mkstemp();os.close(fd);os.unlink(idx);env=dict(os.environ,GIT_INDEX_FILE=idx)
 try:
  git('read-tree',base,env=env)
  for p,v in updates.items():
   if v is None:git('update-index','--force-remove','--',p,env=env)
   else:git('update-index','--add','--cacheinfo',v[0]+','+v[1]+','+p,env=env)
  return git('write-tree',env=env)
 finally:
  if os.path.exists(idx):os.unlink(idx)
def leaves(t):
 out={}
 for s in git('ls-tree','-r',t).splitlines():
  m,p=s.split('\t',1);mode,_,sha=m.split();out[p]=[mode,sha]
 return out
b1=json.loads((ROOT/'docs/combined-successor-20261110/binding-stage1.json').read_text());b=json.loads((ROOT/'docs/watcher-price-followon-20261110/binding-successor.json').read_text());inv=json.loads((ROOT/b['inverse']).read_text())['restore']
a1={p:(v['mode'],v['gitBlobSHA1']) for p,v in b1['files'].items()};a2={p:(b['files'][p]['mode'],b['files'][p]['gitBlobSHA1']) for p in b['writePaths']}
S1tree=overlay(MAIN,a1);S2tree=overlay(S1tree,a2);Rtree=overlay(S2tree,{r['path']:None if r['sha'] is None else (r['mode'],r['sha']) for r in inv})
assert Rtree==S1tree
L1,L2=leaves(S1tree),leaves(S2tree);diff=sorted(p for p in set(L1)|set(L2) if L1.get(p)!=L2.get(p));assert diff==sorted(b['writePaths'])
for p,v in b['files'].items():
 assert L2[p]==[v['mode'],v['gitBlobSHA1']]
 raw=subprocess.check_output(['git','cat-file','blob',v['gitBlobSHA1']],cwd=ROOT)
 assert len(raw)==v['bytes'] and hashlib.sha256(raw).hexdigest()==v['sha256']
# Deterministic object identities; these are unpublished local rehearsal bases.
env=dict(os.environ,GIT_AUTHOR_NAME='Codex',GIT_AUTHOR_EMAIL='codex@users.noreply.github.com',GIT_COMMITTER_NAME='Codex',GIT_COMMITTER_EMAIL='codex@users.noreply.github.com',GIT_AUTHOR_DATE='2026-11-11T13:35:00Z',GIT_COMMITTER_DATE='2026-11-11T13:35:00Z')
base=git('commit-tree',S1tree,'-p',MAIN,'-m','Rehearsal ONLY: hypothetical reviewed Stage1 on retained current main [skip ci]',env=env)
tested=git('commit-tree',S2tree,'-p',base,'-m','Development Stage2 composition: closed46-path source on preserved current main',env=env)
x={'main':MAIN,'baseHypotheticalStage1':base,'testedStage2':tested,'stage1Tree':S1tree,'stage2Tree':S2tree,'inverseTree':Rtree,'boundCount':len(b['files']),'writeCount':len(diff),'inverseCount':len(inv),'newPathsAbsentAfterInverse':sum(r['sha'] is None for r in inv),'bindingSHA256':hashlib.sha256((ROOT/'docs/watcher-price-followon-20261110/binding-successor.json').read_bytes()).hexdigest(),'note':'OFFLINE_COMPOSITION_NOT_INSTALLED_STAGE1_OR_RUNTIME_VERIFICATION','changes':diff}
(P/'objects.json').write_text(json.dumps(x,indent=2)+'\n');print(json.dumps(x,indent=2))
