# A native-original importer — inactive L1–L4 correction

Base: `2c9f418634e05adad5ead5b7fc85de6d1f3eedee`. Review: Claude `80df36fe13fe94634cdd90b1589783be8c4bba16`, PR #1 comment 6666150578. This is a bounded development follow-up, not deployment, policy adoption or authenticated collection. Prior K1/K2 and A1/A2/A6 passes are preserved. No real keys, bindings, providers, financial state or production callers were used. All new end-to-end examples are synthetic and cannot become genuine prospective admissions.

## Finding disposition

| Finding | Implemented behavior | Offline proof |
|---|---|---|
| L1 | INIT refuses every non-SYNTHETIC store without explicitly supplied recovery authority before creating a directory. Existing rootless non-test stores are read-only; no self-enrollment/migration. The sole optional-root exception is origin SYNTHETIC. | `test/a-fenced-recovery.test.mjs`: required enrollment, retained-mode signed-source guard, legacy inspect-only state. |
| L2 | A non-test takeover requires a private, hash-pinned signed-request source. Original source file and directory are flushed before transition mutation. Exact bytes are archived before the first generation attempt, with a raw hash bound into that attempt. First-record interruption has exact replay; no deletion/truncation or re-signing. | Same test: independent worker SIGKILL during request archival, after archival, and during first attempt; malformed/changed/symlink/public source refusal; conflicting takeover fences. [Procedure](resumption-procedure.md). |
| L3 | New actual local importer invokes `joinNativePrimary` and `retainClose`, copies signed originals unchanged into the fenced store, invokes its strict A evaluator, and renders existing paper cards only when source, identity, full outcome and independent coverage checks pass under supplied trust. Retained-origin legacy evaluation cannot omit the native binding. | `test/a-native-evidence-importer.test.mjs`: original responses → real native reader/join/close normalization → evidence store → evaluator → card/outcome; loss, omitted adverse quote, missing evidence, revision/revert, restart, interrupted write and concurrent CLI controls. |
| L4 | Explicit time-bounded identity review must bind original Massive FIGI/CIK/common-stock reference, Alpaca asset ID/class/exchange and SEC CIK. Symbol agreement alone is refused. Close events use the same identity provenance at their session. | Missing identity, conflicting FIGI and wrong instrument class controls; source route/bytes/receipt-clock validation. |

## Actual end-to-end path

| Stage | Retained bytes and clocks | Decision boundary |
|---|---|---|
| Native producer prefix | Actual `native-sec-events.mjs` original Atom and submissions bytes, accession, first-observation clocks, pinned run/code digest | Acceptance only from matching submissions, not Atom updated. Late acceptance, revisions and missing history stay UNKNOWN; no global-first claim. |
| Primary response | Exact SEC document URL derived from CIK/accession/form/primaryDocument; envelope/body original and CAPTURE signature | Matching metadata is not origin authentication. Signed claim review remains required before decision. |
| Identity | Three original reference responses, explicit REVIEW receipt, validity interval and stable identifiers | Ticker agreement cannot manufacture instrument identity. No new reference request is performed. |
| Strict importer/store | Private pinned request, immutable original files, raw aliases preserving all signed file bytes, existing kernel lock/fence, derived join/close records | Pending/unresolved evidence, conflicts, tampering and stale writers cannot produce a positive card. |
| Evaluation/card | Existing frozen A entry/risk/holding/exit calculations, native entry BBO and source review | Research/paper only, NOT PROVEN, BUY false, 0 real admissions. No arbitrary target or exit supplied. |
| Outcomes | Raw daily aggregate trigger, separate full native BBO set, unchanged independent WITNESS coverage | First post-open / last pre-close selection unchanged; whole shares and $3 per side unchanged. Raw aggregate is not official-auction price or fill. Omitted adverse quotes remain unresolved. |

`tools/a-native-evidence-runner.mjs` is an explicit, inactive **local** file command. It opens an already-created store and imports an already-pinned request; it creates no store/key, fetches nothing and sends nothing. Its output is bounded status plus `allowBuy:false` and zero admissions. Private reports retain per-case missingness. A positive offline result means only consistency under the supplied trust contract; even signed host descriptions cannot independently prove actual host separation, collection completeness or provider truth.

The shared pure native quote parser was extracted without changing its algorithm; the collector imports both its timestamp and quote functions. A first control run caught a missed timestamp import; the failure is retained locally and corrected before publication. Original collector assertions remain unchanged.

## Prior-version first-record compatibility

A final independent compatibility probe used the **actual original store bytes at2c9f4186**, hash742d66513bcd5fb23f3d17b70a9401b08f0320350b86e5ffe2cfde0f3a4ec98d. Both its torn signed recovery and torn synthetic claim reproduced `GENERATION_ATTEMPT_CONFLICT` against the initially published56960fd4 schema extension. The correction recognizes an old hash only when an existing attempt/control/archive positively pins that exact prior request. It preserves that hash and every original fragment; it still archives exact signed bytes first and binds their hash into the migrated generation record. A second interruption after that archive resumes through the normal pinned request reader. Different requests remain refused. The original source fixture is preserved for reproducible cross-version worker tests, not substituted for current runtime.

## Exact remaining dependencies

| Area | What is still indispensable | Boundary |
|---|---|---|
| Authenticated host | Approved private execution location; pinned authentic producer prefix before entry; actual primary response transport; independent CAPTURE/WITNESS hosts and complete population/control/coverage acquisition. Host-context signatures here are conditional supplied attestations, not observed physical authentication. | Live binding/acquisition remains implementation + independently reviewed setup/activation, not just missing external evidence. No host was activated. |
| Provider | Applicable reference identity history, quote size units/conditions/firmness, source-specific feed/access, completeness/empty semantics, finality/actions and private retention rights. Confirmed subscriptions do not verify any endpoint or coverage. | No provider call or entitlement probe. Historical audit's twelve cases/max156 stays separate. |
| Custody | Enrolled real recovery authority, separate role roots, private signer/input/archive custody, verified upload/readback/recovery, authenticated stop of legacy writers. | No real root/key creation or secret access. Existing rootless retained stores require separately approved migration/bootstrap, never self-enrollment. |
| Policy | Adopted A cohort/population/control and ZAD validity policy; explicit close-source/finality contract and executable quote semantics. Proposed aggregate-trigger contract is checked as **unadopted** and does not activate a new rule. | Existing 90-day non-halal exclusion and all frozen strategy rules/results unchanged. No A-pilot enrollment/adoption. |
| Review | Claude focused confirmation of exact published scope and fresh complete hosted tests. | Offline implementation is not independent approval, deployment or market demonstration. |

## Acceptance

A3/A4/A5/A7 engineering advanced; CATALYST-03, MARKET-03, EXEC-03, ACTIONS-04 and REPO-03 receive linked source/recovery/caller evidence. **0 rows closed; 24/40 accepted; all 16 original open rows remain open; 0 genuine prospective admissions.** The untouched original criteria remain authoritative. Other sources/lanes/workflows and authentic market evidence remain required; do not label a whole mixed row engineering complete from this bounded importer.

[Exact scope/dependencies](manifest.json), [execution results](verification.json), [all16 owners/closure requirements](../acceptance-queue-20261105.md). Terminal exact-commit CI and full hosted-log receipt are published on PR #1 after ordinary push; no workflow was installed or dispatched.
