# Opening-coverage remedy: smallest host-independent guard invocation (proposal for separate review and approval)

- **Author:** Claude (operating-review owner, per 6803898974).
- **Status:** design only. Nothing is implemented, dispatched or approved. Not part of Stage 1 or Stage 2.

## Evidence (TRACE §3; corroborated by Codex 6802479187)

1. **ignition.yml's own crons arrive hours late:**
   - 10 Nov at 20:01 and 20:36 UTC;
   - 9 Nov at 22:43 and 23:09;
   - 6 Nov at 19:42 and 20:05.
   
   Every on-time start from 4 Nov onwards was `byGuard` (`data/watcher-starts.jsonl`).
2. **The guard runs only inside bot.yml's loop** (every 5 min within a run of up to 330 min). Its runs are back-to-back, and coverage depends on whether a run is alive at 09:10 NY.
3. **11 Nov:**
   - scheduled bot run 42975970718 ended at 12:27:23 UTC;
   - the next scheduled bot run 43044236679 was created at 15:01:54;
   - the guard dispatched the watcher at 15:02:32 UTC = 10:02 NY.
   
   The 32 regular minutes plus the pre-open record were lost.
4. **No GitHub schedule on this repo can be assumed timely.** A remedy must not depend on a further cron.

## Options considered

| Option | Depends on GitHub schedule? | Verdict |
|---|---|---|
| A. New `watcher-guard.yml` with its own crons around 13:30–14:30 UTC | Yes, the same delivery that already arrives hours late | Rejected as the primary remedy |
| B. `workflow_run` on bot.yml completion → dispatch the next bot run | No, but GitHub limits `workflow_run` chains to 3 levels, so a perpetual chain breaks | Rejected |
| **C. End-of-run self-handoff in bot.yml: before exiting, dispatch the next bot.yml run** | **No.** `workflow_dispatch` via `GITHUB_TOKEN` (already `actions: write`, as the guard uses it today) | **Recommended** |

## Exact proposed delta (option C)

One new step at the end of the `reply` job in `.github/workflows/bot.yml`, with `if: always()` so it also runs after a loop failure.
1. **Read-only duplicate check:** `GET /repos/{repo}/actions/workflows/bot.yml/runs?status=queued` and `?status=in_progress`. If any run other than the current `GITHUB_RUN_ID` exists, **skip**; the existing concurrency group `bot` already holds a successor.
2. **Otherwise**, exactly **one** `POST …/workflows/bot.yml/dispatches` with `ref: main`. No inputs: `accounting_preflight` defaults false, so this is an ordinary bot run.
3. **Durable record:** append one line to `data/bot-handoffs.jsonl` with `{at, fromRun, action: DISPATCHED|SKIPPED_SUCCESSOR_PRESENT|DISPATCH_FAILED, http}` in the same save that the loop already performs.
4. **Failure:** any non-2xx leaves `DISPATCH_FAILED`, with **no retry loop**. The existing `*/30` cron stays as the fallback.

**Bounds:**
- At most 1 dispatch per bot run, which at a run length of about 5.5 h is at most about 5 per day.
- Minutes are free for this public repository, per the bot.yml header.
- No new secret, no new permission, no new workflow file, no change to `watcher-guard.mjs` logic, reservations, history or ambiguity budgets.

**Not covered:** a run killed at the 350-minute job timeout before the step. Mitigation: the loop already ends at 330 min, leaving 20 min of margin. A hard runner loss still falls back to cron.

## Scope and sequencing constraint

- **`.github/workflows/bot.yml` is one of Stage 2's 39 bound write paths**, so this delta **cannot** be composed before or into Stage 2.
- It must be built on the **published and verified Stage 2 tree**, as its own exact one-path release with its own binding, inverse, tests, hosted receipt, review and owner approval.
- If Stage 2 does not publish, re-base it onto the then-current bot.yml and re-review.

## Measurable acceptance (prospective, no timeliness promise)

| Measure | Record | Target to call it working |
|---|---|---|
| Bot inter-run gap | Actions run created/updated times (Codex corroborated these via the API) | Median gap under 2 min; no gap over 15 min covering 13:00–14:15 UTC on 10 consecutive weekdays |
| First guard cycle | first guard log line ≥ 13:00 UTC each weekday | Before 09:10 NY on 10 of 10 weekdays |
| Watcher start | `data/watcher-starts.jsonl` `started` | ≤ 09:20 NY on 10 of 10 weekdays, counting days by date not by success |
| Handoff ledger | `data/bot-handoffs.jsonl` | One record per bot run; any `DISPATCH_FAILED` reported in SYSTEM HEALTH |

If GitHub itself delays a `workflow_dispatch`, that is measured, not hidden. **No timeliness guarantee is claimed.**

## Tests required with the delta

- **Offline harness with a fake Actions API:**
  1. no successor → exactly 1 dispatch;
  2. successor queued → 0 dispatches;
  3. API 4xx/5xx → recorded failure, no retry;
  4. loop failure → the step still runs.
- Existing bot/guard suites unchanged.

**Ownership:** Claude owns this proposal and its test harness design. Codex keeps implementation ownership of all application files. No file overlap until Codex accepts.
