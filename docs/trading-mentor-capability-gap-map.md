# Trading mentor: capability, evidence and gap map

30October2026. Development work only. [Machine-readable evidence and hashes](trading-mentor-capability-gap-map.json), [existing aims/evaluation plan](aim-to-evidence-acceptance-plan.md). Accounting `bdc984e` and watcher `be31590` deployment evidence remains preserved. This work deploys nothing, expands no collection, sends no real messages, and changes no strategy/ZAD/execution gate. Acceptance stays24/40 and admitted prospective cases0.

## One coherent owner workflow

The intended sequence is **choose a suitable horizon and supported strategy → verify source/identity/current ZAD → establish a dated entry window and executable price/range → size whole shares within cash, allocation, liquidity and loss constraints → record the actual fill and immutable plan → explain what to monitor while holding → apply the registered exit and reconcile the actual fill/costs → review the complete result**. Unknown evidence blocks a new approval; it does not erase research or an owner-reported fill. Portfolio suitability and willingness to tolerate loss are distinct from a backtest statistic.

| Stage | Existing capability / actual path | Missing requirement for a usable decision guide |
|---|---|---|
| Strategy/horizon selection | `scan.mjs` ACTIONS, `longterm`, `planFor`; registered lab/firstRun and account replay; `trade-plan.mjs` research helper | One explicit evidence standard per lane; don't choose the highest average across horizons after outcomes. Owner-authorized lane is not proven edge. Generic helper's60-stat threshold is not the full frozen/prospective standard; its1/3/5/10/21/42-session grid does not represent this126-session rule. |
| Source and identity | Signal producers, instrument reader, current `resolveZad`, catalyst gates | Authenticated instrument-reference/source revision mapping, freshness, class/action reconciliation, official feed rights and reliable timestamps. No suffix heuristic or old ZAD list can supply missing proof. |
| Entry and expiry | Quick/swing stored anchors; most owner lanes refer to next open; LEADER DIP says +3% ceiling | Match the registered next-open policy to the signal session, actual quote and deadline. A last close is a reference, not an executable ask. The3% ceiling is a changed fill constraint, not validated next-open execution. No new range/target is invented. |
| Position risk | Whole-share accounting, lane1000USD/three-slot allocation, recorded stops/targets | Verified executable ask/bid/size, fees/slippage, concentration/correlation, cash/exposure and explicit tolerated loss. Allocation is not stop risk; the selected no-stop lane can lose its notional plus costs. |
| Holding | Stored position/original plan, current flags, stops/targets, `sellCheckText`, strategy ledger | Preserve rule/version/signal/entry/exit basis at fill; explain current eligibility, stale data, halts/dilution and what changed. A recorded holding alone is not a HOLD approval. |
| Exit | Target and fixed-hold definitions; `ldipCloseFlags`; durable sale/accounting recovery | Exact scheduled close versus next-open reminder reconciliation, actual limit fills, partial fills, gaps/halts and costs. Daily high touching a target is not a broker receipt. No losing result may disappear. |
| Review | Frozen tests, account replay, historical/legacy paper and real-trade reporting | All eligible prospective signals, losers, controls, unknown/censored paths, portfolio costs/drawdown and untouched confirmation; keep standards/populations separate. Zero admitted cases remains zero. |

## Evidence across horizons

| Aim | Existing evidence reviewed | Honest status and missing evidence |
|---|---|---|
| Intraday/premarket | Ignition/early-wave/radar specifications and legacy scorecards; watcher operational repair | No admitted prospective cases; frozen ignition rejection/unproven findings remain. Massive discovery is15-minute delayed. Isolated fresh SIP confirmation is not proven whole-market surveillance. Missing regular/premarket quote paths, trusted identity, session denominators, revision clocks, actual delivery and approved feed scope. |
| Days | Quick/swing ACTIONS and recorded-plan caller tests; earnings-study2021–2026 | Earnings study's pre-gate PROMISING label is superseded by full NOT PROVEN result, including failed older-period comparisons. Missing complete entry/expiry/executable sizing/exit caller contracts and admitted prospective evidence. Do not promote partial labels. |
| Weeks to months | `leaders-study.json` five-year/two-period study; Horizons20/60/120-session results | Leaders chosen result NOT PROVEN (PF1.11 below1.2); live126-3 PROVISIONALLY PROMISING is not confirmation. Horizons PB_UP_20/LEADER_20 remain REJECTED; other60/120 versions remain NOT PROVEN. No relabelling. |
| Months: selected bounded development lane | SQ11-PB12 with A-TGT-TGT20-PB12 registered126-session contract, frozen firstRun and three-slot account replay | Most auditable existing owner-lane entry-to-exit integration among the reviewed candidates, not the highest validated return. Target-exit firstRun NOT PROVEN and adoption=false. Chosen only to repair/explain an already existing workflow; no strategy activation or economic endorsement. |

The examined lab artifacts contain no full PROVEN/TRADABLE SMALL verdict that would justify turning this implementation choice into a new approved strategy. This is a scoped comparison of the pinned sources, not a claim that every repository strategy has been exhaustively ranked. Rejected, unproven and non-adopted findings remain retained.

## Selected lane and the strongest concrete evidence available

**SQ11-PB12 / A-TGT-TGT20-PB12, up to126 trading sessions (about six months).** Its full frozen target study uses2021-10-12–2026-10-23, split2024-01-01, costs0.8% round trip/1.2% stress. Older99 trades: win72.73%, average9.60%, stressed9.20%; newer256: win74.61%, average8.47%, stressed8.07%. These historical trade averages are not prospective expected returns. Block t1.58/0.23 and worse same-stock comparisons fail the frozen bar; the exit's same-money comparison also fails adoption. Worst newer trade **−56.06%**. These limitations take precedence over its attractive win rate.

The separate fixed three-slot account replay is more relevant to usable capital: newer2024-01-02–2026-04-24 annualized19.64% versus SPY18.56%,19 closed trades, drawdown−11.88%; it did not beat SPUS. Older annualized5.27% versus SPY3.35%,9 closed trades, drawdown−22.48%; full29 closed trades. Different populations/time windows explain the difference from355 independent historical trades. Overlapping holdings, limited account sample and frozen row-reconciliation/data limitations are not prospective proof. Current-ZAD-only replay variants are explicitly hindsight; they cannot establish historical compliant eligibility. Representative/delisted/universe/corporate-action completeness remains unestablished merely from a large price cache.

## Implemented next step: a contract-complete explanation

The new development-only **`mentor SYMBOL`** command reaches `tgCommands → mentorText → leaderDipMentorPlan/renderLeaderDipMentor`. It combines an existing LEADER DIP holding or source lead with:

- the source day/reference close, next-open session and expired/unverified entry window; no fabricated executable range;
- actual recorded fill/session separately from unverified exact-open execution, with late-entry/source conflicts qualified;
- known whole shares and recorded notional, missing quantity as UNKNOWN, allocation breaches and the absence of a stop-defined loss cap;
- stored target versus the registered20% target, changed-stop variants, and the session126 close deadline counting the buy day once;
- target-touch/fill uncertainty, current-ZAD summary and explicit unverified identity/quotes/liquidity;
- the negative frozen verdict/adoption and actual-cost/prospective gaps.

New LEADER DIP owner-fill records also capture a versioned signal/contract snapshot: original signal day/reference close, saved input SHA256/generation metadata, registered next-open policy,126-session hold,+20% target basis,no-stop basis, session-close exit and historical cost assumptions. A canonical fingerprint detects accidental replacement; it is **not** provider authentication or a proof of exact opening execution. Legacy positions are not migrated, and the mentor view does not borrow later signals for them.

A mentor-only command does not rewrite positions, encrypted accounting or the strategy ledger, including automatic target normalization from the legacy position loader. The normal command offset still advances through existing handling. Mixed command batches retain existing recording behavior. No new provider request is made. Existing BUY gates, entry/exit rules, stop reminders, sale accounting and research enrollment/scoring are unchanged. This view is explanatory, **not a new executable BUY/HOLD decision**.

A confirmed specification gap is now visible rather than hidden: the frozen time exit is the **close of session126**, while legacy `ldipCloseFlags` says **next open** after126 sessions. The view flags the discrepancy; it does not silently change the owner's exit, rewrite returns or assert a missed-close recovery is tested. Resolving reliable close-timed reminders versus a separately labelled recovery variant is still necessary before claiming a fully aligned executable workflow.

## Next dependencies, in order

1. **Immutable plan identity (partial implementation now):** new records retain the local source/contract snapshot above; tests cover later producer replacement and altered fingerprints. Original provider event/revision identity, exact execution/session time and externally authenticated source provenance still require evidence. Legacy/missing-source fills stay unresolved; no migration or historical rewrite is authorized.
2. **Exact entry/exits:** reconcile the3% ceiling and close-versus-next-open timing with the tested definition across actual ACTIONS/holding/recording callers. Implement separate variants explicitly, never attribute original returns to changed fills/exits. Any changed trading policy needs owner decision; routine faithful branch fixes are authorized.
3. **Tradability:** official authenticated instrument reference and feed rights, current ZAD, fresh BBO/depth/liquidity, corporate actions/halts, whole-share cash/exposure and realistic costs. Where fills use actual entry ask and exit bid, do not charge the same spread again; document fees/slippage separately. Independent code preparation is authorized; reference activation/collection expansion needs the previously specified review/approval.
4. **Prospective validation:** owner agreement on frozen proposed thresholds and horizon before enrollment; source-pinned all-signal/loser/control/path/cost/portfolio evidence, representative five-year historical comparisons where data supports them, concentration/removal-of-winners checks and untouched confirmation. Requires separately bounded collection approval; more wins alone are insufficient.

Readiness: **explanation/fixture path implemented**, full executable mentor workflow **NOT ESTABLISHED**, profitability **NOT ESTABLISHED**, and new prospective enrollment **not authorized**. No acceptance row closes: EXEC-03 requires cross-lane consistency, ACTIONS-04 all writer semantics, TELEGRAM-03 all delivery/state paths, and strategy/history checks require their full independent criteria.

## Operational evidence stays separate

Accounting `bdc984e` and watcher `be31590` remain deployed; see [deployment evidence](watcher-v5-deployment-result.md). No naturally scheduled post-deployment watcher run has yet supplied evidence at the latest read-only check. November DST operational behavior remains **PENDING**, despite the offline calendar test mapping Friday30October to Monday2November. Observe actual source/session/progress/archive/snapshot/duplicate/health/publication evidence through natural runs only. Do not dispatch, backfill observations or treat a test as live proof.

[Verification](validation/trading-mentor-workflow.json):11 focused mentor/source-contract cases, existing14 LEADER DIP and26 recorded-plan controls, full197-file/1,854-case Node suite,30 Python tests,252 module syntax checks,86 workflow YAML and328 shell blocks all pass. Exact published commit CI must be checked at its own SHA. No new acceptance credit is claimed.
