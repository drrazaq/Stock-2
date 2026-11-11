"""Offline composition aid for the FUTURE actual Stage1 main, never a production writer.
No overlay of hypothetical Stage1. No remote push/ref update. Source/tool reviews stay closed.
"""
import argparse,hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
B=ROOT/'docs/watcher-price-followon-20261110/binding-successor.json'
I=ROOT/'docs/watcher-price-followon-20261110/inverse-successor-to-stage1.json'
S1=ROOT/'docs/combined-successor-20261110/binding-stage1.json'
REFERENCE='5fccc6ec3e18c426531a0398b5085e2621a6e192'
OLD_MAIN='10a25bf67c506894a9da74d2ef0cab6aec75d169'
def git(*a,env=None,binary=False):
 r=subprocess.check_output(['git',*a],cwd=ROOT,env=env)
 return r if binary else r.decode().strip()
def leaves(ref):
 out={}
 for line in git('ls-tree','-r',ref).splitlines():
  info,path=line.split('\t',1);mode,_,sha=info.split();out[path]=(mode,sha)
 return out
def overlay(base,updates):
 fd,p=tempfile.mkstemp();os.close(fd);os.unlink(p);env=dict(os.environ,GIT_INDEX_FILE=p)
 try:
  git('read-tree',base,env=env)
  for path,v in updates.items():
   if v is None:git('update-index','--force-remove','--',path,env=env)
   else:git('update-index','--add','--cacheinfo',v[0]+','+v[1]+','+path,env=env)
  return git('write-tree',env=env)
 finally:
  if os.path.exists(p):os.unlink(p)
def check_and_build(main,create=False):
 if not re.fullmatch('[0-9a-f]{40}',main):raise ValueError('main must be an exact40hex observed commit, not a mutable ref')
 if subprocess.run(['git','merge-base','--is-ancestor',OLD_MAIN,main],cwd=ROOT).returncode:raise ValueError('main no longer descends from retained base; STOP')
 b=json.loads(B.read_text());inv=json.loads(I.read_text())['restore'];s1=json.loads(S1.read_text());m=leaves(main)
 if hashlib.sha256(B.read_bytes()).hexdigest()!='f3b01676729edf833c210ca07487e4c895d29d3c0ee7acb18a97128e9dcb5577':raise ValueError('reviewed binding fingerprint changed')
 drift=[p for p,v in s1['files'].items() if m.get(p)!=(v['mode'],v['gitBlobSHA1'])]
 if drift:raise ValueError('actual Stage1 identity absent/drifted; NEVER overlay it: '+','.join(drift))
 before={p:None if not v.get('before') else (v['before']['mode'],v['before']['gitBlobSHA1']) for p,v in b['files'].items()}
 drift=[p for p in b['files'] if m.get(p)!=before[p]]
 if drift:raise ValueError('Stage2 starting bound identities drifted: '+','.join(drift))
 updates={p:(b['files'][p]['mode'],b['files'][p]['gitBlobSHA1']) for p in b['writePaths']}
 tree=overlay(main,updates);after=leaves(tree)
 changed=sorted(p for p in set(m)|set(after) if m.get(p)!=after.get(p))
 if changed!=sorted(b['writePaths']):raise ValueError('not exactly39reviewed writes')
 for p,v in b['files'].items():
  raw=git('cat-file','blob',v['gitBlobSHA1'],binary=True)
  if after.get(p)!=(v['mode'],v['gitBlobSHA1']) or len(raw)!=v['bytes'] or hashlib.sha256(raw).hexdigest()!=v['sha256']:raise ValueError('after fingerprint mismatch '+p)
 restored=overlay(tree,{r['path']:None if r['sha'] is None else (r['mode'],r['sha']) for r in inv})
 if restored!=git('rev-parse',main+'^{tree}'):raise ValueError('inverse does not restore actual parent exactly')
 nd=[l for l in git('diff','--name-status','--no-renames',REFERENCE,tree).splitlines() if not l.split('\t')[-1].startswith('data/')]
 result={'status':'COMPOSITION_ONLY_NOT_WRITER_SETTLEMENT_OR_APPROVAL','actualMain':main,'oldTestedReference':REFERENCE,'tree':tree,'inverseTree':restored,'bound':len(b['files']),'writes':len(changed),'inverse':len(inv),'newlyDeletedByInverse':[r['path'] for r in inv if r['sha'] is None],'nonDataDiffFromOldTested':nd,'focusedReviewRequired':bool(nd),'rootInventory':[p for p in after if re.fullmatch(r'test/[^/]+\.test\.mjs',p)],'writerCompletionRuntimeAndHostedEvidence':'MUST be supplied separately from actual future records; never inferred here'}
 if create:result['localCandidate']=git('commit-tree',tree,'-p',main,'-m','Development Stage2 FINAL composition after writer settlement; not production approval')
 return result
def audit_since(parent,current):
 if not all(re.fullmatch('[0-9a-f]{40}',v) for v in [parent,current]):raise ValueError('audit requires exact40hex observed commits')
 chain=git('rev-list','--first-parent',current).splitlines()
 if parent not in chain:raise ValueError('final parent not on current first-parent chain; STOP')
 rows=[]
 for sha in git('rev-list','--first-parent',parent+'..'+current).splitlines():
  ps=git('show','-s','--format=%P',sha).split();paths=git('diff','--name-only',ps[0],sha).splitlines()
  nd=[p for p in paths if not p.startswith('data/')]
  if nd:rows.append({'sha':sha,'committerAt':git('show','-s','--format=%cI',sha),'nonDataPaths':nd})
 return {'status':'STOP_NONDATA_SINCE_FINAL' if rows else 'CLEAR_DATA_ONLY_OR_IDENTICAL_NOT_WRITE_ADMISSION','finalParent':parent,'currentMain':current,'nonDataCommits':rows,'note':'All entries count, even a later revert restoring identical leaves. Actual writer/census/presence gates remain external.'}
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--main',required=True);ap.add_argument('--output',required=True);ap.add_argument('--create-local-candidate',action='store_true');ap.add_argument('--audit-parent');a=ap.parse_args()
 try:r=audit_since(a.audit_parent,a.main) if a.audit_parent else check_and_build(a.main,a.create_local_candidate)
 except (ValueError,subprocess.CalledProcessError) as e:print(json.dumps({'status':'STOP','why':str(e)}));raise SystemExit(2)
 Path(a.output).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['rootInventory','nonDataDiffFromOldTested','newlyDeletedByInverse']},indent=2))
 if r['status'].startswith('STOP'):raise SystemExit(2)
