# Stage 1 amendment A4: finite non-force publication with data-only recomposition

Proposal only; it authorizes nothing. It changes only how the single approved push is carried out. The source (211cf164), the 9-path binding (afd2a30f), the inverse, the F1 and recovery deadlines and the runtime-checkpoint rules of 6763576266, 6763727188 and 6763794974 are unchanged.

**Why it is needed.** On 11 Nov, data commits landed on main at 07:02:45, about 07:06 and 07:10:58 UTC. The attempt was deferred because its one permitted recomposition was already used (6789538451, 6789554579). It incorporates every correction in Codex's 6789554579.

## The procedure

It is executable: `stage1_retry.py`, sha256 `086049ec973032187d5c3a2e96da78ca202b6822e5848fc1e60e658e4c891704`.

1. **Finite.** At most **3** push attempts, and none at or after the approved push cutoff (T+20 min). There is no extension and no shifted start.
2. **Fresh composition, every attempt.** Each attempt reads the current remote main M and builds C = M plus the 9 binding after-blobs. It requires, all recomputed for this M:
   - (a) **every non-`data/` leaf** of C (path, mode and blob, so all workflows, dependencies, scripts and the test inventory) is identical to the reviewed tested candidate `11c56c0a` (tree `e21606e8`). Any newer non-data change on main means STOP.
   - (b) diff(M, C) is exactly the 9 bound paths, with the binding mode, SHA-1, SHA-256 and bytes.
   - (c) all 9 paths on M are at their binding BEFORE state.
   - (d) the reviewed inverse applied to C gives exactly tree(M), so newer data is kept.

   No PASS from an older parent is reused for the current one.
3. **Push.** `git push --porcelain origin C:refs/heads/main`, never forced, with no rebase and no data restore.
4. **Verdict** comes from the push output **and** a fresh remote read (ls-remote, fetch, ancestry, and the state of the bound paths):
   - **PUBLISHED:** the remote main has C as an ancestor and carries the 9 after-blobs. This holds even if later commits sit on top, or the client saw an error.
   - **NOT_PUBLISHED:** *only* when there is an explicit non-fast-forward rejection of `refs/heads/main`, **and** the remote main does not contain C, **and** all 9 paths are still BEFORE. This is the only verdict that permits the next attempt, within the cap and cutoff.
   - **UNKNOWN:** anything else. That includes a network exception or timeout, an exit code without a porcelain verdict, any other rejection reason, an unreadable remote, or after-blobs present without C. It means **STOP, no retry**. Status is UNVERIFIED and the reviewed recovery and UNKNOWN safeguards apply.
5. **Evidence.**
   - The verifier's readiness PASS covers the tested non-data tree and these gates; every attempt's JSON line is posted for the verifier.
   - Source evidence for any parent that passes gate (a) is the tested candidate's: hosted Tests 42977333096 (150/150 files) and the local run (1417/1417).
   - The **F1 hosted Tests on the actually published commit** remain the release gate, with unchanged deadlines.

## Offline exercise

`offline-exercise.sh`, log in `offline-exercise.log`: **11/11 PASS**.

- **Setup.** A local bare repository stands in for GitHub; no network and no real remote. Every scenario starts from the real main 1239510a and the reviewed candidate.
- **Checks in every scenario:**
  - no history rewrite: the base stays an ancestor;
  - every concurrent data commit's files are still present;
  - in published cases, exactly one release commit, with the 9 after-blobs;
  - the inverse applied to the **final** remote main restores exactly the 9 before-blobs and changes no other leaf.

| Scenario | Outcome |
|---|---|
| S1 clean | PUBLISHED on attempt 1 |
| S2 data lands before the push | NOT_PUBLISHED, then PUBLISHED on the new parent; 1 data commit kept |
| S3 two data races | PUBLISHED on attempt 3; 2 kept |
| S4 data race on every attempt | STOP at the cap of 3; nothing published; 3 kept |
| S5 newer non-data change | gate (a) false, STOP |
| S6 pushed but the client errored | PUBLISHED by ancestry; no retry |
| S7 as S6, plus a later data commit on top | PUBLISHED, since main ≠ C but C is an ancestor; 1 kept |
| S8 transport error, nothing sent | UNKNOWN, no retry |
| S9 server rejection that is not non-fast-forward | UNKNOWN, no retry |
| S10 bound-path drift | STOP before any push |
| S11 cutoff passed | STOP before any push |

**Live dry run, read-only, 07:32 UTC:** against main 1239510a, all 4 gates are true and no push was made.

## Timing

Weekday constraint, unchanged: complete recovery receipt ≤ 12:10 UTC (30 min before premarket at 12:40). So T ≤ 09:30 UTC and P ≤ 09:50 UTC.

**Today:** the safe band is still open. It is feasible only with Codex AGREED, the owner's exact approval, and all three present at T.
- **Proposed:** T = 08:30 UTC (11:30 Kuwait); session 08:30–11:30 UTC (11:30–14:30 Kuwait).
- Readiness and push by 08:50; F1 receipt ≤ 09:45; D ≤ 09:45; inverse ≤ 10:15; inverse receipt ≤ 11:10.
- Absolute latest T is 09:30 UTC (12:30 Kuwait).

**Replacement read-only runtime checkpoint:** Wednesday 21:15–22:00 UTC (Thursday 00:15–01:00 Kuwait). It is within 20 h of P and keeps the A3 nightly-overlap rule; no write is made there.

If today's band is missed, the next weekday is the same arithmetic. Nothing is assumed about attendance.
