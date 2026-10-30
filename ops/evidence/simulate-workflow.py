# Usage: python3 ops/evidence/simulate-workflow.py <amended bot.yml> ops/accounting-preflight-v2.mjs scan.mjs   (needs: pyyaml, cryptography)
# reviewer scratch: run the amended accounting-preflight job's shell steps on synthetic repos (URLs swapped to local)
import yaml,subprocess,os,sys,tempfile,shutil,json,hashlib,base64
wf=yaml.safe_load(open(sys.argv[1]));checker=sys.argv[2];prodscan=sys.argv[3]
steps={s.get('name'):s for s in wf['jobs']['accounting-preflight']['steps'] if 'run' in s}
env0={'PATH':os.environ['PATH'],'HOME':tempfile.gettempdir(),'GIT_AUTHOR_NAME':'f','GIT_AUTHOR_EMAIL':'f@x','GIT_COMMITTER_NAME':'f','GIT_COMMITTER_EMAIL':'f@x','GIT_CONFIG_GLOBAL':'/dev/null'}
def g(c,*a): return subprocess.run(['git',*a],cwd=c,env=env0,capture_output=True,text=True,check=True).stdout.strip()
def enc(o,key):
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  k=hashlib.sha256(key.encode()).digest();iv=os.urandom(12);ct=AESGCM(k).encrypt(iv,json.dumps(o).encode(),None)
  return base64.b64encode(iv+ct[-16:]+ct[:-16]).decode()
def scenario(name,change=None,key='k',state=None):
  t=tempfile.mkdtemp();src=t+'/src';os.makedirs(src+'/data');g(t,'init','-q','-b','main',src)
  shutil.copy(prodscan,src+'/scan.mjs');open(src+'/data/private.enc','w').write(enc(state or {'shares':{}},'k'));open(src+'/data/my-positions.json','w').write('{}');open(src+'/data/my-trades.jsonl','w').write('{"sym":"Z","kind":"manual"}\n')
  g(src,'add','-A');g(src,'commit','-qm','s');g(src,'config','uploadpack.allowFilter','true')
  ws=t+'/ws';g(t,'clone','-q','--filter=blob:none','file://'+src,ws)
  if change: change(src)
  rt=t+'/rt';os.makedirs(rt);out=t+'/out';open(out,'w').close()
  blob=subprocess.run(['git','hash-object','--no-filters',checker],capture_output=True,text=True).stdout.strip()
  json.dump({'encoding':'base64','content':base64.b64encode(open(checker,'rb').read()).decode()},open(rt+'/src.json','w'))
  e={**env0,'RUNNER_TEMP':rt,'GITHUB_WORKSPACE':ws,'GITHUB_OUTPUT':out,'GIT_TERMINAL_PROMPT':'0'}
  if key: e['PRIVATE_KEY']=key
  res=[]
  for n in ['Verify immutable offline checker','Protected offline pending-sale check','Emit only protected result after state freshness check']:
    sh=steps[n]['run'].replace('curl --max-time 20 -fsSL https://api.github.com/repos/drrazaq/Stock-2/git/blobs/'+blob+' -o "$RUNNER_TEMP/accounting-preflight-source.json" 2>/dev/null','cp "$RUNNER_TEMP/src.json" "$RUNNER_TEMP/accounting-preflight-source.json"').replace('https://github.com/drrazaq/Stock-2.git','file://'+src)
    shell=['bash','--noprofile','--norc','-e','-o','pipefail','-c',sh]
    r=subprocess.run(shell,cwd=ws,env=e,capture_output=True,text=True);res.append((n[:7],r.returncode,r.stdout.strip()))
    if n.startswith('Verify') and r.returncode!=0: break
  outputs=dict(l.split('=',1) for l in open(out).read().split('\n') if '=' in l)
  print(json.dumps({'scenario':name,'emit':res[-1],'outputs':outputs,'leftover':sorted(os.listdir(rt))}))
  shutil.rmtree(t)
def commit(f):
  def c(src): f(src);g(src,'add','-A');g(src,'commit','-qm','c')
  return c
scenario('clean main, no change during preflight')
scenario('unrelated change on main during preflight',commit(lambda s:open(s+'/data/other.json','w').write('{}')))
scenario('scan.mjs changed on main during preflight',commit(lambda s:open(s+'/scan.mjs','a').write('\n')))
scenario('privacy marker committed during preflight',commit(lambda s:(os.makedirs(s+'/.github',exist_ok=True),open(s+'/.github/private-data-mode','w').close())))
scenario('no PRIVATE_KEY available',key=None)
scenario('pending sale in authenticated state',state={'pendingSale':{'id':'x'}})
scenario('wrong key',key='wrong')
