# HISTORY-03 Batch 5: remaining senders and modules

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. Same method, fields and defect types as batch 2 (`BATCH2-FINDINGS.md`). Nothing was sent and no provider was called; raw renders stay local.

## E01: MARKET SHOCK message (news-watch.mjs, every 15 min in session; sent when the S&P 500 moves 1.5%+ or a tier-1 headline lands) | WORDING_ONLY | **MISLEADING (selection-biased figures in a live decision message; extends B04 and X02)**

> MARKET SHOCK: S&P 500 <dp>% today / DECISION: HOLD everything you own; keep every stop at your broker. Do not panic-sell. Tested buys in ACTIONS stay valid at their prices. \| Only the strongest tested buy today. / ... What the 5-year test found when the S&P 500 had a big drop (1.5%+) that day: the system’s tested buys made <x> a trade on average (<n> unseen trades) vs <y> on all days: <verdict>. / Decided by the system from the 5-year market-day test. Not financial advice.

| Field | Value |
|---|---|
| Rendered | source read (live only; template read in full) |
| Source | news-watch.mjs:72-79 |
| Evidence artifact | data/mday-study.json rows bigDown / bigUp: per-stock out-of-sample trades of engine rules on stocks pre-selected by the past-trade check (the B04 population); the engine's forward record is negative |
| Population | stocks pre-selected for good past results |
| Selection period | each stock's own history |
| Rule version | market-day study |
| Costs | okEv cost model |
| Holding basis | per rule |
| Coverage | nightly scan universe |

**What the recorded evidence supports:** "HOLD, keep your stops, do not panic-sell" is a precaution, not a performance claim.

**Unsupported wording or missing provenance:** The quoted averages are selection-biased (see B04) and "tested buys" / "Decided by the system from the 5-year market-day test" present them as validated.

**Proposed wording:** MARKET SHOCK ... DECISION: hold; keep your stops. (Past test trades on stocks picked for good past results did <x> on days like this; not an expected return.)

**Who / what:** Codex wording.

## E02: discover reply / discovery cards (dilution note) | WORDING_ONLY | **OVERSTATED**

> <SYM>: share count +<x>% in a year. Companies that keep selling new shares lag the market

| Field | Value |
|---|---|
| Rendered | source read |
| Source | discover.mjs:340 |
| Evidence artifact | library S2 "Heavy dilution (avoid test)": FAILED DISCOVERY (edge -3.8%, t -2.31 below the 3.5 bar, n 1,009); C-S8 (S-8 share creep) rejected as an AVOID (not worse than the average stock in the older half) |
| Population | - |
| Selection period | autolab discovery window |
| Rule version | S2 / C-S8 |
| Costs | - |
| Holding basis | 20 sessions |
| Coverage | - |

**What the recorded evidence supports:** The direction (heavy diluters lagged) appears in one discovery test.

**Unsupported wording or missing provenance:** Stated as a general fact; the evidence is below the luck bar and the related S-8 test found no lag.

**Proposed wording:** share count +<x>% in a year (heavy diluters lagged in one test, not beyond luck)

**Who / what:** Codex wording.

## E03: deals message (deals.mjs) | GATE_OR_DECISION | **POLICY QUESTION P1 (latent)**

> Paper record of this pattern (buy next open, 10% stop, out after 20 sessions): ... It becomes a BUY only after 30+ paper trades with a profit.

| Field | Value |
|---|---|
| Rendered | source read |
| Source | deals.mjs:98 |
| Evidence artifact | - |
| Population | deal pattern |
| Selection period | forward paper |
| Rule version | deals pattern |
| Costs | - |
| Holding basis | 20 sessions |
| Coverage | - |

**What the recorded evidence supports:** Paper-only today.

**Unsupported wording or missing provenance:** States that a paper record alone will turn the pattern into a BUY (P1).

**Proposed wording:** (after P1) state the owner's rule for paper-record promotion

**Who / what:** Owner P1.

**Owner policy question:** P1

## E04: TipRanks message (tipranks.mjs, twice a week) | WORDING_ONLY | **MISLEADING (vocabulary; = D08)**

>   BUY WATCH (tested rule): buy <range> ... \| Not yet (tested rule): buy only after a close above ~<px> \| Reference plan (not tested): ... \| Ratings are opinions, not tested signals.

| Field | Value |
|---|---|
| Rendered | source read |
| Source | tipranks.mjs:124-139 |
| Evidence artifact | per-stock past-trade check (okEv) |
| Population | - |
| Selection period | - |
| Rule version | okEv |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** Ratings are correctly labelled as opinions.

**Unsupported wording or missing provenance:** "tested rule" for the per-stock check.

**Proposed wording:** BUY WATCH (past-trade check only, NOT PROVEN)

**Who / what:** Codex wording.

## E10: lab and study verdict templates (agent-a, chain-ripple, e16, ew-stack, fulfilling, gov-awards 1-2, insider-study, orb, pattern-lab, regime-gate, sequence, share-supply, smart-money, swing-lab, tip-score, discovery2, catalyst-lab, league, rank-models, missed-runners, movers) | NONE | **SUPPORTED_QUALIFIED**

> "every gate passed in both halves ... below the proof bar" / "not better than an average stock in the ..." / "A version passed: it goes on paper first, never straight to a buy." / "one period is a lead, not proof" / "Paper only until its live record passes." / "Never PROVEN from this engine: the older half was used to find the rule."

| Field | Value |
|---|---|
| Rendered | source read |
| Source | see SCOPE |
| Evidence artifact | each study's own frozen data file |
| Population | per study |
| Selection period | per study |
| Rule version | per study |
| Costs | per study |
| Holding basis | per study |
| Coverage | per study |

**What the recorded evidence supports:** Verdict templates name the gate that failed or passed and keep NOT PROVEN / paper-first language; conditional "passed" texts appear only on a recorded pass.

**Unsupported wording or missing provenance:** -

