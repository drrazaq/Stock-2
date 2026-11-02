# Source contracts r3 — independent scoped PASS

**PASS for selected development integration. No production approval or whole-row acceptance.** Author package head **`ac7990dea013d8d9f778db5b713b093aa853c160`**, code head **`ad3af0f33975356180feb4b036165b56f2c0cdc3`**, base **`92ebff50c729fd3b39963fd9548dac5265aefd2e`**. Original r2 remains unchanged as the failed review record. Only selected code/tests plus the required matrix are integrated; no branch merge or copy of Claude's ledger/handoff history.

## Immutable verification

Independently rehashed the published r3 package patch **`8339f678f322ca47227c8b3b7b1667b15c8783a3c08cc1eb5fcf5feb7e7d7cc9`**, four-file fix delta **`dbebf53bbaadafeacdd47470aa364d1c12dbbee663146db2b559d0c7a8da836a`**, manifest **`4403d5acc5f025dc8e2c354bec76c156be9117f2ab184ca8f0f34aba66f053e2`** and required matrix **`a2e21c9a2a6ea2b0f444c48cd3287ab8c576bc43d7b70c487b9f9c2b1491255b`**. All before/after entries and twelve current-development dependency pins match. The source-only 17-file patch applies cleanly over current development, with its matrix as the eighteenth file.

Published runtime integration checkpoint: **`75c53a802befbaebfaeb52cb4790893746420b5a`**. Its runtime bytes match the reviewed author code. A subsequent test-only DST fixture correction is explicitly separated below. [Final selected patch](../../validation/market03-catalyst03-accepted-code.patch) SHA256 **`0b8a13382b0f88812c29895ee509290457996ad0b3a997c281fed049fd7a5769`** and [integration manifest](../../validation/market03-catalyst03-accepted-manifest.json) give before/after/protected hashes and the three test-only differences. The manifest is for development, not a production hotfix.

Scanner `18a5765c…`, watcher `030b35a0…`, current TRY SMALL session fixtures, mentor implementation, V2 host and other protected dependencies stay unchanged by the source integration. The news change remains only its reviewed revision-archive hook; newer wording survives. The integrated earnings-holiday fix is not duplicated. Workflows, financial data, frozen results and original 40 criteria are untouched. No activation, new endpoint, live collection or strategy change.

## Findings closed within this package

| Finding | Verified corrected behavior |
|---|---|
| R1 | Impossible dates/epochs do not throw through neighboring rows. Actual producer and persisted-reader checks retain two valid earnings reports beside three invalid dates, with incomplete producer coverage and rejection counts. File READ is not a claim that the whole source was complete. |
| R2 | Present counts must be nonnegative safe integers; contradictory empty evidence and noninteger/nonnumeric counts are MALFORMED. Genuine zero is EMPTY; valid rows become OBSERVED or PARTIAL according to bar validity. Wrong ticker is MALFORMED with structured `envelope.reason=TICKER`, distinguishable from shape/count errors; it is never accepted as SPY. `queryCount` is not incorrectly equated to returned length. |
| R3 | Response and integrity remain separate. Original bars/first conflict survive reversion, a new process, HTTP failure, malformed count answers and a later genuinely empty answer. No automatic conflict resolution or historical replacement. |

The three former residual R2 cases fail on reviewed r2 and pass on r3: the independent actual-producer harness changes from **3 PASS/3 FAIL to 6/6 PASS**, retaining the genuine-empty/populated/negative-count controls. One request per actual producer run remains verified. OBSERVED describes the answer; it does not establish identity beyond the requested ticker, tradability, causal materiality or trading profitability. Massive Stocks Starter remains 15-minute delayed; a structurally valid daily-bar answer is not proof of a fully settled close, real-time discovery, broad SIP access or an executable fill.

## Independent execution

Local **Node 24.19.0, UID 1000 non-root**, synthetic inputs and loopback only:

- Exact r3 caller/helper/reader/matrix/TRY SMALL suites **82/82 PASS**.
- Selected current-development integration **82/82 PASS** before the separate fixture correction; final integrated group **83/83 PASS** after it.
- Independent count harness **6/6 PASS**. Original non-root recovery/publication regression **7/7 PASS** within the group; no waiver/assertion removal.
- HISTORY source-anchor/rendering/loader preservation **11/11 PASS**; 100 records/151 locations retained with source anchors updated to the new runtime commit. ERRATA-01 and policy TODOs unchanged.
- One initial absolute-path harness invocation used the old active checkout as cwd, so its cwd-based import could not find `source-contract.mjs`. The log is preserved; replay from the documented exact checkout root passes. This is a diagnosed invocation error, not a hidden code-test failure or a retry of an unexplained intermittent result.

Claude's reported Node 20/22 and full root executions are her evidence. Hosted ordinary CI is checked separately on the exact published runtime and final integration/documentation SHAs; it is not replaced by these local groups. Her reported colocated-host timing intermittency is not claimed fixed by this source repair, and any actual hosted failure must remain visible rather than be retried into a PASS.

## Separate synthetic DST fixture correction

Three newly integrated SPY tests used a synthetic daily-bar time `04:00Z` for a declared New York date. For **2 November 2026**, that instant is **1 November New York** after DST. The winter fixture-day assertion reproduces FAIL before repair. Only the three test files listed in the manifest change to `05:00Z`, which belongs to the intended New York day in both tested regimes; a shared actual fixture factory is checked against `parseSourceTime` for 30 October and 2 November. All original bar/revision/first-conflict assertions remain. These are synthetic date fixtures, not a claim about genuine captured feed bytes or unchanged historical research.

## Handoff and remaining acceptance gaps

Once exact-commit CI passes, provide Claude the **final accepted development HEAD** for rebasing **both** `claude/market03-batch2-r2` (`1873fda416b3fd0607afef91d0b6b05c70c0b2da`) and her claimed `claude/market03-discover` (`b8b0476ca40b78f96d2e5199487436acd3d28d38`). Their code is not integrated here. Preserve her published discover ownership; Codex has no concurrent edits. Re-run her actual-caller suites and the four earlier smart-money/calendar review cases after rebase, then repin exact patches/dependencies. This PASS must not be extended to those unreviewed batches.

**MARKET-03 and CATALYST-03 remain OPEN.** The matrix classifies 87 decision ingresses and marks 27 reviewed; those labels are not complete independent verification. Whole-provider symbol/units/session/corporate-action/ticker-change coverage, complete eight-lane identity/publication/ingestion/revision/persistence/materiality evidence and remaining consumers still need review. Historical authenticity and live/prospective observations remain separate. No row is accepted merely because tests pass: **24/40, 16 open, zero new closures/admissions**.

The [mentor maintenance procedure](../../mentor-bounded-maintenance-proposal.md) is preparation only. Main advanced in data only to `49103932`; approved mentor source/dependency pins still match, but that commit is not final-run save/offset proof. No production deployment or workflow operation occurred.
