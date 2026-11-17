# Agent B (Value) research, Tue 17 Nov 2026

**Score:** 0 points. **Champion:** V15 (F-score 8-9 in an uptrend), unchanged. **Tested this week:** B-DREV1 is NOT PROVEN (TRY SMALL bar only), B-OE1 is NOT PROVEN (TRY SMALL bar only). **Tier 2 / PROVEN:** none.

## Results first

1. **B-DREV1 (buy after a big rise in deferred revenue, i.e. customers paying ahead): NOT PROVEN.** It made money in both halves after the 1.2% stress cost (+1.7% and +6.4% per 3-month trade) and beat the average stock (+1.6% and +3.6%). It also beat simply buying the fastest revenue growers from the same filings. But it is not steady enough: block t 1.93 and 0.88 (2.5 needed), and in 2024-26 the same stocks did better on their other filings (−3.8%). The median trade is about 0%. Forward paper only, never a buy.
2. **B-OE1 (owner's earnings yield, top 10%): NOT PROVEN.** It made money in both halves (+0.9% and +7.4% per 6-month trade after 1.2%) and edged the average stock (+0.9% and +0.8%), but block t is 0.77 / 0.83. It lost to B-FCF1's picks (+1.3% vs +9.1%; +7.8% vs +14.1%), to the simpler ANOM-CFOA picks in 2021-24, and to SPY in both halves. Nothing new over what the system already has.
3. **Dips list fix:** the dips watch list now checks for spin-offs (SEC 8-K item 2.01 plus a 15%+ one-day fall), so CTVA-type "crashes" move to a separate `dipsSpinOff` list. It takes effect at the next Sunday study run.

## 1. Results in my lane (live and paper, with distinct days)

| Item | Record | Verdict |
|---|---|---|
| Champion V15, league batches | 16 Oct batch (WST, HQY, MMSI, CHEF, CTAS, MRVL, FCFS, BLKB, G, EXLS; entry 20 Oct), 6 Nov batch (entry 9 Nov), 13 Nov batch (WST, HQY, STE, AWI, IDXX, MSFT, BLKB, TDC, WDFC, MMS; entry after 15 Nov). None scored yet (`data/agent-league.json`, 15 Nov: scored1m 0). The first 1-month score is due about 20 Nov. | **Too early** |
| B-FCF1 on TRY SMALL paper (`data/tier2-ledger.jsonl`) | 2 trades on 1 day (23 Oct), both closed by the 15% stop: RELY −15.8% (5 Nov), QLYS −15.8% (10 Nov). The 15% stop was never in the B-FCF1 test (open item, CLAUDE.md section 11). | **Losing** (2 trades, 1 day: far too few to judge) |
| B-FCF-EM1, V17, V15-SN, B-CR1, B-FCFN1 research lists (`data/value-today.json`) | Research lists only; no ledgers of their own. | **Too early** |
| League (15 Nov) | A 0, B 0, C 0 points. Luck bar t 4.12 after 2,591 tries. | |

## 2. Web scout

| Source | What it says | Action |
|---|---|---|
| Wang (2019), "The cash conversion cycle spread", *Journal of Financial Economics*: https://doi.org/10.1016/j.jfineco.2019.03.002, summary https://alphaarchitect.com/2019/04/a-remarkable-new-factor-the-cash-conversion-cycle/ | Firms with the shortest cash conversion cycle (inventory days + receivable days − payable days) beat the longest by 5-7% a year in alpha, in every size group, including large caps. | Registered **B-CCC1**, queue position 1. The needed SEC tags were added to the value cache this week. |
| Barth, Berkovitch and Israeli (2026), "The Information Content of Operational Effectiveness", *JBFA*: https://doi.org/10.1111/jbfa.70032 (PDF: https://iris.luiss.it/retrieve/acf267c0-71f7-400a-9bc5-0182d5dd21a9/BarthBerkovitchIsraeli-2026JBFA_The%20Information%20Content%20of%20Operational%20Effectiveness.pdf) | Investors under-react to an improving industry-adjusted cash conversion cycle. The 60-day drift after earnings rises with the change times the reaction (t 3.03, 1987-2022). | Registered **B-OPEFF1**, queue position 3. Uses the filing date as the event. |
| Haboub, Kartsaklas and Sarafidis (2025), residual-income V/P: https://arxiv.org/abs/2506.00206 | High value-to-price beats low over 1-3 years in the US. | Registered **B-VP1** as **needs data**: it needs dated analyst EPS forecasts (paid). A 12-month hold also gives under 3 blocks per half. |
| Vohra, Vij, Mehta and Ozcan (2024), cash productivity: https://arxiv.org/abs/2412.13311 | Cash return on short-term assets; weak across all Nasdaq stocks, alpha only in a hand-picked portfolio. | Registered **B-CASHP1**, queue position 5 (low prior). |
| "Out-of-Sample Alphas" (ASU conference, Feb 2025): https://finance-conference.wpcarey.asu.edu/sites/default/files/2025-02/Out-of-Sample_Alphas_%282025-02-12%29_with_link.pdf | General evidence that anomaly alphas shrink after publication. | Caution only; no new rule. |

- No dated public trader calls were found in the value lane. No FOLLOW or FADE changes.
- B-HAL1 (needs SPUS / HLAL rebalance dates), B-FND1 (proxy parsing), B-NOW1 and B-BBG1 stay unbuilt.

## 3. Builds (2, the weekly limit)

- **Pre-registration:** both rules were written in the `value-lab.mjs` header, in `value-core.mjs` (`drPair`, `drevAt`, `revGrowthAt`, `oeAt`) and in the library before any run (commit `fff21167`).
- **Smoke test first:** a local smoke run on synthetic prices and facts (scratch copy, no real returns) only checked that the code runs.
- **The judged run:** run once (Actions run 44102799943, trigger `7eaded11`). The first verdicts are frozen in `data/value-lab.json` `firstRun` (commit `a30d1e07`, the workflow's).

**Common method:**
- the 5-year whole-market cache, 2021-11-08 to 2026-11-13, dead stocks included;
- SEC companyfacts for 3,801 of 4,188 companies (bulk file; the tag set was widened, so every company was read again);
- entry at the next open;
- costs 0.8% (stress 1.2%);
- +300% cap on both the rule and the yardstick (capBoth);
- value-core judge; proof bar 4.12.

### B-DREV1: deferred revenue growth. Verdict: NOT PROVEN (TRY SMALL bar only)

**Rule:**
- **Events:** the B-FCFN1 events, i.e. each original 10-Q / 10-K, bought at the open after the filing day and held 63 sessions.
- **Signal:** deferred revenue at the period end minus a year earlier, over total assets.
- **Eligible:** only companies whose deferred revenue is at least 2% of assets.
- **Pick:** a positive signal above the causal 90th percentile of the previous 63 sessions' filings.
- **Extra gate:** it must beat the revenue-growth top 10% of the same filings.

| | Older half (to 29 Aug 2024) | Newer half |
|---|---|---|
| Trades / distinct days / distinct stocks | 389 / 202 / 115 | 363 / 182 / 119 |
| Average after 0.8% (median) | +2.1% (+0.0%) | +6.8% (+0.9%) |
| After 1.2% stress | +1.7% | +6.4% |
| Edge over the average stock | +1.6% | +3.6% |
| Vs the same stocks on their other filings | +2.2% | **−3.8%** |
| Without the 2 best | +1.6% | +5.7% |
| Block t (63-session blocks) | **1.93** (11) | **0.88** (8) |
| Revenue-growth top 10%, same filings | −3.2% | +5.3% |
| All eligible filings | +0.4% | +3.9% |
| SPY, same dates (information) | +2.7% | +4.3% |
| Best / worst trade | +85% / −67% | +211% / −72% |
| Win rate | 50% | 52% |

- **Overall:** 752 trades on 384 days, 175 stocks; median +0.5%. Worst day: 11 Mar 2024, −62.5% (1 trade).
- **Data:** 64,490 filings → 26,438 liquid with a share count → 8,033 with a deferred-revenue signal → 794 picked.
- **Why not tier 2:**
  - block t is under 2.5 in both halves;
  - in the newer half the picks did worse than the same stocks' other filings.
- **TRY SMALL bar:** passed. It is rated NOT PROVEN and counts as one more try for the luck bar.
- **Caveat:** the average leans on a few big winners (median about 0).
- **Treat as:** forward paper only. Today's research list is in `data/value-today.json` `research.B-DREV1`:
  - TH, KURA, ATEX and PAYS are halal unknown;
  - ARWR is ZAD ok;
  - QMCO and CECO are blocked;
  - AXTI is NOT HALAL.

### B-OE1: owner's earnings yield. Verdict: NOT PROVEN (TRY SMALL bar only)

**Rule:**
- **Universe:** each 21-session formation, liquid non-financial stocks.
- **OE** = TTM (revenue − cost of sales − SG&A) − Δ(receivables, inventory, prepaid) + Δ(payables, accrued, deferred revenue) − TTM capex, over market value.
- **R&D:** neither subtracted nor added back. XBRL SG&A excludes R&D, so this equals the paper's measure.
- **Pick:** top 10%, equal weight, held 126 sessions.
- **Extra gates:** it must beat B-FCF1 picks and ANOM-CFOA picks on the same dates over the same hold.

| | Older half (to 13 May 2024) | Newer half |
|---|---|---|
| Trades / formation days / stocks | 1,866 / 29 / 220 | 1,766 / 24 / 224 |
| Average after 0.8% (median) | +1.3% (−0.3%) | +7.8% (+0.9%) |
| After 1.2% stress | +0.9% | +7.4% |
| Edge over the average stock | +0.9% | +0.8% |
| Vs the same stocks on other days | +2.4% | +7.9% |
| Without the 2 best | +1.1% | +7.5% |
| Block t (126-session blocks) | **0.77** (5) | **0.83** (4) |
| B-FCF1 picks, same dates, 126 sessions | **+9.1%** | **+14.1%** |
| ANOM-CFOA picks, same dates | **+2.1%** | +5.9% |
| SPY, same dates (information) | +5.3% | +8.5% |
| Best / worst trade | +299% / −86% | +299% / −89% |
| Win rate | 49% | 51% |

- **Overall:** 3,632 trades on 53 formation days, 327 stocks; median +0.2%. Worst day: 14 Oct 2024, −19.0% average over 68 trades.
- **Data:** 92,086 stock-days checked, 40,933 with an OE yield; 60-83 picks a month.
- **Why not tier 2:**
  - block t is under 1 in both halves;
  - it does not beat B-FCF1 in either half, or ANOM-CFOA in the older half.
- **TRY SMALL bar:** formally passed (profit after 1.2% in both halves, beats the average stock, survives without the 2 best, 20+ trades and 3+ blocks). But it trails B-FCF1 and SPY, so it adds nothing.
- **Treat as:** information only; forward paper list in `research.B-OE1`.

## 4. Dips list: spin-off check (quality.mjs, Agent B's lane)

**The problem.** The price cache is not adjusted for spin-offs, so a parent's distribution day looked like a crash:
- Corteva (CTVA) spun off Vylor on 1 Oct 2026 and showed as "down 85%";
- APTV (Versigent) showed as "down 48%".

**The fix** (commit `f6158bed`):
- **What is checked:** for each dips candidate (up to 40), `quality.mjs` reads the company's SEC submissions list (official `data.sec.gov` API, one request each).
- **The flag** (`value-core.mjs spinOffFlag`): an 8-K listing **item 2.01** (completion of disposition) filed in the last 252 sessions, together with a **15%+ one-day fall** in the 10 days up to that filing.
- **Flagged stocks** move from `dips` to a new `dipsSpinOff` list, with the reason.
- **If SEC cannot be read**, the stock stays in `dips` with `spinCheck: 'unknown'`.
- **Checked against the real filings:** Corteva's 8-K of 5 Oct 2026 lists items 1.01, 2.01 and 9.01 (SEC EDGAR).

**Scope and tests:**
- The FAIR-PRICE DIP backtest is **not** changed (frozen REJECTED); only today's watch list is.
- 4 new tests: `test/value-core-spinoff.test.mjs`.
- It takes effect at the next Sunday study run (`leaders-study.yml` runs quality.mjs).

## 5. Dips watch list (`data/quality.json`, 13 Nov; FAIR-PRICE DIP is REJECTED, so this is information only, not a buy list)

| Stock | One line of news |
|---|---|
| CTVA | **Spin-off, not a dip** (Vylor, 1 Oct). It will move to `dipsSpinOff` from the next Sunday run. |
| FLO | Q3 (12 Nov): adjusted EPS $0.10 vs $0.15 expected, sales −4.7%; 2026 outlook cut again; stock −8%. |
| FVRR | Q3 beat, but revenue −16% y/y and the Q4 guide is −20% to −25% (last week). |
| GPK | Q3 EPS $0.23 in line, revenue beat (3 Nov). |
| MGM | Q3 (late Oct): revenue in line but flat; EPS missed on weak Las Vegas; voting agreement with People Inc. amended. |
| KD | Jumped about 26% on 5 Nov on better margins; guidance kept. |
| OXM | No new results (next in December); Goldman Sachs and FMR report passive 13G stakes. |
| YELP | Q3 revenue $370.9M, −1% y/y; advertising −6%. |
| WHR | Q3 miss, 2026 guide cut to a GAAP loss; new 8.5% convertible preferred (dilution). |
| OLN | Q3 back to a profit; Q4 adjusted EBITDA guide $80-100M. |
| WSC | Q3 reported; volumes turned up but EBITDA guide flat and capex heavy (headline, not read in full). |
| BRBR | FY2026 Q4 results and FY2027 outlook **Wed 18 Nov, 7:00 a.m. ET**; the forecast was cut in August on inventory issues. |
| APTV | **Likely spin-off** (Versigent), not a 48% fall; the next Sunday run will check it. Also on this week's B-OE1 list (ZAD ok). |
| UPWK | Q3 reported 2 Nov; market value about $1.3B, P/E about 12. Also on the B-OE1 list. |
| RH | Up 20% in October with housing stocks. |
| BBW | Michael Burry has a full position; about 7x forward earnings (Oct). |
| BLDR | Q3 beat (29 Oct); the stock jumped. |
| PZZA | Analyst targets cut; one fair-value estimate $29 → $23.50. |
| ENOV | No news found this session; also on the B-OE1 list (blocked). |
| HUN | Q3 reported 3 Nov; 2026 EPS consensus cut about 47%. |

## 6. Tests and commits

- `node --test test/*.test.mjs`: 1,472 of 1,472 pass. New tests:
  - `test/value-core-nov17.test.mjs` (4);
  - `test/value-core-spinoff.test.mjs` (4).
- **Commits:**

  | Commit | What |
  |---|---|
  | `f6158bed` | Spin-off check: quality.mjs dips, `value-core.mjs` `spinOffFlag` / `recentFilings`, tests |
  | `fff21167` | Pre-registration: value-lab header, value-core functions, library B-DREV1 / B-OE1 built text; new entries B-CCC1, B-OPEFF1, B-VP1, B-CASHP1 |
  | `7eaded11` | Run trigger (`run-value-lab-now.txt`) |
  | `a30d1e07` | The lab's frozen result ("value lab 2026-11-17", by the workflow) |
  | (this doc) | |

- Nothing was re-run. B-FCFN1 and every other frozen rule were left alone (coordination note).

## 7. Next session (Tue 24 Nov)

1. V15's first 1-month league score (about 20 Nov).
2. B-CCC1 (pre-register first; the tags are now in the value cache), then B-OPEFF1.
3. Check that the Sunday 22 Nov run moved CTVA (and APTV if flagged) to `dipsSpinOff`.
