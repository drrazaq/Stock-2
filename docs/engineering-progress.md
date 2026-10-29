# Stock-2 engineering progress dashboard

Updated: 28 October 2026 (Kuwait). Development branch: `Stock2-safety-fixes`. PR: [draft #1](https://github.com/drrazaq/Stock-2/pull/1). No merge, deployment, workflow dispatch, Telegram message or trade performed in this review.

**Completion: 37.5% (15 of 40 acceptance checks)** for the comprehensive engineering audit, repair and verification scope below. Each of ten workstreams has four equally weighted checks. Only the named completed checks count; in-progress work gets zero credit. This measures documented acceptance work, not percentage of code reviewed, product maturity or probability of trading profit. Earlier ~45% subjective maturity estimates are superseded for this audit. Production acceptance remains blocked.

| Workstream | Complete / 4 | Completed acceptance checks | Remaining acceptance checks |
|---|---:|---|---|
| Repository/scripts | 2 | Enumerate root scripts; syntax-check all 204 baseline scripts | Behavioral review of every script; finalize ownership/research-preservation map |
| Actions | 3 | Inventory/parse all 78 workflows; fix missing pre-ignition ledger save path with regression; confirm all three CI runs on final code SHA | Review each workflow's failure/write/concurrency semantics |
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
- Baseline local tests: **1,170 passed, zero failures**. Post-fix: **1,181 passed, zero failures**, using `node --test test/*.test.mjs tests/*.test.mjs` on Node **24.22.1**. Remote workflows use Node 20; remote confirmation is a separate check.
- All **204** baseline root scripts passed syntax checks; all **78** workflow files parsed. See [full inventory](audit-inventory-2026-10-28.md). Static checks do not substitute for behavioral review.
- Approved ignition alerts previously blocked explicit halal failures but allowed unknown ZAD marks to reach BUY wording. `zad-compliance.mjs` now requires an affirmative owner mark with a valid, nonfuture date within 90 days before the approved path; paper/research labels remain separate. Existing exclusion and SEC checks remain in force.
- The pre-ignition outcome ledger was written by the watcher but absent from the workflow's explicit staged-file list. The save list now includes `data/pre-ignition-days.jsonl`.
- Extreme finite bid/ask values could overflow their sum, producing a false zero spread. Both approved quote gating and the early-alert spread display now use an overflow-safe midpoint. Regression fixtures reproduce the original defect.
- Catalyst study eligibility accepted exits before entry and coerced null/boolean/string economic inputs. Strict nonnegative finite numeric evidence, valid public timestamps/HTTPS source shape, and entry-before-exit checks fix those cases. A syntactically valid URL is not proof of source authenticity. Study thresholds and frozen results are unchanged.

## Commit and CI ledger

| Commit | Status / evidence |
|---|---|
| `27259f8` (existing) | Tests passed: [40740182976](https://github.com/drrazaq/Stock-2/actions/runs/40740182976), [40740173362](https://github.com/drrazaq/Stock-2/actions/runs/40740173362); safety checks passed: [40740172984](https://github.com/drrazaq/Stock-2/actions/runs/40740172984) |
| `c853ef4` | Published first repair batch; targeted safety CI [40750195609](https://github.com/drrazaq/Stock-2/actions/runs/40750195609) passed. Both full runs also passed (40750205327, 40750195524). |
| ZAD date-validation follow-up | Published as `4c3e629`; both full tests and safety CI passed (runs 40750427084, 40750411512, 40750411506). |

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

## Shadow evidence-integrity correction

Related quote arithmetic defects also existed in `rank-models.mjs`, `shadow-stream.mjs` and `shadow-eval.mjs`. Corrected calculations reject nonfinite quotes, prevent midpoint overflow and never treat future/invalid quote ages as fresh observed fills. Unknown quotes retain the existing explicitly flagged assumed-spread model; invalid entry or delayed prices are unscored. Three regressions cover these defects. No model thresholds, costs, ranking criteria, `FROZEN` metadata, stored outcomes or verdicts were changed, and no experiment rerun was performed. Future evaluations must identify the corrected code version; never silently overwrite a first verdict. This follow-up has 1,181 passing local tests; all three remote CI runs passed on code SHA `9c6f39e83d60276899aae26387355a5fbaff14bb`.

## Final verified code checkpoint

Commit `9c6f39e83d60276899aae26387355a5fbaff14bb`: [push full tests 40750736004](https://github.com/drrazaq/Stock-2/actions/runs/40750736004), [PR full tests 40750799080](https://github.com/drrazaq/Stock-2/actions/runs/40750799080), and [targeted safety CI 40750726428](https://github.com/drrazaq/Stock-2/actions/runs/40750726428) all completed successfully. All 205 current root scripts passed syntax checks and all 78 workflows parsed. Working tree matched published code; the three repair commits changed 18 files, with no changes under `data/`. This dashboard completion update changes documentation only. Comprehensive behavioral audit and prospective evidence remain incomplete.

## Full-system mission: October 28 incident checkpoint

[Incident reconstruction](incident-2026-10-28.md) establishes an opening-session run followed by a queued two-minute duplicate that overwrote the day. [Machine-readable ledger](engineering-ledger.json) separately lists actual behavioral review scope, severity, fixed/open defects, engineering acceptance and strategy promotion evidence. [Reproducible inventory](engineering-inventory.json) now covers 206 modules, 78 workflows and 335 non-private dataset files; all dataset serialization checks and relative imports pass. This does not establish historical correctness. `python tools/repository-audit.py --syntax --output docs/engineering-inventory.json` regenerates the inventory without network calls or dataset mutations.

Current batch: duplicate protection, immutable run snapshots, coverage-based canonical selection, accurate mover totals/history labels and mixed catalyst attribution. Local tests: 1,190 passing, zero failing. New-commit CI pending. Engineering acceptance remains 15/40 (37.5%) until further acceptance work is complete. New early-engine strategy promotion: 0/8 required evidence checks completed; zero approved variants. No live behavior was changed.


## Resumed field-clock and legacy-session repair

Verified base `a06032c`: all three CI checks passed (full tests [40755046492](https://github.com/drrazaq/Stock-2/actions/runs/40755046492), [40755035592](https://github.com/drrazaq/Stock-2/actions/runs/40755035592), safety [40755035601](https://github.com/drrazaq/Stock-2/actions/runs/40755035601)). The earlier pending-CI note is resolved for that base.

A short usable-heartbeat retry could outrank a longer legacy day lacking heartbeats. Publication now protects the legacy duration; an equal or longer observed session can still replace it. The watcher now normalizes Massive and Alpaca fields through `snapshot-fields.mjs`: selected price retains its own timestamp, aggregate volume retains its bar timestamp, missing timestamps remain unknown, and a new trade cannot refresh stale volume. Numeric strings and nonfinite fields are rejected. An Alpaca daily bar timestamp is not evidence of real-time aggregate freshness; the source label now says so.

Validation: 12 targeted tests passed (snapshot fields, session coverage, existing paper freshness); all five changed JavaScript files parsed. The real watcher duplicate-exit integration passed via Python, retaining the exact fixture bytes and creating no other data files. The Node child-process version is blocked locally by sandbox `spawnSync EPERM`; this is not a passing test. New-commit full CI remains pending. No frozen dataset or historical strategy was modified. Acceptance remains **15/40 (37.5%)**.

Workspace recovery: no checkout was provisioned; Git transport could not connect to the configured proxy. Source/tests were reconstructed from the exact GitHub checkpoint using the connector. This directory is a partial materialization, not a complete Git clone. An interrupted no-credential watcher smoke process created local synthetic empty-data outputs; those were quarantined under `/workspace/scratch/stock2-interrupted-fixture/data` and must never be committed as market evidence. No live Telegram send, order, workflow dispatch or production deployment occurred.

Next: verify new-commit CI, add mocked-provider watcher integration, review publication/save races and per-attempt shadow archives, then continue the existing whole-system backlog. The duplicate repair still does not establish complete exchange-session coverage or production acceptance.

## Publication recovery — 29 October 2026

Recovered the original exact bundle (SHA-256 `e62a4e9fa7e294d711d461ca1d4883c14e8e8e54e9a96d229db34aa07037f152`); all seven files matched byte for byte. Re-read remote head `a06032cca7c309f486a5215b15bd8a81fc6b1b08` and base tree `cbc9b75fb0618579cfa9a51f9b9ce2685debe2c5`; no remote conflict. Complete diff saved locally as `/workspace/scratch/stock2-recovery.diff`.

Re-ran 12 targeted tests and the Python-launched real watcher integration: all passed. All 207 root modules parse and all 78 workflows parse. Local integration requires per-command network access for localhost fixture servers; this resolves the earlier sandbox restriction without changing production permissions. The first full run after enabling it passed 1,193/1,195: the two failures were missing reconstruction inputs, not code failures. Restored 15 required input files from remote blobs, verified each Git blob hash, and reran the complete suite. Restored private files and frozen strategy-library bytes are test inputs only and are excluded from the publication patch.

Publication and exact-commit CI are recorded in the next checkpoint update; do not infer success from this preparation entry. Acceptance stays 15/40 (37.5%).

Final recovery validation: **1,195 passed, zero failed, zero skipped** using `node --test test/*.test.mjs tests/*.test.mjs` on Node 24.19.0. Twelve targeted tests, the Python watcher integration, 207 root syntax checks and 78 workflow parses passed. New-commit remote CI pending.
