# Stage 1 amendment A4 (rev3): finite non-force publication and inverse with data-only recomposition

Proposal only; it authorizes nothing.

**What does not change:** the source (211cf164), the 9-path binding (afd2a30f), the inverse file, the F1 and recovery deadlines and the runtime-checkpoint rules of 6763576266, 6763727188 and 6763794974.

**What it changes:** only how the one approved forward push, and if needed the one inverse, are carried out.

**What prompted it:**
- the deferral of 11 Nov (6789538451);
- corrections 6789554579, 6790013856 and 6790459062 (A4-R1 to R4, the published-then-drift clarification, the late-publication rule, inverse compatibility and the fixed D clock).

## Tool

`stage1_retry.py`, sha256 `4521840a8722e844f13129e8577494541ce8664df39e6c5393f781f894f9b92b`. Python standard library and git only. Every rule is enforced in code.

| Rule | What the tool does |
|---|---|
| Cap | At most **3** attempts per mode. |
| Deadline | Forward: the approved push cutoff T+20. Inverse: D+30, the single inverse-publication envelope. |
| Deadline checks | (1) before each attempt; (2) **immediately before each push starts** (A4-R1). Every git, suite or push command has a timeout no longer than the time left before the deadline (at most 1 h per command and 10 min per push). |
| Clocks | **P** = `firstPushStart`, the earliest forward push *request*, counting refused attempts. It is the conservative clock for the F1 deadlines (Tests start ≤ P+30; receipt ≤ actual start+25) and is never reset. The **actual publication** time is bounded above by `remoteReadAt`, the moment the release was first observed on the remote. **D** is the ORIGINAL qualifying failure decision, passed as `--decision`. The inverse deadline must be ≤ D+30 (the tool refuses otherwise) and the inverse receipt is due by D+85; inverse attempts never reset D. After a deadline, only the read-only reconciliation runs (120 s budget); no write starts. |
| Bounded commands | Every git, cat-file, suite and push command has a timeout no longer than the time left. Local worktree cleanup is capped at 60 s. Binding identities check SHA-256 **and** byte length. |
| In-flight timeout | A push that starts but does not answer within its budget is classified from the remote only, and is never retried. |
| Identity (A4-R2) | Each of the 9 paths is compared as a **(mode, blob) pair, or absence**. BEFORE means the 5 before-blobs with their modes, and the 4 new paths absent. AFTER means the 9 binding (mode, blob) pairs. A mode-only change counts as drift. |
| Forward gates, recomputed for the current remote main M on **every** attempt | (a) every non-`data/` leaf of C equals the tested candidate `11c56c0a` (tree `e21606e8`: all workflows, dependencies, scripts and the test inventory); (b) diff(M, C) is exactly the 9 paths, with binding mode, SHA-1, SHA-256 and bytes; (c) M is BEFORE; (d) the inverse applied to C gives exactly tree(M); **(e) the full suite is run on a checkout of this C itself, inside the time left** (A4-R3). Evidence from an older parent is never reused. |
| Inverse gates (A4-R4) | R = M plus the 9 inverse entries (5 before-blobs, **4 deletions**). Required: M is AFTER; diff(M, R) is exactly the 9 paths; R is BEFORE on all 9 including absence; every other leaf of R equals M; and **every non-`data/` leaf of M other than the 9 equals the tested candidate's**. Newer non-data code (for example a new caller of a Stage 1 helper that the 4 deletions would break) means STOP: compatibility is unproven and the case goes to a separately reviewed decision. Data-only races are still allowed. No local suite is run, so recovery is not delayed. The receipt is the hosted Tests run on the published inverse by D+85. |
| Push | `git push --porcelain origin X:refs/heads/main`. Never forced, no rebase, no data restore. |

**Verdict.** It is decided from the push output **plus** a fresh remote read (ls-remote, fetch, ancestry, the full identity of the bound paths, and the non-data leaves).

| Verdict | Condition | Exit code |
|---|---|---|
| **PUBLISHED** | X is an ancestor of the remote main, the 9 paths are in the target state, (forward) the non-data leaves still equal X's, **and this was observed on the remote before the deadline**. | 0 |
| **PUBLISHED_LATE** | As PUBLISHED, but first observed on the remote only **after** the deadline. The publication FACT stands and is never retried; its TIMING is UNKNOWN/LATE and status is UNVERIFIED. | 5 |
| **PUBLISHED_DRIFT** | X is an ancestor, but the bound paths or non-data leaves changed afterwards. Status is UNVERIFIED. Never retried; it goes to the reviewed recovery decision. | 4 |
| **NOT_PUBLISHED** | **Only** on an explicit porcelain non-fast-forward rejection of `refs/heads/main`, with X absent from the remote main and all 9 paths still in the starting state. The only verdict that permits the next attempt. | (next attempt) |
| **UNKNOWN** | Everything else: exception or timeout, an exit code without a verdict, another rejection reason, an unreadable remote, a deadline reached while a push is unresolved. **STOP, no retry**, UNVERIFIED, reviewed recovery. | 3 |

Exit code 2 means STOPPED: nothing published, and a gate, the cap or the deadline stopped the run.

**Timing measured live (read-only dry run, 07:53:58–07:55:12 UTC, main `40e53c9c`):** one forward attempt takes **74 s**, including the full fresh suite (1417/1417). So 3 attempts fit within the 20-min push window after readiness.

## Offline exercise

`offline-exercise.sh` (sha256 `cfb3af4d234b459d1a6c5ba0bf5909595f2600c9d46d9d366d2c988f1750beda`), log in `offline-exercise.log`: **28/28 PASS**.

- **Setup.** A local bare repository stands in for GitHub; no network and no real remote. Every scenario starts from the real main `1239510a`.
- **Checks in every scenario:**
  - no history rewrite;
  - every concurrent data commit's files are kept;
  - **all 9 paths are checked by (mode, blob), and the 4 new paths by absence**;
  - in published forward cases, the inverse applied to the **final** remote main is exact on all 9 and changes no other leaf;
  - in inverse cases, newer data and unbound leaves are kept.
- F1 uses the real full suite on the fresh candidate. The other scenarios use a 4-file fast subset, except F16, which uses a failing suite.

**Forward scenarios:**

| Scenario | Outcome |
|---|---|
| F1 clean (full suite) | PUBLISHED |
| F2 data race | NOT_PUBLISHED, then PUBLISHED on the new parent |
| F3 two data races | PUBLISHED on attempt 3 |
| F4 a race on every attempt | cap STOP, untouched |
| F5 newer non-data change | gate STOP |
| F6 pushed, client error | PUBLISHED, no retry |
| F7 as F6 plus a later data commit | PUBLISHED via ancestry |
| F8 transport error, nothing sent | UNKNOWN |
| F9 rejection that is not non-fast-forward | UNKNOWN |
| F10 bound content drift | STOP |
| F11 deadline already passed | STOP |
| **F12 chmod-only bound drift** | STOP |
| **F13 pushed, then mode drift** | PUBLISHED_DRIFT |
| **F14 pushed, then source drift** | PUBLISHED_DRIFT |
| **F15 deadline crosses during preparation** | push not started, STOP |
| **F16 suite fails on the candidate** | STOP |
| **F17 push lands, then hangs past its budget** | PUBLISHED_LATE: publication is a fact, timing UNKNOWN, no retry |
| **F18 hang without a push past its budget** | UNKNOWN, no retry |
| **F19 server accepts only after the cutoff** | UNKNOWN at classification (never timely), no retry; the late landing is seen afterwards |

**Inverse scenarios** (forward already published, plus a data commit on top):

| Scenario | Outcome |
|---|---|
| I1 clean | PUBLISHED; 9 BEFORE including the 4 absent paths |
| I2 data race | PUBLISHED on retry |
| I3 a race on every attempt | cap STOP |
| I4 pushed, client error | PUBLISHED |
| I5 transport error | UNKNOWN |
| I6 main not AFTER | STOP |
| I7 deadline passed | STOP |
| **I8 newer non-data code after the release** | STOP, compatibility unproven |
| **I9 inverse deadline beyond D+30** | refused before any action |

## Session timing

Weekday constraint, unchanged: complete recovery receipt ≤ 12:10 UTC, 30 min before premarket at 12:40. So T ≤ 09:30 UTC and P ≤ 09:50 UTC.

**Proposed today, if agreed, approved and all three present:** T = 09:00 UTC (12:00 Kuwait), session 09:00–12:00 UTC (12:00–15:00 Kuwait).

| Step | Latest time (UTC) |
|---|---|
| Readiness, then tool attempts | push cutoff 09:20 |
| F1 Tests start | P+30 |
| F1 full receipt | ≤ P+55, so ≤ 10:15 |
| Decision D | ≤ 10:15 |
| Inverse publication | D+30, ≤ 10:45 (inverse tool, cap 3) |
| Inverse receipt | D+85, ≤ 11:40 |

The absolute latest T is 09:30 UTC.

**Replacement read-only runtime checkpoint:** Wednesday 21:15–22:00 UTC (Thursday 00:15–01:00 Kuwait). It is within 20 h of P, the A3 nightly-overlap rule applies, and no write is made there.

If today's band is missed, the next weekday uses the same arithmetic. No attendance is assumed.
