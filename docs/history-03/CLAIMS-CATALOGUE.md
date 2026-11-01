# HISTORY-03 user-facing claim catalogue

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. Wording is from offline renders of the production code on the committed repository data (1 Nov 2026), or from the source template where values vary. Owner-specific values are replaced by `<placeholders>`.

Status vocabulary and the field definitions are in `claims-catalogue.json`. No claim was recomputed from raw market data; "NOT RECOMPUTED" means traced to the named artifact only. A field reading **MISSING** means the evidence for it is not recorded anywhere this pass could find.

## ACTIONS (nightly; also today / records / what to buy today)

### A01: ACTIONS > RECORDS (Sunday research line) | **MISLEADING** | rank 2 (HIGH)

> RESEARCH (Sunday): none of 17 new ideas passed; LEADERS provisionally promising; insider buying works in rising markets (+0.1% / +6.1% a trade). Send  lab  for details.

| Field | Value |
|---|---|
| Source | scan.mjs:2632-2634 (actionsText, S.routine) |
| Evidence artifact | data/smart-money-study.json (rising.older / rising.newer; verdict NOT PROVEN, why "lost money in the older half"); data/leaders-study.json (liveVerdict) |
| Population | Insider clusters (2+ buyers 10k USD+, 50k+ total, or 250k+) found by smart-money.mjs; "rising" = S&P 500 rising regime; older n=166, newer n=265 |
| Selection period | Study halves of smart-money.mjs (dates not stored in the summary file: MISSING) |
| Rule version | smart-money.mjs Sunday study (version not recorded: MISSING) |
| Costs | "after costs" per smart-money.mjs header; exact cost value not stored in the artifact: MISSING |
| Holding basis | 20 sessions, buy next open |
| Coverage | Finnhub insider data; universe coverage and dead-stock inclusion not stated: MISSING |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** The printed condition only checks n>=30 and average>0 in both halves. In the older half the rising-market average was +0.12% a trade against +0.31% for the S&P 500 on the same days (it trailed), and the study verdict is NOT PROVEN. "works" is not supported.

**Proposed wording:** Insider buying (rising markets): NOT PROVEN. Older years +0.1% a trade (S&P 500 +0.3% same days), newer years +6.1%. Not a buy signal.

### A02: ACTIONS > RECORDS (Sunday research line) and leaders command | **MISLEADING** | rank 12 (MEDIUM)

> LEADERS provisionally promising  \|  FAIR TEST (whole market, collapsed stocks included, 2021-10-12 to 2026-10-19): this version PROVISIONALLY PROMISING. It passed in the newer half at the 0.8% cost. Live paper trades must still confirm it.

| Field | Value |
|---|---|
| Source | scan.mjs:2634; scan.mjs:244/689/1357-1359; leaders-study.mjs:237 (verdictOf) |
| Evidence artifact | data/leaders-study.json: chosen '126-2' verdict NOT PROVEN (profit factor 1.11 < 1.2); live '126-3' liveVerdict PROVISIONALLY PROMISING |
| Population | 4,277 stocks, whole market incl. dead stocks (fundsFiltered true) |
| Selection period | 2021-10-12 to 2026-10-19, split 2024-10-15 (handbook split is 2024-01-01) |
| Rule version | leaders-study.mjs; live version 126-3 differs from the chosen version 126-2 |
| Costs | 0.8% a trade |
| Holding basis | 126 sessions (version 126-3) |
| Coverage | 1,260 sessions; universe point-in-time per study header |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "Provisionally promising" is not a tier in the handbook (section 4.5). It is awarded for passing the newer half only, the study verdict is NOT PROVEN, the live version is not the chosen one, and the split date differs from the handbook. The live paper record shown in the same reply is 5 finished trades averaging -15.9%.

**Proposed wording:** LEADERS: NOT PROVEN (fails the older half; passed only the newer half). Live paper so far: 5 trades, average -15.9%.

### A03: ACTIONS > TODAY'S ACTIONS (LEADER DIP lane line) | **SUPPORTED_QUALIFIED (incomplete)** | rank 16 (MEDIUM)

> LEADER DIP \| horizon: up to 126 sessions (about 6 months) \| APPROVED BY YOU as your real lane (27 Oct); tested 73% / 75% of trades won, about equal to SPY as a 3-slot account: NOT PROVEN by the full bar \| permitted today: yes

| Field | Value |
|---|---|
| Source | scan.mjs:2588 (and header 2450-2457) |
| Evidence artifact | data/agent-a-tgt-lab.json firstRun['A-TGT-TGT20-PB12'] (win 72.7% n 99 older / 74.6% n 256 newer, NOT PROVEN, adoption adopt:false); data/account-replay-pb12t20.json REPLAY-PB12T20 |
| Population | SQ11-PB12 signals: top-20% 12-1 momentum leaders among the 300 largest, point in time |
| Selection period | 2021-10-12 to 2026-10-23 (trade test); replay 2021-10-12 to 2026-04-24, split 2024-01-01 |
| Rule version | SQ11-PB12 entry + A-TGT-TGT20 exit (+20% limit, else close of session 126), no stop |
| Costs | 0.8% (stress 1.2% in replay) |
| Holding basis | until +20% limit fill or close of session 126 |
| Coverage | whole market incl. dead stocks per squad11/agent-a headers; halal marks: replay uses all stocks (hindsight variant separate) |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Numbers trace. Missing context: the +20% target was NOT adopted by its own pre-registered test (it lowered returns vs. selling at session 126); from its first signal in the older half the 3-slot account made 10.3% a year vs SPY 16.6%; it trailed SPUS in both halves (newer 19.6% vs SPUS 22.0%); worst trade -55.6%. The handbook says a high win rate is not the goal.

**Proposed wording:** LEADER DIP (your lane, NOT PROVEN): about 3 in 4 trades hit +20%, but the test without the +20% limit made more; as a 3 x 1,000 USD account it roughly matched SPY and trailed SPUS. Worst single trade -56%.

### A04: ACTIONS > NOT ACTIONABLE TODAY | **MISLEADING (definition)** | rank 8 (MEDIUM-HIGH)

> ENGINE BUYS PAUSED by focus mode (no engine kind proven on live paper yet; logged on paper): <SYMBOLS>.  focus off  shows them as buys.

| Field | Value |
|---|---|
| Source | scan.mjs:2606 |
| Evidence artifact | Engine candidate gate okEv (scan.mjs:1283): per stock, 30+ out-of-sample trades with >= +0.4% after costs, or 15+ with >= +1.5% and half won |
| Population | Each candidate stock's own history for its rule |
| Selection period | the stock's own history (walk-forward on that stock); window not printed: MISSING |
| Rule version | engine swing/quick rules (signals.json) |
| Costs | 0.8%-equivalent: 6 USD fees + spread per 1,000 USD (scan.mjs:1281) |
| Holding basis | rule-specific (quick max 3-7 sessions, swing per plan) |
| Coverage | nightly 2,512-stock scan (details reply) |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | CHANGED on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9: "FOCUS OFF: presentation expanded; unproven engine candidates remain paper only" (no longer shown as buys) |

**Assessment:** "focus off shows them as buys": with focus off, a stock that clears the per-stock okEv bar is shown as a BUY. That bar is far below the handbook PROVEN tier (all gates in both halves, block t >= 2.5, luck bar about 4.1). The message does not say so.

**Proposed wording:** ENGINE (swing/quick): paused. These picks pass only a per-stock history check, not the system's full test. focus off would show them as buys anyway.

### A05: ACTIONS > NOT ACTIONABLE TODAY | **MISLEADING (definition)** | rank 9 (MEDIUM)

> QUICK TRADES held back (not strong enough; logged on paper): <SYMBOLS>. Why: strict gate: needs 30+ unseen trades and a positive safety margin (has 20).

| Field | Value |
|---|---|
| Source | scan.mjs:3868 |
| Evidence artifact | per-stock okEv / safety-margin computation (scan.mjs:1270-1300) |
| Population | the stock's own history |
| Selection period | not printed: MISSING |
| Rule version | quick-trade rules |
| Costs | as A04 |
| Holding basis | quick trade plan |
| Coverage | per stock |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "unseen trades" means out-of-sample trades on the same stock's own past, not unseen future days. Readers can take it as forward evidence.

**Proposed wording:** needs 30+ test trades on this stock's own past that were not used to pick the rule (has 20).

### A06: ACTIONS > NOT ACTIONABLE TODAY | **SUPPORTED_QUALIFIED (window missing)** | rank 31 (LOW)

> NOT IN THIS MARKET (no winning record in falling markets): <SYMBOLS>.

| Field | Value |
|---|---|
| Source | scan.mjs:2622 (gate at 1398-1402) |
| Evidence artifact | signals.json per-stock reg.down (n >= 10 and avgR > 0 required) |
| Population | the stock's own unseen trades in falling markets |
| Selection period | not printed: MISSING |
| Rule version | falling-market gate |
| Costs | R units (after stop distance) |
| Holding basis | rule plan |
| Coverage | per stock |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Accurate as a block reason; the record size and period are not shown.

**Proposed wording:** NOT IN THIS MARKET: fewer than 10 past trades of this rule on this stock in falling markets, or they lost.

### A07: ACTIONS > SHORT-TERM OPPORTUNITIES | **SUPPORTED_QUALIFIED**

> EARLY WAVE (intraday, paper): 973 paper trades, 40% won, -0.7% a trade after costs (-1.5% at 1.5x costs) on 7 days; negative: its alerts stay paused.

| Field | Value |
|---|---|
| Source | scan.mjs:2612 |
| Evidence artifact | data/ignition-results.json / ignition-days.jsonl (IG8 forward paper) |
| Population | IG8 alerts in the live watcher |
| Selection period | forward paper since IG8 start (7 days) |
| Rule version | IG8 quiet build-up |
| Costs | model costs, plus 1.5x stress |
| Holding basis | entry at alert price, exit at close |
| Coverage | live watcher coverage (see day trades COVERAGE line) |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Clear and correctly negative.

### A08: ACTIONS > TRY SMALL line | **SUPPORTED** | rank 28 (LOW)

> TRY SMALL: PAPER ONLY (not a buy; your decision 27 Oct after the account replay: 2 slots of 1,000 USD did not reliably beat holding SPY. Put that money in Basket 2. ...)

| Field | Value |
|---|---|
| Source | scan.mjs (TRY SMALL paper section) |
| Evidence artifact | account-replay (TRY SMALL) results; owner decision 27 Oct (CLAUDE.md section 2) |
| Population | 9 TRY SMALL rules |
| Selection period | replay windows per account-replay-core.mjs |
| Rule version | TRY SMALL bar |
| Costs | 0.8% |
| Holding basis | per rule |
| Coverage | whole market |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Matches the owner decision. "Put that money in Basket 2" uses the old name: the owner now buys SPUS/IAUM monthly (see W01).

**Proposed wording:** ...Put that money in your monthly SPUS + IAUM buy.

### A09: ACTIONS > RECORDS (your real trades) | **SUPPORTED_QUALIFIED (cost basis)** | rank 25 (LOW)

> YOUR REAL TRADES (what you reported): size level <N>: up to <USD> a trade. Your record: <n> sales on <d> days, <+x.x>% in total per 1,000 USD traded after costs (<+y.y>% before the 0.8% a trade cost). ...

| Field | Value |
|---|---|
| Source | scan.mjs:1497 |
| Evidence artifact | owner-reported sales (private trade log) |
| Population | owner's reported sales |
| Selection period | all reported sales |
| Rule version | size ladder |
| Costs | a MODELLED 0.8% per trade, not the actual ZAD fees/fills |
| Holding basis | actual |
| Coverage | only trades the owner reported |
| Reproduction | NOT REPRODUCED (private data, not read) |
| Development branch | CHANGED on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9: "% summed normalized net return per hypothetical 1,000 USD full trade, not account return or dollar P&L" (cost basis still the modelled 0.8%) |

**Assessment:** "after costs" means after a modelled 0.8%, not the actual broker fees and fills.

**Proposed wording:** ... after an assumed 0.8% cost per trade (not your actual ZAD fees).

### A10: ACTIONS > RECORDS / SCOREBOARD (forward paper) | **SUPPORTED_QUALIFIED** | rank 32 (LOW)

> POSITIVE SO FAR: Swing buys; Fast alerts rule IG1; Fast alerts rule IG2 (one market period only).; below the full live bar, so engine buys stay paused

| Field | Value |
|---|---|
| Source | scan.mjs:2636 (from scorecardText verdicts) |
| Evidence artifact | see S02-S04 |
| Population | forward paper signals |
| Selection period | since each record started |
| Rule version | per engine |
| Costs | after costs |
| Holding basis | per row |
| Coverage | per row |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Qualified, but inherits the Swing population mix (S02) and labels IG2 (+0.0%, -0.9% at 1.5x costs) as positive.

**Proposed wording:** Not losing so far (one market period, not proof): IG1. Swing buys and IG2 are flat or mixed.

### A11: ACTIONS > RECORDS (practice account) | **SUPPORTED_QUALIFIED**

> PRACTICE ACCOUNT (Alpaca, fake money, unproven engines: NOT buys for you): <value> (<pct> since 2026-10-12). Closed 9: 1 won, 8 lost, average -10.1%. ...

| Field | Value |
|---|---|
| Source | scan.mjs:2517 |
| Evidence artifact | data/alpaca-paper.json |
| Population | Alpaca paper fills |
| Selection period | since 2026-10-12 |
| Rule version | engines on paper |
| Costs | actual paper fills |
| Holding basis | actual |
| Coverage | paper account |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Clear.

### A12: ACTIONS > RECORDS (weekly research count) | **SUPPORTED_QUALIFIED** | rank 30 (LOW)

> Tested this week: 51 rules: 38 rejected, 7 not proven / needs data, 6 other.

| Field | Value |
|---|---|
| Source | scan.mjs:622 |
| Evidence artifact | data/strategy-library.json (per-rule verdicts) |
| Population | rules entered this week |
| Selection period | this week |
| Rule version | library |
| Costs | per lab |
| Holding basis | per lab |
| Coverage | library entries only |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "6 other" is unexplained.

**Proposed wording:** ... 6 with another status (see lab).

### A13: ACTIONS > RECORDS (comeback board) | **SUPPORTED_QUALIFIED**

> COMEBACK (forward paper records, top 5 by average after 0.8%): DEC2-NISON (decoded): 5 trades on 3 days, average +7.3%, TOO EARLY ...

| Field | Value |
|---|---|
| Source | scan.mjs:633 |
| Evidence artifact | data/comeback-board.json (cost 0.008) |
| Population | rejected rules followed forward |
| Selection period | forward since rejection |
| Rule version | per rule |
| Costs | 0.8% |
| Holding basis | per rule |
| Coverage | rules on the board |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Top-5-by-average is a selection; "TOO EARLY" qualifies it.

## SCORECARD, SCOREBOARD and SHADOW

### S01: SCORECARD (scorecard command and Sunday) | **SUPPORTED_QUALIFIED**

> SCORECARD (future days only, after costs; back-tests are NOT counted here) ... Rules: a "POSITIVE" record from one market period is not proof. ...

| Field | Value |
|---|---|
| Source | scan.mjs:549-602 |
| Evidence artifact | data/engine-history.jsonl, outcomes.json, ignition-results.json, radar-record.json, tier2-ledger.jsonl, alpaca-paper.json, switch-paper.json |
| Population | forward paper per engine |
| Selection period | since each record started |
| Rule version | per engine |
| Costs | after costs (engine-specific; 1.5x stress shown for IG rules) |
| Holding basis | per engine |
| Coverage | per row |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | RELABELLED on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9: "SCORECARD (LEGACY_FORWARD_V1 ...; descriptive, not admitted prospective evaluation)"; row S02 wording still present |

**Assessment:** Framing is honest; specific rows below.

### S02: SCORECARD row | **MISLEADING** | rank 14 (MEDIUM)

> Swing buys (ACTIONS), 3 days after the signal: 42 finished, 16% won, average +0.3% vs S&P -0.3% (finished trades: 25, average -0.47R) => POSITIVE so far (one market period only; not proof yet)

| Field | Value |
|---|---|
| Source | scan.mjs:554 (row from outcomes.json) |
| Evidence artifact | data/outcomes.json: horizons["3"] (n 42, avgReturn, avgBenchmark), finished 25, winRate 0.16, avgR -0.47 |
| Population | mixed: count and average are 3-day marks of 42 signals; win rate is from 25 finished trades |
| Selection period | since outcomes tracking began |
| Rule version | engine swing buys |
| Costs | 3-day mark: cost treatment not stated: MISSING; R units for finished trades |
| Holding basis | 3-day mark vs actual exits |
| Coverage | swing signals listed in ACTIONS |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "42 finished" is wrong: 42 is the number of 3-day marks; only 25 trades finished and they average -0.47R with 16% won. The POSITIVE label comes from the 3-day mark-to-market, not finished trades.

**Proposed wording:** Swing buys: 25 finished trades, 16% won, average -0.47R (losing). 3 days after the signal, 42 signals averaged +0.3% vs S&P -0.3%.

### S03: SCORECARD row | **MISLEADING (threshold)** | rank 22 (LOW)

> Fast alerts rule IG2 (paper, at the alert price, sold at the close): 39 finished, 33% won, average +0.0% (-0.9% at 1.5x costs, 10 day(s), 37 stocks) => POSITIVE so far (one market period only; not proof yet)

| Field | Value |
|---|---|
| Source | scan.mjs:550-551 (verdict) |
| Evidence artifact | data/ignition-results.json |
| Population | IG2 live paper alerts |
| Selection period | 10 days |
| Rule version | IG2/close |
| Costs | model costs, 1.5x stress |
| Holding basis | alert price to close |
| Coverage | live watcher coverage |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** An average that rounds to +0.0% and is negative at 1.5x costs is labelled POSITIVE.

**Proposed wording:** IG2: flat (+0.0%; -0.9% at 1.5x costs): no edge shown.

### S04: SCORECARD rows (LOSING / too early) | **SUPPORTED_QUALIFIED**

> Quick trades (ACTIONS): 89 finished, 51% won, average -1.6% vs S&P -0.3% => LOSING: do not act on these  (and the IG3/5/6/8/9, early-wave and Alpaca rows)

| Field | Value |
|---|---|
| Source | scan.mjs:549-602 |
| Evidence artifact | engine-history.jsonl, ignition-results.json, radar-record.json, alpaca-paper.json |
| Population | per row |
| Selection period | per row |
| Rule version | per row |
| Costs | per row |
| Holding basis | per row |
| Coverage | per row |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Negative results stated plainly.

### S05: SCORECARD rows (your real trades) | **SUPPORTED_QUALIFIED**

> YOUR REAL trades on system picks: <n> finished, <w>% won, average <x>% => too early (<n>) \| on your own picks: ...

| Field | Value |
|---|---|
| Source | scan.mjs:549-602 |
| Evidence artifact | private trade log |
| Population | owner's reported trades |
| Selection period | all |
| Rule version | - |
| Costs | modelled 0.8% |
| Holding basis | actual |
| Coverage | reported trades |
| Reproduction | NOT REPRODUCED (private data) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Cost basis as A09.

### S06: SCOREBOARD weekly / ACTIONS | **SUPPORTED_QUALIFIED**

> Last 90 days: you: <n> sales, <w> won, average <x>% after costs; S&P 500 <y>% over the same period.

| Field | Value |
|---|---|
| Source | scan.mjs (scoreboardText 603+) |
| Evidence artifact | private trade log; data/spy-closes.json |
| Population | owner's sales |
| Selection period | last 90 days |
| Rule version | - |
| Costs | modelled 0.8% |
| Holding basis | actual |
| Coverage | reported trades |
| Reproduction | NOT REPRODUCED (private data) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (template at scan.mjs:613 on main; dynamic text, checked by template) |

**Assessment:** Cost basis as A09.

### S07: shadow command | **SUPPORTED_QUALIFIED** | rank 10 (MEDIUM)

> Tested-rule buys (swing and quick): 114 finished, 43% won, average -1.9% \| quick trades vs S&P 500 same days: -1.6% vs -0.3%  ...  This is the honest forward test: about 60 finished trades per kind are needed before it means much.

| Field | Value |
|---|---|
| Source | scan.mjs (shadowText) |
| Evidence artifact | data/engine-history.jsonl |
| Population | engine signals |
| Selection period | forward |
| Rule version | engine |
| Costs | after costs |
| Holding basis | per rule |
| Coverage | engine signals |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "Tested-rule buys" means the per-stock okEv check (A04), not the full test. The "60 per kind" bar differs from the handbook forward bar (30+ on 10+ days).

**Proposed wording:** Engine picks (swing and quick): 114 finished, ...

## Owner-facing replies (ways, basket, longterm, help, leaders, autolab, details, day trades, stops, sources, lessons, league, quality)

### W01: ways command | **STALE (contradicts owner decisions of 27 Oct)** | rank 1 (HIGH)

> a) THE BASKET (core): every month 65% of ~1,000 USD in ZAD Basket 2 = SPUS 54% / gold fund IAUM 46%, and 35% kept as cash; Basket 1 = the halal top 10 (whole-number %) is bought with that cash 3 times a year ...  b) TRY SMALL: 1,000 USD buys from rules that made money in both test halves but did not pass the luck test; max 2 open, own stop and time exit. They appear in  actions

| Field | Value |
|---|---|
| Source | scan.mjs:3102-3105 (waysText) |
| Evidence artifact | CLAUDE.md section 2 (owner decisions 27 Oct): whole monthly amount in SPUS 54% + IAUM 46%; Basket 1 OFF; TRY SMALL PAPER only; the basket command already says so |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | checked against the rendered basket and ACTIONS replies |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Tells the owner to keep 35% as cash for Basket 1 and that TRY SMALL makes 1,000 USD buys. Both were switched off on 27 Oct. The LEADER DIP lane (his only trading lane) is missing.

**Proposed wording:** a) MONTHLY CORE: your whole monthly amount in SPUS 54% + IAUM 46% (2 orders).  b) LEADER DIP: your trading lane, up to 3 x 1,000 USD, NOT PROVEN.  c) TRY SMALL: paper only (since 27 Oct).  d) OPTIONS: paper only.

### W02: basket command | **MISLEADING (evidence does not match the plan followed)** | rank 11 (MEDIUM)

> Tested 2022-01 to 23 Oct 2026 (Squad 10, the top 10 alone): about 16.7% a year vs SPUS 12.2%; it beat SPUS in both halves (2022-23: 0.8% vs 0.5% a year; 2024-26: 29.5% vs 21.2%); worst fall -42% vs -28%. NOT PROVEN ...  With 30% gold (Squad 23 test, run on the top-20 basket: 70% basket + 30% gold): ~17.5% a year vs 16.2% ...  The buying schedule (Basket 2 monthly, Basket 1 three times a year) was not tested itself

| Field | Value |
|---|---|
| Source | scan.mjs:2961-2964 (BASKET_RECORD) |
| Evidence artifact | data/squad10-lab.json (SQ10-SH10 NOT PROVEN); squad23 lab (not opened in this pass: MISSING) |
| Population | halal top 10 cap-weighted (squad10) |
| Selection period | 2022-01-03 to 2026-10-23, split 2024-01-01 |
| Rule version | SQ10-SH10 quarterly |
| Costs | 0.8% (squad10 cost) |
| Holding basis | 63 sessions (quarterly) |
| Coverage | squad10 universe per its header |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** The reply now (correctly) says the plan is SPUS 54% + IAUM 46% and Basket 1 is OFF, but every number shown is for Basket 1 or a 70/30 top-20+gold mix. The 54/46 SPUS/IAUM plan itself has no test shown. The schedule line still describes the old plan.

**Proposed wording:** Your plan (SPUS 54% + IAUM 46%) was not tested as such. For reference only: Basket 1 (now OFF) ... ; a 70/30 top-20 + gold mix ... . Both NOT PROVEN.

### W03: longterm command (and ACTIONS longer-term pointer) | **UNSUPPORTED** | rank 3 (HIGH)

> YARDSTICK: on 5 years, the S&P 500 beat every long-term stock-picking method tested. Long-term money: a halal index fund (check ZAD).

| Field | Value |
|---|---|
| Source | scan.mjs:2527-2528 (longTermLines) |
| Evidence artifact | Computed only from data/horizons.json (12 results) and data/quality.json (21 results): printed whenever none has verdict PROMISING |
| Population | horizons + quality labs only |
| Selection period | horizons 2022-10-12 to 2026-10-19 (4 years, not 5); quality 2021-11-10 to 2026-10-19 |
| Rule version | - |
| Costs | per lab |
| Holding basis | per lab |
| Coverage | 2 of the system's labs |
| Reproduction | logic read; verdict sets confirmed (NOT PROVEN / REJECTED only) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "Not PROMISING" is turned into "the S&P 500 beat every method". Several methods did beat the S&P 500 on raw return without passing the luck test (e.g. Basket 1 16.7% a year vs SPUS 12.2%; LEADER DIP replay 11.6% vs SPY 10.2% a year). Only two labs are consulted and one covers 4 years.

**Proposed wording:** YARDSTICK: no long-term stock-picking method has passed the full test yet (5 years, both halves, luck bar). Some beat the S&P 500 on past returns, but that could be luck. Long-term money: a halal index fund (check ZAD).

### W04: HELP (help command) | **UNSUPPORTED (no rule is proven)** | rank 4 (HIGH)

> paper   (the Alpaca PAPER account: real fills on every proven buy, fake money)  \|  budget open   (no budget limit: every proven buy is listed, you decide; size still follows the evidence)

| Field | Value |
|---|---|
| Source | scan.mjs:1074 (HELP) |
| Evidence artifact | CLAUDE.md section 4.5: no rule is proven; ACTIONS practice line says the account tests "unproven engines" |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | checked against rendered ACTIONS |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Describes buys as "proven" while nothing is proven; contradicts the practice-account line.

**Proposed wording:** paper   (the Alpaca practice account: fake money, tests engines that are NOT proven)  |  budget open   (no budget limit on the buys ACTIONS lists; you decide)

### W05: HELP (help command) | **MISLEADING** | rank 17 (MEDIUM)

> day trades   (fast movers: which day-trade and overnight rules passed five years of tests, and today’s list)  \|  check LPG   (analyses ANY ticker now: tested rules, ...)  \|  lab   (this week’s hunting lab: new ways to catch moves, tested on two years of the whole market)  \|  events (... which kinds of news were followed by gains or by losses, tested)  \|  market today (... from the tests and your stocks)

| Field | Value |
|---|---|
| Source | scan.mjs:1074 (HELP) |
| Evidence artifact | day trades reply: "48 versions tested ..., 0 passed the history test"; hunting-lab window not mapped: MISSING |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | checked against rendered day trades reply |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "which rules passed five years of tests": none passed. "tested" is used as if it meant validated.

**Proposed wording:** day trades   (fast movers: how each day-trade rule did over five years; none has passed yet)

### W06: leaders command | **MISLEADING** | rank 13 (MEDIUM)

> Rule in use: strength over 6 months, stop 3 normal daily moves under the close. I re-test 9 versions every night; 7 pass tonight.  Past test, 80 large stocks together since 2016, five held at a time: 467 trades, 37% won. ... all trades +1.54% each after costs (S&P 500 over the same days +1.05%). ... Whole account about 13% a year against 13% ...  Caution: the test list is today’s well-known companies, which flatters the past.

| Field | Value |
|---|---|
| Source | scan.mjs:3524, 3600-3601 (leadEvidence), 3927 |
| Evidence artifact | data/leaders.json (nightly re-test on a fixed list of today's 80 large stocks) |
| Population | 80 of today's large companies (survivorship-biased; caveat printed) |
| Selection period | since 2016 |
| Rule version | LEADERS trend version in use |
| Costs | 0.8% (0.4% before 18 Oct 2026) |
| Holding basis | typical 16 sessions |
| Coverage | fixed 80-stock list |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "7 pass tonight" is on the survivorship-biased list; the fair whole-market test of the same family is NOT PROVEN (A02) and live paper is 5 trades at -15.9%. The caution line is present but comes after the pass count.

**Proposed wording:** Rule in use: ... On today's 80 large stocks (a list that flatters the past) 7 of 9 versions look profitable; on the fair whole-market test the rule is NOT PROVEN.

### W07: autolab command (and autolab Sunday summary) | **UNSUPPORTED** | rank 6 (HIGH)

> Only PROVEN LIVE rules (30+ paper trades, profitable, better than an average stock) appear in your ACTIONS. Check ZAD. Research only.

| Field | Value |
|---|---|
| Source | scan.mjs:515; autolab.mjs:189 |
| Evidence artifact | ACTIONS shows the owner's lanes (LEADER DIP, LONGER HOLDS, EARNINGS DRIFT) as actions while NOT PROVEN; POLICY TODAY line |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | checked against rendered ACTIONS |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** False as a general statement; also a third definition of "proven".

**Proposed wording:** An autolab rule reaches ACTIONS only after 30+ profitable paper trades that beat an average stock. Your own lanes (LEADER DIP and others) are shown separately and are NOT PROVEN.

### W08: details command | **MISLEADING (definition)** | rank 7 (MEDIUM-HIGH)

> Nothing today. No setup has proof: 30+ unseen trades averaging +0.4% or more after costs, or 15+ with +1.5% or more a trade. Waiting is a result.  \|  COVERAGE: 2512 stocks tested last night; 3 had a setup, 0 fully proven (30+ unseen trades, profit after costs).

| Field | Value |
|---|---|
| Source | scan.mjs:1576; details COVERAGE line |
| Evidence artifact | okEv (scan.mjs:1283) |
| Population | per-stock history |
| Selection period | not printed: MISSING |
| Rule version | engine rules |
| Costs | 6 USD fees + spread |
| Holding basis | per rule |
| Coverage | 2,512 stocks |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Calls the per-stock okEv bar "proof" / "fully proven". Under the handbook nothing is proven; this bar is much lower (no both-halves gates, no block t, no luck bar).

**Proposed wording:** No setup cleared even the basic per-stock check tonight (30+ past test trades averaging +0.4% after costs). Note: passing it is not proof.

### W09: day trades command | **MISLEADING (contradiction)** | rank 15 (MEDIUM)

> Only rules that PASSED send a morning list or a live alert. Use 1,000 USD at most per day trade. Research, not advice.

| Field | Value |
|---|---|
| Source | scan.mjs:71 |
| Evidence artifact | same reply: "0 passed the history test"; EARLY WATCH PAPER SETUP / RESEARCH LEAD alerts (early-alerts.mjs) and EARLY WAVE ALERT [PAPER, NOT PROVEN] (ignition-watch.mjs:169) are sent without a passed rule |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | source read |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Live alerts are sent (labelled paper / not approved) although no rule passed.

**Proposed wording:** No rule has passed, so there is no morning buy list. Live alerts you get are PAPER or RESEARCH only. If you trade one anyway: 1,000 USD at most.

### W10: day trades command (rule rows) | **SUPPORTED_QUALIFIED**

> FAST MOVERS AND DAY TRADES (five years, whole market incl. 1-3 USD stocks, 2021-10-18 to 2026-10-23; ...) - Gap-up 10%+ at the open: REJECTED. 10255 trades, 27% won, average -2.3% ...

| Field | Value |
|---|---|
| Source | scan.mjs (day trades text from fastmover-lab.json) |
| Evidence artifact | data/fastmover-lab.json (from 2021-10-18 to 2026-10-23) |
| Population | whole market incl. 1-3 USD |
| Selection period | 2021-10-18 to 2026-10-23 (newer half shown) |
| Rule version | per row |
| Costs | "costs by price" |
| Holding basis | intraday / next open |
| Coverage | whole market daily data; ignition rows: 35,913 of 73,864 run days with minute data (2024-10-25 to 2026-10-23) |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** REJECTED results stated plainly. "best moment" (average daily high) is labelled as what a chart shows.

### W11: stops command | **MISLEADING (period)** | rank 23 (LOW)

> YOUR STOPS vs THE TESTED STOP (from the 5-year stop study; the tested stop is measured from YOUR buy price)

| Field | Value |
|---|---|
| Source | scan.mjs:163 |
| Evidence artifact | data/stops.json: from 2022-04-19 to 2026-07-22, 18 versions, tCrit 2.99, hold 60 |
| Population | stop study universe (not mapped: MISSING) |
| Selection period | 2022-04-19 to 2026-07-22 (about 4.3 years) |
| Rule version | stop study |
| Costs | not mapped: MISSING |
| Holding basis | 60 sessions |
| Coverage | not mapped: MISSING |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Not 5 years. Whether the "tested stop" passed its study is not stated.

**Proposed wording:** YOUR STOPS vs THE STUDIED STOP (stop study, Apr 2022 to Jul 2026, about 4 years; <its verdict>)

### W12: sources command | **MISLEADING (label)** | rank 24 (LOW)

> Analysts turning positive: 167 tips, average -3.9% against -1.6% for the S&P 500 (with the tested stop added: -3.9%). 68 of 167 beat the market. Record: INSUFFICIENT EVIDENCE (under 10 tips or under a month).

| Field | Value |
|---|---|
| Source | scan.mjs:1899 |
| Evidence artifact | tip ledger (data/tips*.jsonl; not mapped in this pass: MISSING) |
| Population | logged tips per source |
| Selection period | since logging began (under 20 days) |
| Rule version | tip scoring |
| Costs | not stated: MISSING |
| Holding basis | to now |
| Coverage | tips logged by the bot |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** The reason shown for 167 tips is "under 10 tips or under a month"; only the month condition applies. "the tested stop" is not identified.

**Proposed wording:** Record: TOO SHORT (logged for under a month).  (with the stop from the stop study added: ...)

### W13: lessons command | **EVIDENCE_NOT_MAPPED** | rank 27 (LOW)

> reached target 1: 20% (the test expected about half)

| Field | Value |
|---|---|
| Source | scan.mjs:1247 |
| Evidence artifact | "the test" not identified in the message or the code comment: MISSING |
| Population | live paper trades per rule |
| Selection period | forward |
| Rule version | per rule |
| Costs | after costs |
| Holding basis | per rule |
| Coverage | per rule |
| Reproduction | - |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** No artifact backs "about half".

**Proposed wording:** reached target 1: 20% of trades

### W14: league command | **SUPPORTED_QUALIFIED**

> AGENT LEAGUE (since 2026-10-20; luck bar for everyone t 4.1 after 2326 rules tried in total) ... Proven 0, working live 0. ... Only results count: a strategy that passes every test, picks that beat the S&P 500 on days nobody had seen, and live paper records.

| Field | Value |
|---|---|
| Source | league.mjs:110-111; scan.mjs league reply |
| Evidence artifact | data/agent-league.json |
| Population | agents A/B/C |
| Selection period | since 2026-10-20 |
| Rule version | league |
| Costs | - |
| Holding basis | 1 and 3 months |
| Coverage | - |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Clear. Note the autolab reply uses a different luck bar (t 3.96 for its own 1,320 rules) without saying why.

### W15: quality command | **SUPPORTED_QUALIFIED** | rank 29 (LOW)

> QUALITY COMPANIES: long investing by the SEC reports (2021-11-10 to 2026-10-19, 59 monthly ...) - Piotroski F-score 8-9 (improving finances), 6 months: NOT PROVEN (+7.6% vs average stock +5.7%, S&P 500 +8.6%) ...

| Field | Value |
|---|---|
| Source | quality.mjs / scan.mjs qualityText |
| Evidence artifact | data/quality.json (from 2021-11-10 to 2026-10-19, 59 months) |
| Population | SEC-report universe |
| Selection period | 2021-11-10 to 2026-10-19 |
| Rule version | per row |
| Costs | per quality.mjs |
| Holding basis | 6 / 12 months |
| Coverage | per quality.mjs header |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Verdicts stated. The "TOP QUALITY NOW" list shows names with "gross profit 0% of assets" (data gap) under a quality heading.

**Proposed wording:** Mark rows with missing gross-profit data as DATA MISSING instead of 0%.

### W16: LONGER HOLDS line in ACTIONS | **SUPPORTED_QUALIFIED** | rank 21 (LOW-MEDIUM)

> LONGER HOLDS: no buy today; <n> picks need your ZAD mark first (YOUR LABELLED CHOICE (20 Oct), tier 2 TRADABLE SMALL).

| Field | Value |
|---|---|
| Source | scan.mjs:2570-2581 |
| Evidence artifact | discovery2 / value lab V15 tier record |
| Population | F-score 8-9 in an uptrend |
| Selection period | newer half only (tier 2) |
| Rule version | V15 |
| Costs | 0.8% / 1.2% |
| Holding basis | per V15 |
| Coverage | per lab |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "TRADABLE SMALL" is a newer-half-only tier; the line does not say NOT PROVEN as the LEADER DIP line does.

**Proposed wording:** LONGER HOLDS (your labelled choice, NOT PROVEN; passed only the newer years) ...

## Other production senders (session alerts, news, radar, octopus, movers)

### X01: intraday radar alerts (intraday-radar.mjs, every 15 min in session) | **MISLEADING (latent definition)** | rank 5 (HIGH (latent))

> BUY: this kind of setup is PROVEN on paper  \|  <group>: ... PROVEN: its alerts say BUY  \|  A card says BUY only when its kind of setup has earned it on paper (30+ trades, profit after costs, still positive lately).

| Field | Value |
|---|---|
| Source | intraday-radar.mjs:133-152 (graduation), 219, 247, 263, 302 |
| Evidence artifact | data/radar-record.json (need 30; no group currently proven) |
| Population | radar groups |
| Selection period | forward paper |
| Rule version | graduation rule |
| Costs | after costs |
| Holding basis | per card |
| Coverage | about 280 strong stocks live |
| Reproduction | NOT RECOMPUTED (traced to the artifact; values not re-derived from raw prices) |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Not triggered today (no group qualifies), but a forward-paper graduation would print "PROVEN" and "BUY". Under the handbook that is the forward-paper bar, not PROVEN, and CLAUDE.md section 9 allows plain BUYs only for the owner's lanes. Flag for the owner / Codex: wording AND gate.

**Proposed wording:** PAPER RECORD PASSED (30+ trades, profit after costs): still NOT PROVEN by the full test. (No BUY wording without the owner's decision.)

### X02: news watch (news-watch.mjs) | **MISLEADING** | rank 18 (MEDIUM-LOW)

> Tested buys in ACTIONS stay valid at their prices.  \|  DECISION: HOLD. Do not chase stocks that already jumped; buy only tested buys inside their price range.  \|  that day: the system’s tested buys made ...

| Field | Value |
|---|---|
| Source | news-watch.mjs:75-78 |
| Evidence artifact | - |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | source read |
| Development branch | PARTLY on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9: one of the two "Tested buys in ACTIONS" strings remains |

**Assessment:** "tested buys" reads as validated buys; ACTIONS buys are the owner's NOT PROVEN lanes.

**Proposed wording:** Buys listed in ACTIONS stay valid at their prices (they are your lanes, NOT PROVEN).

### X03: opportunity radar close message (radar-v3-core.mjs) | **MISLEADING** | rank 19 (MEDIUM-LOW)

> . Tested buys for the next session come in ACTIONS tonight.

| Field | Value |
|---|---|
| Source | radar-v3-core.mjs:169 |
| Evidence artifact | - |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | source read |
| Development branch | WORDING ABSENT on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 |

**Assessment:** Same as X02.

**Proposed wording:** . Tonight's ACTIONS lists any buys from your lanes (NOT PROVEN).

### X04: octopus board (octopus.mjs) | **MISLEADING (latent)** | rank 26 (LOW (latent))

> Both gates passed: these may be considered as buys (your stop, your halal check, your decision).

| Field | Value |
|---|---|
| Source | octopus.mjs:163 |
| Evidence artifact | octopus gates: 5-year test + 30+ positive live paper picks over 10+ days |
| Population | octopus picks |
| Selection period | - |
| Rule version | octopus |
| Costs | stress |
| Holding basis | weekly |
| Coverage | - |
| Reproduction | source read |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Latent: if both octopus gates pass, picks are called buys without the full PROVEN tier (luck bar) being stated.

**Proposed wording:** Both octopus checks passed (still NOT PROVEN by the full test): research candidates.

### X05: movers (movers.mjs) | **SUPPORTED_QUALIFIED**

> This subset was profitable in this period. That is one sample of ...

| Field | Value |
|---|---|
| Source | movers.mjs:238 |
| Evidence artifact | movers journal |
| Population | movers subset |
| Selection period | this period |
| Rule version | movers study |
| Costs | per movers.mjs |
| Holding basis | per study |
| Coverage | - |
| Reproduction | source read |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Qualified as one sample.

### X06: EARLY WAVE ALERT (ignition-watch.mjs) | **SUPPORTED_QUALIFIED**

> EARLY WAVE ALERT [PAPER, NOT PROVEN] \| only ...  \|  (paper only: the rule has not passed its history test)

| Field | Value |
|---|---|
| Source | ignition-watch.mjs:155, 169 |
| Evidence artifact | fastmover-lab.json IG verdicts |
| Population | - |
| Selection period | - |
| Rule version | IG rules |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | source read |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** Clear.

### X07: IGNITION ALERT (ignition-watch.mjs) | **MISLEADING** | rank 20 (MEDIUM-LOW)

> IGNITION ALERT \| FAST DAY TRADE, separate from the tested swing buys in ACTIONS

| Field | Value |
|---|---|
| Source | ignition-watch.mjs:169 |
| Evidence artifact | - |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |
| Reproduction | source read |
| Development branch | PERSISTS on Stock2-safety-fixes@ffb806eb0a332a1c409704916594eb8c4d775be9 (same wording found by phrase search) |

**Assessment:** "tested swing buys" implies validated swing buys; swing buys are paused and NOT PROVEN.

**Proposed wording:** IGNITION ALERT | FAST DAY TRADE (paper), separate from ACTIONS

