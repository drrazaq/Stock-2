"""Append-only research interpretation of newly matured frozen B outcomes; no rule edits."""
import collections,hashlib,json,math,statistics,subprocess
from pathlib import Path
P=Path(__file__).parent;ref='716b158307a9d09e5ac39b5f562a7f12245f604e';path='data/radar-v3-ledger.jsonl'
b=subprocess.check_output(['git','show',ref+':'+path]);rows=[json.loads(s) for s in b.decode().splitlines() if s.strip()]
base=json.loads(Path('docs/watcher-price-followon-20261110/research-paired-horizons.json').read_text());old={(r['day'],r['symbol']) for r in base['rows']}
L=collections.defaultdict(list);S=collections.defaultdict(list)
for r in rows:
 if r.get('panel')=='B' and r['type']=='list':L[(r['d'],r['sym'])].append(r)
 if r.get('panel')=='B' and r['type']=='s5':S[(r['d'],r['sym'])].append(r)
scored=[];ambiguous=[]
for k,rs in S.items():
 ls=L.get(k,[])
 if len(ls)!=1 or len(rs)!=1:ambiguous.append({'day':k[0],'symbol':k[1],'lists':len(ls),'outcomes':len(rs)});continue
 l,s=ls[0],rs[0];entry=l['px'];exit=s['px5'];qty=math.floor(997/entry);spread=.01 if entry<5 else .003
 # Preserve frozen percentage-cost output separately. Whole-share diagnostic uses same
 # assumed spread haircut, actual $3 each side, $1000 starting cash, no price-path invention.
 dollars=qty*(exit-entry)-6-qty*entry*spread if qty>0 else None
 scored.append({'day':k[0],'symbol':k[1],'rule':l.get('rule'),'listTime':l.get('at'),'entryReference':entry,'exit5Reference':exit,'storedFrozenNet':s['net'],'spy':s.get('spy'),'shares':qty,'wholeShareModeledDollars':dollars,'wholeShareReturnOn1000':dollars/1000 if dollars is not None else None,'newlyMaturedBeyondPrior20':k not in old,'identity':'UNKNOWN','fillEvidence':'MISSING'})
def stats(rs):
 a=[r['storedFrozenNet'] for r in rs];return {'n':len(a),'mean':statistics.mean(a) if a else None,'median':statistics.median(a) if a else None,'winners':sum(x>0 for x in a),'withoutTwoBest':statistics.mean(sorted(a)[:-2]) if len(a)>2 else None,'pairedSpyN':sum(r['spy'] is not None for r in rs),'meanNetMinusSpy':statistics.mean(r['storedFrozenNet']-r['spy'] for r in rs if r['spy'] is not None) if any(r['spy'] is not None for r in rs) else None,'wholeShareMeanReturnOn1000':statistics.mean(r['wholeShareReturnOn1000'] for r in rs if r['wholeShareReturnOn1000'] is not None) if any(r['wholeShareReturnOn1000'] is not None for r in rs) else None}
new=[r for r in scored if r['newlyMaturedBeyondPrior20']]
report={'kind':'RETAINED_MODELED_UPDATE_NOT_EXECUTABLE_PERFORMANCE','ref':ref,'inputSHA256':hashlib.sha256(b).hexdigest(),'prior20Preserved':base,'newlyMatured':stats(new),'allUnambiguousMatured':stats(scored),'unscoredBLists':len([k for k in L if k not in S]),'ambiguousJoinExcluded':ambiguous,'formationDateConcentration':{d:stats([r for r in scored if r['day']==d]) for d in sorted({r['day'] for r in scored})},'withoutCHSN_DIAGNOSTIC_NOT_RULE':stats([r for r in scored if r['symbol']!='CHSN']),'rows':scored,'terminalDecision':'INCONCLUSIVE_FOR_EDGE; no promotion or exit tuning','limitations':['Raw frozen legacy mixed-instrument cohort; no common-stock, split/action or ZAD clearance inferred.','Price endpoints are modeled; no actual fill/BBO path, halts/no-fills or $1000 deployable portfolio proved.','SPY is a stored market comparator, not an untouched matched stock control; no A comparison claimed because GNSS linkage remains unresolved.','Original20 adverse concentration evidence and all losses preserved; removal diagnostics do not authorize filters.','Separate ranking-B model is not radar panelB and is not pooled.']}
(P/'radar-extension.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['newlyMatured','allUnambiguousMatured','withoutCHSN_DIAGNOSTIC_NOT_RULE','unscoredBLists','ambiguousJoinExcluded']},indent=2))
