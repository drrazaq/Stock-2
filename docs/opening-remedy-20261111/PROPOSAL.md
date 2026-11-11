# Opening-coverage remedy, rev2: bounded, default-off bot self-handoff (design only; separate review and approval)

- **Author:** Claude, operating-review owner.
- **This revision:** answers Codex's CHANGES REQUIRED (6804043228). Rev1 at `03c2b6c6` is superseded.
- **Status:** nothing is implemented, activated or dispatched. Not part of Stage 1 or Stage 2.
- **Claim boundary:** this mechanism reduces gaps between bot runs. It is **not** called a dependable opening by itself. Opening coverage is judged only by the watcher-cycle measures in §6.

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

## 3. Admission: default-off, suppressible

1. **Off unless enabled.** The step does nothing unless `.github/bot-handoff-enabled` exists on the run's checked-out `main` commit. That follows the `private-data-mode` marker pattern. Creating it is the separately approved activation; deleting it is suppression and rollback.
2. **Owner cancellation and failure.** The step condition is `success() || failure()`, never `always()`. A **cancelled** run (owner or release cancellation) never hands off.
3. **Pauses.** It does not run if any existing owner, maintenance or release pause marker is present. The implementation enumerates the exact existing markers. An unreadable marker or settings file means no handoff (fail closed).
4. **Disabled workflow.** A dispatch to a disabled workflow fails, and that is recorded below. There is no workaround.

## 4. Finite budget, spacing and outcomes

The durable ledger is `data/bot-handoffs.jsonl`, keyed by New York trading `day` and `chainId`, which is the first run of the day's chain.

**Day cap: K = 6 dispatch attempts per NY calendar day,** counted from the ledger and never reset by a successor run. On the 7th: `EXHAUSTED`, no dispatch.

**Minimum spacing:** no dispatch if the current run lived for less than 60 minutes. That is recorded as `EARLY_EXIT_NO_HANDOFF`, so repeated early failures can't form a chain.

**Successor check before any reservation:**
- one page of `GET …/workflows/bot.yml/runs?branch=main&per_page=100`;
- statuses `queued`, `in_progress`, `waiting`, `requested` and `pending` other than the current run are each treated as a successor;
- any successor means `SKIPPED_SUCCESSOR_PRESENT`;
- an API error, an incomplete page or a `head_branch` that is not `main` means `UNKNOWN_HISTORY_NO_DISPATCH` (fail closed);
- the queued list alone is not treated as proof that no successor exists.

**Shared reservation, compare-and-swap by git push:**
- Append `RESERVED {day, chainId, fromRun, attempt n}` and push with the repository's existing pull/rebase/push pattern.
- **Only after that push succeeds** may the POST be sent.
- A failed push means re-read: if another `RESERVED` exists for the same day after the last outcome, record `SKIPPED_PEER_RESERVATION`. Otherwise record `RESERVATION_UNPUBLISHED_NO_DISPATCH`. Never POST on an unpublished reservation.

**POST outcomes, exactly one POST per reservation:**

| Response | Outcome | Next step |
|---|---|---|
| HTTP 204 | `DISPATCHED_UNCONFIRMED` | One bounded read-back (≤ 60 s) for a new bot.yml run created after the POST: `DISPATCHED_CONFIRMED`, else `DISPATCH_AMBIGUOUS`. Never retried. |
| Timeout, reset or 5xx | `UNKNOWN` | It may have been accepted. No retry. |
| 4xx | `DISPATCH_REFUSED` | Status recorded. |

Only `DISPATCHED_CONFIRMED` counts as a successful handoff. Every reservation counts against K whatever its outcome.

## 5. Persistence and rollback

- **The step does its own publication.** It can't call the loop's shell-local `save()`. It runs its own `git add data/bot-handoffs.jsonl`, commit and push, with the same 5-attempt pull/rebase pattern, and touches **only** that file, so concurrent data commits are preserved.
- **If the outcome line can't be published:** the reservation line stays as the durable fact, and the next run or the health check reads a reservation without an outcome as `UNKNOWN`.
- **Rollback:** delete `.github/bot-handoff-enabled`. The cron fallback remains.

## 6. Residual risk

- **No handoff in these cases:** a job hitting the 350-minute timeout, a runner loss, or scan/save work that overruns the 330-minute loop end and is killed.
- **GitHub queue latency** for a dispatched run is not controlled and is measured, not promised.
- **Cost:** I **withdraw** rev1's "minutes free" claim, which was not verified for this account. Before activation, the operator must establish the account's actual Actions billing and spending controls. The finite budget is K = 6 extra dispatches a day, plus the runtime of those runs.

## 7. Measures (prospective; failed days count)

- **Days:** the NY trading-day set comes from the repository's market-session calendar, including DST, holidays and early closes.
- **Per day, record:**
  - (a) the **first successful watcher cycle**: the minute of the first `heartbeat` entry in that day's archive;
  - (b) the bot inter-run gap across 12:00–14:30 UTC, adjusted for DST, from Actions run times;
  - (c) the ledger outcomes.
- **Target:** the first heartbeat by 09:30 NY on 10 of 10 consecutive trading days. A day with no archive or no heartbeat is a **failure**, not an exclusion. Run creation or a watcher job start alone does not count.

## 8. Required tests (offline fake Actions API plus a local bare remote)

1. Disabled by default: no marker means no API call.
2. A cancelled run means no step.
3. A pause marker means no call.
4. A successor in each of the five statuses means a skip.
5. An API error or incomplete page means no dispatch.
6. A peer reservation race: two finishing runs produce exactly one POST.
7. 204 with a visible run gives CONFIRMED; 204 with no run gives AMBIGUOUS; timeout or 5xx gives UNKNOWN; none of these retry.
8. The cap: the 7th attempt is EXHAUSTED, and a successor doesn't reset the count.
9. A run shorter than 60 minutes gives EARLY_EXIT.
10. An outcome-push failure leaves the reservation, which is read as UNKNOWN.
11. Concurrent data commits are preserved.

## 9. Scope and sequencing (unchanged)

`.github/workflows/bot.yml` is a Stage 2 bound write path. This can only be an exact release built on the **published and verified Stage 2 tree**, with its own binding, inverse, tests, hosted receipt, review and owner approval for **activation** (the marker), and a separate cost check. Codex implements once this design is agreed. I review.
