import subprocess,json,yaml,fnmatch,datetime as dt,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
BASE='6e72a8d0c46385f3c329157d627636875505a224';HANDOFF='93c8a4e4'
def blob(ref,p):return subprocess.check_output(['git','show',ref+':'+p],cwd=ROOT,text=True)
def field(s,n,lo,hi):
 out=set()
 for part in s.split(','):
  frag,*steps=part.split('/');step=int(steps[0]) if steps else 1
  if frag=='*':a,b=lo,hi
  elif '-' in frag:a,b=map(int,frag.split('-'))
  else:a=b=int(frag)
  out.update(range(a,b+1,step))
 return n in out

def matches(cron,t):
 a,b,c,d,e=cron.split();assert c=='*' and d=='*',cron
 return field(a,t.minute,0,59) and field(b,t.hour,0,23) and field(e,(t.weekday()+1)%7,0,6)
allrows=[];scheduled=[]
for p in subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'.github/workflows'],cwd=ROOT,text=True).splitlines():
 s=blob(BASE,p);j=yaml.load(s,Loader=yaml.BaseLoader);on=j.get('on',{});on=on if isinstance(on,dict) else {str(on):None}
 # Follow remaining scheduled callers: main helper and squad26-watch internal publisher.
 writer='git push' in s or p in ('.github/workflows/main.yml','.github/workflows/squad26-watch.yml')
 if p=='.github/workflows/squad26-watch.yml':
  body=blob(BASE,'squad26-watch.mjs');assert "g('push', '-q')" in body and 'NO_GIT:' not in s
 row={'path':p,'name':p.rsplit('/',1)[-1][:-4],'sourceSha256':hashlib.sha256(s.encode()).hexdigest(),'triggers':list(on),'cron':[x['cron'] for x in on.get('schedule',[])],'writer':writer,'push':on.get('push')}
 allrows.append(row)
 if row['cron'] and writer:scheduled.append(row)
pause10=['ignition','bot','main','movers','options-survey','Smart-money','leaders-study','opportunity-radar','scorecard-1023','fastmover-intraday']
windows={}
for end in ['2026-11-14T10:00','2026-11-14T17:00','2026-11-14T19:00','2026-11-15T07:00']:
 t1=dt.datetime.fromisoformat(end);t0=t1-dt.timedelta(hours=14);extras=[]
 for row in scheduled:
  fires=[];t=t0
  while t<=t1:
   if any(matches(c,t) for c in row['cron']):fires.append(t.isoformat()+'Z')
   t+=dt.timedelta(minutes=1)
  if fires and row['name']not in pause10:extras.append({'workflow':row['name'],'fires':fires})
 windows[end+'Z']={'lookbackStart':t0.isoformat()+'Z','extraCount':len(extras),'extras':extras}
start_based={}
for end in windows:
 t1=dt.datetime.fromisoformat(end.removesuffix('Z'));t0=t1-dt.timedelta(hours=16);extras=[]
 for row in scheduled:
  fires=[];t=t0
  while t<=t1:
   if any(matches(c,t) for c in row['cron']):fires.append(t.isoformat()+'Z')
   t+=dt.timedelta(minutes=1)
  if fires and row['name']not in pause10:extras.append({'workflow':row['name'],'fires':fires})
 start_based[end]={'lookbackStart':t0.isoformat()+'Z','extraCount':len(extras),'extras':extras}
binding=json.loads(blob(HANDOFF,'docs/r1-combined-binding/binding.json'));bound=list(binding['files']);push=[]
for r in allrows:
 if 'push' not in r['triggers']:continue
 x=r['push']or{};pats=x.get('paths',['**']);ignore=x.get('paths-ignore',[])
 matched=[p for p in bound if any(fnmatch.fnmatchcase(p,pat) for pat in pats) and not any(fnmatch.fnmatchcase(p,pat) for pat in ignore)]
 push.append({'workflow':r['name'],'paths':pats,'ignore':ignore,'matchingBoundPaths':matched})
claimed=json.loads(blob(HANDOFF,'docs/r1-release-operator/census-scheduled-main-pushers.json'))
result={'main':BASE,'operatorHandoff':HANDOFF,'workflowCount':len(allrows),'scheduledMainPushers':len(scheduled),'missingFromClaudeCensus':sorted({r['name']for r in scheduled}-{r['workflow']for r in claimed}),'windows14HoursBeforeEnd':windows,'windows14HoursBeforeStart':start_based,'pushPathMatches':push,'otherEventTriggers':[{'workflow':r['name'],'events':[e for e in r['triggers']if e in ['workflow_run','repository_dispatch','issue_comment','issues']]}for r in allrows if any(e in r['triggers']for e in ['workflow_run','repository_dispatch','issue_comment','issues'])],'sourceRows':allrows,'limits':['Cron enumeration is a scheduling heuristic, not a maximum queue-delay guarantee or actual state capture.','Source does not authenticate external researcher/AgentA timing; those remain operator/owner coordination facts.','main helper and squad26-watch internal publication included; branches, dispatch actors and unreviewed future source changes require fresh gates.']}
(Path(__file__).resolve().parent/'census-independent.json').write_text(json.dumps(result,indent=2)+'\n')
print('scheduled main pushers:',len(scheduled),'missing:',result['missingFromClaudeCensus'])
print('windows end-based:',[(k,v['extraCount'])for k,v in windows.items()]);print('windows start-based:',[(k,v['extraCount'])for k,v in start_based.items()]);print('push matches:',[r['workflow']for r in push if r['matchingBoundPaths']]);print('other triggers',result['otherEventTriggers'])
