# Mentor release: FINAL plan (single version, revision 3)

**Status: corrected for Codex's revision-2 review ([comment 6574720639](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6574720639)); awaiting Codex's focused confirmation. Not yet labelled ready: see §10. Nothing in this document has been executed. Prepared 2 Nov 2026 by Claude (release-preparation owner).**

This one plan replaces:
- Claude's `bd415ecb` procedure;
- the control proposal in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`).

It keeps that decision's committed-checkpoint boundary and all preservation rules. **The patch and scope are unchanged.** §12 lists what changed from revision 2 (`c651d005`).

## 1. Roles and who can check what

| Role | Who | Does |
|---|---|---|
| **Operator: release, rollback, checks** | **Claude, this session** (`session_017cC8uWFU58B3u4ZSirToHT`) | Reads workflow states, runs, jobs and checkout logs; builds, pushes and verifies D and, if needed, R; makes the go / abort call; tells the owner when to click. The only party that changes `main` code. |
| **Workflow clicks** | **Owner** | Disable and Enable on "Telegram bot replies" only. |
| **On-demand read-only verifier** | **Codex**, in its existing task, **only when the owner activates that thread** | Checks current `main`, the eight paths, every manifest pin, D/R ancestry and parent diffs, exact-SHA CI against the allowed failure set, and run/job/checkout evidence. It reports "VERIFIED V0/V1/V2" only when that state's evidence is complete, otherwise "UNVERIFIED: <missing proof>". It never pushes, rolls back, clicks, cancels or dispatches. **There is no unattended or automatic availability.** |

**Who can perform each check:**

| Check | Claude (this session) | Codex (activated) | Owner (authenticated GitHub page) |
|---|---|---|---|
| Workflow enabled/disabled state | Yes (`GET /actions/workflows/{file}`) | **No** (its endpoint is rejected as unsupported) | Yes: https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml shows a "This workflow was disabled manually" banner and an **Enable workflow** button when disabled, and neither when active. Recorded as **owner-confirmed**. |
| `main` bytes, pins, diffs, ancestry | Yes | Yes | No (not by eye) |
| Runs, jobs, logs, checkout SHA, CI | Yes | Yes | Viewing only, not a verification |
| Push D or R | **Yes, the only one** | No | No |

## 2. Workflow states

- **2 Nov:** Claude read both workflows as `active` at 09:09 and 09:46 UTC.
  - `bot.yml` last changed at 09:02:56 UTC (the owner's re-enable; no commit touched the file).
  - Bot job 125091176540 ran 04:15:06 → 09:45:34 SUCCESS; its successor started at 09:45:36.
- **During the window:** Claude reads both states at entry, after Disable and after Enable. If Claude is unavailable, the owner's page check is recorded as owner-confirmed.
- **Only `bot.yml` is ever changed.** The Stock scanner stays enabled, so its runs are monitored throughout (§6c).

## 3. The release: exact and unchanged

| Item | Value |
|---|---|
| Approved head | PR #3 `25a85000b076c4da649634606467e71b577bc75c` |
| Patch | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production.patch). SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7`, blob `4a858467bb0c912efdf37eaeebcd4081f3470b22`. |
| Manifest | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production-manifest.json). SHA256 `13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250`. Before- and after-hashes per path; dependency, caller and baseline pins; protected code regions. |
| Code-only inverse | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/fd961e3b613e493880e40806d7c2b9be0ccb70e3/docs/mentor-persistence-receipt/mentor-approved-rollback.patch). SHA256 `15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521`. |
| Eight paths | `mentor-plan.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/mentor-m1-m3.test.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release-examples.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release.test.mjs` |
| All manifest pins, checked 2 Nov on main `f4e4d951` | 2 dependencies (`index.html`, `market-session.mjs`); 7 caller/baseline pins (`bot.yml`, `main.yml`, `save-data.sh`, `private-data.sh`, `private-files.txt`, `test/bot-actions.test.mjs`, `test/basket-lane.test.mjs`); 4 protected code regions; `scan.mjs` before-hash. **All match.** |

### Verified code states: the bot is re-enabled only in one of these

| State | Required evidence (all of it, freshly read) | Who can verify |
|---|---|---|
| **V0, unchanged** | Current `main`: the eight paths in the before-state (`scan.mjs` `76ffcd56…`, `test/load-scan.mjs` `6478d0b8…`, six paths absent) **and** every manifest pin matching **and** every commit since M0 touching only permitted `data/` paths. A commit title alone is never V0. | Claude, or Codex |
| **V1, released** | D's parent is M; D changes exactly the eight paths; after-hashes match; all pins match; D's hosted CI failure set equals the accepted baseline (§4) and the four mentor test files pass; any later commits on `main` are data-only. | Claude, or Codex |
| **V2, rolled back** | R's parent is the then-current `main` (D plus any data-only commits); **R changes exactly the eight paths and nothing else**, restoring the before-state; all pins match; commits between D and R are data-only and preserved. CI on R is not required for V2: R restores bytes that were already running before D. | Claude, or Codex |

## 4. Test criterion

1. **Baseline M0, measured at entry:** main's CI command (`test/*.test.mjs`, Node 20). **M0's failures must be exactly the two accepted TRY SMALL cases** (`test/try-small-audit.test.mjs` cases 1 and 3b), or none.
2. **Anything else in M0** (a new failing file or case, or an incomplete run) means **no entry**. That needs reconciliation first; it is never inherited by equality.
3. D is V1 only when its hosted CI failure set is identical to the accepted M0 set and the four mentor test files pass.
4. Anything else, or no result by the CI cutoff, means rollback.
5. **2 Nov evidence:**
   - Claude: main 128 / 129, main + patch 132 / 133; only cases 1 and 3b fail.
   - Codex: 130 / 134 with the fixture clock pinned.
   - Counts are never compared.

## 5. Historical uncertainty the owner must accept

- The earlier bot runs (41327224130 / job 124919084401, 41354916865 / job 125004035374, and every run before them) kept **no record of the state they intended to save** or of their final Telegram offset.
- It cannot be proved that every command they fetched was saved, and nothing can recreate that proof.
- **Accepted starting point:** the committed `main` at release time, fully preserved. Nothing is backfilled or replayed, offsets are not reset, and Telegram is not read to investigate.

## 6. Timing: taken from tomorrow's actual run; all durations are targets

### 6a. The running job

At entry Claude reads job J of the bot run in progress:
- **L** = the start of its loop step (`Run git config user.name "scanner"`).
- **Estimated end E = L + 330 min.** Observed endings were L + 330 min 17–19 s, and the last pass can add up to about 7 minutes.

From 2 Nov's chain, E on Tue 3 Nov is **projected** at about 07:47 UTC (10:47 Kuwait). This is not an entry guarantee.

### 6b. Target timeline (relative to the actual E)

| Point | Target | Projection, if E = 07:47 (UTC / Kuwait) |
|---|---|---|
| Entry checks start | E − 45 | 07:02 / 10:02 |
| Disable permitted only while 8–15 min remain | E − 15 … E − 8 | 07:32–07:39 / 10:32–10:39 |
| J must have ended (else ABORT A) | E + 10 | 07:57 / 10:57 |
| D pushed (else ABORT A) | E + 20 | 08:07 / 11:07 |
| CI cutoff for D | E + 30 | 08:17 / 11:17 |
| R pushed and V2 verified (if needed) | E + 40 | 08:27 / 11:27 |
| **Target verified Enable** | **E + 45** | **08:32 / 11:32** |

**These are targets, not guarantees.**
- **Target start suppression:** 60 minutes or less, **conditional on reaching a verified state**.
- **What can extend suppression and service loss:** verification or rollback taking longer, a writer that must drain first (§6c), GitHub scheduling, or no reachable operator or verifier (§10).
- **The bot keeps answering until J ends.** After Enable, the next run waits for GitHub's schedule: runs were created 49–96 minutes apart on 2 Nov, so planning allows 120 minutes, but **that is an observation, not an upper bound**.
- **Planning estimate for silence:** under 1.5 hours typically, about 2 h 45 m if the targets hold and the schedule delay is 120 minutes. **Not guaranteed.**
- **Telegram:** it normally keeps unread messages for up to 24 hours. That does not make a longer outage lossless, and it does not prove that queued commands will be processed.

### 6c. Writers: monitored, not assumed absent

**Eligible E (Tuesday) is 04:55–09:20 UTC.** The Stock scanner's weekday schedule (13:10–20:40 and 21:30 UTC) makes overlap unlikely in that range, **but schedule timing is not proof**: a scanner run can start late or be started by hand, and it stays enabled.

**Fresh, complete run/job listings** of `bot.yml`, `main.yml`, `discover.yml` and `movers.yml` are taken at entry, before the D push, after the D push, before any R push, and after the R push. They include each job's **checkout SHA**: the `actions/checkout` log prints the commit it checked out (`git log -1 --format=%H`).

| Finding | Action |
|---|---|
| A scanner, bot, discover or movers job running or queued **before** a push | **Do not push.** Before D, that means ABORT A. Before R, wait for it to drain naturally: no cancellation, no extra workflow suppression. The bot stays disabled, then re-check. |
| A job **started before the D push and still running after it** (an old-code writer: the bot pulls each pass, and a scanner checked out the old SHA) | **Report the incident.** Do **not** roll back while it runs, because that would change its source again. Let it drain naturally, re-check the boundary, then decide V1 or R. The bot stays disabled meanwhile. |
| A job that **checked out D** (SHA proven in its log) | It runs on the new code: no incident. |

- **Research writers in the window** (`squad26-lab`, `squad26-watch`, `research-lab`) commit data only and never run `scan.mjs`. D and R are built on fresh `main` and pushed without force, with one retry; the intervening data commits are preserved.
- **Only `bot.yml` and `main.yml` run `scan.mjs`** (Codex checked this on main `f4e4d951`; its workflow bytes match the approved caller pins).

## 7. Entry conditions (all checked before the owner is asked to Disable)

If any of these fails: **no Disable request, nothing changed.**

1. **Owner approval** of this plan (§11).
2. **Codex readiness, confirmed live:** before entry, the owner sends a message in Codex's existing task and receives an explicit **current readiness reply** for on-demand read-only verification. **No reply means no entry.**
3. **Claude ready:**
   - one continuous turn from entry to the final report, with in-session timers;
   - a status line at every step and at least every 10 minutes;
   - "OPERATOR READY" written in this chat. **No "OPERATOR READY", no click.**
4. **States:** both workflows `active` (Claude's read).
5. **Running job J:** exactly one bot job in progress; E computed and within 04:55–09:20 UTC. Disable is requested only inside E − 15 … E − 8; if under 8 minutes remain, **no attempt today**.
6. **Queued successor:** zero or one queued bot run, with zero jobs.
7. **No other writer:** no `main.yml`, `discover.yml` or `movers.yml` run queued or in progress.
8. **Code:** patch, manifest and inverse hashes; the eight paths in the before-state; **every manifest pin** matching (§3).
9. **Baseline M0:** only the accepted two cases fail, or none (§4).
10. **R prepared:** the inverse checked in a scratch tree.

## 8. Steps

| # | Target | Who | Action |
|---|---|---|---|
| 1 | E − 15 … E − 8 | **Owner** | When Claude writes "CLICK DISABLE NOW": open https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml, click **"…" → Disable workflow**, reply "done". |
| 2 | +1 min | Claude | Read `bot.yml` = `disabled_manually` and `main.yml` = `active`. If `bot.yml` is still `active` after 3 minutes, nothing changed: stop. **No Enable click is needed; this is V0** (no code mutation yet). |
| 3 | to E + 10 | Claude | Watch J and the queued run. **The queued run gets a job, or a new run appears → ABORT A. J not ended by E + 10 → ABORT A** (never cancelled). |
| 4 | after J ends | Claude | J must end SUCCESS. Its raw log (`GET /actions/jobs/{id}/logs`) must contain the echoed `echo "Error: could not save the data folder` line and must **not** contain an output line matching `^[0-9T:.Z-]+ Error: could not save the data folder`. Otherwise → ABORT A. |
| 5 | by E + 20 | Claude | Fetch M. M0 → M must be data-only, otherwise ABORT A. Build D (one normal commit, the eight paths, message "mentor: release approved PR #3 25a85000 (8 files, patch 1841837e)") and verify the after-hashes and all pins. **Full writer listing (§6c); any running or queued writer → ABORT A.** Push without force, one retry; second rejection or E + 20 passed → ABORT A. |
| 6 | right after the push | Claude | Full writer listing with checkout SHAs (§6c). An old-code writer means an incident: drain first (§6c), then continue. |
| 7 | to E + 30 | Claude | Hosted CI on D (§4). **Pass → V1 → step 8. Fail, or no result by E + 30 → ABORT B.** |
| 8 | target E + 45 | **Owner** | When Claude writes "VERIFIED V1 – CLICK ENABLE NOW": click **Enable workflow**, reply "done". |
| 9 | after 8 | Claude | Restoration checks (§9), final report. |

## 9. Abort, backup and restoration

- **ABORT A (D not pushed):**
  1. Claude verifies **V0** with the full evidence in §3.
  2. Claude writes "VERIFIED V0 – CLICK ENABLE NOW", and the owner clicks Enable.
- **ABORT B (D pushed):**
  1. Full writer listing; wait for any running writer to drain (§6c).
  2. Push the prepared R on current `main`: eight paths only, one retry.
  3. Verify **V2** (§3), write "VERIFIED V2 – CLICK ENABLE NOW", and the owner clicks Enable.
- **One backup trigger:** **at any point after Disable, if Claude posts nothing for 20 minutes:**
  1. The owner **keeps the bot disabled** and sends a message in **this Claude chat** (that wakes this session if it is idle).
  2. If no reply within 10 minutes, the owner activates **Codex's thread** with the procedure link and asks for a read-only V0/V1/V2 check of current `main`.
  3. **Codex reports VERIFIED V0 / V1 → the owner may Enable. Codex reports V2 → the owner may Enable.** In every case the owner confirms the workflow state on their own page (owner-confirmed).
  4. **UNVERIFIED** (for example, D pushed with failing or missing CI and no R) → the bot stays disabled until an operator pushes and verifies R (§10).
- **The owner never enables on a commit title, a timeout, or unverified code.**
- **Restoration checks after Enable:**
  1. `bot.yml` and `main.yml` both active (Claude's read, or owner-confirmed if Claude is unavailable).
  2. The first new bot job's **checkout SHA** is a descendant of the verified state, and its first `bot …` commit follows it.
  3. Later data commits continue normally.
  4. No bot run 120 minutes after Enable → report (an observation, not a fault in itself).
  5. Owner optional, after V1: send `mentor SPUS`; expect the read-only view marked NOT PROVEN.
- **Never:** reset, history rewrite, data restore, message replay, cancellation, dispatch, workflow edit, secret change, or a test message from the bot.

## 10. Remaining dependency: why this is not labelled READY yet

**Recovery to a verified state needs these parties:**

| Situation | Who is needed | Arrangement |
|---|---|---|
| Before D is pushed | Anyone who can verify V0: Claude or activated Codex | Covered: Codex's on-demand read-only check |
| D pushed, CI passes | Claude or activated Codex to verify V1 | Covered |
| **D pushed, CI fails or is missing, Claude unavailable** | **An operator able to push R.** Codex cannot; the owner cannot. | **Only this Claude session**, reached by the owner's message. Other Claude sessions have pushed to `main` before, but using another session as a stand-in operator is **not** part of this plan (single-operator rule), and nothing promises it. |

- In the last row, the bot **stays disabled** until this session returns and completes R. That is a service-loss risk, not a correctness risk.
- **Exposure:** only from the D push until V1 or V2, about 10–20 minutes when the targets hold. Claude stays in one continuous turn through exactly that interval.
- **This is the plain remaining dependency.** No arrangement in this plan guarantees a rollback operator if this session becomes unreachable after D is pushed and CI fails.
- **The owner decides:** accept this residual (service loss only, never unverified code) by approving §11, or name a second rollback operator (that would be a scope change that needs its own approval).

## 11. What the owner approves

> I approve releasing the unchanged mentor patch `1841837e…` (PR #3 `25a85000`) using this plan, on Tue 3 Nov 2026. Claude computes the exact time from the running bot job (projected Disable request about 10:32–10:39 Kuwait), and the release goes ahead only if every entry condition holds, including Codex's live readiness reply.
> - I accept that the earlier bot runs' unsaved-state proof cannot be recovered; current `main` at release time is the accepted starting point.
> - I accept the two TRY SMALL baseline failures (cases 1 and 3b) as pre-existing; any other baseline failure stops the release.
> - Claude (this session) is the only operator; Codex verifies read-only, only when I activate its thread. I click Disable and Enable for "Telegram bot replies" only.
> - I enable only after a "VERIFIED V0 / V1 / V2" report from Claude or Codex, never on a commit title or a timeout.
> - I accept the §10 residual: if the release is pushed, its tests fail and this Claude session cannot be reached, the bot stays off until it is. All durations in this plan are targets, not guarantees.
> - No cancellation, dispatch, data change, workflow edit, secret change or trade is part of this.

LEADER DIP remains NOT PROVEN. The mentor is read-only. Acceptance stays 24/40. The Nov 2 ACTIONS correction (`e0dd68a8`) is a separate scope and is not part of this release.

## 12. Changes from revision 2 (`c651d005`), answering Codex's review point by point

1. **Timing (Codex 1):**
   - "Maximum interruption", "at most 60 minutes" and "guaranteed" are removed. All durations are now targets, conditional on reaching a verified state (§6b).
   - The 120-minute figure is an observation, not a bound; the 2 h 45 m silence figure is a planning estimate.
   - Telegram's 24-hour retention is described as neither lossless nor proof that commands are processed.
2. **V0 and backup (Codex 2):**
   - The title-based owner V0 check is removed. V0 needs fresh before-state hashes, all pins and the data-only check (§3).
   - The backup is on-demand only: the owner activates Codex's thread, and **Codex's live readiness reply is an entry condition** (§7.2).
   - There is now **one backup trigger**: Claude silent for 20 minutes at any point after Disable (§9).
   - Workflow-state checks are assigned to Claude's interface or the owner's authenticated page, labelled owner-confirmed (§1).
3. **Writers (Codex 3):**
   - The late-start assumption is replaced by fresh complete listings with checkout SHAs at entry, before and after D, and before and after R (§6c).
   - An old-code writer found after the push means: report, let it drain, then decide. No immediate rollback during it (this reverses revision 2's step 6).
4. **Rollback and entry (Codex 4):**
   - R is defined as an eight-path-only delta against its immediate current-`main` parent, preserving intervening data-only commits (§3 V2).
   - Every manifest pin is required at entry (checked today: all match).
   - M0 may fail only the two accepted cases, or nothing; anything else means no entry (§4).
5. **New §10:** states the remaining rollback-operator dependency plainly instead of labelling the plan ready.
6. **Unchanged:** the patch, manifest and inverse, the eight-file scope, the historical-uncertainty acceptance, and the owner-clicks-only control.
