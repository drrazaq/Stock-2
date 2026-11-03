# Watcher-only deployment preparation — HOLD

3 November2026. **Not an approval request and not deployment authorization.** Owner confirmed the review was received only in chat; no published review commit/path or separate reviewer's execution evidence is available. Deployment remains pending those exact artifacts. Author tests and hosted CI are not substitutes for independent reviewer execution.

## Immutable scope

- Exact reviewed-candidate artifact: [production.patch at7f579b23](https://github.com/drrazaq/Stock-2/blob/7f579b23a487cdf84d80b50bab1e04e0b170cf6e/docs/nov2-watcher-scheduling/production.patch).
- Full patch SHA256: `781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e`.
- Original ten-file manifest SHA256: `5d9f8c443fc3b04cdff0231bcbfbedf2b8cd08f3037546b43d086ca847a970d7`.
- Exact code-only inverse SHA256: `3f628c2e8a2d3788712aa94250703d83657268b11e3bcc8d8d911a12732c3c86`.
- No patch, manifest, runtime, test, workflow or inverse byte is changed by this preparation. ACTIONS and mentor are excluded.

Fresh production `eae28a73cde999fd10852aea3707e705dcce3421`: [all37 before/dependency checks](fresh-main-compatibility-20261103.json) match. The patch applies, all ten after hashes match, the entire data tree is unchanged, and applying the inverse restores the exact original tree. This is a disposable-index proof, not a production mutation.

## Correct test accounting

See [ordinary versus replay evidence](../ordinary-vs-replay-release-counts.json). Current production has131 tracked test files; this patch adds two test files, yielding133. Ordinary-clock current main is130/131 files; ordinary main+watcher is132/133. The sole failed file in both is TRY SMALL,14cases PASS/2FAIL, cases1 and3b. No preload or historical clock was used for those new ordinary runs.

Earlier131/131 baseline and133/133 watcher results replayed ONLY that TRY SMALL file with the explicitly historical fixture clock. They are controlled regressions, not ordinary all-green production results. The older df0c9638 base had130 files, so its watcher132 and watcher+mentor136 controlled results belong to that old base. Current main+watcher+mentor was not rerun and must not inherit136. The38 scheduling/guard cases are cases across three files already in the full suite, not38extra files. The20 actual B1/B2 cases are explicit gated caller controls. Hosted7f579b23 CI7/7 and268/268 files cover the wider DEVELOPMENT tree; they are not separate reviewer or production-plus-patch execution.

## Review and attribution limitations — unresolved evidence

The owner reports Claude reviewed the781f6644 package in chat. Until the actual report is published/pinned, this document cannot claim its exact verdict, tested base, commands, failure disposition or separate reviewer's results. A publication request is recorded in PR1 comment6601091306.

The owner also mentions an optional run-attribution hole. Its exact description and evidence were not supplied; **it is not silently accepted, fixed or assigned a guessed cause**. This is an explicit unresolved limitation of this proposal. The report must identify it and its effect before approval text can be finalized. Existing proven attribution limits remain: job start is not process/observation start, run.head_sha can differ from the actual checkout, and guard dispatch acknowledgement does not prove causal execution. Archive source identity and actual job logs remain necessary. Preserve the reviewed patch unchanged; any optional repair would be a separate scope.

## Proposed natural off-hours boundary — not scheduled

Propose **Tuesday3November2026,21:30–22:00UTC**, corresponding to **Tuesday16:30–17:00 New York** and **Wednesday4November00:30–01:00 Kuwait**. This is after the regular close and the configured watcher end, not a claim that extended-hours markets are closed. No job, message, reminder or workflow has been scheduled.

This window is conditional, not a certified boundary. At entry and immediately before any future approved push, enumerate complete active/queued/pending/waiting/requested watcher runs and every job/attempt; unknown or incomplete listings block the operation. All watcher work must have finished naturally. Verify each observed session/attempt's final JSON/progress/shadow archives, publication and retained artifact evidence, canonical selection and message-state persistence. A successful job alone is insufficient. Partial coverage or SEC failures do not by themselves invalidate successful preservation; record them honestly. No cancellation, pause, suppression or dispatch is included. If any watcher is active, pending or lacks final persistence proof, abandon this window and return a fresh assessment rather than deploying around it.

Other data writers may advance main; preserve every intervening data commit and revalidate all37 pins on the fresh parent. Do not hot-rebase active watcher source, force-push, restore data/offsets or change financial code. An unsettled write outcome blocks retry, rollback takeover and VERIFIED clearance. Only positive applied evidence or a definitive rejection of that exact request settles it.

## Conditional approval template — NOT READY TO USE

The review and optional-limitation evidence above must be filled and verified first. This template is not a request to approve an unknown review:

> I approve only the ten-file watcher patch SHA256781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e and original manifest5d9f8c443fc3b04cdff0231bcbfbedf2b8cd08f3037546b43d086ca847a970d7, after the proposal contains the verified commit-pinned independent review, separate reviewer execution evidence and exact acknowledged attribution limitation. No full-PR merge, ACTIONS or mentor changes.
>
> Attempt only in the proposed21:30–22:00UTC natural window on3November2026, after fresh all37-pin/current-main, ordinary production-plus-exact-patch tests and final watcher persistence checks pass. I accept only the documented existing TRY SMALL cases1/3b as baseline failures; any additional failure stops the attempt. No cancellation, pause or dispatch is authorized. If the boundary or compatibility fails, stop without deployment.
>
> Publish only the exact patch as an ordinary expected-parent, non-force commit preserving the complete data tree and unrelated files. Verify exact after hashes and ordinary push-triggered CI against the deployed SHA. A new failure requires the exact ten-file inverse3f628c2e8a2d3788712aa94250703d83657268b11e3bcc8d8d911a12732c3c86, applied only on fresh matching code with a safe boundary and every intervening data commit preserved. No retry or rollback write while an outcome is UNKNOWN.
>
> Passive verification only through naturally scheduled runs: actual cron/DST admission, job/process/observation clocks, archives and snapshot publication, canonical/delivery dedup and message-state health. No manual dispatch, real test messages, provider probes, financial/private-state change, strategy/ZAD/privacy change, collection expansion, purchase or order. Operational repair is not profitability evidence;09:30–15:00 is not the full16:00 session.
