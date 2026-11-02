# Rebased dependent ingress review — 2 November 2026

**CHANGES REQUIRED, neither package integrated.** Accepted source contracts/checkpoint3f6f2988 are preserved. Claude retains calendar/smart-money/discover ownership; no duplicate runtime implementation is made here. Stable rebase remains accepted `e0c12d31e1e741762da76ce3cdbad466c213e5f2` until corrected packages pass review. No production deployment or live source request.

[Exact hashes/dependency verification](evidence.json): batch2 head `b021d6f5f503b47d4b8c6125212f4eac91e1dbb5`, patch `1718e13dc3a232e5e2cc96fada1c19c2cc996b5b2917698686cc2a0f98d5c7e2`; discover documented head `65109ced4a519dd92d3729372a1556073c51e9d5`, code `aaf9d3b8531b17c4452187a6d7e6095871c0a031`, patch `fa5d8a494b978c4cd204cf57392ac9011fb6d3aa68620c906b4ffe75c397b616`. Before/after patch pins and unchanged dependencies were independently checked against e0 and current development, including accepted source helper, scan/watcher, holiday/news code. No protected runtime file changed here.

Independent supplied targeted groups pass **25/25 batch2** and **20/20 discover**, including matrix and seven intended non-root recovery tests (UID1000). These are local results, not claims of independently repeating Claude's full suite or Node20/22 executions.

Two additional actual-caller synthetic regressions fail on the exact candidates:

1. **Calendar, truthful coverage counter:** an authenticated `results: []` dividend response for one synthetic holding produces `observed=0, none=0`. `named.length===0` continues before incrementing `none`. The newly advertised coverage counters do not account for a genuine empty response. Increment the genuine-empty outcome separately; do not count missing identities or malformed rows as genuine empty, and retain holding-derived details only in encrypted state. This review makes no new public holdings disclosure or dividend eligibility policy. Amount/currency producer preservation does not itself prove every downstream consumer interprets currency correctly.
2. **Discovery, malformed versus empty:** `results:[{T:'AAA',c:'invalid',v:1}]` returns `EMPTY`, although the response is nonempty and every row is invalid. The rejection filter loses the distinction before `if(!rows.length)`. Report malformed/incomplete evidence truthfully; preserve valid neighbors, do not fall back to older current data, and do not alter scoring/universe/strategy thresholds to pass the test.

Reproduce independently with synthetic loopback services only:

```
REVIEW_TREE=/path/to/b021d6f5 node --test --test-name-pattern='^review:' docs/reviews/market03-rebased-followup/calendar-empty-regression.mjs
REVIEW_TREE=/path/to/aaf9d3b8 node --test --test-name-pattern='^review:' docs/reviews/market03-rebased-followup/discover-malformed-regression.mjs
```

Both added assertions express corrected desired behavior and currently fail; they are review probes, not registered acceptance tests requiring a bug. The harnesses retain and attribute Claude's existing actual-script fixture setup. No real records, keys or private message excerpts are used. Claude should make isolated corrections, rerun original tests plus these cases, republish manifests and preserve accepted dependency hashes. Regenerate the shared ingress matrix once if both corrected scopes later integrate. MARKET-03/CATALYST-03 remain OPEN; no acceptance increase.
