# Independent review: Codex inactive watcher-cadence refresh at `046877af` (`codex/calendar-health-watcher-review-20261106`)

Reviewer: the Claude session, 6 Nov 2026, offline only. Codex owns this package; this review changes none of its files.
- **Not done:** no deployment, workflow action, dispatch or provider call.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** this review is separate from Claude's calendar/health package and from Saturday's STOP + D (which it does not change).

## Verdict: PASS (offline) for the exact refresh; NOT approved for deployment

| Check | Result |
|---|---|
| **Package identity** | Production patch `6a361eca…df8b0`, inverse `32538057…fafe9b`, delta `2753853d…71f5` match. 11 paths. **main `ed057c2d` + STOP R2 + D1–D4 + the old reviewed 781 patch (`781f6644…`, re-hashed from `20ad7211`) + `delta-from-781.patch` gives a tree identical to main + STOP + D + `production.patch`.** So the refresh is exactly the reviewed 781 package plus the 3-path delta. |
| **Pass timing** | `passStartedAt` is taken at the top of each pass, and the wait is `60000 − (now − passStartedAt)`, so all snapshot and stop-watch work is inside the minute. Pre-open (`m < 568`: 30 s sleep) and `m > 900` exit are unchanged. |
| **Independent cadence probe** (actual workflow + guard + watcher fixture, 2 Nov season; snapshot work 0 / 2.5 / 30 / 59 / 65 s) | **With the refresh:** 331/331 configured minutes for work up to 59 s, 0 duplicate minutes, last minute 900. **65 s overrun:** 306/331, honest gaps about every 13 minutes, **no duplicates, no invented catch-up minutes.** **Same tree with only the two delta lines reverted:** 2.5 s → 318/331 (13 missing, matching Codex's claim) and 30 s → 220/331. |
| **Runtime budget** | The 781 change keeps `RUN_START` after the bounded pre-open wait, so 345 minutes count from 09:25. The probe ends about 351–352 minutes after a 09:10 start, with minute 900 observed. **Without 781** (base main + STOP + D) the probe ends at 345 minutes and loses 14:55–15:00, the 5 Nov loss. |
| **STOP compatibility** | Applies cleanly on main `ed057c2d` + STOP + D. With INCIDENT_WATCHER_SRC set: stop-alert-validity 17/17, stop-watch 3/3, gated watcher scenarios 9/9 and 11/11, message-publish 7/7, retry-recovery 9/9, D1–D4 23/23, leader-dip-entry-window 9/9. The patch's own tests: cadence 2/2, watcher-guard 14/14, nov2-clock 9/9, nov2-guard 15/15. The changed test requires exactly one `STOP LEVEL REACHED` with "do not sell again" (STOP R2's wording in `stop-watch.mjs`) and no second message. No assertion is removed or weakened. |
| **Attribution limitation** | **Unchanged by construction.** The guard and attribution code is byte-identical to the reviewed 781 package; the delta touches only the watcher loop and two tests. The disclosed low-severity admission-in-progress attribution race remains, as stated. |

## Observations (not blocking)

1. **Operational effect:** the corrected cadence takes about 3–5% more snapshots per session than the drifting loop (331 versus about 315–320). Codex states this; approval must acknowledge it. No endpoint, window or symbol change.
2. **Residual timer drift:** passes are now anchored to their own start, not to wall-clock minutes. Systematic timer lateness of about 10–100 ms per pass could make the phase cross a minute boundary roughly once per 600–6,000 passes, skipping one minute. That is negligible within a 331-minute session; minute-aligned scheduling would remove it. Recommendation only.
3. **Overruns over 60 s** still give gaps (correctly honest). Source latency is a separate limitation.

## Remaining before any deployment (unchanged from Codex's list)

- Owner approval.
- An after-Saturday fresh-parent pin check (all 38 pins).
- A safe natural boundary or approved maintenance.
- Code-only rollback with D-style writer checks.
- Hosted CI on the exact release commit.

It must not be bundled into Saturday's STOP + D scope.
