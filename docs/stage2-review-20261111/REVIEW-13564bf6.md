# Focused review: Stage 2 C1–C4 delta, checkpoint 13564bf6 (handoff 6795359858)

Review only. Stage 1 (Thursday) is frozen. No production action.

## Reproduction

- At `13564bf6`, `reconcile.py` ran with rc 0. The regenerated `composition-census.json` is **byte-identical** to the committed one.
- `test_delta.py`: 12/12 OK.
- All three pinned refs exist (`ee725432`, `716b1583`, `eb8806f5`).
- Object composition: 46 bound paths, 39 writes, 39-entry inverse, with no after-blob or inverse errors.

## C1 to C4: PASS on the text

- **C1 (census): accepted, including the premise correction.**
  - My closure in 6765112144 counted a workflow whose text *mentions* `scan.mjs` as loading it. That was my false positive.
  - Static and dynamic import tracing finds no path from `research-lab.mjs`, `squad17-lab.mjs` or `squad23-lab.mjs` to `scan.mjs`; the mentions are comments.
  - `comeback-lab.mjs` does `readFileSync('scan.mjs')`, a source read inside a single checkout, so its exemption reason holds.
  - The current-ref census lists bound references only for bot, calendar, comeback, discover, ignition, leaders-study, main, opportunity-radar and premarket, matching the stated classifications.
- **C2 (finite missing-witness disposition):** accepted. The same 39-path inverse at D_A if the minimum intraday run or the selected nightly is missing, with no indefinite renewal and no blame on the release.
- **C3 (blocked-census late recovery):** accepted. Same inverse at the first safe attended census, original D/H, LATE/UNVERIFIED labels, no reset, and NO-GO when no contingency is feasible.
- **C4 (prerequisites):** accepted. Stage 1 runtime PASS with no pending recovery; previous nightly created and complete; B ≥ 05:30 and after the actual late-nightly finish.

## Corrections required

**S2-1. Publication method.** PROPOSAL §A still says "one non-force source-only fast-forward … at most one rebuild inside the same cutoff". On 11 Nov that exact rule deferred Stage 1: data commits landed at 07:02:45, about 07:06 and 07:10:58.
- Stage 2 must use the reviewed A4 rev4 mechanics (cap 3, per-push deadline, fresh suite per candidate, NOT_PUBLISHED only on explicit NFF plus ancestry, UNKNOWN/LATE/DRIFT verdicts, inverse mode with D and D+30).
- **The A4 tool cannot be reused as is.** `stage1_retry.py` hard-asserts `len(files) == 9 and len(inv) == 9` and uses Stage 1 commit messages.
- A **parameterized variant** is needed (binding and inverse sizes from the files, pinned `--tested` Stage 2 candidate, Stage 2 messages). It must keep identical logic, with its own sha256 and an offline exercise at 46/39, including the 25 forward and inverse cases plus the I8–I10 analogues.

**S2-2. Inverse compatibility on researcher days.** The A4 inverse gate I8 requires every non-data leaf other than the bound ones to equal the tested candidate; I8 tests exactly this case.
- The daily researcher (cron `CRON_TZ=Asia/Kuwait 37 11 * * 0-4,6`, that is 08:37 UTC every day except **Friday**) commits code to main under its saved prompt. On any researcher day, a recovery or late reserve **after about 08:37 UTC** will find newer non-data code, and the inverse stops.
- Your shape puts the conditional LATE reserve at 10:30–12:30 UTC "next day". With A on a Friday (see S2-3), the next day is a Saturday researcher day, so the **reserve is infeasible as written**.
- **Choose one, before approval:**
  - (a) a dependency-derived inverse compatibility rule (new non-data files must not import or read any of the 46 bound paths, by the same tracer as C1), with tests;
  - (b) the owner explicitly approves holding the researcher for that one day (a task-settings change: separate owner decision);
  - (c) the reserve ends before 08:37 UTC.

  As your own C3 says, no feasible contingency means NO-GO before publication.

**S2-3. Actual calendar.** The appointment shape is otherwise arithmetically right: P ≤ 09:20 gives receipt by 11:40, under the 12:15 limit; D_A 07:30 plus 85 min is 08:55, within H at 09:00–09:20.
- C4 puts the earliest A after the Stage 1 runtime PASS, Thursday 21:15–22:00 UTC. That makes the **only near-term eligible A Friday 13 Nov, 09:00–12:00 UTC** (12:00–15:00 Kuwait), which is also the only weekday with no researcher run.
- B is Saturday 14 Nov from 05:30 UTC, after the Friday 21:30 nightly completes (observed up to about 6 h late).
- D_A is Saturday 07:30 UTC, with the inverse by 08:00 and the receipt by 08:55. That fits before the researcher fires at 08:37, but only just: the inverse must be published by 08:00.
- The late reserve needs S2-2.
- **Realistic dependencies to state plainly:**
  - Thursday's Stage 1 runtime check may itself be UNVERIFIED (zero completed C1′ main runs before 21:15), which blocks Friday.
  - GitHub delivered 0–2 intraday runs per day this week, so the C2 missing-witness inverse at D_A is a real, likely outcome, not an edge case.
