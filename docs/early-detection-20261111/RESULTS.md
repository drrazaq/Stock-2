# ED1 early-detection study: results (research only)

- **Pre-registration:** `PREREGISTRATION.md`, committed at `8b524c0c` (11:58 UTC) before any result was computed.
- **Code:** `ed1.py`, Python standard library only, offline.
- **Inputs:** retained archives at main `716b1583`. Their sha256 values are in `results.json → inputs`.
- **Scope:** no provider calls, no rule or exit changes, no production action.

## Part A: missed-mover census, 7 sessions (2–10 Nov), 2,027 missed movers of at least +15%

**By reason code:**

| Reason | Count |
|---|---|
| UNDER_1_USD | 596 |
| GAPPED_AT_OPEN | 403 |
| LOW_VOLUME | 353 |
| VOLUME_FIGURE_LATE | 244 |
| CAUGHT_RULE_NOT_PASSED | 226 |
| AFTER_11_00 | 204 |
| VISIBLE_TOO_LATE | 1 |

**Session of first sight:** PREOPEN 1,762 (87%), REGULAR 265. Movers first seen in the regular session that are not under $1: 8.

**Price evidence at first sight:**

| Price evidence | Count | Notes |
|---|---|---|
| FRESH (≤ 3 min) | 579 | |
| STALE | 847 | |
| NEVER_FRESH | 601 | 596 of these are the deliberately unrefreshed under-$1 group |

**Liquidity** (from the day's candidate row): ≥ $2M 340, < $2M 935, UNKNOWN 752 (no candidate row for the symbol).

**Retained primary catalyst:**

| Catalyst | Count | Detail |
|---|---|---|
| FILING_BEFORE_FIRST_SIGHT | 105 (5.2%) | Mostly 8-K 2.02 earnings (66 including 7.01 variants) and 6-K (17). Price at first sight: 63 FRESH, 42 STALE |
| FILING_AFTER | 4 | |
| NO_RETAINED_FILING_RECORD | 1,918 | **Missing evidence, not proof of no catalyst.** The live feed covers SEC 8-K/6-K only, the archive holds no news, and `catalyst-events.jsonl` stops at 21 Oct |

**What Part A establishes:**
- Most misses are first seen pre-open, before the 09:30 rules can act, or are under $1 by design.
- The regular-session, $1-and-over, earlier-detection opportunity on these days is small: 8 movers first seen in session.
- A retained SEC filing preceded first sight for only about 5% of misses.

**What it cannot establish:**
- whether a news catalyst existed for the other 95%;
- instrument identity (UNKNOWN for every record);
- whether a fresher feed would have changed any outcome. No request or response clocks were retained.

## Part B: frozen test H1, "a filing at or before first sight gives more +15% runners"

**Population:** 16,412 candidate rows. E (filing accepted at or before first sight) 1,353; NONE 15,044; LATE_FILING 15.

| | Runner rate | n | Fisher p |
|---|---|---|---|
| **Pooled E** | **7.83%** | 1,353 | |
| **Pooled NONE** | **8.12%** | 15,044 | **0.75** |

**By day (E minus NONE):** the direction flips. Days are listed with their p values.

| Day | Difference | p |
|---|---|---|
| 2 Nov | −1.1 pts | 0.68 |
| 3 Nov | −5.1 pts | 0.03 |
| 4 Nov | **+7.5 pts** | 9e-6 |
| 5 Nov | **−8.9 pts** | 8e-6 |
| 6 Nov | −8.0 pts | 0.02 |
| 9 Nov | **+6.0 pts** | 0.005 |
| 10 Nov | −1.6 pts | 0.61 |

**By stratum:**

| Stratum | E rate | NONE rate | p |
|---|---|---|---|
| ≥ $2M | 5.4% | 4.5% | 0.25 |
| < $2M | 13.6% | 10.2% | 0.04 |
| Pre-open | 66.7% (n = 72) | 54.2% | 0.045 |
| Regular session | 4.5% | 6.3% | 0.009 |

**Controls:** the R0 no-information control rate is 0/56. The late-filing group is 3/15.

**Verdict (frozen rule): NO EVIDENCE.**
- The pooled p is 0.75, far above 0.01.
- 5 of 7 days point the same way as the pooled sign, but the pooled sign is negative.
- The ≥ $2M stratum is not significant.

The pre-open and < $2M differences are post-hoc strata at p ≈ 0.04 among about 10 comparisons. They are **not** findings and must not be promoted. A filing alone does not separate future runners from the rest of the watcher's candidates on these days.

## Consequences and next fact

- **No live rule, gate or exit change.** The frozen B adverse-concentration result (6764028009) is untouched.
- Earlier detection of $1-and-over regular-session misses is a small population (8 in 7 sessions). The larger levers are pre-open names and the under-$1 group, and both are excluded by design or by the open rule.
- **Next feasible fact:** retain request/response clocks and news-source timestamps prospectively, through the normal authorized path. Only then can missing evidence be told apart from a feed limit. That requires its own approval; nothing is captured here.
