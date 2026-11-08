"""Disposable local Git protocol proof only; not production cap implementation or trading evidence."""
import os,subprocess,tempfile,json,concurrent.futures
from pathlib import Path
ENV={'PATH':os.environ['PATH'],'GIT_CONFIG_GLOBAL':'/dev/null','GIT_CONFIG_NOSYSTEM':'1','GIT_AUTHOR_NAME':'Synthetic','GIT_AUTHOR_EMAIL':'fixture@example.invalid','GIT_COMMITTER_NAME':'Synthetic','GIT_COMMITTER_EMAIL':'fixture@example.invalid'}
with tempfile.TemporaryDirectory(prefix='r1-budget-protocol-') as tmp:
 t=Path(tmp);bare=t/'remote.git';work=t/'work';work.mkdir()
 def run(*args,check=True):
  p=subprocess.run(['git',*args],cwd=work,env=ENV,capture_output=True,text=True)
  if check and p.returncode:raise RuntimeError(p.stderr)
  return p
 run('init','--bare','-q','--initial-branch=main',str(bare));run('init','-q','--initial-branch=main');(work/'fixture.txt').write_text('invented public fixture\n');run('add','fixture.txt');run('commit','-qm','fixture base');base=run('rev-parse','HEAD').stdout.strip();run('push','-q',str(bare),'HEAD:refs/heads/main')
 tips=[]
 for i in range(7):
  run('checkout','--detach','-q',base);(work/'fixture.txt').write_text('invented state '+str(i)+'\n');run('add','fixture.txt');run('commit','-qm','fixture state '+str(i));tips.append(run('rev-parse','HEAD').stdout.strip())
 def refs():return {x.split()[1]:x.split()[0] for x in run('ls-remote','--heads',str(bare)).stdout.splitlines()}
 def push(tip,name,slot):
  checkpoint='refs/heads/save-recovery/'+name;quota='refs/heads/r1-recovery-slot/'+slot
  p=run('push','--atomic','--force-with-lease='+checkpoint+':','--force-with-lease='+quota+':',str(bare),tip+':'+checkpoint,tip+':'+quota,check=False)
  return {'status':p.returncode,'checkpoint':checkpoint,'slot':quota,'tip':tip}
 # Both requests carry the same expected-empty slot lease, standing for absent/unknown/stale listings.
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  a=pool.submit(push,tips[0],'bot-A','bot');b=pool.submit(push,tips[1],'bot-B','bot');race=[a.result(),b.result()]
 assert sum(x['status']==0 for x in race)==1,race
 winner=next(x for x in race if x['status']==0);loser=next(x for x in race if x['status']!=0);remote=refs();assert remote[winner['slot']]==winner['tip'] and remote[winner['checkpoint']]==winner['tip'];assert loser['checkpoint'] not in remote,'partial atomic checkpoint leak'
 for tip,name,slot in zip(tips[2:5],['main-A','other-A','other-B'],['main','shared-0','shared-1']):assert push(tip,name,slot)['status']==0
 full=refs();assert len([x for x in full if x.startswith('refs/heads/save-recovery/')])==4
 rejected=[push(tips[5],'over-cap-A','shared-0'),push(tips[6],'over-cap-B','shared-1')];assert all(x['status']!=0 for x in rejected);assert refs()==full,'full budget mutated'
 # Stale deletion must not remove either ref; exact merged deletion removes both atomically.
 wrong=run('push','--atomic','--force-with-lease='+winner['slot']+':'+loser['tip'],'--force-with-lease='+winner['checkpoint']+':'+loser['tip'],str(bare),':'+winner['slot'],':'+winner['checkpoint'],check=False);assert wrong.returncode!=0 and refs()==full
 run('push','-q',str(bare),winner['tip']+':refs/heads/main');run('push','--atomic','--force-with-lease='+winner['slot']+':'+winner['tip'],'--force-with-lease='+winner['checkpoint']+':'+winner['tip'],str(bare),':'+winner['slot'],':'+winner['checkpoint']);after=refs();assert winner['slot'] not in after and winner['checkpoint'] not in after
 print(json.dumps({'scope':'DISPOSABLE_LOCAL_GIT_PROTOCOL_ONLY','concurrentEmptyLeaseAdmissions':race,'oneWinnerNoCheckpointLeak':True,'fourSlotsFull':True,'fullSlotAttemptsRefusedAtomically':True,'staleDeletionRefused':True,'mergedExactTipPairDeletionPassed':True,'logicalPayloadBoundIfEachCheckpointAtMost32MiB':{'slots':4,'perSlotMiB':32,'totalMiB':128},'physicalGitStorageOrFetchBoundClaimed':False,'productionSizeGuardOrIntegrationTested':False,'productionRefsWritten':0,'keysOrSettingsChanged':False},indent=2))
