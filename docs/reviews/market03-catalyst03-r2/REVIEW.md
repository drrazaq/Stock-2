# Source contracts r2: independent review

**CHANGES REQUIRED; not integrated.** Reviewed head `31b9ff2ade81608436ddc81835b674e47de0f540`, branch `claude/market03-catalyst03-r2`, base `e6c99995b38602b187cee839c5275c0700f7c1e0`. Current-development compatibility candidate uses `58be2ace82e9eceab4f880c057e1604dce94bdd8`. No whole-branch merge, producer ownership change or production application occurred.

Exact code patch SHA256 **`cfce2c2c208768295baf670fc1bf18981d788b9e83822c7e454edfff50bf627b`**; manifest **`d40f8af6bbb89263f98b246d885bf9c80189fbac644c9762dbfbdba6a0f58705`**; required matrix **`a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b`**. Fifteen patch files plus the separate required matrix. Base/after hashes and all twelve original dependency pins independently match. The patch applies cleanly over current development in a disposable checkout.

## Findings

| Finding | Result | Independent evidence |
|---|---|---|
| R1 — impossible dates and row isolation | PASS for reviewed scope | Impossible dates/epochs reject without crashing; actual discovery keeps two valid earnings rows beside three bad rows, with accepted/rejected counts. Technical buildup keeps its valid neighbor too. Actual comeback provenance with an impossible date withholds rather than throws. READ denotes a read file, not complete source coverage; rejections remain explicit. |
| R2 — truthful SPY response envelope | CHANGES REQUIRED | `{}`/wrong symbol/basic empty/valid supplied cases pass. Additional actual-producer cases below still falsely establish EMPTY or OBSERVED. |
| R3 — unresolved revisions | PASS for reviewed scope | Original bars and first conflict remain unchanged through revised answer, reversion, another process, HTTP 503 and a second revision. `response` stays separate from CONFLICT integrity/status. This verifies the tested response failures, not arbitrary disk corruption or conflict resolution. |

Residual R2 defects, reproduced on both exact head and selected current-development candidate:

1. `{status:'OK',ticker:'SPY',queryCount:0,resultsCount:1}` without `results` is **EMPTY**. The explicit positive returned count contradicts absence; it must not establish genuine emptiness.
2. A valid one-bar array with `resultsCount:0.5` is **OBSERVED**. The count must be a nonnegative integer and agree with the returned array when present.
3. The same array with `resultsCount:'invalid'` is **OBSERVED**. A present malformed count is not a missing optional field.

The condition only checks array/count agreement when `Number.isInteger(resultsCount)` is already true, and the no-array condition accepts either zero count without checking the other. Correct those checks without requiring `queryCount === results.length` for all aggregate requests: queried base aggregates and returned aggregates can have different meanings. Validate documented fields individually and enforce only justified relationships. Preserve valid omitted-results zero responses and valid arrays, one request per run, original bars/conflict evidence and endpoint scope.

[Desired-behavior actual-producer harness](spy-envelope-review.mjs): **3 PASS / 3 FAIL**; the negative count and genuine EMPTY/OBSERVED controls pass. Failed assertions require corrected behavior; they are review evidence outside the passing automatic suite, not assertions preserving a known defect.

## Execution and baseline diagnosis

All independent local runs used **Node 24.19.0, UID 1000 (non-root)**, synthetic files and loopback services only. No real credentials, provider, message or experiment.

- Exact r2 targeted caller/helper/recovery suites: **54/54 PASS**, including all seven original permissions regressions under intended non-root conditions.
- Selected patch plus required matrix over current development, preserving its newer scanner and fixed fixture: **70/70 PASS**.
- Eleven supplied review regressions against the pre-fix re-pin commit `cd26692041f5ca70d72590295e66e29166a9dd44`: **0 PASS / 11 FAIL**. Both old failures and corrected controls are retained locally.
- Unmodified original `try-small-audit` test on base **and** exact r2: **15 PASS / 1 FAIL**, case 1b. At **2 November 2026 04:50:15 UTC**, New York's day is **1 November**; `day(10)` is **23 October**, and the actual scanner `sessionsAfter` returns **5**, not more than 5. The production rule correctly accepts that boundary; the fixture does not exercise its stated stale case.
- The already-published exchange-session fixture, copied as a separate review test without changing either scanner source: **16/16 PASS against both**. It asserts six-session rejection and one-session acceptance. Current development keeps this existing fix; no assertions or strategy rule are removed.

Claude's full-suite/Node 20/22 results remain attributed to her. This review does not call her root-run failure a waiver or claim an independently repeated full suite on r2. Any hosted CI is separate from the above local executions. Node 22 is not a new acceptance requirement.

## Protected files and coordination

The original manifest's scanner pin is older than current development: base/r2 `541f343c…`, current `18a5765c…`. This is the published HISTORY-03 failure-isolation/wording and unique-loader work; it is preserved, not restored. All other eleven dependency pins still match current development, including `ignition-watch.mjs`. Neither scanner, watcher, workflows, data nor frozen results is changed by the selected patch. The already-integrated earnings-holiday repair remains in the unchanged scanner. The news diff is only its five-line revision-archive hook and preserves newer news wording. Per-file pins and results: [evidence JSON](evidence.json).

`discover.mjs` is available for Claude's next isolated ingress repair; Codex has no edits/candidate for it. Claude must publish her ownership claim before editing. Existing smart-money/calendar ownership remains hers. Do not rebase them onto an allegedly accepted r2 yet: fix the three count cases, re-pin, review, then rebase onto the exact accepted development HEAD and rerun the four batch-2 regressions. No duplicate earnings-holiday repair.

MARKET-03 and CATALYST-03 remain OPEN. These scoped passes do not complete the all-provider normalization or all-source identity/materiality/revision matrices. Acceptance stays **24/40**. Mentor approval is unaffected; deployment still requires its own natural recording boundary and final persistence proof.

Replay: `REVIEW_TREE=/path/to/exact-or-candidate node --test docs/reviews/market03-catalyst03-r2/spy-envelope-review.mjs`.

## Post-review CI fixture correction (separate from r2)

Development evidence head `dabbcb5d` failed the full hosted suite at 05:02 UTC in historical TRY SMALL fixtures **1 and 3b**, while 253 other test files passed. Unchanged development `58be2ace` reproduces **14 PASS/2 FAIL**: after New York midnight, 23 October is six sessions old, so the real caller correctly withholds the entry and creates no ledger row. A clock fixed at **2 November 05:10 UTC** reproduces it. This is distinct from original case 1b's pre-midnight five-session error.

Only `test/try-small-audit.test.mjs` is corrected: freshness fixtures use known exchange-session dates, keep original price/stop/hold/exclusion assertions, and add a positive exclusion control so stale data cannot make that test pass vacuously. The existing six-session rejection/one-session acceptance assertions remain. **16/16 PASS before and after NY midnight**, and **16/16 against unchanged scanner source**. No scanner/strategy/mentor patch changes.

Further actual-path checks: earnings producer → persisted output → reader retains two valid neighbors beside three invalid dates, status PARTIAL_OR_UNKNOWN with three rejections, on both candidates. Matrix tests are **3/3 PASS on exact and staged current candidate**. An initial unstaged candidate reported only a file-count difference (297 vs293): its four added source/tool paths were absent from `git ls-files`; staging exact selected paths fixed the review setup without changing code/assertions. Selected current candidate with the corrected existing fixture and matrix tests: **73/73 PASS**. Residual R2 harness remains **3 PASS/3 FAIL**, so integration is still refused.
