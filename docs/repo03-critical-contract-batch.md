# REPO-03 critical contract batch — 1 November 2026

Development only. PR #6 remains `64611cdf47dd230026911dde53b98cf7413c17f1`. No production/live/policy change. Acceptance remains24/40; no admissions. The mentor goal still spans intraday, days, weeks and months; LEADER DIP remains NOT PROVEN.

## Coverage and ownership

65/305 scripts now have hash-bound six-axis source-interface reviews (16 added);240 remain pending.31 reviewed contracts retain findings. Counts measure scoped source review, not full behavioral verification or acceptance. `scan.mjs` has partial dispatch/dependency/write/message-path review and stays pending; no complete4294-line review is claimed. Shared contracts are grouped below, with separate per-script hashes/axes in the [matrix](validation/repo03-behavioral-matrix.json).

| Shared contract | Individually reviewed scripts |
|---|---|
| Watcher observation/recovery | ignition-watch,watcher-reporting,watcher-messages,watcher-message-publish,stop-watch |
| Frozen radar observation/delivery | opportunity-radar,radar-ledger |
| User-facing acknowledgement | health,alert-delivery-state,telegram-delivery |
| Gated execution preparation | paper-transport,paper-mutation-journal,paper-gates,trade-plan |
| Mentor/compliance | mentor-plan,zad-compliance |

Claude owns the complementary workflow/concurrency/private-persistence/claim audit. This batch reviews script callers and records the exact handoff; it does not duplicate or claim completion of that audit. Latest available independent review9af3 remains CHANGES REQUIRED for historical PR6. New companions await focused re-review.

## Gated failures: actual executions

At development237d191, explicit gated tests reproduced10/11 incident and2/9 resilience PASS:8 failures. The same final fixtures pass11/11 and9/9 against the pinned production watcher004ac1. This is development integration drift plus test-profile assumptions; no production regression is reproduced. The production source closure is verified, but this is not a full production suite. [Evidence and retained logs](validation/repo03-critical-batch-evidence.json).

Confirmed development defects repaired: duplicate-complete exit skipped finalization maintenance; retries replaced a frozen radar snapshot or could use a missing one; late-start radar never ran after11:30; definite stop rejection was stored UNCERTAIN. Existing deployed recovery semantics are restored with strict positive-ID acknowledgements retained. Every retry rechecks the frozen snapshot; no ACK/uncertain replay. No session-window or strategy change: production09:30–15:00 inclusive331-minute contract and development390-minute regular-session contract are explicit profiles, with unknown/mismatched profiles rejected. Frozen15:00 research endpoint unchanged.

Fixture fixes: copy the actual radar transitive dependency bytes instead of a brittle fixed list; local provider and watcher share the same synthetic retry clock; account separately for three definite429 transport attempts in the development compatibility facade versus one in deployed radar. Logical ACK counts, ledger/snapshot identity, preserved remote changes, archives and uncertainty assertions remain. Synthetic preloads refuse non-fixture HTTP. CI now explicitly enables both actual-watcher gated suites using the development profile. Repaired development:20/20 PASS. Production:20/20 PASS.

## Health caller repair

Actual health CLI with no bindings, no network and isolated synthetic files incorrectly advanced sentKey/sentDay. Five new actual-caller cases all fail on original source and pass repaired: absent bindings then ACK/restart; definite rejection/retry; ambiguous delivery/restart; intent/ACK write failure; rejected recovery notice/retry. Health uses the existing durable alert helper, records fixed delivery status, and marks sent only after durable ACK. A recovery intent survives refusal. No Telegram bindings/messages were used outside the synthetic local fixture.

The new health-delivery-state.json is local runtime state, not a committed record. Its publication/cross-workflow preservation must be reconciled with Claude’s persistence audit before any production proposal; local PENDING/UNKNOWN is not global exactly-once proof. No production package or activation is implied.

## Four independent repair companions

Each package is offline/inactive, has an exact base, dependencies and tests; none changes PR6. Two previously published corrections now have standalone patch companions; existing host/prefix patch bytes are unchanged. Fresh disposable base-plus-patch recovery7/7 and verifier2/2 PASS.

| Companion | Exact patch SHA256 | Manifest |
|---|---|---|
| recovery | `3a27295ae04721e1ff1c8952528563c3b775ab3a2c9f280561265f7e3abf6648` | [manifest](validation/repo03-recovery-companion-manifest.json) |
| verifier | `a30e0b269ca92a65eed81c97492f119d5823dd5f95ea1080c7df5f9f4f4ce8b0` | [manifest](validation/repo03-verifier-companion-manifest.json) |
| host monitor | `5c2ee9c713632839bdcadc38f80819c56389e0b7b145f386fcb1274b8730e007` | [manifest](validation/repo03-host-monitor-manifest.json) |
| prefix handoff | `905a88de617ac37c10c894b0131e27de4d1fcc3325b118b942a76c39f2fb8340` | [manifest](validation/repo03-prefix-handoff-manifest.json) |

Apply recovery/verifier against6868d9a independently; host against53ee12e; prefix after host at6d90002. Original PR6 package plus host/prefix was already hash-verified against71cccb62. Host/prefix evidence supplement points to237d191:238 ordinary files plus30 consecutive Node20 actual-host controls,6 exact checks PASS. Those historical passes are distinct from this checkpoint’s pending exact CI. The companion index is the concrete focused re-review handoff; no message or PR6 mutation was sent.

## Original26 gaps: disposition

4 confirmed source-contract defects,20 missing-verification findings,2 declared limitations. A source-visible unbounded operation is labelled separately from a reproduced incident. No unperformed adversarial exploit is claimed. “Declared limitation” does not infer a new owner risk approval. Two gaps are reclassified as historical/incomplete-evidence boundaries;24 remain unresolved/partly resolved, including one host verification component now satisfied by hosted evidence. No acceptance row closes. [Exact26-row record](validation/repo03-gap-disposition.json).

| ID / script | Classification / status | Remaining action or boundary |
|---|---|---|
| G01 `tools/accounting-pending-preflight.mjs` | DOCUMENTED_LIMITATION / RECLASSIFIED_DECLARED_BOUNDARY | Preserve historical checker compatibility / explicit incomplete lineage; never use either as current deployment or original-ingestion authority. |
| G02 `tools/audit-legacy-shadow.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G03 `tools/check-research-evidence.mjs` | CONFIRMED_SOURCE_CONTRACT_DEFECT / OPEN | Bound the source read/child/deadline after an actual caller regression; no frozen enrollment or strategy change. |
| G04 `tools/hybrid-research-fixture.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G05 `tools/native-sec-capture-worker.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G06 `tools/prepare-native-sec-parent.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G07 `tools/prepare-native-sec-shadow-patch.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G08 `tools/provider-readiness-probe.mjs` | CONFIRMED_SOURCE_CONTRACT_DEFECT / OPEN | Bound the source read/child/deadline after an actual caller regression; no frozen enrollment or strategy change. |
| G09 `tools/recover-c0-diagnostic.py` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G10 `tools/recover-hybrid-checkpoints.py` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G11 `tools/recover-key-proof.py` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G12 `tools/recover-paper-capture.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G13 `tools/recover-phase-a.py` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G14 `tools/recover-research-artifact.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G15 `tools/recover-watcher-incident.py` | CONFIRMED_SOURCE_CONTRACT_DEFECT / OPEN | Bound the source read/child/deadline after an actual caller regression; no frozen enrollment or strategy change. |
| G16 `tools/replay-prospective-capture.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G17 `tools/research-collector.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G18 `tools/run-sip-access-diagnostic.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G19 `tools/seal-research-artifact.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G20 `tools/telegram-notify.mjs` | MISSING_VERIFICATION / OPEN | Claude audit: reconcile shared caller evidence; Codex will integrate confirmed findings without duplicating the workflow/privacy audit. |
| G21 `tools/verify-incident-production-package.py` | CONFIRMED_SOURCE_CONTRACT_DEFECT / OPEN | Bound the source read/child/deadline after an actual caller regression; no frozen enrollment or strategy change. |
| G22 `.github/save-data.sh` | MISSING_VERIFICATION / OPEN | Claude audit: reconcile shared caller evidence; Codex will integrate confirmed findings without duplicating the workflow/privacy audit. |
| G23 `.github/private-data.sh` | MISSING_VERIFICATION / OPEN | Claude audit: reconcile shared caller evidence; Codex will integrate confirmed findings without duplicating the workflow/privacy audit. |
| G24 `sec-time.mjs` | MISSING_VERIFICATION / OPEN | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G25 `native-sec-colocated-host.mjs` | MISSING_VERIFICATION / PARTLY_RESOLVED | Reproduce the specific missing failure path through its actual caller before selecting a repair; do not infer an exploit from a pathname alone. |
| G26 `native-sec-colocated-prefix.mjs` | DOCUMENTED_LIMITATION / RECLASSIFIED_DECLARED_BOUNDARY | Preserve historical checker compatibility / explicit incomplete lineage; never use either as current deployment or original-ingestion authority. |

New findings do not disappear into the original26: scoped scanner concurrency/durable health publication, legacy radar score5 request/feed provenance, aggregate runner identity and natural source verification are explicit in the matrix/queue. Whole-repository review and independent audit remain required.

## Verification and next bounded action

Tests/log hashes and exact source hashes are in the evidence file. Local complete-loop239/239 files PASS; the added health file’s5 cases PASS separately, totaling240 distinct current files. Python39/39 PASS. Final hosted CI must execute all240 files on exact source; it is not yet claimed. [Development-only repair patch/dependencies](validation/repo03-critical-callers-manifest.json). No Node22 acceptance blocker is added: registered CI/watcher target is Node20, with prior SIP Node22 evidence kept separately.

Next: scanner planCands → liveQ → planText → owner entry confirmation and actual delivery caller, followed by remaining shared source contracts. Reuse existing accounting/ZAD/frozen strategy regressions; do not repeat completed deployments or introduce new rules. Carry the health book persistence requirement to Claude’s existing audit. Monday natural-run evidence and SIP approval remain separate.
