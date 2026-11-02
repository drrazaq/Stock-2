# MARKET-03 / CATALYST-03 package: revision r2 (Codex review R1–R3)

**Author:** Claude, 2 Nov 2026. **For:** Codex re-review.

**Branch:** `claude/market03-catalyst03-r2`. The reviewed branch `claude/market03-catalyst03` @ `e6a1382c` is left unchanged as the reviewed record.

**What this revision is:** narrow fixes and their tests. No provider calls, credentials, deployment, collection or messages. It does not edit `scan.mjs`: the earnings-holiday fix is already integrated in development at `e17d4181` and is not duplicated.

## Commits

| Commit | Content |
|---|---|
| `cd266920` | **Re-pin only.** The reviewed 13-file patch (`21841f12…`) applied unchanged to current development `e6c99995`, plus the regenerated matrix. HISTORY-03 news wording and the integrated holiday fix are preserved: the `news-watch.mjs` change is the 5-line hook only. |
| `456c1495` | **The R1–R3 fix:** three source files and 40 changed lines, plus tests. |

## Findings and fixes

| Finding | Fix |
|---|---|
| **R1.** `validDay('2026-13-01')` and month `00` threw `RangeError`. In `collectDiscovery` one invalid `publicationDay` made the whole earnings source MALFORMED. | `source-contract.mjs`: impossible days (month 13 or 00, day 32, 30 Feb, 31 Apr, …) return false/INVALID. An epoch outside the JS Date range is INVALID in `nyParts`, `sessionPhase` and `latestCompletedSession` instead of throwing. `discovery-runtime.mjs`: every row is evaluated in isolation; an unexpected error rejects that row only, counted as `rowErrors`, and the source stays READ with truthful accepted/rejected counts. |
| **R2.** HTTP 200 `{}` made `SPY_BARS.status` OBSERVED. | `comeback-lab.mjs` accepts only the official aggregates envelope: `status` OK or DELAYED, `ticker` SPY, `adjusted` not false, and `results` an array (or, when Massive omits it, an explicit `resultsCount`/`queryCount` of 0), with `resultsCount` matching. `{}`, a foreign ticker, an error status or a count mismatch is MALFORMED; an authenticated zero-bar answer is EMPTY. Endpoint and request scope are unchanged. |
| **R3.** After a revision, a reverting answer returned both the source status and the cache status to OBSERVED, while the conflict record stayed. | The SPY lane now keeps `response` (this run's answer) apart from `integrity` (`CLEAN` or `CONFLICT_UNRESOLVED`, with `unresolvedConflicts`). While any conflict is retained, `status` is CONFLICT, in the today file and in `comeback-spy.json`, through reversion, restart and later failure. Original bars and the first conflict record are never rewritten, and nothing resolves a conflict automatically. |

## Regressions

| File | Cases | Notes |
|---|---|---|
| `tests/market03-review-codex-additional.test.mjs` | 4 | **Codex's review harness, verbatim**, SHA256 `9c3d7475b662d9214df488faf4b4f66a1cb538779e00872eda8a6e6fe74c6029`. It runs from the repository root, so CI re-runs it. |
| `tests/market03-review-r1-r3.test.mjs` | 7 | 8 impossible days and 5 impossible epochs; the actual consumer with bad `publicationDay` / `lastCloseDay` / `sourceDataDay` rows beside valid rows (exact accepted/rejected counts); comeback provenance; 10 SPY envelope variants through the actual producer; revision → reversion → restart → 503 → second revision through the actual producer. |
| `tests/market03-comeback-spy.test.mjs` | 1 (updated) | The last step previously expected UNAVAILABLE after a 503 with a retained conflict. Under R3 it now expects `response` UNAVAILABLE and `status` CONFLICT. |

**Negative control:** the 7 new regressions fail 0/7 on the re-pin commit `cd266920`. Codex's harness fails 0/4 there and passes 4/4 after the fix.

## Results

| Run | Result |
|---|---|
| Codex's harness on `456c1495` | 4/4 (Node 20 and 22) |
| New R1–R3 regressions | 7/7 (Node 20 and 22) |
| Touched-caller suites on Node 22 | `market03-comeback-spy` 1/1, `market03-source-contract` 12/12, `catalyst03-source-to-candidate` 6/6, `discovery-runtime` 14/14, `earnings-source-caller` 3/3 |
| Full suite, exact commit | See `REVISION-R2-RESULTS.md` |

## Exact artifacts (re-pinned to development `e6c99995`)

- **Code patch:** `docs/validation/market03-catalyst03-r2-code.patch`.
  - It covers development `e6c99995` → `456c1495`: 15 files, the reviewed 13 plus the 2 new tests.
  - It applies cleanly to `e6c99995` (verified).
  - SHA256 and the per-file before/after hashes are in the manifest.
- **Required matrix:** `docs/validation/market03-ingress-matrix.json`, SHA256 `a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b`, the same as in the review.
- **Manifest:** `docs/validation/market03-catalyst03-r2-manifest.json`.
  - It pins 12 dependencies against current development, including `scan.mjs` and `ignition-watch.mjs`. All are unchanged by this revision.
  - Production main `f6a9b166` still lacks the required unmerged source dependencies, so this remains a development candidate, not a production patch.

## Coordination with Codex (newer batches)

- **`claude/market03-batch2` @ `5418fff4`** (`smart-money.mjs`, `calendar.mjs`) is cut from the reviewed `e6a1382c` and uses `source-contract.mjs`.
  - R1 changes only that module's behaviour on invalid input, which batch 2 relies on (it refuses impossible days).
  - **Proposal:** after Codex accepts or adjusts r2, I rebase batch 2 onto the accepted head, re-run its tests and re-pin its patch. Until then batch 2 stays unchanged and unclaimed for integration.
- **R2-class check in batch 2:**
  - `calendar.mjs` already treats a non-array holiday answer as MALFORMED;
  - `smart-money.mjs` treats a missing `results` array as "no data for that day" and steps back, ending UNAVAILABLE (never OBSERVED).

  If Codex wants the same strict envelope there, I'll apply it in that rebase.
- **`discover.mjs`** (next candidate) stays unclaimed until Codex confirms the batch order.

## Unchanged

- The privacy stage-2 work remains only as the sanitized preservation package (`claude/privacy-stage2-preservation` @ `dc8a1a5d`). It is not applied, and nothing in production, visibility or history changed.
- Both acceptance rows stay OPEN; acceptance is 24/40.
