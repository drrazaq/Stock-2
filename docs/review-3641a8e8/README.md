# Focused review of `3641a8e806b72e65add1ce6a90b82fdad7707a98` (N1–N4 and the B/C proposals)

Reviewer: the Claude session, 6 Nov 2026, offline only.
- **Not done:** no setup, keys, provider calls, collection, activation or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** base `a32539f5`; manifest SHA256 `de4b5c17…cacd0d` (verified).
- **Criteria:** judged against the bar published in advance at [`docs/review-plan-n1n3-bc`](../review-plan-n1n3-bc/README.md) (`4827e228`).
- Saturday's approved STOP-plus-D maintenance is unaffected.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **N1** importer retry | **PASS.** |
| **N2** relabelled synthetic | **PASS**, with an inherent limit that is correctly stated. |
| **N3** planted request | **PASS.** |
| **N4** legacy store | **PASS for the code; one mandatory documentation item is missing.** |
| **L1–L4 and earlier passes** | **Preserved.** All 19 A/N/B/C test files pass (444 tests), and all of my earlier probes re-run identically. |
| **B proposal** (earnings first-15-minute reaction) | **RETURN before adoption.** It fails two mandatory items (novelty reconciliation, a feasible population and controls) and needs two decisions mapped (cost standard, gates). |
| **C proposal** (SQ11-PB12 with quote execution) | **Recommend NOT adopting as designed.** It re-tests a rule that already failed its decisive control, and demotes that control to secondary. |
| **Acceptance rows** | **None meets its complete closure criteria.** 24/40, 16 OPEN, 0 genuine admissions. |

## Tests (Node 20, `tests.txt`)

New files:
- a-importer-recovery-matrix 11/11
- a-n-review-regressions 27/27
- a-n-bc-package 2/2
- bc-research-rehearsal 33/33

Preserved files, all unchanged from earlier reviews:
- a-fenced-recovery 63/63
- a-native-evidence-importer 20/20
- native packages 2/2 + 2/2
- a-fenced-store 12/12
- a-native-source-join 24/24
- a-close-source 20/20
- collector 38/38
- contract 35/35
- coverage 32/32
- recovery-copy 17/17
- A1/A2/A6 13/13
- catalyst prototype 20/20
- workflow 46/46
- catalyst store 27/27

## N1–N4: independent probes (`probes/`)

### N1, importer retry (`n1-probes`, `n1-crossversion`)

Each run below: SIGKILL in the actual store worker during the import, reopen the store, then repeat the exact same import.

| Interruption | First run | Exact retry | Pending after | Bytes |
|---|---|---|---|---|
| Append #1, #2, #5 and #9 at AFTER_INTENT | UNKNOWN | **completes** | 0 | store and originals preserved |
| Append #2 at AFTER_ORIGINAL, AFTER_RECORD and AFTER_COMMIT | UNKNOWN | **completes** | 0 | preserved |
| EVALUATE at AFTER_INTENT, AFTER_RECORD and AFTER_COMMIT | UNKNOWN | **completes** | 0 | — |
| A different import request while a scoped intent is pending | — | `FOREIGN_OR_LEGACY_PENDING_REQUIRES_REVIEW` | — | then the original request completes |
| **Cross-version:** interrupted by the **a32539f5 importer and store** (append #2 and #5 at AFTER_INTENT, #2 at AFTER_RECORD, EVALUATE at AFTER_INTENT), then retried with the 3641 importer | UNKNOWN | **completes** | 0 | old bytes preserved; one `legacy-import-replay-*` receipt each |

A third run is idempotent every time. **This fixes the N1 counterexample from my eb234b30 review.**

### N2, relabelled synthetic (`imp-probes`)

- The fixture relabelled as RETAINED_RESEARCH (including my earlier `origin_selfDeclaredNativeFixture`) now gives `SYNTHETIC_IDENTITY_IN_RESEARCH_STORE`, before any card is produced.
- The other 27 negative controls give the same UNKNOWN reasons as before.
- **Inherent limit (correctly disclosed):** the check is name-, fingerprint- and known-fixture-based. Invented bytes with neutral names, fresh keys and a neutral enrollment would still be accepted. The output is then `synthetic:null` and `NOT_INDEPENDENTLY_ESTABLISHED`, never "authenticated" and never a BUY. Only real, distinct, owner-approved trust roots can close that gap. That is an external dependency, not a code defect.

### N3, planted request (`n3-quarantine`, `plant-resume`)

| Probe | Result |
|---|---|
| My planted unsigned claim, and a takeover file with a bad signature, in an enrolled retained store | Inline authorization: `DURABLE_SIGNED_REQUEST_REQUIRED`. Wrong key: `QUARANTINE_SIGNATURE_INVALID`. Correct durable signed quarantine: `QUARANTINED_UNTRUSTED_REQUEST`. |
| After quarantine | The original file is retained byte-identical and HEAD is unchanged. Appends work again. Resuming the planted request gives `REQUEST_QUARANTINED_NO_TAKEOVER`. A legitimate signed claim reaches generation 2. |
| Quarantining a **valid** signed reservation | `VALID_REQUEST_CANNOT_BE_QUARANTINED`. It stays resumable (generation 2). |

### N4, legacy store (`n4`)

A store created by the frozen 2c9 module (retained, no authority, one lost-body intent):

| Probe | Result |
|---|---|
| CLI | Read-only inspection (`READ_ONLY_COPY_OUT_PROPOSAL`, `admissionEligible:false`). The source is byte-identical before and after. |
| Copy-out | 0755 destination: `PRIVATE_LEGACY_DESTINATION_REQUIRED`. Existing file: `LEGACY_DESTINATION_EXISTS`. Wrong manifest: `LEGACY_EXPECTED_SNAPSHOT_REQUIRED`. Valid: `PRIVATE_COPY_READBACK_VERIFIED`. Source unchanged. |
| Migration | `LEGACY_UNVERIFIED_CONTEXT` plan only |

**Missing (mandatory per the pre-published bar):** the inventory statement. The package never says whether any real, rootless, non-synthetic store exists. No real collection has occurred, so the expected answer is "none". The code is small (about 5 KB), inactive and read-only by default, so I do not ask for its removal. But one sentence in `recovery-and-export.md` should record the inventory result, so that real migration is not mistaken for a live need.

**L1/L2 preservation** (`store-probes`): every earlier result reproduces exactly. That covers enrollment refusal, the previous-version store being read-only, durable signed requests, all 6 torn stages with the original deleted, torn DISPOSE, tamper detection, and the stale token.

## B: `B_EARNINGS_REACTION_1_V1_PROPOSED`

| Criterion | Assessment |
|---|---|
| **Novelty (mandatory)** | **FAIL.** The reconciliation in `prior-verdicts.json` and the README omits the two closest prior tests in this repository, both **REJECTED**. (1) **A-ORB1** (`orb-study.mjs`, `data/orb-study.json`): Zarattini, Barbon & Aziz opening-range breakout on stocks in play. Over 4,007 trades it averaged **−0.84% per trade after 0.8% cost**, which is roughly **zero gross**; own-stock excess −0.92% (t −29), with latency variants equally negative. (2) **EVENT_ORB_RETEST_15D_V1**: an event-conditioned 15-minute opening range. REJECTED, net −0.89% in the older half and −0.03% in the newer half, and it failed the own-stock non-event comparison. B is an event-conditioned (earnings) 15-minute breakout, so it sits between these two. The proposal must cite both and say specifically why an earnings-only, +3%-reaction filter should create a gross edge large enough to clear about 0.75–0.9% of round-trip costs, when both relatives show near-zero gross. "Removes the EPS-surprise prerequisite" is not that argument. |
| **Timing** | PASS. Release known before entry; entry at open+15 to +30 minutes from a fresh ask; no same-bar decision; exit at close−30 s; no inferred timestamps. |
| **Costs** | **Decision needed (mandatory to map).** $3 per side + 2 bps + the actual spread is realistic for liquid names, but it is **lower than the repository standard** (§4: 0.8% / 1.2% stress, plus 2% per side for small stocks). B admits $5 stocks with $5M dollar volume. Either B must also report and pass under the §4 cost model, or the owner must explicitly accept quote-based costs as the standard for quote-backed prospective studies. Silently using lower costs breaks "never lower a cost". |
| **Population and controls (mandatory)** | **FAIL as specified.** The primary population requires an existing owner ZAD mark, for candidates **and** for all 3 controls. Controls must also be in the same SIC3, within a factor of 2 on price and dollar volume, show the same +3% first-15-minute reaction **and** a breakout in the same window, on the same day, with no earnings. The public snapshot of the owner's marks has **229 "ok" stocks**. That is about 916 earnings days a year (about 3.6 per session), and perhaps 0.5–0.9 qualifying reactions per session. Three same-SIC3, same-day, non-earnings stocks with the same reaction and breakout will rarely exist among 229, so most pairs would be unresolved and the 120-pair minimum is very unlikely in 252 sessions. Required before adoption: (a) state whether the primary analysis uses all eligible stocks (research rows) or ZAD-ok only; (b) publish a control-availability estimate from the calibration sessions; (c) fix a control-fallback hierarchy **before** outcomes (for example SIC2, then market-wide). |
| **Missingness** | PASS. Every exclusion is logged, no quote means censored, a missing control leaves the pair unresolved with no substitution, and there is a 5% refusal bound. |
| **Multiple testing** | **Decision needed.** Two-primary Bonferroni (0.025 each) on genuinely new prospective data is statistically valid: the prior search does not inflate a fresh pre-registered test. But the proposed gates (PF ≥ 1.2, lower bound > 0, no-top-2, stress, drawdown, concentration) do **not** include the repository's §4 gates: block t ≥ 2.5, the luck bar, beating the same stock on its other days, and both halves. Map each §4 gate, or have the owner approve a prospective-confirmation gate set. Never a silent replacement. |
| **Power (recommended)** | Assuming a paired per-trade standard deviation of about 3%, 120 pairs give a minimum detectable net excess of roughly **0.8–1.0% per trade** at one-sided 0.025 and 80% power, and more under session clustering. State this before adoption, next to A-ORB1's roughly zero gross. |

## C: `C_SQ11_PB12_QUOTE126_V1_PROPOSED`

| Criterion | Assessment |
|---|---|
| **Novelty (mandatory)** | **FAIL.** The rule is unchanged SQ11-PB12, already **NOT PROVEN**. Its decisive failure was the **own-stock comparison, −10.4% and −11.0%** excess (the stock did better on its other days), plus block t of 1.24 and 0.54. C changes only the execution model (ask/bid, whole shares, close−30 s). Execution changes cannot plausibly reverse a roughly 10% own-stock deficit. The bar says a re-test of a rejected idea "must name the failure it fixes"; C names none. |
| **Controls (mandatory)** | **FAIL.** The own-stock non-signal comparison, the very gate that killed PB12, is demoted to a "secondary feasibility dependency". The primary becomes matched no-pullback leaders. That is gate-shopping, even if unintended. The own-stock comparison must stay primary, or C should not proceed. |
| **Overlap** | C's trigger (first close 12% under the 50-day high, above the 200-day average, 126 sessions) is essentially the owner's **live LEADER DIP lane** trigger. Any C result could be misread as validating or invalidating his lane. The proposal must say so explicitly, and its result must not change the lane without a separate owner decision. |
| **Timing, costs, missingness** | Timing PASS (prior month-end formation, next-session open + 30 s). Costs: same decision as B. Missingness PASS. |
| **Power and feasibility** | **Fails on its own numbers.** About 3.5 years until any result (3 calibration months + 36 enrollment months + 126 sessions of follow-up). Only 6 effective six-month blocks, which makes a bootstrap with 6 blocks nearly uninformative, and 24 allocated trades. The proposal itself admits it may be underpowered. |
| **Recommendation** | Do not adopt as a prospective study. If PB12 remains of interest, a retrospective re-analysis once the original archives are recovered is cheaper and answers the same question sooner. It would remain development evidence, not confirmation. |

## Architectural requirements: is the scope sized right?

`activation-dependencies.md` is consistent with the minimum boundaries in my criteria (§3), with one clarification:
- "Authenticated hosts" and "authenticated independent receipts" should mean **separate execution contexts with separate keys, separate write authority and separate fetches**.
- It should not mean hardware or TLS attestation. That is a recommendation for later, not a gate, given the threat model: self-deception, software defects and leakage; the output is research only and the owner trades by hand.

No other scope expansion was found. N4's export code went slightly beyond the bar, but it is inactive and small.

## Consolidated remaining work

**Mandatory engineering (Codex):**
1. N4: add the inventory statement (do any real rootless stores exist?) to `recovery-and-export.md`.
2. B: add a novelty reconciliation against A-ORB1 and EVENT_ORB_RETEST_15D, with a specific mechanism for a gross edge above costs.
3. B: specify the primary population (all eligible stocks versus ZAD-ok only), a control-availability estimate, and a control-fallback hierarchy fixed before outcomes.
4. B and C: map every §4 gate and cost to the proposal, showing either compliance or an explicit "needs owner decision" item.
5. C: restore the own-stock comparison as primary, or withdraw C.
6. Still unimplemented, as Codex states:
   - live acquisition-to-importer orchestration;
   - an authenticated B earnings-release and first-trigger collector;
   - C point-in-time population assembly;
   - portfolio marks and drawdown.

**Recommended:**
- B: state the minimum detectable effect before adoption.
- C: a retrospective re-analysis instead of a 3.5-year prospective study.
- Expose `inspectImportPending` in the runner CLI for operators.

**Owner decisions** (none requested now; listed exactly):
1. **Cost standard:** may quote-based costs ($3 per side + 2 bps + the actual spread) replace §4's 0.8%/1.2% + 2% small-stock slippage for prospective quote-backed studies, or must both be passed?
2. **Gate standard:** may a prospective, pre-registered confirmation use the proposed gates (two-test Bonferroni, PF ≥ 1.2, lower bound > 0 and the rest), or must it also meet block t ≥ 2.5, the luck bar, beating the same stock on its other days, and both halves?
3. **B population:** may the B study count stocks without an owner ZAD mark as research rows?
4. **C:** adopt, revise or drop. My recommendation is to drop it as designed.
5. Existing, unchanged:
   - distinct trust roots and recovery key custody;
   - two separate collector contexts;
   - private setup (the existing setup-only request);
   - the close-source and ZAD-validity policies;
   - any new data source for B/C.

## Acceptance rows

A3, A4, A5, A7, CATALYST-03, CATALYST-04, MARKET-03, HISTORY-02, HISTORY-04, REPO-03, ACTIONS-04 and EXEC-03 are **OPEN**. **No row meets its complete closure criteria.** All positive results are synthetic. The count is unchanged at 24/40, 16 OPEN, 0 genuine admissions.
