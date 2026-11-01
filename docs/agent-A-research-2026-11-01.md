# Agent A (Timing) research, Sun 1 Nov 2026

## Results first

1. **LEADER DIP exits (A-LDX1): keep the lane as it is.** None of the 3 new exit ideas passed the pre-registered adoption test. The live exit stays: a +20% sell limit, a time exit after 126 sessions, and no stop.
2. **Repair: the 5-year price cache had stopped at 19 Oct.** Since 23 Oct no new day was added, so the league referee could not score any picks. Fixed in `leaders-study.mjs`; it takes effect at the next Sunday run (8 Nov).
3. **The ANOM-SUE timing bug is real, and the verdicts did not change.** In the earnings calendar, 41% of untimed reports were read one session late. After the fix, ANOM-SUE and ANOM-SUESURGE are both still NOT PROVEN (corrected runs written). SUESURGE stays paused; only the owner can un-pause it.
4. **Nothing reached tier 2 or PROVEN this week.**

## 1. Repairs (repair engineer)

| Check | Result |
|---|---|
| `node health.mjs` | 45 fine, 1 problem. The live watcher had 1 of 331 minutes on 30 Oct. |
| Workflows → scripts | All 78 workflows: every `node` / `bash` / `python` script they run exists. |
| Syntax and data | `node --check` passes on all `*.mjs`. Every `data/*.json` and `data/*.jsonl` line parses. |
| Tests | 1,243 of 1,243 pass, including 6 new ones. |
| Recent bot and scan runs | The bot's long run (05:37 to 11:43) succeeded. The later scheduled bot runs were cancelled while queued behind it, which is the expected `bot` concurrency behaviour. The last nightly scan (30 Oct) succeeded. |

**FIXED: the study cache stopped growing** (`leaders-study.mjs`, commit 08f86c2).

- **Cause:** the fill loop ran only while the cache held fewer than WANT (1,260) sessions. Once the 5-year window was full (23 Oct), no new session was ever fetched. The log said "sessions: 1260 2021-10-12 to 2026-10-19 | added 0".
- **Effect:** `league.mjs` read `asOf` = 19 Oct, so no batch could reach its entry session ("entry session ... not in the price cache yet"). The weekly LEADERS fair test was also stale. Most labs were not affected, because they add the newer sessions themselves.
- **Fix:** new sessions after the newest held day are now always fetched. The existing trim keeps the window at 1,260 sessions (a rolling 5 years). Frozen verdicts are not recomputed.
- **Check:** tested on a local mock server. It added the 9 missing sessions and trimmed back to the window.

**Watcher health problem (30 Oct): no fix needed.**

- A second, late watcher process (started at 15:00) overwrote `data/ignition-live.json` with a 1-minute snapshot. The full-day process had 327 minutes on record.
- The guards `sessionFinished` and `preferSession` now stop that. They arrived in the owner-approved v5 watcher repair (be31590), deployed 20:01 UTC on 30 Oct, after that session.
- The health line should clear after the 2 Nov session. Note that 2 Nov is the first winter-time session: the New York open is 14:30 UTC.

**NEEDS scan.mjs (main session): TGT is shown wrongly in CONCLUSION.**

- **What is wrong:** TGT's record has `kind: 'manual'` and `src: 'leader dip'`.
  - The CONCLUSION line (scan.mjs ~1651) prints "HOLD | STOP none set | SELL no target set".
  - The details (`posLine`, ~1164) add "your own pick: no tested target or time limit; the stop protects it", which is wrong for a no-stop lane.
  - The HOLDINGS review (~195 / ~2310) is correct: target 178.94 and the time exit.
- **Fix 1, line ~1651:** before the HOLD text, add a leader-dip branch:
  `P.src === 'leader dip' && !P.stop ? 'HOLD | no stop by design | SELL LIMIT ' + money(P.target) + ', time exit about ' + ldipExitDay(P.boughtSession || P.since, P.ldHold || LDIP_HOLD) : <existing text>`
- **Fix 2, `posLine`:** change `(P.kind === 'manual' ? ...` to `(P.kind === 'manual' && P.src !== 'leader dip' ? ...`.
- **Why not fix the data:** the record lives in `data/my-positions.json`, an owner file, so it was not changed.

## 2. Build 1: A-LDX1, exit questions on the live LEADER DIP lane

- **Files:** `agent-a-ldx-core.mjs` (pre-registered header, 1 Nov, before any run), `agent-a-ldx-lab.mjs`, `.github/workflows/agent-a-ldx-lab.yml`, `test/agent-a-ldx-core.test.mjs`. Library entries `LDX-*`.
- **Not re-tested:** TGT20 itself. It is the reference (LIVE).
- **Trades:** the same 357 SQ11-PB12 trades. The data check reproduced A-TGT-TGT20-PB12 exactly (99 / 256 trades, won 72.7% / 74.6%) and the REPLAY-PB12T20 account (3,361 / 4,533 USD).
- **Data-check fix before judging:** the first attempt stopped at the data check, and nothing was judged. It had compared all trades with the replay's counts, but 2 more trades have finished since that replay. The check now compares only the trades inside A-TGT1's frozen window.
- **The ADOPT test, in both halves:**
  - the variant changes 10+ trades;
  - the same-money average change is above 0;
  - the per-year return on capital is not lower;
  - the 3-slot account at 3,000 USD ends higher than LIVE, at both 0.8% and 1.2% cost.

| Question | Trades changed (older / newer) | Avg change per trade | Win rate (LIVE → variant) | 3-slot account end, older / newer (LIVE 3,361 / 4,533) | Verdict |
|---|---|---|---|---|---|
| LDX-HALF63: still under the buy price after 63 sessions → sell | 35 / 93 | −3.1% / −2.1% | 73% → 59% / 75% → 61% | 3,169 / 4,300 | DO NOT ADOPT |
| LDX-T200: first close under the 200-day average → sell | 69 / 147 | −8.4% / −4.9% | 73% → 33% / 75% → 47% | **3,852 / 4,735** | DO NOT ADOPT |
| LDX-TIME189: wait 189 sessions instead of 126 | 41 / 92 | +1.7% / +0.8% | 73% → 79% / 73% → 76% | 3,028 / 4,224 | DO NOT ADOPT |

What each result means in plain words:

- **HALF63: do not sell a laggard at 3 months.** Most laggards recover by month 6.
- **T200: worse per trade, but the account ended higher.** The early sales freed slots for new dips, so the 3-slot account beat LIVE in both halves and at both costs. Its drawdown was smaller in the older half (−13.9% vs −22.5%) but larger in the newer half (−24.9% vs −11.9%).
  - It fails on the trade-level gates, because the median trade is negative and only 33% to 47% of trades win.
  - **Not adopted.** The account gain depends on which dips came next (slot luck), not on a better trade.
  - It is a possible lead for forward paper only, and only if the owner asks.
- **TIME189: waiting longer helps each trade slightly, but less per year, and the account did worse.** The money is tied up longer and misses new dips.

**Owner meaning:** keep the +20% limit and the 126-session time exit. Do not sell a leader dip early because it is under water at 3 months, or because it lost its 200-day average.

## 3. ANOM-SUE timing check (Squad 28 finding)

- **The suspected bug:** in `anomaly-core.mjs`, `reactionIdx` treats a report with no Nasdaq time as after-the-close. A before-the-open report is then judged one session late: the surprise is scaled by a close that already holds the reaction, and the buy is a session late.
- **What was added** (`anomaly-lab.mjs` TIMING AUDIT block, written before it ran):
  - every untimed report is re-timed from the company's own SEC 8-K Item 2.02 acceptance time (the same rule as Squad 28's correctedRun);
  - a self-check requires that rebuilding with no re-timing reproduces the run's own signals exactly;
  - if signals change, `correctedRun` gets the re-timed run with a written reason, and the previous correction is kept inside it;
  - `yardstick.mjs` has the new AUDIT text "SQ28-TIMING".

**Result (anomaly lab run 41307121298): the bug is REAL.**

- **The calendar almost never has a time.** 65,847 of the 67,302 reports in the window have no Nasdaq time (98%). An 8-K Item 2.02 was found for 54,078 of them, using 4,305 SEC requests over 4,071 companies.
- **41% of those reports were one session late.** 22,068 moved one session earlier (the before-the-open reports), 31,557 kept their session, and 453 moved later. Examples: JPM and DAL on 13 Oct 2021, accepted 06:45 and 07:25 New York.
- **The self-check passed:** the rebuild without re-timing reproduced the run's own signals exactly.
- **Signals changed:**
  - ANOM-SUE: 1,354 of 3,792 dropped and 1,341 added.
  - ANOM-SUESURGE: 735 of 2,462 dropped and 721 added.
- **correctedRun was written for both rules,** with a written reason. ANOM-SUE carries AUD-1 + SQ28-TIMING. ANOM-SUESURGE carries AUD-1 + AUD-2 + SQ28-TIMING, with the previous correction kept inside it. In both, the old engine reproduces the frozen numbers.

| Rule | Older half, after 1.2% cost (before → after fix) | Newer half, after 1.2% cost | Block t (older / newer) | Verdict |
|---|---|---|---|---|
| ANOM-SUE | −0.55% → −0.44% (still a loss) | +4.46% → +4.34% | 0.59 / 0.67 | NOT PROVEN, unchanged |
| ANOM-SUESURGE | +1.10% → +1.18%, edge +2.4% | +4.29% → +4.39%, edge +0.6% | 1.18 / 0.29 | NOT PROVEN, unchanged. It still clears the TRY SMALL bar but stays **paused**; only the owner can un-pause it. |

- **What this means:** the timing bug was real and touched about a third of the signals. Fixing it changed the numbers only slightly. Neither rule is proven, and SUE still loses money in the older half.
- **Wider impact (open item for the main session):** the same calendar-time assumption likely affects every lab that uses the Nasdaq calendar times. That includes `reactionIdx` in `anomaly-core.mjs` (also ANOM-EAR / ANOM-EAP), `angles-lab.mjs`, and the E1 / E16 earnings studies. The re-timing data is now cached in `anomaly-cache/subs202.json` and can be reused. **Nothing live depends on these rules today.**

## 4. Web scout (first job)

Ideas found, with sources:

1. **Momentum turning points** (Garg, Goulding, Harvey and Mazzoleni, JFE 2021). Blends 12-month and 1-month market signals. Out-of-sample 1969–2018, the equal blend had a gross Sharpe of 0.51 vs 0.38 for holding, mostly through smaller drawdowns. [CXO summary](https://www.cxoadvisory.com/?p=33354). **Registered as A-TP1**, queued (Agent A). The data is in the system.
2. **Anchoring on the 52-week high slows the reaction to good earnings near the high** (George, Hwang and Li). [Cambridge summary](https://www.jbs.cam.ac.uk/2017/does-anchoring-impede-investors-interpretation-of-earnings-news/). **Registered as A-ANCH1**, queued after the timing audit.
3. **Earnings drift is gone outside microcaps** (Subrahmanyam 2025, UCLA). t = 1.43 without microcaps, 2001–2024. [Anderson Review](https://anderson-review.ucla.edu/is-post-earnings-announcement-drift-a-thing-again/). Evidence only, not a rule: it lowers the prior for ANOM-SUE and A-ANCH1.
4. **Buy-the-dip at index level** (Estrada 2026, 1871–2025): no better risk-adjusted return than holding. [IESE PDF](https://blog.iese.edu/jestrada/files/2026/06/BTD-USA.pdf). This agrees with SQ18-BASK-DIP3 ("worse timing"). Not registered.

No tip sources were moved to FOLLOW or FADE (that is Agent C's lane; none were scored here).

## 5. Lane status and queue

- **Agent A rules:** 62 in the library. None is at tier 2 or PROVEN.
- **Champion:** T1 (6-month leaders), unchanged. The 16 Oct batch could not be scored because of the stale cache; the 1-month score is due around 20 Nov.
- **Queue not built this week:** E19, A-VIX1, A-CP1, A-TRIM1/2, A-DEAD1, A-LEDGER, A-FC1, A-E1N1, A-ANG1, A-RMOM1, plus the new A-TP1 and A-ANCH1. Both builds this week went to the owner's live lane and to the requested timing check.

## Commits

- 08f86c2: cache repair, timing audit, A-LDX1 (pre-registered), library entries.
- 9ef77c6: A-LDX1 data-check fix.
- Lab results were committed by the workflows ("agent A leader dip exits 2026-11-01", anomaly lab).
