"""Candidate-specific manual admission boundaries, local bare remotes only."""
import datetime as dt,json,os,subprocess,tempfile,time
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=P.parents[1];o=json.loads((P/'objects.json').read_text())
binding=ROOT/'docs/watcher-price-followon-20261110/binding-successor.json';inverse=ROOT/'docs/watcher-price-followon-20261110/inverse-successor-to-stage1.json'
common=Path(subprocess.check_output(['git','rev-parse','--git-common-dir'],cwd=ROOT).decode().strip())
if not common.is_absolute():common=ROOT/common
objects_path=str(common.resolve()/'objects')+'\n'
genv=dict(os.environ,GIT_AUTHOR_NAME='fixture',GIT_AUTHOR_EMAIL='fixture@example.invalid',GIT_COMMITTER_NAME='fixture',GIT_COMMITTER_EMAIL='fixture@example.invalid')
for k in ['STAGE2_TEST_ADMIT','STAGE2_PUSH','STAGE2_TEST_PREPUSH_SLEEP']:genv.pop(k,None)
results=[]
with tempfile.TemporaryDirectory(prefix='stage2-admission-only-') as tmp:
 w=Path(tmp)
 def g(*args,cwd=None):return subprocess.check_output(['git',*args],cwd=cwd,env=genv).decode().strip()
 def setup(n,mode='inverse',fileurl=False):
  root=w/str(n);root.mkdir();bare=root/'remote.git';g('init','-q','--bare',str(bare));(bare/'objects/info/alternates').write_text(objects_path)
  base=o['testedStage2'] if mode=='inverse' else o['baseHypotheticalStage1'];g('--git-dir',str(bare),'update-ref','refs/heads/main',base)
  op=root/'op';subprocess.run(['git','clone','-q','--shared',str(bare),str(op)],env=genv,check=True,capture_output=True)
  if fileurl:g('remote','set-url','origin',bare.as_uri(),cwd=op)
  return root,bare,op,base
 def invoke(n,kind,mode='inverse'):
  root,bare,op,base=setup(n,mode,fileurl=kind=='hook-fileurl');env=dict(genv);now=dt.datetime.now(dt.timezone.utc)
  deadline=now+dt.timedelta(seconds=3 if kind in ['timeout','partial'] else 120)
  cmd=['python3',str(P/'stage2_retry.py'),'--mode',mode,'--binding',str(binding),'--inverse',str(inverse),'--tested',o['testedStage2'],'--deadline',deadline.isoformat(),'--suite','node --test test/recovery-floor.test.mjs']
  if mode=='inverse':cmd+=['--decision',now.isoformat()]
  if kind=='hook-fileurl':env['STAGE2_TEST_ADMIT']='1'
  if kind=='stale-retry':
   # First request is explicitly refused after a data-only competing commit.
   helper=root/'push.sh';helper.write_text('''#!/bin/bash
set -e
nfile="$FIXTURE_ROOT/n"
n=$(cat "$nfile" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$nfile"
if [ "$n" = 1 ]; then
  parent=$(git --git-dir="$FIXTURE_BARE" rev-parse refs/heads/main)
  blob=$(printf newdata | git hash-object -w --stdin)
  idx="$FIXTURE_ROOT/index"; GIT_INDEX_FILE="$idx" git read-tree "$parent"
  GIT_INDEX_FILE="$idx" git update-index --add --cacheinfo "100644,$blob,data/admission-race.json"
  tree=$(GIT_INDEX_FILE="$idx" git write-tree)
  changed=$(git commit-tree "$tree" -p "$parent" -m 'fixture data-only race')
  git push -q origin "$changed:refs/heads/main"
fi
exec git push --porcelain "$@"
''');helper.chmod(0o755);env.update(STAGE2_PUSH=str(helper),FIXTURE_ROOT=str(root),FIXTURE_BARE=str(bare))
  fifo_fd=None
  if kind=='fifo':
   os.mkfifo(root/'admit.fifo');fifo_fd=os.open(root/'admit.fifo',os.O_RDWR)
  proc=subprocess.Popen(cmd,cwd=op,env=env,stdin=fifo_fd if fifo_fd is not None else subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  logs=[];admissions=0;first=None
  if kind in ['eof','hook-fileurl']:
   out,err=proc.communicate('',timeout=40);logs=out.splitlines()
  else:
   for line in proc.stdout:
    logs.append(line.rstrip())
    try:r=json.loads(line)
    except ValueError:continue
    if 'admissionRequired' not in r:continue
    admissions+=1;prefix=r['admissionRequired'].split()[:4];answer=' '.join(prefix+['FIXTURE_CENSUS','FIXTURE_WRITER','FIXTURE_VERIFIER'])
    if first is None:first=answer
    if kind=='invalid':answer='ADMIT inverse wrong wrong C W V'
    if kind=='stale-retry':answer=first
    if kind=='timeout':continue
    if kind=='partial':proc.stdin.write('A');proc.stdin.flush();continue
    if fifo_fd is not None:os.write(fifo_fd,(answer+'\n').encode())
    else:proc.stdin.write(answer+'\n');proc.stdin.flush()
   proc.wait(timeout=10);err=proc.stderr.read()
  rc=proc.returncode;after=g('--git-dir',str(bare),'rev-parse','refs/heads/main')
  parsed=[]
  for l in logs:
   try:parsed.append(json.loads(l))
   except ValueError:pass
  if fifo_fd is not None:os.close(fifo_fd)
  if kind in ['valid','fifo']:
   assert rc==0 and after!=base and admissions==1,(rc,err,logs)
  elif kind=='stale-retry':
   assert rc==2 and after!=base and admissions==2,(rc,err,logs)
   assert parsed[-1]['why'].startswith('missing or mismatched'),logs
   # No inverse was published; only the fixture data commit landed.
   assert g('--git-dir',str(bare),'log','--format=%s',base+'..'+after)=='fixture data-only race'
  else:assert rc==2 and after==base,(rc,err,logs)
  results.append({'case':n,'kind':kind,'mode':mode,'pass':True,'rc':rc,'admissions':admissions,'final':parsed[-1] if parsed else err[-300:]})
 invoke('A1','eof','forward');invoke('A2','eof');invoke('A3','invalid');invoke('A4','valid');invoke('A5','stale-retry');invoke('A6','timeout');invoke('A7','hook-fileurl');invoke('A8','fifo');invoke('A9','partial')
print(json.dumps({'offlineOnly':True,'pass':len(results),'fail':0,'cases':results},indent=2))
