# Mentor release: FINAL plan (single version, revision 2)

**Status: READY FOR FINAL APPROVAL (subject to Codex's confirmation of the role in §1). Nothing in this document has been executed. Prepared 2 Nov 2026 by Claude (release-preparation owner).**

This one plan replaces the earlier versions:
- Claude's `bd415ecb` procedure;
- the control proposal in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`).

It keeps that decision's committed-checkpoint boundary and all preservation rules, and it is reconciled with Codex's PR #3 handoff ([comment 6573695106](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6573695106)). §12 lists what changed from revision 1 (`ac98ff98`).

## 1. Roles

| Role | Who | Does |
|---|---|---|
| **Operator: release, rollback, checks** | **Claude, this session** (`session_017cC8uWFU58B3u4ZSirToHT`) | Reads workflow states, runs and jobs; builds, pushes and verifies the release commit D and, if needed, the rollback commit R; makes the go / abort call; tells the owner when to click. The only party that changes `main` code. |
| **Workflow clicks** | **Owner** | Disable and Enable on "Telegram bot replies" only. No assistant has a supported enable/disable control. |
| **Backup verifier (read-only)** | **Codex**, to be confirmed by Codex before approval | Only if Claude is silent for 20 minutes after D is pushed: checks `main`'s eight paths against §3 and tells the owner which verified state `main` is in. It never pushes, clicks, cancels or dispatches. |

**Access:**
- Claude reads both workflow states (GitHub REST `GET /actions/workflows/{file}`; both read `active` at 09:09 and 09:46 UTC on 2 Nov).
- This session has pushed release commits directly to `main` before: `a702de8` and `bdc984e` on 30 Oct, `b680988` on 1 Nov.
- `main` has no branch protection.

## 2. Workflow states

- **2 Nov:** both workflows are active.
  - `bot.yml` last changed at 09:02:56 UTC (the owner's re-enable; no commit touched the file).
  - Bot job 125091176540 ran 04:15:06 → 09:45:34 and ended SUCCESS; its successor started at 09:45:36.
- **During the window:** Claude reads both states at entry (both must be `active`), after Disable (`bot.yml` = `disabled_manually`, `main.yml` = `active`) and after Enable (both `active`).
- **Only `bot.yml` is ever changed.** The Stock scanner (`main.yml`) stays enabled throughout (§6c).

## 3. The release: exact and unchanged

| Item | Value |
|---|---|
| Approved head | PR #3 `25a85000b076c4da649634606467e71b577bc75c` |
| Patch | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production.patch). SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7`, blob `4a858467bb0c912efdf37eaeebcd4081f3470b22`. |
| Manifest | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production-manifest.json). SHA256 `13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250`. It lists the before- and after-hash of each path. |
| Code-only inverse | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/fd961e3b613e493880e40806d7c2b9be0ccb70e3/docs/mentor-persistence-receipt/mentor-approved-rollback.patch). SHA256 `15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521`. |
| Eight paths | `mentor-plan.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/mentor-m1-m3.test.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release-examples.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release.test.mjs` |
| Before-state | `scan.mjs` SHA256 `76ffcd5675a00a881432d5cb0dad69d6d5235cd66932ef07eb4530ddca9c1a99`; `test/load-scan.mjs` `6478d0b89f75b6eb188dac97b154fc181749a1b6b5d010315f375272ff2f82e2`; the other six paths absent. This matched main on 2 Nov. |
| After-state | The manifest's eight after-hashes; for example `scan.mjs` `a864175379c0ecd3b8102d363925c6191b450d286b06cd473283d1fc3f746cc0`. All matched when the patch was applied to 2 Nov main. |

### Verified code states: the only states in which the bot may be re-enabled

| State | Definition | Who can verify it |
|---|---|---|
| **V0, unchanged** | No release commit was pushed. The eight paths still have their before-state. | Claude, or Codex, by hashing. **The owner, without tools:** https://github.com/drrazaq/Stock-2/commits/main shows no commit titled "mentor: release approved PR #3…" since Disable. Every other commit in the window is a data-only bot or research commit. |
| **V1, released** | D is on `main`; the eight paths have the after-state; D's hosted CI failure set equals the baseline (§4). | Claude, or Codex |
| **V2, rolled back** | R is on `main` after D; the eight paths are back to the before-state, and nothing else changed between D and R. | Claude, or Codex. CI is not needed: V2 is byte-identical to the code that was already running. |

## 4. Test criterion (relative to the baseline)

**Measured:**
- Claude, Node 20, main's CI command (`tests.yml`: every `test/*.test.mjs` file):
  - 2 Nov main: 128 / 129 files pass;
  - main + patch: 132 / 133 pass;
  - **in both, the only failure is `test/try-small-audit.test.mjs` cases 1 and 3b.** Hosted CI on main fails the same way.
- Codex, Node 24, fixture clock pinned: 130 / 134 pass; under the ordinary clock, 14 pass / 2 fail, cases 1 and 3b.
- **The go / no-go never compares counts.**

**Rule:**
1. At entry, Claude records the failing files and case names on current main M0. This is the baseline.
2. D is **V1** only when its hosted CI failure set is identical to that baseline and the four mentor test files pass.
3. Anything else, or no result by the CI cutoff (§6b), means rollback.
4. The fixture is not edited and no test is skipped.

## 5. Historical uncertainty the owner must accept

- The earlier bot runs (41327224130 / job 124919084401, 41354916865 / job 125004035374, and every run before them) kept **no record of the state they intended to save** or of their final Telegram offset.
- It **cannot be proved** that every command they fetched was saved, and nothing can recreate that proof.
- **The accepted starting point:** the committed `main` at release time, all of it preserved. Nothing is backfilled or replayed, offsets are not reset, and no message is read from Telegram to investigate.

## 6. Timing is taken from tomorrow's actual run

### 6a. Reading the running job

At entry, Claude reads the job J of the bot run that is in progress:
- **L** = the start time of its loop step (`Run git config user.name "scanner"`).
- **Estimated end E = L + 330 minutes.** The loop stops at the first pass after 330 minutes, and observed endings were L + 330 min 17–19 s.
- **The actual end is expected between E and E + 7 minutes.** The longest pass is a full 5-minute check.

The 10:48 Kuwait figure used earlier was only a projection; it is not used for entry. From 2 Nov's chain (job started 09:45:36 UTC), **E on Tue 3 Nov is projected at about 07:47 UTC (10:47 Kuwait)**. It is confirmed or replaced at entry.

### 6b. Times, all relative to tomorrow's actual E

| Point | Time | Projected (UTC / Kuwait), if E = 07:47 |
|---|---|---|
| Entry checks start | E − 45 | 07:02 / 10:02 |
| **Disable permitted** | only while **8 to 15 minutes** of estimated runtime remain (E − 15 … E − 8) | 07:32–07:39 / 10:32–10:39 |
| J must have ended by | E + 10 | 07:57 / 10:57 |
| D pushed by (else ABORT A) | E + 20 | 08:07 / 11:07 |
| CI cutoff for D | E + 30 | 08:17 / 11:17 |
| R pushed and verified by (if needed) | E + 40 | 08:27 / 11:27 |
| **Planned Enable on a verified state, at the latest** | **E + 45** | **08:32 / 11:32** |

**Rollback time budget:**
- Building R with the prepared inverse, pushing it (one retry) and hash-verifying it takes about 5 minutes. The plan allows 10 minutes for it (E + 30 → E + 40), plus 5 minutes of margin before the planned Enable.
- R is prepared and checked in a scratch worktree **before** D is pushed, so a rollback needs no new preparation.
- **The bot is never re-enabled on unverified code.** If no verified state is reached by E + 45, the bot **stays disabled**. Claude continues the rollback or verification, and the owner enables only when a verified state is confirmed.

**Maximum interruption:**
- **New bot starts are blocked** from Disable (at most E − 15) until Enable (planned at most E + 45): **at most 60 minutes**.
- **The bot keeps answering until J ends (E to E + 7).**
- **Silence:** from J's end until the next bot run starts after Enable. That is at most about 45 minutes before Enable, plus up to 120 minutes of GitHub schedule delay: typically under 1.5 hours, at most about 2 h 45 m (if E = 07:47, by about 10:32 UTC / 13:32 Kuwait).
- Messages sent meanwhile normally wait on Telegram for up to 24 hours.
- **The only open-ended case is the residual in §10:** the bot stays disabled because no verified state can be confirmed.

### 6c. No scanner or other writer can overlap

**Eligible E (Tuesday):** E − 45 must be after **04:10 UTC**, and E + 120 (incident buffer) before **11:20 UTC**. So **E must fall between 04:55 and 09:20 UTC**; otherwise there is no attempt that day. The projection (07:47) is inside this range.

**Writers on a Tuesday morning:**

| Writer | When | Overlap with E − 45 … E + 120 |
|---|---|---|
| Stock scanner `main.yml` (runs `scan.mjs`) | weekdays 13:10–20:40 and 21:30 UTC; timeout 300 min | **None.** The latest possible writing from Monday's 21:30 run is about 03:30 UTC (40 min late start + 300 min). No other schedule exists. Entry and pre-push checks require no scanner run queued or in progress, which also covers a manual run. |
| Bot `bot.yml` (runs `scan.mjs`) | continuous | Handled by the drain: J ends naturally, and the queued successor is handled as in §7. |
| `discover.yml` 05:30, `movers.yml` 04:00 (data only, 60-minute timeouts) | before the window | Entry requires neither to be in progress. |
| `squad26-lab` (:17 every 2 hours), `squad26-watch` (from 07:50; commits its own two data files at most every 30 min) | inside the window | **Data only, never `scan.mjs` or owner files.** They move `main` forward, so D and R are built on fresh `main` and pushed without force, with one retry. |
| `squad29-lab` 10:41, ignition / premarket from 12:40 | after the window | None |
| Codex | — | Pushes nothing to `main` (its handoff) |

**Only `bot.yml` and `main.yml` run `scan.mjs`.** Every other mention is a comment, and `tests.yml` loads it only in tests.

## 7. Entry conditions (all checked before the owner is asked to Disable)

The owner is asked to Disable only if **all** of these hold. If any fails, there is **no Disable request, and nothing is changed**.

1. **Approval:** the owner's written approval of this plan (§11), and Codex's confirmation of its backup-verifier role (§1).
2. **Operator ready:**
   - Claude is in one continuous turn from entry to the final report, with in-session timers instead of ending the turn.
   - It posts a status line at every step and at least every 10 minutes, and writes "OPERATOR READY".
   - **If the owner has not seen "OPERATOR READY", no click.**
3. **States:** both workflows `active`.
4. **Running job J:** exactly one bot job in progress. Its E is computed (§6a) and lies within 04:55–09:20 UTC. Disable is requested only inside E − 15 … E − 8. If less than 8 minutes remain, **no attempt today**.
5. **Queued successor:** the other bot runs not yet finished may be **zero or one** queued run with **zero jobs**. Anything else means no attempt.
6. **No other writer in progress:** no `main.yml`, `discover.yml` or `movers.yml` run queued or in progress.
7. **Code:** patch, manifest and inverse hashes as in §3; main's eight paths in the before-state.
8. **Baseline** M0 measured (§4).
9. **R prepared:** the inverse is checked against the after-state in a scratch tree.

## 8. Steps

| # | When | Who | Action |
|---|---|---|---|
| 1 | inside E − 15 … E − 8 | **Owner** | When Claude writes "CLICK DISABLE NOW": open https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml, click **"…" (top right) → Disable workflow**, reply "done". |
| 2 | +1 min | Claude | Read back `bot.yml` = `disabled_manually`, `main.yml` = `active`. If `bot.yml` still reads `active` after 3 minutes, nothing changed: stop (state V0, no further click). |
| 3 | until E + 10 | Claude | Watch J and the queued run. **The queued run gets a job, or any new run appears → ABORT A.** (That is normal bot service; nothing was released.) **J not ended by E + 10 → ABORT A** (J is never cancelled). |
| 4 | after J ends | Claude | J must end SUCCESS. Its raw log (`GET /actions/jobs/{id}/logs`) must contain the echoed `echo "Error: could not save the data folder` line and must **not** contain an output line matching `^[0-9T:.Z-]+ Error: could not save the data folder`. **Otherwise → ABORT A.** |
| 5 | by E + 20 | Claude | Fetch main as **M**. Commits M0 → M must touch only `data/`, otherwise ABORT A. Build **D**: the patch as one normal commit, message "mentor: release approved PR #3 25a85000 (8 files, patch 1841837e)". Verify exactly eight paths and the after-hashes. **Repeat the run listing; any bot or scanner job → ABORT A.** Push without force; on rejection, refetch, re-check and retry once. Second rejection or E + 20 passed → ABORT A. |
| 6 | right after the push | Claude | Repeat the run listing. A bot or scanner job that started before the push and is still running means D reached an active writer. Report it at once, then go to **ABORT B** (rollback), whatever CI says. |
| 7 | until E + 30 | Claude | Hosted CI on D. **Baseline-identical (§4) → V1 → step 8. Anything else, or no result by E + 30 → ABORT B.** |
| 8 | by E + 45 | **Owner** | When Claude writes "VERIFIED V1 – CLICK ENABLE NOW": same page, click **Enable workflow**, reply "done". |
| 9 | after 8 | Claude | Restoration checks (§9) and final report. |

## 9. Abort and restoration

- **ABORT A (D not pushed):**
  1. Claude verifies **V0** (hashes) and writes "VERIFIED V0 – CLICK ENABLE NOW".
  2. The owner clicks **Enable**.
- **ABORT B (D pushed):**
  1. Claude pushes the prepared **R** on current main (one retry).
  2. Claude verifies **V2**: the eight paths back to the before-state, and only those paths changed between D and R.
  3. Claude writes "VERIFIED V2 – CLICK ENABLE NOW". The owner clicks **Enable**.
  4. Target: by E + 40.
- **No Enable on unverified code:** the owner clicks Enable only after a "VERIFIED V0 / V1 / V2" message, from Claude or, as backup, from Codex.
- **If Claude goes silent for 20 minutes after Disable:**
  - **No release commit** on the commits page since Disable → that is **V0** (the owner checks the page) → the owner clicks **Enable** at once.
  - **A release commit is there** → the owner keeps the bot disabled and asks Codex for a read-only V1 / V2 check. Codex reports the verified state, or says that neither holds. The owner enables only on V1 or V2.
- **Restoration checks (after every Enable):**
  1. Claude (or Codex, if Claude is unavailable) confirms both workflows `active`.
  2. The first new bot run checks out a main in the verified state, and its first `bot …` commit has that state as an ancestor.
  3. Later bot data commits continue.
  4. No bot run 120 minutes after Enable → report.
  5. **Owner optional:** after V1, send `mentor SPUS`; expect the read-only view marked NOT PROVEN.
- **Never:** reset, history rewrite, data restore, message replay, cancellation, dispatch, workflow-file edit, secret change, or a test message from the bot.

## 10. Remaining operational dependency (not a blocker)

- **The time budget is guaranteed by the plan:** the latest planned verified Enable is E + 45, rollback is prepared in advance, and it needs about 5 minutes.
- **What no plan can guarantee:** that a verifier is reachable if both Claude and Codex are unavailable after D has been pushed.
- **In that case, the bot stays disabled until either can confirm V1 or V2.** That costs service, not correctness, because Telegram holds messages for up to 24 hours.
- This is why Codex's backup role is an entry condition.

## 11. What the owner approves

> I approve releasing the unchanged mentor patch `1841837e…` (PR #3 `25a85000`) using this plan, on Tue 3 Nov 2026. Claude computes the exact time from the running bot job; the projection is a Disable request between about 10:32 and 10:39 Kuwait.
> - I accept that the earlier bot runs' unsaved-state proof cannot be recovered; current `main` at release time is the accepted starting point.
> - I accept the two TRY SMALL baseline failures (cases 1 and 3b) as pre-existing.
> - Claude (this session) is the only operator; Codex is the read-only backup verifier. I click Disable and Enable for "Telegram bot replies" only.
> - I enable only after a "VERIFIED V0 / V1 / V2" message, or when I see no release commit after Claude has been silent for 20 minutes. If no verified state can be confirmed, the bot stays off until it can.
> - No cancellation, dispatch, data change, workflow edit, secret change or trade is part of this.

LEADER DIP remains NOT PROVEN. The mentor is read-only. Acceptance stays 24/40.

## 12. Changes from revision 1 (`ac98ff98`), for Codex's independent confirmation

1. **Removed:** the fallback that re-enabled the bot at T0 + 75 on unverified code.
   - **Added:** the three verified states V0 / V1 / V2 (§3); "Enable only on a verified state" (§9); the owner's own V0 check through the commits page; the bot stays disabled when no verified state can be confirmed (§10).
2. **Rollback budget:** R is prepared before D is pushed. The CI cutoff moves to E + 30, R must be verified by E + 40, and the planned verified Enable is E + 45 (was T0 + 75 ≈ E + 65).
3. **Timing from the actual run:** E = loop start + 330 min (§6a); Disable is permitted only while 8–15 minutes remain; J must end by E + 10; eligible E is 04:55–09:20 UTC on Tuesday. All clock times are projections only.
4. **Queued successor:** zero or one queued run with zero jobs at entry; a job or a new run after Disable → ABORT A.
5. **Writer overlap:** checked across every workflow schedule on Tuesday mornings (§6c). The Stock scanner cannot overlap. `discover` and `movers` must not be in progress at entry. Research writers are data-only.
6. **Run started before the push** (step 6): now always rollback (was: report and continue).
7. **Codex's new role:** read-only backup verifier. **Needs Codex's confirmation.**
8. **Unchanged:** the patch, manifest and inverse, the test rule, the historical-uncertainty acceptance, and the owner-clicks-only control.
