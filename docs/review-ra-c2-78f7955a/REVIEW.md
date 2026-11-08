# Independent review: RA-C2 retained diagnostics, evidence request, 40-row ledger (commit 78f7955ad)

Reviewer: Claude, offline and read-only. Nothing was pushed, commented, dispatched or fetched from any provider, and no key was used. Everything was computed in a detached worktree at `78f7955a` using `python3 -I`.

## Verdict: PASS (no blocking findings)

All seven claims reproduce. I found two non-blocking disclosure points (N1, N2 below).

## Claims

| # | Claim | Result | Evidence (recomputed) |
|---|---|---|---|
| 1 | Hash-pinned reproducible script; 89 × 4 within 1e-12; no weakening | **CONFIRMED** | `retained-diagnostics.py` ran with exit code 0. The regenerated `retained-diagnostics.json` is **byte-identical** to the committed file (`git status` was clean afterwards). The largest absolute error is **4.44e-16** over 89 cases × 4 views. The input pins (script lines 14–15) match the actual files: `analysis.json` = `e846ad00…5f9e` and `data/squad11-lab.json` = `77e49a4b…1defd1a`. All 9 `manifest.json` file hashes match `sha256sum`. `git diff 8d9b8ff5^..78f7955a` touches only 3 files in `ra-c2/final`: RETAINED-FINDINGS.md, retained-diagnostics.py and retained-diagnostics.json, all new. `analysis.json`, `contract.json`, the addendum, both `tools/*.py` and `data/squad11-lab.json` are unchanged. The 2026-10-21 cutoff already existed in the pinned `tools/finalize-recommendation-review.py:40` (`assert len(matched)==30`). The views keep the inferred legacy friction (2.1/1.4/1.2%), which is not replaced by the cheaper 0.8%. No filter or exit change was found. |
| 2 | 21 rejects = 18 losses / 3 wins; avoided 1.595–1.616, foregone 0.312–0.315, net 1.279–1.303 pp; gated mean negative | **CONFIRMED** | `legacy_base` rejected21: definitelyNegative 18, definitelyPositive 3, crossesZero 0. Avoided = [1.59454, 1.61559] pp; foregone = [0.31235, 0.31532] pp. Interval subtraction gives 1.59454−0.31532 = **1.27922** and 1.61559−0.31235 = **1.30324**. This equals `pairedGateEffectFixed51` and the canonical `analysis.json` `summary.legacy_base.matched51GateEffectWithRejectedUnitsCash` (1.2792177570, 1.3032399664). The script asserts agreement to within 1e-12. The denominator is 51 = 30 matched + 21 rejected. The gated mean is sum(matched30)/51: −0.5868×30/51 = **−0.3452%** and −0.5207×30/51 = **−0.3063%**, which matches `analysis.json` `matched51GatedHypotheticalMean`. Under stress, and under both 2% views, the split is 19/2. |
| 3 | Headroom 0.714–0.750% per side (0.269–0.305% atop stress); 2% arm negative; 30/38 descriptive | **CONFIRMED** | `retained68CostHeadroom.base` = [0.0071431, 0.0075049]; `existingStress` = [0.0026929, 0.0030484]. I re-derived the monotonicity bound by hand. For the corner (997−e(1+s))·r(s), the derivative is ≤ e·max(0,−r(.02)) − (997−1.02e)·2(1+g)/1.02². The script asserts this is < 0 for every corner, and the maximum bound is −1527.5, so the bisection is valid. Retained68 under +2% each way: **−2.588% to −2.500%**; under stress +2%: **−3.499% to −3.407%**. Matched30 at base: −0.587 to −0.521%; later38: +3.086 to +3.154%. Both are negative at +2%: −4.56 to −4.48% and −1.03 to −0.93%. The 68 = 30 + 38 split is by `candidateKey` date ≤ 2026-10-21. The text labels the split descriptive (RETAINED-FINDINGS.md §1 ¶3) and labels the root "not a new scoring arm" (¶4). |
| 4 | 0 complete / 102 incomplete; no-fill, missing and delisting preserved | **CONFIRMED** | `analysis.json` `evidenceLayers.execution`: completeAuthenticChains 0, incompleteChains 102. Cohort: 68 scored + 23 stale (21 recovered + 2 unrecovered: MACIU, XCUR) + 10 no-fill + 1 no-bars = 102. The cross-tab 8+23+1+2+68 also sums to 102. Unique rejected or unpriced = 23+10+1 = 34. No row is imputed. All `gone` rows are kept in the output (PB8: 2, PB12: 3). |
| 5 | PB8 −6.556 pp (400); PB12 −7.305 pp (324, 33 missing); fixed-date positive = control conflict | **CONFIRMED** (with N1) | Recomputed from `data/squad11-lab.json` `trades`. PB8: n 400, sameStock mean −6.5556, median −6.395, 146 beat / 254 lose. PB12: n 357, 324 pairs + 33 missing (null `sameStock`, not zero), mean −7.3048, median −6.950, 126 beat / 198 lose. Fixed-date: +4.004 / +8.868; average stock: +3.660 / +8.756. Stored net means are +6.374% / +15.736%. The basis matches `squad11-lab.mjs:254`: net and both stock controls are minus COST, and SPY is raw, as the text states. I found no post-hoc recovery filter. |
| 6 | 24 carried / 16 open, 0 new closures; 40 criteria unchanged | **CONFIRMED** | `remaining-ledger-reconciliation.json`: 40 rows, 24 `COMPLETE_CARRIED_FORWARD` + 16 `OPEN`, all with `newClosure: false`. Its `previousCanonicalSha256` a8a849bb…246df5 equals sha256 of `docs/engineering-acceptance-checks.json` at `8d9b8ff5^`, which has 24 completed + 16 remaining. All 40 reconciliation `criterion` strings match that parent's `basis` (completed rows) or `requiredVerification` (open rows) exactly, with 0 mismatches. Between `8d9b8ff5^` and HEAD, `engineering-acceptance-checks.json` has 0 criterion or status changes. In `acceptance-closure-board.json`, the score is 24/40 both before and after, `closuresEarned` is [], and the 16 rows' `requiredVerification` is unchanged and equal to the checks file. `acceptance-closure-board.md` only gains a header note saying "24/40 unchanged; 0 full-row closures". |
| 7 | Evidence request is review-only, asks for no owner setup, keys or provider contact, and leaves caps unchanged; public terms not claimed as licence closure | **CONFIRMED** | `EVIDENCE-RESOLUTION.md` line 3 says "not permission to execute. Do not ask the owner to create resources…". The final paragraph says "No owner acquisition/setup approval is requested now; no account action or credential material is needed". It says "never request key contents" and "rather than contacting anyone now". The caps match `H1-EVIDENCE-REQUEST.proposed.md` lines 9–17 and 35 exactly: 3 GETs (two quote windows plus one corporate-action call), 20,000 quotes / 1,000 actions, 3 / 1 / 7 MiB, 30 s / 120 s / 30 min, 2 offline hours, $0, 8 MiB encrypted, 1 MiB metadata. H1 is not modified in this range (last changed at 206e44c5). The terms section says the terms "do not expressly settle" hosted use, says the 403'd exchange PDFs are "unverified, not waived", and says "Absence of a public blanket prohibition is not a positive hosted-use grant". It makes no licence-closure claim. |

The disclosure arithmetic was also checked: 1.2/2.8 = 42.857%; 3,531,073 × $113.28 = $399,999,949.44 (warrant figures at `research-tech-primary-20261108/POWER.md:23`); $4.3B / 890 MW = $4.831M. All match their sources.

## Non-blocking findings

- **N1: control populations differ for PB12.** Same-stock uses the 324 non-null pairs, while fixed-date, average-stock and SPY use all 357 rows. On the common 324-row population the values are: fixed-date **+8.553** (reported +8.868 on 357), average stock **+7.648** (reported +8.756) and SPY +3.880. The 33 rows with no pair have a higher mean stored net (+26.4%). The sign conflict and the "control conflict, not timing proof" conclusion still hold, so this does not block. Suggested fix: report the common-population figures, or state that n differs by control.
- **N2: the diagnostic pair is not pinned in `manifest.json`.** `retained-diagnostics.py`, `retained-diagnostics.json` and `RETAINED-FINDINGS.md` are not listed in the manifest, and `diagnosticAddition.focusedReview` is still `PENDING_CLAUDE`. The script does pin its own inputs, and its output reproduces byte-for-byte. Suggested fix: add their sha256 values when recording this review.
- Wording only, already disclosed: the 21 rejects split 18/3 in the whole-share model but 17/4 in the original percentage labels (`analysis.json` cohortAccounting). Likewise the retained 68 split 23/45 versus 27/41. RETAINED-FINDINGS explains the 68 difference. It could add the same one-line note for the 21.

## Commands run

```
git worktree add --detach …/scratchpad/ra-review 78f7955ad
python3 -I docs/recommendation-audit-20261108/ra-c2/final/retained-diagnostics.py   # rc=0; git status clean afterwards
sha256sum <9 manifest files> data/squad11-lab.json analysis.json
python3 -I (inline): load retained-diagnostics.json; interval subtraction; counts; gated-mean check against analysis.json summary
python3 -I (inline): squad11-lab.json trades -> paired controls on full and common (sameStock non-null) populations
git show 8d9b8ff5^:docs/engineering-acceptance-checks.json | sha256sum   # = previousCanonicalSha256
python3 -I (inline): compare the 40 reconciliation criteria to the parent basis/requiredVerification; parent vs HEAD checks/board
git diff --stat 8d9b8ff5^ 78f7955a -- docs/recommendation-audit-20261108/ tools/... data/squad11-lab.json
git diff 8d9b8ff5^ 78f7955a -- EVIDENCE-RESOLUTION.md acceptance-closure-board.md engineering-ledger.json
grep caps in H1-EVIDENCE-REQUEST.proposed.md; grep squad11-lab.mjs:254 control basis
git worktree remove …/ra-review
```

## Not verified

- I did not re-derive `analysis.json` itself from the raw ignition files. It is hash-pinned and unchanged in this range. That derivation was covered by the earlier RA-C2 conformance review.
- I did not open the Alpaca terms PDF or the disclosure pages, because this review is offline only. The terms characterization is checked only for internal consistency and for not claiming licence closure.
- The hosted runs and PR comments cited in REMAINING-CHECKPOINT were not checked, because they are outside this offline scope.
