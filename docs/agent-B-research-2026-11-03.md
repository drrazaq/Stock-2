# Agent B (Value) research, Tue 3 Nov 2026

**Score:** 0 points. **Champion:** V15 (F-score 8-9 in an uptrend), unchanged. **Tested this week:** B-FCF-EM1 is NOT PROVEN, V17 is REJECTED. **Tier 2 / PROVEN:** none.

## 1. What was built (2 builds, the weekly limit)

Both rules were pre-registered **before any run**:
- in the `value-lab.mjs` header and the library entries (commit `c5cabbf`);
- with their pure rules in `value-core.mjs` (`latestReport`, `npyAt`).

The one-shot run started with commit `run the value lab now` (Actions run 41631813140, 3 min). The first verdicts are frozen in `data/value-lab.json` under `firstRun`.

The data covers 2021-10-12 to 2026-10-19, the whole market including dead stocks. The tests used:
- entry at the next open;
- costs of 0.8% (stress 1.2%);
- the yardstick capped at +300% on both sides (capBoth);
- halves split at the median formation day.

### B-FCF-EM1: cash-rich, growing, low-debt companies that also just beat earnings. Verdict: NOT PROVEN

**Rule:** the B-FCF1 picks, kept only when the stock's latest earnings report beat the estimate. The report must be dated before the formation day and be no older than 120 days. Hold 63 sessions.

| | Older half | Newer half |
|---|---|---|
| Trades / days / distinct stocks | 56 / 23 / **11** | 52 / 21 / **10** |
| Average after 0.8% (median) | +5.3% (+4.8%) | +12.1% (+11.7%) |
| After 1.2% stress | +4.9% | +11.7% |
| Edge over the average stock | +3.5% | +9.7% |
| Vs the same stocks on other days | +0.3% | +10.0% |
| Without the 2 best | +3.6% | +10.7% |
| Block t (63-session blocks) | **1.28** (8 blocks) | 2.96 (8 blocks) |
| Best / worst trade | +50.9% / −39.5% | +49.4% / −34.3% |
| Win rate | 55% | 69% |

The rule's own gates on the same dates all passed:

| Comparison (average after cost) | Older half | Newer half |
|---|---|---|
| B-FCF1 | +2.5% | +6.8% |
| B-FCF1 picks in the earnings cache, beat or not | +2.1% | +8.9% |
| SPY | +4.7% | +3.8% |
| **This rule** | **+5.3%** | **+12.1%** |

- **Worst formation days** (average net): 13 Feb 2023 −23% (1 stock), 12 Dec 2022 −18% (3 stocks), 12 Jan 2023 −16% (3 stocks).
- **Why it is not tier 2:** block t is 1.28 in the older half, against the 2.5 needed.
- **Honest caveats:**
  - It is very thin: about 10 stocks per half.
  - The earnings data covers mostly large companies alive today (survivorship). Gate (b) controls for this, but does not remove it.
  - Only 155 of the 676 cached picks had a usable current report.
- **Treat as:** forward paper only.

### V17: net payout yield (dividends + buybacks − new shares, over market value). Verdict: REJECTED

**Rule:** the top 10% of liquid non-financial stocks, held 126 sessions.

| | Older half | Newer half |
|---|---|---|
| Trades / days / stocks | 2,432 / 29 / 287 | 2,389 / 24 / 310 |
| Average after 0.8% (median) | +0.7% (−0.4%) | +2.3% (−2.4%) |
| Edge over the average stock | +1.2% | **−5.0%** |
| Block t | 0.64 | **−3.91** |
| SPY on the same dates | +4.7% | +8.8% |

It lost to SPY and, in 2024-26, to the average stock. This matches its siblings ANOM-BBY and SQ16-SHYLD, which were both rejected earlier.

## 2. Bug found and fixed: VL-1 (value-lab.mjs)

The forward-return memo stored every hold other than 21 and 63 sessions under one shared key. So B-CR1 and B-CR1-AVOID (60 sessions, frozen 27 Oct) could read V15-SN's 126-session returns for the same stock and day.

**The fix:** the key now includes the hold.

**Re-judgement:** both rules were re-judged once on the identical frozen window and written to `correctedRun`. `firstRun` is untouched.

| Rule | Frozen verdict | Corrected verdict | Older half | Newer half |
|---|---|---|---|---|
| B-CR1 | REJECTED | REJECTED | −5.0% avg, block t −1.51 | +3.5%, block t 0.42 |
| B-CR1-AVOID | NO AVOID | NO AVOID | | |

No verdict changed. V15-SN was not affected, because it ran first.

## 3. Web scout (sources)

| Source | What it says | Action |
|---|---|---|
| Lem, Koski and McVay, "The Market Reaction to Free Cash Flow News", SSRN 2025: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5375954 | The market reacts to FCF news at the announcement, more for growth firms and noisy earnings. It measures the reaction, not a drift. | Registered as **B-FCFN1** (FCF-news drift after the 10-Q/10-K, vs an earnings-news-only version). Data is in the system. Queue position 1. |
| "Buyback Guidance and the Agency Costs of Cash", SSRN: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5023151 | Quantitative buyback targets in earnings releases. | Registered as **B-BBG1**, marked **needs data**: it needs a validated parser for the text of 8-K exhibit 99.1. |
| Novy-Marx, "Profitability Retrospective", NBER w33601 (2025): https://www.nber.org/system/files/working_papers/w33601/w33601.pdf | Profitability held up after publication. | Not registered: already tested as ANOM-GP, V2 and SQ16-GPVAL (all rejected here). |
| Jacobs and Müller, "Anomalies across the globe" (JFE): https://www.unicreditgroup.eu/content/dam/unicreditgroup-eu/ucfoundation/WorkingPapers/2019/wp-135-Jacobs-e-Mueller.pdf | US anomalies lost about 60% of their returns after publication. | A caution only: consistent with almost every published value rule failing here. |

- No dated public trader calls were found in the value lane. No FOLLOW or FADE changes.

**Queue status:**
- B-HAL1 still needs official SPUS/HLAL rebalance dates.
- B-FND1 still needs parsing of DEF 14A proxy statements. Both stay "queued", not built.

## 4. Dips watch list (`data/quality.json` dips; the FAIR-PRICE DIP test is REJECTED, so this is information only, not a buy list)

| Stock | One line of news |
|---|---|
| FLO | Q3 results due 12 Nov (after the close); consensus "Reduce", target $6.80; the 8% dividend has a payout ratio above 190% (MarketBeat, 29 Oct). |
| KD | Reports before the open on Wed 4 Nov; last at about $13.8. |
| NCLH | Q3 beat with raised EBITDA guidance; analysts raised targets; stock about $18.3 (up 4% on 2 Nov as oil fell). |
| YELP | Q3 results 5 Nov after the close; revenue estimate $369M. |
| GPK | Q3 out today (3 Nov): EPS $0.23 in line, revenue $2.19B beat; guidance given. |
| WHR | Q3 (26 Oct) missed: EPS −$0.21 vs estimate; revenue −8.8% y/y; 2026 guide cut to a GAAP loss; new 8.5% mandatory convertible preferred (dilution). |
| OLN | Q3 back to a profit (EPS $0.13); stock +9.7% to about $18; Q4 adjusted EBITDA guide $80-100M. |
| BRBR | Down 78% in 3 years; shareholder lawsuit notices (29 Oct); FY2026 guidance cut earlier. |
| APTV | Q3 due 3 Nov before the open. The "50% fall" in the cache is probably the Versigent spin-off (April), not a loss: data check still open. |
| UPWK | No fresh headline found this session; the last news was a lowered 2026 revenue outlook. |
| ENOV, FWRG, BBW, CPB, PZZA, RH, BLDR, HUN, SMPL, LZ | Not researched this session. |

## 5. Tests and commits

- `node --test test/*.test.mjs`: 1,254 of 1,256 pass. The 2 failures are in `test/try-small-audit.test.mjs` (tests 1 and 3b, scan.mjs TRY SMALL). They fail the same way on a clean checkout before my changes, so they are not caused by this work (likely a date-dependent fixture). They are left for the main session, because scan.mjs and its tests are not Agent B's files.
- The new tests are in `test/value-core-nov.test.mjs` (2 tests, passing).
- Commits:
  - `c5cabbf`: pre-registration and the VL-1 fix;
  - the run trigger;
  - the lab's own result commit ("value lab 2026-11-03");
  - this doc.

## 6. Next session (Tue 10 Nov)

1. B-FCFN1, the FCF-news drift (pre-register first).
2. B-FCF-EM1 stays on forward paper only. Today's research picks (not buys), with halal from ZAD:
   - unblocked: QLYS, EBAY, NEM, DINO;
   - blocked for share-count growth: CVX, DVN.
3. Dips data check: the APTV spin-off; BRBR and UPWK fair ranges.
4. V15's first league score is due about 16-20 Nov.
