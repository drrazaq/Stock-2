# Opening-coverage remedy, rev4: bounded, default-off bot self-handoff (design only; separate review and approval)

- **Author:** Claude, operating-review owner.
- **This revision:** rev4 answers Codex's three implementation blockers (6804958775) on rev3 `54c0db42`: (1) the successor query, (2) reading a fresh remote head and checking source fingerprints, (3) which outcomes persist, ledger bounds and one hard time budget. Rev3 answered corrections A–F (6804230251) on rev2 `bc7cc028`. Rev1 `03c2b6c6`, rev2 and rev3 are superseded; §4 and §5 below replace rev3's versions.
- **Status:** nothing is implemented, activated or dispatched. Not part of Stage 1 or Stage 2.
- **Claim boundary:** this is a **bot-continuity improvement only**. It cannot guarantee an opening after a runner loss, job timeout or GitHub queue delay, and it is never advertised as "opening resolved". A supervised fallback using the existing manual start of the watcher stays a separate, separately approved alternative. It is not part of this design. Opening coverage is judged only by the watcher-cycle measures in §6.

## 1. Evidence (unchanged)

- ignition.yml's own crons arrive hours late (6, 9 and 10 Nov examples in TRACE §3), so every on-time start from 4 Nov came from the guard.
- The guard runs only inside bot.yml's loop.
- On 11 Nov there was no bot run between 12:27:23 and 15:01:54 UTC; the watcher was dispatched at 15:02:32 UTC = 10:02 NY.

## 2. Options

| Option | Why not, or why |
|---|---|
| A. Separate guard workflow with its own crons | Uses the same scheduler whose delivery is already hours late, so it adds no independent timing. |
| B. A `workflow_run` chain | GitHub documents: "You can't use `workflow_run` to chain together more than three levels of workflows" (docs.github.com, *Events that trigger workflows → workflow_run*). That rejects only a `workflow_run`-based perpetual chain; it is not a claim against every chain design. |
| **C. A bounded self-handoff by `workflow_dispatch` at the end of a bot run** | Recommended, with the controls below. |

## 3. Admission: default-off, checked fresh against remote main

1. **Existing markers.** I checked: there are **no existing owner, maintenance or release pause markers** in the repo (no `.github/*-pause|stop|maintenance*` files, and none in `watcher-guard.mjs` or bot.yml). None are invented. The only suppression controls are:
   - the new marker `.github/bot-handoff-enabled` (absent means off);
   - GitHub's own workflow-disable state.
2. **Fresh admission, twice, from a fetched remote head.** `git show` cannot read a commit the checkout does not contain, so each check fetches the exact head first:
   - `git ls-remote origin refs/heads/main` gives `H`;
   - `git fetch --no-tags --depth=1 origin refs/heads/main`; the fetched tip must equal `H` (any other value means STOP, no dispatch);
   - read `H:.github/bot-handoff-enabled` from that object.

   This runs (i) **before reservation** and (ii) **immediately before the POST**, at a new head `H2`. Fetches are read-only and depth 1, at most 2 per step.
3. **Source fingerprints at the fresh head.** At each check, the sha256 of `.github/workflows/bot.yml` and of the handoff helper (`.github/bot-handoff.mjs`) at `H`/`H2` must equal those of the **executing** checkout (`GITHUB_SHA`). A changed or rolled-back source means STOP: before reservation `SOURCE_CHANGED_NO_DISPATCH`; after reservation `SUPPRESSED_SOURCE_CHANGED`, with no POST. A run started from older code therefore can never dispatch under newer or rolled-back code, or the reverse.

   If the marker is absent or unreadable at either check: `SUPPRESSED`, with no POST.
   
   **Unavoidable residual:** a suppression that lands after check (ii) can't stop a POST already in flight. That is at most one dispatch per reservation.
4. **Cancellation and failure.** The step condition is `success() || failure()`, so a cancelled run never hands off.
5. **Inverse and recovery.**
   - Deleting the marker **stops future handoffs only**. It is not the source inverse.
   - The full rollback is the release's own exact inverse with its binding and checks, which are separate from the marker.
   - The ledger is always preserved.
   - Queued or active runs are **never cancelled** by this design; any cancellation needs separate approval.

## 4. Finite budget, spacing, blocking states and outcomes

**Ledger.** `data/bot-handoffs.jsonl`, keyed by NY trading `day`. Each reservation carries `{day, fromRun: GITHUB_RUN_ID, runAttempt: GITHUB_RUN_ATTEMPT, attempt n, reservedAt}`. That `(fromRun, runAttempt)` pair is the identity, so a **restarted step finds its own reservation and never reserves again.**

**Limits:**
- **Day cap:** at most K = 6 reservations per NY day, never reset by a successor. The 7th is `EXHAUSTED`.
- **Two separate spacing rules:**
  - run age: no reservation from a run alive under 60 min (`EARLY_EXIT_NO_HANDOFF`);
  - inter-attempt interval: no reservation within **120 min** of the previous reservation of any day (`SPACING_HOLD`).
- **Blocking states (rev4):** an earlier `RESERVED` with no outcome, an `UNKNOWN` or `TIMEOUT_UNKNOWN` outcome, or a malformed ledger line **blocks all further automatic dispatch, including on later days and from new runs**. It does so until an authoritative reconciliation line (`RECONCILED {ref, by, evidence}`) is added through the reviewed path. A pre-reservation `UNKNOWN_HISTORY_NO_DISPATCH` is fail-closed for its own run only and is not persisted (see the outcome table below).

**Successor check (rev4): one query per active status, no event filter.**
- For each `status` in `queued`, `in_progress`, `waiting`, `requested`, `pending` (5 GETs): `GET /repos/{owner}/{repo}/actions/workflows/bot.yml/runs?branch=main&status=<status>&per_page=100`, page 1 only. There is **no `event` filter**: a cron, push or dispatch successor must all count.
- Each answer is **complete** only if `total_count ≤ 100` and there is no `Link: rel="next"`. Every listed run must have `head_branch == main` and this workflow's `workflow_id`.
- Any listed run other than this run (`GITHUB_RUN_ID`) gives `SKIPPED_SUCCESSOR_PRESENT`.
- An incomplete answer, an error, a timeout or an unexpected branch or workflow gives `UNKNOWN_HISTORY_NO_DISPATCH`. That is fail-closed **for this run only** (see the outcome table): no dispatch happened, so there is nothing to reconcile.
- Rationale: an unfiltered history page always exceeds 100 after 100 bot runs, and a `created` or `event` filter can miss an older queued run. A per-status query is bounded by the number of runs actually active.

**Reservation, a single CAS push:**
- Read the exact remote head `H` (`ls-remote`) and fetch it (§3.2). Build the reservation commit on `H` touching **only** `data/bot-handoffs.jsonl`, then **one** non-force `git push origin <commit>:refs/heads/main`.
- **No pull, rebase or retry of the reservation.** A rejected or ambiguous push means: re-read the remote ledger and re-validate every invariant (pending, day cap, spacing, own identity).
  - If this run's reservation is now present: proceed.
  - If another reservation is present: `SKIPPED_PEER_RESERVATION`.
  - Otherwise: `RESERVATION_UNPUBLISHED_NO_DISPATCH`. There is **no second push attempt**.
- Two reservations therefore can't both publish from different parents.

**POST and attribution:**
- **Exactly one POST** per published reservation, with a 10 s timeout.
- **204** gives `DISPATCHED_UNCONFIRMED`, followed by **one** read-back after 30 s:
  - one new run with `event == workflow_dispatch`, `head_branch == main`, created after the POST, and with no other dispatch reservation open: `DISPATCH_CORRELATED`. That is correlation, not proof of causality.
  - anything else (none, several, or an ambiguous event mix with cron): `ATTRIBUTION_UNKNOWN`.
- **Timeout, reset or 5xx:** `UNKNOWN`. **4xx:** `DISPATCH_REFUSED`.
- No retries. Every reservation counts against K.

**Outcomes: which persist, and which block (rev4).**

| Outcome | Where | Blocks later dispatch? |
|---|---|---|
| `DISABLED` (no marker), `SUPPRESSED` (pre-reservation), `SOURCE_CHANGED_NO_DISPATCH`, `EARLY_EXIT_NO_HANDOFF`, `SPACING_HOLD`, `EXHAUSTED`, `BLOCKED_PENDING`, `SKIPPED_SUCCESSOR_PRESENT`, `UNKNOWN_HISTORY_NO_DISPATCH`, `RESERVATION_UNPUBLISHED_NO_DISPATCH`, `SKIPPED_PEER_RESERVATION`, `TIMEOUT_NO_DISPATCH`, and any pre-reservation error | **Job log (stdout) only.** Nothing is written. | No. No dispatch happened. |
| `RESERVED` | Ledger (the CAS push) | **Yes**, until an outcome or `RECONCILED` line follows |
| `SUPPRESSED_AFTER_RESERVATION`, `SUPPRESSED_SOURCE_CHANGED`, `SUPPRESSED_TIMEOUT` (no POST sent) | Ledger | No |
| `DISPATCH_CORRELATED`, `ATTRIBUTION_UNKNOWN` (204 received), `DISPATCH_REFUSED` (4xx) | Ledger | No |
| `UNKNOWN` (POST timeout, reset or 5xx), `TIMEOUT_UNKNOWN` (budget ran out during or after the POST) | Ledger | **Yes**, across days and runs, until `RECONCILED` |
| `RECONCILED {ref, by, evidence}` | Ledger, through the reviewed path only | Clears exactly one named blocking line |

An outcome that cannot be published leaves its `RESERVED` line open, so it **blocks** (§5). Cross-day blocking lines are never truncated, rotated or expired.

**Ledger bounds.**
- **Per NY day:** at most K = 6 reservation lines, K outcome lines and K reconciliation lines, so **≤ 18 lines**, each under 512 bytes, giving **≤ 9 KiB a day**.
- **Pre-reservation errors write nothing.** Reconciliation lines count inside the 18.
- **Reader:** parses only the day's lines plus any earlier line in a blocking state. A line that is malformed or over 512 bytes is itself treated as blocking (`UNKNOWN_LEDGER`), never skipped.

**One hard time budget per step (rev4).** There is a single monotonic deadline `D = start + 180 s`. Every operation gets `min(its own timeout, D − now)`, and an operation that cannot start before `D` is not started. The budget covers all of the following:

| Operation | Count | Own timeout |
|---|---|---|
| `ls-remote` | ≤ 2 | 10 s |
| Exact-head fetch | ≤ 2 | 20 s |
| Object reads | ≤ 4 | (local) |
| Status GETs | 5 | 10 s each |
| POST | 1 | 10 s |
| Read-back wait | 1 | 30 s |
| Read-back GET | 1 | 10 s |
| Pushes (1 reservation + ≤ 3 outcome) | ≤ 4 | 15 s each |

When the budget runs out:
- before reservation: `TIMEOUT_NO_DISPATCH`, stdout only;
- after reservation and before the POST: `SUPPRESSED_TIMEOUT`, no POST;
- during or after the POST: `TIMEOUT_UNKNOWN`, which blocks.

There is **no extended deadline** and no retry beyond these counts. **GET bound: 6** (5 status queries plus 1 read-back).

## 5. Persistence and rollback

- **Outcome lines** (not reservations) may use the repository's data-preserving pull/rebase/push pattern, ≤ 3 attempts, touching only `data/bot-handoffs.jsonl`.
- If an outcome can't be published, the open reservation **blocks** future dispatch (§4) until reconciliation.
- Rollback and recovery are as in §3.5.

## 6. Residual risk

- **No handoff in these cases:** a job hitting the 350-minute timeout, a runner loss, or scan/save work that overruns the 330-minute loop end and is killed.
- **GitHub queue latency** for a dispatched run is not controlled and is measured, not promised.
- **Cost:** I **withdraw** rev1's "minutes free" claim, which was not verified for this account. Before activation, the operator must establish the account's actual Actions billing and spending controls. The finite budget is K = 6 extra dispatches a day, plus the runtime of those runs.

## 7. Measures (prospective; failed days count)

- **Days:** the NY trading-day set comes from the repository's market-session calendar, including DST, holidays and early closes.
- **Per day, record:**
  - (a) the **first successful market cycle**: the minute of the first `heartbeat` entry in that day's archive. An archive without an original success clock counts as `UNKNOWN`, which is a failure;
  - (b) the bot inter-run gap across 12:00–14:30 UTC, adjusted for DST, from Actions run times;
  - (c) the ledger outcomes.
- **Target:** the first heartbeat by 09:30 NY on 10 of 10 consecutive trading days. A day with no archive or no heartbeat is a **failure**, not an exclusion. Run creation or a watcher job start alone does not count.

## 8. Required tests (offline fake Actions API plus a local bare remote)

1. Disabled by default: no marker means no API call.
2. A cancelled run means no step.
3. A marker removed on the remote between the checked-out commit and the reservation, or between the reservation and the POST, gives SUPPRESSED.
4. A successor in each of the five statuses means a skip.
4b. A queued **cron or push** successor (any `event`) is detected; a queued run older than the latest 100 runs is still detected by its status query.
5. An API error, `total_count` > 100 or a `Link: next` header on **any** of the 5 status queries means no dispatch, and nothing is written to the ledger.
5b. A new remote head not present in the checkout is fetched and read. A fetched tip that differs from `ls-remote` means STOP. A changed or rolled-back `bot.yml` or helper fingerprint at the fresh head means `SOURCE_CHANGED_NO_DISPATCH` before reservation and `SUPPRESSED_SOURCE_CHANGED` after it.
5c. Every outcome follows the persistence table: stdout-only outcomes leave the ledger byte-unchanged; durable outcomes add exactly one line; the per-day bounds of 18 lines and under 512 bytes per line hold under the worst-case sequence; a malformed or oversized line blocks.
5d. The budget: a fake clock exhausts it at each phase (before reservation, between reservation and POST, after the POST) and gives the three outcomes above, with no call started after `D`.
6. A peer reservation race: two runs build on the same `H`, one push wins, and exactly one POST results. A rejected push never rebases.
6b. A restarted step with the same `(fromRun, runAttempt)` doesn't reserve again.
6c. An open RESERVED or UNKNOWN blocks the next run and the next day.
7. 204 with one matching workflow_dispatch run gives CORRELATED; with zero or several runs, or a cron race, it gives ATTRIBUTION_UNKNOWN; timeout or 5xx gives UNKNOWN; none of these retry.
8. The cap: the 7th attempt is EXHAUSTED, and a successor doesn't reset the count.
9. A run shorter than 60 minutes gives EARLY_EXIT.
10. An outcome-push failure leaves the reservation, which is read as UNKNOWN.
11. Concurrent data commits are preserved.

## 9. Scope and sequencing (unchanged)

`.github/workflows/bot.yml` is a Stage 2 bound write path. This can only be an exact release built on the **published and verified Stage 2 tree**, with its own binding, inverse, tests, hosted receipt, review and owner approval for **activation** (the marker), and a separate cost check. Codex implements once this design is agreed. I review.
