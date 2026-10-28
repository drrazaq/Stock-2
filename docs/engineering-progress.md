# Stock-2 engineering progress dashboard

Updated: 28 October 2026 (Kuwait). Development branch: `Stock2-safety-fixes`. PR: [draft #1](https://github.com/drrazaq/Stock-2/pull/1). No merge, deployment, workflow dispatch, Telegram message or trade performed in this review.

**Completion: 35% (14 of 40 acceptance checks)** for the comprehensive engineering audit, repair and verification scope below. Each of ten workstreams has four equally weighted checks. Only the named completed checks count; in-progress work gets zero credit. This measures documented acceptance work, not percentage of code reviewed, product maturity or probability of trading profit. Earlier ~45% subjective maturity estimates are superseded for this audit. Production acceptance remains blocked.

| Workstream | Complete / 4 | Completed acceptance checks | Remaining acceptance checks |
|---|---:|---|---|
| Repository/scripts | 2 | Enumerate root scripts; syntax-check all 204 baseline scripts | Behavioral review of every script; finalize ownership/research-preservation map |
| Actions | 2 | Inventory/parse all 78 workflows; fix missing pre-ignition ledger save path with regression | Review each workflow's failure/write/concurrency semantics; final-commit remote CI confirmation |
| Market data | 1 | Inventory literal provider hosts and inspect watcher fallback path | Per-source entitlement/coverage audit; symbol/session normalization; full session freshness/latency measurement |
| Early discovery | 1 | Verify pre-ignition runtime call and identify unconnected multi-angle registry | Whole-market premarket discovery; runtime lane integration with point-in-time evidence; matched prospective lead-time/false-positive evaluation |
| Catalyst intelligence | 2 | Inspect timestamp/materiality boundaries; regression fixes for chronology and invalid/coerced evidence | All-source ingestion/deduplication review; independent point-in-time audit and missing-source measurements |
| ZAD compliance | 1 | Approved ignition wording now requires explicit owner ZAD yes and honors exclusion set | Audit all other recommendation paths; verify 90-day rejection persistence/recheck; malformed/stale/missing-file integration tests |
| Execution safeguards | 1 | Reproduce/fix finite-quote midpoint overflow in approved gate and display | Full order-endpoint/permission audit; entry/stop/gap/cost consistency across lanes; end-to-end fail-closed fault injection |
| Telegram | 1 | Existing acknowledgment/failure and cap/mute tests pass | All send paths reviewed; timeout/429/length/retry policy verified; authorized delivery validation |
| Strategy testing | 2 | Run complete baseline suite; run complete post-fix suite | Frozen experiment/holdout registry audit; realistic after-cost independent replay acceptance |
| Historical performance | 1 | Re-read frozen ignition artifact and separate it from five-year daily experiments | Survivorship/delisting/CIK audit; validate all performance claims/windows; benchmark/capacity/drawdown/uncertainty report |

## Verified results and fixes

- Baseline head: `27259f8621e0145bfa5b7e0974e79e21ed35f590`.
- Baseline local tests: **1,170 passed, zero failures**. Post-fix: **1,178 passed, zero failures**, using `node --test test/*.test.mjs tests/*.test.mjs` on Node **24.22.1**. Remote workflows use Node 20; remote confirmation is a separate check.
- All **204** baseline root scripts passed syntax checks; all **78** workflow files parsed. See [full inventory](audit-inventory-2026-10-28.md). Static checks do not substitute for behavioral review.
- Approved ignition alerts previously blocked explicit halal failures but allowed unknown ZAD marks to reach BUY wording. `zad-compliance.mjs` now requires an affirmative owner mark with a valid, nonfuture date within 90 days before the approved path; paper/research labels remain separate. Existing exclusion and SEC checks remain in force.
- The pre-ignition outcome ledger was written by the watcher but absent from the workflow's explicit staged-file list. The save list now includes `data/pre-ignition-days.jsonl`.
- Extreme finite bid/ask values could overflow their sum, producing a false zero spread. Both approved quote gating and the early-alert spread display now use an overflow-safe midpoint. Regression fixtures reproduce the original defect.
- Catalyst study eligibility accepted exits before entry and coerced null/boolean/string economic inputs. Strict nonnegative finite numeric evidence, valid public timestamps/HTTPS source shape, and entry-before-exit checks fix those cases. A syntactically valid URL is not proof of source authenticity. Study thresholds and frozen results are unchanged.

## Commit and CI ledger

| Commit | Status / evidence |
|---|---|
| `27259f8` (existing) | Tests passed: [40740182976](https://github.com/drrazaq/Stock-2/actions/runs/40740182976), [40740173362](https://github.com/drrazaq/Stock-2/actions/runs/40740173362); safety checks passed: [40740172984](https://github.com/drrazaq/Stock-2/actions/runs/40740172984) |
| `c853ef4` | Published first repair batch; targeted safety CI [40750195609](https://github.com/drrazaq/Stock-2/actions/runs/40750195609) passed. Full runs pending at dashboard update. |
| ZAD date-validation follow-up | 1,178 local tests passed; remote CI pending. Exact SHA is the commit containing this update. |

## Findings that limit opportunity discovery

- `premarket-check.mjs` checks holdings; it is not a whole-market catalyst hunter.
- `pre-ignition-discovery.mjs` is called by the watcher and records volume anomalies while change is within -2% to +2%. This is an unproven observation rule, not evidence of predicting runners.
- `assembleMultiAngle` has tests but no runtime caller found. Nine lane definitions alone do not create nine functioning discovery feeds. Distinct lanes may share one underlying event, so lane counts must not be interpreted as independent confirmation.
- Existing early-alert leads require +3% to +8% already observed. Research visibility must remain distinct from approved trade eligibility. The discovery-to-Telegram funnel still needs all attempted leads and suppression reasons joined across sources and horizons.
- 72 workflows explicitly check out main, including the ignition watcher. Dispatch from this branch would run main code in those workflows and is not valid branch integration verification.

## Historical evidence and blockers

The frozen `data/ignition-lab.json` reports **48 variants: 33 REJECTED, 15 NOT PROVEN, zero passing**, window **25 October 2024–23 October 2026**, with **23,913 / 73,864 candidate stock-days tested (32.4%)**. This is partial two-year minute history, not a five-year whole-market result. No frozen experiment was rerun, no final holdout consumed, and no profitability conclusion is justified.

Blockers: final-commit CI; PR initially reported unmergeable, then mergeable after `c853ef4` (no merge performed); branch-only integration validation; prospective full-session data and executable-cost evidence; whole-market premarket ingestion; full ZAD 90-day persistence audit; all-path Telegram validation; authorized privacy migration. Existing research, rejected rules, Agent C/Squad 26 work, settings, holdings, ZAD marks and frozen results are preserved.

Next work is ordered: publish verified safety repairs and confirm CI; complete provider/funnel and recommendation-path audits; implement branch-only research ingestion and runtime integration; then run pre-registered prospective/matched evaluation. Never relax halal, stale-data, liquidity, rejection or risk protections to manufacture candidates or passing results. Merge/deploy/live execution still require owner approval.

Additional source review: `scan.mjs` sends practice orders only to a hardcoded paper endpoint or localhost test override; option labs inspected here use account endpoints for read-only contracts/calendar queries. This is a limited path review, not a completed audit of every execution route. `news-watch.mjs` and `premarket-check.mjs` still have direct Telegram sends that swallow failures, so acknowledgment tests for the ignition helper cannot establish all-channel delivery reliability.
