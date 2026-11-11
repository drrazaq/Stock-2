#!/usr/bin/env python3
"""ED1 early-detection study, implementing PREREGISTRATION.md exactly. It reads only retained archives in a Stock-2 checkout.
Usage: python3 -I ed1.py <stock-2 checkout at 716b1583>   (prints JSON results)"""
import sys, json, gzip, glob, os, math, collections, hashlib
ROOT = sys.argv[1]; DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']
hm = lambda s: int(s[:2]) * 60 + int(s[3:5]) if isinstance(s, str) and len(s) >= 5 and s[2] == ':' else None

def fisher(a, b, c, d):  # two-sided Fisher exact for [[a,b],[c,d]]
    n = a + b + c + d; r1, c1 = a + b, a + c
    lf = lambda k: math.lgamma(k + 1)
    def p(x): return math.exp(lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x))
    lo, hi = max(0, r1 + c1 - n), min(r1, c1); p0 = p(a)
    return min(1.0, sum(p(x) for x in range(lo, hi + 1) if p(x) <= p0 * (1 + 1e-9)))

def liq(dv): return 'UNKNOWN' if not dv else ('GE_2M' if dv >= 2e6 else 'LT_2M')
inputs, census, rows_all = {}, [], []
for day in DAYS:
    runs = [f for f in glob.glob(f'{ROOT}/data/ignition-runs/{day}/*.json') if not f.endswith('-progress.json')]
    best = max(runs, key=lambda f: len(json.load(open(f)).get('heartbeat') or []))
    arc = json.load(open(best)); sh = best[:-5] + '.shadow.jsonl.gz'
    for f in (best, sh): inputs[os.path.relpath(f, ROOT)] = hashlib.sha256(open(f, 'rb').read()).hexdigest()
    shadow = [json.loads(l) for l in gzip.open(sh, 'rt') if l.strip()]
    bysym = {r['sym']: r for r in shadow}; missed = {m['sym']: m for m in arc.get('missed', [])}
    for m in missed.values():  # Part A
        fs = hm(m.get('firstSeen')); r = bysym.get(m['sym']); f = (r or {}).get('f')
        cat = 'NO_RETAINED_FILING_RECORD' if not f else ('FILING_BEFORE_FIRST_SIGHT' if fs is not None and f.get('atM') is not None and f['atM'] <= fs else 'FILING_AFTER')
        price = 'NEVER_FRESH' if m.get('firstLive') is None else ('FRESH' if (m.get('firstQuoteAgeMin') or 1e9) <= 3 else 'STALE')
        census.append({'day': day, 'code': m.get('code'), 'session': 'PREOPEN' if fs is not None and fs < 570 else 'REGULAR' if fs is not None else 'UNKNOWN',
                       'price': price, 'liquidity': liq((r or {}).get('dv0')), 'catalyst': cat, 'form': (f or {}).get('form'), 'items': (f or {}).get('items')})
    for r in shadow:  # Part B
        prev = r['px0'] / (1 + r['chg0']) if r.get('px0') and r.get('chg0') is not None and r['chg0'] > -1 else None
        his = [e.get('hi') for e in list(r.get('v', {}).values()) + list(r.get('ig', [])) if isinstance(e, dict) and e.get('hi')] + ([r['last']] if r.get('last') else [])
        runner = r['sym'] in missed or bool(prev and his and max(his) / prev - 1 >= 0.15)
        f = r.get('f'); grp = 'NONE' if not f else ('E' if f.get('atM') is not None and f['atM'] <= r['m0'] else 'LATE_FILING')
        rows_all.append({'day': day, 'grp': grp, 'runner': runner, 'session': 'PREOPEN' if r['m0'] < 570 else 'REGULAR', 'liquidity': liq(r.get('dv0')),
                         'under1': bool((r.get('hard') or {}).get('under1')), 'control': r['src'] == 'control'})

def rate(rs): n = len(rs); k = sum(x['runner'] for x in rs); return {'n': n, 'runners': k, 'rate': round(k / n, 4) if n else None}
def test(rs):
    e = [x for x in rs if x['grp'] == 'E']; ne = [x for x in rs if x['grp'] == 'NONE']
    a, b = sum(x['runner'] for x in e), len(e) - sum(x['runner'] for x in e); c, d = sum(x['runner'] for x in ne), len(ne) - sum(x['runner'] for x in ne)
    re_, rn = (a / len(e) if e else None), (c / len(ne) if ne else None)
    return {'E': rate(e), 'NONE': rate(ne), 'diff': None if re_ is None or rn is None else round(re_ - rn, 4), 'p': round(fisher(a, b, c, d), 6) if e and ne else None}
pooled = test(rows_all)
byday = {d: test([x for x in rows_all if x['day'] == d]) for d in DAYS}
strata = {f'{k}={v}': test([x for x in rows_all if x[k] == v]) for k, vals in (('session', ['PREOPEN', 'REGULAR']), ('liquidity', ['GE_2M', 'LT_2M', 'UNKNOWN']), ('under1', [False, True])) for v in vals}
sign = lambda t: None if t['diff'] is None else (1 if t['diff'] > 0 else -1 if t['diff'] < 0 else 0)
s0 = sign(pooled); same_days = sum(1 for d in DAYS if sign(byday[d]) == s0 and s0)
verdict = 'SIGNAL CANDIDATE (research only)' if (pooled['p'] is not None and pooled['p'] < 0.01 and same_days >= 5 and sign(strata['liquidity=GE_2M']) == s0 and s0 == 1) else 'NO EVIDENCE'
cnt = lambda key: dict(collections.Counter(c[key] for c in census).most_common())
cross = collections.Counter((c['catalyst'], c['price']) for c in census)
out = {'inputs': inputs, 'partA': {'missedMovers': len(census), 'byCode': cnt('code'), 'bySession': cnt('session'), 'byPrice': cnt('price'), 'byLiquidity': cnt('liquidity'),
        'byCatalyst': cnt('catalyst'), 'catalystXprice': {f'{k[0]}|{k[1]}': v for k, v in sorted(cross.items())},
        'filingForms': dict(collections.Counter(f"{c['form']} {c['items']}" for c in census if c['form']).most_common(12)),
        'regularSessionEligible': rate([{'runner': True} for c in census if c['session'] == 'REGULAR' and c['code'] != 'UNDER_1_USD'])['n']},
       'partB': {'rows': len(rows_all), 'groups': dict(collections.Counter(x['grp'] for x in rows_all)), 'pooled': pooled, 'byDay': byday, 'strata': strata,
        'lateFiling': rate([x for x in rows_all if x['grp'] == 'LATE_FILING']), 'controlR0': rate([x for x in rows_all if x['control']]),
        'daysSameDirection': same_days, 'verdict': verdict}}
print(json.dumps(out, indent=1))
