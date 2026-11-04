"""Offline scope preparation only. No quotes/outcomes, network, keys or financial records."""
import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE='data/ignition-paper.jsonl'
PIN='a4de490a80493a064cc0f05854e2f8681941a4546e9bb42cd57703624c41b0b4'
b=(ROOT/SOURCE).read_bytes()
if hashlib.sha256(b).hexdigest()!=PIN:raise SystemExit('PINNED_RESEARCH_INPUT_MISMATCH')
rows=[json.loads(x) for x in b.splitlines() if x.strip()]
seen=set();per_day={};cases=[]
for n,row in enumerate(rows,1):
    if row.get('rule')!='IG1' or row.get('v')!=3:continue
    key=(row['d'],row['sym'])
    if key in seen:continue
    seen.add(key)
    if per_day.get(row['d'],0)>=3:continue
    per_day[row['d']]=per_day.get(row['d'],0)+1
    cases.append({'sourceRow1Based':n,'day':row['d'],'symbol':row['sym'],'recordedMinuteNY':row['m'],'originalFirstIngestion':'UNKNOWN','authenticatedInstrumentType':'NOT_YET_VERIFIED'})
    if len(cases)==12:break
if len(cases)!=12:raise SystemExit('FIXED_SAMPLE_INCOMPLETE')
print(json.dumps({'kind':'UNAPPROVED_INTRADAY_HISTORICAL_FEASIBILITY_SCOPE_V1','approved':False,'implementedCollector':False,'sourceCommit':'f0911952ca2529a2eadb23c9a6e3b4cb86211253','sourcePath':SOURCE,'sourceSHA256':PIN,'selection':'First three unique IG1/v3 security-days per date in original append order; stop at12; no replacement for identity or quote failures','previouslyExaminedEvidence':True,'prospectiveAdmissions':0,'cases':cases,'requestBudget':{'caseCount':12,'massiveIdentityPerCase':1,'massiveSplitsPerCase':1,'massiveDividendsPerCase':1,'alpacaDailyWarmupPerCase':1,'alpacaSessionMinutesPerCase':1,'alpacaQuotePagesPerCase':8,'massiveMaximum':36,'alpacaMaximum':120,'combinedMaximum':156,'retries':0,'fallbacks':0,'unbudgetedPagination':False},'bounds':{'providerPhaseSeconds':600,'perRequestFullResponseSeconds':20,'requestsPerSecondMaximum':1,'quoteRowsPerPageRequested':10000,'perBodyBytes':4194304,'aggregateRawBytes':134217728,'aggregateEncryptedBytes':167772160,'publicReportBytes':16384},'decision':'DATA_AND_QUOTE_PAPER_COST_FEASIBILITY_ONLY_NOT_STRATEGY_ACCEPTANCE'},indent=2))
