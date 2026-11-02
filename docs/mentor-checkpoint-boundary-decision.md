# Mentor: alternative committed-state boundary — decision only

**Prepared 2 November 2026. NOT APPROVED OR EXECUTABLE UNDER THE EXISTING BOUNDARY APPROVAL. No action taken.** Preserve development `54eb49fe2819e7710aaba308c2c3acb3262e861a`; stop further receipt implementation for this release. The inactive receipt package is unchanged. This is an alternative to its installation, not a claim that it proves an old run. The historical 13-hour maintenance window is not proposed or approved here.

## The exact decision

A defensible **forward-preservation** alternative exists for this read-only, code-only release: drain affected writers, take the latest committed state as the baseline, and prove the release/backout changes none of that state. It does **not** prove the old bot saved everything it intended or acknowledged. It requires explicit revised owner approval accepting that uncertainty; it must not be executed using the existing natural-boundary approval alone.

Only one evidence condition changes: replace the unavailable final-runner-intent/local-offset-to-commit attestation with a **committed-checkpoint preservation boundary**. Keep terminal writer drain, no active cancellation, source/dependency compatibility, exact patch identity, disclosed test results, no data writes, ordinary CI, bounded controls and restoration. No financial correctness, cleared pending transaction, queue preservation or exactly-once delivery is newly asserted. No new protected check, receipt host, workflow YAML, secret binding or collection is included. Known actual recording/transaction errors still block; UNKNOWN history is not relabelled PASS.

If the owner requires the original authenticated final-runner proof, **there is no deployable alternative under that condition**: the original pre-save witness/final runner files were not retained. Current commits, logs, a fresh protected check or a newly instrumented future run cannot recreate them. Do not expand infrastructure or reconcile financial records to manufacture the evidence.

## 1. Available evidence and its limits

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| GitHub run/job metadata: runs41327224130/job124919084401 and41354916865/job125004035374 completed SUCCESS | Those platform jobs ended; both normal bot steps completed | Last intended state, successful saves, offset/command correctness or delivery |
| Artifact listings for both completed runs returned no artifacts | No retained run artifact was available in those inspected listings | A lost runner witness, or proof that no observations/commands occurred |
| Current metadata: run41384810187/job125091176540 IN PROGRESS, successor41403747096 PENDING, 2Nov08:25UTC/11:25Kuwait | No current natural quiet boundary; a successor can start | Enabled workflow states, final persisted state or command processing |
| Main491039321ed9ab45e4850ccef46e9f6a737a9e56, immutable Git objects and source manifest | Current committed checkpoint and source identity; mentor patch compatibility at inspection | Whether earlier local state was discarded before a commit |
| Actual bot/save source and synthetic failures | Save success/clean final checkout can coexist with lost intended state | That this loss occurred in production |
| Public logs/echoed shell source | Only their actual contents and operational context | An echoed error literal is not an executed error; absence of visible errors is not successful persistence |
| Scoped tests, independent v3 review at25a85000 and hosted CI | Read-only mentor behavior and unchanged financial/reply/lane code within tested scope | Profitability, executable prices, complete production operation or historical command preservation |

The evidence JSON records the inspection sources. First-page artifact/job wrappers are sufficient for the observed small responses; any unexpectedly full page or new attempt requires complete pagination before relying on absence. At execution, enumerate every active/queued/pending/waiting/requested run and all jobs/attempts; do not infer execution from creation/run_started_at alone.

## 2. Historical evidence that cannot be reconstructed

No retained original pre-save intended-state witness or original runner's final local state/offset was found for the inspected ended bot jobs. The bot redirects processing output to an unretained local run.log; its inline save can return success after logging a failure. A lost original runner filesystem/in-memory witness cannot be recreated from Git. A commit proves its own bytes, not discarded bytes; a Telegram acknowledgement cannot be inferred from an offset.

Consequently, these remain UNKNOWN: whether every fetched/acknowledged command was durably recorded, whether an earlier intended financial update was discarded, whether replies were delivered, and the age/content of unconsumed updates. Do not backfill records, reset offsets, replay commands, ask for a fabricated trade, or call getUpdates to investigate. New receipts and protected consistency checks could assess their own inputs, not establish the missing historical facts.

## 3. Exact unchanged release and tests

Approved head: **25a85000b076c4da649634606467e71b577bc75c**. Patch SHA256: **1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7**. Manifest SHA256: **13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250**.

Exactly eight paths: mentor-plan.mjs; scan.mjs; test/load-scan.mjs; test/mentor-m1-m3.test.mjs; test/mentor-readonly.test.mjs; test/mentor-release-examples.mjs; test/mentor-release-plan.test.mjs; test/mentor-release.test.mjs. No receipt, source-contract development repair, optional wording change, data file or workflow is included. [Immutable scope/inverse evidence](mentor-persistence-receipt/mentor-scope-reconciliation.json); [source/dependency pins](mentor-persistence-receipt/production-compatibility.json).

Baseline disposition, not a waiver by inference: ordinary current-clock TRY SMALL remains14PASS/2FAIL (expired fixture cases1,3b) on BOTH production and production+mentor. With only that unchanged historical test process pinned to26Oct2026, its16 original assertions pass; all other files use the current clock. Baseline129files and exact-mentor133files pass in that explicit replay. This is not an ordinary all-green production suite. Independent Claude v3 and older hosted results are dated evidence, separately attributed. Development54eb49fe has six exact-commit CI checks PASS, Node20.20.2/263files, Python7+2, receipt33/33 and30 consecutive host controls. Those are not substituted for production-plus-exact-patch testing at release time.

The revised decision must explicitly accept these two reproduced baseline fixture failures while requiring zero new regression and unchanged assertions; otherwise production testing remains a blocker. Do not change the approved patch to repair the fixture or alter any strategy. The existing all-green development fixture correction stays separate.

## 4. Bounded operational procedure, only under revised approval

### Before any suppression

An authorized operator must have a supported interface that can read and restore both workflow states, an independent restoration route (for example the owner's authenticated Actions UI), and normal code-publication capability. This connector's generic workflow-state endpoint returns HTTP400 INVALID_ARGUMENT/unsupported endpoint; this is a tool restriction, not evidence that the owner's account lacks permission. Claude's capability audit remains pending. No secret, permission change or alternate unauthorized route is proposed.

Exact control requests, for a separately authorized supported operator only (not issued here):

| Method | GitHub REST path | Scope |
|---|---|---|
| GET | `/repos/drrazaq/Stock-2/actions/workflows/bot.yml` and `/repos/drrazaq/Stock-2/actions/workflows/main.yml` | Capture definitions/states and verify readback; no financial data |
| PUT | the same two workflow paths followed by `/disable` | Temporarily stop new starts only for originally enabled workflows |
| PUT | the same two workflow paths followed by `/enable` | Restore only those originally enabled; no schedule/YAML edit |
| GET | both workflow paths and complete run/job status pages | Verify exact restoration and drain; no dispatch or cancellation endpoint |

Use an existing authorized owner/operator interface with Actions write capability for these state changes and contents write capability for the isolated code commit. A missing capability is a stop condition, not permission to change repository permissions, add a token/binding or bypass this connector's restriction. The normal authenticated Actions UI may serve as the pre-established restoration interface. Its availability must be verified before starting.

Finish patch/hash verification, fresh production baseline/patch tests, independent review and code-only rollback rehearsal before suppressing starts. Confirm no other operator is deploying or writing financial records during the held boundary. Re-enumerate actual source callers; current production directly invokes scan.mjs from bot.yml and main.yml. New affected writers require review, not a broader automatic pause.

**Proposed eligibility window: 3November2026 02:00–03:00UTC /05:00–06:00Kuwait. NOT APPROVED, not a prediction of a run transition.** It follows the scheduled21:30UTC scan and leaves time before the next13:10UTC scan. Skip it if prerequisites or a suitable slot are absent. Do not carry this date forward automatically.

To minimize suppression, choose a fresh slot with **at most one active bot reply job, no active scanner, and no already-accepted pending/queued/waiting/requested affected run**. Prefer less remaining active time where actually available. Record the job's real start and350-minute hard timeout. SUCCESS/actual terminal state, not estimated loop completion, is required later. If no such slot appears within the eligibility window, do nothing; do not cancel a successor to create one.

### Hold and drain

At T0, capture both workflow states and immutable definitions. Disable new starts only for the originally enabled bot.yml and main.yml, then read back states. Leave originally disabled workflows disabled; unexplained concurrent maintenance is a pre-start blocker. Immediately re-enumerate all affected statuses/jobs after both controls take effect. A newly accepted successor or unexpected writer means **abort before deployment and restore captured states**; no cancellation or expanded drain is authorized. This closes the check/disable race without pretending it cannot occur.

Allow the one already-running bot to finish naturally, serving normal requests throughout its ordinary run. Do not change its code, cancel it, read its secrets or consume Telegram updates. A failed/timed-out/uncertain selected drain job blocks deployment; restore controls with old code unchanged. Complete enumeration must show every affected job terminal and no accepted successor. Unrelated watcher/research workflows remain untouched.

**Hard limits:** latest drain decision is the earlier of T0+350minutes and that job's actual350-minute job deadline. Lack of successful natural completion means abort, never extend. After a successful drain, reserve at most30minutes for checkpoint verification, deployment/ordinary CI and restoration: make the release/backout decision within20minutes, reserving10 for code-only abort and control restoration. Absolute restoration deadline is **T0+380minutes (6h20), never13hours**; latest possible under this proposed start window is3Nov09:20UTC/12:20Kuwait. Actual hold is remaining run time plus the final phase, not a mandatory6h20 wait.

### Committed checkpoint and code publication

Take fresh main M after the verified drain. Retain its commit identity privately with operational metadata. No final-runner proof is inferred: **M is the accepted committed baseline only under the revised decision**. Check all approved source/caller/dependency pins, expected file presence/modes and known explicit failure evidence; stop on a new error, source mismatch, new financial writer or unknown current control state. No decrypted-state audit or claim that pending intents are clear is made. Preserve all current state, including any existing pending evidence. Known unresolved transaction problems require separate reconciliation, not this release.

Construct one normal commit D whose parent is M, applying only the approved patch. Verify exactly eight paths changed and all manifest after-hashes match. Prove every other tree entry is identical, especially data/, encrypted records, offsets, pending intents, journals/strategy ledgers, settings and workflows. Export only PASS/BLOCKED/ERROR and non-sensitive run/commit/timing metadata; never private values or state fingerprints. Publish with an expected-head lease/normal non-force push. Do not merge the development PR.

If unrelated publication advances main, permit at most one bounded refresh: preserve the new parent in full, recheck all pins and the boundary, and reapply only the exact patch. A financial/source/dependency change or unexplained writer invalidates the attempt. Never overwrite a concurrent change or hot-rebase another process's checkout. Verify resulting eight hashes and ordinary push-triggered CI on D; no manual dispatch.

### Restore or abort

Before deployment, an abort leaves accounting/mentor source and all data unchanged; promptly restore the captured workflow states. It does not need a fabricated persistence PASS to resume the pre-existing unchanged service. If D was published and fails checks or cannot obtain a terminal CI result within the20-minute release phase, the revised approval must authorize the exact code-only inverse as a normal commit against then-current main. [Inverse SHA256](mentor-persistence-receipt/mentor-scope-reconciliation.json): **15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521**. Verify original eight before-hashes/absences and zero changes to any state/workflow path. Do not reset main, restore M's data, replay messages or erase transaction evidence.

Restore originally enabled controls after verified success or verified return to the original source; leave originally disabled controls unchanged, and read back both states. A rollback CI run may remain pending after exact old-source/hash restoration; report it rather than leave service suppressed just waiting for another hosted check. A source conflict or failed restoration is an immediate operator incident: use the pre-established authorized restoration interface, report exact state/actions, and do not silently extend the window or overwrite code/state. A deadline cannot guarantee restoration through a platform outage; that residual risk must be accepted before starting.

## 5. Service impact and passive checks

New starts are suppressed; the already-active bot continues normal service until it finishes. No queued run is cancelled. The planned silent interval begins at actual final bot termination, not T0. Post-drain control suppression is capped at30minutes, but **actual bot unavailability also includes the next ordinary30-minute schedule opportunity and unbounded GitHub scheduling delay**; it is not a30-minute availability guarantee. Record actual last-stop/next-start UTC/Kuwait times and skipped scans as unavailable coverage. If no ordinary bot resumes within45minutes of restoration, report an incident without manual dispatch or test message. The proposed window avoids scheduled daytime/21:30 scans only if actual jobs/calendar remain as inspected.

No Telegram queue probe is made. Existing updates can already be old; finite provider retention means a short gap cannot guarantee their survival. A later job start or successful commit does not prove commands processed. Passively verify ordinary source revision, normal saves, unchanged state continuity where observable and naturally occurring mentor usage; unobserved delivery, queue processing and user commands remain pending. LEADER DIP is NOT PROVEN; tested-close versus next-open mismatch stays explicit. No strategy, ZAD, provider, accounting or privacy change.

## 6. Exact revised approval offered for review

This is a bundled decision proposal, **not a claim of permission already granted**:

> Accept the current committed-state boundary for the unchanged mentor25a85000 eight-file patch/hash1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7, acknowledging unrecoverable old-run intended-state/offset/delivery uncertainty and the explicitly reproduced baseline fixture disposition. Authorize one supported operator to disable/restore new starts of bot.yml/main.yml only under the zero-successor/single-active/off-hours gates and6h20 absolute cap above, drain active work naturally, publish only the exact patch, and perform its exact code-only inverse on the listed failure/timeout conditions. Restore captured states without indefinite suppression. Authorize no cancellation, dispatch, receipt installation, workflow YAML edit, protected execution, financial reconciliation, data restoration, message/provider call, secret/permission change or trade.

If this revised evidence condition is unacceptable, retain the original approval unchanged and **do not deploy**. The indispensable blocker is the missing original-run persistence witness; public-log inference cannot satisfy it. If accepted, supported workflow-control/restoration access and the fresh operational gates must still be established before any action. Nothing in this document authorizes execution now.
