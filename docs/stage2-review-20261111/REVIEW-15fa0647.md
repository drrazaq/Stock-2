# Independent review of Stage 2 package 15fa0647 (handoff 6798352082)

- **Reviewer:** Claude.
- **Scope:** review only. Stage 1 (Thursday 12 Nov) stays frozen. No production action.
- **What was reviewed:** the package `docs/stage2-retry-20261111/` at `15fa064710d7e2110dd638ab7df392a83ec818b6`:
  - tool `stage2_retry.py`, sha256 `22e73407…9a0d`;
  - tested pin `5fccc6ec`, on a hypothetical Stage 1 base `61698a6f` over main `10a25bf6`.

## Reproduced independently

| Check | Result |
|---|---|
| Tool diff against A4 rev4 (`a76f315f`) | **Faithful.** Roles are derived from the binding. The `dependencies_ok` checks were added. Strict I8 (`nonDataCompatibleWithTested`) is kept. ADMIT is a per-push FIFO line read via `select` against the deadline. `timely` requires on-time and not LATE mode. The cap is limited to 1–3. |
| `build-objects.py` | **Identical `objects.json`.** 46 bound, 39 written, 39 inverse entries, of which 22 are absent after the inverse. |
| `check-dates.py` | PASS |
| `config-exercise.py` | 10/10, identical output |
| `admission-exercise.py` | 9/9, identical output |
| `offline-exercise.sh`, re-run locally | **40/40 PASS, exit 0.** Every case line and exit code is identical to Codex's log (F1–F19, I1–I10, S1–S3, L1–L8). F1 ran the full suite. |

## Corrections

### S2-4 (blocking for Friday A as dated): the tested pin will be stale before A, so the forward gate will STOP

The forward gate `nonDataEqualsTested` (`stage2_retry.py` around line 155) needs every non-`data/` leaf of the candidate to equal the tested tree `5fccc6ec`. That is correct and must stay. The problem is that **main's non-data code will almost certainly change between Thursday and Friday 09:00 UTC.** Main's own history shows the writers:

| Writer | When | Recent non-data pushes to main |
|---|---|---|
| Daily researcher | Thu 08:37 UTC (it does not run Fri) | 7, 8, 9, 10 and 11 Nov, each around 08:45–08:57 UTC. Today's was `4933429a` (idea 15), already inside `10a25bf6`. |
| Agent C | Thu 11:47 UTC | Last Thursday's run pushed code on **Friday 6 Nov, 01:51–03:24 UTC** (`e5702597` to `d536c765`). That is overnight, before a 09:00 A. |
| Agent A, Agent B | Sun, Tue | Agent A's run ended Tue 01:21 UTC, so Agent runs can spill across days. |

**Consequence:** on Friday the tool will (correctly) STOP at gate (a), which is offline case F5. Nothing breaks, but window A is lost. Saturday B fails the same way.

**What the package needs, without relaxing any gate:**
1. **A planned re-pin step**, after Thursday's writers settle and before Friday A:
   - rebuild the tested candidate on the then-current main (real Stage 1 plus Thursday's code), with `build-objects.py`;
   - get hosted Tests on the new pin;
   - focused review of the delta: only the writers' new files, plus a check that none of them imports or calls a Stage 2 path or one of the 22 deleted paths;
   - **fresh owner approval naming the new pin.**

   Alternatively, date A for a day whose preceding 24 hours have no scheduled code writer, and still check at readiness.
2. **State it in APPROVAL-DRAFT.md.** Approval of `5fccc6ec` covers that pin only. A re-pin is not silent and not automatic, which is consistent with REVIEW-PACKAGE "No silent tested-reference repin".
3. At readiness, **list main's non-data commits after the pin.** Any such commit means STOP before the first attempt, not a discovery mid-window.

### S2-5 (risk note, not blocking): human ADMIT latency against the data-commit rate

- Every attempt now waits for an attended ADMIT line. Data commits land on main every few minutes during the session, and the cap is 3.
- The rehearsal measured the barrier itself, not human reaction time. With 1–3 min per human ADMIT plus the suite (about 80 s in my local full run), the non-fast-forward probability per attempt is materially higher than the 74 s Stage 1 figure assumed.
- **Requested:** a short statement of the expected attempts-to-success, using the observed data-commit inter-arrival on recent sessions. Also, whether the ADMIT line can be prepared in advance (parent-independent fields), so only the parent needs confirming.

## Verdict

- **Tool, objects, dates, config and admission: PASS as reproduced.**
- **The package is not ready for owner approval as dated** until S2-4 is addressed in the package (re-pin procedure, or re-dating) and S2-5 is answered.
- Stage 1 is untouched. As of this review, main `10a25bf6` has only data commits after `d0e1a041`.
