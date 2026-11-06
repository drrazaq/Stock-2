# Inactive watcher cadence refresh — ready for independent review, NOT approved

Codex,6November2026. This preserves the exact old reviewed ten-file artifact SHA256 **781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e**. No production/workflow action or collection is performed. Saturday's approved STOP R2 and D1–D4 bytes are unchanged; this is a separate **after-Saturday** proposal requiring its own review and owner approval.

## What the old package already fixes

- Guard inspects run/job/attempt evidence and the relevant day, instead of treating the newest run's creation time as observation start.
- A later duplicate cannot hide an earlier verified early stop. Missing/incomplete history remains UNKNOWN.
- Observation budget starts after bounded pre-open waiting (`RUN_START` at09:25), correcting early exhaustion around14:56 for a09:11process start.
- Workflow and runtime admission reject the opposite-DST queued schedule and recheck after cache/setup; correct-season late starts remain labelled partial.
- Per-run archives, richer canonical selection, message reservations/recovery and radar idempotency remain existing safeguards, not new strategies.

It **does not** fix minute-loop drift. Its wait still starts from `nowMs`, which is taken after snapshot/stop-watch work. It also retains the explicitly reviewed low-severity admission-in-progress attribution race; this refresh does not bundle that optional fix.

## November5 evidence independently checked

[Sanitized archive evidence](../reviews/calendar-health-166051d4/nov5-sanitized-evidence.json) and [sanitized complete-job counters](../reviews/calendar-health-166051d4/nov5-sanitized-log-counters.json), run42042506576/job127296700909/attempt1, deployed source377c351b9340bf3832e08c492d4db5a534af4dd6:

-317raw/usable heartbeat rows and317loops; two pre-open rows09:28/09:29, **315/331configured minutes** and315/390regular minutes.
-11isolated missing configured minutes plus14:56–15:00; last retained minute14:55. Nothing is reconstructed into those gaps.
- Source logs every30passes. Observed intervals are mostly31New York minutes, once32—not uniformly31. The source's post-work wait and the 2.5second-work counterexample reproduce this accumulated drift.
- Process-start09:11 plus345minutes exhausts the original START-based budget around14:56; the old781RUN_START change already addresses that separate loss.

Original archive bytes are unchanged. Raw production bodies are kept private locally; only clock/coverage counters and integrity hashes are published here. These facts do not establish fresh-price coverage, SEC access success, November6coverage, full16:00surveillance or profitability.

## Exact minimal addition and compatibility repair

**Runtime delta:** record `passStartedAt` at each pass's beginning and subtract **all pass work** from the existing60second wait. No catch-up observations are invented. Work longer than a minute still yields honest gaps and configured-end refusal. Two actual workflow/guard/watcher controls, one in each DST season, fail the old overlay with13missing slots under2.5second snapshot work, and pass the refreshed source with331/331configured slots.

**Necessary test integration delta:** after STOP R2, the old duplicate test searches for obsolete `STOP HIT NOW`. It fails even without a delivery defect. It now requires exactly one **STOP LEVEL REACHED**, verifies `do not sell again`, and requires no second message from the later recovery run. No assertion is removed or count weakened.

- `delta-from-781.patch`: **three paths** (runtime, existing test and one new cadence test), relative to current-main+STOP+D+the old781overlay.
- `production.patch`: **eleven paths** (the old ten plus the cadence test), relative to fresh-main+STOP+D. No STOP/D repair is bundled or redeployed. Patch SHA256 **6a361eca81204becf41bc2d731ad01343d774cfd2adf62ebc54db69d978df8b0**; code-only inverse **3253805799eb0554804c36aa6e2744004630e669b02f6faa681f3d36d7fafe9b**.
- [Manifest](manifest.json): exact before/after hashes,27dependencies, old-package drift, full overlay tree identities and data-preserving inverse. All38new pins must be checked against the actual future after-Saturday parent. Old whole-file approval/pins cannot be assumed compatible merely because a hunk applies.
- Compared with the old dependency manifest, early-alerts.mjs,stop-watch.mjs and test/load-scan.mjs have legitimate subsequent/STOP changes. The refreshed test is necessary because of the approved wording change. These files are **dependencies**, not additional watcher edits. The watcher source before-hash also changes under STOP.

The correction restores the intended once-per-minute cadence. It can increase actual snapshot/poll counts relative to the buggy62.5second loop; it does not add endpoints, extend the configured window or silently activate new collection. Approval must acknowledge that operational effect. Provider work above one minute remains a limitation; source freshness/quality is independent.

## Independent execution versus remaining review

Codex Node20.20.2 Linux,UID1000:
- **119/119 focused cases**, including STOP/D actual callers, DST/full-window, delayed setup, slow-source gaps, duplicate/canonical/delivery, publication/retry and radar-ledger controls.
- Fresh main137/137files; main+STOP+D+this refresh143/143files; main+STOP+D+calendar166051d4+this refresh146/146files. The calendar's adversarial7failures remain; its normal suite pass is not a release endorsement.
- Whole-tree apply/inverse restores the exact immediate parent, preserving data and STOP/D; combined overlay compatibility is separately verified. No historical research or original observation rows change.

These are **Codex author tests**, not independent approval of this refresh. The old reviewer4de7635b's PASS WITH CONDITIONS covers only781f… and its disclosed limitation. Request Claude's focused independent review of this exact new scope before any deployment decision. No new approval text, operator readiness or maintenance window is implied here.

After review/approval, actual fresh-source compatibility, a separately authorized safe natural boundary, exact code-only rollback and ordinary push CI would still be required. No cancellation, pause, dispatch or production message is part of this preparation. The known configured09:30–15:00window is not the full16:00session; provider/SEC quality, original cohorts and all trading/ZAD/accounting rules remain separate and unchanged.
