"""One-off retained-evidence extraction; no strategy run, API, cache search or outcome imputation."""
import json,hashlib,statistics,time
from pathlib import Path
started=time.perf_counter();root=Path(__file__).resolve().parents[2];pins={}
def read(path):
 b=(root/path).read_bytes();pins[path]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()};return json.loads(b)
selection={'data/squad7-lab.json':['SQ7-DEEPGAP','SQ7-DEEPEARN','SQ7-DEEPNODIL'],'data/squad11-lab.json':['SQ11-PB8','SQ11-PB12'],'data/squad14-lab.json':['SQ14-PB12M']};studies=[]
for path,ids in selection.items():
 p=read(path)
 for id in ids:
  r=p['firstRun'][id]
  studies.append({'id':id,'source':path,'version':'firstRun_UNCHANGED','verdict':r['verdict'],'reason':r['why'],'cost':r.get('cost',p.get('cost')),'hold':r.get('hold'),'halves':{h:{k:v for k,v in r['results'][h].items() if k in ['n','days','avg','avgStress','median','edge','vsOwn','tBlock','noTop2','worst']} for h in ['older','newer']},'exits':r.get('exits'),'savedModelOnly':True})
 p_current=p.get('trades',{})
 if path=='data/squad11-lab.json':
  current=[]
  for id in ids:
   rows=p_current[id];nets=[r['net'] for r in rows if isinstance(r.get('net'),(int,float))]
   current.append({'id':id,'retainedRows':len(rows),'numericModelOutcomes':len(nets),'positive':sum(n>0 for n in nets),'negative':sum(n<0 for n in nets),'zero':sum(n==0 for n in nets),'meanOfRetainedNumericOnly':statistics.mean(nets),'exitKinds':{k:sum(r.get('kind')==k for r in rows) for k in sorted({r.get('kind','MISSING') for r in rows})},'rowsWithExactEntryPrice':sum(any(k in r for k in ['entryPrice','entry','entryAsk','fillPrice']) for r in rows),'rowsWithOperatingIncomeFilingEvidence':sum('operatingIncomeEvidence' in r for r in rows),'rowsWithAuthenticWholeShareFeeChain':sum('executionChain' in r for r in rows),'notClaimedIdenticalToFirstRun':True})
for source in ['squad7-core.mjs','squad11-core.mjs','squad11-lab.mjs']:
 b=(root/source).read_bytes();pins[source]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
out={'kind':'RECOVERY_RETAINED_EVIDENCE_RECONCILIATION','inputs':pins,'frozenStudies':studies,'currentRetainedPullbackRows':current,'sourceNamedRawInputs':{p:'PRESENT' if (root/p).exists() else 'ABSENT_IN_CURRENT_WORKSPACE' for p in ['study-cache/grouped.json.gz','squad4-cache','squad5-cache','squad11-cache']},'newBusinessImprovementEconomicVerdict':'INCONCLUSIVE_MISSING_DATED_FACTS_AND_EXECUTION','newRuleScored':False,'rulesOrExitsChanged':False,'externalRequests':0,'scriptExecutionSeconds':time.perf_counter()-started,'timingMeaning':'Only this extraction, not total research/engineering time'}
print(json.dumps(out,indent=2,allow_nan=False))
