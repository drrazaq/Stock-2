# HISTORY-03 batch 2: Sunday lab summaries, opportunity radar, early alerts

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. How each wording was obtained is in its **Rendered** row:
- **SYNTHETIC:** the actual lab script, run offline on a synthetic 5-year cache. Numbers are synthetic; the wording is real.
- **COMMITTED:** the actual caller, run offline on the committed data.
- **FIXTURE:** the actual builder, called with the repository's own test fixtures.

No provider call and no real message: every fetch went to a local fake server or was refused. Raw renders are not published.

**Defect types:** GATE_OR_DECISION (a decision, count or gate is affected), WORDING_ONLY, PROVENANCE_ONLY (the source is not shown or not recorded), NONE. NOT PROVEN / REJECTED results are preserved as recorded.

**Production note:** `leaders-study.mjs` and the other Sunday labs treat a missing `settings.quiet` as quiet. The committed settings do not set it, so most Sunday lab messages are not sent unless something passes. The owner sees these results through the bot's `lab`, `winners`, `exits`, `events`, `stops`, `rebuy`, `quality`, `day trades` and `autolab` replies and the ACTIONS research line, which were rendered on committed data.

## B01: OPPORTUNITY RADAR midday panel C and summary line; radar close panel C | GATE_OR_DECISION | **MISLEADING (count labelled APPROVED includes paper alerts)**

> C. APPROVED SIGNALS: 2 tested alerts sent today (see those messages).  \|  ... Rule hits: 3. Approved: 2.

| Field | Value |
|---|---|
| Rendered | FIXTURE (test/radar-v3-core.test.mjs snap({alerts:2})) |
| Source | radar-v3-core.mjs:129 (buildMidday panel C); count from ignition-watch.mjs:166 (alerts++) written to data/radar-v3-snap.json at :277 |
| Evidence artifact | ignition-watch.mjs maybeAlert: alerts++ runs for BOTH rule alerts that passed the history test AND "EARLY WAVE ALERT [PAPER, NOT PROVEN]" alerts (early=true: live-only rules with 20+ paper trades positive at 1.5x costs); it also runs before sendAlert(), so an alert recorded but not sent (opportunities-only setting) is counted as "sent" |
| Population | alerts sent by the live watcher today |
| Selection period | today |
| Rule version | ignition maybeAlert |
| Costs | - |
| Holding basis | - |
| Coverage | live watcher |

**What the recorded evidence supports:** The radar correctly reports how many times maybeAlert fired.

**Unsupported wording or missing provenance:** "APPROVED" and "sent": an early paper alert (NOT PROVEN) is counted as an approved signal, and an unsent alert is counted as sent. early-alerts.mjs header says approved alerts come only from rules that passed every gate; maybeAlert also emits the early paper kind.

**Proposed wording:** C. APPROVED SIGNALS: <n approved> (rules that passed the history test). Separately: EARLY PAPER ALERTS (NOT PROVEN): <n>. Count only alerts actually sent.

**Who / what:** Codex: split the counter (approved vs early paper; sent vs recorded) in ignition-watch.mjs and the snapshot; radar wording follows.

## B02: EARLY WAVE ALERT (ignition-watch.mjs maybeAlert, early paper kind) | GATE_OR_DECISION | **POLICY QUESTION (not decided here)**

> EARLY WAVE ALERT [PAPER, NOT PROVEN] \| only <n> paper trades on <d> day(s). Ride it only with the minimum 1,000 USD and the stop.

| Field | Value |
|---|---|
| Rendered | source read (live-session only) |
| Source | ignition-watch.mjs:157-169 |
| Evidence artifact | paperOk / PREC live paper record: 20+ trades, average > 0, positive at 1.5x costs; rule has NOT passed its history test (liveOnly) |
| Population | live-only ignition rules |
| Selection period | forward paper |
| Rule version | early paper alert path (owner's choice "every chance shown") |
| Costs | 1.5x stress |
| Holding basis | intraday |
| Coverage | live watcher |

**What the recorded evidence supports:** The label says PAPER, NOT PROVEN and gives the trade count.

**Unsupported wording or missing provenance:** "Ride it only with the minimum 1,000 USD and the stop" is a trade instruction triggered by a paper record alone. CLAUDE.md section 9 allows plain BUYs only for the owner's lanes; whether a paper record may trigger a trade suggestion is an owner decision.

**Proposed wording:** EARLY WAVE ALERT [PAPER, NOT PROVEN] | <n> paper trades on <d> days. Research only; not a buy.  (If the owner keeps the trade suggestion, say so explicitly: "your rule: paper-only alerts may be traded at 1,000 USD with the stop".)

**Who / what:** Owner decision first (policy question P1); wording then follows.

**Owner policy question:** P1 (see below)

## B03: lab (hunting lab) PERSISTENCE TEST vs the engine BUY-eligibility bar | GATE_OR_DECISION | **UNVALIDATED GATE**

> PERSISTENCE TEST (quick dips): 8 stocks passed on their own older-half record (15+ trades, +1.5% average, half won). newer half, those stocks: 73 trades, 53% won, average -1.5% \| all other stocks: 27368 trades, average -0.5%  RESULT: NOT ENOUGH TRADES.

| Field | Value |
|---|---|
| Rendered | COMMITTED (scan.mjs lab reply from data/hunting-lab.json) |
| Source | hunting-lab.mjs:358-360; gate scan.mjs:1283 (okEv early-evidence branch) |
| Evidence artifact | data/hunting-lab.json (PER); okEv: n >= 15 && net >= 1.5% && win >= 50% admits an engine candidate as BUY evidence |
| Population | quick-dip trades, whole market |
| Selection period | older half selects, newer half judges (dates per hunting-lab run) |
| Rule version | okEv 15+ branch |
| Costs | 0.8% |
| Holding basis | quick-trade exit |
| Coverage | whole market, daily data |

**What the recorded evidence supports:** The lab reports its result honestly (NOT ENOUGH TRADES).

**Unsupported wording or missing provenance:** The only recorded test of the per-stock "15+ trades, +1.5%, half won" bar is inconclusive and points the wrong way (selected stocks -1.5% vs -0.5% for the rest), yet the same bar admits engine candidates as BUY evidence (scan.mjs:1283). Engine buys are paused by focus mode today; with focus off they would be offered on this bar.

**Proposed wording:** (Wording) Engine 'early evidence' (15+ past trades on the stock) is NOT validated: its only test was inconclusive and its picks did worse than other stocks.

**Who / what:** Codex / owner: keep the frozen result; decide separately whether an unvalidated bar may admit BUYs (policy question P2). No rule change in this package.

**Owner policy question:** P2 (see below)

## B04: days command; market today command | WORDING_ONLY | **MISLEADING (selection-biased averages presented as performance)**

> DAY OF THE WEEK: does the buy day matter? (unseen trades of the rules the system offers, after costs, by the day the BUY happened) Average: older half +1.9%, newer half +2.2%  \|  TESTED (the system’s own unseen trades bought after days like this, older / newer half; average of all +1.6% / +1.8%)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | scan.mjs buyDayNote / market-day text (around 1680-1700); DOWS aggregation scan.mjs:3743-3744 |
| Evidence artifact | per-stock out-of-sample trades of rules that passed okEv (or proven) on each stock, aggregated (signals.json Lr.dow / mday) |
| Population | only stocks whose own history already cleared okEv (selected for good history) |
| Selection period | each stock's own history (not printed: MISSING) |
| Rule version | engine rules |
| Costs | per okEv cost model |
| Holding basis | per rule |
| Coverage | nightly scan universe |

**What the recorded evidence supports:** The day-of-week comparison ("no steady difference") is a fair within-sample comparison.

**Unsupported wording or missing provenance:** The headline averages (+1.6% to +2.2% a trade) come only from stocks pre-selected for good past results; the same engine's forward record is negative (quick trades -1.6%, shadow -1.9%). Shown without that caveat they read as expected returns.

**Proposed wording:** DAY OF THE WEEK (past test trades of stocks picked for good past results; not expected returns; the live record of these rules is negative): no steady difference by day.

**Who / what:** Codex wording.

## B05: market today command (with focus off); also details/COVERAGE | WORDING_ONLY | **MISLEADING (vocabulary)**

> NO NEW BUYS: no proven buy rule fired.  \|  BUYING DAY: <n> proven buy(s) (...) Use ACTIONS for ranges and stops.

| Field | Value |
|---|---|
| Rendered | COMMITTED (focus on); focus-off branch checked with the actual planCands on committed data (1 candidate becomes ok) |
| Source | scan.mjs:1694-1699 |
| Evidence artifact | planCands().ok (respects focus: 0 with focus on, 1 with focus off) |
| Population | engine candidates |
| Selection period | - |
| Rule version | okEv |
| Costs | - |
| Holding basis | - |
| Coverage | nightly scan |

**What the recorded evidence supports:** Gate behaviour is consistent with ACTIONS (focus respected).

**Unsupported wording or missing provenance:** "proven" names the per-stock okEv bar, not the handbook PROVEN tier (see W08 / vocabulary).

**Proposed wording:** NO NEW BUYS: no engine candidate passed its past-trade check.  |  ENGINE CANDIDATES: <n> (past-trade check only, NOT PROVEN).

**Who / what:** Codex wording.

## B06: Sunday STOP STUDY / EXIT TEST / HORIZONS messages | WORDING_ONLY | **MISLEADING (hard-coded period)**

> STOP STUDY (... 5 years, whole market, held up to 60 sessions, <from> to <to>)  \|  EXIT TEST (when to sell): the same buys sold 10 ways, 5 years, whole market, <from> to <to>  \|  HORIZONS (mid and long term: 1, 3 and 6 months; 5 years, whole market, ...)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | stops.mjs:71; exits.mjs:125; horizons.mjs:86 |
| Evidence artifact | committed artifacts: data/stops.json 2022-04-19 to 2026-07-22 (4.3 years); data/exits.json 2022-10-12 to 2026-04-28 (3.5 years); data/horizons.json 2022-10-12 to 2026-10-19 (4.0 years) |
| Population | per study |
| Selection period | as stated in the artifacts (not 5 years) |
| Rule version | per study |
| Costs | per study |
| Holding basis | 60 sessions / 3 months / 1-6 months |
| Coverage | whole market |

**What the recorded evidence supports:** The dates printed next to "5 years" come from the data and are correct.

**Unsupported wording or missing provenance:** "5 years" is a fixed string, not computed; none of the three studies covers 5 years.

**Proposed wording:** STOP STUDY (<years computed from from/to> years, ...)

**Who / what:** Codex wording (derive the span from the dates).

## B07: rebuy (Sunday message and rebuy command) | WORDING_ONLY | **MISLEADING (mislabelled metric)**

> ... sell, buy back when it closes above its 20-day average again (or after 60 sessions): NOT PROVEN (+0.0% vs holding; the stock came back to the buy-back price 100% of the time)

| Field | Value |
|---|---|
| Rendered | COMMITTED (rebuy reply) and SYNTHETIC |
| Source | rebuy.mjs:84 (text), :48-51 (back flag) |
| Evidence artifact | for UPTURN versions "back" = a close above the 20-day average occurred within 60 sessions; there is no buy-back price |
| Population | per trigger |
| Selection period | 2022-01-06 to 2026-07-22 |
| Rule version | rebuy versions |
| Costs | side costs included |
| Holding basis | 60 sessions |
| Coverage | whole market |

**What the recorded evidence supports:** The verdicts (NOT PROVEN; no switch beat holding) stand.

**Unsupported wording or missing provenance:** "came back to the buy-back price 100%" is near-automatic for the upturn versions and is not a price.

**Proposed wording:** (upturn versions) re-entry signal came within 60 sessions <x>% of the time.

**Who / what:** Codex wording.

## B08: catalysts command | WORDING_ONLY | **MISLEADING (instruction-like wording for rejected rules)**

> Rules: run-up into the date (CAT-RUN1) REJECTED; news build-up (CAT-NEWS1) REJECTED. INFORMATION ONLY ... Coming up (buy day = 30 sessions before, sell day = 2 sessions before): - <SYM>: PDUFA <date>; buy day <date>, sell day <date> (check ZAD)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | scan.mjs catalysts reply (catalyst-lab data) |
| Evidence artifact | data/catalyst-lab.json: both rules REJECTED |
| Population | 8-K dated catalysts |
| Selection period | per catalyst-lab |
| Rule version | CAT-RUN1 / CAT-NEWS1 |
| Costs | per lab |
| Holding basis | 30 sessions to 2 before |
| Coverage | 8-K text search |

**What the recorded evidence supports:** Verdicts and the INFORMATION ONLY line are correct.

**Unsupported wording or missing provenance:** Each row then prints "buy day" and "sell day" for a rule that is REJECTED.

**Proposed wording:** Coming up (the REJECTED run-up rule would have entered 30 sessions before): <SYM>: PDUFA <date>.

**Who / what:** Codex wording.

## B09: OPPORTUNITY RADAR midday panel C (closest rule) | WORDING_ONLY | **MISLEADING**

> Closest: IG1 (68 paper trades on 8 days, +2.1% a trade). Missing: its 5-year history test (REJECTED); 2 more trading days.

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | radar-v3-core.mjs:130 (closestRule) |
| Evidence artifact | early-alerts / fastmover-lab verdicts |
| Population | IG rules |
| Selection period | forward paper |
| Rule version | IG1/close |
| Costs | after costs |
| Holding basis | alert to close |
| Coverage | live watcher |

**What the recorded evidence supports:** Numbers come from the rule record.

**Unsupported wording or missing provenance:** A REJECTED history test is not "missing": it cannot be satisfied by waiting. "2 more trading days" reads as nearly approved.

**Proposed wording:** Closest: IG1 (68 paper trades on 8 days, +2.1% a trade). Cannot be approved: its 5-year history test was REJECTED (a new version would need a new test).

**Who / what:** Codex wording.

## B10: OPPORTUNITY RADAR midday footer | PROVENANCE_ONLY | **EVIDENCE NOT RECORDED (static number)**

> Chasing: stocks already up 20%+ when first seen fell a median 19% to the close (469 cases, 14-27 Oct).

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | radar-v3-core.mjs:136 |
| Evidence artifact | hard-coded; no artifact referenced in the code or data: MISSING |
| Population | MISSING |
| Selection period | 14-27 Oct 2026 (stated) |
| Rule version | - |
| Costs | - |
| Holding basis | first seen to close |
| Coverage | MISSING |

**What the recorded evidence supports:** -

**Unsupported wording or missing provenance:** A frozen number with no stored source; it will never update.

**Proposed wording:** Chasing: in a 14-27 Oct 2026 sample (<artifact>), stocks already up 20%+ when first seen fell a median 19% to the close.

**Who / what:** Codex: cite or store the source; or drop.

## B11: EARLY WATCH: RESEARCH LEADS footer | PROVENANCE_ONLY | **SUPPORTED (static; dated in code only)**

> Trigger EW-ALERT-1 is UNPROVEN: on its first 2 days only about 1 in 10 such stocks reached that gross move.

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | early-alerts.mjs:103 (header comment: 26-27 Oct, 4-15%) |
| Evidence artifact | early-alerts.mjs header (pre-registration note); measured values not stored as an artifact: MISSING |
| Population | EW-ALERT-1 candidates |
| Selection period | 26-27 Oct 2026 |
| Rule version | EW-ALERT-1 |
| Costs | +3.6% gross for +2% net |
| Holding basis | to 15:00 |
| Coverage | live watcher |

**What the recorded evidence supports:** Consistent with the pre-registration note (4-15%).

**Unsupported wording or missing provenance:** Static text; "first 2 days" will stay true forever while the delivery scorecard accumulates the real record.

**Proposed wording:** Trigger EW-ALERT-1 is UNPROVEN (26-27 Oct 2026: about 1 in 10 reached the needed move; see the delivery scorecard for the running record).

**Who / what:** Codex wording.

## B12: radar close panel C; early-alerts header | WORDING_ONLY | **MISLEADING (same as X03)**

> C. APPROVED SIGNALS today: 0. Tested buys for the next session come in ACTIONS tonight.

| Field | Value |
|---|---|
| Rendered | FIXTURE (also on committed data when the watcher saved a day) |
| Source | radar-v3-core.mjs:169 |
| Evidence artifact | ACTIONS buys are the owner's NOT PROVEN lanes |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** -

**Unsupported wording or missing provenance:** "Tested buys" implies validated buys.

**Proposed wording:** C. APPROVED SIGNALS today: 0. Tonight's ACTIONS lists any buys from your own lanes (NOT PROVEN).

**Who / what:** Codex wording (catalogued as X03 in batch 1).

## B13: stops command and Sunday STOP STUDY ("New buys you record get the recommended stop") | GATE_OR_DECISION | **DECISION LINKAGE NEEDING CONFIRMATION**

> RECOMMENDED: the old default (2 daily ranges or the 50-day average) (the smallest losses in the worst 5% of buys among the stops costing at most 0.5% a buy) ... New buys you record get the recommended stop

| Field | Value |
|---|---|
| Rendered | SYNTHETIC (wording) / COMMITTED (stops reply) |
| Source | stops.mjs:71-75; scan.mjs stop assignment on "bought" |
| Evidence artifact | data/stops.json: 18 versions, tCrit 2.99; recommendation = smallest worst-5% loss among stops costing <= 0.5% a buy (a tail-risk choice, not a passed performance gate) |
| Population | any liquid stock / strong stocks |
| Selection period | 2022-04-19 to 2026-07-22 |
| Rule version | stop study |
| Costs | per stops.mjs |
| Holding basis | 60 sessions |
| Coverage | whole market |

**What the recorded evidence supports:** The selection rule is stated in the message.

**Unsupported wording or missing provenance:** Called "the tested stop" elsewhere and applied automatically to new owner buys; the choice is a risk preference, not a passed test. (The LEADER DIP lane is exempt: no stop by design.)

**Proposed wording:** RECOMMENDED STOP (risk choice from the stop study: smallest worst-case losses for at most 0.5% a buy; not a profit test).

**Who / what:** Wording now; owner confirms the automatic default (not a BUY question).

## B14: live watcher "tested AVOID" note | PROVENANCE_ONLY | **EVIDENCE NOT MAPPED**

> lottery-like: a <x>% one-day jump in the last month (tested AVOID)

| Field | Value |
|---|---|
| Rendered | source read |
| Source | ignition-watch.mjs:162 |
| Evidence artifact | AVOID list (data lottery file); the study that "tested" it is not referenced: MISSING |
| Population | - |
| Selection period | - |
| Rule version | one-day-jump AVOID (hard block) |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** The block itself is conservative and documented in CLAUDE.md.

**Unsupported wording or missing provenance:** "tested" has no referenced artifact.

**Proposed wording:** lottery-like: a <x>% one-day jump in the last month (AVOID list; hard block)

**Who / what:** Codex wording or cite the study.

## B20: Sunday HUNTING LAB / lab reply | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | hunting-lab.mjs:346-367 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Each rule shows NOT PROVEN / REJECTED with both halves, random-stock baseline and exit test; "No new way passed. Nothing to act on."

**Unsupported wording or missing provenance:** -

## B21: Sunday WINNERS STUDY / winners reply | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | winners-study.mjs:135-146 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** "Common among winners is not the same as a buy signal"; RESULT: no winner pattern passed.

**Unsupported wording or missing provenance:** -

## B22: Sunday LEADERS FAIR TEST | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | leaders-study.mjs (message builder) |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Whole market incl. collapsed stocks; verdict from the chosen version; cost ladder; company-list warning. The ACTIONS shorthand "provisionally promising" is the problem (A02), not this message.

**Unsupported wording or missing provenance:** -

## B23: Sunday EARNINGS SURPRISE DRIFT | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | earnings-study.mjs:176-199 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Frozen first-run verdict NOT PROVEN; "Earnings drift is NOT offered as a buy."

**Unsupported wording or missing provenance:** -

## B24: Sunday COMPANY NEWS (events) / events reply | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | events-study.mjs:335-343 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** All kinds REJECTED / NO VERDICT YET; warnings "none proven"; supply chain marked INFORMATION ONLY.

**Unsupported wording or missing provenance:** -

## B25: Sunday HORIZONS (except the "5 years" header, B06) | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | horizons.mjs:86-89 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** REJECTED / NOT PROVEN per horizon with "about 1 could pass by luck".

**Unsupported wording or missing provenance:** -

## B26: Sunday EXIT TEST / exits reply (except B06 header) | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | exits.mjs:115-131 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** "No exit beat the default beyond luck"; "Close but not proven".

**Unsupported wording or missing provenance:** -

## B27: Sunday OCTOPUS | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | octopus.mjs:197-233 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** NOT PROVEN with unseen-week halves; "Not a buy list."

**Unsupported wording or missing provenance:** -

## B28: Sunday STOCK SCORE | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | SYNTHETIC |
| Source | score-study.mjs:82-93 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** NOT PROVEN / "Do not buy by this score". Robustness note: on empty data it prints "(backwards)" next to n/a values (synthetic run only).

**Unsupported wording or missing provenance:** -

## B29: OPPORTUNITY RADAR panels A, B, D and blocked list | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | radar-v3-core.mjs:96-140 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Every A/B line says NOT AN APPROVED BUY; B shows the paper record and "5-year test REJECTED"; D is retrospective; hard blocks listed separately.

**Unsupported wording or missing provenance:** -

## B30: RADAR SCORECARD and RANKING SHADOW TEST (close) | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | radar-v3-core.mjs:144-175; opportunity-radar.mjs:59 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** "verdict after 10" sessions; "no change without your approval"; instrument-identity footer.

**Unsupported wording or missing provenance:** -

## B31: EARLY WATCH: PAPER SETUP | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | early-alerts.mjs:105 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** "Rule record: <n> paper trades, <avg> after costs, <x> without its 2 best; 5-year test REJECTED ... Paper only: logged and scored, not a buy."

**Unsupported wording or missing provenance:** -

## B32: DELIVERY SCORECARD | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | FIXTURE |
| Source | early-alerts.mjs:170-180 |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Counts and after-cost results of delivered vs eligible; best/worst shown.

**Unsupported wording or missing provenance:** -

## B33: missed command | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | scan.mjs (missed runners) |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** "Seeing more runners earlier is not the same as making money"; causes counted.

**Unsupported wording or missing provenance:** -

## B34: chains command | NONE | **SUPPORTED_QUALIFIED**

> (see rendered text; verdict wording preserved)

| Field | Value |
|---|---|
| Rendered | COMMITTED |
| Source | scan.mjs (chains) |
| Evidence artifact | the study's own data file / ledger |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Decoder verdicts NOT PROVEN / REJECTED; "INFORMATION ONLY".

**Unsupported wording or missing provenance:** -

## Owner policy questions (not decided here)

- **P1:** May a forward PAPER record alone (e.g. 20+ trades positive at 1.5x costs, or 30+ trades positive) trigger a trade suggestion or a BUY wording, before the rule passes its history test?
  - **Where:** ignition-watch.mjs early paper alerts ("Ride it only with the minimum 1,000 USD"); intraday-radar.mjs graduation ("BUY: PROVEN on paper", batch-1 X01); octopus "may be considered as buys" (X04)
  - **Note:** Not decided in this package. CLAUDE.md section 9 currently allows plain BUYs only for the owner's lanes.
- **P2:** May the per-stock "past-trade check" (okEv: 30+ out-of-sample trades on the stock >= +0.4%, or 15+ >= +1.5% and half won) admit engine BUY candidates when focus is off, given that its only test (hunting-lab persistence) was inconclusive and pointed the wrong way?
  - **Where:** scan.mjs:1283 okEv; focus mode
  - **Note:** Not decided in this package. Today focus is on, so engine buys are paused.
