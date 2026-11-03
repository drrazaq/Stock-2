# Exact watcher-only approval package — not authorized for deployment

Prepared3November2026. The review-evidence blocker is resolved. **Release assessment: PASS WITH CONDITIONS; owner approval and the future natural boundary remain outstanding.** This document does not install, dispatch or deploy anything. ACTIONS retains its separate code approval and operational conditions; mentor is not a dependency.

## Immutable ten-file scope

| Artifact | SHA256 |
|---|---|
| production.patch | 781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e |
| original manifest.json | 5d9f8c443fc3b04cdff0231bcbfbedf2b8cd08f3037546b43d086ca847a970d7 |
| rollback.patch | 3f628c2e8a2d3788712aa94250703d83657268b11e3bcc8d8d911a12732c3c86 |

Source artifact is [7f579b23](https://github.com/drrazaq/Stock-2/tree/7f579b23a487cdf84d80b50bab1e04e0b170cf6e/docs/nov2-watcher-scheduling). The patch changes exactly `.github/workflows/ignition.yml`, `ignition-watch.mjs`, `watcher-guard-core.mjs`, `watcher-guard.mjs`, `watcher-schedule.mjs`, `watcher-guard-history.mjs`, `test/watcher-guard.test.mjs`, `test/watcher-nov2-clock.test.mjs`, `test/watcher-nov2-guard.test.mjs` and `test/watcher-nov2-fixture.mjs`. Package-folder documentation/log counts are not patch-path counts. All approved-candidate patch, original manifest and inverse bytes remain unchanged.

Fresh main **e15ce188e034dc9269ee7348de0bf6e320324d58**: [all37 before/dependency pins, ten after hashes and full-tree inverse verification](review-confirmation/fresh-compatibility.json) PASS. The data subtree is identical. A disposable index additionally verifies that the exact approved ACTIONS overlay leaves all watcher dependency pins matching and that this watcher inverse preserves ACTIONS and data. This is compatibility evidence, not authorization to deploy ACTIONS or both packages together. Unexpected future drift still blocks deployment.

## Commit-pinned independent evidence and precise attribution

- [Review4de7635b](https://github.com/drrazaq/Stock-2/blob/4de7635b2ddcc5f2a302704139aa9c9525b2af26/docs/watcher-review-781f6644/README.md): **PASS WITH CONDITIONS**. A separate Claude reviewer agent ran the hash checks, suites, apply/inverse proofs and synthetic attribution-race reproduction. The delegating Claude session spot-checked and published; it did not rerun the suites.
- [Commands and outputs](https://github.com/drrazaq/Stock-2/blob/4de7635b2ddcc5f2a302704139aa9c9525b2af26/docs/watcher-review-781f6644/command-log.md):24 transcript calls, with outputs truncated to3,000characters. Full-suite per-file logs, results lists and runner are retained in that same immutable folder. Focused results are filtered transcript extracts, **not retained complete focused logs**.
- Codex independently verified **all270 SHA256SUMS entries**, exact file coverage and the262 matching per-file result/log records. [Audit](review-confirmation/evidence-audit.json); pinned checksum-list SHA256 `773bf248bac1d8af08e279a0a8565af56534af91b4257e2d4788e9799124dd48`. The four plain-assert logs need no TAP footer; an initial audit assumption requiring one was corrected, without changing any package or test.
- Codex independently reran all seven focused files on fresh main plus this exact patch, Node20.20.2, UID1000, clean PATH/LANG environment: **65/65 cases PASS** (38schedule/guard/clock +27publication/incident/resilience/retry). [Complete new Codex log](review-confirmation/independent-focused.tap). This is separate execution, not retroactively complete reviewer logs. Codex also reproduced the published three-tick race exactly. [Own output](review-confirmation/independent-race-output.txt).

The reviewer's baseline is eae28a73; fresh e15ce188 differs only in `data/squad26-today.json`. The fresh protected source/dependency pins match. Codex did not rerun the entire watcher suite during this evidence-confirmation step; the full-suite provenance below remains explicit. Neither publication of evidence nor hosted development CI is another independent reviewer run.

## Correct ordinary-versus-replay counts

| Execution | Baseline | Watcher-only | Qualification |
|---|---:|---:|---|
| Separate reviewer, ordinary registered `test/*.test.mjs`, Node20.20.0 |129/130files PASS|131/132files PASS|Only TRY SMALL file fails, cases1/3b; retained logs/results|
| Prior independent Codex ordinary broader run, Node20.20.2 |130/131files PASS|132/133files PASS|Includes one extra `tests/instrument-type.test.mjs`, outside registered production test loop|
| Earlier Codex controlled historical-clock run |131/131files PASS|133/133files PASS|ONLY TRY SMALL used the declared historical clock; includes the extra instrument test; **not ordinary all-green production**|

In the sole failing file,14cases pass and2fail in both ordinary trees. The earlier combined135/135 figure is also controlled historical-clock evidence, not a fresh ordinary combined result. Focused65case totals overlap full-suite files and are not65extra test files. [Corrected readiness JSON](readiness-20261103.json) and [prior ordinary execution inventory](../ordinary-vs-replay-release-counts.json) keep the populations distinct. Hosted development checks cover the wider branch and must be reported against their own exact SHA.

The separate reviewer did not verify the old six-of-seven negative controls or independently reconstruct November2's318/331 historical heartbeat union. Those remain separately attributed author evidence, not claims newly established by this review.

## Disclosed low-severity race — unchanged, explicit decision

The guard can initially classify an opposite-season no-op job as MEASURED while its admission step is in progress. Even when a later poll proves that job non-observing, the min-only `state.started` can retain its earlier09:29 attribution. A genuine09:37 job then receives no LATE warning. The synthetic winter-day sequence reproduces exactly: tick3 retains `started569`, `startedRunId1`, with no LATE alert.

This limitation affects earliest-start attribution and the late-start warning. A measured job is still not proof of observation or market coverage. It is not permission to claim the actual09:37 job watched the open. The reviewer offered a separate optional repair; **it is not bundled into the reviewed patch**. Owner approval below explicitly acknowledges this limitation. No archive, research row, accounting record or frozen result is rewritten to conceal it.

## Proposed safe natural off-hours boundary

Propose **Tuesday3November2026,21:30–22:00UTC /16:30–17:00 New York /Wednesday4November00:30–01:00 Kuwait**. This is after the regular market close and configured watcher end; extended-hours trading still exists. No operation or reminder is scheduled. A safety assessment earlier in the day cannot certify this future boundary: today's scheduled runs and final persistence have not yet happened.

If separately approved, immediately before any application:

1. Enumerate complete active, pending, queued, waiting and requested ignition runs, every relevant job/attempt and recent completed watcher runs. Pagination or unavailable metadata is UNKNOWN. Require no nonterminal watcher work and no unresolved watcher publication. No cancellation, suppression, manual dispatch or automatic recovery is part of this proposal. An absent safe boundary means no deployment.
2. Inspect final publication and retained per-run archives/artifacts for the latest real session/attempts: final JSON/progress/shadow evidence, canonical selection and message-state persistence. A job-success title or unchanged canonical file alone is insufficient. Partial coverage/SEC failures do not erase valid persistence; label gaps separately. Unavailable final-save evidence blocks deployment rather than being invented. Preserve original artifacts and frozen cohorts.
3. Verify actual off-hours time and that the bot guard remains healthy for the next session. Old and proposed guard runners both exit before GitHub/message/state operations at16:30 New York. The bot shell pulls before separate scanner/guard processes and waits for each process before its next save/pull; a remote commit does not hot-rebase the active worker's source. No bot or scanner workflow pause is proposed for this watcher-only scope. Any unexpected concurrent source update/process arrangement or pending request makes the boundary uncertain and stops the attempt.
4. Fetch fresh main, recheck all37 pins and exact artifact hashes, rerun ordinary registered production-plus-exact-patch tests and the focused cases against that parent. Only explicitly owner-accepted TRY SMALL1/3b may remain; any other failure requires reconciliation. If ACTIONS has deployed separately, verify its exact source/data state and preserve it; don't use compatibility evidence to merge or change it.

Publish only the ten paths as one isolated ordinary commit with a supported atomic expected-parent update. Compare all ten after hashes, unchanged dependencies, the complete data tree and unrelated paths with the exact parent. Preserve all intervening data commits; don't reset main or install the full development PR. Verify ordinary push-triggered CI for the resulting SHA. No manual dispatch or synthetic production message is used to make checks appear passed.

## Rollback, interruption and passive checks

Use only the exact ten-file inverse on fresh matching deployed after hashes and unchanged dependencies. Require a safe watcher boundary again; preserve all intervening data and any separately deployed ACTIONS change. Do not revert an entire historical tree, restore offsets or rewrite financial/research evidence. Unexpected drift requires reconciliation. Pre-record the candidate parent/commit/tree before publication.

APPLIED requires positive evidence of that exact commit. NOT APPLIED requires definitive rejection of that exact request; otherwise UNKNOWN remains. A network interruption, silence or unrelated movement of main does not prove a write settled. UNKNOWN blocks retries and rollback takeover. Do not apply an inverse while an original write could still land. Report a failed or uncertain write explicitly; there is no cancellation/pause authority hidden in rollback.

After deployment, use only naturally scheduled observations: actual schedule/DST admission, job/process/first-observation clocks, bounded startup requests, archives/canonical selection, publication, snapshot and message-state health, and absence of duplicate delivery/scoring. Confirm provider/SEC outcomes separately, including a genuinely empty filing set versus a failed source. No messages, provider probes or observations are fabricated. Not-yet-observed behavior stays pending.

The configured09:30–15:00 window is not the full16:00 session. Opening coverage depends on timely guard execution and GitHub scheduling; tests cannot guarantee it. The on-time09:10 job's360minute timeout leaves approximately8–10minutes after15:00 for saving, so final persistence remains a passive-check requirement. Historical318/331 slots, roughly43% fresh evaluated-price coverage and SEC failures are separate evidence, not broad-universe readiness or profitability. Massive remains delayed; SIP subscription ownership does not by itself prove fresh response coverage. Trusted instrument identity/execution gates remain unchanged. October29 stays excluded from the primary ranking cohort and October28 stays the excluded pilot.

## Exact proposed approval text — not yet granted

> I approve only the ten-file watcher scheduling patch SHA256781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e, original manifest5d9f8c443fc3b04cdff0231bcbfbedf2b8cd08f3037546b43d086ca847a970d7 and code-only inverse3f628c2e8a2d3788712aa94250703d83657268b11e3bcc8d8d911a12732c3c86, as reviewed at4de7635b2ddcc5f2a302704139aa9c9525b2af26. I acknowledge that the separate reviewer executed the suites and Claude spot-checked/published; focused reviewer outputs are transcript extracts, not complete retained logs. I accept the disclosed admission-in-progress attribution race and missed LATE-warning limitation without bundling its optional fix.
>
> Attempt only during3November2026 21:30–22:00UTC after all natural-boundary, final-persistence, fresh37-pin/hash and production-plus-exact-patch checks above pass. I accept only the independently reproduced TRY SMALL cases1/3b as baseline exceptions for this watcher attempt; any other failure requires reconciliation. If the boundary or evidence is incomplete, stop without deployment. No cancellation, pause, suppression, manual dispatch or new recovery scope is authorized.
>
> Publish only the isolated ten-file commit, preserving all data, financial records, offsets, workflows outside the one listed ignition file, strategy rules and unrelated changes, including any separately deployed ACTIONS repair. Verify resulting hashes and ordinary exact-commit push CI. On failure use only the exact inverse under fresh matching hashes, a safe watcher boundary and positively settled writes; preserve intervening data and ACTIONS. No force push, full-PR merge or uncertain-write retry/takeover.
>
> Passive verification only. No mentor deployment, provider probe, real test message, fabricated command/trade, collection expansion, instrument-reference activation, ZAD/privacy/accounting change, purchase, order or secret/permission change. This operational repair is not trading-profitability evidence and does not establish full-session or broad-universe readiness.
