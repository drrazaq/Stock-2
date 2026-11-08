# Development residual corrections after Claudef335139f /6721730197

Parent3589faf51; separate development branch, not the R1 release composition. Original complete hosted run42471387411 remains PASS for that exact parent, not this new source. No source from the R1 branch is transplanted wholesale.

R1: retain a stop observation at its original fetch clock under the unchanged5-minute stop gate. The first-check stop line now qualifies age “when checked at” and says when no current price is available. Current HOLD/targets/%/buys still call report-time quoteEvidence with the original3-minute/default or explicit gate; future-at-fetch validity remains latched. Dedicated stop batch also states its actual checked-at clock, so age captured earlier is not presented as current after batching delay. Source timestamps/prices are not rewritten.

R2: nonfresh holding alerts omit the price prefix; null can no longer become “ZZS at0.00”. Fresh alerts retain their price.

R3: a STOP STATUS UNKNOWN explanation uses the actual5-minute stop assessment. Non-stop current-price/HOLD evidence retains3minutes. The old exact stale-stop assertion is corrected from3to5, not weakened into alternatives; undated and truly absent quote diagnoses remain exact.

New independent residual6-case file:4FAIL/2PASS on unchanged parent, all6PASS after corrections. Combined actual-caller open/stop/original-port/residual focused45/45PASS on Node20.20.0. Tests include current-price crossing3minutes while later quotes arrive and both stop messages after10minutes of batch delay. Original desired future-at-fetch regressions retained.

Six current scanner metadata pins selectively updated with complete original manifests/old hashes in pin-refresh.json. No historicalBaseDependencyHashes, original A producers, rule/transport/budgets/evidence or data/workflow trees changed. Historical A acceptance does not cover these new scanner bytes; no transferred acceptance or operational/trading closure. Claude focused independent re-review requested. Complete314-file validation remains required after this one-file test addition; focused totals are not a substitute or new profitability evidence. No deployment, keys/settings, production, acquisition or policy action.
