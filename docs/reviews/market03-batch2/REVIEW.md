# Independent review: ingress batches 2/3

**CHANGES REQUIRED; no runtime integration.** Exact reviewed head `5418fff47cac6f193be8304d403a027d571a07ce`, code commit `ea9019dfc433d5916c6614c23b8e5aebe90727e2`, base `e6a1382c69201bd13add0b2249fa75e1fc3d51bd`. Exact five-file patch SHA256 **`9cc0e02f3fb61a46306b81b7cb3d77e1108d0c6319cec576ed783e567feda0cd`** independently matches. Both runtime before/after hashes match; current development's `smart-money.mjs` and `calendar.mjs` still match their before hashes. No newer scan, mentor, watcher, source or holiday work was replaced.

Claude explicitly owns `smart-money.mjs` live ingress and the Massive block of `calendar.mjs`; this review does not edit them. The original R1–R3 package stays separately unintegrated. The batch reuses its `source-contract.mjs`, including the unresolved R1 invalid-date defect. The updated ingress matrix also depends on the first package's selected tree; it cannot be copied as a declaration that current development has all of those contracts.

## Independently executed

- Exact branch, local Node 24.19.0, **non-root**: six supplied actual-producer cases, three matrix cases and seven publication/recovery cases: **16/16 PASS**.
- Selected runtime/test files plus only their required shared source helper over development `e6c99995`: **13/13 PASS**, including the same seven non-root publication tests. This disposable candidate is not integrated or approved. Matrix portability remains an explicit dependency; no drift assertion was weakened.
- `tests/research-recovery-publication.test.mjs` was also run directly on current development: **7/7 PASS under its intended non-root permissions**, with the original assertions intact. Claude's root-run failure is not waived or removed.
- [Four added desired-behavior cases](additional-regressions.mjs), actual scripts with loopback providers and a synthetic encryption key: **0/4 PASS**. These tests require corrected behavior, never the persistence of a bug. They remain review evidence outside the active passing suite.
- Claude's reported complete suite and Node 20/22 runs are her evidence, not independently repeated complete runs here. Node 22 is not added as a new acceptance requirement.

## Required corrections

| Finding | Actual-caller evidence | Required behavior |
|---|---|---|
| B2-1 — inherited invalid-date isolation | A full-shape impossible month in the holiday response throws in `isDay`, aborting the actual calendar process before valid unrelated rows can be retained. | Use the corrected shared helper, isolate malformed rows and retain honest source status. Do not duplicate or substitute the already integrated scan earnings-holiday fix. |
| B2-2 — missing returned identity | A dividend row without `ticker` is attached to synthetic held symbol AAA and its lookup is OBSERVED. README says rows must name the held ticker, but code checks mismatches only when the field exists. | Missing identity must remain unresolved and must not become an attributed holding event. Retain research/raw evidence privately where applicable; do not invent a security identity or discard unrelated valid rows. |
| B2-3 — future recommendation periods | Actual smart-money producer emits a current analyst turn from a next-month period. Sorting/consecutive-month checking does not reject future observations. | Validate the source's period/observation clock before current signal/scored-tip enrollment; retain explicit exclusion evidence. |
| B2-4 — recommendation field units/schema | Nonnumeric recommendation counts are recorded with zero malformed rows. Raw `+` expressions can coerce strings; strict-number handling was added to insider rows, not these counts. | Validate every required count as a finite nonnegative count, distinguish missing/invalid from zero, and report a truthful source outcome. |

The new currency field also needs its separately coordinated consumer change: current `scan.mjs` formats dividend amounts without currency. Do not approve this as an end-to-end amount/price-drop contract until the reader is tested, and do not assume an unstated currency is USD. Public status **counts are not automatically a privacy clearance**: even holding-related counts need classification, without publishing their values here.

Name spacing/case normalization is not authoritative person identity, and a reporting person is not necessarily an executive. This review neither promotes the insider screen nor revises frozen insider studies. The package does not authenticate corporate-action basis/security identifiers or complete all 87 decision ingresses. MARKET-03/CATALYST-03 remain OPEN; no acceptance increase.

## Compatibility and next action

The calendar hunk is reported to apply to production main `f6a9b166`; the smart-money first-line/shared Telegram dependency differs there. Both require the still-unintegrated source contract. **No standalone production release is proposed.** Refresh the exact dependency/matrix pins after Claude corrects the defects and review the selected hunks against the then-current development tree. Preserve the independent earnings-holiday fix and approved mentor package.

Replay in a disposable exact or selected candidate checkout:

```sh
REVIEW_TREE=/path/to/candidate node --test /path/to/additional-regressions.mjs
node --test tests/market03-batch2-smart-money.test.mjs tests/market03-batch3-calendar.test.mjs tests/research-recovery-publication.test.mjs
```

No real provider, credential, message, experiment, migration or production change was used. The synthetic examples are not market observations or admitted prospective evidence.
