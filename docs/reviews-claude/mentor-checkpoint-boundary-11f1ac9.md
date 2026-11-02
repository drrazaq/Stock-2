# Review: alternative mentor committed-checkpoint boundary (Codex `11f1ac9a`)

**Reviewer:** Claude, 2 Nov 2026, read-only. No workflow control, cancellation, dispatch, deployment, protected credential, Telegram call or receipt work. This is a review, not a second operator.

## Verdict

The decision framing is sound and honest: it does not claim the missing original-run witness, it keeps the exact eight-file patch `1841837e…`, it keeps no-data-change / code-only inverse / natural drain, and it needs a revised owner approval. **One blocker (F1) must be fixed in the document before it can be offered for approval as written**; F2–F4 are corrections; F5 is supporting evidence.

## Findings

**F1 (blocker): the abort trigger contradicts the accepted baseline.** §4 "Restore or abort" rolls back if D "fails checks". Main's own push CI is already red for the accepted baseline reason: `tests.yml` run 41415702256 on main `cf74f7a3` (08:48 UTC) fails only `test/try-small-audit` cases **1** and **3b**, the expired-fixture disposition the revised approval asks the owner to accept. D's ordinary push CI will therefore fail the same way, and the procedure as written forces the inverse every time. Required wording: D passes only if the CI failure set on D equals the baseline set on M (same file, same two case names, no other failure), established from the CI log of both commits; any other failure triggers the inverse. Hosted CI took about 2 minutes, so the 20-minute decision limit is not a problem.

**F2: the 45-minute "no bot resumed" incident threshold is shorter than this cron's observed latency.** In the observed sequence, the `*/30` bot runs were created at 01:54, 02:43, 03:45, 04:51, 05:52, 07:02 and 08:38 UTC on 2 Nov: gaps of 49–96 minutes. After restoring the controls, the first new run commonly arrives more than 45 minutes later. Use about 120 minutes, or record a resumption past 45 minutes as an expected scheduling delay, not an incident.

**F3: the slot gate makes the drain always about 5.5 h; "prefer less remaining time" cannot be met.** Because `bot.yml` keeps one pending successor queued, a job starts the moment the previous one ends (job 125004035374: 22:44:33 → 04:15:04, 330.5 min; next job 125091176540 started 04:15:06). "Zero accepted successors" is true only between a job's start and the next created cron run, roughly 35–95 minutes. So T0 is always near a job start, and the remaining active time is about 5h30m. Projection (estimate only): the chain gives starts ≈ 09:45, 15:16, 20:46, then **≈ 02:17 UTC on 3 Nov**, inside the proposed 02:00–03:00 window. The likely run is then T0 ≈ 02:20 → drain ≈ 07:48 → restore by ≈ 08:18, inside the 09:20 cap. Drift or a broken chain moves the start; then skip, as the document says. The bot keeps serving during the drain.

**F4: the capability statement is out of date.** "Claude's capability audit remains pending" / `workflowControlCapability: UNKNOWN`. My read-only audit (reported 2 Nov) established:
- **Read:** `get_workflow` returns state for `bot.yml` (375564480) and `main.yml` (374437748): both **active**, last updated 30 Oct.
- **Control:** my connector has **no** enable/disable method (actions methods are run, rerun, cancel and delete-logs only).

So pre-state capture and readback are available to a reader, but the PUT `/disable` and `/enable` controls and restoration still need the owner's authenticated Actions UI or another supported operator interface. That remains a stop condition, as the document says.

**F5 (no change needed; confirms the document):**
- Only `bot.yml` and `main.yml` run `scan.mjs`. Other workflows only mention it in comments, and `tests.yml` loads it in tests.
- Pushing D triggers only `tests.yml`. `pages.yml` is limited to `index.html`; the other push triggers are limited to `run-*-now.txt`.
- `main.yml` crons are 21:30 UTC and `10,40 13-20` on weekdays, so nothing scans between 02:00 and 09:20 UTC.
- Main moved `49103932 → cf74f7a3` with one research-lab commit and no change to the eight mentor paths. Pins still need re-checking at execution.

## Not reviewed / unchanged
- The inactive receipt package (frozen, `54eb49fe`).
- The financial semantics of the mentor.
- Whether the owner should accept the uncertainty: that is the owner's decision.

MARKET-03/CATALYST-03 and acceptance (24/40) are unaffected.
