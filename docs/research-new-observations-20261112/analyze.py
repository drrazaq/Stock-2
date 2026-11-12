"""New retained rows only; no original strategy retest, network, owner mark output or file mutation."""
import subprocess,json,hashlib,pathlib,datetime
BASE='7db2c83b574bbe0d85d4c9972ad2230a36004816';HEAD='3aa893f52022a03a7fbac783599691e87c86abd8';out=pathlib.Path(__file__).resolve().parent
def content(ref,path):return subprocess.check_output(['git','show',ref+':'+path])
def rows(ref,path):return [json.loads(s) for s in content(ref,path).decode().splitlines() if s.strip()]
result={'kind':'NEW_RETAINED_ROWS_NOT_NEW_BACKTEST','base':BASE,'head':HEAD,'files':{},'paperUpdates':[]}
for path in ['data/squad12-paper.jsonl','data/squad14-paper.jsonl','data/squad23-paper.jsonl']:
 a=rows(BASE,path);b=rows(HEAD,path);assert b[:len(a)]==a,'OLD_RECORDS_CHANGED';new=b[len(a):];result['files'][path]={'baseSha256':hashlib.sha256(content(BASE,path)).hexdigest(),'headSha256':hashlib.sha256(content(HEAD,path)).hexdigest(),'oldRows':len(a),'newRows':len(new),'types':{t:sum(x.get('type')==t for x in new) for t in sorted({x.get('type') for x in new})},'oldPrefixPreserved':True}
 if 'squad23'not in path:
  for x in new:result['paperUpdates'].append({'method':x['m'],'signalSession':x.get('d'),'recordedAfter':x.get('recordedAfter'),'clockStatus':'LATE_BACKFILL' if x.get('recordedAfter','')>x.get('d','') else 'DATE_LABEL_ONLY_NOT_AUTHENTICATED_CAPTURE','newResolvedOutcome':False})
 else:
  old={x['m']:x for x in a if x.get('type')=='mark'}
  result['newModelMarks']=[]
  for x in new:
   prev=old[x['m']];result['newModelMarks'].append({'method':x['m'],'previousSession':prev['d'],'session':x['d'],'storedIndexRatioPct':{k:(x[k]/prev[k]-1)*100 for k in ['alone','combo7030','basket1']},'interpretation':'Arithmetic on stored rounded model-index snapshots only; same-vintage account continuity not authenticated; not executable/forward-account returns'})
result['limitations']=['No new resolved outcomes in these appended rows','Private halal fields/stock identities/holdings omitted','Basket marks are full-history resimulation equity levels, not authenticated persisted forward positions; old entries not rewritten does not establish same input vintage','Native basket model0.4%per-side turnover/0.6%stress is not $3/order whole-share economics; order-level quantities absent','No PnL significance, new trading rule, ZAD approval or BUY inferred']
(out/'RESULTS.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'newSignalRows':len(result['paperUpdates']),'newBasketMarks':len(result['newModelMarks']),'newResolved':0}))
