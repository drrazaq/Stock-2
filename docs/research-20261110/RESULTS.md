# Opportunity research results, 10 November 2026 (read-only; retained data at main bc23475e; no provider requests)

These are descriptive measurements of retained records. No rule is tuned, no frozen test is re-run and nothing here is a BUY.

## 1. Earlier detection: why runners were missed (watcher run records, 6 sessions, 2–9 Nov, main run per day)
- 1,876 missed-runner records (stocks that rose at least 15% in the session).
- Reasons:

  | Reason | Count | Share |
  |---|---|---|
  | under $1 (hard block, never traded) | 537 | 29% |
  | gapped at the open | 387 | 21% |
  | low volume | 336 | 18% |
  | volume figure late | 239 | 13% |
  | after 11:00 | 188 | 10% |
  | caught by a trigger but the rule did not pass | 188 | 10% |
  | visible too late | 1 | — |

- When the watcher **first saw** a runner, the first quote was a median **16.7 minutes old**, and **71%** were older than 3 minutes (the freshness rule). The median runner had already moved **+5.4%**.
- The detection limit is **price/volume freshness**, not the rules: about 1 in 3 misses (stale first quote or late volume) is a data-readiness problem.
- After first sight, these runners kept rising to the watcher endpoint (for example, the median for the low-volume group was +12%). **This is selection bias**: they were chosen *because* they ran 15%+, so it is not evidence of an edge.

## 2. Existing-feed price readiness (same records)

| Session | live-price share per minute | median price age | p95 price age |
|---|---|---|---|
| 2 Nov | 42.9% | 5.9 min | ~66 h |
| 3 Nov | 42.7% | 6.1 min | ~17 h |
| 4 Nov | 44.9% | 5.0 min | ~17 h |
| 5 Nov | 45.6% | 4.6 min | ~17 h |
| 6 Nov | 42.3% | 6.4 min | ~17 h |
| 9 Nov | 42.6% | 6.1 min | ~65 h |

- About **57% of received symbols have no live price in a given minute**.
- On 9 Nov: 204 movers had a live price before +5%; **65 only after +10%**; **126 never**.
- **Zero watcher alerts were sent on all six sessions.**

## 3. Exact strategy studies (pre-registered; status only)
- **Radar ledger, independently reproduced** with Codex's hash-pinned `radar-replay.cjs` on ledger sha256 `eb91b7d8…` (identical numbers). Modelled reference prices, not execution:
  - B: 45 lines, same day −1.12%, 22 positive; 5-session +6.14% on 20.
  - A: 58 lines, same day −1.42%, 13 positive; 5-session −7.10% on 35.
  - Whole-share re-expression: B −1.12%, A −1.42% of budget.
- **Phase-1 shadow** (`shadow-report.json`, 9 sessions, SIP):
  - all-candidate base: same day −1.02% (n 841, profit factor 0.50); next day −2.13% (n 696); 5-day +0.22% (n 87);
  - every gate is **COLLECTING**;
  - delivered alerts at 5 days: +0.08% (n 36, median −4.6%), against −2.07% for those not delivered (n 214).
- **Ranking experiment** (frozen 28 Oct, verdict after ≥ 20 sessions and ≥ 50 picks): **7 sessions, 35 picks**. No verdict.
  - 5-day averages on 10 picks: B +1.5%, C +1.6%, A −0.6%, random R −4.1%, no-information R0 +1.0%.
  - That is too few to read. The controls (R0 positive) show the noise.

## 4. Completed broad investigations (Codex, `351c4002` primary-investigation-results)
- **AMT:** debt note pricing is not an operating catalyst; standalone-event promotion stopped.
- **NKE:** an officer appointment is not a trade signal; stopped.
- **AIOT:** services growth versus margin decline and funding still pending; continue.
- **AMG:** "economic" EPS up while GAAP EPS and net income are down; continue.
- **OIS:** backlog up, but nine-month operating cash flow negative; continue.
- **TALO:** production and cash flow versus acquisition-boosted and pro-forma leverage; continue.
- All six: INVESTIGATE/WAIT, ZAD UNKNOWN, dated reference prices from 6 Nov without individual clocks, no entry invented.
- Factual balance: favourable and unfavourable facts are shown for each, and adjusted versus GAAP bases are kept apart.
- Primary sources are **not re-verified here** (sec.gov unreachable from this environment).

## 5. Blockers (concrete)
1. **Feed freshness:** fewer than half of symbols are live per minute; first quotes on runners are a median 17 minutes old. Earlier detection needs fresher full-universe quotes. That is an entitlement/coverage question (acceptance row MARKET-02) and needs the owner; it is not a code change.
2. **Watcher end at 15:00 NY:** the final hour is unobserved, by configuration (owner scope decision).
3. **Scheduler delivery:** intraday scanner runs 0–2 per day, so the in-session plan checks rarely run (guard rev4 is separate).
4. **Sample size:** the ranking experiment needs 13 more sessions and 15 more picks before its pre-registered verdict; nothing can be concluded earlier.
5. **ZAD:** all six investigated companies are unmarked, so none can become a BUY until the owner marks them.
