# Combined release: fixed-date operating plan (PROPOSAL ONLY; not approved, nothing scheduled)

Corrected per Codex 6737515212, 6737557321, 6737578245 and 6737604858. Source and composition PASS (6737313043) is closed and is not reopened here. **Tuesday 10 November 2026 is a proposal. There is no fallback date:** a missed cutoff defers the release, and any later date needs a new owner approval.

All times are UTC, with Kuwait time (UTC+3) in brackets. New York is UTC−5, because daylight saving ended on 1 November.

## 0. Identities

| Item | Value |
|---|---|
| Candidate | `d52499c454d2cdf472993e696d3a2ba8f4f77ef3`, tree `71223b3574ecd2abc265d3faa06dc7cb37d205a3`, parent `9c6331929968e63650593d1e83b3601d12469c17` |
| Binding | 28 paths, SHA256 `1a799a15b06ce6e36c466a37702ba72830552fc9972d8ebd3a96311425da2dd4` (Codex `dc6c727e4`, `docs/standalone-assessment-release-20261109/`) |
| Baseline for rollback | The 28 bound paths as they are in `9c633192` (the binding's base). All other paths keep whatever current main has. |
| Roles | **Operator:** Claude, the only one who pushes or reverses. **Verifier:** Codex, read-only. **Owner:** approval, the R-A choice and $0 confirmation; no action needed during the slots. Each role's attendance is confirmed separately; none is assumed. |

## 1. Loaded-source proof (used everywhere below)

Every workflow checks out `ref: main`, so a run's `head_sha` does not show what it actually ran. For each run, evidence is accepted only as follows:

1. **The commit actually checked out:** the commit `S` the job used, read from its checkout step log.
2. **Forward proof:** `S` must descend from `C` (`git merge-base --is-ancestor C S`), and `git diff --quiet C S -- <28 bound paths>` must show no difference. A later commit that only adds data counts, because the bound source is unchanged.
3. **Rollback proof:** the same two checks with `R` (the reversal commit) and the baseline blobs.
4. **Successful completion:** `S` alone is not enough. The job must also complete and produce its component-specific evidence (§3, §5).

## 2. Readiness (Tuesday; any failure means STOP, the release is **deferred**, and there is no fallback)

| Step | Time | Requirement |
|---|---|---|
| Q1 | by 06:30 (09:30) | The owner's approval text has been received in the conversation. |
| Q2 | by 06:30 | Codex has posted on PR #1 an **advance confirmation for every slot S0–S3, and for the conditional restoration slots S4–S6** (§4). If any slot is unconfirmed, there is no push. |
| Q3 | 06:30–07:05 | **Fresh main `M0`:** the 28 bound paths must equal the binding's base (precheck 0 drift). Any change to a bound path means STOP and re-review. Newer data and source outside the 28 paths are preserved. |
| Q4 | 06:30–07:05 | **Build** source-only `C'` on `M0` and run `verify-unit` (must be 28/0). Post `C'` and its tree on PR #1. |
| Q5 | 06:30–07:05 | **Local test inventory** on `C'`: every root `test/*.test.mjs` file plus `tests/instrument-type.test.mjs`. All must pass. |
| Q6 | 06:30–07:05 | No Tests, scanner, watcher or calendar job is running or queued. |
| P | 07:05–07:20 (10:05–10:20) | One fast-forward `git push origin C':main`, with no force. If main has moved, repeat Q3–Q5 **once** on the new main. If it moves again, or the push cannot happen by **07:20**, STOP and defer. |

## 3. Forward coverage table (Tuesday 10 → Wednesday 11 November)

A **hard cutoff** is the latest accepted actual job start plus the job timeout plus 15 minutes. The job's real start time comes from the GitHub jobs API (`started_at`); push time and scheduled time do not count.

**Nominal** times assume the job starts on schedule. No due time already fixed has been moved later. The only exception is F6, whose hard bound is extended explicitly in the F6 row.

| # | Component | Expected trigger | Accepted actual job start | Evidence required | Receipt due: nominal / **hard** | Slot |
|---|---|---|---|---|---|---|
| F1 | Tests (push) | the push | ≤ push + 30 min (**≤ 07:50**) | Proof §1 on `C'`, plus a **complete hosted log** showing every root file passing (not the badge or the tail), plus my local `tests/instrument-type` receipt | start + 25 / **≤ 08:15 (11:15)** | S0 |
| F2 | Intraday scanner (`main.yml`) | 13:10 (16:10) | first intraday job starting 13:10–**14:10** | Proof §1 (forward), plus a successful job and its ordinary delivered message. C-only text is supporting evidence only, never a substitute. | completion / **≤ start + 315, at most 19:25** | S1 |
| F3a | Watcher, 13:10 (16:10) run | 13:10 | any | Admission step logged as a no-op ("08:10 New York, before window"). **This does not count as coverage.** | (record only) | S1 |
| F3b | Watcher, 14:10 (17:10) run | 14:10 | ≤ **15:10** (18:10) | Proof §1, plus admission **admitted**, plus observation through the session (heartbeats in `data/ignition-live.json` to 15:00 New York = 20:00) and a published end-of-session commit | 20:25 (23:25) / **≤ start + 375, at most 21:25 (00:25)** | S1 → S2 |
| F4 | Watcher guard (bot loop) | first bot loop that pulls `C'` | n/a | **The first appearance** of `"version":2` / `"attempts"` in `data/watcher-guard.json` (the guard works 14:05–20:00). Later carried-forward copies do not count. | **≤ 20:15 (23:15)** | S2 |
| F5 | Calendar | 20:45 (23:45) | ≤ **21:45** | Proof §1, plus `data/calendar-status.json` written by this run (its `at` is within the job) **containing `officialSources`** | 21:20 / **≤ start + 35, at most 22:20 (01:20)** | S2 |
| F6 | Nightly scan | 21:30 (00:30) | ≤ **22:30** (01:30) | Proof §1, plus a successful job | 02:45 Wed (05:45) / **≤ start + 315, at most 03:45 Wed (06:45)**. This is a proposed bounded extension of the nominal 02:45 for a start delayed up to 60 minutes. A later start means FAILED. | S3 |

**Bot-loop scanner.** Adoption is not bounded (the pull loop can stay on old code). It counts as verified only if C-only delivered text appears in the ordinary course. Otherwise it is reported as **UNKNOWN**, and nobody solicits a message to produce it. It is never claimed as repaired.

**Results:**
- every F row PASS gives **VERIFIED**;
- F1–F3 and F5–F6 PASS with F4 and/or the bot-loop scanner UNKNOWN gives **VERIFIED, with bot-loop adoption UNKNOWN**;
- any F1, F2, F3b, F5 or F6 failed, missing at its hard cutoff, or showing a defect caused by C (wrong held stop or action, or a crash) gives **FAILED**, and recovery follows (§5).

## 4. Attendance slots (each needs Codex's advance confirmation by 06:30 Tuesday, **and** a reconfirmation on PR #1 at least 30 minutes before the slot starts)

| Slot | UTC (Kuwait) | Covers |
|---|---|---|
| S0 | Tue 06:30–08:15 (09:30–11:15) | Q3–Q6, P, F1 |
| S1 | Tue 13:00–15:30 (16:00–18:30) | F2 start, F3a, F3b start |
| S2 | Tue 19:30–22:45 (22:30–01:45) | F3b ≤ 21:25, F4 ≤ 20:15, F5 ≤ 22:20, F6 start ≤ 22:30 |
| S3 | Wed 02:30–05:15 (05:30–08:15) | F6 ≤ 03:45; a recovery push by 04:15; R1 ≤ 05:10 |
| S4* | Wed 13:00–15:30 | Restoration R2, R3 start |
| S5* | Wed 19:30–22:45 | R3 ≤ 20:55, R4 ≤ 20:15, R5 ≤ 22:20, R6 start ≤ 22:30 |
| S6* | Thu 02:30–04:15 | R6 ≤ 03:45 Thu |

\* Used only if a reversal happens. If the reversal happens earlier on Tuesday, restoration uses the next ordinary runs after it, inside the slots already confirmed (S1–S3 windows), and S4–S6 cover any runs left over on Wednesday.

**Coverage rules:**
- **Before the push:** any slot without advance confirmation means no push.
- **After the push:** a missed reconfirmation, or an absent operator, makes that slot's checks **UNVERIFIED**, which counts as FAILED. Recovery then happens in the next covered slot. If no covered slot remains: STOP, UNVERIFIED, and report to the owner.
- **My own presence:** I attend through check-ins scheduled in this session, one per slot. If the session is not running at a slot, that slot counts as uncovered. Nothing runs unattended.

## 5. Rollback (at most one reversal; no second forward attempt under this approval)

**Trigger:** a FAILED result in §3.

**Build:**
- On the then-current main `M1`, first establish the remote state, and confirm the 28 paths still equal `C'`. If they do not, STOP, mark UNVERIFIED and re-review.
- Build source-only `R`: the 28 paths set to their baseline blobs, everything else as on `M1`, data preserved.
- Run the local inventory on `R`. Its expected root file count is the number of root test files in `R` (144 on today's main, plus any newer tests main has gained), plus `tests/instrument-type`.
- Push `R` as a fast-forward with no force, by **failure + 30 minutes**. For the last forward check (F6 at 03:45 Wednesday) that is **≤ 04:15**.
- There is no dispatch, pause, settings change or probe.

**Restoration evidence.** Each item must be something the **old** code actually produces. C-only text and carried-forward `version 2` state never count.

| # | Component | Trigger | Accepted actual job start | Old-code evidence | **Hard** receipt |
|---|---|---|---|---|---|
| R1 | Tests (push of `R`) | the push | ≤ push + 30 | Proof §1 on `R`, plus a complete hosted log with every root file in `R` passing, plus local `tests/instrument-type` | start + 25 (at most 05:10 Wed for a 04:15 push) |
| R2 | Intraday scanner | next 13:10 weekday run | ≤ 14:10 | Rollback proof §1, plus a successful job | ≤ start + 315 |
| R3 | Watcher, restored workflow | **13:45** (08:45 New York; it waits until 9:25). The 12:45 early-exit run is not coverage. | ≤ 14:45 | Rollback proof §1, plus a job with **no** "Check watcher admission" step, plus observation lifecycle and a published commit | **≤ start + 370** (355 + 15); nominal 19:55, hard at most 20:55 |
| R4 | Guard (bot loop) | first bot loop that pulls `R` | n/a | The first **old-format** line in `data/watcher-starts.jsonl` (`byGuard` / `dispatched`, with no `source:'github_job'`) | ≤ 20:15; otherwise UNKNOWN |
| R5 | Calendar | next 20:45 weekday run | ≤ 21:45 | Rollback proof §1, plus `data/calendar-status.json` **rewritten by that run** (its `at` is within the job, written whole by the old `calendar.mjs` line 142) with **no** `officialSources` key | ≤ start + 35 |
| R6 | Nightly scan | next 21:30 weekday run | ≤ 22:30 | Rollback proof §1, plus a successful job | ≤ start + 315 |

**After the reversal:**
- It stays **UNVERIFIED** until R1, R2, R3, R5 and R6 all pass. R4 and the bot-loop scanner may end as UNKNOWN. Old processes may keep running until they end.
- If restoration fails: STOP, UNVERIFIED, report to the owner and propose a bounded correction. There is no blind retry and no second reversal.
- **R-A residual** (applies only after a reversal): the old calendar may show some figures without units until `calendar-status.json` reports a successful TipRanks `ok:` refresh, or every affected event is more than 3 days past. This can last weeks for future-dated events. No data rewrite or provider request is included.

## 6. Owner confirmations needed

- **Approval** of this exact plan for Tuesday 10 November only.
- **R-A:** accept or defer, using the exact wording.
- **$0:** the GitHub Actions spending limit is $0.
- **Reachability (optional):** whether the owner will be reachable during the slots.

## 7. Not included

- R1 encryption, K2 key setup, data acquisition, provider contact, workflow edits, dispatches, pauses, settings or secrets;
- any rule, gate or strategy change;
- any second forward push or second reversal.
