# Agent C (Crowd) research, Thu 12 Nov 2026

**Score: Agent C Crowd: 0 points.** Tested this week: C-IC1 (REJECTED), C-SI1 (NOT PROVEN), C-SI1-DTC (NOT PROVEN). Champion: E3 (unchanged; first batch scored about 20 Nov).

**Tier:** none. No rule reached tier 2 (TRADABLE SMALL) or PROVEN, and none passed the TRY SMALL bar.

## Results first

1. **C-IC1, insider cluster + material contract: REJECTED.** Do not buy a stock because 2+ insiders bought around the time it announced a material agreement (8-K item 1.01). Over 20 sessions it lost money after cost in both halves (−1.1% / −1.8% a trade) and trailed the average stock and the S&P 500.
2. **C-SI1, short interest over 20% of shares (avoid): NOT PROVEN.** Heavily shorted stocks did lag the average stock over the next 20 sessions: −3.8% (2021–23) and −1.1% (2024–26). But the newer half is weak (t −1.05), and the same stocks did no better on their other days. Information only; not a SELL reason.
3. **C-SI1-DTC, top 10% days-to-cover (avoid): NOT PROVEN.** The published days-to-cover effect (Hong et al. 2015) is about zero here: −0.6% / −0.0% vs the average stock.
4. **Tip sources: two more sources are FADE at tier 2 (ARK daily buys, YouTube VerifiedInvesting), and "Analysts turning positive" is now FADE.** No source is FOLLOW. Numbers are in section 2.
5. **Champion E3 will pick nothing until January.** SEC insider data sets are published once a quarter, so its "last 30 days" list is empty between quarter files (6 Nov batch: no picks). See section 1.

## 1. Results in my lane (live and paper, with distinct days)

| Item | Record | Verdict |
|---|---|---|
| Champion E3 (insider cluster buying), league batches | 16 Oct batch: 7 stocks (FUL, BBD, FNWD, BPRE, KWY, KOD, BGDE), entry 20 Oct, 1-month score about 20 Nov. 6 Nov batch: **empty** ("champion picked nothing"). | **Too early** |
| Why E3 is empty | `insider-study.mjs` builds `recent` (clusters filed in the last 30 days) from the SEC quarterly insider data sets. The Q3 file ends 30 Sep; the Q4 file comes in early January. So from about 30 days after a quarter ends until the next file, E3 has no picks. Its league batches will be empty for about 2 months of every 3. | Structural gap (reported, not changed) |
| C-INS3-60 (TRY SMALL bar only, 6 Nov) | No paper lane yet (a main-session decision). | **Too early** |
| FADE flags in ACTIONS | Already live: `scan.mjs` reads `data/tip-score.json` `fade` and shows "DO NOT BUY (tipped by a FADE source…)". | Working as designed |
| League (8 Nov) | A 0, B 0, C 0 points; luck bar t 4.1 after 2,436 tries. | |

**E3 options for the main session (not done here; agents.json was not changed):**
- feed `recent` from the SEC live Form 4 filings (the `edgar-feed.mjs` route), so the champion always has current clusters; or
- accept empty batches between quarter files.

## 2. Tip sources (tip-score, scored 8 Nov on prices to 6 Nov)

The Sunday study re-scored every tip logged since 19 Oct on the refreshed cache; no rule was changed. Edge = the tip's 5-session return minus the average stock bought the same day, after cost. t is by day.

| Source | Finished tips (5 sessions) | Days | Edge vs average stock | t | Won | Verdict (frozen) | Change since 5 Nov |
|---|---|---|---|---|---|---|---|
| ARK daily buys | 76 | 14 | −5.9% | −5.54 | 24% | **FADE (tier 2)**; both halves t −2.77 / −4.61 | new FADE, tier 2 |
| YouTube: VerifiedInvesting | 54 | 17 | −4.6% | −6.18 | 28% | **FADE (tier 2)**; halves t −2.76 / −4.68 | moved to tier 2 |
| Analysts turning positive | 189 | 15 | −5.3% | −3.15 | 32% | **FADE**; tier 2 no (older half t −0.92) | new FADE |
| Reddit crowd | 98 | 19 | −2.8% | −2.89 | 39% | **FADE**; tier 2 no (t −1.83 / −1.16). 20 sessions: 28 tips on 4 days, −15.3% | unchanged |
| Insider buying (live list) | 19 | 12 | −1.5% | −1.22 | 47% | no edge either way | — |
| YouTube: ZipTrader | 17 | 8 | −3.6% | −1.44 | 53% | no edge either way | — |
| الملعبي | 27 | 4 | −6.8% | −2.04 | 37% | too early (under 5 days) | — |

- **FOLLOW: none.** No source has a positive record.
- **FADE (tier 2): ARK daily buys, YouTube VerifiedInvesting.** Their tips are already shown as DO NOT BUY for 20 sessions.
- **Caveat:** all of this is October–November 2026 only (14–19 days). The edge is measured against the average stock on the same days, so a falling market does not explain it.

## 3. Web scout

| Source | What it says | Action |
|---|---|---|
| Ozlen and Batumoglu, "The Death of Insider Trading Alpha", SSRN 5966834 (Dec 2025): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5966834 | On Russell 2000 Form 4s, 70–80% of the alpha appears between the trade date and the next session, before the filing is public. | **C-INSLAG1** (evidence note, not built). It agrees with E3, C-INS2, C-INS3 and C-IC1 here: insider buys seen at the filing date carry little. |
| Ma, "The Changing Role of Preplanned Insider Trades", SSRN 7194898 (2025): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7194898 | After the 2022 Rule 10b5-1 amendments, planned trades lose their signal; unplanned trades predict only short term. | **C-10B5P**, queued low, needs data: the Form 4 10b5-1 box exists only from April 2023, too short for two halves. |
| Hong, Li, Ni, Scheinkman and Yan, "Days to Cover and Stock Returns", NBER w21166: https://www.nber.org/papers/w21166 | Days-to-cover predicts poor returns better than the short ratio; long-short 1.2% a month. | **C-SI1-DTC**, built this week (NOT PROVEN). |
| Didisheim, Kelly, Pourmohammadi and Tian, "The Inefficient Pricing of News", NBER w35093 (Apr 2026): https://www.nber.org/papers/w35093 | "Pure news" (news text minus what stock traits predict) predicts returns up to 18 months. | **C-PNEWS1**, needs data (no free whole-market news archive). |

- No new public trader with dated calls was found to add to tip-score.

## 4. Builds (2, from the queue)

- The queue item C-GOV1 (parent map and government-award test) was already done on 25 Oct (C-GOV1b: too few cases; the information version was rejected). C-CONG1 was done on 1 Nov (rejected). So this week built **C-IC1** and **C-SI1**. C-SI1-DTC is a second version inside the C-SI1 build.
- **Pre-registration:** all three rules were written in the `agent-c3-core.mjs` header and in the library before any run (commit 0f134b5a).
- **Data checks:** two DIAG runs came first. They computed coverage and counts only, with no return.
- **Fix found by DIAG 1:** FINRA files from Sep 2026 put every field in quotes, so the parser skipped them. The coverage check also hid the gap. The fix is written in the header (commit 51ae6c4e). No threshold, lag, hold, gate or date changed.
- **The judged run:** run once (Actions run 43215299232); verdicts frozen in `data/agent-c3-lab.json` `firstRun` (commit 7db11787).

**Common method:**
- whole-market 5-year cache, 2021-11-01 to 2026-11-11, dead stocks included;
- entry at the next open;
- liquid = $5+ and $5M+ a day;
- +300% cap on the rule and the yardstick alike;
- proof bar t 4.1.

### C-IC1: insider cluster + 8-K item 1.01. REJECTED

**The rule:**
- 2+ different officers or directors file open-market purchases within 5 sessions;
- and the same company files a plain 8-K with item 1.01 (no earnings item) whose reaction session is within 9 sessions of the cluster;
- buy the open after both are public;
- hold 20 sessions, no stop;
- one signal per stock per 60 sessions.

| | Older half (to 2023) | Newer half (2024–26) |
|---|---|---|
| Trades / days / stocks | 121 / 100 / 107 | 154 / 130 / 139 |
| Average after 0.8% (median) | −1.1% (−0.6%) | −1.8% (−0.8%) |
| After 1.2% stress | −1.5% | −2.1% |
| Edge over the average stock | −0.6% | −2.1% |
| Vs the same stocks on other days | +0.7% | −1.5% |
| Without the 2 best | −2.1% | −2.3% |
| Block t | −0.10 (26 blocks) | −1.93 (33 blocks) |
| Vs S&P 500, same sessions | −1.5% | −2.4% |
| Best / worst trade | +72% / −46% | +41% / −60% |
| Won | 49% | 47% |

- **Overall:** 275 trades, 236 stocks, 230 days; median −0.7%; worst trade and worst day −60%.
- **By year, after cost:**

  | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
  |---|---|---|---|---|---|
  | −7.3% | −2.9% | +3.3% | −0.4% | −2.1% | −2.6% |

- **Level:** none (it fails the TRY SMALL bar too).
- **Data:**
  - Form 4 purchases are from the SEC insider data sets, 2021 Q1 to 2026 Q3 (139,160 purchases), giving 15,559 cluster days.
  - The 8-Ks are 38,709 item 1.01 main documents tied to a stock.
  - Acceptance times were read for all 1,539 matched 8-Ks.

### C-SI1 and C-SI1-DTC: high short interest / days-to-cover (avoid). NOT PROVEN

**The rule:**
- **Data:** official FINRA settlement files (119 of 120 expected, Nov 2021 to Oct 2026, exchange-listed rows only).
- **Entry:** the open 9 sessions after settlement, after FINRA publishes.
- **The test:** each flagged stock is compared with the average liquid stock over 20 sessions. Costs cancel in an avoid test.
- **Gates:** the C-S8 avoid gates; t is the weaker of the day t and the 20-session block t.
- **C-SI1 flag:** short position / SEC share count > 20%.
- **C-SI1-DTC flag:** FINRA days-to-cover in the top 10% of that file.

| | C-SI1 older | C-SI1 newer | DTC older | DTC newer |
|---|---|---|---|---|
| Cases / settlement days / stocks | 1,191 / 51 / 220 | 2,234 / 66 / 369 | 7,609 / 51 / 1,247 | 10,200 / 66 / 1,481 |
| Edge vs the average stock (20 sessions) | **−3.8%** | −1.1% | −0.6% | −0.0% |
| t (day / block; weaker used) | −3.22 / −2.88 | −1.05 / −1.45 | −1.62 / −1.29 | −0.07 / −0.13 |
| Vs S&P 500 | −4.5% | −1.5% | −1.2% | −0.5% |
| Vs the same stock on other days (t) | −0.5% (−0.3) | +2.6% (+2.01) | −1.0% (−0.92) | −0.2% (−0.37) |
| Without the 2 worst | −3.1% | −0.7% | −0.4% | +0.1% |
| Median / worst case (vs average stock) | −4.3% / −84% | −3.0% / −94% | −0.6% / −84% | −0.9% / −92% |
| Share that lagged | 60% | 57% | 52% | 54% |

- **C-SI1 by year (edge):**

  | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
  |---|---|---|---|---|---|
  | −9.2% | −3.6% | −1.8% | −1.2% | +0.1% | −1.2% |

  Worst settlement day −24.5%; best +26.5%.
- **Tier-2 avoid:** C-SI1 passes only in the older half (t −2.88). It fails the newer half (t −1.05), so it does not reach tier 2.
- **Same-stock test:** the flagged stocks were not worse than on their own other days. A high short ratio marks stocks that lag in general; it is not a timing signal.
- **What it means for the owner:** a stock with more than 20% of its shares sold short has tended to trail the market. That is worth knowing, but it is not proven here. **No SELL reason and no scan change.**

**Data drops (C-SI1, all files):**

| Reason | Rows |
|---|---|
| Not in the price cache (funds, preferreds, warrants…) | 684,148 |
| Not liquid | 381,739 |
| Split flag | 225 |
| No share count | 45,705 |
| Ratio over 100% (data error) | 2,347 |

Median short ratio 3.4%; 99th percentile 27.5%.

## 5. Files and commits

**Files (all new, Agent C's own):**
- `agent-c3-core.mjs`
- `agent-c3-lab.mjs`
- `test/agent-c3-core.test.mjs` (8 tests)
- `.github/workflows/agent-c3-lab.yml` (one-shot, `run-agent-c3-now.txt`)
- `data/agent-c3-lab.json`
- `data/agent-c3-diag.json`
- `data/agent-c3-run.log`
- library entries: C-IC1, C-SI1, C-SI1-DTC (results), C-INSLAG1, C-10B5P, C-PNEWS1 (new), C-SQZ1 (data now available)

**Commits:**

| Commit | What |
|---|---|
| 0f134b5a | Pre-registration and web scout entries |
| b21a1d33 | DIAG 1 trigger |
| 51ae6c4e | FINRA parser v2 and DIAG 2 |
| da8e5383 | LAB trigger |
| 7db11787 | LAB result (frozen, by the workflow) |
| (this doc) | |

- **Actions runs:** 43213858329 (DIAG 1), 43215055778 (DIAG 2), 43215299232 (LAB).
- **Tests:** 1,440 of 1,440 pass.

## 6. Next in the Agent C queue

1. **C-SQZ1** (high short interest + fresh positive 8-Ks + volume; the FINRA data now loads), with a low prior: C-SI1 shows heavy shorting is bad, not a squeeze set-up.
2. **C-NSI1** (net share issuance, avoid; the data is in hand).
3. **C-F144X** (Form 144 notices with no sale; the data starts in 2023).
4. **C-13FCON1** (needs a 13F loader).
5. **E3 live picks:** a main-session decision (see section 1).
