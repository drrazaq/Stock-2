# R1 rev5 d02cdfea — CHANGES REQUIRED on two persistent recovery boundaries and release ordering/census

Exact candidate `d02cdfea8a425dbe634514ba68b9a70c3156666a`, handoff [6718588491](https://github.com/drrazaq/Stock-2/pull/1#issuecomment-6718588491). Review-only source checkout; no provider/owner data or real key used. All51 manifest fingerprints independently match. Diff SHA256 is recorded in earlier-closures.json and compared to the supplied manifest. All78 supplied focused tests pass independently; the20 gated cases pass from the exact candidate harness (see verification.json); no borrowed full-suite/operational PASS.

An initial gated invocation incorrectly used the older research-worktree harness (plaintext fixtures/no sealing key):11pass/9fail, with SEALED_KEY_MISSING/SEALED_LEGACY_PLAINTEXT. Its log is preserved as r1-d02-stop.log, not relabeled PASS. The corrected invocation uses the exact candidate test files and synthetic sealed fixtures; no test assertion, source or key requirement changed.

## Previous failures independently retested and closed in those cases

[Previous recovery reproducer](previous-recovery.mjs), [results](previous-recovery.json). Adaptations: seed the new sealed-recover.mjs; replace the obsolete shell-function git override with a real unreachable LOCAL remote, since Node launches git directly. This preserves the intended fault rather than mislabeling an ineffective probe.

- Original combined source/stale-state branch is refused, main remains unchanged, offset9 and NEW position retained.
- Independently isolated DATA-ONLY offset9 versus stale2 case is refused too: see boundaries.json.simpleStaleState.
- Compare-and-delete keeps the advanced checkpoint ref rather than deleting it unmerged. Supplied recovery tests also exercise its clean next pass.
- Unreachable remote returns exit2 and explicit UNKNOWN, not silence/success.
- [Earlier closures](earlier-closures.json): both EIO attempts preserve plaintext; logical segmented export appears once; omitted source/manifest entry fails; bare/incomplete captures fail.

## Remaining recovery blockers — exact synthetic counterexamples

Reproduce with `node boundaries.mjs /absolute/path/to/exact/candidate`. All repositories, keys, positions, refs and files are invented local throw-away fixtures; no production ref writes/deletes or external messages.

1. **Blob equality is not causal lineage (`sealed-recover.mjs`, lineage.has(bMain)).** Recovery contains OLD position after base{}. Main changes positions{}→NEW→{} after the base. Recovery now succeeds and resurrects OLD, because current bytes happen to equal the old base. The stated rule “anything main changed since is refused” is false for a return to prior bytes. Preserve intervening main path changes; permit same-checkpoint succession only with verified recovery provenance, not arbitrary matching historical blob contents. A conservative refusal on unrelated post-base changes is sufficient; no broad owner-state redesign requested.
2. **Merge commits evade data-only provenance (`diff-tree` without merge handling).** Two parents change only data paths. Their merge commit introduces a sentinel.mjs source change. Per-commit diff-tree returns no merge paths; final base..tip paths are not checked against ALLOWED. Recovery publishes the source code, exit0. Check the entire final path set as well as all commit changes, and explicitly validate or refuse merge commits. This is a narrow repair to the previous “no source in recovery” blocker, not a new generic security project.

## Release blockers requiring a concrete corrected order/census

3. **G3b cannot be an entry prerequisite as currently ordered.** RELEASE.md says all entry gates pass BEFORE the window, but G3b dispatches the new r1-migrate workflow; the file is introduced only at B4. [Official manual-workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) requires the workflow on the default branch. No pre-existing/default-branch route is established. Move the proof to an explicitly approved post-code/pre-migration stage with the existing safe stop/rollback, or supply a genuinely available separately reviewed route. Do not ask the owner to install/create a speculative executor or disclose a backup. Existing owner computer/Node availability is not established. A failed vector check is UNVERIFIED; diagnose the private input/vector/source binding before claiming a new K2 secret is the only option. No actual key check/dispatch allowed now.
4. **36-hour created filter does not prove zero old writers.** The capture now checks pages, repository and freshness, but its source query excludes older creations. [Official rerun documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) permits reruns up to30days with original SHA/ref; [Actions limits](https://docs.github.com/en/actions/reference/limits) permit environment waits up to30days. [Workflow-runs REST docs](https://docs.github.com/en/rest/actions/workflow-runs) define created as the creation-time filter. Thus queue24h+execution6h is not proof every possible active writer was created within36h. Require a complete active-run census not truncated by original creation time, or explicitly prove a sufficient scope for this release. Retain bounded pagination, repository/identity, deduplication, fresh capture and unknown-status refusal; do not invent an unsupported control API. No live run inventory or controls were changed in this review.

B6's unknown-publication handling and B7's distinction between keyless structure and complete keyed hosted verification are improved and accepted as written. Key backup validation must be genuinely independently possible and reviewable before migration, never merely asserted from the presence of a secret. The release remains unapproved until the corrected exact package passes review and its owner prerequisites are concrete.

## Preserved limits and non-blocking scope

Existing reviewed deadlines and per-unit attended reconfirmation remain unchanged. No push without an available verifier; missing/partial/late receipt follows the applicable reviewed rollback with writer/UNKNOWN safeguards. Rollback UNVERIFIED/no Enable until complete required receipts and all restoration gates. No unconditional attendance promise or automatic retry/inverse.

STOP watcher/source pins still need refreshed independent release review; passing synthetic tests is not that receipt. Nominal cost projection, immutable-checkpoint count/retention and public residual T2/derived/log/cache/artifact/existing-copy disposition remain explicit approval facts. No licensing/privacy closure, history rewrite, visibility change, key change, real setup, acquisition or deployment performed. Optional broader state/UI redesign and envelope hardening remain outside this correction.

Requested bounded next step: Claude correct the two reproduced recovery cases and the release order/census, rerun the existing checks plus these independent cases, and publish a new exact candidate. Do not request owner approval of a package which has not passed review.
