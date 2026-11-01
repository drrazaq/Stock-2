# HISTORY-03 source-anchor reconciliation

Source checkpoint: `d3c1ee58a2785ece01838fa06b81900d01970499`, preserving `2e466c58` and its four completed correction batches. Original audit/harness: `5bcf4d2933c1d77b10b7c12489e2cfbb624387d9`. No original catalogue, frozen result or ERRATA-01 byte was rewritten.

## Completed source pass

The [machine-readable index](../validation/history03-source-anchor-reconciliation.json) locates **all 100 original catalogue records at 151 source locations**, with source-file hashes and explicit dispositions. Changed-hunk locations locate code; they are not proof that a claim was repaired. Original line numbers are not silently treated as current anchors.

Both exact pinned extractors were independently rerun on the audit's original source-file scope, using only committed JavaScript source in disposable directories:

| Source | Narrow candidates | Broad candidates |
|---|---:|---:|
| Production audit base `f6a9b166` | 914 | 1,212 |
| Corrected development `d3c1ee58` | 902 | 1,232 |

The broad baseline reproduces the original 1,212 count. File+literal occurrence matching finds 1,110 unchanged broad candidates, 102 old occurrences absent and 122 new. Qualifications can increase this lexical count: these are **not defect, strategy, trade or acceptance counts**. The original extractors truncate captured literals; a prefix match does not establish complete message correctness. Current semantic catalogue classification and authenticated market-data reproduction remain distinct from this source-location pass.

| Disposition | Records | Meaning |
|---|---:|---|
| Correction/current qualifier covered by linked regressions | 52 | Includes inherited A10 fixes and pre-existing W05 qualification; not 52 new changes or fully authenticated studies. |
| Owner-policy TODO | 11 | Claim IDs affected by the existing six decision topics; no policy adopted. |
| Unapplied correction pending scan handoff | 3 | W09, A12, D07; exact tested proposal below, not an integrated capability. |
| Accurate block reason with unquantified record | 1 | A06: limited sample/window detail does not justify bypassing the block. |
| Prior audit acceptable disposition preserved | 33 | No new adverse finding or claim of a newly executed empirical study. |

## Additional repair actually integrated

The actual midday radar footer still printed `Approved: <legacy alerts>` after the corrected delivery panel. A synthetic actual-caller regression failed before repair. `d3c1ee58` removes that misleading footer label without changing counters, historical ledgers, scorecard formulas or gates. The actual close caller also has an explicit non-promotion regression (X03/B12). The focused set passes **39 cases, six policy TODO**, zero failures. ERRATA-01 still controls D01; the original gate remains.

## Remaining scan corrections, prepared without competing ownership

The [unapplied one-file patch](proposal/residual-scan.patch), [manifest](proposal/manifest.json) and [seven desired-behavior tests](proposal/residual-scan-regressions.mjs) are a finite handoff for Claude's isolated earnings-holiday work. Active `scan.mjs` remains SHA256 `73a241d969df9c20892b3036ebdd7daba335bb8dbcc6a82c5dc3cefc797765c7`.

| Anchor / functions | Confirmed issue | Prepared correction |
|---|---|---|
| W09 — `fastText` | Says only history-passed rules send live alerts despite labelled early paper alerts. | Distinguish classes; preserve alert rules and promotion-policy TODO. |
| A12 — `scoreboardText` | Unexplained `other` status bucket. | `other recorded status (not a pass)`; counts unchanged. |
| D07 — `planCands`, `gateVerdict`, library command | Short-record FADE exclusion reads as validated future underperformance; historical library text says not wired. | Qualify evidence and display current wiring separately, preserving exclusions, thresholds and original library status. Different source-record displays have different populations/bars. |
| Supplemental registry provenance — `experimentRows`, `experimentsText` | Zero attempts become one; invalid counts are not distinguished; incomplete estimates become a total-experiment/false-pass denominator. | Preserve zero, mark invalid counts UNKNOWN, qualify estimates and remove the unsupported expected false-pass count. Strategy luck bars unchanged. |

W05's HELP qualification was independently confirmed with synthetic output. A10's `liveConclusions` inherits corrected display verdicts: signal marks/rounded-zero negative-stress rows do not become WORKING; its existing actual-caller regression passes. A04 remains tied to P2: focus is not evidence/compliance approval, and a minimum legacy live record is not the full proof standard. No policy is adopted.

Final proposal tests: **one control PASS / six FAIL before; seven PASS after**. Eight affected caller test files: **80 PASS** on the proposed tree. All records/services are synthetic. No historical data/library file is edited. Desired-behavior proposal tests stay outside the active passing suite until integration; none requires a bug to persist.

Ownership coordination is published on PR #1. Next action: obtain Claude's exact earnings-holiday head/patch and scan hunk handoff, combine bounded hunks in a disposable current checkout, re-pin and rerun actual callers, then integrate compatible changes. Do not overwrite newer work or alter the exact approved mentor patch. This is an implementation/ownership dependency, not a request for repeated owner permission.

## Reproduction and acceptance

The [source-only reproducer](reconciliation/build-source-anchors.py) reads pinned Git objects, not `data/`, credentials or working financial state. It runs the pinned extractors in temporary source-only directories and cleans them. With the referenced commits present locally:

```sh
python -I docs/history-03/reconciliation/build-source-anchors.py /path/to/repository
```

HISTORY-03 stays OPEN; acceptance stays **24/40, 16 open**. Raw-data authentication or explicit absence qualifications, policy-dependent claims and current semantic catalogue reconciliation remain. No closure is awarded for proposals or test-count growth.

Mentor deployment is still the first release priority. Its independent v3 PASS and approved patch remain intact, but writer run `41327224130` was active at this checkpoint. No cancellation, pause or production mutation occurred. Terminal status and final-save/offset evidence must precede deployment. MARKET-03/CATALYST-03 [review](../reviews/market03-catalyst03/REVIEW.md) and privacy [containment proposal](../news-log-containment-proposal.md) are separate scopes.
