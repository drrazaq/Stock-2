# Stock-2 engineering progress dashboard

Updated: 29 October 2026 (UTC). Development branch: `Stock2-safety-fixes`. PR: [draft #1](https://github.com/drrazaq/Stock-2/pull/1). No merge, deployment, workflow dispatch, Telegram message or trade performed in this review.

**Completion: 40% (16 of 40 acceptance checks)** for the comprehensive engineering audit, repair and verification scope below. Each of ten workstreams has four equally weighted checks. Only the named completed checks count; in-progress work gets zero credit. This measures documented acceptance work, not percentage of code reviewed, product maturity or probability of trading profit. Earlier ~45% subjective maturity estimates are superseded for this audit. Production acceptance remains blocked.

| Workstream | Complete / 4 | Completed acceptance checks | Remaining acceptance checks |
|---|---:|---|---|
| Repository/scripts | 2 | Enumerate root scripts; syntax-check all 204 baseline scripts | Behavioral review of every script; finalize ownership/research-preservation map |
| Actions | 3 | Inventory/parse all 78 workflows; fix missing pre-ignition ledger save path with regression; confirm all three CI runs on final code SHA | Review each workflow's failure/write/concurrency semantics |
| Market data | 1 | Inventory literal provider hosts and inspect watcher fallback path | Per-source entitlement/coverage audit; symbol/session normalization; full session freshness/latency measurement |
| Early discovery | 2 | Verify pre-ignition runtime call; connect nine-lane research runtime with explicit availability provenance and guarded E2E (local/CI, not deployed) | Whole-market premarket discovery; matched prospective lead-time/false-positive evaluation |
| Catalyst intelligence | 2 | Inspect timestamp/materiality boundaries; regression fixes for chronology and invalid/coerced evidence | All-source ingestion/deduplication review; independent point-in-time audit and missing-source measurements |
| ZAD compliance | 1 | Approved ignition wording now requires explicit owner ZAD yes and honors exclusion set | Audit all other recommendation paths; verify 90-day rejection persistence/recheck; malformed/stale/missing-file integration tests |
| Execution safeguards | 1 | Reproduce/fix finite-quote midpoint overflow in approved gate and display | Full order-endpoint/permission audit; entry/stop/gap/cost consistency across lanes; end-to-end fail-closed fault injection |
| Telegram | 1 | Existing acknowledgment/failure and cap/mute tests pass | All send paths reviewed; timeout/429/length/retry policy verified; authorized delivery validation |
| Strategy testing | 2 | Run complete baseline suite; run complete post-fix suite | Frozen experiment/holdout registry audit; realistic after-cost independent replay acceptance |
| Historical performance | 1 | Re-read frozen ignition artifact and separate it from five-year daily experiments | Survivorship/delisting/CIK audit; validate all performance claims/windows; benchmark/capacity/drawdown/uncertainty report |

## Verified results and fixes

- Baseline head: `27259f8621e0145bfa5b7e0974e79e21ed35f590`.
- Baseline local tests: **1,170 passed, zero failures**. Post-fix: **1,181 passed, zero failures**, using `node --test test/*.test.mjs tests/*.test.mjs` on Node **24.22.1**. Remote workflows use Node 20; remote confirmation is a separate check.
- All **204** baseline root scripts passed syntax checks; all **78** workflow files parsed. See [full inventory](audit-inventory-2026-10-28.md). Static checks do not substitute for behavioral review.
- Approved ignition alerts previously blocked explicit halal failures but allowed unknown ZAD marks to reach BUY wording. `zad-compliance.mjs` now requires an affirmative owner mark with a valid, nonfuture date within 90 days before the approved path; paper/research labels remain separate. Existing exclusion and SEC checks remain in force.
- The pre-ignition outcome ledger was written by the watcher but absent from the workflow's explicit staged-file list. The save list now includes `data/pre-ignition-days.jsonl`.
- Extreme finite bid/ask values could overflow their sum, producing a false zero spread. Both approved quote gating and the early-alert spread display now use an overflow-safe midpoint. Regression fixtures reproduce the original defect.
- Catalyst study eligibility accepted exits before entry and coerced null/boolean/string economic inputs. Strict nonnegative finite numeric evidence, valid public timestamps/HTTPS source shape, and entry-before-exit checks fix those cases. A syntactically valid URL is not proof of source authenticity. Study thresholds and frozen results are unchanged.

## Commit and CI ledger

| Commit | Status / evidence |
|---|---|
| `27259f8` (existing) | Tests passed: [40740182976](https://github.com/drrazaq/Stock-2/actions/runs/40740182976), [40740173362](https://github.com/drrazaq/Stock-2/actions/runs/40740173362); safety checks passed: [40740172984](https://github.com/drrazaq/Stock-2/actions/runs/40740172984) |
| `c853ef4` | Published first repair batch; targeted safety CI [40750195609](https://github.com/drrazaq/Stock-2/actions/runs/40750195609) passed. Both full runs also passed (40750205327, 40750195524). |
| ZAD date-validation follow-up | Published as `4c3e629`; both full tests and safety CI passed (runs 40750427084, 40750411512, 40750411506). |

## Findings that limit opportunity discovery

- `premarket-check.mjs` checks holdings; it is not a whole-market catalyst hunter.
- `pre-ignition-discovery.mjs` is called by the watcher and records volume anomalies while change is within -2% to +2%. This is an unproven observation rule, not evidence of predicting runners.
- `assembleMultiAngle` has tests but no runtime caller found. Nine lane definitions alone do not create nine functioning discovery feeds. Distinct lanes may share one underlying event, so lane counts must not be interpreted as independent confirmation.
- Existing early-alert leads require +3% to +8% already observed. Research visibility must remain distinct from approved trade eligibility. The discovery-to-Telegram funnel still needs all attempted leads and suppression reasons joined across sources and horizons.
- 72 workflows explicitly check out main, including the ignition watcher. Dispatch from this branch would run main code in those workflows and is not valid branch integration verification.

## Historical evidence and blockers

The frozen `data/ignition-lab.json` reports **48 variants: 33 REJECTED, 15 NOT PROVEN, zero passing**, window **25 October 2024–23 October 2026**, with **23,913 / 73,864 candidate stock-days tested (32.4%)**. This is partial two-year minute history, not a five-year whole-market result. No frozen experiment was rerun, no final holdout consumed, and no profitability conclusion is justified.

Blockers: final-commit CI; PR initially reported unmergeable, then mergeable after `c853ef4` (no merge performed); branch-only integration validation; prospective full-session data and executable-cost evidence; whole-market premarket ingestion; full ZAD 90-day persistence audit; all-path Telegram validation; authorized privacy migration. Existing research, rejected rules, Agent C/Squad 26 work, settings, holdings, ZAD marks and frozen results are preserved.

Next work is ordered: publish verified safety repairs and confirm CI; complete provider/funnel and recommendation-path audits; implement branch-only research ingestion and runtime integration; then run pre-registered prospective/matched evaluation. Never relax halal, stale-data, liquidity, rejection or risk protections to manufacture candidates or passing results. Merge/deploy/live execution still require owner approval.

Additional source review: `scan.mjs` sends practice orders only to a hardcoded paper endpoint or localhost test override; option labs inspected here use account endpoints for read-only contracts/calendar queries. This is a limited path review, not a completed audit of every execution route. `news-watch.mjs` and `premarket-check.mjs` still have direct Telegram sends that swallow failures, so acknowledgment tests for the ignition helper cannot establish all-channel delivery reliability.

## Shadow evidence-integrity correction

Related quote arithmetic defects also existed in `rank-models.mjs`, `shadow-stream.mjs` and `shadow-eval.mjs`. Corrected calculations reject nonfinite quotes, prevent midpoint overflow and never treat future/invalid quote ages as fresh observed fills. Unknown quotes retain the existing explicitly flagged assumed-spread model; invalid entry or delayed prices are unscored. Three regressions cover these defects. No model thresholds, costs, ranking criteria, `FROZEN` metadata, stored outcomes or verdicts were changed, and no experiment rerun was performed. Future evaluations must identify the corrected code version; never silently overwrite a first verdict. This follow-up has 1,181 passing local tests; all three remote CI runs passed on code SHA `9c6f39e83d60276899aae26387355a5fbaff14bb`.

## Final verified code checkpoint

Commit `9c6f39e83d60276899aae26387355a5fbaff14bb`: [push full tests 40750736004](https://github.com/drrazaq/Stock-2/actions/runs/40750736004), [PR full tests 40750799080](https://github.com/drrazaq/Stock-2/actions/runs/40750799080), and [targeted safety CI 40750726428](https://github.com/drrazaq/Stock-2/actions/runs/40750726428) all completed successfully. All 205 current root scripts passed syntax checks and all 78 workflows parsed. Working tree matched published code; the three repair commits changed 18 files, with no changes under `data/`. This dashboard completion update changes documentation only. Comprehensive behavioral audit and prospective evidence remain incomplete.

## Full-system mission: October 28 incident checkpoint

[Incident reconstruction](incident-2026-10-28.md) establishes an opening-session run followed by a queued two-minute duplicate that overwrote the day. [Machine-readable ledger](engineering-ledger.json) separately lists actual behavioral review scope, severity, fixed/open defects, engineering acceptance and strategy promotion evidence. [Reproducible inventory](engineering-inventory.json) now covers 206 modules, 78 workflows and 335 non-private dataset files; all dataset serialization checks and relative imports pass. This does not establish historical correctness. `python tools/repository-audit.py --syntax --output docs/engineering-inventory.json` regenerates the inventory without network calls or dataset mutations.

Current batch: duplicate protection, immutable run snapshots, coverage-based canonical selection, accurate mover totals/history labels and mixed catalyst attribution. Local tests: 1,190 passing, zero failing. New-commit CI pending. Engineering acceptance remains 15/40 (37.5%) until further acceptance work is complete. New early-engine strategy promotion: 0/8 required evidence checks completed; zero approved variants. No live behavior was changed.


## Resumed field-clock and legacy-session repair

Verified base `a06032c`: all three CI checks passed (full tests [40755046492](https://github.com/drrazaq/Stock-2/actions/runs/40755046492), [40755035592](https://github.com/drrazaq/Stock-2/actions/runs/40755035592), safety [40755035601](https://github.com/drrazaq/Stock-2/actions/runs/40755035601)). The earlier pending-CI note is resolved for that base.

A short usable-heartbeat retry could outrank a longer legacy day lacking heartbeats. Publication now protects the legacy duration; an equal or longer observed session can still replace it. The watcher now normalizes Massive and Alpaca fields through `snapshot-fields.mjs`: selected price retains its own timestamp, aggregate volume retains its bar timestamp, missing timestamps remain unknown, and a new trade cannot refresh stale volume. Numeric strings and nonfinite fields are rejected. An Alpaca daily bar timestamp is not evidence of real-time aggregate freshness; the source label now says so.

Validation: 12 targeted tests passed (snapshot fields, session coverage, existing paper freshness); all five changed JavaScript files parsed. The real watcher duplicate-exit integration passed via Python, retaining the exact fixture bytes and creating no other data files. The Node child-process version is blocked locally by sandbox `spawnSync EPERM`; this is not a passing test. New-commit full CI remains pending. No frozen dataset or historical strategy was modified. Acceptance remains **15/40 (37.5%)**.

Workspace recovery: no checkout was provisioned; Git transport could not connect to the configured proxy. Source/tests were reconstructed from the exact GitHub checkpoint using the connector. This directory is a partial materialization, not a complete Git clone. An interrupted no-credential watcher smoke process created local synthetic empty-data outputs; those were quarantined under `/workspace/scratch/stock2-interrupted-fixture/data` and must never be committed as market evidence. No live Telegram send, order, workflow dispatch or production deployment occurred.

Next: verify new-commit CI, add mocked-provider watcher integration, review publication/save races and per-attempt shadow archives, then continue the existing whole-system backlog. The duplicate repair still does not establish complete exchange-session coverage or production acceptance.

## Publication recovery — 29 October 2026

Recovered the original exact bundle (SHA-256 `e62a4e9fa7e294d711d461ca1d4883c14e8e8e54e9a96d229db34aa07037f152`); all seven files matched byte for byte. Re-read remote head `a06032cca7c309f486a5215b15bd8a81fc6b1b08` and base tree `cbc9b75fb0618579cfa9a51f9b9ce2685debe2c5`; no remote conflict. Complete diff saved locally as `/workspace/scratch/stock2-recovery.diff`.

Re-ran 12 targeted tests and the Python-launched real watcher integration: all passed. All 207 root modules parse and all 78 workflows parse. Local integration requires per-command network access for localhost fixture servers; this resolves the earlier sandbox restriction without changing production permissions. The first full run after enabling it passed 1,193/1,195: the two failures were missing reconstruction inputs, not code failures. Restored 15 required input files from remote blobs, verified each Git blob hash, and reran the complete suite. Restored private files and frozen strategy-library bytes are test inputs only and are excluded from the publication patch.

Publication and exact-commit CI are recorded in the next checkpoint update; do not infer success from this preparation entry. Acceptance stays 15/40 (37.5%).

Final recovery validation: **1,195 passed, zero failed, zero skipped** using `node --test test/*.test.mjs tests/*.test.mjs` on Node 24.19.0. Twelve targeted tests, the Python watcher integration, 207 root syntax checks and 78 workflow parses passed. New-commit remote CI pending.

Published repair: **352316eb0dae144eead342c99be1c2a969ce7034**. Exact-commit CI all successful: pull_request [40811340889](https://github.com/drrazaq/Stock-2/actions/runs/40811340889), push [40811335253](https://github.com/drrazaq/Stock-2/actions/runs/40811335253), push [40811335260](https://github.com/drrazaq/Stock-2/actions/runs/40811335260). Draft PR #1 remains open; no merge or deploy. Only seven intended files changed; no data changes. Recovery/publication acceptance for this milestone is complete; full-system acceptance remains 15/40.

## Per-symbol freshness milestone

A fresh median previously returned the Massive snapshot before refreshing any stale minority. The watcher now selects eligible stale, missing-clock and future-clock symbols individually. Already fresh symbols avoid unnecessary refresh requests; penny research caps and BUY safeguards are unchanged. A bad future timestamp no longer pins the old price against a valid current trade. Source text reports updates and refresh targets separately from measured live-price coverage.

New real-watcher localhost integration proves that two fresh stocks do not hide a stale third stock: only the third is requested, all three are subsequently measured fresh, and aggregate volume keeps its older clock. An external-fetch guard prevents accidental service access. Full suite: **1,198 passed, zero failed/skipped**; six changed JS files parse. Exact-commit CI pending publication. This is not a live coverage measurement and does not establish entitlements or executable fills. Acceptance remains 15/40 (37.5%).

Freshness milestone published as **2d276c3f63356356cb91776d8069c13f3d0bc614**; all exact-commit CI checks passed: [PR tests 40811856454](https://github.com/drrazaq/Stock-2/actions/runs/40811856454), [push safety 40811851330](https://github.com/drrazaq/Stock-2/actions/runs/40811851330), [push tests 40811851254](https://github.com/drrazaq/Stock-2/actions/runs/40811851254). No data changes.

## Guard timing integrity

The guard still used run-level `run_started_at` as execution proof. It now reads actual latest-attempt `watch` job timing from GitHub, with bounded request timeouts. Queued jobs stay waiting even if the workflow is in progress. Missing/malformed/future job starts remain unverified; legacy run-derived starts are cleared rather than retained as measurements. Completed workflows with unknown job duration do not automatically request duplicates. Job start logs identify `source: github_job` and explicitly leave market coverage UNVERIFIED. No live dispatch or Telegram send was performed during this repair.

Fourteen guard fixtures pass, including the retained October 28 14:59 job timestamp, a separately labelled synthetic queue scenario, missing metadata and long queue/short job cases. This closes the run-creation attribution defect only. The guard still stops at 14:55 and the watcher at 15:00; **neither proves full regular-session observation through the 16:00 exchange close**. Heartbeat health, segmented full-session/half-day monitoring and all-attempt shadow/delivery archives remain open. No additional acceptance credit; 15/40 (37.5%).

Guard timing full validation: **1,204 passed, zero failed/skipped**. Changed guard modules and tests parse. Remote CI pending publication.

Guard timing repair published as **812f0c79e165c49ab493baba8bf75b9251974106**. Exact-commit CI all successful: pull_request [40812268162](https://github.com/drrazaq/Stock-2/actions/runs/40812268162), push [40812262721](https://github.com/drrazaq/Stock-2/actions/runs/40812262721), push [40812262652](https://github.com/drrazaq/Stock-2/actions/runs/40812262652). Full suite 1,204 passed; no failures/skips. GitHub comparison against a06032c confirms zero data-file changes across recovery, freshness and guard repairs. Remaining full-system acceptance: 25 checks (15/40 complete). Nine-lane runtime integration remains open; quarterly insider output and date-only event summaries must not be treated as timestamped live discovery evidence.

## Dispatch integrity repair

Guard decisions now reserve PENDING attempts without claiming a restart. Intent is atomically persisted before GitHub I/O. Only HTTP 204 records an ACCEPTED request, still explicitly not confirmed execution; HTTP failures and network timeouts stay REJECTED/UNCONFIRMED. Failed attempts count toward retry throttling. Legacy optimistic records migrate to unknown attempts. Guard notifications persist until Telegram acknowledges a message ID. No live requests or messages were sent in development. Local full suite: 1,213 passed; 23 targeted dispatch/guard tests passed. Exact-commit CI pending. Full-session and heartbeat implementation is next; no acceptance credit yet.

Dispatch repair **ae7db3f6d5a0c417779014a359eb730ae254f8af** passed exact-commit PR 40813360425, safety 40813356276, and push tests 40813356188.

## Scheduled close, heartbeat and lifecycle integration

Implemented two bounded jobs: opening until 14:00 NY, then a checkpointed continuation through 16:00. Reviewed half days end at 13:00. The [NYSE calendar](https://www.nyse.com/markets/hours-calendars) was checked directly for 2026/2027 holidays and early closes; unsupported years fail closed. Jobs stay below GitHub's six-hour limit. Both use pinned source and current data; branch live I/O is blocked. Missing or mismatched continuation checkpoints allow research observation but suppress outgoing trade/stop messages. A completed day exits before network or mutation. Every attempt archives its own shadow and delivery evidence before canonical selection. Save conflicts now fail visibly rather than using `-X theirs` to discard competing data.

Coverage now expects all 390 regular or 210 half-day minutes; a 15:00 exit is incomplete. A handoff or GitHub scheduling gap is measured as missing coverage, never filled in. This provides a path through the close, not a guarantee that GitHub starts jobs without delay. Real full-session acceptance still needs authorized deployment and prospective evidence.

Actual completed cycles write atomic local heartbeats and checkpoints, and emit structured heartbeat logs. Metrics include received/evaluated/fresh counts, fresh percentage **of evaluated symbols**, price age, cycle/request latency, request errors, last completed cycle, and last cycle with usable fresh data. These are not verified tradable-universe percentages. When configured on main, the existing contents-write token publishes a distinct per-attempt heartbeat every three minutes; the guard reads it and labels missing, stale (>5 min), degraded or scanning evidence. No permission change was made. Job start alone never establishes health.

Frozen shadow/delivery/radar research still ends at 15:00: no 16:00 price is substituted for `px15`. A missing 15:00 fresh sample is unscored. New full-session observation does not change a frozen verdict, cost, rule or promotion gate. Runtime checkpoints stay in short-lived workflow artifacts; they are not committed as owner data.

Validation: **1,224 tests passed, zero failures/skips**; 211 root modules parse, all 78 workflows parse. Dedicated secret-free lifecycle tests in branch safety CI cover 390-minute continuation, half-day closure, stale feeds, heartbeat persistence/readback, duplicate jobs, rejected dispatches, missing checkpoints, real handoff gaps, missing frozen endpoints and Telegram 429/ACK recovery. All external fetches are blocked in those fixtures. Exact-commit CI pending publication. Comprehensive acceptance remains **15/40 (37.5%)**: these local checks do not complete the all-system/prospective requirements.

Session/heartbeat commit **1b3a7518240be6c7f9e252f80e0bd1955f68e6d7** passed all exact-commit checks: pull_request [40814880096](https://github.com/drrazaq/Stock-2/actions/runs/40814880096), push [40814875183](https://github.com/drrazaq/Stock-2/actions/runs/40814875183), push [40814875121](https://github.com/drrazaq/Stock-2/actions/runs/40814875121).

## Nine-lane research runtime

`discovery-runtime.mjs` now has a real watcher caller. Live pre-ignition and SEC events plus eight file adapters connect the nine registered lanes to a research-only evidence ledger and board. Each lane reports source availability, staleness/future/malformed payloads, row caps and missing output timestamps. Calendar dates are never converted to midnight event timestamps. Exact public source times remain distinct from generated research-output availability; the latter is labelled DERIVED_OUTPUT_AVAILABLE with a missing-original-time caveat. First ingestion is recorded at the actual scanner cycle, not backdated to a filing date or quarter. The daily studies are read only; no lab is run or frozen result rewritten.

Every source event is deduplicated and persisted under its run; checkpoints carry the evidence/timing state. First detection price is captured only if a known fresh quote is present then; it is never backfilled from a later price. Lead measurement requires detection below +5% before the first **observed** fresh +10% crossing. Already-moved stocks, future evidence, stale/missing prices and same-cycle crossings earn no lead credit. No observed crossing remains unresolved, not a manufactured false-positive verdict. Reports include per-lane denominators, source caps and incomplete-session status. Correlated lane counts do not become independent confirmation, return forecasts or BUYs. No Telegram or order path is called by discovery.

Validation: **1,230 passed, zero failures/skips**; 212 root modules and 78 workflows parse. A guarded real-watcher fixture consumes all nine lanes, persists the ledger and issues no recommendation. Other fixtures verify missing/stale/future sources, delayed quarterly context, unknown-price timing, old-news truncation, and a synthetic lead before a later observed move. These prove implementation behavior, not live predictive performance. Production prospective measurements and matched false-positive evaluation remain outstanding. Exact-commit CI pending publication; acceptance credit for runtime integration awaits CI.

Continuation also retains the owner's current alert-level setting instead of restoring a stale level from an earlier checkpoint; the full lifecycle fixture verifies an intervening `alerts: off` survives resume.

Discovery commit **2e37078b7ea4abbcd3ff29158da43262ecc45c35** passed all exact-commit checks: pull_request [40816080789](https://github.com/drrazaq/Stock-2/actions/runs/40816080789), push [40816074277](https://github.com/drrazaq/Stock-2/actions/runs/40816074277), push [40816074355](https://github.com/drrazaq/Stock-2/actions/runs/40816074355). Runtime integration earns one acceptance check: **16/40 (40%)**. Live session coverage, primary-source sufficiency and matched predictive evaluation earn no credit yet. Deduplication/timing reports are per observed session, not lifetime event studies. No measured production performance is claimed.

Close-boundary follow-up also takes a cycle at exactly 16:00 (13:00 on reviewed half days). It does not add a fictitious 391st/211th regular minute, and a snapshot is not proof of an exchange auction fill. Full suite remains 1,230 passing; exact-commit follow-up CI pending.

Closing-boundary commit **6ac9798d38c7732d3fd472a1225cfb5729ea0065** passed all exact-commit CI: pull_request [40816438683](https://github.com/drrazaq/Stock-2/actions/runs/40816438683), push [40816433488](https://github.com/drrazaq/Stock-2/actions/runs/40816433488), push [40816433481](https://github.com/drrazaq/Stock-2/actions/runs/40816433481).

Request-causality follow-up: start logs now retain `byGuard: null` and `restartCausality: UNVERIFIED` separately from `guardRequestAccepted`. A real-runner fixture first accepts HTTP 204, then observes an independently running job; no causal restart success is claimed. Full suite: **1,231 passed**, zero failures/skips. Exact-commit CI pending publication.

Causality repair **35eb0bba1a5c76695338288f090385a63bbd7283** passed all exact-commit CI: pull_request [40816601733](https://github.com/drrazaq/Stock-2/actions/runs/40816601733), push [40816596402](https://github.com/drrazaq/Stock-2/actions/runs/40816596402), push [40816596298](https://github.com/drrazaq/Stock-2/actions/runs/40816596298).

Hosted artifact validation adds two branch-only, five-minute CI jobs using the same multi-path upload/download layout as the live lifecycle. Generated fixture data only; no credentials are forwarded, JavaScript fetches are localhost-only, and Git discovery is disabled in the child so it cannot read the checkout owner files or fetch origin. The local two-phase CLI round trip passed (270 opening minutes, then 390 cumulative minutes plus closing boundary). Remote artifact upload/download verification is pending. Repository permissions remain contents: read.

## Final verified source checkpoint for this batch

**1c2031495c839e7d8469cb127821ec1650ca09aa**: all five exact-commit checks passed — fixture-close [123260508288](https://github.com/drrazaq/Stock-2/actions/runs/40817031943/job/123260508288), test [123260426013](https://github.com/drrazaq/Stock-2/actions/runs/40817037197/job/123260426013), fixture-open [123260408904](https://github.com/drrazaq/Stock-2/actions/runs/40817031943/job/123260408904), safety [123260408569](https://github.com/drrazaq/Stock-2/actions/runs/40817031943/job/123260408569), test [123260408253](https://github.com/drrazaq/Stock-2/actions/runs/40817031883/job/123260408253). This includes push tests, PR tests, safety, and an actual hosted fixture-open/fixture-close artifact round trip. Node suite: **1,231 passed, zero failures/skips**. Static checks: 212 root modules and 78 workflows parse; the additional fixture tool parses and its two local CLI phases passed.

Six independently published repair/test milestones since 925149a changed no files under data/. Local baseline data hashes remain unchanged. Source and workflow changes are on Stock2-safety-fixes only; PR #1 remains draft. No production dispatch, Telegram message, deployment, trade, secret/permission change or paid service occurred. Runtime artifact transport is verified with generated CI data; actual market-session reliability and predictive performance still require authorized deployment and prospective evidence.

Current acceptance **16/40 (40%)**, with 24 checks remaining. The only new broad acceptance credit is nine-lane runtime integration with explicit timing provenance and guarded end-to-end tests. Software calendar/heartbeat/dispatch/artifact repairs are verified milestones, not fabricated live-session or profitability evidence.

## Provider provenance and read-only readiness audit

Reproduced/fixed concurrent SIP/IEX global-label contamination: each response now retains its actual feed, and only a SIP payload supplies consolidated volume. Feed failures/malformed payloads do not establish entitlement; 422/429 no longer trigger an assumed IEX permission fallback. Rate-limit responses defer later batches instead of creating a retry burst. Share-class punctuation survives syntax normalization without issuer aliasing or a new tradability/halal assertion.

Official provider capability documentation and premarket limitations are recorded in [provider readiness](provider-readiness-2026-10-29.md). A branch-only read-only diagnostic uses existing GitHub bindings for at most five whitelisted GETs. It does not trade, send Telegram, expose raw responses/keys, mutate production data, change permissions or buy a plan. Out-of-session freshness is labelled as such. No configured credentials exist in the managed workspace; that alone does not prove the GitHub account lacks access. The diagnostic result is pending.

The provider patch was isolated from ongoing funnel work and passed **1,240 tests**, zero failures/skips. The new workflow/probe has secret-free endpoint-whitelist, redaction, rate-limit and session-context fixtures. Exact-commit CI and sanitized endpoint observations are pending publication. Acceptance remains 16/40 pending evidence.

## Discovery funnel and paper evidence protocol

The runtime now retains first-detection time/price/BBO, later observed prices and last-trade drawdown, distinct missed +10% candidates with reasons, source status histories, invalid/future/unknown-price/cap suppressions and attempt-versus-event counts. Full per-attempt follow-up records are gzipped separately; capped displays retain total denominators. A 390-cycle fixture exercises nine lanes, duplicate events, stale news, missing sources, ten interrupted price cycles, missed movers and a rise followed by a drawdown. No missing first price or horizon quote is backfilled.

`discovery-paper.mjs` fixes a paper-only evidence protocol before real samples: next observed fresh ask, whole shares within $1,000, $3 per side, spread-aware bid exit after 30 minutes, conservative liquidity evidence, additional slippage stress, observed liquidation drawdown and unresolved missing exits. Same-time industry/price/liquidity controls require known security IDs and metadata available before detection; deterministic selection uses no future outcomes or future discovery membership. Wide losing exits are not filtered away. This module creates no orders, approval verdicts or frozen-lab changes. **Actual prospective resolved cases: zero**. Fixture outcomes are not profitability evidence.

Local full suite: **1,247 passed**, zero failures/skips. The provider probe's overnight labelling is corrected while preserving original observed evidence. CI pending publication. Acceptance remains 16/40: prospective/matched live evidence is not replaced by simulations.
