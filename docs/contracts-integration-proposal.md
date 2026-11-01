# Contracts integration proposal — one passive observer, not strategy adoption

Prepared 1 November 2026. INACTIVE, NOT APPROVED. The accepted four-file contracts package at f61bcf748c569bd86ec6997267bc23fa5984e113 remains unchanged (diff SHA256 d49ff0fa3c5045ea0a0b72f61945a4f8e891b567a36c4c0c45445eebc8013f4d). This document is a concrete scope for the next separately reviewed implementation/production patch; it is not that patch or a claim that the observer is implemented.

## Selected useful increment

A **passive snapshot-contract observer** beside the existing watcher. It reuses the existing responses and writes a separate bounded operational summary. No historical-bar requests and no replacement of rv, rvT, quotes, strategy eligibility, mentor instructions or historical results. This is narrower than substituting RETURNED_BAR_SUM into a frozen rule.

Proposed runtime file delta against deployed b680988b:
1. add market-data-contracts.mjs byte-identically from the accepted commit (SHA256 269626fa8da5c2a12234a0baf028b560bb7838f468a9e52a428208574a091cbe);
2. snapshot-fields.mjs: retain independent raw bid/ask sizes from the SAME response, source feed and quote timestamp as metadata. Preserve existing price/volume/BBO fields and decision behavior;
3. add watcher-contract-observer.mjs: pure read-only assessment of supplied fields. Use the accepted timestamp/price-role functions; no transport, delivery, orders, approved-BUY wording or source substitution;
4. ignition-watch.mjs: call observer after snapshot assembly, outside legacy decision mutation. Publish its aggregate summary to a separate archive, never a frozen performance ledger.

Tests to add: test/watcher-contract-observer.test.mjs and actual-watcher shadow-off/on regression cases. Retain accepted contracts tests unchanged. A new manifest must enumerate hashes/dependencies and production-plus-patch results. No full branch merge. Exact patch/source SHA does not exist yet; producing and independently reviewing that patch is remaining ENGINEERING, not an external-evidence blocker.

## Behavioral contract

| Existing production | Proposed passive integration |
| --- | --- |
| Snapshot BBO metadata omits sizes after normalization | Same response's bid/ask sizes retained separately; no invented units |
| Price/volume clocks and legacy rv/rvT decisions | Identical; observer cannot mutate input rows |
| No contract summary archive | One separate per-run aggregate record per configured heartbeat, max331 records, max6KiB/record, max2MiB/run; no raw prices, private holdings or case scoring |
| Untimed SIP daily volume still used by legacy rules | Report UNTIMED_DAILY and unknown age; do not convert it to returned bars or silently block/approve legacy recommendations |
| Existing quote-age/spread rules | Unchanged. Without an adopted entry contract, record POLICY_NOT_ADOPTED; do not call quote evidence an executable fill |
| Existing failures/publication | Observer errors stop only the observer, expose fixed health reason, preserve observation/delivery/archives; no network retries |

No new 60-second entry threshold, 60-second grace or two-minute volume cutoff enters production in this increment. Frozen strategy inputs, V1, historical cohorts and LEADER DIP NOT PROVEN are unchanged.

## Release/completion criteria and remaining decisions

Offline implementation must show immutable input rows, all original source/feed clocks, missing/non-finite/future/crossed/unknown-size cases, exact cap behavior, fail-isolated storage, interruption and repeat/restart identity. Actual watcher off/on tests must prove identical provider-request counts, legacy decisions, delivery reservations and original archive/ledger bytes. Test against current production plus exact patch; preserve deployed accounting/feed repairs.

Only AFTER that implementation/review would owner approval be requested for the exact observer production patch and its additional bounded operational archive. No new provider collection is needed for this observer, but new persistent telemetry is still an explicit scope decision, not silently enabled.

A later bars-based input change is a DIFFERENT proposal: representative universe/session identity, full pagination, adjustment/scope matching to the learned curve, revisions/corrections, retained exclusions, pre-registered differences and cohort/version boundaries. Twenty sessions is an initial measurement suggestion, not a sufficient acceptance rule; 60seconds/2minutes need justification. The separate seven-request diagnostic only samples access/response behavior and cannot authorize this change.

Monday natural-run inspection is passive production evidence, not this implementation or a comparison cohort. Owner subscriptions are confirmed; binding-specific SIP access, retention/redistribution constraints and halt/status rights remain separate checks. This proposal earns no acceptance row closure and no genuine prospective admission.
