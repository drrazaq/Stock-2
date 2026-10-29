# Stock-2 engineering continuation — 29 October 2026

Continue from the remote HEAD of Stock2-safety-fixes; do not repeat completed fixes. Draft PR #1 stays draft. No merge, deployment, live workflow dispatch/message, trade, secret/permission change or paid service was performed. All publication uses explicit files and expected-head leases; the local directory remains a partial materialization, not a full Git clone.

## New published engineering milestones

- ae7db3f6d5a0c417779014a359eb730ae254f8af: truthful guard dispatch state and durable notification ACKs. 1,213 local tests; exact PR 40813360425, push safety 40813356276, push tests 40813356188 all passed.
- 1b3a7518240be6c7f9e252f80e0bd1955f68e6d7: bounded close/half-day lifecycle, checkpoints, actual-cycle heartbeat transport and guard health, per-attempt evidence archives, secret-free E2E. 1,224 local tests; exact PR 40814880096, push safety 40814875183, push tests 40814875121 all passed.
- 2e37078b7ea4abbcd3ff29158da43262ecc45c35: nine-lane research runtime, conservative availability provenance, daily first-ingestion and observed-price lead measurements. 1,230 local tests; exact PR 40816080789, push safety 40816074277, push tests 40816074355 all passed.
- 6ac9798d38c7732d3fd472a1225cfb5729ea0065: include the 16:00 / 13:00 close boundary scan without inflating 390/210 scheduled minutes. 1,230 local tests; exact PR 40816438683, push tests 40816433488, safety 40816433481 all passed.
- 35eb0bba1a5c76695338288f090385a63bbd7283: accepted requests cannot causally claim an independently running job. 1,231 local tests; exact PR 40816601733, safety 40816596402, push tests 40816596298 all passed.

Older verified work is preserved: recovery 352316e, freshness 2d276c3, actual job timing 812f0c7, documentation checkpoint 925149a. Do not reapply the original recovery bundle. Frozen/rejected strategies, ZAD gates, costs, verdicts, owner settings/holdings and datasets are unchanged. GitHub comparisons and local blob hashes have shown zero data-file changes; recheck at final checkpoint.

## Implemented behavior and operational boundaries

Opening watch job ends at 14:00 NY; closing job restores a completed-cycle artifact and continues through the scheduled close. Both jobs are bounded below six hours, use pinned code/current data, and block branch live I/O. Reviewed NYSE 2026/2027 holidays and 13:00 half days are in market-session.mjs; unknown years fail closed. Close samples include the boundary itself; they are not proof of a closing-auction fill. Scheduling/transfer gaps are not hidden: full coverage requires every regular minute, with 390 normal / 210 half-day denominators. Real deployments may show gaps; do not claim guaranteed continuous GitHub scheduling.

Runtime checkpoints preserve seen/cap/research state, shadow evidence and discovery timing; current alert-level settings override old checkpoint values. A missing, mismatched or malformed checkpoint permits research observation only and suppresses outbound trade/stop messages. Runtime state travels as a short-lived artifact, not a committed owner-data file. Save conflicts fail visibly rather than choosing -X theirs. Every completed attempt archives shadow, delivery and discovery evidence before canonical selection.

Completed cycles produce atomic runtime/watcher-heartbeat.json plus structured logs. Metrics: received/evaluated/fresh counts; fresh % of evaluated symbols, not a verified tradable universe; price age; request/cycle latency/errors; last completed cycle; last cycle with usable fresh prices. Existing contents-write GITHUB_TOKEN publishes a per-attempt heartbeat every three minutes on main. Guard reads these records and marks unknown/degraded/stalled (>5 minutes) versus recent scanning. Job status alone never means healthy. Transport failures are not success; compare telemetry with actual job timing and scan evidence.

Guard intent is persisted before dispatch. Only HTTP 204 is an ACCEPTED REQUEST, not execution proof. Failed/unconfirmed attempts remain rate-limited; old optimistic state migrates to unknown attempts. Telegram notifications remain queued until message-ID acknowledgment. Job log byGuard is null; guardRequestAccepted is separate and causality remains UNVERIFIED.

Frozen shadow/delivery/radar outcomes still use the 15:00 research endpoint. Missing/stale prices at that endpoint remain unscored; 16:00 prices are never substituted into px15. This preserves the frozen study horizon while extending operational observation.

Nine discovery adapters run inside the watcher. Existing labs are read only and never rerun. Live pre-ignition/SEC evidence and file-based news, SEC, insider, earnings, industry, supply, technical and comeback observations preserve exact-public versus derived-output availability. Date-only economic events are not assigned midnight publication times. Derived availability is labelled explicitly, and first ingestion is always actual runtime time. Missing, future, stale, malformed and capped sources are visible. Same-session source-event deduplication does not imply lifetime independence.

Prospective measurement credits a lead only when first detection has a fresh price below +5%, preceding a later first OBSERVED fresh +10% crossing. Unknown/stale prices are never backfilled. Same-cycle/already-moved cases earn no credit. No observed crossing is unresolved, not a false-positive verdict. Lane breadth is correlated evidence, not a trading score. No recommendation, Telegram or order path is invoked by discovery.

## Validation and remaining work

Latest full local suite: 1,231 passed, zero failures/skips, Node 24.19.0. Prior full static check: 212 root modules, 78 parsed workflows. Node 20 remote CI independently checks code. Local listener/child integration needs per-command localhost network capability; without it this environment returns EPERM. Never skip tests to hide it.

Secret-free watcher-runtime tests preload an external-fetch guard and use localhost-only market, GitHub and Telegram fixtures. They cover normal/half-day sessions, gap detection, closing samples, state resume, intervening alerts-off, stale feeds, last success, heartbeat readback, duplicate exits, missing checkpoints, denied dispatches, accepted-request causality, Telegram 429 then ACK, all nine lanes and unchanged research horizons.

Logs: /workspace/scratch/stock2-dispatch-suite.log; stock2-session-final.log; stock2-discovery-final.log; stock2-close-boundary-suite.log; stock2-final-engineering.log. Data inputs restored earlier still match original blobs. Synthetic interrupted smoke data stays quarantined under /workspace/scratch/stock2-interrupted-fixture/data and must never be published as market evidence.

Acceptance: 16/40 (40%). One new check is the nine-lane runtime with explicit timing provenance and guarded E2E. Remaining 24 checks are detailed in engineering-progress.md. Live production/prospective evidence is NOT counted. No strategy is newly approved.

Next priorities: independently review the new workflow/checkpoint/heartbeat transport under real GitHub artifact semantics before deployment; deployment remains owner-gated. After authorized deployment, collect complete regular and half-day sessions, reconcile measured gaps, verify telemetry/Telegram acknowledgments and source entitlements. Run matched prospective lead-time/false-positive analysis with incomplete/capped sources explicitly excluded or stratified; no fixture results are performance evidence. Continue all-path Telegram acknowledgments (news-watch/premarket), ZAD rejection persistence, instrument/session normalization, historical survivorship/corporate-action/CIK integrity, strategy holdout/account-cost validation, and full repository workflow/behavioral acceptance.

Hosted artifact fixture is the next published test-only milestone: tools/watcher-artifact-fixture.mjs and two branch-only safety CI jobs perform an actual GitHub upload/download round trip of generated opening checkpoint/heartbeat/attempt files. Local open/close phases passed. Check fixture-open and fixture-close in addition to safety, push tests and PR tests before calling the final checkpoint verified. No secret/live data is forwarded; child Git discovery is disabled.
