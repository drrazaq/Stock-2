# Agent A (Timing) research, week of Sun 8 Nov 2026

The 8 Nov run was cut short by a container restart. It restarted on Tue 10 Nov, about 01:10 UTC.

## Results first

1. **Both builds failed. Nothing reached tier 2 or PROVEN.**
   - **A-TP1 (timing SPY with the 12-month + 1-month trend): REJECTED.** It went to cash twice in early 2023, missed the rebound and earned 6.3% a year against 15.3% for simply holding (older half). In the newer half it never left the market.
   - **A-RMOM1 (the MTUM momentum book sized to a 12% volatility target): NOT ADOPTED.** In the newer half it cut the worst fall (−16.6% vs −21.7%) but also the return (31.7% vs 39.4% a year), with the same Sharpe. In the older half it was worse.
   - **Owner meaning:** keep the monthly core (SPUS + IAUM) as plain monthly buying. A trend switch on SPY would have cost money in this window.
2. **Repairs:**
   - the 8 Nov study crash is fixed, and its test is in;
   - the 5-year price cache now grows again (1 Nov fix confirmed: it runs to 9 Nov);
   - tip scoring is back on current prices (Agent C's item: solved by the same cache fix, nothing else needed).
3. **League:** Agent A has 0 points. The champion is still T1, and its first scored month is due around 20 Nov.

## 1. Repairs (repair engineer)

| Check | Result |
|---|---|
| Commit b58a5ca (8 Nov autolab crash) | Includes `test/autolab-library-guard.test.mjs`. Nothing was missing. `data/health.json` is written only by the calendar job, so no change was due there. |
| `node health.mjs` (local, no Telegram) | 45 fine, 1 problem: the watcher on 9 Nov. See the watcher row below. |
| Workflows → scripts | 80 workflows. Every `node` / `bash` / `python` script they run exists. |
| Syntax and data | `node --check` passes on every `*.mjs`. Every `data/*.json` and `data/*.jsonl` line parses. |
| Tests | 1,388 of 1,388 pass, including 6 new ones. |
| Failed runs on `main` since 3 Nov | None. The red "Tests" runs on 9 Nov are on a `codex/...` branch, and its latest run passes. |
| Nightly scan | The last full scan was the 6 Nov close (ran 7 Nov 01:00 UTC). GitHub starts the 21:30 UTC job 3–4 hours late. The 22:57 UTC run on 9 Nov was a late intraday slot ("Market closed. Nothing to do"), not the nightly scan. The 9 Nov nightly scan had not started at 01:30 UTC; the last three started between 01:00 and 01:41 UTC. |

**Confirmed fixed: the 8 Nov study crash (`r.b is not iterable`)**

- **What went wrong:** in the 8 Nov "Leaders fair test" run, `autolab.mjs` stopped on Agent C's 5 Nov text-rule library entries. Its step is `continue-on-error`, so the rest of the study ran normally.
- **Fix:** b58a5ca, made during the killed run. The status loop now checks `Array.isArray(e.rule.b)`, and a regression test was added.
- **Cost:** autolab's weekly batch of new rules was skipped this week. It resumes on Sun 15 Nov.
- **Why not re-run now:** re-running the whole 2-hour study mid-week would also freeze an extra league batch, so I did not.

**Confirmed fixed: the study cache and tip-score prices (Agent C, 5 Nov)**

- **Cause:** the cache bug fixed on 1 Nov (08f86c2). `tip-score.mjs` reads `study-cache/grouped.json.gz`, which had stopped at 19 Oct.
- **Check:** the 8 Nov run logged `sessions: 1260 2021-11-01 to 2026-11-06 | added 14`.
- **Effect on tip-score:** `data/tip-score.json` `asOf` is now 2026-11-06. Of the 398 tips logged after 19 Oct, 382 have a so-far result and 256 have a 5-session result.
- tip-score's rules were not changed.
- **Note:** tips are re-scored once a week (Sunday study and `agent-c2-lab`), so a tip's score can be up to 5 sessions behind.

**Watcher, 9 Nov: no code fault**

- 317 of 331 minutes were watched. The longest gap was 2 minutes, inside the limits.
- The flag comes from **one Telegram alert at 14:30:51 UTC (the opening minute)** whose delivery could not be confirmed (state UNCERTAIN). By design it is not re-sent, so it cannot arrive twice.
- **Owner meaning:** one opening-minute alert on 9 Nov may not have reached you. The flag clears on the next clean session.

**Last week's scan.mjs request (TGT shown wrongly) is done.** scan.mjs now shows "HOLD | no stop by design | SELL LIMIT ..." for leader-dip holdings, at lines 1653 and 196.

## 2. Results in my lane (live and paper, with distinct days)

| Item | Record | Verdict |
|---|---|---|
| **LEADER DIP (owner's real lane, SQ11-PB12)** | 9 signals on 7 days since 26 Oct: TGT, VLO, ABNB, ILMN, NTRA, VG, MPC (halal fail), PSX, TRGP. All except MPC were "unknown" halal, so they showed as MARK HALAL FIRST and `data/leaderdip-ledger.jsonl` has no offer rows yet. TGT was bought by hand. | **Too early.** No finished lane trade. |
| **Champion T1 (6-month leaders) paper** | 8 finished on 7 exit days (8 Oct – 3 Nov). 1 won (13%), average −13.1% after cost, worst −38.3% (MXL), best +0.6%. | **Losing, but too early** (under 20 trades). Kept: the rule is not tuned on its own live record. |
| Same-day watcher rules (to 6 Nov, 1.2% stress, close exit) | IG1: 288 trades, 16 days, −1.0%. IG9: 273 trades, 16 days, −2.6%. IG8: 973 trades, 7 days, −1.5%. IG2: 69 trades, 15 days, −3.9%. IG3: 63 trades, 13 days, −4.3%. IG6: 49 trades, 13 days, −4.8%. IG5: 61 trades, 10 days, −6.6%. IG4: 21 trades, 12 days, +2.6% (median −2.3%). | **Losing**, except IG4, which is too early. |
| Event ORB retest (by-hand research ledger, last run 21 Oct) | 75 trades, 39 days, 60 stocks, −0.6% average, day t −2.07 | **Losing** |
| A-LDX1 exits (1 Nov) | Frozen: do not adopt. Monitoring unchanged. | Closed |

**Champion's scored batches:**

- Batches frozen: 16 Oct (4 stocks, entry 20 Oct) and 6 Nov (MRNA, CBRL, KOD, HNGE).
- **None is scored yet.** The 16 Oct batch reaches 1 month around 20 Nov. The cache now holds the entry session, so scoring will work.
- League (8 Nov): Agent A 0, Agent B 0, Agent C 0 points. The luck bar is t 4.1 after 2,436 rules.

## 3. Web scout (first job)

| # | Idea and source | Registered as | Status |
|---|---|---|---|
| 1 | **Stop-loss momentum:** a 10% stop on each momentum stock cut momentum crashes (Han, Zhou & Zhu, [SSRN 2407199](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2407199); [CEPR DP19030](https://cepr.org/publications/dp19030)). | **A-SLM1** | Queued (Agent A). Low prior: SQ3-CUTRUN and A-LDX1 exits did not help. |
| 2 | **Volatility-scaled stop on a core fund:** stops at 0.2–0.3× annual volatility cut the drawdown from about 20% to 15% at a similar Sharpe ([QuantSeeker, Oct 2025](https://www.quantseeker.com/p/do-stop-loss-rules-add-value-in-tactical); [Kaminski & Lo](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=968338)). | **A-VSTOP1** | Queued, but now low priority: A-TP1 (core timing) failed this week. |
| 3 | **SPY intraday momentum** (Zarattini, Aziz & Barbon 2025). An independent re-test out of sample gave 9.4% total vs 29.5% for holding, Sharpe 0.39 vs 1.33 in-sample ([Paz, SSRN 7290621, Aug 2026](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7290621)). | **A-SPYIM1** | Not built: failed out of sample. This agrees with the system's same-day findings. |
| 4 | **Nonlinear time-series momentum** (Uhl 2025, [SSRN 5933974](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5933974)). | **A-NLTS1** | Not for this system: the gain comes from short positions in downturns (long-only, halal). |

Also read: Wiedemann (2025), "learning to weight past returns" ([SSRN 5702162](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5702162)). It is a machine-learning weighting; ML-RANK1 already failed here, so it was not registered.

No tip sources were moved to FOLLOW or FADE. That is Agent C's lane.

## 4. Builds (2, from the queue)

**Files:**

- `agent-a-tp-core.mjs`: the rules and judging, written in the header 10 Nov **before any run**;
- `agent-a-tp-lab.mjs`;
- `.github/workflows/agent-a-tp-lab.yml` (one-shot, `run-agent-a-tp-now.txt`);
- `test/agent-a-tp-core.test.mjs` (6 tests).

**Data:**

- the study cache, 2021-11-01 to 2026-11-09 (1,261 sessions, 8,593 stocks, dead stocks included);
- FRED DTB3 for the T-bill;
- 8 splits repaired.

**Data check:** a data-check-only run came first. The rebuilt SQ6-MTUM gave **839 trades, equal to the frozen 839**.

**How the run went:**

- Run 42735422305 was the judged run, run once.
- The push before it (run 42735289042) still had "DIAG" in the trigger file's last line, so it was a second data check only. Nothing was judged or frozen in either data-check run.

### A-TP1: momentum turning points on SPY (Garg, Goulding, Harvey & Mazzoleni 2021). REJECTED

**The rule:**

- At each month-end close: slow = sign(SPY 252-session return − T-bill), fast = sign(21-session return − T-bill).
- Stay in SPY unless both are negative; otherwise hold T-bills.
- Trade at the next open. Each switch pays half a round trip.

**The window:** 47 months on 47 distinct month-ends (Nov 2022 – Sep 2026). There were 5 switches, and the rule was out of the market for 2 months (Jan and Mar 2023).

| Half | Cost per round trip | Rule, per year (worst fall) | Holding, per year (worst fall) | Sharpe, rule / holding | Monthly difference t |
|---|---|---|---|---|---|
| Older (14 months) | 0.2% (as in the 1 Nov entry) | +7.7% (−8.2%) | +15.6% (−8.1%) | 0.24 / 0.71 | −1.46 |
| Older | 0.8% | +6.3% (−9.0%) | +15.3% (−8.1%) | 0.15 / 0.69 | −1.57 |
| Older | 1.2% stress | +5.4% (−9.7%) | +15.1% (−8.1%) | 0.09 / 0.68 | −1.64 |
| Newer (33 months) | any | +17.7% (−7.5%) | +17.7% (−7.5%) | 1.13 / 1.13 | n/a (always in) |

- Worst month: −6.5% for both the rule and holding.
- **Level: none.** It does not beat holding on either return or drawdown. The older half has only 14 months (under 20), and the luck bar is far off.
- The longer SPY history (information only) was not available: the Massive plan returns 5 years.

### A-RMOM1: risk-managed momentum (Barroso & Santa-Clara 2015) on the SQ6-MTUM book. NOT ADOPTED

**The rule:**

- At each May/November formation, put w = min(1, 0.12 / σ) in the book and the rest in cash at 0%.
- σ = the annual volatility of the previous book over its last 126 sessions.

**The books:** 7 finished books on 7 formation days, 839 stock positions (119–120 a book). The weights were 1.00, 0.80, 0.92, 0.77, 0.66, 0.41 and 0.95.

| Half (1.2% stress) | Books | Scaled: per year / Sharpe / worst fall | Unscaled: per year / Sharpe / worst fall | SPY, same days | Worst book (scaled / unscaled) |
|---|---|---|---|---|---|
| Older | 3 | +10.8% / 0.82 / −12.5% | +12.9% / 0.89 / −12.5% | +20.2% (−10.3%) | −8.3% / −8.3% |
| Newer | 4 | +31.0% / 1.39 / −16.6% | +38.3% / 1.39 / −21.7% | +21.0% (−19.0%) | +1.0% / +0.8% |

- At 0.8%: older Sharpe 0.88 vs 0.95, worst fall the same; newer Sharpe 1.41 vs 1.42, worst fall −16.6% vs −21.7%.
- The average liquid stock earned +4.4% a book (older) and +7.9% (newer).
- **Verdict:** the scaled book does not have a higher Sharpe in either half. It only cut the newer half's drawdown, and it gave up return to do so.
- **Level:** sizing overlay only. The base, SQ6-MTUM, stays NOT PROVEN and paper.
- **Note:** this test is at book level, so a per-trade median, worst trade and worst day are not separate numbers here. The drawdowns and worst books above stand in for them.

## 5. Queue (Agent A)

**Still queued:**

- A-ANCH1, A-SLM1, A-VSTOP1 (low), E19, A-VIX1, A-CP1, A-TRIM1/2, A-DEAD1, A-LEDGER, A-FC1, A-E1N1, A-ANG1;
- C-SOCMKT1, which is filed under Agent A.

**Closed this week:** A-TP1 (rejected) and A-RMOM1 (not adopted).

## Commits

- b58a5ca: autolab text-rule guard and test, from the killed 8 Nov run.
- 3056ab5: A-TP1 / A-RMOM1 pre-registration (core, lab, workflow, tests), plus the library entries A-SLM1, A-VSTOP1, A-SPYIM1 and A-NLTS1.
- aa4bec3 and 12a3a28: the run triggers.
- 2377b0f / 3df4ad7 (data checks) and 2d9430b (judged result), committed by the workflow.
- This report.
