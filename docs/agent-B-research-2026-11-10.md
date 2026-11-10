# Agent B (Value) research, Tue 10 Nov 2026

**Score:** 0 points. **Champion:** V15 (F-score 8-9 in an uptrend), unchanged. **Tested this week:** B-FCFN1 is NOT PROVEN (it passes only the lower TRY SMALL bar), B-V15BE is REJECTED. **Tier 2 / PROVEN:** none.

## Results first

1. **B-FCFN1 (buy after a big free-cash-flow jump in a 10-Q / 10-K): NOT PROVEN.** It made money in both halves (+2.9% and +5.6% per 3-month trade after cost) and beat the average stock. But in 2024-26 it was not steadier than chance (block t 1.02, 2.5 needed), and it did no better than simply buying the biggest net-income jumps (+5.6% vs +5.9%). Level: TRY SMALL bar only. Forward paper only, never a buy.
2. **B-V15BE (LONGER HOLDS with a break-even stop after +15%): REJECTED.** The extra stop did not help: +5.5% vs +5.9% (older half) and +0.4% vs +0.4% (newer half). The live V15 rule stays as it is.
3. **Side finding about the owner's LONGER HOLDS lane (V15 with its live exits).** On the same 1,159 buys it lost to SPY over the same windows in both halves: +5.9% vs SPY +8.1% (2021-24) and +0.4% vs SPY +3.8% (2024-26). In 2024-26 it also trailed the average stock by 3.1%. The owner chose this lane and labelled it as not proven, so it is not changed here. This is information for him.

## 1. Results in my lane (live and paper, with distinct days)

| Item | Record | Verdict |
|---|---|---|
| Champion V15, league batches | 16 Oct batch (10 stocks, entry 20 Oct) and 6 Nov batch (WST, AWI, STE, HQY, IDXX, ALV, MSFT, NTAP, CTAS, AAPL; entry 9 Nov). None scored yet; first 1-month score about 20 Nov. | **Too early** |
| B-FCF1 on TRY SMALL paper (`data/tier2-ledger.jsonl`) | 2 rows on 1 day (23 Oct): RELY stopped at −15.8% (5 Nov); QLYS still open. | **Too early** (1 day) |
| B-FCF-EM1 (forward paper only since 3 Nov) | No ledger of its own yet; today's research list (lab, formed 9 Oct): NEM, QTWO, DINO (ZAD ok), CVX, SKWD (halal unknown); DVN blocked (share count +82%). | **Too early** |
| V15 with its live exits (new, from this week's test) | 1,159 buys on 44 formation days, 158 stocks: see the side finding above. | **Losing to SPY** in both halves (historical, not live) |
| League | Agent A 0, B 0, C 0 points (8 Nov). Luck bar t 4.1 after 2,436 tries. | |

## 2. Web scout

| Source | What it says | Action |
|---|---|---|
| Vyas, "Owner's Earnings, Cash-based Operating Profits, and Capital Expenditures in the Cross Section of Stock Returns", SSRN 2024: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4794183 | Cash-based operating profit minus capex, over a size measure, predicts returns: FF6 / q5 alpha, Sharpe 1.19 (in sample). | Registered as **B-OE1**, queue position 3. Prior is low: its siblings ANOM-CFOA (rejected) and B-FCF1 (not proven) are close. |
| Ball, Gerakos, Linnainmaa and Nikolaev, "Accruals, Cash Flows, and Operating Profitability", SSRN 2587199: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2587199 | The source of cash-based profitability. A summary reports it about 26% weaker out of sample and 58% weaker after publication. | Background for B-OE1. Already tested as ANOM-CFOA (rejected). |
| Prakash and Sinha (2013), deferred revenue change, listed in Chen and Zimmermann, "Open Source Cross-Sectional Asset Pricing": https://www.federalreserve.gov/econres/feds/files/2021-037pap.pdf and the NFA "Staleness Trap in Market Anomalies" paper: https://portal.northernfinanceassociation.org/viewp.php?n=2240211204 | A growth in deferred revenue (customers paying ahead) appears among the replicated predictors. | Registered as **B-DREV1**, queue position 4. Needs new SEC tags in the value cache; the system can get them. |
| Hou, Xue and Zhang, "Replicating Anomalies", NBER w23394: https://www.nber.org/system/files/working_papers/w23394/w23394.pdf | 64% of 447 anomalies are insignificant once microcaps are controlled; payout yield and dividend yield are among the failures. | Caution only. Consistent with V17 and most value rules failing here. |

- No dated public trader calls were found in the value lane. No FOLLOW or FADE changes.
- B-HAL1 (needs SPUS / HLAL rebalance dates), B-FND1 (needs proxy parsing), B-NOW1 (needs dated consensus history) and B-BBG1 (needs an 8-K text parser) stay unbuilt.

## 3. Builds (2, the weekly limit)

Both rules were written in the `value-lab.mjs` header, in `value-core.mjs` and in the library **before any run** (commit `9e27afd9`). They ran once (Actions run 42811574377, trigger `5bb7b7a0`); the first verdicts are frozen in `data/value-lab.json` `firstRun` (commit `e9ad49ae`, the workflow's). Before that, a local smoke run on synthetic prices (no real returns) only checked that the code runs.

Common method: the 5-year whole-market cache 2021-11-01 to 2026-11-06, dead stocks included; SEC companyfacts for 3,537 of 3,916 companies (bulk file); entry at the next open; costs 0.8% (stress 1.2%); +300% cap on the rule and the yardstick (capBoth); value-core judge; proof bar 4.1.

### B-FCFN1: free cash flow news drift. Verdict: NOT PROVEN (TRY SMALL bar only)

**Rule:** at each original 10-Q / 10-K, FCF news = this quarter's (operating cash flow − capex) minus the same quarter a year earlier, over market value. Buy the open of the session after the filing day when the news is positive and above the 90th percentile of all filings in the previous 63 sessions (a causal cut; the 3 Nov "monthly pool" wording would have looked ahead). Hold 63 sessions.

| | Older half (to 26 Jul 2024) | Newer half |
|---|---|---|
| Trades / distinct days / distinct stocks | 1,106 / 308 / 530 | 1,124 / 279 / 589 |
| Average after 0.8% (median) | +2.9% (+0.9%) | +5.6% (+2.0%) |
| After 1.2% stress | +2.5% | +5.2% |
| Edge over the average stock | +3.5% | +2.6% |
| Vs the same stocks on their other filings | +5.8% | +5.5% |
| Without the 2 best | +2.5% | +5.1% |
| Block t (63-session blocks) | 2.74 (10 blocks) | **1.02** (9 blocks) |
| Earnings-news-only version, same filings | +0.9% | **+5.9%** |
| All eligible filings | −0.3% | +3.4% |
| SPY, same dates | +2.3% | +4.8% |
| Best / worst trade | +206% / −91% | +299% / −67% |
| Win rate | 52% | 53% |

- Overall: 2,230 trades on 587 days, 824 stocks; median +1.3%. Worst day: 15 Nov 2023, −75% (1 trade).
- **Why not tier 2:** block t 1.02 in the newer half; and in that half it was not better than the earnings-news version.
- **TRY SMALL bar:** passed (profit after 1.2% in both halves, beats the average stock, survives without the 2 best, 20+ trades and 3+ blocks). It is rated NOT PROVEN and is one more try for the luck bar.
- **Caveats:** the median trade is small (+1-2%), so the average leans on big winners; a stock's symbol comes from today's SEC ticker map, so some dead companies are missing.
- **Treat as:** forward paper only. Today's research list is in `data/value-today.json` `research.B-FCFN1` (47 names; e.g. PARR and CVS are ZAD ok; most are halal unknown; MPC is NOT HALAL).

### B-V15BE: V15 with a break-even stop. Verdict: REJECTED

**Rule:** the V15 buys exactly (every 21 sessions). Exits on closes, sold at the next open: the 25% stop, SELL WITH PROFIT at 130% of the 50-day average, else the close of session 126. The variant adds: after a close 15%+ above the buy, a later close under the buy price sells.

| | Older half (to 4 Oct 2024) | Newer half |
|---|---|---|
| Trades / days / stocks | 649 / 25 / 116 | 510 / 19 / 101 |
| Average after 0.8% (median) | +5.5% (+3.0%) | +0.4% (−2.5%) |
| After 1.2% stress | +5.1% | −0.0% |
| Edge over the average stock | +2.8% | −3.0% |
| Vs the same stocks on other days | −3.3% | −6.9% |
| Block t | 3.11 (5) | −0.88 (4) |
| **Same buys, V15 live exits** | **+5.9%** (median +5.6%) | **+0.4%** (median −2.5%) |
| SPY over the same windows | +8.1% | +3.8% |
| Best / worst trade | +86% / −40% | +171% / −59% |

- Exits with the break-even stop: 738 time, 177 stop, 168 break-even, 76 profit. With the V15 exits: 872 time, 201 stop, 86 profit.
- Worst day: 5 Dec 2024, −16.7% average over 43 trades (−15.8% with the V15 exits).
- **Level:** none. The break-even stop cuts winners without saving losers.

## 4. Dips watch list (`data/quality.json` dips, 8 Nov; the FAIR-PRICE DIP test is REJECTED, so this is information only, not a buy list)

| Stock | One line of news |
|---|---|
| CTVA | **Data error, not a dip:** Corteva spun off its seed business (Vylor, VYLR) on 1 Oct; the 85% "fall" is the spin-off. JPMorgan upgraded the new Corteva to Overweight (target $19). Should be removed from the dips list. |
| FLO | Q3 results Thu 12 Nov after the close; Q2 sales −4%, adjusted EPS $0.21 vs $0.30; quarterly dividend now $0.125 (it was cut). |
| KD | Jumped about 26% on 5 Nov: Q2 revenue $3.65B fell but margins rose; full-year guidance reaffirmed. |
| GPK | Q3 (3 Nov): EPS $0.23 in line, revenue $2.19B beat (last week's check). |
| FVRR | Q3 beat (revenue $90.9M vs $83.8M) but down 16% y/y; Q4 guide −20% to −25% y/y; stock fell 7% to about $8.4. |
| YELP | Q3 revenue $370.9M, −1% y/y; advertising revenue −6%. |
| OXM | Not researched this session. |
| WHR | Q3 missed and 2026 guide cut to a GAAP loss; new 8.5% mandatory convertible preferred (dilution) (last week). |
| OLN | Q3 back to a profit; Q4 adjusted EBITDA guide $80-100M (last week). |
| BRBR | FY2026 Q4 results and FY2027 outlook on Wed 18 Nov before the open; down about 75%, shareholder lawsuit notices. |
| WSC | Not researched this session. |
| APTV | Q3 reported 3 Nov; stock about $40.9 (−5.6% on 5 Nov). The "50% fall" is likely the Versigent spin-off: same data check as CTVA. |
| UPWK | Q3 reported 2 Nov; market cap about $1.3B, P/E about 12. |
| PZZA | Analyst targets cut; one fair-value estimate moved from $29 to $23.50. |
| ENOV, BLDR, RH, HUN, BBW, SMPL | Not researched this session. |

## 5. Tests and commits

- `node --test test/*.test.mjs`: 1,401 of 1,401 pass (4 new in `test/value-core-nov10.test.mjs`).
- Commits:
  - `9e27afd9`: pre-registration (value-core functions, value-lab header and rule code, tests, library entries B-FCFN1 / B-V15BE, and new entries B-OE1 / B-DREV1);
  - `5bb7b7a0`: the run trigger;
  - `e9ad49ae`: the lab's frozen result ("value lab 2026-11-10");
  - this doc.

## 6. Next session (Tue 17 Nov)

1. B-OE1 or B-DREV1 (pre-register first); B-HAL1 / B-FND1 still need data.
2. V15's first league score (about 20 Nov).
3. Dips data check: CTVA and APTV are spin-offs, not falls (the dips code is in quality.mjs, not Agent B's file; flagged for the main session).
