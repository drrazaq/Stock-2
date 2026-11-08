# Engineering continuation: bounded development checkpoint

Coordination: PR #1 comment 6718744064. Development base a4976e0270a41bd0eb5292b153ed819a60aaac37; production observed 774273205e1c8ce3db30c59ca368dc107617ef73. This separate review branch changes neither branch. No production, settings, secrets, credentials, provider acquisition or workflow execution is authorized.

## Implemented development subset

Ported the reviewed calendar r3 exact-series parser and scan calendar formatting from 99e630dff530bb9f88dfa384231409102a0320f5. Ported its exact compactProblem helper into the newer development health reader, retaining development's watcher report and pending/UNKNOWN alert-delivery warning. Preserved newer SEC discovery wording. The source matrix adds only the three static economic-series citation URLs as file-scoped REFERENCE_ONLY; calendar BLS ingress remains PROVIDER. No acquisition transport added. Matrix coverage remains partial.

Development already contains full-pass cadence timing and session-aware cutoff. No watcher, workflow or guard reset was made. Open-check remains Claude-owned: do not transplant its production-only STOP/D dependencies or hardcoded 15:00 wording into newer development.

## Independent execution

Local runtime Node 24.22.1; no claim of Node 20 or hosted CI verification. All tests use invented fixtures and intercepted/local requests. Complete logs accompany this checkpoint. Calendar/health/delivery subset:48/48; source-matrix/calendar/clock/guard/profile subset:50/50 (overlapping, not additive). Development cadence:10/10, two seasonal dates and five pass durations. At the fixture's exclusive 15:00 cap, sub-minute passes retain all330 configured minutes;65s passes honestly omit25. These are bounded synthetic fixture results, not full-session actual coverage.

Production source-only scratch composition applied the exact reviewed watcher package046877af8bf710bf86266533e9a275a8f326a48e, open-check1968846d5f8af45ed8b5153301685feba9a73168 and calendar r3. Supplied focused tests79/79. Independent cadence10/10 at its inclusive15:00 fixture cap331;65s omits25. Reverting only the full-pass timing anchor in the fixture causes both seasonal countercontrols to fail. No composed deployment is recommended.

## Remaining blockers: open-check

The independent actual intraday-caller checks fail both desired assertions: (1) an unquoted leader-dip holding with no stop says HOLD when another fresh holding triggers the first report; (2) with all holding quotes absent, the first report is suppressed instead of emitting holding UNKNOWN. Original production fails8 of9 supplied repair assertions. Passing supplied repair tests therefore does not close these additional paths. Claude must correct these caller paths and prepare a newer-development-aware port; Codex re-reviews exact corrected source. No parallel rewrite of Claude's scan region.

Reproduce in an isolated production composition: `REVIEW_TREE=/absolute/composed/tree node --test docs/engineering-continuation-20261108/open-check-extra-review.test.mjs`. Cadence uses the same REVIEW_TREE with cadence-current.test.mjs. `REVERT_CADENCE=1` intentionally tests the old anchor and must fail in that composition. Original package patches and their inverses stay in their immutable source commits; the unsafe open-check composition is not published as a release patch.

## Acceptance and research

[All40 original rows](acceptance.md) and [machine-readable criteria/provenance/dependencies](acceptance.json):24 accepted carry-forward,16 open, zero new closures. These are not40 fresh retests. `reconcile-ledger.py` regenerates the table from the immutable development-base ledger; it does not alter original criteria or accepted evidence. Software checks establish no economic profitability, authentic fills or evidence-based trading closure.

R1 and RA-C2 remain separately tracked in PR #1 comments6718847939 and6718848101. R1 release blockers and RA-C2 proposed research conventions are not operational approvals. Parked IG1 remains parked. No owner activation decision is needed for this source checkpoint; exact runtime corrections and independent reviews come first. Empirical owner choices remain contingent on separately reviewed bounded evidence packages.

## Focused review requested

Claude: review the selected calendar/health port, preservation of newer development behavior, file-scoped citation classification and unchanged40-row criteria; correct the two reproduced open-check caller failures and propose the missing development-aware integration. This checkpoint is review-only, not READY or a release authorization.
