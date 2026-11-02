# Mentor release: FINAL plan (single version)

**Status: READY FOR FINAL APPROVAL. Nothing in this document has been executed. Prepared 2 Nov 2026 by Claude (release-preparation owner).**

This one plan replaces the earlier versions:
- Claude's `bd415ecb` procedure;
- the control proposal in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`): its 3 Nov 02:00–03:00 UTC window and 6 h 20 m ceiling.

It keeps that decision's committed-checkpoint boundary and all preservation rules. It is reconciled with Codex's PR #3 handoff ([comment 6573695106](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6573695106)). There are no other parallel versions.

## 1. Roles

| Role | Who | Does |
|---|---|---|
| **Operator: release, rollback, checks** | **Claude, this session** (`claude.ai/code/session_017cC8uWFU58B3u4ZSirToHT`) | Reads workflow states and runs; builds and pushes the release commit D and, if needed, the rollback commit R; makes the go / abort call; tells the owner when to click. The only party that changes `main` code for this release. |
| **Workflow clicks** | **Owner** | Disable and Enable on the "Telegram bot replies" page only. No assistant has a supported enable/disable control: Claude's GitHub connector reads states but has no switch method, and Codex's connector cannot read them. |
| Development | Codex | Makes no competing production or control change (stated by the owner and in Codex's handoff). Not needed during the window. |

**Access, checked 2 Nov without changing anything:**
- Claude can read both workflow states (GitHub REST `GET /actions/workflows/{file}`).
- **Push access to `main` is proven by precedent:** this session pushed release commits directly to `main` through the same path on 30 Oct (`a702de8`, `bdc984e`) and on 1 Nov (`b680988`, the feed-integrity deploy).
- `main` has no branch protection.
- A refused push of D would lead to ABORT A (safe; no change).

## 2. Workflow states

Source: Claude's GitHub connector, `get_workflow`, read-only.

| Read at (UTC) | Telegram bot replies (`bot.yml`, id 375564480) | Stock scanner (`main.yml`, id 374437748) |
|---|---|---|
| 09:09 and 09:46 | **active**, last change 09:02:56 UTC (the owner's re-enable; no commit touched the file) | **active**, unchanged since 30 Oct |

- **The owner's brief disable is restored. Service was not affected:**
  - bot job 125091176540 ran 04:15:06 → 09:45:34 and ended SUCCESS;
  - its queued successor started at 09:45:36 as normal.
- **Verification during the window:** the same GET is read before Disable, right after Disable (expected `disabled_manually`), and after Enable (expected `active`).
- **Restoration rule:** only `bot.yml` is changed, and only from the state read before the window. If `bot.yml` is not `active` at entry, the plan does not start.

## 3. The release: exact and unchanged

| Item | Value |
|---|---|
| Approved head | PR #3 `25a85000b076c4da649634606467e71b577bc75c` |
| Patch | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production.patch). SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7`, blob `4a858467bb0c912efdf37eaeebcd4081f3470b22`. Byte-identical to PR #3's diff. |
| Manifest | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production-manifest.json). SHA256 `13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250`, blob `d6f26ff25f5bab5f4c7741884f82475507e39a12`. |
| Code-only inverse | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/fd961e3b613e493880e40806d7c2b9be0ccb70e3/docs/mentor-persistence-receipt/mentor-approved-rollback.patch). SHA256 `15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521`. |
| Eight paths | `mentor-plan.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/mentor-m1-m3.test.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release-examples.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release.test.mjs` |
| Compatibility today | On main `f748fd8e`, and per Codex on `a8bc23ea`: `scan.mjs` and `test/load-scan.mjs` match their before-hashes, and the six new paths are absent. After applying the patch, all eight after-hashes match. Patch then inverse restores main's exact tree. Newer research and data commits are preserved, never reverted. |

## 4. Test criterion (relative to the baseline)

**Measured:**
- Claude, Node 20, main's own CI command (`tests.yml`: every `test/*.test.mjs` file):
  - main `f748fd8e`: 128 of 129 files pass;
  - main + patch: 132 of 133 pass;
  - **in both, the only failure is `test/try-small-audit.test.mjs` cases 1 and 3b** (an expired dated fixture). Hosted CI on main fails the same way.
- Codex, Node 24, `a8bc23ea`: 130 baseline / 134 mentor files pass with only that fixture's clock pinned; under the ordinary clock it fails 14 pass / 2 fail, cases 1 and 3b, on both trees.
- The file counts differ because the file sets differ. **The go / no-go never compares counts.**

**Rule:**
1. At entry (T0 − 30), Claude runs the CI command on current main M0 and records the exact failing files and case names. This is the baseline.
2. D passes only when its **hosted** CI failure set is **identical** to the baseline and the four mentor test files pass.
3. **Anything else means rollback (ABORT B):** a new failing file or case, a changed case name, or no result by the CI cutoff.
4. The fixture is not edited and no test is skipped. **The owner's approval accepts these two baseline failures as pre-existing.**

## 5. Historical uncertainty the owner must accept

- The earlier bot runs (41327224130 / job 124919084401 and 41354916865 / job 125004035374, and every run before them) kept **no record of the state they intended to save** or of their final Telegram offset. Their `run.log` is not retained.
- So it **cannot be proved** that every command they fetched was saved.
- Nothing can recreate this: not current commits, logs, a new check, nor a future run.
- **The baseline accepted instead:** the committed main at release time, all of it preserved. Nothing is backfilled or replayed, offsets are not reset, and no message is read from Telegram to investigate.

**What will be checked during the window, for that run only:**
- the drained job ends SUCCESS;
- its raw job log has no real save-failure line;
- no bot or scanner job is running at the push;
- D changes exactly the eight paths;
- the CI rule in §4;
- the next bot run starts on D.

## 6. Window and interruption

**Bot job timing:** each job runs 330 min 28 s, and the queued successor starts about 2 seconds later. Observed: 22:44:33 → 04:15:04 → 04:15:06 → 09:45:34 → 09:45:36. The projected natural ends are 15:16 and 20:47 UTC today, 02:17 UTC on 3 Nov (excluded: scanner carry-over), and **about 07:47:34 UTC on Tuesday 3 Nov**. The times below use the plan's conservative formula (job start + 331 min), so T_end = 07:48.

| Point | UTC, Tue 3 Nov | Kuwait |
|---|---|---|
| Claude wakes (scheduled) | 07:00 | 10:00 |
| Claude entry checks (T0 − 30) | 07:08 | 10:08 |
| **Owner: Disable (T0)** | **07:38** | **10:38** |
| Old job's natural end (T_end, conservative) | 07:48 | 10:48 |
| Old job must have ended by (T0 + 20) | 07:58 | 10:58 |
| CI verdict cutoff (T0 + 40) | 08:18 | 11:18 |
| **Owner: Enable**, normally by (T0 + 60) | 08:38 | 11:38 |
| **Absolute Enable deadline (T0 + 75)** | **08:53** | **11:53** |

**If the projection moves:**
- At T0 − 30, Claude recomputes T_end from the running job's actual start (start + 330 min + 1 min) and gives the owner the exact Disable time.
- The whole span T0 − 30 … T0 + 75 must lie outside **11:20 – 03:30 UTC** on weekday-scan days: the first scan is at 13:10, and the 21:30 scan can run late.
- If the span is not clear, or the chain breaks, there is **no attempt that day**. A later date needs a new go from the owner; nothing is carried forward automatically.

**Interruption:**
- **New bot starts are suppressed for at most 75 minutes** (T0 → T0 + 75).
- **The bot keeps answering until T_end.**
- **Silence lasts from T_end until the next bot run starts after Enable:**
  - typically about 30–90 minutes;
  - worst case about 3 hours (65 minutes plus up to 120 minutes of GitHub schedule delay), that is by about 10:53 UTC / 13:53 Kuwait.
- Messages sent meanwhile normally wait on Telegram for up to 24 hours.
- Not touched: Stock scanner, alerts, research workflows. Research workflows (`squad26-lab`, `squad26-watch`, `research-lab`; for example `squad 26 watcher 2026-11-02T09:44`, data only) keep committing data-only changes to `main`; the push rules below allow for that.

**The undocumented case:** GitHub does not document whether it holds the queued bot run of a disabled workflow.
- If the run starts anyway at T_end, that is ordinary bot service (no silence). The plan stops with ABORT A, and nothing is released.

## 7. Entry conditions (all required, or there is no Disable request)

1. **The owner's written approval of this plan,** including §4 (baseline) and §5 (historical uncertainty). This is the revised committed-checkpoint decision; the original PR #3 approval otherwise stands.
2. **Operator available from T0 − 30 to completion or safe abort:**
   - On approval, Claude schedules a one-time wake-up into this session for 07:00 UTC on 3 Nov.
   - From the entry checks onward, Claude works in **one continuous turn**, waiting with in-session timers rather than ending the turn, until the final report or ABORT is complete.
   - Claude posts a status line at every step and at least every 10 minutes.
   - Claude confirms in this chat: "OPERATOR READY".
   - **If the owner has not seen that message by T0, the owner does not click.** No click means no change.
3. **Owner available:** the owner can watch this chat from 10:08 to 11:53 Kuwait and click within 2 minutes.
4. **Entry checks at T0 − 30 (Claude):**
   - both workflows `active`;
   - exactly one bot job running, with the start time that gives T_end, and the span clear (§6);
   - no scanner run in progress or queued;
   - any other non-finished bot run has **zero jobs**;
   - patch, manifest and inverse hashes as in §3;
   - main's two before-hashes as in §3, and the six new paths absent;
   - baseline M0 measured (§4).
5. **Codex confirms** nothing will be pushed to `main` from its side during the window (already stated in its handoff).

## 8. Steps

| # | When | Who | Action |
|---|---|---|---|
| 1 | T0 | **Owner** | When Claude writes "CLICK DISABLE NOW": open https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml, click **"…" (top right) → Disable workflow**, reply "done". |
| 2 | T0 + 1 | Claude | Read back: `bot.yml` = `disabled_manually`; `main.yml` = `active`. If `bot.yml` still reads `active` after 3 minutes, the click did not register: Claude stops, and no further click is needed. If any other unexpected state appears, Claude writes "ABORT – CLICK ENABLE NOW". |
| 3 | T_end … T0 + 20 | Claude | Wait for the running job to end naturally. List **every** bot.yml and main.yml run and its jobs. The only allowed non-finished run is the pre-existing queued bot run with **zero jobs**. **A job running or started → ABORT A. Old job not ended by T0 + 20 → ABORT A.** |
| 4 | after 3 | Claude | Ended job: conclusion SUCCESS. Read its **raw** log (`GET /actions/jobs/{id}/logs`). The echoed `echo "Error: could not save the data folder` line must be **present** (this proves the right log); an output line matching `^[0-9T:.Z-]+ Error: could not save the data folder` must be **absent**. **Otherwise → ABORT A.** |
| 5 | after 4 | Claude | Fetch main as **M**. Commits M0 → M must touch only `data/`, **otherwise ABORT A**. Apply the patch as one normal commit **D** (parent M; message "mentor: release approved PR #3 25a85000 (8 files, patch 1841837e)"). Verify exactly eight paths changed and the after-hashes match. **Repeat the step 3 run listing immediately before pushing.** Push **without force**. If rejected (a research commit), refetch, re-check the `data/`-only rule, rebuild and retry **once**. A second rejection → ABORT A. |
| 6 | right after the push | Claude | Repeat the run listing. **If a bot or scanner job started before the push and is still running**, D reached an active writer, which the approval forbids. Claude reports this to the owner at once and continues with step 7 (go → keep D; no-go → R). A job that started after the push checked out D. |
| 7 | push … T0 + 40 | Claude | Hosted CI on D (Tests workflow, push event): §4 rule. **Pass → step 8. Fail, or no result by T0 + 40 → ABORT B.** |
| 8 | by T0 + 60 | **Owner** | When Claude writes "CLICK ENABLE NOW": same page, click **Enable workflow**, reply "done". |
| 9 | after 8 | Claude | Restoration checks (§10). Final report to the owner. |

## 9. Abort

- **ABORT A (before D is pushed):** Claude writes "ABORT – CLICK ENABLE NOW". The owner clicks **Enable workflow**. Nothing in the code or data changed.
- **ABORT B (after D is pushed):**
  1. Claude applies the inverse patch as one normal commit **R** on current main (refetch and retry once if rejected).
  2. Claude verifies the eight paths are back to their before-hashes or absent, and that nothing else changed.
  3. Then Claude writes "CLICK ENABLE NOW".
- **Deadline rule:** after D is pushed, the bot is re-enabled only once main is verified D or verified R. If neither is verified by **T0 + 75 (08:53 UTC / 11:53 Kuwait)**, Claude reports an incident, and the owner enables anyway so the bot is not left off. The bot then runs whatever main holds. A later R would reach a running bot at its next pass, and the owner decides whether that is pushed.
- **If the owner hears nothing from Claude:**
  - before T0 → no click;
  - after Disable → if Claude posts nothing for **20 minutes**, the owner clicks **Enable** at once and treats it as an incident. In any case the owner enables at 11:53 Kuwait at the latest, without waiting.
- **Never:** reset, history rewrite, data restore, message replay, cancellation, dispatch, workflow-file edit, secret change, or a test message from the bot.

## 10. Restoration checks

1. `bot.yml` reads `active` and `main.yml` reads `active` (Claude, GET).
2. The first new bot run's job checks out a main containing D (or R), and its first `bot …` commit has D (or R) as an ancestor.
3. Later bot data commits continue normally.
4. If no bot run has started 120 minutes after Enable, Claude reports it. Up to 120 minutes is GitHub's normal schedule delay here: runs were created 49–96 minutes apart on 2 Nov.
5. **Owner optional:** once the bot is back, send `mentor SPUS`. Expect the read-only mentor view marked NOT PROVEN.

## 11. What the owner approves

> I approve releasing the unchanged mentor patch `1841837e…` (PR #3 `25a85000`) using this plan, on Tue 3 Nov 2026, with Disable at about 10:38 Kuwait (the exact minute is confirmed by Claude at 10:08).
> - I accept that the earlier bot runs' unsaved-state proof cannot be recovered; current main at release time is the accepted starting point.
> - I accept the two TRY SMALL baseline failures (cases 1 and 3b) as pre-existing.
> - Claude (this session) is the only operator. I click Disable and Enable for "Telegram bot replies" only, when Claude says so. If Claude is silent for 20 minutes after Disable, I enable at once; in any case I enable at 11:53 Kuwait at the latest.
> - If neither the release nor the rollback is verified by 11:53 Kuwait, I accept that the bot restarts on unverified code, and I will decide on any later rollback.
> - No cancellation, dispatch, data change, workflow edit, secret change or trade is part of this.

LEADER DIP remains NOT PROVEN. The mentor is read-only. Acceptance stays 24/40.
