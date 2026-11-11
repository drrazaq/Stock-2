"""Read-only object/census evidence; no network, credentials or workflow execution."""
import hashlib,json,re,subprocess,posixpath
from functools import lru_cache
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BIND='docs/watcher-price-followon-20261110/binding-successor.json'
REFS={'proposal':'ee725432e2a6b535ecb53d55ff4d078f978347bd','current':'716b158307a9d09e5ac39b5f562a7f12245f604e','stage1':'eb8806f5b84155d28d3ebdf0482981f55f0124fd'}
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
@lru_cache(maxsize=None)
def read(ref,path):return git('show',ref+':'+path)
def tree(ref):
 out={}
 for line in git('ls-tree','-r',ref).decode().splitlines():
  meta,path=line.split('\t',1);mode,kind,sha=meta.split();out[path]={'mode':mode,'sha':sha}
 return out

def disposition(*,stage1_pass,nightly_created,nightly_complete,adopted,intraday,selected_nightly,at_decision,safe,pair):
 if not stage1_pass or not nightly_created or not nightly_complete:return 'DEFER_BEFORE_PUBLICATION'
 if not at_decision:return 'PENDING_NOT_READY'
 if adopted and intraday and selected_nightly:return 'EVIDENCE_REVIEW_REQUIRED_NOT_AUTOMATIC_PASS'
 if not safe or not pair:return 'INVERSE_REQUIRED_BLOCKED_UNVERIFIED_LATE_RECOVERY_PENDING'
 return 'ONE_39_PATH_INVERSE_REQUIRED'

def census(ref,bound):
 t=tree(ref); out=[]
 @lru_cache(maxsize=None)
 def refs(path):
  s=read(ref,path).decode(errors='replace')
  # Static imports, literal dynamic imports, source reads and literal launched scripts.
  # No arbitrary mentions in comments or data strings count as executable imports.
  s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
  s='\n'.join(line for line in s.splitlines() if not line.lstrip().startswith(('//','#')))
  if path.endswith(('.yml','.yaml','.sh')):
   values=re.findall(r'(?:node|bash|sh)\s+([\w./-]+\.(?:mjs|cjs|sh))',s)
  else:
   values=re.findall(r"(?:from\s*|import\s*\(|import\s+|readFileSync\s*\(|execFileSync\s*\(\s*['\"]node['\"]\s*,\s*\[\s*)['\"]([\w./-]+\.(?:mjs|cjs|sh))['\"]",s)
  found=set()
  for v in values:
   for q in (posixpath.normpath(posixpath.join(posixpath.dirname(path),v)),v.removeprefix('./')):
    if q in t:found.add(q);break
  return found
 for p in sorted(t):
  if not p.startswith('.github/workflows/') or not p.endswith(('.yml','.yaml')):continue
  s=read(ref,p).decode()
  schedules=re.findall(r"cron:\s*['\"]([^'\"]+)",s)
  if not schedules:continue
  seen=set();todo=list(refs(p))
  while todo:
   q=todo.pop()
   if q in seen:continue
   seen.add(q);todo.extend(refs(q)-seen)
  hits=sorted(seen&bound)
  if p in bound:hits.append(p)
  out.append({'workflow':p,'workflowBlob':t[p]['sha'],'schedules':schedules,'boundReferences':hits,'literalClosure':sorted(seen),'reviewRequired':bool(hits)})
 return out

def main():
 b=json.loads(read(REFS['proposal'],BIND));cur=tree(REFS['current']);src=tree(REFS['proposal']);bound=set(b['files']);writes=b['writePaths']
 # Rebuild Stage1 on current main before considering Stage2. Source object from
 # original closed binding is available without fetching the tested C2 commit.
 b1=json.loads(read(REFS['proposal'],'docs/combined-successor-20261110/binding-stage1.json'))
 stage1=dict(cur)
 for p,v in b1['files'].items():stage1[p]={'mode':v['mode'],'sha':v['gitBlobSHA1']}
 candidate=dict(stage1)
 for p in writes:candidate[p]=src[p]
 after_errors=[p for p,v in b['files'].items() if candidate.get(p)!={'mode':v['mode'],'sha':v['gitBlobSHA1']}]
 fingerprint_errors=[]
 for p,v in b['files'].items():
  raw=git('cat-file','blob',candidate[p]['sha'])
  if len(raw)!=v['bytes'] or hashlib.sha256(raw).hexdigest()!=v['sha256']:fingerprint_errors.append(p)
 inv=json.loads(read(REFS['proposal'],b['inverse']))
 restored=dict(candidate)
 for item in inv['restore']:
  p=item['path']
  if item.get('sha') is None:restored.pop(p,None)
  else:restored[p]={'mode':item['mode'],'sha':item['sha']}
 inverse_errors=[p for p in set(restored)|set(stage1) if restored.get(p)!=stage1.get(p)]
 # Exact inverse representation is checked below after retaining its original schema.
 report={'status':'OFFLINE_OBJECT_EVIDENCE_NOT_RUNTIME','refs':REFS,'bindingSHA256':hashlib.sha256(read(REFS['proposal'],BIND)).hexdigest(),'boundPaths':len(bound),'writes':len(writes),'afterErrors':after_errors,'fingerprintErrors':fingerprint_errors,'inverseEntries':len(inv['restore']),'inverseErrors':inverse_errors,'census':{k:census(v,bound) for k,v in REFS.items() if k!='stage1'}}
 Path(__file__).with_name('composition-census.json').write_text(json.dumps(report,indent=2)+'\n')
 if after_errors or inverse_errors or fingerprint_errors:raise SystemExit('STOP: source composition mismatch')
if __name__=='__main__':main()
