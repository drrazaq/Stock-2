# Reproduce source-only reconciliation from pinned Git objects. No data files, credentials or network are used.
# Usage: python -I build-source-anchors.py /path/to/repository
from pathlib import Path
import ast, collections, difflib, hashlib, json, re, subprocess, sys, tempfile, os

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
AUDIT='5bcf4d2933c1d77b10b7c12489e2cfbb624387d9'
BASE='f6a9b1668d0591cf24a734034949b96b241fe35b'
LOCAL='e17d4181e00482eb88b412cc83499d2874ad1dde'
PUBLIC='e17d4181e00482eb88b412cc83499d2874ad1dde'
OUT=ROOT/'docs/validation/history03-source-anchor-reconciliation.json'
def show(commit,path):
 return subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT,env={**os.environ,'GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0'})
def sha(b): return hashlib.sha256(b).hexdigest()
allc=json.loads(show(AUDIT,'docs/history-03/all-claims.json'))
claims=json.loads(show(AUDIT,'docs/history-03/claims-catalogue.json'))['claims']+sum(allc['batches'].values(),[])
assert len(claims)==100 and len({x['id'] for x in claims})==100
groups=[('W04 W03 A01 D02 D03 D01 B04 E01','test/history03-claims.test.mjs'),
 ('B01 D15 S02 S03 B09 X07 X03 B12','test/history03-delivery-counts.test.mjs'),
 ('W07 W08 D08 B05 A05 S07 C02 C03','test/history03-vocabulary.test.mjs'),
 ('W01 W02 W15 A02 D05 W06 A03 W16 D04 A09 B06 W11 D12 B07 B08 W12 E02 D14 E04 A08 B10 B11 B14 D13 W13','test/history03-attribution.test.mjs')]
tested={k:f for ids,f in groups for k in ids.split()}
tested['X02']='tests/news-delivery.test.mjs'
tested['W05']='test/history03-source-anchors.test.mjs'
tested.update({k:'test/history03-source-anchors.test.mjs' for k in ['W09','A12','D07']})
tested['A10']='tests/incident-reporting.test.mjs'
prior=set('A07 A11 A13 S01 S04 S05 S06 W10 W14 X05 X06 B20 B21 B22 B23 B24 B25 B26 B27 B28 B29 B30 B31 B32 B33 B34 C10 C11 C12 D10 D11 D20 E10'.split())
policy={'A04':'P2','X01':'P1','X04':'P1','C04':'P1','E03':'P1','B02':'P1','C01':'P1','B03':'P2','D09':'P2','D06':'P4','B13':'STOP_DEFAULT'}
cache={}
def source(path):
 if path not in cache:
  before=show(BASE,path).decode().splitlines(); after=show(LOCAL,path).decode().splitlines()
  cache[path]=(before,after,difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes())
 return cache[path]
def relocate(path,oldline):
 before,after,ops=source(path)
 if not oldline:return {'path':path,'line':1,'basis':'FILE_SCOPE_ONLY','sha256':sha(show(LOCAL,path))}
 n=min(max(oldline-1,0),len(before)-1)
 for tag,a,b,c,d in ops:
  if a<=n<b:
   line=c+n-a+1 if tag=='equal' else min(c+1,len(after))
   return {'path':path,'line':line,'originalLine':oldline,'basis':'UNCHANGED_LINE_RELOCATED' if tag=='equal' else 'CHANGED_HUNK_LOCATION_ONLY','sha256':sha(show(LOCAL,path))}
 raise AssertionError((path,oldline))
scope=[]
tree=ast.parse(show(AUDIT,'docs/history-03/tools/catalogue_data_b5.py'))
for n in tree.body:
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SCOPE' for t in n.targets):scope=ast.literal_eval(n.value)
scope=list(scope) if not isinstance(scope,dict) else list(scope)
records=[]
for x in claims:
 key=x['id']; raw=x.get('source',''); files=re.findall(r'([\w-]+\.mjs)',raw)
 if key=='E10':files=scope
 anchors=[]
 for f in dict.fromkeys(files):
  match=re.search(re.escape(f)+r':(\d+)',raw)
  anchors.append(relocate(f,int(match[1]) if match else None))
 assert anchors,(key,raw)
 state='CORRECTION_REGRESSION_COVERED' if key in tested else 'OWNER_POLICY_TODO' if key in policy else 'PRIOR_AUDIT_ACCEPTABLE_NOT_REVALIDATED' if key in prior else 'RESIDUAL_SOURCE_REVIEW_REQUIRED'
 if key=='A06':state='ACCEPTED_BLOCK_REASON_WITH_UNQUANTIFIED_RECORD'
 record={'id':key,'state':state,'anchors':anchors,'acceptanceClosed':False}
 if key in tested:record['regressionFile']=tested[key]
 if key in policy:record['pendingPolicy']=policy[key]
 if key=='D01':record['erratum']='ERRATA-01: wording-only; original gate allegation superseded; P3 remains open'
 if key=='W01':record['pendingPolicy']='CURRENT_PLAN_CONFIRMATION'
 records.append(record)
extract={};literalDelta={}; toolHashes={};tools=['extract-claims.py','extract-claims-broad.py']
files=show(AUDIT,'docs/history-03/tools/production-files.txt').decode().splitlines()
with tempfile.TemporaryDirectory(prefix='history03-source-only-') as temp:
 scratch=Path(temp)
 for name in tools:
  code=show(AUDIT,'docs/history-03/tools/'+name);(scratch/name).write_bytes(code);toolHashes[name]=sha(code)
 hits={}
 for label,commit in [('production',BASE),('development',LOCAL)]:
  directory=scratch/label; directory.mkdir();extract[label]={};hits[label]={}
  for file in files:
   target=directory/file;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(show(commit,file))
  for name in tools:
   data=subprocess.check_output([sys.executable,'-I',str(scratch/name),str(directory),*files]);hits[label][name]=json.loads(data)
   extract[label][name]={'candidates':len(hits[label][name]),'sha256':sha(data)}
 for name in tools:
  old=hits['production'][name];new=hits['development'][name]
  a=collections.Counter((x['file'],x['text']) for x in old); b=collections.Counter((x['file'],x['text']) for x in new)
  literalDelta[name]={'unchangedOccurrences':sum((a&b).values()),'oldOccurrencesAbsent':sum((a-b).values()),'newOccurrences':sum((b-a).values())}
result={'kind':'HISTORY03_SOURCE_ANCHOR_RECONCILIATION_V1','auditCommit':AUDIT,'productionSource':BASE,'developmentSource':PUBLIC,'developmentTree':subprocess.check_output(['git','rev-parse',LOCAL+'^{tree}'],cwd=ROOT,text=True,env={**os.environ,'GIT_NO_LAZY_FETCH':'1','GIT_TERMINAL_PROMPT':'0'}).strip(),'note':'100 audit records relocated, not 100 accepted claims. Line mapping locates source; it is not semantic proof or raw-data authentication. No private data files are read or copied. Original catalogue and erratum remain immutable. Existing source corrections are preserved; this report changes no runtime or policy.','extractors':toolHashes,'productionFileListSha256':sha(show(AUDIT,'docs/history-03/tools/production-files.txt')),'extractCounts':extract,'literalDelta':literalDelta,'stateCounts':dict(collections.Counter(x['state'] for x in records)),'records':records}
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'records':len(records),'anchors':sum(len(x['anchors']) for x in records),'stateCounts':result['stateCounts'],'residualIDs':[x['id'] for x in records if x['state']=='RESIDUAL_SOURCE_REVIEW_REQUIRED'],'delta':literalDelta},indent=2))
