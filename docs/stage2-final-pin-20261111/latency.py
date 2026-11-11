"""Read-only retained Git metadata analysis. No provider data or production writes."""
import datetime as dt,hashlib,json,math,re,statistics,subprocess
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=P.parents[1];HEAD='d276bbcb1c23923255f976f2f9e2aa06857c7c34';UTC=dt.timezone.utc
G=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT).decode()
shas=G('rev-list','--first-parent','--since=2026-11-04T00:00:00Z',HEAD).splitlines();rows=[]
for sha in reversed(shas):
 meta=G('show','-s','--format=%cI%n%aI%n%P%n%s',sha).splitlines();paths=G('diff-tree','--no-commit-id','--name-only','-r','--root',sha).splitlines();nd=[p for p in paths if not p.startswith('data/')]
 rows.append({'sha':sha,'committerAt':meta[0],'authorAt':meta[1],'firstParent':meta[2].split()[0] if meta[2] else None,'kind':'NONDATA' if nd else 'DATA_ONLY' if paths else 'EMPTY','nonDataPaths':nd,'subjectMentionsAgentC':bool(re.search(r'Agent C',meta[3],re.I))})
raw={'head':HEAD,'selection':'First-parent commits since2026-11-04T00:00Z, through pinned head. Metadata/path classes only; no private data contents or messages.','clock':'Git committer timestamp, NOT measured push/arrival time','rows':rows}
(P/'commit-metadata.json').write_text(json.dumps(raw,indent=2)+'\n')
def tm(r):return dt.datetime.fromisoformat(r['committerAt']).astimezone(UTC).timestamp()
def quantile(a,q):
 if not a:return None
 a=sorted(a);i=(len(a)-1)*q;l=int(i);return a[l]+(a[min(l+1,len(a)-1)]-a[l])*(i-l)
def gaps_summary(a):
 return {'n':len(a),'minSec':min(a) if a else None,'p10Sec':quantile(a,.1),'medianSec':quantile(a,.5),'p90Sec':quantile(a,.9),'maxSec':max(a) if a else None}
data=sorted(tm(r) for r in rows if r['kind']=='DATA_ONLY');nd=sorted(tm(r) for r in rows if r['kind']=='NONDATA')
selected=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11']
def windows(start,end,dates=None):
 return [(dt.datetime.fromisoformat(d+'T'+start+'+00:00').timestamp(),dt.datetime.fromisoformat(d+'T'+end+'+00:00').timestamp()) for d in (dates or selected)]
def summarize_window(ws):
 counts=[];gaps=[]
 for a,b in ws:
  d=dt.datetime.fromtimestamp(a,UTC).date().isoformat()
  ds=[x for x in data if a<=x<b];ns=[x for x in nd if a<=x<b];gaps.extend(y-x for x,y in zip(ds,ds[1:]));counts.append({'day':d,'dataCommits':len(ds),'nonDataCommits':len(ns),'dataAtUTC':[dt.datetime.fromtimestamp(x,UTC).isoformat() for x in ds]})
 return {'days':counts,'dataCount':sum(x['dataCommits'] for x in counts),'nonDataCount':sum(x['nonDataCommits'] for x in counts),'observedExposureMinutes':sum(b-a for a,b in ws)/60,'withinDayCompleteDataGaps':gaps_summary(gaps)}
def q_window(ws,L):
 # Uniform random eligible parent-read start within each historical window, with
 # enough time left for L. This is empirical time coverage, not future probability.
 safe=den=0
 for a,b in ws:
  if b-a<=L:continue
  seq=[a]+[x for x in data if a<x<b]+[b]
  safe+=sum(max(y-x-L,0) for x,y in zip(seq,seq[1:]));den+=b-a-L
 return safe/den if den else None
base=75.0;scenarios=[]
active=['2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-10','2026-11-11']
for phase,ws,prep in [('forward',windows('09:00:00','09:20:00'),75.0),('forwardSlowerPrep',windows('09:00:00','09:20:00'),120.0),('inverse',windows('06:45:00','07:30:00',active),5.0),('inverseSlowerPrep',windows('06:45:00','07:30:00',active),15.0),('fridayAInverse',windows('10:15:00','11:00:00'),5.0),('fridayAInverseSlowerPrep',windows('10:15:00','11:00:00'),15.0)]:
 for handoff in [0,15,30,60,120,300]:
  L=prep+handoff;q=q_window(ws,L)
  scenarios.append({'phase':phase,'assumedAttendedAdmissionSec':handoff,'assumedPreparationSec':prep,'assumedParentReadToPushSec':L,'empiricalNoDataChangeTimeShare':q,'IIDHypotheticalUncappedAttemptsToSuccess':1/q if q else None,'IIDHypotheticalExpectedAttemptsWithCap3':1+(1-q)+(1-q)**2 if q is not None else None,'threeAttemptElapsedLowerBoundSec':3*L,'notAFutureSuccessGuarantee':True})
anomalies=[{'earlierInMain':a['sha'],'laterInMain':b['sha']} for a,b in zip(rows,rows[1:]) if tm(b)<tm(a)]
# Exact current fixture barrier latency is mechanistic, not attended reaction.
fixture=[]
for s in (ROOT/'docs/stage2-retry-20261111/offline-exercise.log').read_text().splitlines():
 try:r=json.loads(s.strip())
 except ValueError:continue
 if r.get('admissionAt'):fixture.append(r)
full=json.loads((ROOT/'docs/stage2-retry-20261111/validation.json').read_text())['localFullSuite']
result={'status':'OBSERVED_METADATA_AND_CONDITIONAL_LATENCY_ANALYSIS_NOT_SUCCESS_PREDICTION','head':HEAD,'commits':len(rows),'dataCommits':len(data),'nonDataCommits':len(nd),'emptyCommits':sum(r['kind']=='EMPTY' for r in rows),'outOfOrderCommitClocks':anomalies,'allCompleteDataIntervals':gaps_summary([b-a for a,b in zip(data,data[1:])]),'target0900to0920':summarize_window(windows('09:00:00','09:20:00')),'broader0530to0935':summarize_window(windows('05:30:00','09:35:00')),'reviewerWholeA0900to1200':summarize_window(windows('09:00:00','12:00:00')),'activeMorning0530to0830':summarize_window(windows('05:30:00','08:30:00',active)),'fridayAInverse1015to1100':summarize_window(windows('10:15:00','11:00:00')),'inverse0645to0730':summarize_window(windows('06:45:00','07:30:00',active)),'scenarios':scenarios,'baseline':{'freshFullSuiteDurationSec':full['durationMs']/1000,'reviewerSameTreeFullSuiteDurationSec':80.5,'reviewerDurationProvenance':'Claude receipt6801163293, independently run on same tested tree','forwardPlanningPreparationSec':120,'actualPerAttemptSuiteTime':'logged by passed tool; historical q is NOT recomputed live','modeledPreparationSec':base,'unmeasuredGitWorktreeOverheadAssumptionSec':base-full['durationMs']/1000,'realAttendedAdmissionLatency':'NOT MEASURED; fixture admission is automatic/offline and cannot estimate operator/verifier turn latency','fixtureAdmissions':len(fixture),'inversePreparationScenarioSec':[5,15],'inverseNetworkAndAttendedLatencyUnmeasured':True},'assumptions':['No non-data writer after actual settlement; any such change is STOP, not retry-success modeling.','Future data-commit timing resembles these small historical morning windows; this may fail on Friday or after repairs.','Git committer time approximates arrival; push delay, rebase and clock uncertainty are not measured. Repository-events endpoint was unavailable through the current connector, not proof no events exist.','q is empirical safe time share for uniform eligible starts; reciprocal/capped-attempt figures additionally assume independent repeated attempts. Real retries and batching are correlated.','Zero observed data changes in a historical minute/window is not proof no future write occurs.','75second preparation baseline is a scenario from observed full-suite runtime plus assumed overhead, not a guaranteed bound.','A cap of3 can end in STOP. No finite actual expected attempts-to-success is established when failure/UNKNOWN/non-data drift/cutoff can terminate the attempt.']}
(P/'latency-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['commits','dataCommits','nonDataCommits','allCompleteDataIntervals','target0900to0920','scenarios','baseline']},indent=2))
