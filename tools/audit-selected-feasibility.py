#!/usr/bin/env python3
"""Read only, fixed-scope retained feasibility analysis; never run study producers.

No network, credentials, subprocesses, original modification, sampling or new
return experiment. JSON stdout is deterministic; math controls are explicitly
hypothetical, not authentic prices/performance. Run from any cwd with --root.
"""
import argparse
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path
import statistics
from zoneinfo import ZoneInfo


def digest(b):
    return hashlib.sha256(b).hexdigest()


def canonical(x):
    return json.dumps(x, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def analyze(root):
    pins = {}

    def read(name, lines=False):
        b = (root / name).read_bytes()
        pins[name] = {'sha256': digest(b), 'bytes': len(b)}
        return [json.loads(x) for x in b.decode().splitlines() if x.strip()] if lines else json.loads(b)

    def source(name):
        b = (root / name).read_bytes()
        pins[name] = {'sha256': digest(b), 'bytes': len(b)}
        return b.decode()

    registry = read('data/strategy-library.json')['strategies']
    policies = {x['id']: x for x in registry if x['id'] in ['A-RMOM1', 'C-SPEC1', 'E11']}
    protocol = read('docs/a-catalyst-reclaim-pilot/protocol.proposed.json')
    events = read('data/events-recent.json')['events']
    native = source('a-native-evidence-contract.mjs')
    source('a-native-quotes.mjs')
    source('a-source-acquisition-bridge.mjs')
    source('a-evidence-contract.mjs')
    source('reclaim-research-workflow.mjs')
    source('catalyst-reclaim-prototype.mjs')
    # File names only: no encrypted content, owner accounts or credentials read.
    store_names = sorted(str(p.relative_to(root)) for p in root.rglob('STORE.json')
                         if '.git' not in p.parts and 'node_modules' not in p.parts)
    raw_keys = ['bodyBase64', 'bodySha256', 'requestStartedAt', 'bodyReceivedAt',
                'observedAt', 'securityId', 'sourceId', 'receipt', 'nativeBinding']
    # Mathematical counterexample to multiplying different trade populations.
    turnover_counterexample = {'kind': 'HYPOTHETICAL_NONIDENTIFIABILITY_PROOF_NOT_MARKET_DATA',
        'volumeAllTrades': 200, 'vwapEligibleQuantity': 100, 'vwapEligiblePrice': 10,
        'otherQuantity': 100, 'otherPrice': 20,
        'volumeTimesVwap': 2000, 'actualAllTradeNotional': 3000}
    assert turnover_counterexample['volumeTimesVwap'] != turnover_counterexample['actualAllTradeNotional']
    # Exact frozen A fee arithmetic; quotes are illustrative, not observed.
    a_costs = []
    for ask in [2, 5, 20, 100]:
        b = 1000
        slip = protocol['policyCandidate']['slippagePerSidePct'] / 100
        entry = ask * (1 + slip)
        n = math.floor((b - 3) / entry)
        breakeven_bid = (entry + 6 / n) / (1 - slip)
        a_costs.append({'hypotheticalAsk': ask, 'budget': b, 'shares': n,
            'entryPriceWithSlippage': entry, 'idleCashAfterEntryFee': b - n * entry - 3,
            'exitBidNeededForZeroNetDollars': breakeven_bid,
            'requiredBidAboveEntryAskPct': 100 * (breakeven_bid / ask - 1),
            'note': 'No observed spread/fill; actual required bid movement also depends on initial bid/spread.'})
    a = {'verdict': 'INCONCLUSIVE_AUTHENTIC_A; STOP_EVALUATION_FROM_CURRENT_INPUTS',
        'inspectedEventRows': len(events), 'eventFields': sorted(set().union(*(x.keys() for x in events))),
        'originalFieldCoverage': {k: sum(k in x for x in events) for k in raw_keys},
        'recognizedStorePathsInsideRepo': store_names,
        'storeScopeLimit': 'Path-name enumeration only in this checkout; no external/global/private-store absence claim.',
        'genuineNativeTurnoverFailClosePresent': "need(origin==='SYNTHETIC','NATIVE_ENTRY_AGGREGATE_LIQUIDITY_UNRESOLVED')" in native,
        'turnoverCounterexample': turnover_counterexample, 'illustrativeFeeGeometry': a_costs,
        'authenticTimelyEntryExitAfterCostResult': None,
        'blockers': ['No matching original agreement/discovery/actual pre-event cap/owner/role evidence bundle supplied',
                     'Normalized event list has no raw receipt/identity chain',
                     'Required genuine turnover semantics unsupported by aggregate volume x VWAP',
                     'No complete authentic entry/exit BBO, independent coverage or BOTH control populations']}
    assert a['genuineNativeTurnoverFailClosePresent']

    s6 = read('data/squad6-lab.json')
    saved = s6['firstRun']['SQ6-MTUM']
    rows = s6['trades']['SQ6-MTUM']
    producer = source('squad6-lab.mjs')
    source('squad6-core.mjs')
    target = source('agent-a-tgt-lab.mjs')
    source('squad20-lab.mjs')
    source('docs/trading-feasibility-recovery-decision-2026-11-04.md')
    source('docs/validation/trading-feasibility-archive-search-2026-11-04.json')
    # Same terminal growth, different daily volatility => endpoints cannot give sigma.
    periods, growth = 126, 1.10
    flat = [growth ** (1 / periods) - 1] * periods
    scale = (growth / ((1.02 * .98) ** (periods // 2))) ** (1 / periods)
    zigzag = [(1.02 if i % 2 == 0 else .98) * scale - 1 for i in range(periods)]
    paths = []
    for name, path in [('constant', flat), ('alternating', zigzag)]:
        terminal = math.prod(1 + x for x in path)
        sigma = statistics.stdev(path) * math.sqrt(252)
        paths.append({'path': name, 'sessions': len(path), 'terminalGrowth': terminal,
                      'sigmaAnnual': sigma, 'queuedWeight': min(1, .12 / sigma) if sigma else 1})
        assert abs(terminal - growth) < 1e-12
    assert paths[0]['queuedWeight'] != paths[1]['queuedWeight']
    cost_grid = []
    for budget in [1000, 10000, 120000]:
        for weight in [1, .5, .1]:
            for price in [5, 20, 100]:
                n = max(0, math.floor((budget * weight / 120 - 3) / price))
                cost_grid.append({'hypotheticalBudget': budget, 'weight': weight,
                    'hypotheticalUniformAsk': price, 'sharesEach': n,
                    'full120NameBookHasAtLeastOneShareEach': n >= 1,
                    'fullBookEntryExitFeesUSD': 720 if n >= 1 else None,
                    'fullBookEntryExitFeesPctBudget': 720 / budget * 100 if n >= 1 else None,
                    'kind': 'AFFORDABILITY_GEOMETRY_NOT_A_RETURN_OR_SELECTED_BUDGET'})
    cache = root / 'study-cache/grouped.json.gz'
    r = {'verdict': 'STOP_CURRENT_REPLAY; ECONOMIC_HYPOTHESIS_INCONCLUSIVE',
        'registryRule': policies['A-RMOM1'], 'cacheExpectedPath': 'study-cache/grouped.json.gz',
        'cacheExists': cache.exists(), 'frozenPopulation': saved['results']['all']['n'],
        'retainedEndpointRows': len(rows), 'populationRowsNotRecoverableFromThisFile': saved['results']['all']['n'] - len(rows),
        'retentionExplainedByProducer': 'r.trades.slice(-300)' in producer,
        'retainedFormationDateCounts': dict(sorted(collections.Counter(x['sig'] for x in rows).items())),
        'retainedFields': sorted(set().union(*(x.keys() for x in rows))),
        'retainedMissingSameStock': sum(x.get('sameStock') is None for x in rows),
        'dailyPriceOrBookPathFieldPresent': any('daily' in k.lower() for x in rows for k in x),
        'originalFrozenStatistics': {k: saved[k] for k in ['at', 'window', 'verdict', 'why', 'results', 'exits']},
        'sameEndpointDifferentAllocationProof': {'kind': 'HYPOTHETICAL_MATHEMATICAL_CONTROL_ONLY', 'paths': paths},
        'wholeShareFeeGeometry': cost_grid, 'strategyReturnComputed': False,
        'blockers': ['Missing original full membership/daily raw prices/actions/terminal and account-book paths',
                     'Only last300 endpoint rows of839; 39 same-stock entries absent in retained tail',
                     'No sigma, drawdown, account turnover or executable-price inference from endpoints',
                     'Prior archive recovery already exhausted supported access; cache key is not recovered bytes'],
        'noNetworkProducerExecuted': True}
    assert 'study-cache/grouped.json.gz' in target

    deals = read('data/deals.json')
    acquired = read('data/events-study.json')['firstRun']['fam']['ACQUIRED']
    offers = read('data/squad27-offers.json')
    odd = read('data/squad27-lab.json')
    source('deals.mjs')
    source('events-study.mjs')
    source('squad27-lab.mjs')
    listed = offers['listed']
    deal_geometry = []
    # General loss boundary, NOT a selected probability, estimate or strategy threshold.
    for spread in [.03, .15]:
        for break_loss in [.20, .50]:
            net_win = 1000 * spread - 6
            net_loss = -1000 * break_loss - 6
            p = -net_loss / (net_win - net_loss)
            deal_geometry.append({'assumedGrossUpside': spread, 'assumedBreakLossFraction': break_loss,
                'assumedDeployedUSD': 1000, 'netWinBeforeOtherFriction': net_win,
                'netLossBeforeOtherFriction': net_loss, 'successProbabilityForZeroMean': p,
                'kind': 'HYPOTHETICAL_RISK_BOUNDARY_NOT_EMPIRICAL_CASH_DEAL_RESULT',
                'limit': 'Excludes whole-share rounding, spread, slippage, settlement and time/capital cost; these worsen the hurdle.'})
    d = {'verdict': 'STOP_CURRENT_CASH_DEAL_EVALUATION; ECONOMICS_INCONCLUSIVE',
        'registryCashProposal': policies['C-SPEC1'], 'legacyQualitativeDisposition': policies['E11'],
        'retainedDealHeadlines': len(deals['deals']),
        'genericAcquisitionCompletionStudy': {k: acquired[k] for k in ['verdict', 'why', 'results']},
        'issuerTenderArchive': {'countAsRecorded': offers['count'], 'listedRows': len(listed),
            'scopeAsRecorded': offers['note'], 'formFromSource': 'SC TO-I, issuer self-tenders, NOT complete SC TO-T third-party offers/mergers',
            'fieldCoverage': {k: sum(x.get(k) is not None for x in listed) for k in ['acc', 'cik', 'filed', 'ticker', 'source', 'offerDoc', 'status', 'finalPrice', 'bodyBase64', 'bodyReceivedAt', 'acceptanceDateTime', 'entryAsk', 'exitBid']},
            'statusCounts': dict(collections.Counter(x.get('status', 'MISSING') for x in listed)),
            'halalCounts': dict(collections.Counter(x.get('halal', 'MISSING') for x in listed)),
            'unreadRows': len(offers.get('unread', []))},
        'oddLotCorrectedVerdicts': {k: {'verdict': v.get('verdict'), 'bugs': v.get('bugs'),
              'actualCounts': {h: v.get('results', {}).get('actual', {}).get(h, {}).get('n') for h in ['older', 'newer', 'all']}}
            for k, v in odd.get('correctedRun', {}).items()},
        'cashDealRiskBoundaries': deal_geometry, 'actualCashDealAfterCostResult': None,
        'blockers': ['No complete binding third-party cash-announcement/deal-break denominator',
                     'Self-tender URLs, filing dates and ex-post final terms are not original pre-entry receipt/quote evidence',
                     'No original entry BBO, break/120-session bid, consideration/settlement and capital-lockup path',
                     'Legacy3–15% spread denominator and terminal accounting not fully frozen; cannot choose retrospectively',
                     'Mandatory BOTH counterfactual controls unavailable; unknown historical halal status cannot be promoted']}

    paper = read('data/ignition-paper.jsonl', True)
    outcomes = read('data/ignition-results.json')
    s6paper = read('data/squad6-paper.jsonl', True)
    journal = read('data/journal.jsonl', True)
    source('ignition-paper.mjs')
    source('ignition-core.mjs')
    source('ignition-gates.mjs')
    signal = [x for x in paper if x.get('rule') == 'IG1']
    outcome = [x for x in outcomes['done'].values() if x.get('rule') == 'IG1']
    key = lambda x: (x['d'], x['sym'], x['rule'])
    sm = collections.defaultdict(list)
    om = collections.defaultdict(list)
    for x in signal: sm[key(x)].append(x)
    for x in outcome: om[key(x)].append(x)
    joined = []
    for k in sorted(set(sm) | set(om)):
        ss, oo = sm[k], om[k]
        value = oo[0].get('close') if len(oo) == 1 else None
        reason = oo[0].get('res') if len(oo) == 1 else 'AMBIGUOUS_OR_MISSING_RESULT'
        status = ('MODELED_WIN' if value > 0 else 'MODELED_LOSS' if value < 0 else 'MODELED_FLAT') if isinstance(value, (int, float)) else 'UNSCORED_OR_REJECTED'
        joined.append({'candidateKey': '|'.join(k), 'signalRows': len(ss), 'outcomeRows': len(oo),
            'signalRowSha256': digest(canonical(ss[0])) if len(ss) == 1 else None,
            'outcomeRowSha256': digest(canonical(oo[0])) if len(oo) == 1 else None,
            'disposition': status, 'modeledCloseNet': value, 'reason': reason,
            'signalPriceAgeMinutes': ss[0].get('delay') if len(ss) == 1 else None,
            'originalPublicationReceiptVerified': False, 'executableEntryExitVerified': False,
            'wholeShareFeesVerified': False, 'matchedControlsVerified': False})
    v = [x['close'] for x in outcome if isinstance(x.get('close'), (int, float))]
    assert len(v) == outcomes['record']['IG1/close']['n']
    mean = statistics.mean(v)
    assert abs(mean - outcomes['record']['IG1/close']['avg']) < 1e-12
    positives, negatives = [x for x in v if x > 0], [x for x in v if x < 0]
    s6signals = [x for x in s6paper if x.get('type') == 'signal']
    s6results = [x for x in s6paper if x.get('type') == 'result']
    sis = collections.Counter(x['id'] for x in s6signals)
    sir = collections.Counter(x['id'] for x in s6results)
    journal_lags = collections.Counter()
    for x in journal:
        logged = datetime.datetime.fromisoformat(x['loggedAt'].replace('Z', '+00:00'))
        assert logged.tzinfo is not None
        lag = (logged.astimezone(ZoneInfo('America/New_York')).date()
               - datetime.date.fromisoformat(x['d'])).days
        journal_lags[str(lag)] += 1
    rec = {'scope': 'Fixed all-IG1 retained signal/result census plus ALL retained squad6 signal/result and journal rows; examined data, not held-out recommendations',
        'IG1': {'signals': len(signal), 'results': len(outcome), 'joinedCandidateKeys': len(joined),
            'signalDateRange': [min(x['d'] for x in signal), max(x['d'] for x in signal)],
            'linkageCounts': dict(collections.Counter((str(x['signalRows']) + ':' + str(x['outcomeRows'])) for x in joined)),
            'dispositions': dict(collections.Counter(x['disposition'] for x in joined)),
            'unscoredReasons': dict(collections.Counter(x.get('res', 'MISSING') for x in outcome if not isinstance(x.get('close'), (int, float)))),
            'legacyModeledOnly': {'n': len(v), 'mean': mean, 'stressMean': statistics.mean(x['close_s'] for x in outcome if isinstance(x.get('close'), (int, float))),
                'winRate': len(positives) / len(v), 'averageWin': statistics.mean(positives), 'averageLoss': statistics.mean(negatives),
                'profitFactor': sum(positives) / -sum(negatives), 'withoutBestTwoMean': statistics.mean(sorted(v)[:-2]),
                'portfolioDrawdown': None, 'executableAfterCostReturn': None,
                'note': 'Saved minute-bar model with percentage friction, no fixed-dollar whole-share or authenticated BBO replay; no claim of actual recommendation delivery/fills.'},
            'originalResponseOrQuoteFieldsInSignals': {k: sum(k in x for x in signal) for k in ['bodyBase64', 'bodyReceivedAt', 'loggedAt', 'securityId', 'entryAsk', 'exitBid', 'qty', 'telegramAckAt']},
            'rows': joined},
        'squad6Paper': {'allRows': len(s6paper), 'signals': len(s6signals), 'results': len(s6results),
            'uniqueSignalIDs': len(sis), 'uniqueResultIDs': len(sir),
            'resultIDsWithOneMatchingSignal': sum(sis[k] == 1 for k in sir),
            'signalIDsWithoutRetainedResult': sum(k not in sir for k in sis),
            'methodCounts': dict(collections.Counter(x.get('m') for x in s6signals)),
            'recordedAfterRelation': dict(collections.Counter(
                'AFTER_SIGNAL_DAY' if x.get('recordedAfter', '') > x['d'] else
                'SAME_DAY_LABEL' if x.get('recordedAfter') == x['d'] else
                'BEFORE_OR_MISSING' for x in s6signals)),
            'resultIDs': sorted(sir),
            'retainedResults': [{'id': x['id'], 'net': x.get('net'), 'buy': x.get('buy'), 'sell': x.get('sell'),
                'signalRows': sis[x['id']], 'evidenceClass': 'SAVED_MODEL_ONLY_NO_BBO'} for x in s6results],
            'note': 'Unresolved signal outcome is not a rejection or loss; no relation to missing MTUM daily book.'},
        'journal': {'rows': len(journal), 'stateCounts': dict(collections.Counter(x.get('state', 'MISSING') for x in journal)),
            'rowsWithLoggedAt': sum(bool(x.get('loggedAt')) for x in journal),
            'loggingLagCalendarDaysNY': dict(sorted(journal_lags.items())),
            'rowsWithExitQuoteOrResult': sum(any(k in x for k in ['exitBid', 'exitPrice', 'net', 'outcome']) for x in journal),
            'note': 'Timestamped watch/no-action records preserved; not a verified entry-to-exit chain or proof of delivery.'},
        'externalAuditCompleted': False, 'externalAuditProtocolOnly': True,
        'verdict': 'PROCEED_SAVED_LINKAGE_ARITHMETIC_COMPLETED; AUTHENTIC_EXTERNAL_OR_SYSTEM_PERFORMANCE_INCONCLUSIVE'}
    return {'kind': 'EXECUTED_SELECTED_FEASIBILITY_V1', 'inputs': pins,
            'A': a, 'R': r, 'D': d, 'recommendationAudit': rec,
            'noProviderCalls': True, 'noStrategyProducerRun': True,
            'noOriginalOrFrozenRuleChanged': True, 'newAuthenticAfterCostAdvantages': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--check', type=Path)
    args = parser.parse_args()
    result = analyze(args.root)
    if args.check:
        assert result == json.loads(args.check.read_text()), 'Receipt or pinned source differs'
        print('Reproduced retained evidence, complete linkage census and labeled mathematical controls; no authentic return inferred.')
    else:
        print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))
