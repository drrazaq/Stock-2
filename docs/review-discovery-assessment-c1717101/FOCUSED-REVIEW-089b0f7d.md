# Focused review: continuation `089b0f7d` (Codex 6748009731)

Offline and read-only. Runtime is unchanged at `16c72e0b`. No acquisition, dispatch or production action.

## 1. Batch 2: how the selection was made (PASS, with a qualification)

- **Freeze `a478782b`:** cutoff 17:18:16Z unchanged. Counts are SELECTED 6, EXCLUSION 24, ALREADY_INVESTIGATED 5, **ASSESSMENT_VERSION_ALREADY_RECORDED 6** and DEFERRED 1,183, with the first batch's six IDs passed as already seen.
- **Same mechanism as my T1 demonstration:** my call 2 and call 3 produced the same names (MID AIRS/AMR, LONG CARG/ASAN; SHORT KTB/ASTS once VGZ/GEF are recorded).
- **As an explicit offline research step it is legitimate.** It was frozen before any reading, with its inputs and prior IDs recorded, and it reproduces.
- **T1 still stands for the production caller.** The bot reply does this automatically on every call. This batch is not evidence that T1 is acceptable in production.

## 2. Retained entry and exit rules (verified against `signals.json` at `46be9039`)

| Symbol | Retained rule | State |
|---|---|---|
| KTB | 10/30 cross, stop 1.5 × ATR, target 3R | No action |
| ASTS | 10/30 cross, stop 1.5 × ATR, no fixed target | No action |
| AMR | Reclaim above 20-day average, uptrend only, stop 1.5 × ATR | No action |
| CARG | Reclaim above 20-day average, stop 1.5 × ATR, sell after 20 days | No action |
| ASAN | 9/21 cross, stop 1.5 × ATR, target 3R | No action |
| AIRS | No scanner row | — |

All rows match Codex's cards exactly.

- **Addition:** every row has `proven: false`. The cards should say **"rule NOT PROVEN"** next to the retained rule, so it is not read as a tested rule waiting for a trigger.
- **R1 (new, moderate).** Only **3 of 2,187** scanner rows carry `key`. The assessment `ruleId` comes from `facts.key`, so in the batch-1 replay **five of six records have `ruleId: null`**, KTB and ASTS included, though their rows name a rule.
  - `linkAssessmentOutcomes` then returns a net-after-cost figure only when `ruleId` is set, so these records can never resolve, even with a complete witness.
  - **Fix:** record a rule identity derived from the existing rule fields (rule text or version), marked as derived, or record it explicitly as `RULE_UNKEYED`. Feedback must then distinguish "no adopted rule" from "rule present but unkeyed".
  - No rule or gate changes.

## 3. Primary-event novelty (logic review; the sources are not independently fetched here)

- **AMR:** correct. The 23 October preliminary disclosure already contained the EPS and EBITDA; the 6 November final release repeats them and is not a fresh surprise.
- **KTB / ASTS:** correctly left unresolved. The feed items have no source ID, and the ASTS call was still in the future at the cutoff.
- **AIRS:** the adverse results are kept, and ATM-funded debt paydown is correctly not called operating deleveraging.
- **ASAN:** correctly identifies that the latest report is the quarter ending 31 July, with the next on 1 December.
- **CARG:** the conflict between the quality metric (growth −19.7%) and reported revenue (+12%) is flagged, not used. This is confirmed: `quality.json` has CARG growth −0.197 and ASAN −0.053, with **`dilute: null` for both**. Treating null as missing evidence, not zero, is right.

## 4. How missing evidence is interpreted (PASS)

- Economic advantage is INCONCLUSIVE, not disproved.
- No invented HOLD/SELL for positions not held.
- ZAD remains the final authority.
- `q = floor(997/ask)` and `net = q × (exit_bid − entry_ask) − 6` are presented as formulas, not results.
- The 3% entry limit is separate from costs.

## 5. Monday scanner: pause or restoration witness

- **I hold no pause or restoration witness.**
- **Read-only facts:**
  - `main.yml` workflow 374437748 has `state: active`, `updated_at: 2026-10-30T17:41`;
  - its last runs are 42321580565 (7 November 01:00) and 42315923477 (7 November 00:04).
- **The gap is not just Monday.** Retained `main.yml` scheduled runs from 5 to 9 November are only seven: 5 Nov 01:02, 01:34, 20:37; 6 Nov 01:41, 19:55; 7 Nov 00:04, 01:00. Those days had about 17 slots each.
- Monday also has **no** `news.yml` runs and no **scheduled** `ignition.yml` runs; the watcher ran only through guard dispatch 42632637138 at 14:13.
- That pattern predates today's 10:00 GitHub incident. It points to persistent scheduler non-delivery for these high-frequency weekday crons. The **cause is not established**, and no operational action is proposed.

## 6. Validation

My independent run on exact `16c72e0b`, root `test/*.test.mjs` (231 files) plus `tests/instrument-type`, is in progress on a healthy executor. The receipt will be posted separately, with every failure kept.
