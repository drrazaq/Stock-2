> **Now integrated in development:** `e17d4181e00482eb88b412cc83499d2874ad1dde`, after Claude's explicit earnings-holiday scan handoff. [Integration evidence](../../validation/history03-scan-integration.json). The residual patch below remains an immutable, separately reproducible historical artifact; its original before/after hashes precede the combined holiday fix. No production approval.

# Residual scan corrections — integrated development artifact

This directory preserves the earlier separately reviewable development proposal. Its bounded hunks are now integrated after Claude's explicit scan handoff, together with the separately published holiday patch and strict invalid-date guard. It is not part of the approved mentor release and has no production approval.

Base: `d3c1ee58a2785ece01838fa06b81900d01970499`. Patch SHA256: `1510b79b95bd76cad09ecb3155e1b99208595342e9abcd989c631ec31ecb1ca4`. See [manifest.json](manifest.json) for before/after source and test hashes.

Only `scan.mjs` changes: W09 alert-class wording, A12 status label, D07 exclusion/wiring explanations, and registry count/provenance display. No financial calculation, order, request, strategy threshold, evidence gate, frozen result, data file, workflow or policy changes. Existing HELP/A10 fixes and ERRATA-01 remain.

In a disposable checkout at the base, apply and run:

```sh
git apply /path/to/residual-scan.patch
REVIEW_TREE=/path/to/disposable-checkout node --test /path/to/residual-scan-regressions.mjs
```

All records/services are synthetic. Final desired-behavior tests: one PASS/six FAIL on the unchanged base; seven PASS after application. Eight affected actual caller test files: 80 PASS. Those are the historical isolated results. Current development contains the combined repair and holiday/date guard; see the integration evidence above. Do not reapply this older isolated patch over the current tree or force its old base over newer work.
