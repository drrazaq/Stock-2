# HISTORY-03 Batch 3: live alert bodies, intraday radar, unrendered Sunday labs

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. Same method, fields and defect types as batch 2 (`BATCH2-FINDINGS.md`). Nothing was sent and no provider was called; raw renders stay local.

## C01: EARLY WAVE ALERT body (ignition-watch.mjs maybeAlert, early paper kind) - extends B02 | GATE_OR_DECISION | **POLICY QUESTION P1 (stronger evidence than B02)**

> EARLY WAVE ALERT [PAPER, NOT PROVEN] \| only <n> paper trades on <d> day(s). Ride it only with the minimum 1,000 USD and the stop. / <SYM> <chg> at <time> ... / BUY only up to <price> (3% above now; higher = skip). STOP <stop>. EXIT: <exit> ... / Rule: <name>. Forward-tested only. Live paper: <n> trades, <avg> (<stress> at 1.5x costs). / Check ZAD first. 1,000 USD at most.

| Field | Value |
|---|---|
| Rendered | source read (live session only; same body for the approved and the early paper kind) |
| Source | ignition-watch.mjs:169-174 |
| Evidence artifact | early kind: live-only rule, 20+ paper trades, average > 0, positive at 1.5x costs (PREC); no history-test pass |
| Population | live-only ignition rules |
| Selection period | forward paper |
| Rule version | early paper alert path |
| Costs | 1.5x stress shown |
| Holding basis | intraday, exit before 11 pm Kuwait |
| Coverage | live watcher |

**What the recorded evidence supports:** The header says PAPER, NOT PROVEN; the trade count and the 1.5x-cost figure are shown; "Forward-tested only" is accurate.

**Unsupported wording or missing provenance:** The early paper alert uses the approved alert's body, including an explicit "BUY only up to <price>" line, a stop and an exit. A NOT PROVEN paper result therefore produces a full buy instruction. Whether that is allowed is owner policy P1.

**Proposed wording:** (if P1 = no) replace the BUY/STOP/EXIT lines of the early kind with: 'PAPER ONLY: logged and scored; not a buy.'  (if P1 = yes) keep, and state the owner's rule in the alert.

**Who / what:** Owner decides P1; Codex then aligns the body. Not edited here.

**Owner policy question:** P1

## C02: intraday radar card "Sell:" line (only when a group has a selected hold) | WORDING_ONLY | **MISLEADING (overstated)**

> Sell: at the close after <h> trading days (the holding time that tested best for this kind of setup; the stop still applies)

| Field | Value |
|---|---|
| Rendered | source read (no group has a selected hold today: data/radar-record.json hold = null for all 4 groups) |
| Source | intraday-radar.mjs:161-168 (selection), :222 (text) |
| Evidence artifact | hold chosen on the older half of the group's PAPER trades (30+ needed) and kept only if it also beats the rule exit on the newer half and is positive; no luck bar |
| Population | one paper group |
| Selection period | forward paper |
| Rule version | hold selection |
| Costs | paper costs |
| Holding basis | 1-5 day options |
| Coverage | radar groups |

**What the recorded evidence supports:** A split-half check is used.

**Unsupported wording or missing provenance:** "tested best" reads as a full test; it is a split-half choice on 30+ paper trades without a luck bar.

**Proposed wording:** Sell: at the close after <h> trading days (best on the first half of this setup's paper trades and still better on the second half; not a full test).

**Who / what:** Codex wording.

## C03: intraday radar card "Expected:" line | WORDING_ONLY | **MISLEADING (record labelled as expectation)**

> Expected: <group paper record, e.g. 266 finished, 40% won, average -0.6% after costs>

| Field | Value |
|---|---|
| Rendered | source read; group records from data/radar-record.json |
| Source | intraday-radar.mjs:172 (recText), :223 |
| Evidence artifact | data/radar-record.json group paper records (all four groups currently negative) |
| Population | radar group |
| Selection period | forward paper |
| Rule version | - |
| Costs | after costs |
| Holding basis | per group |
| Coverage | ~280 strong stocks live |

**What the recorded evidence supports:** The figures are the group's real paper record.

**Unsupported wording or missing provenance:** "Expected" presents a short, currently negative paper record as a forecast.

**Proposed wording:** Paper record of this setup so far: <record>.

**Who / what:** Codex wording.

## C04: intraday radar board "BUY, PROVEN ON PAPER" section and card sizing (latent) | GATE_OR_DECISION | **POLICY QUESTION P1 (latent; = batch-1 X01)**

> BUY, PROVEN ON PAPER (<n>) / <SYM>: buy <lo> to <hi>, stop <stop>, sell <t1> or after 5 days  \|  Size: shares = (the loss you accept minus your 6 USD broker fees) / <R>

| Field | Value |
|---|---|
| Rendered | source read (no group proven today) |
| Source | intraday-radar.mjs:152 (graduation), :219-225, :302 |
| Evidence artifact | graduation: n >= 30, days >= NEED_DAYS, avg > 0, PF > 1.2, best share < 50%, newer > 0 (paper only) |
| Population | radar groups |
| Selection period | forward paper |
| Rule version | graduation |
| Costs | after costs |
| Holding basis | per card |
| Coverage | ~280 strong stocks |

**What the recorded evidence supports:** The bar is stated in the radar note.

**Unsupported wording or missing provenance:** Paper graduation alone produces BUY wording and position sizing (P1).

**Proposed wording:** See X01.

**Who / what:** Owner P1; Codex aligns.

**Owner policy question:** P1

## C10: STOP HIT / NEAR STOP alerts (stop-watch.mjs via the live watcher) | NONE | **SUPPORTED (no performance claim)**

> STOP HIT NOW: <SYM> <px> is under your stop <stop>. SELL NOW at market ... / NEAR STOP: ...

| Field | Value |
|---|---|
| Rendered | source read |
| Source | stop-watch.mjs:12-15 |
| Evidence artifact | the owner's recorded stop |
| Population | - |
| Selection period | - |
| Rule version | owner stop |
| Costs | - |
| Holding basis | - |
| Coverage | live watcher |

**What the recorded evidence supports:** An instruction tied to the owner's own stop; no evidence claim.

**Unsupported wording or missing provenance:** -

## C11: intraday radar PRE-WAVE WATCH and PAPER PLAN cards | NONE | **SUPPORTED_QUALIFIED**

> STAGE: PRE-WAVE WATCH. Not a buy. ... \| PAPER PLAN, NO BUY: this kind of setup is not proven yet (research levels, not an instruction) ... Size: none, paper only

| Field | Value |
|---|---|
| Rendered | source read |
| Source | intraday-radar.mjs:216-225 |
| Evidence artifact | - |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** Clear paper labelling.

**Unsupported wording or missing provenance:** -

## C12: Sunday AUTOLAB and QUALITY messages; REBALANCE and FAST-MOVER Sunday messages | NONE | **REVIEWED VIA SOURCE + REPLY**

> (see autolab / quality / rebalance / day trades replies rendered on committed data in batches 1-2)

| Field | Value |
|---|---|
| Rendered | NOT RENDERED on the synthetic cache: autolab crashed (r.b not iterable), quality crashed (no fundamentals cache), rebalance and fastmover-lab produced no message. Production data runs completed on 1 Nov (artifacts dated 2026-11-01). |
| Source | autolab.mjs:182-192; quality.mjs:218-224; rebalance.mjs:79-92; fastmover-lab.mjs:174-246 |
| Evidence artifact | data/autolab.json, data/quality.json, data/rebalance.json, data/fastmover-lab.json |
| Population | per lab |
| Selection period | per lab |
| Rule version | per lab |
| Costs | per lab |
| Holding basis | per lab |
| Coverage | per lab |

**What the recorded evidence supports:** Every extracted string of these files was read one by one (batch 2) and their owner-facing replies were rendered on committed data (W07, W10, W15 and batch-2 triage).

**Unsupported wording or missing provenance:** The Sunday message bodies themselves were not rendered; synthetic-input crashes are a fixture limitation, not evidence of a production fault.

