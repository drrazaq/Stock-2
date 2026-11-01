# REPO-03 behavioral review checkpoint — 1 November 2026

REPO-03 remains OPEN. Its unchanged requirement is: “Per-script input/output/side-effect, failure, timing and research-boundary review with linked evidence; targeted regressions for defects. Inventory/syntax alone cannot close this.” No acceptance row closes;24/40 remain accepted. No trading strategy, frozen result, private data, production code or live activity changed.

## Coverage and source scope

[All-script matrix](validation/repo03-behavioral-matrix.json) enumerates305 product scripts:269 root modules,24 tool modules,9 Python helpers,2 repository shell helpers and the browser document. Test/review harnesses are evidence rather than product entry points. Inline workflow programs belong to Claude's ACTIONS-04 audit and are not silently counted as reviewed here.

48 scripts have explicit, hash-matched source-interface contracts covering all six axes:33 tools,2 shell helpers and13 root helpers. Of these,25 retain an open risk or verification gap; the other23 have no new finding in this scoped source review.257 root/browser scripts remain PENDING_SOURCE_REVIEW. This is NOT305 completed behavioral reviews or48 all-path runtime certifications. Existing targeted reviews and the old whole-small-module list remain historical evidence; unverified source drift cannot automatically inherit them.

[Explicit reviewed contracts](validation/repo03-reviewed-contracts.json) describe actual inputs, outputs, mutations/network/subprocesses, failure behavior, clocks and research boundaries. The matrix also records exact line locators, test-name matches and workflow references for every script. These are navigation, not coverage proof. Missing/empty axes, changed source hashes and symlinked source cannot silently count as reviewed. There is no automatic acceptance mechanism.

Reproduce without reading datasets or executing product entry points:

```sh
python tools/repository-audit.py --scripts-only --reviews docs/validation/repo03-reviewed-contracts.json --output NEW_REPORT.json
```

The old default inventory remains available. Its new output must be a fresh path, preventing accidental replacement of a previous audit report. Browser runtime and recursive tools/shell scripts are included in the new mode; the old root-module count was never a complete behavioral audit.

## Coordination with Claude

Read-only remote inspection found claude/independent-reviews still at6465c071d7206e3f089063fa448eb2d1076610dc. It publishes the SIP/observer reviews, not a general REPO-03 or workflow/claims closure matrix. PR1 had no audit handoff comments at this checkpoint. No unseen Claude review is claimed integrated, and no message was sent on her behalf.

Division: implementation owner maintains these script contracts and repairs reproduced script defects. Claude retains the independent ACTIONS/TELEGRAM/workflow and HISTORY claim audits. The two shell scripts are source-described here, but their complete caller/ref/concurrency/privacy semantics remain explicitly assigned to that audit. No workflow dispatch, private-state inspection, migration or financial reconciliation was performed. PR6 remains pinned at64611cdf47dd230026911dde53b98cf7413c17f1; its branch/runtime/test bytes remain unchanged. A separately packaged host-helper companion below changes one dependency on Stock2-safety-fixes; do not assume the frozen PR6 manifest describes that newer tree.

## Reproduced defects and repairs

1. **Offline recovery could redirect plaintext through an output ancestor.** tools/recover-research-artifact.mjs checked only whether the output already existed, then wrote through normal pathname ancestors. A synthetic symlink redirected authenticated plaintext; a deterministic ancestor replacement during directory creation also redirected it. The repaired actual caller anchors directory traversal and file creation to Linux O_NOFOLLOW directory descriptors, uses exclusive file creation, fsyncs files/directories and creates private0700 directories/0600 files. All authentication/scope checks still precede output. Original ciphertext and any prior evidence are untouched. A permissive umask test demonstrates that default directory creation previously allowed broader permissions.7 tests: old source fails3 defect cases,4 controls pass; new source passes7/7. Non-root refusal is tested at the actual effective user, not inferred from mode bits.
2. **Production-package verifier overwrote earlier validation evidence.** tools/verify-incident-production-package.py accepted an existing output directory and reopened node.log/result.json. The actual CLI on a miniature disposable local Git repository reproduced repeat-output and output-symlink overwrite. It now requires a new private output directory before loading/testing a package.2 tests: old source fails both; repaired source passes both, including normal first-run base+patch validation. Historical manifests, logs, patches and deployed code are unchanged.

These are development-only offline-tool repairs, not a production repair or deployment proposal. Recovery requires Linux /proc/self/fd and fails closed if unavailable; it is not an adversarial-input portability guarantee. Failed publication can leave a new partial directory, which remains evidence and is not automatically resumed or deleted. Input-ancestor mutation and additional legacy recovery variants are separate remaining checks, not claimed fixed.

## Source-interface pass

The explicit contract JSON is the per-script review record; its line-linked matrix is the source index. Tools reviewed cover historical account preflight, bounded access diagnostics, native/V1/V2 inactive workers, recovery/encryption, fixture hosts, mentor explanations, evidence auditing and local production-patch verification. Every live-capable tool remains labelled as such; inspecting it is not authorizing it. Research-only does not mean side-effect-free.

The13 root helper contracts cover market symbols, bounded JSON, quote gating, refresh selection, coverage, catalyst integrity, market calendar, legacy SEC clocks, historical production execution metadata, fixed SIP result codes and canonical session selection. No thresholds, entry/exit rules, providers or score calculations were changed. Quote-quality PASS is not an executable fill; legacy date parsing is not native acceptance/first-ingestion proof.

## Tests and execution limitations

- New recovery caller7/7 and existing recovery/artifact/key-proof3 test files PASS locally.
- New matrix behavior7/7 and actual verifier caller2/2 PASS; full Python39/39 PASS.
- Five pure-helper regression files PASS; all293 root/tool modules parse successfully.
- watcher-session tests:6 pure cases PASS locally; the actual child-watcher case could not obtain child output. A separate synthetic child invocation reproduces spawnSync EPERM with status0 and empty stdout. This is an environment restriction, not a passing process test or a confirmed watcher regression. Full actual-caller execution is delegated to ordinary exact-commit hosted CI; no assertion was weakened.
- The existing development test job runs the two new standard-library Python suites explicitly. PR6's workflow/source is unchanged. Base6868d9a had all5 checks/235 Node files PASS; this checkpoint needs its own final exact-SHA CI.

Synthetic fixtures and negative-control logs are preserved locally at /workspace/milestones/repo03-review. No real credential, provider, Telegram, broker, owner holdings or trading record was used.

## Exact remaining queue

[Machine-readable remaining queue](validation/repo03-open-review-queue.json) lists all257 pending scripts and all25 reviewed-with-gap contracts. No owner permission is needed to continue offline review/testing. Start with the real scanner entry-to-exit/command paths (scan.mjs), watcher source/decision/publication callers (ignition-watch.mjs), health.mjs and opportunity-radar.mjs. Reuse their existing exact caller tests and deployment evidence; fill uncovered contracts instead of repeating completed scoped repairs. Root study/lab scripts follow in import/caller order, preserving rejected findings and frozen enrollment/results.

Specific helper gaps include unbounded historical diagnostic JSON reads, pathname races in other legacy recovery tools, unbounded/local Git reads in the old verifier/reconstruction CLI and legacy worker result paths. These are source-visible risks awaiting bounded reproduction or follow-up repair, not proof of a historical incident. Shared PR6 dependencies stay stable pending its independent review; any future change requires a separate patch and renewed compatibility/hashes.

Acceptance can close only when every script has current explicit six-axis evidence, confirmed defects have regression-backed repairs, the remaining audit findings are resolved, and Claude's complementary audit is reconciled. This scope needs implementation/review, not market observations or a strategy endorsement. Natural Monday/DST verification and proposed SIP execution remain separate and pending.

## Separate host-monitor companion finding

First REPO-03 publication53ee12e had4 checks PASS and1 test failure: unchanged PR6 manifest-partial scenario ended before the expected partial manifest existed (run41326383208/job124907084402).9 other host scenarios passed. Preserve that failure; the log lacks the worker's exact early-exit cause, so no retrospective exact cause is asserted.

Independent source/fault review reproduced a concrete monitor race: treeBytes lists .observing/.writer-lock, then their normal removal before lstat/readdir throws ENOENT, setting limitHit and signalling the capture. Four deterministic filesystem race cases fail on the exact old walker body; two safety controls pass. The companion correction tolerates ONLY ENOENT for those two ephemeral directory names. Missing committed files, symlinks, type/permission errors and all original byte/file limits still fail. All6 storage cases pass locally. An additional actual watcher/host/guard/client test injects that precise list/stat race and requires41 uploaded ZIPs, the intended12-byte partial manifest, no capture signal and all332 original producer heartbeats. Its execution requires hosted CI; local loopback restrictions remain.

PR6 stays at64611cdf. [Exact separate dependency correction](validation/repo03-host-monitor.patch), [manifest](validation/repo03-host-monitor-manifest.json). This is an inactive development companion for independent review, not a silent PR6 revision or production change. All original PR6 runtime/tests/dependencies except native-sec-colocated-host.mjs remain byte-identical. Its original manifest is historical and not rewritten. No strategy, clock, quota, V1 or enrollment policy changes.
