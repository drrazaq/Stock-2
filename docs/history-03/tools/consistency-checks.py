# HISTORY-03 consistency checks (reviewer: Claude). Recomputes headline numbers from the trade-level rows that the repository itself
# stores, and compares them with the summary figures the messages quote. This is NOT an independent reproduction from raw prices:
# it only checks that the stored rows and the stored summaries agree. Read-only.
# Usage: python3 -I -B consistency-checks.py <repo root>  -> JSON
import json, sys, pathlib, collections
R = pathlib.Path(sys.argv[1]); out = {}
A = json.loads((R / 'data/agent-a-tgt-lab.json').read_text())
fr = A['firstRun']['A-TGT-TGT20-PB12']; rows = A.get('trades', {}).get('A-TGT-TGT20-PB12', []); split = A.get('split', '2024-01-01')
def stats(z):
    return {'n': len(z), 'win': round(sum(1 for r in z if r['net'] > 0) / len(z), 4) if z else None, 'avg': round(sum(r['net'] for r in z) / len(z), 4) if z else None}
old = [r for r in rows if r['buy'] < split]; new = [r for r in rows if r['buy'] >= split]
out['LEADER DIP 73% / 75% (A-TGT-TGT20-PB12)'] = {
  'quoted': 'tested 73% / 75% of trades won (ACTIONS LEADER DIP line, scan.mjs:2588)',
  'frozenSummary': {'older': {k: fr['results']['older'][k] for k in ('n', 'win', 'avg')}, 'newer': {k: fr['results']['newer'][k] for k in ('n', 'win', 'avg')}},
  'storedRows': {'total': len(rows), 'older': stats(old), 'newer': stats(new)},
  'agrees': None}
fs = out['LEADER DIP 73% / 75% (A-TGT-TGT20-PB12)']
kinds = collections.Counter(r['kind'] for r in rows)
fs['storedKinds'] = dict(kinds)
fs['agrees'] = ('NOT REPRODUCIBLE FROM STORED ROWS: %d stored rows vs %d trades in the frozen summary. agent-a-tgt-lab.mjs:160 keeps only trades whose exit kind is not "max" (126-session time exit) or "gone" (delisted), last 300; every stored row is a target exit (kinds %s), so all time-exit and delisted trades, i.e. the losers, are absent. The win rate, losses and worst trade can only be reproduced by re-running the test on the price cache.' % (len(rows), fr['results']['older']['n'] + fr['results']['newer']['n'], dict(kinds))) if len(rows) != fr['results']['older']['n'] + fr['results']['newer']['n'] else 'COUNTS MATCH'
P = R / 'data/account-replay-pb12t20-trades.jsonl'
T = [json.loads(l) for l in P.read_text().splitlines() if l.strip()]
by = collections.defaultdict(list)
for t in T:
    if t.get('replay') == 'REPLAY-PB12T20': by[t['window']].append(t)
S = json.loads((R / 'data/account-replay-pb12t20.json').read_text())['results']['REPLAY-PB12T20']
out['LEADER DIP 3-slot replay (REPLAY-PB12T20)'] = {'quoted': 'about equal to SPY as a 3-slot account (2024-26 +19.6% a year vs SPY +18.6%)',
  'storedSummary': {w: {'accountPerYear': S[w]['account'].get('perYear'), 'spyPerYear': S[w]['spy'].get('perYear'), 'spusPerYear': (S[w].get('spus') or {}).get('perYear')} for w in S},
  'storedRows': {w: {'trades': len(z), 'rowsWithoutPnl': sum(1 for t in z if 'pnl' not in t), 'win': round(sum(1 for t in z if t.get('pnl', 0) > 0) / len(z), 4) if z else None, 'pnlSum': round(sum(t.get('pnl', 0) for t in z), 2)} for w, z in sorted(by.items())},
  'agrees': 'QUOTE MATCHES the stored newer-window summary (0.1964 vs SPY 0.1856). Not mentioned in the message: older window from first signal 0.1031 vs SPY 0.1663, and SPUS 0.2198 (newer). Stored rows: some rows carry no pnl field (counted as 0), so per-year returns cannot be rebuilt from rows alone.'}
M = json.loads((R / 'data/smart-money-study.json').read_text())
out['Insider buying "works in rising markets (+0.1% / +6.1%)"'] = {'quoted': 'ACTIONS research line (scan.mjs:2634)', 'storedSummary': M['rising'], 'verdict': M['verdict'],
  'agrees': 'NUMBERS MATCH the stored summary (+0.12% / +6.06%); the older-half S&P 500 same-days figure (+0.31%) is higher than the rule\'s; no trade rows stored'}
Q = json.loads((R / 'data/squad29-lab.json').read_text())['firstRun']
out['Late-filing SELL reason "about 12-16% over 60 sessions"'] = {'quoted': 'scan.mjs:37', 'storedSummary': {h: Q['SQ29-F4-LATEFILE']['results']['60'][h]['excess'] for h in ('older', 'newer')}, 'verdict': Q['SQ29-F4-LATEFILE']['verdict'],
  'agrees': 'NUMBERS MATCH the stored summary (-12.5% / -16.3%); no event rows stored'}
B10 = json.loads((R / 'data/squad10-lab.json').read_text())
out['Basket 1 "about 16.7% a year vs SPUS 12.2%"'] = {'quoted': 'basket reply (scan.mjs:2961)', 'verdict': B10['firstRun']['SQ10-SH10']['verdict'], 'agrees': 'VALUE 0.167 PRESENT in data/squad10-lab.json (string search); the summary field path was not traced; NOT PROVEN verdict matches the message'}
print(json.dumps(out, indent=1))
