# Mentor release: final handoff procedure

**Prepared by:** Claude, 2 Nov 2026, read-only. **Status: READY FOR FINAL APPROVAL. Nothing in this document has been executed.**

## 0. Roles: one production operator

| Role | Who | Does |
|---|---|---|
| **Deployment operator** (the only assistant that changes production) | **Codex** | Builds and pushes the release commit; pushes the rollback commit if needed; makes the go / abort call. |
| Owner | Owner | Two clicks on one workflow page (Disable, then Enable); approves this document. |
| Read-only checker | Claude | Re-reads states, runs and hashes. Never pushes to `main`, never clicks, never cancels or dispatches. |

Claude prepared this handoff and published it on its own branch, `claude/mentor-release-handoff`. It changes no Codex file. Codex reviews it and confirms the operator slot before the owner is asked to click anything.

## 1. Workflow states now (read-only, 2 Nov 09:09 UTC / 12:09 Kuwait)

| Workflow (name on the Actions page) | File | State | Last state change |
|---|---|---|---|
| **Telegram bot replies** | `bot.yml` | **active** | 2 Nov 09:02:56 UTC (12:02:56 Kuwait). No commit changed `bot.yml`, so this is consistent with the owner's re-enable; the API does not record who made the change. |
| **Stock scanner** | `main.yml` | **active** | 30 Oct (unchanged) |

- **The owner's brief disable has been restored.**
- **Service was not affected:**
  - bot job 125091176540 (started 04:15:06 UTC) kept running through it;
  - the bot saved a commit at 09:08 UTC;
  - successor run 41414530852 is still waiting as usual;
  - the scanner had no run due (the first Monday run is 13:10 UTC).
- **Note for the owner:** waiting bot runs regularly show as **CANCELLED** on the Actions page. GitHub does this by itself whenever a newer scheduled run replaces the waiting one (the "bot" queue keeps only one waiting run). It is not an operator action.

## 2. The release: exact and unchanged

| Item | Value | Checked today |
|---|---|---|
| Approved head (PR #3) | `25a85000b076c4da649634606467e71b577bc75c` | — |
| Patch | `docs/validation/mentor-readonly-production.patch`, SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7` | Byte-identical to PR #3's diff for its eight paths |
| Manifest | `docs/validation/mentor-readonly-production-manifest.json`, SHA256 `13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250` | — |
| Code-only inverse | `docs/mentor-persistence-receipt/mentor-approved-rollback.patch`, SHA256 `15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521` | Patch then inverse restores main's exact tree (disposable index) |
| Eight paths | `mentor-plan.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/mentor-m1-m3.test.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release-examples.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release.test.mjs` | — |
| Current main `f748fd8e` | `scan.mjs` and `test/load-scan.mjs` match the manifest's before-hashes; the six new paths are absent | The patch applies cleanly; all eight after-hashes match |

No receipt code, development repair, wording change, data file or workflow file is added.

## 3. Baseline tests and rollback rule (contradiction resolved)

**Measured today:** Node 20 as root, every `test/*.test.mjs` file, the exact command in main's `tests.yml`.

| Tree | Files passing | Failing |
|---|---|---|
| main `f748fd8e` | 128 / 129 | `test/try-small-audit.test.mjs` only: case **1** and case **3b** (expired dated fixture) |
| main + exact patch | 132 / 133 | the **same file and the same two cases**, nothing else; the four new mentor test files pass |
| hosted CI on main `cf74f7a3` (08:48 UTC) | red | the same two cases |

**The problem:** the earlier draft said "roll back if CI fails". Main is already red for this accepted fixture reason, so that rule would force a rollback every time.

**Rule for this release:**
1. At T0 − 20 the operator runs main's CI command (every `test/*.test.mjs` file, Node 20) on the then-current main, **M0**, and records the exact failing files and case names. This is the baseline. If the commits between M0 and D's parent touch anything other than `data/`, the operator aborts (step 5).
2. The release commit D **passes** only when its hosted CI failure set is **identical** to that baseline, and the four mentor test files pass.
3. **Anything else rolls back:**
   - any new failing file or case;
   - a changed case name;
   - no CI result by the T0 + 40 cutoff in §6 (hosted CI takes about 2 minutes).

The fixture is not edited, and no test is skipped.

## 4. Evidence: what cannot be had versus what will be checked

**Unavailable and cannot be reconstructed.** The owner's approval accepts this uncertainty.
- The original pre-save witness and final local state / offset of the earlier bot runs (41327224130 / job 124919084401 and 41354916865 / job 125004035374). The runs kept no artifacts, and the bot's `run.log` is not retained.
- Therefore it cannot be proved that every command those runs fetched was saved before they ended.
- No receipt, protected check or future run can recreate this. Nothing is backfilled or replayed, offsets are not reset, and `getUpdates` is not called.

**Checkable, and checked in the procedure:**
- Workflow states and their readback.
- The drained job: conclusion SUCCESS, and its raw job log (`gh api …/actions/jobs/<JOB_ID>/logs`) has **no output line** made of a timestamp directly followed by `Error: could not save the data folder`. Use: `grep -E '^[0-9T:.Z-]+ Error: could not save the data folder'` must find nothing, while the echoed script line must be found. The log also echoes the script as `echo "Error: could not save…"`; that echo is not an error, and this pattern does not match it. Checked on job 125004035374: the echo is present and there is no output line. This proves only that the bot's own save loop reported no failure for this run.
- No bot or scanner run active or queued at the deploy moment.
- D's parent is the current main.
- `git diff --name-only M D` lists exactly the eight paths, and the after-hashes match.
- Hosted CI failure set equals the baseline.
- The first new bot run checks out a main that contains D.
- The bot's later `bot …` commits continue, with D as their ancestor.
- On rollback: the eight paths return to their before-hashes or absence.

## 5. Why this window is short, and the one drain that remains

**How the bot runs:**
- Each bot job loops for 330 minutes (about 5 h 30 m).
- A queued successor starts about 2 seconds after it ends (observed 22:44:33 → 04:15:04 → 04:15:06).
- During its loop it runs `git pull` before every pass, so it would pick up new code while running.
- The existing approval does not allow deploying around an active writer, so D must land while **no bot job is running**.

**Why the long drain is avoided:**
- The earlier 6 h 20 m draft disabled right after a job start and waited for the whole job.
- This procedure disables **10 minutes before the running job's natural end**, so the only drain is those last 10 minutes. The bot keeps answering during them.
- Disabling stops new scheduled runs.

**What is not documented** is whether GitHub holds an already-queued run of a disabled workflow. Today's brief disable shows only that the queued run was not cancelled, not that it was held. **This decides whether the attempt can succeed at all:** if GitHub starts queued runs of a disabled workflow, every attempt ends in ABORT A, and the release then needs a separately approved procedure (for example the long 6 h 20 m drain). The procedure is safe either way:
- If the queued run is held: the old job ends, nothing else runs, Codex deploys, and the owner re-enables.
- If the queued run starts anyway: it is a normal bot run, so service simply continues. Codex makes **no deployment**, the owner re-enables, and the attempt moves to a later natural end.
- Nothing is cancelled or dispatched in either case.

**The Stock scanner (`main.yml`) needs no click.**
- Its weekday runs are 13:10–20:40 and 21:30 UTC. They can start about 40 minutes late, and a run may last up to 300 minutes, so the 21:30 run can still be writing at about 03:15 UTC the next morning (Friday's carries into Saturday).
- **Excluded:** T_end between **11:20 UTC and 03:30 UTC the next day** on weekday-scan days. The whole span from T0 − 20 to T0 + 75 (T_end − 30 to T_end + 65) must be clear of the 13:10 first scan and of any late 21:30 scan.
- Step 3 still checks that no scanner run is active.

**Proposed window:** the bot job's natural end on **Tuesday 3 Nov at about 07:48 UTC / 10:48 Kuwait**. That job is expected to start about 02:17 UTC; each job runs 330 minutes plus about 30 seconds.

**If the timing shifts:**
- The operator recomputes T_end from that job's actual start time and tells the owner the exact click time.
- If T_end falls in the excluded range above, the window moves to the next natural end outside it.
- One research workflow still commits data in the window: `squad26-lab`, around 08:17 UTC and every 2 hours (`squad26-watch` runs from 07:50 UTC but has no save step). It doesn't run `scan.mjs`, but it moves main forward, which is why the push rules below allow a retry.
- The window is never carried forward automatically.

## 6. Procedure

**Times:**
- T_end = the running bot job's actual start time + 330 min + 1 min.
- T0 = T_end − 10 min (owner's Disable click).
- **CI verdict cutoff:** T0 + 40.
- **Normal re-enable:** by T0 + 60, as soon as main is verified D or verified R. For the proposed window that is about 08:38 UTC / 11:38 Kuwait.
- **Absolute deadline:** T0 + 75 (about 08:53 UTC / 11:53 Kuwait). See "Deadline rule".

**Links:**
- Telegram bot replies (the only page the owner clicks): https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml
- Stock scanner (look only): https://github.com/drrazaq/Stock-2/actions/workflows/main.yml
- Tests (CI): https://github.com/drrazaq/Stock-2/actions/workflows/tests.yml
- Main commits: https://github.com/drrazaq/Stock-2/commits/main

**How the owner and Codex talk:** through the owner's usual Codex chat. Codex sends three messages, each starting with the time in Kuwait: "CLICK DISABLE NOW", "CLICK ENABLE NOW" or "ABORT – CLICK ENABLE NOW". The owner replies "done" after each click. Claude can repeat the same instructions in its own chat, read-only.

### Prerequisites (all required; if any is missing, there is no click)

1. **Owner approval** of this document. This includes accepting the historical uncertainty in §4 and the committed-checkpoint boundary.
2. **Codex** confirms that it reviewed this procedure, holds the operator role, has push rights for a normal commit to `main`, and is available from T0 − 20 to T0 + 75. Claude performs no production mutation.
3. **No other change in flight:** no other integration or deployment to `main` during the window.
4. **Fresh checks at T0 − 20 (Codex; Claude cross-checks read-only):**
   - both workflows read **active**;
   - the running bot job's actual start time gives T_end, and T_end is outside the excluded range (§5);
   - exactly one bot job is in progress, and any other non-finished bot run is a waiting run with **zero jobs**;
   - no scanner run is in progress or waiting;
   - patch, manifest and inverse hashes are as in §2;
   - current main's two before-hashes are as in §2;
   - the baseline M0 is recorded (§3).
5. **Owner reachable** for both clicks at the stated Kuwait times.

### Steps

| # | When | Who | Action |
|---|---|---|---|
| 1 | T0 (≈ 07:38 UTC / 10:38 Kuwait) | **Owner** | Open the Telegram bot replies page, click **"…" (top right) → Disable workflow**. Reply "done". |
| 2 | T0 + 1 | Codex | Read back: bot.yml **disabled_manually**; main.yml **active** (untouched). |
| 3 | T_end … T0 + 20 | Codex | Wait for the running job to end by itself. Then list **every** bot.yml and main.yml run and its jobs. The only allowed non-finished run is the pre-existing waiting bot run, with **zero jobs**. **If any bot or scanner job is running or has started → ABORT A. If the old job has not ended by T0 + 20 → ABORT A.** |
| 4 | after 3 | Codex | Ended job: conclusion **SUCCESS**. Download the **raw job log** with `gh api repos/drrazaq/Stock-2/actions/jobs/<JOB_ID>/logs > job.log` (not `gh run view --log`, which adds prefixes). Two checks on that file: (a) `grep -c 'echo "Error: could not save the data folder'` is **≥ 1**, which proves the right source; (b) `grep -E '^[0-9T:.Z-]+ Error: could not save the data folder'` finds **nothing**. **If any of these fails → ABORT A.** |
| 5 | after 4 | Codex | Fetch main as **M**. Commits from M0 to M must touch only `data/`, **otherwise ABORT A**. Apply the patch as one normal commit **D** (parent M). Verify exactly 8 paths changed and the after-hashes match. **Immediately before pushing, repeat the step 3 run listing; if a job has started → ABORT A.** Push **without force**. If rejected, refetch, re-check the `data/`-only rule, rebuild and retry **once**. A second rejection → ABORT A. |
| 6 | right after the push | Codex | Repeat the run listing. **If a bot or scanner job started before the push and is still running**, D was deployed around an active writer, which the approval forbids. Report it to the owner at once, then follow step 7's rule as usual. A job that started after the push checked out D, so it is not an old-code writer. |
| 7 | push … T0 + 40 | Codex | Hosted CI on D: the failure set must equal the M0 baseline, and the 4 mentor test files must pass. **Pass → step 8. Fail, or no result by T0 + 40 → ABORT B.** |
| 8 | by T0 + 60 | **Owner** | When Codex says "CLICK ENABLE NOW": on the same page, click **Enable workflow**. Reply "done". |
| 9 | after 8 | Codex | Restoration checks below. |

### Abort

- **ABORT A (before D is pushed):** Codex sends "ABORT – CLICK ENABLE NOW". The owner clicks **Enable workflow** at once. Nothing in the code or data was changed.
- **ABORT B (after D is pushed):**
  1. Codex applies the inverse patch as one normal commit **R** on current main and pushes it without force (refetch and retry once if rejected).
  2. Codex verifies that the eight paths are back to their before-hashes or absent and that nothing else changed.
  3. Only then does Codex send "CLICK ENABLE NOW".
- **Deadline rule:** after D is pushed, the bot is re-enabled only once main is verified D or verified R. If neither is verified by **T0 + 75**, Codex reports an incident with the exact state, and the owner enables at T0 + 75 anyway so the bot does not stay off.
  - The bot then runs whatever main holds; the approved patch has already passed every offline test in §3.
  - A later R would be picked up by a running bot at its next pass (a few seconds to a few minutes). That is a deployment around an active writer, and only the owner decides it.
- **Never:** reset, history rewrite, data restore, message replay, cancellation or dispatch.

### Restoration checks (step 9)

1. Read back: **bot.yml active**, **main.yml active**.
2. The first new bot run checks out a main that contains D (or R after an abort), and its first `bot …` commit has D (or R) as an ancestor.
3. The data commits from later bot passes continue as normal.
4. If no bot run has started **120 minutes** after Enable, report it. GitHub's `*/30` schedule created runs 49–96 minutes apart today, so a gap up to 120 minutes is normal delay.
5. **Owner optional check:** once the bot is back, send `mentor SPUS`. The reply should be the read-only mentor view, marked NOT PROVEN.

## 7. Expected interruption

- **The bot keeps answering until T_end** (about 10 minutes after Disable).
- **It is silent from T_end until the next bot run starts after Enable:**
  - about 15–50 minutes of deployment work;
  - plus up to 120 minutes of GitHub schedule delay (0 if GitHub releases the held waiting run on Enable);
  - typically under 1.5 hours, at most about 3 hours.
- **Messages sent during the gap:** unread messages normally wait up to 24 hours on Telegram and are answered when the bot returns.
- **If ABORT A happens because the waiting run started anyway, there is no silence at all.**
- **Not touched:** the Stock scanner, alerts and research workflows.

## 8. What the owner approves

> I approve releasing the unchanged mentor patch `1841837e…` (PR #3 `25a85000`) using this procedure.
> - I accept that the earlier bot runs' unsaved-state proof cannot be recovered; current main at the deploy time is the accepted starting point.
> - I accept the baseline rule in §3.
> - Codex is the only operator. I will click Disable and Enable for "Telegram bot replies" only, at the times Codex gives. I re-enable when Codex says so, and at T0 + 75 minutes at the latest.
> - If neither the release nor the rollback is verified by T0 + 75, I accept that the bot restarts on unverified code and that a later rollback reaches a running bot. Codex reports this to me as an incident.
> - No cancellation, dispatch, data change, workflow edit, secret change or trade is part of this.

LEADER DIP remains NOT PROVEN. The mentor is read-only. Acceptance stays 24/40.
