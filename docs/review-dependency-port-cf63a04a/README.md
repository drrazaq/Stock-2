# Review of Codex's development dependency port `cf63a04a` (STOP + D helpers + open-check)

**Verdict: PASS WITH FINDINGS** (3 low findings, 1 wording finding). No path lets the bot claim HOLD, a price or "stop reached" from a missing, stale or undated quote. No sent-marker is consumed before Telegram acknowledges delivery. Review only: no integration, push to development, or production action.

## Claims checked

| # | Claim | Result |
|---|---|---|
| 1 | STOP API and both callers move together; only D's `nyClockText`/`marketSessionOf` added | **Holds.** `stop-watch.mjs` is byte-identical to main `7742732`; both D helpers are identical to main's; `market-session.mjs` is untouched. `early-alerts.mjs` also takes main's `nyStamp`, an owner-visible change the README omits (catalyst times change from UTC to New York). |
| 2 | Scanner prefix before `intraday()` byte-preserved except the STOP import | **Holds, wording incomplete:** besides the import there is a 7,019-byte block inserted just before `intraday()` (helpers, `holdingAction`, `firstCheckText`). Everything else is byte-identical; only 10 paths change. |
| 3 | Summary/entry 3 min; STOP 5 min | Holds as code (180 s passes, 181 s is UNKNOWN). Side effect: F1. |
| 4 | Intent/ACK/UNKNOWN; `1` replaces `'watcher'` only on an observed watcher ACK | Holds. `ignition-watch.mjs:341` additionally marks a stop already alerted after an ACKNOWLEDGED watcher record. That is a justified addition. |
| 5 | Cadence and session module survive; no 15:00 text transplanted | Holds (cadence 10/10). |
| 6 | The extra record is the rejected UNKNOWN intent, not an extra ACK | Holds (sha256 of `stop:ZZQ:unknown`, asserted UNSENT). |
| 7 | Exact patch/inverse | Holds. On `9c27aa25`, the patch gives tree `85e6cd55` (= `cf63a04a` outside `docs/`) and the rollback gives `1c8376de`. On `a4976e0`, the patch applies and the rollback restores `f8b63fca`. SHA256SUMS: OK. |

## Open-check behaviour on the ported tree

These are all correct:
- a no-stop holding without a valid price is STATUS UNKNOWN, never HOLD;
- when all quotes fail, exactly one first check is sent, with each holding UNKNOWN, and a rerun does not duplicate it;
- no holdings and no list stays silent;
- a stale or undated quote gives no price claim and no "stop reached";
- an HTTP 429 refusal is retried on the next run.

**HTTP 5xx:** the check becomes UNKNOWN and is not resent that day, by design (no duplicates), so the owner can miss that day's first check.

## Findings

- **F1 (low, consistency) `scan.mjs:4348` against `:4414`.**
  - The first check's holding evidence defaults to 3 minutes; `stopFallback` in the same run accepts 5.
  - With a 4-minute-old quote under the stop, the owner gets "STOP STATUS UNKNOWN … (limit 3 min)" and, from the same run and quote, "STOP LEVEL REACHED".
  - Fix: use one window for stop lines, or have the first check refer to the stop message.
- **F2 (low) `scan.mjs:4370-4375`.**
  - `firstCheckText` re-judges freshness at its own `nowMs` (after the whole quote loop) instead of using the status recorded at fetch.
  - A quote whose source time was in the FUTURE when fetched becomes a valid price, or even a "stop reached" claim, once the clock passes it.
  - It only matters when the provider's clock runs ahead, but it contradicts "a future quote never yields a claim".
  - Fix: evaluate at the observation time, or require the recorded status to be OK.
- **F3 (low, weakened tests) `test/open-check-repair.test.mjs:65,74`.** The stale and undated assertions now also accept a generic "no valid price", which would hide a regression in the reason the owner is told.
- **F4 (wording) `scan.mjs:4383`.**
  - The owner-facing line "The development live watcher uses the session calendar and configured segments; actual coverage is UNKNOWN until its archive is verified" is jargon.
  - "A message comes only when … stop, target, exit rule or buy" is inaccurate: PRICE UNVERIFIED and STOP CHECK UNKNOWN messages are also sent.
- **Note (pre-existing, not caused by the port; not tested):** production's `stopFallback` writes `'watcher'` into `alert-state.json`, and development's `readAlertState` refuses that file. If production state is ever carried onto development, intraday messages stop with ALERT STATE UNREADABLE. Production's committed file is currently `{"day":"","sent":{}}`.

## Tests (Node 20.20.0, non-loopback network refused, 0 attempts)

| Test | Result |
|---|---|
| `open-check-repair` | 12/12 |
| `stop-alert-validity` | 17/17 |
| `stop-watch` | 3/3 |
| `shadow` | 10/10 |
| Gated `watcher-incident-revision` (`INCIDENT_WATCHER_PROFILE=development-full`) | 11/11 |
| Gated `watcher-resilience` (same profile) | 9/9 |
| Codex `open-check-extra-review` (`REVIEW_TREE`) | 2/2 |
| `cadence-current` | 10/10 |
| `port-review.test.mjs` (this folder; F1 and F2 written as current behaviour) | 6/6 |

- **Original a52490f9 package tests against the port:** 8/11; the 3 failures are only the intended wording and limit adaptations.
- **Full serial suite: PARTIAL.** 115 of 250 files: 1,427 of 1,438 tests pass and 5 fail. The 5 failing files are hash-pin package tests (`a-fenced-recovery`, `a-first-capture-package`, `a-n-bc-package`, `a-native-importer-package`, `a-native-source-package`), which fail **identically on base `9c27aa25`**. The port also changes `ignition-watch.mjs`, whose base hash those pins hold, so they need updating either way.

**Not checked:**
- the remaining 135 files, `tests/` and hosted CI;
- concurrent bot jobs;
- partial multi-part Telegram delivery;
- the production → development data transition;
- whether the owner's stop levels are correct.
