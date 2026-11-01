# HISTORY-03 integration — bounded runtime batches

Source audit/harness: Claude `5bcf4d2933c1d77b10b7c12489e2cfbb624387d9`, [immutable original package](https://github.com/drrazaq/Stock-2/tree/5bcf4d2933c1d77b10b7c12489e2cfbb624387d9/docs/history-03). Integrator: Codex. The original catalogue is review evidence, not automatic authority to change policies. No production deployment is part of this integration.

## Batch 1: qualification and corrected-behavior harness

Confirmed wording/provenance repairs: W04 HELP (paper fills and budgets never imply proven buys); W03 longterm (limited horizon/quality summaries are not proof that SPY beat all methods); A01 ACTIONS insider subset (actual stored verdict, both SPY comparisons, historical rather than prospective); D02 check (risk instructions do not imply profitability proof); D03 earnings card (NOT PROVEN, no unsupported fixed aggregate return); D01 switch option (NOT PROVEN/below-bar, no invented five-year duration); B04/E01 market shock (pre-selected historical population, not expected returns, historical rather than prospective cases). No underlying rule, gate, positions, frozen results or cost parameters changed.

ERRATA-01 is preserved **byte for byte**, Git blob `91eb913b0be565a6860698d635ace1c06c3f7ef5`. D01 is a latent wording defect, not a missing-gate/opposite-advice defect. The original `swTier`/`swWins` admission and rejection tests remain; P3 is a separate policy question.

Integrated `test/history03-env.mjs`, `history03-current-policy.test.mjs` and `history03-claims.test.mjs`. The shared environment points to this repository and reuses synthetic fixtures. No defect-characterization assertions were retained. Corrected claims are active gates; owner-dependent proposals P1–P4, stop default and W01 remain explicit TODO. The README's old FINDING-pass/mutation-fail convention is not imported. Prior development repairs to the watcher send-order/paper body/radar label and news decision path are preserved; old main-shaped finding assertions for those are not treated as current regressions. The current radar test checks the explicit REJECTED history verdict rather than obsolete “5-year” wording.

Reproduction on the unmodified development source: original harness 14 pass / 5 fail / 11 TODO (four already-fixed finding checks plus one outdated history-label check). Adapted corrected-output gates before repairs: eight active failures; after repairs: no active failure. Actual earnings ACTIONS and actual news-watch subprocess tests supplement source checks. Focused batch tests: 61 cases, 54 PASS, 7 TODO (six owner decisions plus implementation-pending counter split for batch 2), zero failures. All network operations are synthetic loopback; no real keys/messages/provider calls.

## Remaining bounded batches / closure

1. B01/D15: separate observation/recording from confirmed delivery and separate early paper from history-qualified alerts in watcher snapshots/checkpoints and radar summaries; legacy counts must remain explicitly unsplit/unknown. This is counting, not authority to print BUY. Do not infer current approval from a historical message.
2. Remaining wording-only findings in the pinned ranked catalogue, with actual-caller regressions and source-window/selection/cost/hold labels. Update current-source outcomes beside the pinned audit; never rewrite its evidence.
3. Missing provenance: qualify as not independently reproduced or drop unsupported numbers; no historical rerun or frozen-data rewrite.
4. Policy decisions remain TODO: P1 paper promotion; P2 per-stock eligibility; P3 below-bar sell options; P4 tier-2 lane authority; stop default; W01 current plan confirmation. Existing independent safety repairs are not rolled back while awaiting these decisions.

HISTORY-03 remains OPEN. Catalogue completion is separate from runtime correction, owner policy decisions and authenticated reproduction of acted-on claims. Acceptance remains 24/40. Mentor approved package/PR #3 is unchanged; production deployment was blocked by active writer `41327224130` and is not inferred completed. Reviewer optional mentor wording remains outside its exact approved patch. No source/claim repair here is automatically approved for production.
