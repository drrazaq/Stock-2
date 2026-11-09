# Linux-only synthetic controller; no network/credentials. Own subreaper prevents new orphan zombies in the regression.
import ctypes,json,os,pathlib,signal,subprocess,sys,time
repo,node,folder=map(str,sys.argv[1:]);root=pathlib.Path(folder)/'store'
libc=ctypes.CDLL(None,use_errno=True)
if libc.prctl(36,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'synthetic subreaper unavailable')
def interrupted(number,frame):raise SystemExit(128+number)
for number in [signal.SIGINT,signal.SIGTERM]:signal.signal(number,interrupted)
module=(pathlib.Path(repo)/'a-fenced-store.mjs').as_uri()
script="""import fs from 'node:fs';import assert from 'node:assert/strict';import {createAFencedStore} from MODULE;
const root=ROOT,h='a'.repeat(64),store=createAFencedStore(root,{origin:'SYNTHETIC',cohortHash:h,contractHash:h}),token=store.claim({expectedToken:null,owner:'SYNTHETIC_WORKER_DEADLINE',at:'2026-11-06T12:00:00Z',boundaryEvidenceHash:h}).token,lock=fs.statSync(root+'/.a-writer.lock'),start=performance.now();
let error,cause;try{store.append(token,'ACQUISITION','synthetic-losing-observation',{netUsd:-42},undefined,'PAUSE_AFTER_INTENT');}catch(e){error=e.message;cause=e.cause;}
assert.equal(error,'WRITE_OUTCOME_UNKNOWN');const elapsedMs=performance.now()-start,pendingBeforeRecovery=store.head().pending,before=Object.fromEntries(fs.readdirSync(root).map(n=>[n,fs.readFileSync(root+'/'+n)]));assert.equal(pendingBeforeRecovery,1);
store.recover(token);const loss=store.lookup(token,'ACQUISITION','synthetic-losing-observation'),retry=store.append(token,'ACQUISITION','synthetic-losing-observation',{netUsd:-42});for(const [n,b]of Object.entries(before))assert.deepEqual(fs.readFileSync(root+'/'+n),b,n);
const after=fs.statSync(root+'/.a-writer.lock');process.stdout.write(JSON.stringify({status:'SYNTHETIC_TIMEOUT_RECOVERY_VERIFIED',error,cause,elapsedMs,pendingBeforeRecovery,pendingAfterRecovery:store.head().pending,lossUsd:loss.record.payload.netUsd,idempotent:retry.idempotent,commitCount:fs.readdirSync(root).filter(n=>n.startsWith('commit-')).length,originalBytesPreserved:true,lockIdentityPreserved:lock.ino===after.ino&&lock.dev===after.dev&&after.nlink===1}));""".replace('MODULE',json.dumps(module)).replace('ROOT',json.dumps(str(root)))
p=subprocess.Popen([node,'--input-type=module','-e',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,env={'PATH':os.environ['PATH']})
saw=False;stopped=None;lock_result=None;timed=False;end=time.monotonic()+28
try:
 while p.poll() is None and time.monotonic()<end:
  if not saw:
   try: children=(pathlib.Path('/proc')/str(p.pid)/'task'/str(p.pid)/'children').read_text().split()
   except FileNotFoundError: children=[]
   # Some managed proc views expose PPid/status but an empty task tree. Inspect
   # only direct children of our known parent; never relax stopped/lock assertions.
   if not children:
    # Bound the query to our own direct children, not the host's process count.
    # ps has a two-second deadline and output goes to a local temporary file so
    # an unexpectedly large result cannot accumulate in captured memory.
    import tempfile
    with tempfile.TemporaryFile() as child_list:
     query=subprocess.run(['ps','--no-headers','--ppid',str(p.pid),'-o','pid='],stdout=child_list,stderr=subprocess.DEVNULL,timeout=2)
     if query.returncode not in (0,1):raise RuntimeError('bounded child inspection unavailable')
     if child_list.tell()>4096:raise RuntimeError('bounded child output exceeded')
     child_list.seek(0);children=child_list.read(4096).decode('ascii').split()
    if any(not pid.isdecimal() for pid in children):raise RuntimeError('invalid child identity')
   for pid in children:
    proc=pathlib.Path('/proc')/pid
    try:
     cmd=(proc/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace');state=(proc/'status').read_text()
    except OSError:continue
    if '--fenced-worker '+str(root) in cmd and 'State:\tT' in state:
     saw=True;stopped=int(proc.name);lock_result=subprocess.run(['flock','--exclusive','--nonblock','--conflict-exit-code','73',str(root/'.a-writer.lock'),'/bin/true'],capture_output=True,timeout=2).returncode;break
  time.sleep(.02)
 if p.poll() is None:timed=True;os.killpg(p.pid,signal.SIGKILL)
 stdout,stderr=p.communicate(timeout=3)
 live=False
 if stopped is not None:
  try:live=not (pathlib.Path('/proc')/str(stopped)/'status').read_text().split('State:',1)[1].lstrip().startswith('Z')
  except FileNotFoundError:pass
 result=json.loads(stdout)if p.returncode==0 else None
 print(json.dumps({'parentTimedOut':timed,'sawStoppedWorker':saw,'lockWhileStopped':lock_result,'liveWorkerAfterParent':live,'result':result,'parentExit':p.returncode,'stderr':stderr.decode(errors='replace')}))
 if p.returncode!=0:raise SystemExit(1)
finally:
 try:os.killpg(p.pid,signal.SIGKILL)
 except ProcessLookupError:pass
 p.wait(timeout=3)
 reap_end=time.monotonic()+3
 while time.monotonic()<reap_end:
  try:pid,status=os.waitpid(-1,os.WNOHANG)
  except ChildProcessError:break
  if pid==0:time.sleep(.01)
