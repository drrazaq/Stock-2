# HISTORY-03 provenance register

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. One row per catalogued claim whose evidence is incomplete. A field marked MISSING means no recorded artifact states it; a hard-coded figure is a number written into the code with no stored source.

## Claims with missing provenance

| Claim | Surface | Missing fields | Evidence as recorded |
|---|---|---|---|
| A01 | ACTIONS > RECORDS (Sunday research line) | period, rule, costs, coverage | data/smart-money-study.json (rising.older / rising.newer; verdict NOT PROVEN, why "lost money in the older half"); data/leaders-study.json (liveVerdict) |
| W08 | details command | period | okEv (scan.mjs:1283) |
| A04 | ACTIONS > NOT ACTIONABLE TODAY | period | Engine candidate gate okEv (scan.mjs:1283): per stock, 30+ out-of-sample trades with >= +0.4% after costs, or 15+ with >= +1.5% and half won |
| A05 | ACTIONS > NOT ACTIONABLE TODAY | period | per-stock okEv / safety-margin computation (scan.mjs:1270-1300) |
| W02 | basket command | evidence | data/squad10-lab.json (SQ10-SH10 NOT PROVEN); squad23 lab (not opened in this pass: MISSING) |
| S02 | SCORECARD row | costs | data/outcomes.json: horizons["3"] (n 42, avgReturn, avgBenchmark), finished 25, winRate 0.16, avgR -0.47 |
| W05 | HELP (help command) | evidence | day trades reply: "48 versions tested ..., 0 passed the history test"; hunting-lab window not mapped: MISSING |
| W11 | stops command | population, costs, coverage | data/stops.json: from 2022-04-19 to 2026-07-22, 18 versions, tCrit 2.99, hold 60 |
| W12 | sources command | evidence, costs | tip ledger (data/tips*.jsonl; not mapped in this pass: MISSING) |
| W13 | lessons command | evidence | "the test" not identified in the message or the code comment: MISSING |
| A06 | ACTIONS > NOT ACTIONABLE TODAY | period | signals.json per-stock reg.down (n >= 10 and avgR > 0 required) |
| B04 | days command; market today command | period | per-stock out-of-sample trades of rules that passed okEv (or proven) on each stock, aggregated (signals.json Lr.dow / mday) |
| B10 | OPPORTUNITY RADAR midday footer | evidence, population, coverage | hard-coded; no artifact referenced in the code or data: MISSING |
| B11 | EARLY WATCH: RESEARCH LEADS footer | evidence | early-alerts.mjs header (pre-registration note); measured values not stored as an artifact: MISSING |
| B14 | live watcher "tested AVOID" note | evidence | AVOID list (data lottery file); the study that "tested" it is not referenced: MISSING |
| D03 | ACTIONS > EARNINGS DRIFT lane BUY card (owner's labelled choice) | evidence | data/earnings-study.json frozen first run 2026-10-23: NOT PROVEN (older half: could be luck t -0.45 vs bar 3.95, not better than the average stock or the S&P 500, loses without its 2 best and at 1.2% cost); the Sunday message says "Earnings drift is NOT offered as a buy". "+1.8% a trade over 176 past beats": no artifact referenced: MISSING |
| D07 | plan-card block and check/buy replies: tip-source FADE | - | data/tip-score.json fade list (C-FADE1: t <= -2 on 10+ tips over 5+ days; 19 Oct: Reddit crowd 30 tips on 5 days, edge -3.6%, t -9.2); library C-FADE1 status "AVOID list ... not yet wired into ACTIONS" (stale: it is wired) |
| D13 | second opinion ("should I buy after a jump") | evidence, population, period, costs, coverage | hard-coded; no artifact referenced: MISSING |

## Resolved during the audit

- **B14 ("tested AVOID"):** traced by D09 to `data/autolab.json` tried["lotHi/h20"] (library M15). Discovery stage only: edge −3.2%, t −5.06, n 3,054; no validation stage.
- **W11 / D12 (stop study):** the committed `data/stops.json` recommends PCT35 for any stock and NONE for strong stocks, matching the 35% wording. Only the "5 years" period is wrong (4.3 years).

## Consistency checks against stored rows (`tools/consistency-checks.py`)

These checks recompute headline numbers from rows the repository itself stores. They are not an independent reproduction from raw prices.

| Claim | Result |
|---|---|
| LEADER DIP 73% / 75% (A-TGT-TGT20-PB12) | NOT REPRODUCIBLE FROM STORED ROWS: 212 stored rows vs 355 trades in the frozen summary. agent-a-tgt-lab.mjs:160 keeps only trades whose exit kind is not "max" (126-session time exit) or "gone" (delisted), last 300; every stored row is a target exit (kinds {'target': 177, 'gap over the target': 35}), so all time-exit and delisted trades, i.e. the losers, are absent. The win rate, losses and worst trade can only be reproduced by re-running the test on the price cache. |
| LEADER DIP 3-slot replay (REPLAY-PB12T20) | QUOTE MATCHES the stored newer-window summary (0.1964 vs SPY 0.1856). Not mentioned in the message: older window from first signal 0.1031 vs SPY 0.1663, and SPUS 0.2198 (newer). Stored rows: some rows carry no pnl field (counted as 0), so per-year returns cannot be rebuilt from rows alone. |
| Insider buying "works in rising markets (+0.1% / +6.1%)" | NUMBERS MATCH the stored summary (+0.12% / +6.06%); the older-half S&P 500 same-days figure (+0.31%) is higher than the rule's; no trade rows stored |
| Late-filing SELL reason "about 12-16% over 60 sessions" | NUMBERS MATCH the stored summary (-12.5% / -16.3%); no event rows stored |
| Basket 1 "about 16.7% a year vs SPUS 12.2%" | VALUE 0.167 PRESENT in data/squad10-lab.json (string search); the summary field path was not traced; NOT PROVEN verdict matches the message |

## Artifact-level gap for the owner's lane

**The owner's lane cannot be reproduced from stored rows.** `agent-a-tgt-lab.mjs:160` keeps only trades that did not end in a time exit (`max`) or a delisting (`gone`), and only the last 300.
- **What is stored:** 212 rows for A-TGT-TGT20-PB12, all target exits.
- **What the frozen summary covers:** 355 trades.
- **Consequence:** the LEADER DIP win rate (73% / 75%), its losses and its worst trade (−55.6%) cannot be reproduced from the repository. They need a re-run on the price cache, or a change that stores every trade. The change is a proposal for Codex; frozen results stay untouched.
