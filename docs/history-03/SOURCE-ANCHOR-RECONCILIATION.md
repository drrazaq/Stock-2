# HISTORY-03 source-anchor reconciliation

Source checkpoint: `e17d4181e00482eb88b412cc83499d2874ad1dde`, preserving `2e466c58` and its four completed correction batches. Original audit/harness: `5bcf4d2933c1d77b10b7c12489e2cfbb624387d9`. No original catalogue, frozen result or ERRATA-01 byte was rewritten.

## Completed source pass

The [machine-readable index](../validation/history03-source-anchor-reconciliation.json) locates **all 100 original catalogue records at 151 source locations**, with source-file hashes and explicit dispositions. Changed-hunk locations locate code; they are not proof that a claim was repaired. Original line numbers are not silently treated as current anchors.

Both exact pinned extractors were independently rerun on the audit's original source-file scope, using only committed JavaScript source in disposable directories:

| Source | Narrow candidates | Broad candidates |
|---|---:|---:|
| Production audit base `f6a9b166` | 914 | 1,212 |
| Corrected development `e17d4181` | 897 | 1,232 |

The broad baseline reproduces the original 1,212 count. File+literal occurrence matching finds 1,103 unchanged broad candidates, 109 old occurrences absent and 129 new. Qualifications can increase this lexical count: these are **not defect, strategy, trade or acceptance counts**. The original extractors truncate captured literals; a prefix match does not establish complete message correctness. Current semantic catalogue classification and authenticated market-data reproduction remain distinct from this source-location pass.

| Disposition | Records | Meaning |
|---|---:|---|
| Correction/current qualifier covered by linked regressions | 55 | Includes inherited A10 fixes and pre-existing W05 qualification; not 52 new changes or fully authenticated studies. |
| Owner-policy TODO | 11 | Claim IDs affected by the existing six decision topics; no policy adopted. |
| Accurate block reason with unquantified record | 1 | A06: limited sample/window detail does not justify bypassing the block. |
| Prior audit acceptable disposition preserved | 33 | No new adverse finding or claim of a newly executed empirical study. |

## Additional repair actually integrated

The actual midday radar footer still printed `Approved: <legacy alerts>` after the corrected delivery panel. A synthetic actual-caller regression failed before repair. `d3c1ee58` removes that misleading footer label without changing counters, historical ledgers, scorecard formulas or gates. The actual close caller also has an explicit non-promotion regression (X03/B12). The focused set passes **39 cases, six policy TODO**, zero failures. ERRATA-01 still controls D01; the original gate remains.

## Integrated scan corrections after explicit ownership handoff

Claude's `claude/earnings-holiday` handoff at `979bcdf42205d1910a25477fa464f7ea7007b3d0` explicitly delegates application to Codex and leaves `scan.mjs` unchanged on her docs-only branch. After verifying patch SHA256 `608e01e97ab2efcd1cb82ecf240e0e19ccb489bbb573f68c1851e468f452fb07`, Codex combined it with the previously tested HISTORY patch in a disposable checkout, then integrated only the verified hunks and two test files.

[Current source/test hashes and evidence](../validation/history03-scan-integration.json) identify the combined code. The [residual patch](proposal/residual-scan.patch) and [manifest](proposal/manifest.json) preserve the earlier isolated before/after evidence; it is now integrated in development, not approved for production. No financial/data/workflow file changed.

| Anchor / functions | Correction now integrated |
|---|---|
| W09 — `fastText` | Distinguishes history-passed morning lists from labelled early paper alerts. Alert rules and promotion-policy TODO stay unchanged. |
| A12 — `scoreboardText` | Explains `other recorded status (not a pass)`; category counts unchanged. |
| D07 — `planCands`, `gateVerdict`, library command | Qualifies the short-record FADE exclusion and explains current wiring without changing exclusions, thresholds or the original historical library status. Different source-record displays retain their distinct populations/bars. |
| Supplemental registry provenance — `experimentRows`, `experimentsText` | Preserves zero; treats invalid/fractional counts as UNKNOWN; qualifies incomplete estimates and removes the unsupported expected false-pass count. No strategy luck bar changed. |
| MARKET-03 calendar — `peadReactsOn` and actual EARNINGS DRIFT loop | Uses the existing exchange calendar rather than weekday-only arithmetic. BMO/AMC/unknown timing semantics are retained; holiday/closed-day reaction dates are corrected. No rule threshold, stop, hold or verdict changed. |

The proposed holiday helper initially threw `RangeError` for full-shape invalid months, a gap its supplied format tests missed. The integrated helper rejects impossible dates before calendar arithmetic, with additional invalid-month/day regressions. Its ordinary-day equivalence regression over 2026–2027 passes. The broader MARKET/CATALYST package's similar **separate** date helper is not integrated or fixed here; its independent findings still apply.

Final evidence: earlier isolated HISTORY proposal **one control PASS/six FAIL before; seven PASS after**; combined focused **13 PASS**; **64 scan-dependent test files, 574 PASS/six policy TODO, zero failures** locally. Both new test files are registered in the normal suite. All records/services are synthetic. No test requires a known bug. Original code/CLAUDE reports and independent execution are separately attributed in the evidence.

W05's existing HELP qualification was reproduced. A10's `liveConclusions` inherits corrected display verdicts, so signal marks/rounded-zero negative-stress rows do not become WORKING. A04 remains tied to P2: focus is not evidence/compliance approval, and minimum legacy live records are not the full proof standard. No owner policy was adopted. Next independent review should target these exact integrated hunks; the separate approved mentor patch must remain unchanged.

## Reproduction and acceptance

The [source-only reproducer](reconciliation/build-source-anchors.py) reads pinned Git objects, not `data/`, credentials or working financial state. It runs the pinned extractors in temporary source-only directories and cleans them. With the referenced commits present locally:

```sh
python -I docs/history-03/reconciliation/build-source-anchors.py /path/to/repository
```

HISTORY-03 stays OPEN; acceptance stays **24/40, 16 open**. Raw-data authentication or explicit absence qualifications, policy-dependent claims and current semantic catalogue reconciliation remain. No closure is awarded for proposals or test-count growth.

Mentor deployment is still the first release priority. Its independent v3 PASS and approved patch remain intact, but writer run `41327224130` was active at this checkpoint. No cancellation, pause or production mutation occurred. Terminal status and final-save/offset evidence must precede deployment. MARKET-03/CATALYST-03 [review](../reviews/market03-catalyst03/REVIEW.md) and privacy [containment proposal](../news-log-containment-proposal.md) are separate scopes.
