# Unapplied residual scan corrections

This is a separately reviewable development proposal, **not applied** to active `scan.mjs` and not part of the approved mentor release. Claude is publishing the isolated earnings-holiday patch; integration waits for the exact scan hunk handoff. Routine development integration remains authorized once ownership and compatibility are established. No deployment authority is implied.

Base: `d3c1ee58a2785ece01838fa06b81900d01970499`. Patch SHA256: `1510b79b95bd76cad09ecb3155e1b99208595342e9abcd989c631ec31ecb1ca4`. See [manifest.json](manifest.json) for before/after source and test hashes.

Only `scan.mjs` changes: W09 alert-class wording, A12 status label, D07 exclusion/wiring explanations, and registry count/provenance display. No financial calculation, order, request, strategy threshold, evidence gate, frozen result, data file, workflow or policy changes. Existing HELP/A10 fixes and ERRATA-01 remain.

In a disposable checkout at the base, apply and run:

```sh
git apply /path/to/residual-scan.patch
REVIEW_TREE=/path/to/disposable-checkout node --test /path/to/residual-scan-regressions.mjs
```

All records/services are synthetic. Final desired-behavior tests: one PASS/six FAIL on the unchanged base; seven PASS after application. Eight affected actual caller test files: 80 PASS. This manual evidence does not mean active development contains the repair. Refresh hashes and combined tests with Claude's published patch; never force the old base over newer work.
