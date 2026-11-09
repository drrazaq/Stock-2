# Combined release: same-day plan for Monday 9 November 2026 (PROPOSAL ONLY; nothing authorized)

This plan closes Codex 6737806469 / 6737852934 against `fde586d2`. Source and composition PASS (6737313043) stays closed. It covers **one date only, Monday 9 November 2026**. There is no fallback: a missed cutoff means DEFERRED, and any later date needs a new plan and a new owner approval.

All times are UTC (Kuwait = UTC+3; New York = UTC−5).

**State when prepared (10:36 UTC):**
- main `3ebf21b53e7986ce0482c579278d98895f9d8703`; only data files have changed since the candidate's parent `9c633192`;
- production `data/watcher-guard.json` has no `version`;
- running: bot run `42550984309` (in_progress since 02:26, already past its 350-minute timeout; noted only, not touched) and a Tests run on a non-main docs branch.

## 0. Identities and roles

- **Reviewed candidate:** `d52499c454d2cdf472993e696d3a2ba8f4f77ef3`. **Binding:** `1a799a15b06ce6e36c466a37702ba72830552fc9972d8ebd3a96311425da2dd4` (28 paths).
- **`C'`:** the forward commit actually pushed, built at Q4 on fresh main `M0`. Its 28 bound paths are the binding's blobs, and every other path is `M0`'s. **`C'` need not descend from `d52499c4`.** Its exact SHA and tree are posted on PR #1 before the push.
- **`R`:** the reversal commit, built only after a failure (§5).
- **Operator:** Claude, the only writer. **Verifier:** Codex, read-only. **Owner:** approves in advance; no action needed during the day.
- **No role's availability is assumed.**

## 1. Provenance rules

**P-code: the code a job actually ran.**
- Read the commit `S` from the job's checkout step log.
- Forward proof: `S` descends from `C'`.
- Every path changed in `C'..S` must be under `data/`. If any other path changed, I list each one and show it is outside the component's import closure (from its `import` statements), and Codex confirms. Otherwise the run counts as FAILED.
- Rollback proof: the same rules with `R`.

**P-def: the workflow definition a run used.**
- **Scheduled and `ref: main` jobs** (`main.yml`, `ignition.yml`, `calendar.yml`, `bot.yml`): the run's `head_sha` is the definition commit. It must descend from `C'` (from `R` after a reversal), with `.github/workflows/` unchanged since.
- **Mixed runs:** a run whose definition predates `C'` but whose code is `C'` is **MIXED**. It is never coverage. A MIXED watcher run that observes is FAILED.
- **`tests.yml`:** checks out the event's own commit (no `ref: main`). Its proof is a `push` event for `C'` (or `R`) with checkout `S = C'` (or `R`).

## 2. Readiness and push (any failure means STOP / DEFERRED)

| Step | Time | Requirement |
|---|---|---|
| Q0 | before 11:45 | Owner approval text received (§7), including the A1/A2 choices. Codex PASS on this exact plan pin. Codex **current** confirmation (§4) for continuous block **K1**, and for **K2** if any reversal happens. |
| Q1 | 11:45–12:10 | Fresh `M0`; the 28 paths equal the binding base (0 drift). |
| Q2 | 11:45–12:10 | Build `C'`, run `verify-unit` (must give 28/0), and post `C'` and its tree. |
| Q3 | 11:45–12:10 | Full local inventory on `C'` (root files plus `tests/instrument-type`) all pass. |
| Q4 | 11:45–12:10 | No Tests job running or queued for main. No `main`, `ignition` or `calendar` job running or queued. |
| W | ≤ 10 min before the push | **Current write check:** Codex posts "present now", referencing `C'`. The operator is present. |
| P | **12:00–12:15** | One fast-forward `git push origin C':main`, no force. If main moved, repeat Q1–Q4 and W once. If it moved again, or **12:15** has passed, STOP / DEFERRED. |

**Why 12:15:** it leaves 30 minutes before the old `ignition.yml` 12:45 cron, so no watcher run can start under the old definition with new code.

## 3. Forward checks (Monday 9 → Tuesday 10 November)

- **Failure time D** = the hard cutoff passing without a full receipt, or the time I post evidence of a defect caused by `C'`, whichever is earlier.
- **Actual start** = the jobs API `started_at`.
- **Every row** needs Claude's evidence comment plus Codex's independent current confirmation, both posted inside that row's receipt window.

| # | Component | Accepted actual start | Evidence | Hard cutoff |
|---|---|---|---|---|
| F1 | Tests on `C'` (push event) | ≤ push + 30 (≤ 12:45) | P-code / P-def (tests), a complete hosted log with every root file passing, and my local `tests/instrument-type` receipt | start + 25 (≤ 13:10) |
| F2 | First intraday `main.yml` run | 13:10–14:10 | P-def + P-code, a completed job, its ordinary message. C-only text is supporting only. | start + 315 (≤ 19:25) |
| F3a | `ignition.yml` 13:10 run | any | Admission step result **OPPOSITE_DST_CRON**. Not coverage. | record only |
| F3b | `ignition.yml` 14:10 run (the covering run) | ≤ 15:10 | P-def + P-code; admission **admitted**; heartbeats to 20:00; published end-of-session commit. Any partial observation is labelled **PARTIAL** and is not a PASS. | start + 375 (nominal 20:25, ≤ 21:25) |
| F4 | Guard adoption (bot loop) | n/a | **Adoption only, not complete guard behaviour:** the **first** commit after the `C'` push that introduces `"version":2` / `"attempts"` into `data/watcher-guard.json`, written by a bot job with P-code `C'`. The guard runner works 14:05–20:05 and decides 14:10–20:05. | ≤ 20:20, else **UNKNOWN** |
| F5 | `calendar.yml` 20:45 | **Original:** must finish by the fixed **21:20**. **With amendment A1:** start ≤ 21:45, cutoff start + 35 (≤ 22:20). | P-def + P-code, plus `calendar-status.json` written by this run (its `at` is within the job) **with** `officialSources` | 21:20, or ≤ 22:20 with A1 |
| F6 | `main.yml` 21:30 nightly | **Original:** must finish by the fixed **02:45 Tue**. **With amendment A2:** start ≤ 22:30, cutoff start + 315 (≤ 03:45 Tue). | P-def + P-code, completed job | 02:45, or ≤ 03:45 with A2 |

**Bot-loop scanner:** VERIFIED only on C-only text delivered in the ordinary course; otherwise UNKNOWN. Nothing is solicited.

**Final labels (exactly one):**

| Label | When |
|---|---|
| **VERIFIED-COMPLETE** | F1, F2, F3b, F5 and F6 PASS, **and** F4 and the bot-loop scanner PASS |
| **VERIFIED-CORE, ADOPTION UNKNOWN** | F1, F2, F3b, F5 and F6 PASS; F4 and/or the bot-loop scanner UNKNOWN (named) |
| **FAILED** | any of F1, F2, F3b (including PARTIAL), F5 or F6 not passing by its cutoff, any MIXED observing watcher, or any defect caused by `C'` |
| **UNVERIFIED** | coverage lost (§4); no claim is made |

## 4. Coverage (continuous; advance intent is not attendance)

| Block | Window | Who | Rule |
|---|---|---|---|
| **K1** | **Mon 11:45 → Tue 05:15** (latest F6 cutoff + 85-minute recovery envelope) | Operator + verifier, **continuously** | Codex confirms K1 at Q0. **At every F row** (inside its window) and **before every write** (≤ 10 minutes before), Codex posts a fresh current confirmation, and I post my evidence. A confirmation made earlier does not count. |
| **K2** (only after a reversal at time D) | **D → the last restoration cutoff + 15 min** (worst case Wed 03:45 + 15 with A2, or 02:45 + 15 without it) | Same rules | Confirmed before the reversal write. Without a current K2 confirmation, no reversal starts (see availability loss). |

**Availability loss (operator or verifier, at any moment):**
- **No write starts.** The current remote state and all data are preserved. The label is **UNVERIFIED**, and the owner is told the exact state.
- There is no "next slot" recovery, no unattended recovery and no automatic later attempt.
- If the loss happens after the push and before the final label, the system stays on `C'`, marked UNVERIFIED, until a separately approved action.

**My own presence:** check-ins scheduled in this session at every F row and every write. If the session is not running at one of them, that counts as availability loss.

## 5. Failure and reversal (at most one reversal; no second forward push)

**Envelope from the failure time D** (each step must also stay inside K1 or K2):

| Step | Deadline |
|---|---|
| Decision and current write check (W) | D + 20 |
| Reversal push of `R` | ≤ D + 30 |
| R1 actual start | ≤ push + 30 (≤ D + 60) |
| R1 receipt | ≤ start + 25 (**≤ D + 85**) |

Examples:
- F1 at 13:10 → R1 ≤ 14:35;
- F5 at 21:20 → R1 ≤ 22:45 (≤ 23:45 with A1);
- F6 at 02:45 → R1 ≤ 04:10 (03:45 → ≤ 05:10 with A2).

**Building R:**
- On the then-current main, the 28 paths must still equal `C'` (otherwise STOP / UNVERIFIED and re-review).
- `R` = the 28 paths set to their binding-base blobs, everything else as on main, with data preserved.
- The local inventory on `R` must pass: the root files present in `R` (144 on today's main, plus any newer ones) plus `tests/instrument-type`.
- One fast-forward push, no force; no dispatch, pause or probe.

**Restoration rows.** Each uses the **next ordinary runs after the `R` push** and old-code witnesses only. Every witness must be **fresh**: made after the `R` push, on the restoration day.

| # | Component | Accepted start | Old-code evidence | Hard cutoff |
|---|---|---|---|---|
| R1 | Tests on `R` | ≤ push + 30 | P-code / P-def (tests) on `R`, a complete hosted log with all of `R`'s root files passing, plus local instrument-type | ≤ start + 25 |
| R2 | Next intraday `main.yml` | first run in 13:10–14:10 | P-def + P-code `R` | start + 315 |
| R3 | Next restored `ignition.yml` **13:45** run (old cron; the 12:45 run exits early and is not coverage) | ≤ 14:45 | P-def + P-code `R`; **no** "Check watcher admission" step; observation lifecycle; publication | start + **370** (355 + 15) |
| R4 | Restored guard (bot loop) | n/a | The **first old-format line** in `data/watcher-starts.jsonl` (`byGuard` / `dispatched`, with no `source:'github_job'`) committed after the `R` push, with `d` = the restoration day. Lines already present never count. | ≤ 20:20, else UNKNOWN |
| R5 | Next `calendar.yml` 20:45 | as F5 (original 21:20, or A1) | P-def + P-code `R`; `calendar-status.json` rewritten by that run (`at` within the job) with **no** `officialSources` | as F5 |
| R6 | Next nightly 21:30 | as F6 (original or A2) | P-def + P-code `R`, completed job | as F6 |

**Restoration result:** R1, R2, R3, R5 and R6 must PASS; R4 may be UNKNOWN. Until then the label is **REVERSED-UNVERIFIED**. If restoration fails: STOP, UNVERIFIED, report to the owner. No further write.

**R-A residual (only after a reversal):** the old calendar may show some figures without units. It ends only with a successful TipRanks `ok:` refresh, or when every affected event is more than 3 days past.

## 6. Owner decisions (each separate)

1. **Approve** this Monday plan, or not. No other date.
2. **A1 (calendar):** accept start ≤ 21:45 with a cutoff ≤ 22:20, or keep the fixed 21:20.
3. **A2 (nightly):** accept start ≤ 22:30 with a cutoff ≤ 03:45 Tuesday, or keep the fixed 02:45.
4. **R-A:** accept, using the exact wording, or defer.
5. **$0:** confirm the GitHub Actions spending limit is $0.

## 7. Feasibility statement

**Today is feasible only if all of these exist by 11:45 UTC:**
- Codex PASS on this exact pin;
- Codex's current confirmation for continuous K1 (11:45 Mon → 05:15 Tue), and for K2 if a reversal happens;
- the owner's approval with decisions 1–5.

**At 10:36 UTC none of these exists.** Codex's latest handoff (6737852934) states that no future availability is presumed. If any is missing at 11:45, today is **DEFERRED**. The earliest alternative is a new single-date plan; as an example, Tuesday 10 November with push 07:05–07:20 under these same rules. It needs its own pin, its own review and its own approval.
