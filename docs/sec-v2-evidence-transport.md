# Proposed V2 evidence transport and paired exits — offline increment

Acceptance rows: DISCOVERY-04, HISTORY-04; source clocks support CATALYST-03. V1, frozen enrollment/costs and original artifacts are unchanged. Proposed V2 policy remains unadopted. No activation or collection is requested by this package. The six-name calibration is an operational feasibility experiment, not the full trading-mentor goal.

## Implemented path

Original synthetic native producer response/acceptance prefix and selection telemetry → pinned offline guard → source handle read BEFORE quote observation → current frame → immutable encrypted checkpoint → bounded injected upload → encrypted client ACK → verified reopen/restart → paired30-minute outcome and missingness report.

The actual producer fixture emits original event bytes, acceptance evidence, revision/receipt clocks and lineage; timed prefixes are copied without rewriting source bytes. Tests then invoke the real V2 frame processor/store, original proposed selector and unchanged V1 quote-frame parser. Fixtures carry SYNTHETIC_FIXTURE provenance; zero genuine admissions is enforced.

The source handle is read before observation. Persistence occurs after the frame; this does not guarantee remotely durable pre-quote proof. An interrupted observation records uncertainty and blocks blind retry. A restarted process never fabricates first ingestion or silently resumes an uncertain sequence.

## Implementation boundaries

- sec-v2-evidence.mjs:31-file immutable offline guard, authenticated encrypted checkpoint chain, original source-byte deltas, exclusive observation and writer leases, source/state binding, immutable ACK receipts, bounded timeout, pending-state recovery.
- sec-v2-outcomes.mjs: candidate/control entry ask and first valid30-minute exit bid, actual size/identity/raw-response joins, losing outcomes retained, missing frame/quote/size/censored exit reported unresolved. It never skips a poor-capacity first valid quote for a better later exit.
- sec-proof-ready-proposal.mjs: only retains original securityId/issuerCik and entrySequence needed to bind outcomes; no selection, cost, hold or enrollment rule changes.
- test/sec-v2-evidence.test.mjs: paired losses/costs, missingness/censoring, source mutation guard, actual producer-prefix→guard→41frames→encryption/ACK→restart→exit, checkpoint/upload/ACK failure, concurrent attempts, timeout/unconfirmed ACK controls.

Quote quality and displayed capacity do not guarantee an executable fill. Spread is already included by buying at ask/selling at bid and is not deducted again. Frozen per-order fees and separate stress slippage remain explicit. No historical results are rewritten.

## Bounds and evidence status

Exactly41 frame/checkpoint slots; source material8MiB, plaintext12MiB/checkpoint, sealed16MiB/checkpoint, aggregate sealed64MiB, ACK<=4KiB each, upload10seconds and at most41 uploads. These are separately proposed V2 storage/transport quotas, not an expansion of V1 or the seven-request diagnostic. The module has no default network/client or credential binding. Failed/uncertain upload is not retried automatically. A client ACK is labelled CLIENT_ACK_NOT_INDEPENDENT_REMOTE_VERIFICATION.

Scope is a declared09:30–10:10 New York40-minute window with final frame at end−10seconds; consistent session/calendar clocks are required. The existing source proof and conditional enrollment proposal remain subject to independent review.

Source candidate243bf2f24fa5986a86fdaf0afdabe0e476bd29ad is preserved separately on codex/v2-evidence-wip. Its initial test source13a22eec is also preserved. Test completion is established by exact-SHA hosted checks, not a local runtime claim. The managed executor is unavailable; hosted tests use synthetic/local service inputs only.

## Still implementation work, not external evidence

The guard intentionally accepts OFFLINE_REHEARSAL_V2 and synthetic native provenance only. A separately reviewed production-capable V2 host/client binding, complete-run/report transport and independent remote recovery verification remain implementation gaps. Adding credentials cannot bypass this guard. No new live wrapper is installed.

After these gaps and independent chronology/control review, owner decisions would cover explicit V2/continuity policy adoption, exact budgets and a dated scope. Existing Algo Trader Plus and Massive Starter subscriptions are confirmed; endpoint binding, current quote access and applicable retention/reference permissions remain distinct checks. No owner approval is needed to finish offline engineering.

No strategy is endorsed; no profitable or admissible case is claimed.

## Verified execution

[Exact-source hosted PASS](https://github.com/drrazaq/Stock-2/actions/runs/41304257278/job/124841310307) on243bf2f24fa5986a86fdaf0afdabe0e476bd29ad:7/7 focused tests, full existing suite. Source/state/guard/failure and real synthetic producer integration passed. This is hosted execution of our tests; local Node and Claude attachment/harness access remain unavailable. Latest consolidated HEAD still needs its own tests; these passes do not fill the remaining live-binding or independent-evidence gaps.

## Reporting integrity followup (HISTORY-04)

The drawdown field is now observedBidMarkDrawdown, explicitly BID_MARK_NOT_A_GUARANTEED_FULL_SIZE_LIQUIDATION. Each leg exposes insufficientMarkDepthSequences and drawdownCapacityVerified; small intermediate bid sizes do not become guaranteed full-size liquidation evidence. The pair remains a quoted paper path, never a fill claim. Global invalidQuoteSymbols/quoteEvidenceComplete distinguishes observed frame cadence from usable BBO/size evidence for every symbol, including names outside enrolled pairs. Frames later than the declared cutoff are rejected.

This is reporting/validation only; no enrollment, entry, exit, fee or strategy rule changes. The8th test covers an intermediate low-depth mark, an unenrolled stale quote and future-frame refusal. Expanded source candidatefeba5acf39a2df1277e50b6f1ab42fd378cd33bc must pass exact-SHA CI; prior7-test243bf2f2 remains verified historical evidence.
