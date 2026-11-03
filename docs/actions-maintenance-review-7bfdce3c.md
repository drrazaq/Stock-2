# Independent review: ACTIONS bounded maintenance proposal (Codex 7bfdce3c)

Reviewer: the Claude review session, 3 Nov 2026. Read-only review. No scheduling, disabling, cancellation, dispatch, deployment or message took place. The GitHub reads used were: the workflow-state read and run lists for `bot.yml` and `tests.yml`.

**Subject:** `docs/nov2-actions-correction/bounded-maintenance-proposal.md` at `7bfdce3c03daabc7f2bdbb77a6a3e9a2fab7707d`.

**Release package** (unchanged from 7f579b23):

| File | SHA256 |
|---|---|
| `production-standalone.patch` | `a9560969298368490a0b3cbd5b151e429b7d68b2bc302ba35025ccebb0981a53` |
| `standalone-manifest.json` | `545e1a7775f43f6b3b6b8e72c84a6f8e47c8ecde0b560128695ab17f2a67cd2b` |
| `rollback-standalone.patch` | `4e28ee37e58e8f0ea57b3d70a09438562efc12aaa8a5a1e9075df3927c6d91c9` |

**Verdict: SOUND IN SUBSTANCE, NOT YET EXECUTABLE.** Corrections C1–C4 below make it executable. The remaining items are approvals and readiness checks, not design work.

## What checks out

| Item | Finding |
|---|---|
| Nine-file scope | The patch touches `scan.mjs` and its 8 test companions only: no workflow, data, offset or accounting files. Main moved `eae28a73` → `e15ce188` by `data/squad26-today.json` only, which is not pinned. My earlier pin, apply and inverse checks on `eae28a73` therefore still hold on `e15ce188`. |
| Code-test results | My standalone review on `eae28a73` found main 129/130 test files passing and main+patch 131/132. The only failure in both is `try-small-audit` cases 1 and 3b. The new tests fail on old code: 11 of 13 reconciliation tests and 5 of 7 safeguard tests. Codex's 130/131 and 132/133 match this; they count one extra instrumented file. |
| Writer drain | Correct for the real bot. `bot.yml` is a 330-minute shell loop that runs `git pull` before every `node scan.mjs`, so a running bot loads pushed code at its next iteration. Draining J to its natural end and cancelling the never-started pending run (bot concurrency always holds one pending run) is the right boundary. |
| State and offsets | The Telegram offset lives in `data/tg-state.json`, which is plain committed data (`.github/private-data-mode` is absent, so no ciphertext). The patch touches no data. Pending commands stay on Telegram behind the persisted offset. The proposal correctly forbids getUpdates, replay and offset reset. |
| Save evidence | Correct, and confirmed in `bot.yml`: `save()` prints "Error: could not save the data folder…" and still returns success. Job success alone is therefore not evidence. The job log must contain no such line, and the final `bot …` data commit must be on main. |
| Uncertain writes | Correct. A network-interrupted push is UNKNOWN until the exact SHA is seen on main or the push is definitively rejected. UNKNOWN blocks retry, Enable and takeover. |
| Rollback | Correct. Prepare the code-only inverse on fresh main. Apply it only with no writer executing and before Enable. Preserve data commits. No wholesale revert. |
| Separation | Correct. Mentor approval and its rollback transfer rule are not borrowed. Watcher is excluded. |
| Window choice | Good. Wednesday 05:00–08:00 UTC is 00:00–03:00 New York, so the market is closed and the watcher guard is idle. At the current chain (J started 07:47 UTC on 3 Nov, each run 330 minutes), the bot run that ends on Wednesday morning ends around 05:50 UTC (08:50 Kuwait). This projection must be re-derived at readiness. |

## Corrections required (C1–C4)

**C1. Visible turn-ending instructions are missing.**
- The proposal has no communication rule.
- The 3 Nov mentor attempt failed exactly here: instructions sent mid-turn were not shown to the owner in real time.
- Reuse r5.5 §14 unchanged:
  - every owner instruction appears only in a turn-ending message;
  - code words are ACK READY, DONE DISABLE, DONE ENABLE and NOT CLICKED;
  - the 20-minute silence rule and the 10-minute ping rule apply;
  - monitoring is continuous only while a turn is active.
- This is reuse, not new design.

**C2. The operator capability statement is wrong for the Claude operator.**
- Codex's connector cannot read workflow state. The Claude session's GitHub connector can:
  - `get_workflow bot.yml` returned `"state":"active"` today;
  - it can list runs and jobs and read job logs;
  - it can cancel a run by ID (`cancel_workflow_run`);
  - it cannot enable or disable a workflow.
- So verification of Disable and Enable is the operator's API read (VERIFIED V0/V1/V2, as in r5.5). The owner's read-back is supplementary.
- Cancellation should be done by the operator by run ID, after the owner approves that ID. The alternative is an owner click on "Cancel run" for that exact ID. Pick one; I recommend the operator.

**C3. Drop `main.yml` suppression and replace it with a read check.**
- `main.yml` runs only at weekday 21:30 UTC and 13:10–20:40 UTC. Nothing is scheduled in a 05:00–09:00 UTC window.
- Disabling it adds two owner clicks and two more restoration states, and protects nothing.
- Replace it with a read: no `main.yml` run, and no other workflow that executes `scan.mjs`, is active or queued at push time.
  - `account-replay.yml` is manual only.
  - Lab push triggers use `run-*-now.txt` paths, not `scan.mjs`.

**C4. Baseline-relative CI must be stated as such.**
- `tests.yml` fails the whole job if any file fails. Main has been red since 2 Nov: Tests run 41605568600 on 3 Nov concluded `failure` because of `try-small-audit`.
- The release commit's check will therefore show **failure**. That alone is neither a blocker nor a success.
- Verification reads the job log (`get_job_logs`), which must show:
  - exactly one `::error file=` line, naming `test/try-small-audit.test.mjs`;
  - inside it, only cases 1 and 3b failing;
  - every other file printing `PASS`.
- The baseline is the exact parent commit, because other sessions push code to main (for example the research-lab commit on 3 Nov at 08:44 UTC).
- "Code drift that blocks release" should mean a change to any of the 17 pinned paths. Unrelated new lab files only change the baseline count.

## The executable procedure after C1–C4

E is the natural loop end of bot run J: actual loop start + 330 minutes, re-derived at readiness.

| Time | Who | Step |
|---|---|---|
| E−40…E−30 | Operator | Readiness. Fresh main. The 17 pins match. Patch, manifest and inverse hashes match. Full suite on parent and on parent+patch (only the baseline failure in both). `bot.yml` state read (V0 active). J identified and E computed. The pending run P identified (0 jobs). No `main.yml` or other `scan.mjs` run active. Turn-ending message: OPERATOR READY. |
| by E−12 | Owner | Replies ACK READY. |
| E−15…E−12 | Operator | Turn-ending message: CLICK DISABLE NOW (exact `bot.yml` page). |
| ≤E−8 | Owner | Click 1: Disable `bot.yml`, then reply DONE DISABLE. The operator verifies V1 = disabled_manually by API. With no verified Disable by E−8: abort, nothing changed. |
| ≤E | Operator, after the owner approves P's run ID | Re-check that P has 0 jobs, then cancel P. If any job of P has started: abort, then restore. |
| E…E+5 | Operator | J ends naturally. Its log has no "could not save" line. Its final data commit is on main. No writer is active. |
| ≤E+10 | Operator | Build one nine-file commit on the exact current parent and verify the after-hashes. Fast-forward push (no force). An interrupted push is UNKNOWN. No push after E+10; past that point: abort, then restore. |
| ≤E+30 | Operator | Verify the deployed bytes. CI log is baseline-relative per C4. If it fails, apply the inverse (no writer is running), then verify. |
| after verification | Operator, then owner | Turn-ending message: VERIFIED – CLICK ENABLE NOW. Owner click 2: Enable `bot.yml`, then reply DONE ENABLE. The operator verifies V2 = active. |
| next natural cron | Operator (passive) | The first natural bot run loads the new `scan.mjs`. The offset continues from the persisted value. Nothing is dispatched, and no command is claimed processed without evidence. |

**Owner actions:** 2 clicks (Disable `bot.yml`, Enable `bot.yml`), 1 run-ID approval for P, and the acknowledgement replies. **Operator capabilities used:** git read, git push to main, the GitHub API read for workflow state, runs, jobs and logs, and `cancel_workflow_run` for P only.

**Expected outage:** from E to the first natural bot run after Enable, about 45–75 minutes. This is conditional, not guaranteed.

## Remaining blockers

1. Codex accepts C1–C4, or rejects them with reasons.
2. The owner separately approves the maintenance controls: Disable and Enable of `bot.yml`, cancellation of the one freshly verified never-started run, and the abort and restore rules. The mentor approval does not cover this. The nine-file code approval stands as given.
3. The owner confirms the date and attendance, and the operator is designated. Nothing is scheduled.
4. At readiness, the operator confirms it can push to `main` (`git push --dry-run`) and that the chain still yields an E inside the window. Otherwise the date moves and nothing starts.
