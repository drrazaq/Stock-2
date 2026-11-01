# Read-only mentor command — exact current-production review package

Prepared1November2026. **Ready for focused independent review; NOT deployed or deployment-approved.** This is a bounded user-facing explanation of the existing126-session LEADER DIP lane. It is NOT PROVEN / EXPLANATION_ONLY / NOT_ACTIONABLE, not a strategy endorsement or a BUY/HOLD recommendation. No broad development-PR merge.

Production base `f6a9b1668d0591cf24a734034949b96b241fe35b`. Exact seven-file patch SHA256 **`6c6d14dcc9db494583aa9ba997de52ed753720ee72b42f20f9beaa3d5cb2f5fb`**. [Patch](validation/mentor-readonly-production.patch), [all before/after/dependency/caller hashes](validation/mentor-readonly-production-manifest.json), [execution evidence](validation/mentor-release-verification.json), [synthetic Telegram examples](mentor-readonly-examples.md). PR #3 is the sole review package; oldd63d3d1 remains historical ancestry. The prior [v1 manifest](validation/mentor-readonly-production-v1-manifest.json) and patch are retained byte-for-byte; their tests/results are historical, not today’s compatibility proof.

## What the owner can ask

`mentor SYMBOL` or `/mentor SYMBOL`, including one command per line. The reply explains selection and source reference close; next-session-open entry and expiry; recorded fill versus unverified execution; whole-share quantity/notional if available; existing1,000USD ×3-slot limits versus full-notional/no-stop risk; holding/registered126th-session close; unadopted20%overlay; and missing or contradictory evidence. It explains what would change the assessment. No invented entry range, target, price or exit fill. Calendar expiry covers DST and half-day closes.

The frozen base exit has **no fixed target**. The separate20%target study is **NOT PROVEN and not adopted**. Current legacy next-open reminders differ from the frozen close exit; the view says that explicitly. It does not silently correct reminders, trading rules or historical returns. Current ZAD/identity/BBO/liquidity/cost/portfolio evidence remains unverified in this view; a holding is not approval to keep holding.

An existing holding never borrows today’s producer output as original source evidence. Missing archived contracts stay unresolved. The hypothetical known-source-fill example supplies a synthetic archived contract; this release does not add future-fill archival or backfill legacy records. Unheld leads can explain the source/next-open reference, while actual eligibility/fill evidence remains unknown. Other lanes/horizons are unsupported here, not silently mapped to LEADER DIP. This advances one coherent explanation toward the broader trading-mentor goal; it does not complete all horizons.

## Exact file scope and dependencies

| File | Purpose |
|---|---|
| `scan.mjs` | Pure explanation helper, owner-chat route, mentor-only financial-save suppression, malformed-command refusal and multiline slash normalization. |
| `mentor-plan.mjs` | Unchanged original PR3 pure explanation/calendar/fingerprint module: SHA256`c9450320caa3f54abd11d957676ff600a509ebe8014a38b77c7a7596a3ba99c9`. |
| `test/load-scan.mjs` | Copy the two actual local module dependencies into synthetic fixtures; no existing assertion change. |
| `test/mentor-readonly.test.mjs` | Original two actual-caller no-write/mixed-stop controls unchanged. |
| `test/mentor-release.test.mjs` | Ten caller/main-entry/refusal/rejection/mixed-command regressions. |
| `test/mentor-release-plan.test.mjs` | Eight frozen-contract,expiry,DST,half-day,unknown/conflict/example checks. |
| `test/mentor-release-examples.mjs` | Synthetic generator through the actual mentorText caller; no real records, commands or transport. |

Runtime closure: `mentor-plan.mjs` → unchanged `market-session.mjs`; scanner reads unchanged `index.html` and uses existing Node built-ins. No SDK/dependency installation. Existing bot/main workflows and save/private helpers are read-only compatibility pins, NOT patch files. Production already has its own RECORDS section helper correction, so `test/bot-actions.test.mjs` is preserved unchanged and removed from the old patch scope. No watcher,feed,accounting,ZAD,privacy,source/capture or workflow change. The current encrypted-accounting/sale-recovery,existing lane/brake,position-normalization and reply-transport source regions are byte-identical to production.

Existing bindings only: TG_TOKEN/TG_CHAT for the ordinary reply, TWELVE_KEY as the scanner’s existing startup requirement, and optional existing PRIVATE_KEY read path for quantity. No real binding was accessed in preparation. Missing/authentication-failed encrypted quantity is UNKNOWN. No binding/permission change is required.

## Confirmed release defect repaired

On current production plus the old PR3 patch, malformed mentor requests and multiline slash requests fell through to the generic response path and saved normalized financial bytes. Ten new tests yield **7 failures /3 controls PASS** on that source. Repaired source: **10/10 PASS**, including real `node scan.mjs` fast-reply invocation under synthetic loopback-only guards. Invalid mentor requests now refuse, preserve financial bytes and cannot fall back to generic BUY text. Explicit mixed owner stop commands retain their normal mutation; the refusal does not make a false batch-wide no-write claim.

The existing plain/slash/multi/foreign/legacy capsule controls remain useful historical v1 tests. Current-base evidence is fresh, not a claimed recovery of unavailable unpublished work.

## Current production tests and necessary caller coverage

Local Node24.19.0: unpatched production **129/129 files PASS** (128 ordinary workflow files +1 instrument-reference file); production-plus-patch complete loop **131/131 PASS**, plus added plan file **8/8 PASS** and final caller **10/10 PASS** separately:132 distinct current files. Final hosted ordinary CI is expected to execute131 files on production’s registered Node20 target; the unchanged `tests/instrument-type` file is verified separately. Existing two caller tests2/2 PASS. Explicit production watcher gates **11/11 +9/9 PASS**, unchanged. Production data: **425/425 before/after blobs unchanged** in disposable local runs; no decrypted production records or credentials accessed.

All ordinary baseline tests pass on this exact base; old date/gated failure reports are preserved historical evidence. No test assertion or strategy was weakened. Existing basket wrapper remains untouched. A whole-repository audit is not a prerequisite for this package: the manifest pins the actual runtime closure, whole changed scanner, operational caller context and key unchanged regions; actual route/main-entry tests cover intended no-write/source behavior; current production tests cover unchanged behavior. REPO-03 remains open separately. EXEC-03 advances for this one explanatory lane but cannot close its all-delivered-plan requirement.

## Read-only boundary and accepted scope limits

Mentor-only owner requests (valid or malformed), including ignored foreign input, do not change positions,encrypted accounting,trade journal or strategy ledger. They retain normal command/menu offset persistence and existing operational failure logging. Explicit other owner commands in the same batch keep their existing effects. Existing startup migrations are unchanged; all three public migration-complete flags were present at the pinned base and must stay so. No record restoration/reset is permitted.

The bot’s existing fast-reply path uses MODE=chat/BOT_ONLY=1; tests run that exact script entry. Five-minute full ticks independently continue their existing checks; this release neither adds provider requests nor promises the entire bot host becomes read-only. Existing reply transport may retry an ambiguous connection, duplicate a reply, fail partway or consume an offset before confirmed receipt. No exactly-once/durable-delivery claim: the owner can safely repeat a read-only mentor request. These known delivery limits do not approve trades or alter research scoring. Independent review may challenge a directly affected limitation; the unrelated repository audit is not an automatic blocker.

## Concrete deployment decision after independent review

**Additional authority still needed:** Claude’s focused verdict on these exact bytes, then owner approval to apply only the seven-file patch. No production operation is authorized now.

If approved: re-enumerate the current bot/scanner writers read-only; revalidate every before/dependency/caller pin against then-current main; data-only advancement may be preserved, any code/test/dependency change requires reconciliation. Rerun current-main-plus-exact-patch tests. Establish a verified natural recording boundary with final saves/offset evidence; do not cancel,pause,dispatch or infer quietness solely from unchanged files/job success. If a controlled pause becomes necessary, specify it for separate approval. No new protected private-state inspection or recovery is included.

Apply the exact patch as one isolated normal production commit, preserving **all current data/offset/pending-sale/receipt/strategy evidence**; never merge the broad development branch or restore the pinned data tree. Verify seven after hashes, unchanged dependencies/deployed accounting/watcher/feed files and ordinary exact-commit CI. No manual workflow dispatch or real test message. Passive verification uses ordinary service and a naturally occurring owner request: correct NOT PROVEN explanation/refusal, normal offset/save evidence and no mentor-caused financial writes. If the owner has not naturally requested it, response verification stays pending.

Rollback: normal revert of only the isolated mentor code/test commit after compatibility review, at the same safe recording boundary. Preserve all data and offsets; no command replay,financial recovery or old-data reset. Existing deployed operational repairs remain intact. If newer code imports the module or edited a patched file, stop and reconcile instead of blind revert.

Remaining release gates are the exact focused review, explicit deployment approval and then safe boundary/current compatibility. No live data, new entitlement or strategy proof is needed to publish this read-only explanation. Those missing items continue to block actionable trading recommendations, which this feature does not provide.
