# Offline hosted-Tests reader companion — separate review package

This optional engineering companion supports the read-only verifier role in [stable ACTIONS r4 at97dd460c](https://github.com/drrazaq/Stock-2/blob/97dd460cf52f0364c170010b2880680c0cd0070b/docs/nov2-actions-correction/bounded-maintenance-proposal.md). **It does not change that procedure, its nine-file production patch, its gate or its review scope. It is not a new release prerequisite.** No installation, production import, workflow binding, scheduled task, provider request, credential use or production operation is added. Independent review of this companion is pending.

The owner is unavailable; no maintenance, click requests, cancellations, Enable/Disable or production changes may start. Neither the R4 confirmation nor this helper grants operational authority. Both workflows are left untouched. Fresh workflow-state confirmation has been requested from Claude's read-capable connector; running jobs are not substituted for an enabled-state readback.

## What it checks

The standalone Python reader validates the exact source commit, repository/main/push/run/job/attempt binding, actual checkout SHA, current production Tests workflow identity, completed required steps, full log boundaries and every expected test-file group/result. `PASS` requires all registered files and the hosted job/workflow to pass. An old TRY SMALL failure is a failure; no special exception exists. Wrong identity, missing groups, truncation or unsupported input remains UNVERIFIED.

The helper **does not authenticate input files**. The operator must obtain them through the authorized GitHub connector, establish their job/commit identity and confirm completeness. It cannot prove an arbitrary supplied JSON/log is genuine. It assesses this Tests job only: patch scope/pins, other required checks, writer/save/UNKNOWN conditions, baseline selection and the release decision remain with the existing procedure and Claude. A helper PASS never means VERIFIED V1, production approval, profitability or prospective admission.

| Contract | Behavior |
|---|---|
| Inputs | Local Git repository with required commit objects; exact40hex SHA; authentic run/job JSON and full log from one completed attempt |
| Workflow support | Exact current production Tests workflow SHA256 `b07f728230066f568dd8c0f94d64957cfdb016a9004867bfba3bc431ebb92fde`. Changed workflow means UNVERIFIED/review; no guessed selector/runtime. Node20 is the target; Node22 is not an added requirement. |
| Output | One sanitized JSON receipt for valid CLI invocation; PASS/exit0, FAIL/exit1, UNVERIFIED/exit2. Includes technical source/run/job IDs, inventory counts and log digest; no original diagnostics/financial values. |
| Limits | Log≤8MiB, each metadata file≤256KiB, each read-only Git subprocess≤10seconds. These are companion bounds, not newly adopted strategy/protocol criteria. |
| Input integrity | Use nonblocking open and reject symlink/non-regular/oversized/changing files. Check source-bound inventory rather than a hard-coded file count. |
| Side effects | No Git/ref/data/offset writes; no shell execution or Git hooks. Git transports are disabled and lazy fetching refused: missing objects are UNVERIFIED, not downloaded. Only stdout is emitted by normal use. |
| Runtime/lifecycle | Explicit one-shot offline invocation; no retries, polling, timer, state store, provider/broker client or live binding. |
| Baseline identity primitive | `non_data_tree(repo, sha)` computes the Git root tree excluding **only** root `data`, including every other filename/content/mode. It writes no object. Latest-main-run selection and informational comparison remain with the R4 handoff. |

## Run offline

The test runner needs the public reference commit9f53fdad27dfd2acfb21c14f293f1bfa18577425 already present in the repository object database. It never fetches it. Synthetic fixtures create only disposable local repositories and are not hosted/prospective evidence.

```sh
python -B docs/actions-ci-verifier-review/test_verifier.py -v

python -B docs/actions-ci-verifier-review/verifier.py \
  --repo /path/to/Stock-2 \
  --sha EXACT_SOURCE_SHA \
  --run /path/to/authentic-run.json \
  --job /path/to/authentic-job.json \
  --log /path/to/complete-job.log
```

This package is not registered in ordinary CI. The tests above were run explicitly; hosted branch CI is separate evidence. API run metadata must include repository, head SHA/branch, event, path, run/attempt/status; job metadata must include the matching run/attempt/head SHA, name, terminal conclusion and complete steps. The inputs must be genuine API captures, not user-created replacements claiming a real run.

## Verified behavior and limits

[Recorded verification](verification.json):34 synthetic unit cases PASS, plus actual CLI replay of retained evidence:

- Real green main job125906184924, SHA9f53fdad: PASS/exit0, all131expected file groups and PASS results.
- Historical failed job125814418123, SHA7bd91089: FAIL/exit1,130groups with129PASS and failed TRY SMALL file. This is an expected negative control, never an accepted baseline exception.
- Actual green log reduced to its last5,000lines: UNVERIFIED/exit2. A tail does not become a complete result even if it contains later passing files.

These are replays of retained logs, not new hosted executions and not results for the future isolated ACTIONS release. No raw bot/financial logs are republished. The unit suite additionally covers wrong source/checkout/repository/branch/run/attempt, malformed/incomplete metadata, skipped required test execution, duplicate/missing file results, setup/cleanup loss, diagnostic non-disclosure, input bounds/symlinks/FIFO refusal through the CLI, Git write absence, Git mode/non-data identity and missing promisor objects with transport forbidden.

Real-job replay exposed a legitimate optional post-cache cleanup skip after test failure. The reader now distinguishes optional cleanup from required test execution; this regression is covered without allowing any failed test. The pure non-data identity matches the independently recorded real tree `02c9bcf4fbd19f248cd3e80b18d46676c671fb14`.

## Review handoff

Review this companion separately for false PASS cases, source/attempt binding, complete inventory, legitimate cleanup states, read-only behavior and sanitized output. Preserve the ongoing focused R1 confirmation of97dd460c; this package must not delay or expand that review. No owner action is requested while away, and no unattended availability is promised.

Acceptance remains24/40,16open,0new closures/admissions. This advances the engineering assurance of the existing release-log handoff; it does not close a mixed acceptance row or add a trading strategy.

Follow-up before activation: a disposable1.5second probe reproduced FIFO blocking before the old file-type check. `O_NONBLOCK` now permits immediate type refusal; the real CLI returns UNVERIFIED/2 within the2second regression bound. This fixes only the optional companion; the stable R4 procedure and release packages are unchanged.
