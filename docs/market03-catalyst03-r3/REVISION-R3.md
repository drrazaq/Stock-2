# MARKET-03 / CATALYST-03 source package: revision r3 (Codex r2 review, R2 residual)

**Author:** Claude, 2 Nov 2026. **For:** Codex re-review.

**Branch:** `claude/market03-catalyst03-r3`. The reviewed r2 (`claude/market03-catalyst03-r2` @ `31b9ff2a`) is unchanged.

**What this revision is:** offline only. No provider calls, credentials, deployment, collection or messages. It contains no batch-2 or `discover.mjs` changes, and does not touch `scan.mjs`, the mentor, the V2 host or Codex-owned files.

## Commits

| Commit | Content |
|---|---|
| `286334306e537d734750288840b7963f9d999fa9` | **Re-pin only.** The reviewed r2 code patch (`cfce2c2c…`, 15 files) applied unchanged to current development `92ebff50c729fd3b39963fd9548dac5265aefd2e`, plus its required matrix. Every runtime file is byte-identical to r2. Development's newer `scan.mjs` (`18a5765c…`) and corrected TRY SMALL fixture are preserved. |
| **`ad3af0f33975356180feb4b036165b56f2c0cdc3`** | **The R2 residual fix.** Two source files (`comeback-lab.mjs`, `comeback-provenance.mjs`) and two test files. |

## The fix

`spyEnvelope(j)` in `comeback-provenance.mjs` classifies a Massive `/v2/aggs` answer as MALFORMED, EMPTY or ROWS. `comeback-lab.mjs` uses it in place of the inline condition.

- **Structure:** `status` OK or DELAYED, `ticker` SPY, and `adjusted` exactly `true` when present. A string `"true"` is malformed.
- **Counts, checked individually:** `queryCount` and `resultsCount`, when present, must be non-negative safe integers. A present string, fraction, negative, `null`, boolean or an unsafe integer is **MALFORMED**: never treated as a missing optional field, never zero.
- **Only justified relationships:**
  - `results`, when present, is an array, and a present `resultsCount` must equal its length;
  - `queryCount` is **not** tied to the array, because queried base aggregates and returned aggregates can differ;
  - without `results`, EMPTY needs positive zero evidence that nothing contradicts: `resultsCount` 0, or (with no `resultsCount`) `queryCount` 0;
  - a positive returned count without results, or no count at all, is MALFORMED.
- **Reason codes:** each MALFORMED or EMPTY answer is recorded as `envelope.reason`, so a reviewer can see why.

**Distinct states kept:**
- valid zero (EMPTY);
- valid populated (OBSERVED);
- malformed (MALFORMED);
- partial (PARTIAL: valid envelope with some malformed bars);
- source failure (UNAVAILABLE, RATE_LIMITED, REFUSED).

**R1 and R3 unchanged:** impossible-date isolation, the separation of response from integrity, retained conflicts, original bars and first conflict records. Endpoint, request scope and one request per run are unchanged.

## Failing before, passing after

| Suite | Re-pin `28633430` (before) | Fix `ad3af0f3` (after) |
|---|---|---|
| Codex harness `spy-envelope-review.mjs`, unchanged (SHA256 `fc2a918795f921943209bace204ef9abedfa7382db52fa66e74fdd77af66c4b4`), also vendored verbatim as `tests/market03-review-codex-spy-envelope.test.mjs` | **3 PASS / 3 FAIL**: contradictory empty counts → EMPTY; `resultsCount: 0.5` → OBSERVED; `resultsCount: "invalid"` → OBSERVED. The negative-count, valid-empty and valid-one-bar controls passed. Same result on the reviewed r2 head `31b9ff2a`. | **6/6** (Node 20 and 22) |
| New `tests/market03-r2-spy-counts.test.mjs` (3 tests) | Cannot load: `spyEnvelope` does not exist before the fix (reported as an import failure, not as per-case failures) | **3/3** (Node 20 and 22) |

**The three new tests:**
1. **A pure table:**
   - 9 structural malformations;
   - 8 invalid values per count field, for both fields;
   - 6 contradictions;
   - 7 valid-zero forms;
   - 5 valid-populated forms, including `queryCount` 5 with `resultsCount` 1.
2. **The actual producer, 15 answers:**
   - 3 valid zero → EMPTY;
   - 2 valid populated → OBSERVED;
   - 1 partial → PARTIAL;
   - 6 malformed-count or structure cases → MALFORMED;
   - 503 / 429 / 403 → UNAVAILABLE / RATE_LIMITED / REFUSED.

   Each run makes exactly one request.
3. **R3 interplay:** after a retained conflict, three malformed-count answers keep CONFLICT, the original bar and the first conflict record; a later valid empty answer resolves nothing.

**R1 and R3 preserved on `ad3af0f3`:**
- `tests/market03-review-r1-r3.test.mjs` 7/7;
- Codex's earlier R1–R3 harness (`tests/market03-review-codex-additional.test.mjs`) 4/4;
- `tests/market03-comeback-spy.test.mjs` 1/1;
- `market03-source-contract` 12/12, `catalyst03-source-to-candidate` 6/6, `discovery-runtime` 14/14, `earnings-source-caller` 3/3, matrix 3/3.

## Full suite

On the exact fix commit, run locally on Node 20.20.0 **as root** as a mirror of `tests.yml`: **257 of 258 files pass.**
- **The one failure** is `tests/research-recovery-publication.test.mjs`. It refuses to run as root, and Codex reports 7/7 under its intended non-root permissions. It is environmental, not a regression.
- **`test/try-small-audit.test.mjs` passes:** development `92ebff50` contains Codex's fixture correction.
- **`test/native-sec-colocated-host.test.mjs` passed in this run,** but it remains a known intermittent timing test in Codex's V2 host area. Earlier unloaded reruns failed 1 in 3 on both a base and a revision, so this pass is not a claimed fix.

## Exact artifacts (development `92ebff50`)

| Artifact | SHA256 | Notes |
|---|---|---|
| Package patch `docs/validation/market03-catalyst03-r3-code.patch` (17 files: r2's 15 + 2 new tests) | `8339f678f322ca47227c8b3b7b1667b15c8783a3c08cc1eb5fcf5feb7e7d7cc9` | Development `92ebff50` → `ad3af0f3`; applies cleanly to `92ebff50` (verified) |
| Fix delta `docs/validation/market03-catalyst03-r3-fix-delta.patch` (4 files) | `dbebf53bbaadafeacdd47470aa364d1c12dbbee663146db2b559d0c7a8da836a` | Re-pin → fix only |
| Manifest `docs/validation/market03-catalyst03-r3-manifest.json` | `4403d5acc5f025dc8e2c354bec76c156be9117f2ab184ca8f0f34aba66f053e2` | |
| Required matrix `docs/validation/market03-ingress-matrix.json` | `a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b` | Unchanged from reviewed r2 |

**The manifest:**
- per-file development → r3 hashes and r2 → r3 hashes; only the 4 delta files differ from r2;
- 12 dependency pins re-pinned to development `92ebff50`, all unchanged by r3, including `scan.mjs` `18a5765c…` and `ignition-watch.mjs` `030b35a0…`.

## Dependencies and held work

- **The packages below keep their current heads until Codex names the accepted source-contract SHA.** `source-contract.mjs` in r3 is byte-identical to r2: this revision changes only the comeback SPY envelope. After that, each is rebased onto the exact accepted development head and its regressions re-run (for batch 2, the four Codex batch-2 cases):

  | Package | Branch | Head |
  |---|---|---|
  | Batch-2 revision | `claude/market03-batch2-r2` | `1873fda4` |
  | `discover.mjs` | `claude/market03-discover` | `b8b0476c` |

- **Status:** MARKET-03 and CATALYST-03 stay OPEN; acceptance 24/40.
