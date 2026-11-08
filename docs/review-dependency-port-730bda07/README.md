# Review of Codex's development residual fix `730bda07cfd6b0bda93a6eda52f31fba48f5896b` (request 6723732821)

**Verdict: CHANGES REQUIRED, one mechanical pin.** R1, R2 and R3 are fixed correctly on the actual intraday caller. Review only; nothing integrated or pushed to development.

## Blocking: B1, a missed cascading pin

- **The pin:** `docs/a-fence-recovery/manifest.json:12` pins `docs/a-native-source-join/manifest.json` at `6335093724c28f56…` (the `3589faf5` bytes).
- **What changed:** the refresh rewrote that manifest, which now hashes to `bade74e1e095fe155ef74600ff205b039b0c48dcf197dd58ccc255373e68bbde`.
- **The failure:** `test/a-fenced-recovery.test.mjs` "exact recovery package and protected strategy/producer dependency hashes remain pinned" **fails at `730bda07` (62/63) and passes at `3589faf5`**. Verified independently.
- **Not caught by the focused set:** the 45/45 focused set did not include `a-fenced-recovery`. Hosted run 42496560593 should show this failure.
- **No other cascade:** searching for the old hash of each of the six refreshed manifests finds only this one place.
- **Fix:** refresh that one pin, keeping the original retained, as with the other refreshes.

## R1–R3: fixed

| Item | Result |
|---|---|
| **R1** | `stopObservation` judges "stop reached" at `observedAt` with the 5-minute gate, and the first-check line is timed ("… old when checked at …; no current price now"). HOLD, targets, % from entry (3 min) and buy lines still need fetch validity **and** report-time freshness. YOUR STOPS entries start with "Checked at <time>". |
| **R2** | A stale quote no longer prints a price ("ZZS: YOUR POSITION: PRICE UNVERIFIED…"); fresh alerts keep their price. |
| **R3** | STOP STATUS UNKNOWN cites the 5-minute stop limit; PRICE STATUS UNKNOWN keeps 3 minutes. |

**Adversarial reproducer** `break.test.mjs` (actual intraday caller; run with `REVIEW_TREE=<tree>`): **3/8 on `3589faf5`, 7/8 on `730bda07`.**

| Case | Result on `730bda07` |
|---|---|
| Codex's stale-HOLD counterexample (90, stop 80, 290 s, +30 s) | STOP STATUS UNKNOWN; no HOLD, target, % or price |
| 170 s, +30 s, t2 88 | PRICE STATUS UNKNOWN, no target |
| Future-at-fetch, under and above the stop | UNKNOWN, never REACHED or HOLD |
| 4 min 50 s under the stop | REACHED in both messages; the first check is timed, with no % |
| YOUR STOPS sent 10 minutes late | "Checked at …"; the first check is timed, "no current price now" |
| Older alert path (N1 below) | **fails on both trees**; not a regression |

- **My `residual.test.mjs`:** 4/4 (the parent was 1/4).
- **`desired-behaviour.test.mjs`:** 8/8, with no regressions.

**Tests and pins:**
- Only one old assertion changed: `open-check-repair.test.mjs:65`, `limit 3 min` → `limit 5 min`. It is still an exact match; the undated and no-price diagnoses are unchanged, and the 3-minute buy-line assertion stays.
- In Codex's new `dependency-port-residual-review.test.mjs`, one alternation is loose (`/checked at|observed at|when checked/i`); the others are exact.
- The six `scan.mjs` pins equal the actual hash (`a1d60659…`), the old value equals `3589faf5`, only those keys changed, and the historical `463d69b1…` pins are untouched.

## Non-blocking notes

- **N1 (low-medium; older path, not a regression):** intraday alerts (TARGET 1/2, LEADER/QUICK, ENTRY REVIEW cards) are judged at fetch with their own gates and sent after the loop, untimed. In the same run, "ZZS at 90.00: YOUR POSITION: TARGET 2 REACHED (-10.0%)" can appear while the first check says PRICE STATUS UNKNOWN (`scan.mjs:4448-4476`, sent at `:4492-4497`). This is the same class as the stale-HOLD lesson.
- **N2 (wording):** whole-minute rounding gives "5 min old (limit 5 min)" for 320 s, and "5 min old when checked" for 290 s. It predates the commit, but now appears on stop lines.
- **N3 (theoretical, not reproduced):** `stopFallback` judges at `Date.now()` after `liveQ`, while `holdingAction` judges at `observedAt`. Exactly at the 300 s boundary the verdicts could differ by milliseconds. Passing `observedAt` would make them identical.

## Test counts at `730bda07` (Node 20, guard on)

| Run | Result |
|---|---|
| Focused set (open-check, stop-alert-validity, stop-watch, shadow, native-sec-shadow-package, dependency-port-review, dependency-port-residual-review, watcher-nov2-clock/guard) | 81/81 |
| Gated watcher (`development-full`) | 20/20 |
| Full `test/` + `tests/` | 3,276 tests: 3,267 pass, **3 fail**, 6 todo |

- **The 3 failures:** one is B1. The other two refuse to run as root ("run this permissions regression as a non-root user"); this sandbox is uid 0, so they are not verdicts.

**Not checked:** hosted run 42496560593; those two permission tests as non-root; other `quoteEvidence` callers beyond the intraday paths.
