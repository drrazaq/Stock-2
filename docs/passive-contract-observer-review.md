# Passive contracts observer — production review package, INACTIVE

Acceptance rows: MARKET-03 (quote-size units/clock/provenance through actual ingress), MARKET-04 (bounded telemetry preparation), EXEC-03/HISTORY-04 (explicit unknown execution/volume evidence). No row closes from this package.

Base production source: 31399de73752c7915857dab7865ddbdd1bcae070. The accepted module from f61bcf748c569bd86ec6997267bc23fa5984e113 is copied BYTE-IDENTICALLY. Its inactive-package PASS remains historical evidence; activating an observer is a different integration review, not an inherited deployment approval.

Runtime scope: market-data-contracts.mjs (exact reviewed bytes), watcher-contract-observer.mjs (new), snapshot-fields.mjs (same-response raw size/unit metadata only), ignition-watch.mjs (default-off passive hook and standalone health line). No source/strategy/ZAD/accounting/message rule changes. No new provider requests or approved recommendation path. No 60-second grace, two-minute freshness or entry threshold adopted.

Default OFF. Enabling requires the separately reviewed one-line CONTRACT_OBSERVER=research workflow environment amendment. This branch does NOT change a workflow. Owner must approve both code and explicit telemetry activation before deployment. No inert-code deployment is proposed as operational completion.

Storage: data/ignition-runs/DAY/RUNID.contracts/beat-MMMM.json, within existing save/artifact paths. Only configured09:30–15:00 minutes570..900 are accepted, max331 records,6144bytes/record,2,033,664 payload bytes/run (<2MiB); source context/health markers have small additional filesystem metadata overhead. Each record is exclusive, checksummed, fsynced. Existing/partial/conflicting/symlink/unwritable evidence quarantines the observer; it never overwrites or repairs original bytes. Validate once at reopen; no per-append chain scan. Concurrent same-slot contenders preserve original bytes and may conservatively quarantine. A hard interruption may leave a partial record; that is incomplete evidence, not auto-recovered coverage.

Summaries retain counts and source/feed classes only, no symbols, prices, holdings, fills or trading scores. ALPACA sizes are raw and labelled shares only on/after the documented2025-11-03 change; older sizes remain round-lot/unknown. Massive sizes remain unit UNKNOWN. Sizes follow the BBO only if that same quote wins normalization; top50 keeps no quote metadata. Untimed daily volume remains untimed and legacy inputs are unchanged. Quote quality is not an executable fill.

Health is separate from canonical watcher JSON, preserving original archive/ledger bytes and research scoring. PERSISTENCE_OR_CONFLICT stops only the observer; watcher observation, SEC polling, delivery and legacy archives continue. Source coverage and full16:00-session claims always remain false.

Tests: actual full watcher baseline/off/on across SIP, IEX downgrade and top50; unchanged provider requests and all original data-file bytes; actual persistence-failure survival; restored/partial/symlink/concurrent cases; same-response size metadata. Frozen fixture clocks and identical synthetic Git commit IDs prevent metadata timing from hiding behavior differences. Fixtures are not prospective evidence.

The original accepted package's no-production-import assertion remains valid at its immutable INACTIVE commit; this future integration intentionally changes that invariant. Its pure regression evidence is preserved. New production integration tests assert the exact passive caller and immutable accepted source hash instead of treating an active observer as an inactive package. No prior result is relabelled.

Proposed rollback: revert only this narrow runtime patch/activation at a safe natural boundary; retain all sidecar and original evidence. No financial/data reset. Post-deployment observation would be via natural runs only: original request/decision/archive parity, sidecar persistence and quarantine health. No test message or provider dispatch is included.
