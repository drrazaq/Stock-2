# Narrow ingress re-review r2 — 2 November 2026

Two separate verdicts. **Discover SCOPED PASS, selectively integrated into development. Batch2 CHANGES REQUIRED, not integrated.** Mentor decision checkpoint11f1ac9a and source/receipt checkpoint54eb49fe are preserved; no production deployment or live provider call. [Exact hashes/results/protected files](evidence.json).

## Discover08222738735c1faf4615cdb1ec049e855389a551

Codeb807126b fixes the reported all-invalid-row defect without changing CFG, universe, scoring, SEC/financial/clinical-trial paths or wording. Nonempty/all-invalid results now MALFORMED; genuine empty remains EMPTY; valid neighbors remain usable. Current-day failures still request no older current day, preserve the earlier list's date and record the failed attempt. Latest completed exchange-session selection and labelled historical fallback are retained. This is daily research discovery, not fresh entry-price/BBO evidence or real-time whole-market coverage.

Verified exact four-file artifact01c7301da9de1fd31b38dd97c099547e4ef0b0fb4e9fb7a7b3db171cd2a8b6ba and fix delta479460ed50c1b756262a198b3b5ed023ce9b5dd8129f0e99ab0c80670478ccba. Package patch reproduces byte-for-byte when restricting the diff to its declared four paths and using the original7-character abbreviation. The full branch contains older report history, deliberately not merged. All declared before/previous/after pins and inherited protected dependencies match accepted e0/current development. Applied only the exact artifact; regenerated the shared matrix once and confirmed all four resulting files byte-identical to the reviewed author tree.

Independent Node24.19.0, UID1000: supplied caller+matrix+permissions group21/21 PASS; original published Codex harness11/11 PASS. Current integration caller+matrix+nonroot+history group28/28 PASS; independent harness11/11 PASS (groups overlap). Intended non-root permissions are actually exercised, not waived. Claude's Node20/22 and full-root-suite reports remain her evidence; final hosted exact-head checks are reported separately. No Node22 requirement is introduced.

Scope is the reviewed grouped price-day ingress only. Reference-universe completeness/identity, corporate actions, revision history, statement/news providers, executable bid/ask and downstream plan contracts remain separate. MARKET-03 remains OPEN; matrix29/87 decision ingresses reviewed,3 fully covered, not an acceptance count.

## Batch24859c73654bba06d459b0902f8d657af4c636064

Code6b91c4f7 fixes the original genuine-empty counter and separates malformed-only lookups. Exact patch/delta/manifest/dependency pins verified. Supplied group26/26 and unchanged independent original harness4/4 PASS, including non-root7/7. Nevertheless, one newly introduced aggregation defect reproduces through actual calendar.mjs:

- Two synthetic holdings. AAA gives results:[] (none=1). BBB gives one unnamed row plus one named malformed row (identityMissing=1 and malformedOnly=1 for the same lookup).
- Summing failure flags reaches held=2, so r2 returns UNAVAILABLE, although AAA supplied a valid empty lookup. Correct status is PARTIAL.
- The unchanged previous headb021d6f5 returns PARTIAL for the same status-only regression; r2 returns UNAVAILABLE. This is an independently reproduced regression, not a date fixture or private-state inference.

Reproduce the desired-behavior assertion with synthetic loopback feeds only:

```
REVIEW_TREE=/path/to/4859c736 node --test --test-name-pattern='^review: a genuine empty lookup' docs/reviews/market03-rebased-r2/calendar-overlap-regression.mjs
```

The review harness retains attribution to Claude's original fixture setup and the prior Codex probe. It asserts corrected behavior; no test is registered that requires the defect. Hold calendar/smart-money and their shared matrix changes pending a focused aggregate-status correction. Claude retains those files; no duplicate implementation here. Keep encrypted-only per-holding counts, genuine-empty versus unknown/malformed distinctions, and every prior safeguard. Do not change eligibility or strategy rules to fix a status count.

## Release/acceptance disposition

No whole branch merged, frozen results rewritten, strategy endorsed, collection activated or financial data changed. Scan/watcher/source helper/news/earnings/mentor/receipt/ERRATA are unchanged. Both complete MARKET-03/CATALYST-03 criteria remain OPEN;24/40 accepted,0 new closures/admissions. This source integration neither changes nor activates the separately proposed mentor committed-state boundary or its exact approved eight-file production patch.
