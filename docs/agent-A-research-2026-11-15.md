# Agent A (Timing) research, week of Sun 15 Nov 2026

This is a catch-up run for the missed Sunday slot. It ran on Tue 17 Nov 2026, from about 14:35 UTC.

## Results first

1. **A-SLM1 (a 10% stop on each monthly momentum winner) is REJECTED. The stop made the book worse.**
   - Over the full window the momentum book itself did not beat the average stock or SPY.
   - Adding the stop lowered the average trade in both halves and deepened the worst fall:
     - older half: −22.3% with the stop vs −19.6% without;
     - newer half: −29.1% vs −26.6%.
   - **Owner meaning:** do not put a 10% stop on momentum stocks. This agrees with the LEADER DIP design ("no stop", as tested).
2. **A-VSTOP1 is closed without a build.** Its own pre-registered condition was "build only if A-TP1 shows core timing can help". A-TP1 was rejected on 10 Nov.
3. **Repairs (2 fixes, 3 findings):**
   - **Fixed:** autolab now tests one batch of new rules per price week. On 15 Nov it tested 2 batches, 120 rules for week 2026-11-13.
   - **Fixed:** Agent C's champion E3 now gets live insider clusters. Its `recent` list also reads the EDGAR live Form 4 buys, so it is no longer empty between the SEC quarterly files. E3's rule is unchanged.
   - **Findings:** see section 1.
4. **Nothing reached tier 2 or PROVEN.** League: Agent A 0, Agent B 0, Agent C 0 points. The luck bar is t 4.12 after 2,591 tries. No champion batch has been scored yet; the first scores are due about 20 Nov.

## 1. Repairs (repair engineer)

### (a) The two "Leaders fair test" runs on 15 Nov

| Run | Start (UTC) | Length | What happened |
|---|---|---|---|
| 43710825852 (manual `workflow_dispatch`) | 11:50 | 1h31m | Full study. 5 fresh sessions were added to the cache (to 13 Nov). The league froze the A and B batches at 13:21:07. autolab tested 60 rules. Committed as e6243125. |
| 43718220006 (GitHub `schedule`) | 13:17 | 19m31s | The cron is set for 06:00 UTC, so GitHub started it **7h17m late**. It waited for the first run to finish (shared concurrency group), then ran every step on warm caches. |

**What the second run did:**
- It added nothing to the cache (`added 0`).
- The league did **not** freeze a second batch: its once-a-week check worked, and `added` held only C's "champion picked nothing".
- **autolab tested a second batch of 60 rules** for the same week.
- catalyst-lab's monitoring block was overwritten with `DATA INCOMPLETE`: the EDGAR full-text search failed with DNS `EBUSY` on that runner. Its firstRun (frozen 23 Oct) is untouched.

**Why it was only 19 minutes:** the slow steps had already been fed by the first run:
- sequence study: 47 minutes in the first run vs 5 minutes in the second; the `seq-cache` had expired, so the first run fetched it again;
- catalyst lab: 47 minutes vs 45 seconds;
- discovery: 27 minutes vs 41 seconds.

Both runs were complete studies.

**Fix:** `autolab-week-guard.mjs`, used by `autolab.mjs`.
- A new batch runs only if the last batch was for a different last session, or was made 5 or more days ago. `AUTO_FORCE=1` still forces one.
- Paper scoring of earlier picks runs either way.
- Test: `test/autolab-week-guard.test.mjs` (5 tests).
- The extra 60 rules from 15 Nov stay counted. They only raise the luck bar (4.11 → 4.12), and no verdict changed.

**Correction to my 8 Nov report:** the 8 Nov autolab batch was **not** skipped. 60 rules were saved for week 2026-11-06; only the library-status step crashed.
- The 25 Oct and 1 Nov batches also ran (60 rules each). Both were labelled week 2026-10-19 because the price cache was stale until the 1 Nov fix.
- So **no weekly batch was missed**.

**Gap reported, not changed:**
- `sequence-study.mjs` has no `firstRun` freeze. Its verdict follows whatever share of company histories it fetched in each run's 40-minute budget: 282 trades in the first run vs 505 in the second.
- Both runs said NOT PROVEN, so nothing was shown wrongly.
- Freezing it now means choosing a run after seeing results. That is the owner's or the main session's call, so I did not do it.

### (b) Agent C's champion E3 was empty between the SEC quarterly files

- **Cause:** `insider-study.mjs` built `recent` only from the SEC quarterly insider data sets. The Q3 set ends 30 Sep, so the 6 Nov and 13 Nov batches were "champion picked nothing".
- **Feasible with free official data: yes.** `data/buyers-live.json` is already filled every weekday by `squad31-buyers.mjs` (added by the main session on 17 Nov). It reads the SEC EDGAR daily index (`form.YYYYMMDD.idx`) and each Form 4's XML (code P, open market).
- **Fix:** `insider-recent.mjs`.
  - Purchases filed after the newest quarterly filing date are added from that file.
  - The **same cluster rule** applies: 2+ distinct insiders within 10 days, a 30-day gap per stock, top 15. E3 still needs 3+ insiders (`league.mjs` `min.n`).
  - `insider-study.mjs` uses this for `recent` only. Its trades and frozen verdicts still come from the quarterly sets only.
  - `data/agents.json` was not edited.
  - Tests: `test/insider-recent.test.mjs` (5 tests).
- **Check on the real live file:** it holds one day so far (16 Nov, 424 buy lines). It gives 12 clusters, 6 of them with 3+ insiders.
- **Limit:**
  - The live file starts on 16 Nov, so 1 Oct – 13 Nov is not covered until the Q4 data set arrives in January.
  - Next Sunday's batch will see only the live days since 16 Nov.
  - A one-time backfill of `data/buyers-live.json` from 1 Oct would close the gap. That file belongs to squad31 / the main session (see the request in the final message).
- **Identity note:** live insiders are counted by name, quarterly insiders by CIK. The two can mix only in the first 10 days after a quarter ends.

### Other checks

| Check | Result |
|---|---|
| `data/health.json` (17 Nov 03:11 UTC) | 45 fine, 1 problem: the watcher on 16 Nov started at 13:02 New York (114 of 331 minutes). Cause: GitHub's `*/30` bot cron left a gap from 13:28 to 18:02 UTC, so the watcher guard did not run. **The main session already fixed this on 17 Nov** with a bot-to-bot handover in `bot.yml`. On 17 Nov the watcher started at 09:11. |
| Workflows → scripts | 85 workflows. One manual-only workflow, `bounded-retained-cache-breakout-ra2.yml`, calls `docs/ra2-duplicate-diagnostic-20261112/*.py`, which are not on `main` (they are on a side branch). It runs only with an owner-approved start time, so nothing scheduled is broken. Not changed. |
| Syntax and data | `node --check` passes on every `*.mjs`. All 377 `data/*.json` / `*.jsonl` files parse. |
| Tests | 1,489 of 1,489 pass, including 17 new ones. |
| Failed runs on `main` since 3 Nov | Only the manual diagnostic of 12 Nov. |
| Nightly scan | `data/scan-report.txt` is for the 16 Nov close (written 17 Nov 04:09 UTC). |

## 2. Results in my lane (live and paper, with distinct days)

| Item | Record | Verdict |
|---|---|---|
| **LEADER DIP (owner's real lane)** | The forward board has 11 signals, all open, none closed (`data/squad11-board.json`). The ledger has 1 offer row (NEM, 13 Nov). | **Too early** |
| **Champion T1 (6-month leaders), paper** | 8 finished trades on 7 exit days, none new since 3 Nov. 1 won; average −13.2% after cost; worst −38.3%. 5 are still open. | **Losing, too early** (under 20) |
| **Same-day watcher rules** (to 13 Nov, 1.2% stress, close exit) | IG1: 392 trades / 21 days, −1.9%. IG9: 386 / 21, −2.6%. IG8: 973 / 7, −1.5%. IG5: 164 / 12, −3.0%. IG2: 117 / 20, −5.0%. IG3: 98 / 18, −4.6%. IG6: 78 / 18, −4.6%. IG4: 32 / 16, +0.4% (median −2.3%). | **Losing**, except IG4, which is too early |

**Champion T1's scored batches:**
- Frozen: 16 Oct (MRNA, ABCL, TXG, IOVA; entry 20 Oct), 6 Nov and 13 Nov (both MRNA, CBRL, KOD, HNGE).
- None is scored yet; the 16 Oct batch reaches 1 month about 20 Nov.
- **Note:** T1's champion key is the open paper list, so weekly batches repeat while the positions are held. The scores will be correlated, not independent.

## 3. Web scout

| # | Source | What it says | Registered |
|---|---|---|---|
| 1 | Dikhit (Jan 2026), "The Informational Role of the Most Recent Month in Industry-Level Momentum Strategies", summary: https://alphaarchitect.com/skip-month-mystery/ | Industries, 1975–2024: 12-1 momentum earned 2.03% a month after a strong prior month vs 1.28% after a weak one; 12-0 was steadier. No t-statistics and no costs in the summary. | **A-SKIP1**, queued (low: industry momentum was rejected here 4 times) |
| 2 | Estrada (IESE, May 2026), "Buy the dip", https://blog.iese.edu/jestrada/files/2026/06/BTD-USA.pdf | S&P 500, 1871–2025: moving bonds into stocks after down months gave 9.2% vs 9.4% a year, Sharpe 0.113 vs 0.115. No gain at any dip size. | **A-BTD1**, evidence only. Owner meaning: keep the monthly core as plain monthly buying. |
| 3 | Wang, Rachev & Fabozzi (Nov 2026), "The Logic of Factor Portfolios", https://arxiv.org/abs/2611.09834 | Screen rules ("momentum AND low volatility") split into single-signal and interaction exposures; an intersection and a union have opposite interaction exposures. | **A-BOOL1**, queued low (low-volatility rules were rejected here) |

- **Also read:**
  - the Butler, Zawadzki & Butler papers on futures seasonality and time-series momentum (arXiv 2611.15657 / 2611.15646): futures, and they need shorts, so they were not registered;
  - a "13-Sharpe" factor claim (arXiv 2511.12490): ignored as an implausible claim.
- No dated public trader calls were found in the timing lane. No FOLLOW / FADE changes.

## 4. Builds (1 run; A-VSTOP1 closed by its own condition)

### A-SLM1: stop-loss momentum (Han, Zhou & Zhu, SSRN 2407199). REJECTED; the stop does not help

**Files:**
- `agent-a-slm-core.mjs`: rule and judging in the header, written 17 Nov before any run;
- `agent-a-slm-lab.mjs`;
- `.github/workflows/agent-a-slm-lab.yml`;
- `test/agent-a-slm-core.test.mjs` (7 tests).

**Rule:**
- At each month end, take the top 10% by 12-1 momentum of the 1,000 most-traded liquid stocks.
- Buy at the next open; re-form at the next month-end open.
- A close 10% under the entry sells at the next open; the money waits in cash until month end.
- Yardstick: the same book with no stop.
- Costs 0.8% / 1.2% per trade; +300% cap on both.

**Data:**
- the study cache, 2021-11-08 to 2026-11-17, dead stocks included;
- 6 splits repaired.

**How the run went:**
- DIAG run 44106685432 checked the data only: 47 formations (2022-11-30 to 2026-09-30), 1,000 stocks in the universe, 100 picks a month, 4,695 trades, 5 dropped for split artifacts.
- The judged run (run once) was 44106931865, frozen at 2026-11-17T14:47:36Z.

| Half | Trades / stocks / entry days | Stop exits (days) | Stop book avg (1.2%) | Median | Worst trade | Worst month | Max fall | vs avg stock (block t) | vs same stock | Per year vs SPY | No-stop book avg (1.2%), max fall, per year |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Older (to Dec 2023) | 1,399 / 395 / 14 | 440 (160) | −0.0% (−0.4%) | −1.6% | −40.9% | −8.6% | −22.3% | −0.5% (−0.56) | −1.9% | −2.6% vs +15.7% | +0.1% (−0.3%), −19.6%, −1.0% |
| Newer (from 2024) | 3,296 / 618 / 33 | 1,264 (386) | +1.2% (+0.8%) | −2.7% | −65.4% | −12.8% | −29.1% | +0.2% (0.20) | −3.0% | +11.0% vs +17.7% | +1.6% (+1.2%), −26.6%, +15.2% |

- **Gates:** the older half fails all of G1–G6. The newer half fails same-stock, SPY per year and block t.
- **Level:** none. It is not even at the TRY SMALL bar.
- **The stop's effect:**
  - it cut the newer half's worst month (−12.8% vs −22.5%);
  - but it lowered the average trade in both halves at both costs;
  - it deepened the max fall in both halves;
  - it gave up about 4 points a year in the newer half.
  - Gaps through the stop still produced −65% trades.

**Verdict:** frozen in `data/agent-a-slm-lab.json` `firstRun`. Library status: "tested: rejected; stop does not help".

## 5. Queue (Agent A)

- **Still queued:** A-ANCH1, E19, A-VIX1, A-CP1, A-TRIM1/2, A-DEAD1, A-LEDGER, A-FC1, A-E1N1, A-ANG1, A-SKIP1 (low), A-BOOL1 (low), and C-SOCMKT1 (filed under Agent A).
- **Closed this run:** A-SLM1 (rejected) and A-VSTOP1 (not built: its condition failed).

## Commits

- eda018fd: autolab week guard and E3 live `recent` feed (repairs + tests).
- b52031fb: A-SLM1 pre-registration (core, lab, workflow, tests), DIAG trigger, and library entries (A-SLM1 judging, A-VSTOP1 closed, A-SKIP1, A-BOOL1, A-BTD1).
- 59bfa6ac: the DIAG run's log (workflow).
- 101aee2c: the judged-run trigger.
- 5ea18b79: the judged result (workflow).
- This report.

The claude.ai project doc "Stock-2 - Agent A research (15 Nov 2026)" was **not** written: this session had no Projects tool. The project doc "Daily research (17 Nov 2026)" could not be read for the same reason.
