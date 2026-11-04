#!/usr/bin/env python3
"""Read-only arithmetic/provenance audit of already-examined saved research.

No provider access, strategy execution, new holdout, portfolio simulation or rule tuning.
stdout is aggregate JSON; --check compares it with a saved receipt without writing.
"""
import argparse
import collections
import hashlib
import json
import math
import gzip
from pathlib import Path

VERSION = 'SAVED_EVIDENCE_AUDIT_2026_11_04_V1'
PIN = 'f92a29d8e96df7c3b9fa012d699a41fdd28d0d07'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def stats(values):
    assert values and all(type(x) in (float, int) and math.isfinite(x) for x in values)
    wins = [x for x in values if x > 0]
    losses = [x for x in values if x <= 0]
    gain, loss = sum(wins), -sum(losses)
    ordered = sorted(values, reverse=True)
    return dict(n=len(values), expectancy=sum(values)/len(values), winRate=len(wins)/len(values),
                averageWin=sum(wins)/len(wins) if wins else None,
                averageLoss=sum(losses)/len(losses) if losses else None,
                profitFactor=gain/loss if loss else None,
                worstTrade=min(values), bestTrade=max(values),
                noBestTwo=sum(ordered[2:])/len(ordered[2:]) if len(values)>2 else None,
                topTwoShareOfPositiveReturn=sum(ordered[:2])/gain if gain else None,
                portfolioDrawdown=None)

def audit(root):
    sources = {}
    def read(name):
        path = root/name
        sources[name] = dict(sha256=digest(path), bytes=path.stat().st_size)
        return json.loads(path.read_text())
    inventory = []
    def walk(value, path, file):
        if isinstance(value, dict):
            if isinstance(value.get('verdict'), str):
                inventory.append(dict(file=file, path=path, verdict=value['verdict']))
            for key, item in value.items():
                if isinstance(item, (dict, list)):
                    walk(item, path+'.'+key, file)
        elif isinstance(value, list):
            for i, item in enumerate(value):
                walk(item, path+f'[{i}]', file)
    # Fixed public research filename family; never inspect owner accounts/holdings.
    for p in sorted((root/'data').glob('*lab.json')):
        d=read(str(p.relative_to(root)))
        walk(d.get('firstRun', {}), 'firstRun', str(p.relative_to(root)))
    choices = [
        ('intraday', 'data/squad2-lab.json', ['firstRun','SQ2-ORB5']),
        ('weeks', 'data/insider-study.json', ['firstRun','results','CLUSTER3_20']),
        ('months', 'data/anomaly-lab.json', ['firstRun','ANOM-RESMOM']),
        ('longer', 'data/squad11-lab.json', ['firstRun','SQ11-PB12']),
        ('longer_comparator', 'data/squad6-lab.json', ['firstRun','SQ6-MTUM']),
        ('longer_comparator', 'data/squad6-lab.json', ['firstRun','SQ6-QMOM']),
        ('longer_portfolio_comparator', 'data/squad10-lab.json', ['firstRun','SQ10-SH20-C15']),
        ('outside_stock_entry_scope', 'data/squad23-lab.json', ['firstRun','SQ23-GOLD']),
    ]
    candidates=[]
    for horizon, file, path in choices:
        d=read(file); r=d
        for k in path: r=r[k]
        candidates.append(dict(horizon=horizon,file=file,path='.'.join(path),original=r,
                               period=r.get('window') or [d.get('from'),d.get('to')],
                               conclusion='No credible candidate currently' if r['verdict']=='REJECTED'
                               else 'Insufficient evidence, with a finite path to a decision'))
    d=read('data/squad11-lab.json'); f=d['firstRun']['SQ11-PB12']
    all_rows=d['trades']['SQ11-PB12']; cutoff=f['window'][1]
    rows=[r for r in all_rows if r['sell']<=cutoff]
    assert len(rows)==f['results']['all']['n']==355
    keys=[(r['s'],r['sig'],r['buy'],r['sell']) for r in rows]
    assert len(keys)==len(set(keys))
    partitions={name:[r for r in rows if (r['sig']<'2024-01-01')==older]
                for name,older in [('older',True),('newer',False)]}
    partitions['all']=rows
    arithmetic={}
    for name, group in partitions.items():
        v=stats([r['net'] for r in group]); saved=f['results'][name]
        assert len(group)==saved['n']
        assert abs(v['expectancy']-saved['avg'])<0.00015
        assert abs(v['noBestTwo']-saved['noTop2'])<0.00015
        paired={}
        for field in ['avgStock','spy','sameStock','fixedDate']:
            pairs=[r['net']-r[field] for r in group if r[field] is not None]
            paired[field]=dict(n=len(pairs), tradeWeightedMeanDifference=sum(pairs)/len(pairs))
        by_date=collections.defaultdict(list)
        own_dates=collections.defaultdict(list)
        for row in group:
            by_date[row['sig']].append(row['net']-(row['avgStock']+.008))
            if row['sameStock'] is not None:
                own_dates[row['sig']].append(row['net']-row['sameStock'])
        edge=sum(sum(v)/len(v) for v in by_date.values())/len(by_date)
        own=sum(sum(v)/len(v) for v in own_dates.values())/len(own_dates)
        assert abs(edge-saved['edge'])<.00015
        assert abs(own-saved['vsOwn'])<.00015
        arithmetic[name]=dict(roundedSavedReturns=v,pairedControls=paired,
            frozenDateWeightedEdgeVersusGrossAverageStock=edge,
            frozenDateWeightedSameStockDifference=own,
            weighting='Original edge charges strategy cost but gross average-stock benchmark; row arithmetic and date weights distinguished')
    fee_sensitivity=[]
    for notional, friction in [(1000,.002),(1000,.006),(1000,.014),(500,.002),(2500,.002)]:
        assumed_cost=6/notional+friction
        fee_sensitivity.append(dict(assumedNotional=notional,commissionRoundTripUSD=6,
            assumedOtherRoundTripFriction=friction,totalCost=assumed_cost,
            result=stats([r['net']+.008-assumed_cost for r in rows])))
    fields=['entryPrice','exitPrice','qty','securityId','avgStock','spy','sameStock','fixedDate']
    sq11=dict(savedRows=len(all_rows), frozenWindowMatchedRows=len(rows),
        excludedLaterClosedRows=len(all_rows)-len(rows),duplicateLogicalRows=0,
        firstSignal=min(r['sig'] for r in rows),lastExit=max(r['sell'] for r in rows),
        fieldCoverage={k:sum(r.get(k) is not None for r in rows) for k in fields},
        arithmetic=arithmetic,costSensitivity=fee_sensitivity,
        validity='Rounded saved-return arithmetic only; not an independently repriced backtest or investable portfolio')
    ir=read('data/ignition-results.json'); ig=[r for r in ir['done'].values() if r.get('rule')=='IG1']
    scored=[r for r in ig if type(r.get('close')) in (int,float)]
    legacy=stats([r['close'] for r in scored]); saved=ir['record']['IG1/close']
    assert legacy['n']==saved['n']
    assert abs(legacy['expectancy']-saved['avg'])<1e-10
    assert abs(legacy['profitFactor']-saved['pf'])<1e-10
    ig1=dict(updated=ir['updated'],census=len(ig),scoredClose=len(scored),
        nonScored=len(ig)-len(scored),nonScoredReasons=dict(collections.Counter(r.get('res','UNKNOWN') for r in ig if r not in scored)),
        days=len({r['d'] for r in scored}),stocks=len({r['sym'] for r in scored}),
        metrics=legacy,stressMean=sum(r['close_s'] for r in scored)/len(scored),
        missingBBOAndSecurityId=sum(not all(k in r for k in ['securityId','entryBid','entryAsk','exitBid','exitAsk']) for r in scored),
        status='Legacy minute-bar estimates, not admitted prospective evidence; no matched controls in these rows')
    # Pin actual implementation and earlier protocol boundaries as well as result bytes.
    for file in ['squad2-core.mjs','squad11-core.mjs','squad11-lab.mjs','anomaly-core.mjs',
                 'insider-study.mjs','ignition-core.mjs','ignition-paper.mjs','squad6-core.mjs','squad10-core.mjs','squad23-core.mjs',
                 'docs/insider-form4-comparison.md','docs/mentor-horizon-comparison.json']:
        sources[file]=dict(sha256=digest(root/file),bytes=(root/file).stat().st_size)
    return dict(version=VERSION,basisCommit=PIN,analysisKind='ALREADY_EXAMINED_SAVED_EVIDENCE_NOT_NEW_HOLDOUT',
        attemptedComparisons=['full_firstRun_verdict_inventory','four_horizon_records_and_four_existing_comparators',
                              'SQ11_frozen_window_and_all_halves','SQ11_all_four_paired_control_fields',
                              'SQ11_five_predeclared_cost_scenarios','IG1_close_census_and_record_reconciliation'],
        frozenCatalogue=inventory,verdictCounts=dict(collections.Counter(x['verdict'] for x in inventory)),
        candidates=candidates,sq11=sq11,legacyIG1=ig1,sources=sources,
        newProspectiveAdmissions=0,strategiesOrFrozenResultsChanged=False,
        independentExecutableAfterCostEvaluationPossible=False,
        blockers=['No original grouped/minute price caches in selected checkout',
                  'Missing original fill prices, sizes, BBO and identity in saved trade rows',
                  'Original frozen trade populations not available for all candidates',
                  'No authenticated point-in-time universe/delistings/corporate-action path or portfolio marks'])

def selection_audit(root):
    """Extended existing-file census; does not change or replace the V1 receipt."""
    records=[]; sources={}
    def read(path):
        sources[path]=digest(root/path)
        return json.loads((root/path).read_text())
    def walk(x,path,file):
        if isinstance(x,dict):
            if isinstance(x.get('verdict'),str):
                records.append(dict(file=file,path=path,verdict=x['verdict']))
            for k,v in x.items():
                if isinstance(v,(dict,list)):walk(v,path+'.'+k,file)
        elif isinstance(x,list):
            for i,v in enumerate(x):walk(v,path+f'[{i}]',file)
    files=set((root/'data').glob('*lab.json'))|set((root/'data').glob('*study.json'))|{root/'data/decoded-history.json'}
    for p in sorted(files):
        file=str(p.relative_to(root));walk(read(file).get('firstRun',{}),'firstRun',file)
    registry=read('data/strategy-library.json')['strategies']
    assert len(registry)==len({x['id'] for x in registry})==747
    counts=dict(collections.Counter(x['verdict'] for x in records))
    assert len(records)==690 and counts['PROVEN']==counts['PROMISING']==1
    decoded=read('data/decoded-history.json')['firstRun']['DEC2-TPS']
    check=read('data/decoded-check.json')
    assert decoded['verdict']=='PROVEN'
    assert all(check['budget'][h]['avg']<0 and check['nextOpen'][h]['avg']<0 for h in ['older','newer'])
    event=read('data/events-study.json')['firstRun']['link']
    assert event['verdict']=='PROMISING'
    trade_file='data/squad2-trades.json.gz'
    sources[trade_file]=digest(root/trade_file)
    trades=json.loads(gzip.decompress((root/trade_file).read_bytes()))['trades']['SQ2-ORB5']
    saved=read('data/squad2-lab.json')['firstRun']['SQ2-ORB5']
    assert len(trades)==saved['results']['all']['n']==6438
    assert len({(r[0],r[1],r[2]) for r in trades})==len(trades)
    sq2={}
    for name,group in [('older',[r for r in trades if r[0]<'2024-01-01']),
                       ('newer',[r for r in trades if r[0]>='2024-01-01']),('all',trades)]:
        s=stats([r[3]-.008 for r in group])
        assert len(group)==saved['results'][name]['n']
        assert abs(s['expectancy']-saved['results'][name]['avg'])<.00015
        sq2[name]=s
    assert abs(sq2['all']['profitFactor']-saved['shape']['pf'])<.00015
    for file in ['decoded-lab.mjs','decoded2-core.mjs','events-study.mjs']:
        sources[file]=digest(root/file)
    return dict(version='EXISTING_SELECTION_CENSUS_V2_2026_11_04',basisCommit=PIN,
        correction='V1 examples were not strongest; lab-only census omitted DEC2-TPS and legacy supply-chain result',
        registryEntries=len(registry),registryStatusCounts=dict(collections.Counter(x.get('status','UNKNOWN') for x in registry)),
        frozenRecordCount=len(records),frozenRecords=records,verdictCounts=counts,
        strongerRecordedLabels={'DEC2-TPS':decoded,'DEC2-TPS_money_check':check,'events_link':event},
        recoveredSQ2TradeArithmetic=sq2,
        recoveredTPSRows={'retained':len(read('data/decoded-history.json')['trades']['DEC2-TPS']),
                          'original':decoded['results']['all']['n'],
                          'complete':False,'reason':'Producer retains only last1500 rows; scale-in fractions/order legs absent'},
        sources=sources,originalVerdictsChanged=False,studiesRerun=False,
        conclusion='NO-GO for independently repriced/executable evaluation on presently recovered original inputs',
        eligibleForTradingOrEconomicPaperValidationEstablished=False,
        note='Record labels are not independent hypotheses or equivalent evidence standards. TPS PROVEN remains frozen; money check is monitoring, not a replacement verdict.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--check',type=Path);p.add_argument('--selection',action='store_true');args=p.parse_args()
    result=selection_audit(args.root) if args.selection else audit(args.root)
    if args.check:
        assert result==json.loads(args.check.read_text()),'Saved aggregate receipt differs'
        print('PASS: deterministic evidence, population and arithmetic assertions')
    else: print(json.dumps(result,indent=2,sort_keys=True,allow_nan=False))
