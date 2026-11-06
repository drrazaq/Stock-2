# Agent C (Crowd) research, 5 Nov 2026

This run was due Thu 5 Nov. A container restart lost the first attempt (nothing was committed), so it ran again on Fri 6 Nov.

**Score: Agent C Crowd: 0 points.** Tested this week: C-CT1a (rejected), C-CT1b (rejected), C-INS3-20 (rejected), C-INS3-60 (not proven; TRY SMALL bar only). C-LOCK was closed from its frozen 23 Oct run (too few cases). Champion: E3 (unchanged; its first batch is scored after 1 month, about 20 Nov).

**Tier:** no rule reached tier 2 (TRADABLE SMALL) or PROVEN. C-INS3-60 passed only the lower TRY SMALL bar. It is NOT PROVEN, so it can go to forward paper only.

## 1. Results

Each rule ran once. The first verdict is frozen in `data/agent-c2-lab.json` firstRun.

| Rule | Idea | Trades older / newer | Avg after 0.8% (older / newer) | Avg after 1.2% stress | Edge vs average stock | Block t | Verdict |
|---|---|---|---|---|---|---|---|
| C-CT1a | 8-K item 1.01 contract amount >= 10% of market cap; hold 20 | 133 / 181 | −1.1% / −2.0% | −1.5% / −2.4% | −0.9% / −2.8% | −1.44 / −0.96 | REJECTED |
| C-CT1b | Same, and the amount covers 4 quarters of cash burn | 89 / 144 | −3.5% / −2.3% | −3.9% / −2.6% | −3.2% / −2.9% | −2.39 / −1.75 | REJECTED |
| C-INS3-20 | 2+ "opportunistic" insiders buy within 5 sessions (Cohen, Malloy and Pomorski 2012); hold 20 | 65 / 57 | −2.6% / +1.0% | −3.0% / +0.6% | −2.2% / +0.2% | −0.90 / −0.03 | REJECTED |
| C-INS3-60 | Same, hold 60 | 58 / 50 | +2.7% / +11.3% | +2.3% / +10.9% | +2.2% / +7.1% | 1.18 / 1.44 | NOT PROVEN (TRY SMALL bar only) |

More detail:

- **C-CT1a:**
  - 314 trades, 246 stocks, 273 days.
  - Median trade −2.4%; worst trade and worst day −79%; 39% / 43% won.
  - Versus the S&P 500 over the same sessions: −1.4% / −3.4%.
  - By year, after cost:

    | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
    |---|---|---|---|---|---|
    | −4.6% | +1.5% | −4.1% | −5.0% | −1.0% | +0.8% |

- **C-CT1b:**
  - 233 trades, 181 stocks, 210 days.
  - Median −3.3%; worst −79%.
  - Adding the cash-burn condition made the result worse.
- **C-INS3-20:**
  - 122 trades, 75 stocks, 112 days.
  - Median −1.5%; worst −86%.
- **C-INS3-60:**
  - 108 trades, 74 stocks, 100 days.
  - Median +4.7%; 59% / 58% won.
  - Worst trade −91% (older half); worst day −59%.
  - Versus the S&P 500: +2.9% overall, but −0.2% in the older half, so it fails that gate.
  - It also fails block t ≥ 2.5 in both halves (1.18 / 1.44). It has only 9 / 12 blocks of 60 sessions.
  - By year, after cost:

    | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
    |---|---|---|---|---|---|
    | +9.2% | −3.7% | +7.1% | +4.9% | +23.8% | +6.0% |

  - It passes the TRY SMALL bar: profit after 1.2% in both halves, beats the average stock, still positive without its 2 best trades, 20+ trades and 3+ blocks per half.
  - It is one of 4 variants tested this week. The league luck bar is about t 4.1. Its newer half rests on 50 trades.

**What it means for the owner:**
- Do not buy a stock because its 8-K announces a deal that is large next to its size. Such stocks lag the market by about 1–3% over the next 20 sessions.
- Insider clusters with routine traders removed may have something over 3 months, but it is not proven. Paper only.

## 2. Data and method

**C-CT1 (contract size):**
- **Events:** EDGAR full-text search for item 1.01 8-Ks, from squad 21's cache (read only).
  - 56,041 hits.
  - 38,841 primary documents tied to a stock with prices.
  - 8-Ks that also list item 2.02 (earnings) were left out.
- **Coverage:** the whole market, dead stocks included.
- **Stock lookup:** each filing's CIK maps to its point-in-time ticker through squad 4's Form 3/4/5 map.
- **Documents:** all 38,841 primary documents were read once. Their item 1.01 sections are cached in agentc2-cache, so a parser change does not re-read them.
- **Stop rule:** 70.0% of filings state a dollar figure, above the pre-registered 40%.
- **Acceptance time:** read from each filing's `.hdr.sgml` (EDGAR Eastern clock) for 10,697 candidates; all were read.
- **Market cap:** close of the reaction session × the SEC share count known 30 days earlier.
- **Cash burn:** trailing-12-month operating cash flow (value-core ttmAt) from value-lab's companyfacts cache.

**Parser fixes, made before any return was computed** (each from a DIAG run that computes coverage and samples only):

| Version | DIAG run | Problem found | Fix | Liquid signals after (older / newer) |
|---|---|---|---|---|
| v1 → v2 | DIAG 1 | The "largest figure" was mostly equity-offering proceeds, ATM agreements, credit agreements and merger consideration. | v2 adds the financing words that the 22 Oct rule already meant ("financing, not customer contracts"). | 778 / 1,185 → 188 / 269 |
| v2 → v3 | DIAG 2 | Asset purchases and divestitures, termination fees, settlements, escrow, equity-line put notices, lender fees and property sale prices were still counted, and filer typos such as "$9,600,000 million" were read as $9.6 trillion. | v3 excludes those words and reads a comma-grouped number of 100,000+ followed by million/billion as plain dollars. | 133 / 181 |

- No threshold, hold, gate or date changed. The fixes are in the core header and the library (`parserFix`).
- **Honest limit:** the pre-registered "largest dollar figure in the section" cannot isolate contract value cleanly. DIAG 3 samples still include receivable balances, insurance limits and advances next to genuine contracts, licences and collaboration milestones.
- The verdict is about the rule as written. It does not show that a cleanly measured large customer contract cannot work. A cleaner version would need the value of the counterparty's order, which 8-Ks rarely state.

**C-INS3 (opportunistic insiders):**
- **Data:** SEC insider-transactions data sets for all 35 quarters from 2018 Q1. 33 were downloaded in DIAG 1. 2026 Q2 and Q3 came from the second SEC path in DIAG 2, and DIAG 2 also added that fallback.
- **History:** P and S trades by trade month for 67,760 owners.
- **Classification:** Cohen, Malloy and Pomorski's definition, per owner and trade year:
  - classified = at least one trade in each of the 3 prior years;
  - routine = the same calendar month in all 3 years;
  - opportunistic = classified and not routine.
- **Purchases by insiders from June 2021:** 19,816 routine, 13,984 opportunistic, 69,447 unclassified.
- **Signals:** 819 clusters, of which 178 were liquid.
- **Interpretation:** the 22 Oct library text ("drop routine, keep the rest") was read with the published definition, before any result.

**Common method:**
- Price cache to the latest session, plus Massive sessions since then.
- Entry at the next open; costs 0.8% (stress 1.2%); +300% cap on both the rule and the yardstick.
- Judged with value-core judge (bar 4.09), plus a pre-registered S&P 500 gate.

## 3. Tip sources (tip-score run inside this lab into `data/agent-c-tip-score.json`)

The price cache used by tip-score ends 19 Oct, so the numbers are the same as last week. New tips since then are scored after the Sunday 8 Nov cache refresh.

- **FOLLOW: none.** No source has 30+ finished tips on 10+ days.
- **FADE (base rule):**
  - **Reddit crowd:** 127 tips logged, 30 finished on 5 days; 5-session edge −3.5% vs the average stock (t −9.12); 30% won; −4.4% vs SPY. The tips still running average −6.2% (47 tips).
  - **YouTube VerifiedInvesting:** 63 logged, 19 finished on 5 days; edge −2.6% (t −2.06); 26% won. The tips still running average −4.3% (32 tips).
- **Too early, all negative so far:**
  - Analysts turning positive: 230 logged; 19 finished on 1 day, edge −12.3%.
  - ARK daily buys: 119 logged, 0 finished; running −4.1%.
  - Insider buying: 31 logged.
  - ZipTrader: 24 logged; 6 finished on 2 days, t −0.55.
- **Tier 2 FOLLOW / FADE:** none yet.

## 4. Web scout (registered in `data/strategy-library.json`)

1. **C-13FCON1: consensus hedge-fund conviction picks from 13F filings.**
   - Source: Iqbal, Jivraj and Angelini 2019 (SSRN); summary at https://www.cxoadvisory.com/investing-expertise/exploiting-consensus-hedge-fund-conviction-stock-picks/
   - Finding (gross, 2004–2019): 14.1% a year vs 10.3% for the S&P 500; alpha 0.32% a month.
   - Status: needs a 13F data-set loader (free, official). Low in the queue.
2. **C-10B5T: Rule 10b5-1 plan terminations.**
   - Source: Kim, Kim and Rajgopal 2025, https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5362431
   - Finding: plan terminations are followed by positive returns. Plan sales no longer predict falls after the 2023 rule.
   - Status: needs data. Item 408 disclosures start only in 2023, so the older half is too short.
3. **C-SOCMKT1: market-wide social-media bullishness, a contrarian timing signal.**
   - Sources: Cookson, Lu, Mullins and Niessner, AEA 2026, https://www.aeaweb.org/conference/2026/program/paper/9K6d53DN; and GIFfluence, https://arxiv.org/pdf/2512.20027
   - Status: queued for Agent A (timing). Needs data: there is no free official StockTwits history.
4. **C-ANRPT1: sell-side report text read by a language model.**
   - Source: https://arxiv.org/abs/2502.20489
   - Finding: 2005–2023 out of sample, alpha 0.68% a month, t 2.64.
   - Status: needs data (paid Investext). Registered so it is not scouted again.

Also read: arXiv 2602.06198 (insider purchases in microcaps; already in the library as C-INS52W, closed lane).

## 5. Files and commits

**Files (all new, Agent C's own):**
- `agent-c2-core.mjs`
- `agent-c2-lab.mjs`
- `.github/workflows/agent-c2-lab.yml` (one-shot, push of `run-agent-c2-now.txt`)
- `test/agent-c2-core.test.mjs`
- `data/agent-c2-lab.json`
- `data/agent-c2-diag.json`
- `data/agent-c2-run.log`
- `data/agent-c-tip-score.json`
- library entries in `data/strategy-library.json`

**Commits:**

| Commit | What |
|---|---|
| 0658bec | Pre-registration, and C-LOCK closed |
| 6dac301 | Lab and DIAG 1 |
| 56805c7 | Web scout |
| e570259 | Parser v2 and DIAG 2 |
| 443a822 | Parser v3 and DIAG 3 |
| 4c4609f | LAB trigger |
| 01dad14 | LAB result (frozen) |

**Actions runs:** 42132828673, 42146587243, 42155667048, 42155859541.

## 6. Next in the Agent C queue

1. **C-INS3-60 forward paper.** This needs a paper lane, for the main session to decide: 30+ resolved trades on 10+ days.
2. **C-SI1** (high short interest, avoid) and **C-NSI1** (net share issuance, avoid). The data is in hand for C-NSI1.
3. **C-IC1** (insider cluster + 8-K 1.01). It can reuse this lab's item 1.01 events and insider data, but it is likely too few cases.
4. **C-F144X** (Form 144 notices with no sale; the data starts in 2023).
5. **C-13FCON1 / C-13F1,** once a 13F loader exists.
