# Inactive bot continuity remedy — development only

Base: Stage 2 C0 5fccc6ec3e18c426531a0398b5085e2621a6e192. This isolated branch changes only the bot wrapper, adds its helper/test and these docs. No marker, ledger, settings, credentials, dispatch, production push or activation. Thursday's Stage 1 and reviewed Stage 2 remain unchanged.

The observed November 11 host gap was between bot completion 12:27:23 UTC and the next bot creation 15:01:54. The watcher dispatch at 15:02:32 was late. These facts do not establish why GitHub did not supply a host earlier. Another cron alone cannot guarantee coverage.

The proposed remedy lets a normally finishing, sufficiently long-lived bot reserve and request one successor when no active successor is visible. It is not an independent timer. Host death, cancellation, runner timeout, permission denial or GitHub outage can still leave a gap. A supervised existing dispatch needs its own bounded operation approval and actual attendance.

## Actual boundary and budgets

- Marker .github/bot-handoff-enabled containing exactly enabled is ABSENT. Default-off entry returns before Git/API work. No always() continuation: step condition success() || failure() respects cancellation.
- Existing bot permissions unchanged. The helper step receives only github.token, not provider/Telegram/private secrets. No provider calls.
- Actual loop-start time and source hashes are recorded before the loop. Missing/young/unparseable witness stops. The helper executes immutable bytes extracted from GITHUB_WORKFLOW_SHA into RUNNER_TEMP, not the pull-updated working tree. The GitHub-loaded workflow commit must also agree with the executing disk workflow. Changed workflow/helper at end or fresh remote stops.
- Current run must appear in in_progress. Five bounded status queries also cover old queued/waiting/requested/pending successors, without a created-time/event filter. Any pagination or unreadable history stops.
- At most six GETs (five status queries and one readback), each at most 2 MiB streamed, one POST, no POST retry/redirect. One 180-second monotonic budget covers all operations. The 30-second readback wait is never shortened to pretend it completed.
- Two ls-remote checks bracket admission/reservation. Fetch must equal the advertised head. At most FOUR fetches: two admission checks and up to two additional fresh-head outcome retries. This explicitly corrects rev4's two-fetch claim: publication retries require fresh heads. Each fresh snapshot reads four paths (marker, two source files, ledger), at most 16 object bodies plus one loaded-workflow body. Local tree metadata reads establish absent versus unreadable/symlink paths. No four-object-read claim.
- Reservation is a single non-force push with exact fetched-head parent, no rebase/retry. Ambiguous reservation push is reconciled read-only; even an observed own reservation suppresses POST for that attempt. Losing a CAS race never force-pushes.
- Outcome publication can retry at most three non-force pushes, total at most four pushes including reservation. Its commits change only data/bot-handoffs.jsonl and preserve every other fetched path. Unpublished outcome leaves the reservation blocking.
- At most six reservations per New York day, 120-minute spacing, actual loop age at least 60 minutes, at most 18 lines/day, each less than 512 bytes. Whole ledger at most 4 MiB/8192 lines. Oversize/malformed/unreadable history blocks, never truncates. Unresolved/UNKNOWN records do not expire across days.
- HTTP 204 plus one compatible later run is CORRELATED, not causal attribution. Absent/multiple readback is ATTRIBUTION_UNKNOWN, never a duplicate POST. A65-second minimum pre-POST budget suppresses an unstarted POST without ambiguity. After204, any wait/readback failure is ATTRIBUTION_UNKNOWN, not unknown delivery. Timeout/reset/5xx on a started POST leaves UNKNOWN blocking until separately reviewed reconciliation. Refused 4xx is reported as refused. No automatic cleanup or ledger edits.

## Validation and remaining gates

Focused offline tests exercise the actual orchestration, reservation-before-POST, old queued successors, missing current run, source/marker changes, lost reservation, unknown delivery, refusal, limits, default-off entry and a real local bare-remote nonforce CAS race. The local Git test proves newer data preservation and scope; it does not prove GitHub service availability.

Required before activation: independent exact-source review, full exact-commit inventory/hosted receipt, fresh post-Stage-2 composition and inverse, actual zero-spend/access checks, separate owner workflow/marker authorization, bounded recovery with actual attendance. Failure remedy disables future handoffs by separately approved marker removal, preserves ledger and data, and applies the source-only inverse only after writer quiescence and head validation. A pending workflow is never automatically cancelled. Current implementation is not production-ready or proof of opening coverage.

Prospective acceptance uses retained first successful market-cycle evidence by 09:30 New York on ten consecutive trading days, with missing archives counted as failure and holidays/early closes/DST respected. Job-created time is not coverage. No collection or activation is authorized by this document.

H1–H3 focused review corrections applied after the original0c702fa3 full local inventory completed PASS in150.164s, without restart/cancellation. New exact-commit validation is required and separately retained.
