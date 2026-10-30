# Mentor development review: exits, examples and next evidence

Development milestone only; **LEADER DIP remains NOT PROVEN**. This review does not endorse a strategy, activate a target, change a gate, deploy code, collect data or send messages. The [capability map](trading-mentor-capability-gap-map.md) remains the broader context. [Synthetic outputs](mentor-synthetic-examples.md) and [pinned horizon evidence](mentor-horizon-comparison.json) make this checkpoint reviewable.

## 1. Exit fidelity and unresolved plans

The original **SQ11-PB12 base** buys the next session's open and exits at the close of session126, counting the buy session once, with no fixed profit target and no modelled stop. Its frozen verdict is NOT PROVEN (`squad11-core.mjs`, `data/squad11-lab.json/firstRun/SQ11-PB12`).

**A-TGT-TGT20-PB12 is a separate target-exit experiment**, not the original base exit. It models an entry×1.20 target, with the same session126 close backstop and no stop. Its frozen verdict is NOT PROVEN and its adoption result is **false** (`agent-a-tgt-core.mjs`, `data/agent-a-tgt-lab.json`). Existing owner-lane authorization to use that overlay does not turn it into an adopted or validated research result. Historical target-touch assumptions do not prove actual broker fills. Neither the base nor overlay is promoted here.

The development renderer now names those layers separately. The field formerly called `storedTargetConfirmed` is renamed **`storedTargetMatchesOverlay`**: matching arithmetic confirms neither adoption nor execution. Stored stops or conflicting targets/holding periods are unresolved variants, not silently assimilated to the tested result.

The legacy caller's next-open time-exit reminder still differs from the frozen **session126 close**. This checkpoint exposes that mismatch rather than changing the owner's exit or claiming the original returns validate delayed liquidation. A calendar reference can be due/past while the overall plan is unresolved; `exit.referenceState` is therefore separate from `holdingState`. Contradictory, unsupported or incomplete plans show **UNRESOLVED / NOT_ACTIONABLE** near the top and `UNRESOLVED_PLAN_NOT_HOLD_GUIDANCE`. Even a locally consistent snapshot remains **LOCAL_CONTRACT_ONLY_UNVERIFIED / NOT_ACTIONABLE**. No output is a new BUY or HOLD approval.

## 2. Reproducible synthetic examples

[Published output](mentor-synthetic-examples.md) includes five cases:

- A structurally consistent new reported fill with a source/contract snapshot; exact opening execution, identity and quotes remain unverified.
- A legacy holding whose original source/session cannot be reconstructed from a later signal.
- A next-open entry that expired after the actual New York opening, including the November offset.
- Missing source/fill/quantity/execution evidence.
- A contradictory150 target,90 stop and63-session holding period against this126-session contract.

All inputs are explicitly synthetic. `tools/render-mentor-examples.mjs` imports the pure planner and writes examples to stdout; it reads no holdings, private accounting, secrets or provider endpoints. Regenerate with `node tools/render-mentor-examples.mjs`. The regression suite checks the exact published bytes and all five non-actionable statuses. A consistent example is **not** a genuine prospective case. No private user excerpts were copied into fixtures or commits.

## 3. What can be reused across horizons

| Component | Reuse now | Limit / required adapter |
|---|---|---|
| Reviewed exchange calendar and `mentorSessionAfter` | Session-based deadlines, holidays, bounded2026/2027 calendar; up to126 sessions | Not an arbitrary-duration or unbounded calendar. A weekly enrollment date is different from a five-session hold. |
| Captured input hash and canonical contract fingerprint | Preserve the local input used for a reported plan; detect accidental substitution | Current snapshot schema is LEADER-DIP-specific. Checksums are not provider authentication, historical universe proof or an execution receipt. |
| Expiry/unknown/contradiction separation | Separate an entry window, recorded fill, reference deadline and unresolved guidance | Actual entry clocks must come from each frozen rule. FOMC close entry cannot inherit next-open expiry. |
| Read-only mentor route | Owner-chat routing and byte-preserving financial reads with existing offset handling | Not a proof of global Telegram transaction/delivery durability. No new bot deployment occurred. |
| Risk explanation | Whole-share quantity/notional, unknown-cost/depth flags, allocation versus loss budget |1000USD/three slots/no-stop is this lane's policy. Do not copy it to other strategies or infer a risk budget. |
| Evidence labels | Keep frozen verdict, adoption, simulation, prospective admission and operational readiness separate | Rule-specific benchmark, uncertainty and adoption tests remain mandatory. |
| Existing quote-paper engine | Event/identity/quote/control reconciliation and unresolved paths (`discovery-paper.mjs`) | Its primary horizon is30minutes, not1/2/5 sessions. Changing it requires a new version/cohort, not changing a parameter after results. |

The126-session exit,20% overlay, no-stop assumption, cost assumptions, next-open policy and allocation limits are **not generic defaults**. This review adds no horizon adapter or strategy.

## 4. Existing short horizons: evidence quality versus missing implementation

The following percentages are saved historical after-cost means, **not prospective expectations**. Sources/blobs/hashes, sample counts and failure reasons are pinned in [the comparison JSON](mentor-horizon-comparison.json). Cross-study averages cannot be ranked as if populations, execution and uncertainty were identical.

| Existing rule / actual horizon | Saved older / newer result | Evidence quality and implementation gap |
|---|---|---|
| ANOM-PREHOL: SPY pre-holiday, one close-to-close interval | REJECTED;−0.62% /−0.65%,22/28 cases; stressed−1.02% /−1.05% | Approximately five-year registered daily-price test with removal-of-winners/block checks, but few events, one instrument and negative results. SPY must not be assumed currently ZAD-eligible. Closing quotes, event calendar and exact entry/exit auction assumptions remain unverified. |
| ANG-FOMC: SPUS close before statement to statement-day close | REJECTED;−0.44% /−0.91%,24/22 cases; stressed−0.84% /−1.31% | Registered one-session interval, approximately five-year history. Producer `hold:2` describes the two dated sessions in its calendar plan; it does **not** establish a separate two-session exposure or winner. Use explicit entryDate/exitDate and frozen close clocks, not that integer. Lower ETF-cost information is not the full-standard result. |
| SQ2-ORB5: intraday5-minute opening-range breakout, exit last regular-minute close | REJECTED;−0.81% /−0.73%,2372/4066 cases | Existing1-minute SIP study,1239 planned sessions; saved stock-day coverage98.5%,149 missing and1458 mismatches. More execution detail than daily proxies, but still negative and not live executable BBO evidence. Cannot turn daily bars into minute fills or claim perfect historical coverage. |
| SW1: RSI(2) bounce, variable exit/max5 sessions | REJECTED;−0.43% /−0.49%,41190/50840 cases | RSI(2) is a **lookback**, not a two-session hold. FirstRun spans2022-08-12–2026-10-19 (under five years); daily/date-clustered controls and cost stress fail. Mean held3.3 sessions, and a close-above-MA exit must not be confused with next-open liquidation. |
| SW5: ETF internal-bar-strength, variable exit/max3 sessions | REJECTED;−0.63% /−0.72%,80/66 cases | Mean realised hold2.0/2.5 sessions is not a frozen fixed-two-session rule. Only one instrument in saved halves; unusably extreme reported SPY t-values also need numerical review before reuse. Do not infer a new two-session strategy. |
| SW2: daily reversal, fixed5 sessions | REJECTED;−0.58% /−0.58%,6815/8792 cases | Explicit next-open/five-session contract and date-clustered comparisons, but negative after costs and under-five-year FirstRun window. Slot/cash, executable size/costs and all eligible prospective paths still missing. |
| ANG-LCREV-W: weekly large-cap loser selection, five-session hold | REJECTED;−0.91% /−0.81%,4351/5672 cases; stressed−1.31% /−1.21% | Approximately five-year registered weekly enrollment, source-news exclusions and matched comparisons. More observations are not independent weeks;112/146 signal dates and correlated stock baskets matter. Requires point-in-time size/news exclusions, holiday week-end scheduling and exact next-open/exit clocks. |
| Sequence h5: filing→quiet→ignition, five sessions | NOT PROVEN;older+0.01%,newer−0.06%,212/232 cases | Saved rolling results, not the same frozen firstRun standard; multiplicity across1/3/5, filing clocks, quiet-window controls and price-dependent cost assumptions need source audit. A small average/control difference does not rescue the failed newer return or removal-of-winners check. |

**No verified fixed-two-session winner is established in these reviewed sources.** The generic `trade-plan.mjs` helper also has1/3/5/10/21/42 sessions, not2. A missing slot must remain missing; neither RSI2, FOMC's two-date label nor a realised mean duration supplies a new rule.

**Recommendation: one-session engineering evidence work next, not a strategy endorsement or activation.** It offers the shortest date-bound entry-to-exit reconciliation and already has explicit frozen clocks to audit. Start by reconciling an existing close-to-close calendar contract such as ANG-FOMC as a **rejected negative-control/specification example**; do not enroll it as a profitable strategy or revive it by changing costs. Intraday ORB adds minute-ordering/feed burdens, while five-session/weekly paths add overnight gaps, corporate actions and longer missing-path recovery. None of these reviewed rules currently earns a trading recommendation. If the owner wants a new economic trial, the hypothesis/rule and frozen acceptance protocol must be agreed separately; choosing a convenient horizon cannot supply edge.

## 5. Smallest path to genuine prospective entry-to-exit evidence

The smallest existing complete path is **DISCOVERY_PAPER_V1's30-minute quote-paper lifecycle**, not the six-month mentor lane and not an invented one-session winner. Keep its one primary exit and all thresholds unchanged. `evaluatePaperEvidence` can reconcile actual timestamped events, BBOs and point-in-time metadata offline. Merely setting `prospective=true` produces **DECLARED_PROSPECTIVE_INPUT_REQUIRES_SOURCE_AUDIT**, not authenticated evidence.

The next safe preparation step is an **offline adapter/audit for an immutable existing-stream artifact**: inventory event/revision and ingestion clocks; validate original input hashes, exact source/runtime and capture manifests; map candidate and deterministic same-time same-industry control; run the unchanged evaluator; retain every blocked/unresolved row and original bytes. Use genuinely existing observations if an authorized artifact already contains them. Do not backfill missing quotes or identities, synthesize prices, resample timestamps to force a control match, cherry-pick a winner, rewrite legacy cohorts, or call a fixture prospective. The existing mentor snapshot is insufficient because it has no contemporaneous executable path or control.

Exact unresolved dependencies before a genuine admitted trace:

1. **Source and identity:** documented security ID/class/ticker mapping, validity/knownAt and industry available before detection; authenticated capture provenance and event/revision/source clocks. `data/research-security-identities.json` document shape or a checksum alone is insufficient. Trusted instrument identity and current ZAD remain separate requirements for any eventual executable approval.
2. **Actual paired quotes:** event followed by entry evidence within3minutes; valid bid/ask, quote age≤120s, dollar volume≥1M with clock≤15minutes, entry spread≤2%, and whole-share quantities at the registered1000USD allocation/3USD per-order fee. The deterministic control must meet the existing same-time, industry, distinct-identity, price and liquidity constraints. Record actual bid/ask sizes and enough displayed quantity; a resolved row without size verification is not tradability proof.
3. **Followups:** candidate and control through the30-minute primary horizon, with exit no later than3minutes after that horizon and cutoff still inside the known regular session. Late/absent/contradictory paths remain unresolved. Preserve halts, outages, missing rows and every eligible signal, including losers. Model ask entry/bid exit already includes spread; do not subtract it again. Existing stress is0.5% slippage per side plus fees. Quote-paper outcomes are not actual fills.
4. **Rights and permissions:** dated official non-secret account evidence for latest SIP/quote scope, applicable symbol/session coverage, rate/batch/concurrency limits and encrypted retention/access rights; independent identity-reference provenance/rights. [Exact entitlement checklist](c0-alpaca-entitlement-evidence.md) and [reference preparation](instrument-reference-bounded-proposal.json) remain unmet. No keys are requested in chat.
5. **Approved capture scope if existing artifacts are insufficient:** exact immutable source/dependencies/workflow, predeclared universe/control denominator, eligible session/date and entry cutoff, request/time/response/storage limits, existing bindings/permissions, encrypted recovery and shutdown rules. A new session must allow the full entry+30minute+exit-wait path: up to36minutes after the latest accepted detection (3minute entry wait+30minute hold+3minute exit wait), all before the session closes; this is a derived coverage requirement, not approved collection time; the inactive15-minute C0 three-cycle diagnostic cannot supply that horizon or authorize paper enrollment. Its [reviewed operational proposal](c0-diagnostic-review.md) is still date-UNSET and not approval for expanded followups. Finish the concrete adapter/runtime review before requesting any dated execution approval.
6. **Evaluation approval:** a resolved genuine trace is a provenance/execution-engineering milestone only. Profitability evaluation still needs agreed frozen hypotheses/primary exit/benchmarks, all-case denominators, uncertainty/cost/concentration/drawdown checks, stopping rules and untouched confirmation. A small number of resolved wins proves none of those.

**Current state:** no genuine prospective trace was created by this review; admitted cases remain0. No collector, reference, workflow, secret or permission was activated. Live watcher/DST verification remains pending naturally scheduled post-deployment evidence. Accounting/watcher deployment evidence is preserved. Acceptance remains24/40 with no closure.
