# B-FCFN1 independent retained-evidence evaluation

11 November2026. **Verdict: NOT PROVEN remains. No current actionable trade is established.** The original modeled economics fail their newer-half proof/control requirements; original-filing validity and executable whole-share economics are separately INCONCLUSIVE for missing evidence. Missing inputs are not evidence that the economic hypothesis is false. No threshold, cut, split, exit, cost gate, universe filter or frozen result changed. This mid-term filing-drift study does not solve early intraday detection or all short/long-horizon investigation.

## What was executed

Pinned pre-registration9e27afd92d9ea6a16615819a5e5267ffdfc72129 and frozen output e9ad49ae13cd5302a8fae5ae41d687865deea3f4, firstRun10November12:01:16.221UTC, data window1Nov2021–6Nov2026, split26July2024. Independently inspected the complete hosted lab log, run42811574377/job129814045713. Extracted all2230 rounded modeled trade rows and replayed means/medians, losses, stress, removal-of-two, formation-day control and same-stock comparisons, yearly splits and contribution concentration. Raw rows were not filtered. Original source/input byte fingerprints are in provenance.json. Reproduce offline with `python docs/b-fcfn1-independent-20261111/replay.py`; no provider requests. Do NOT run value-lab.mjs to reproduce: its startup can download SEC/provider data. Synthetic pure-core semantics probes are separate from economic evidence.

Unchanged rule: use each eligible filing-day FCF-news observation, positive and strictly above the causal90th percentile of eligible observations in preceding63sessions (minimum200); next-session open entry and close at formation+63 exit (63held sessions including entry). Liquid5USD+/5mUSD daily-traded-value, nonfinancial, most-traded mapped CIK symbol; +300% gross cap on rule and yardstick. This is not an adopted live rule or a new version. No new discretionary stop, gap limit or profit exit is invented. The retained d field is **formation**, not entry date. The frozen worst-day label15Nov2023 is an entry-session label from worstDay(), not a contradiction with formation dates.

## Independently reproduced economics from retained rounded returns

| Metric | Older | Newer |
|---|---:|---:|
| Trades / formation days / symbols |1106/308/530 |1124/279/589 |
| Mean after original flat0.8% |2.8748% |5.5734% |
| Median |0.855% |2.010% |
| Mean after original flat1.2% |2.4748% |5.1734% |
| Losses |529 |525 |
| Losses worse than50% |16 |10 |
| Worst |−91.03% |−66.58% |
| Mean without best2 |2.5202% |5.0737% |
| Top5% share of signed summed returns |122.65% (56trades) |83.50% (57trades) |
| Remaining95% mean |−0.6859% |0.9688% |
| Original day t, reproduced |3.02 |1.50 |
| Original block t / blocks |2.74/10 |**1.02/9** |

Top5% uses ceil(0.05×n), specified before reporting; floor-count rounding explains small differences from the reviewer's121% figure. Summed return contribution is an equal-notional model attribution, not actual account profit. Removing two extreme winners is insufficient to establish robustness to broader tail dependence. Top contributors across halves include ANF/SMCI and SNDK/MXL/GRPN; full attribution is in results.json. All rows have four-decimal returns (about±0.005percentage-point individual rounding); raw uncapped return/price chains are absent. Capped winners are not proven to be corporate-action errors or real returns.

The original full session-index array is not retained locally: **63-session block t cannot be independently rebuilt from these row dates alone**. It is preserved as the frozen statistic, not falsely called reproduced. Day t does reproduce, but overlapping holds invalidate treating2230trades or587formation days as independent trials. Do not replace the unfavorable block test with day t. There are only9newer-half blocks and the pre-existing multiple-testing bar is4.1; no fresh holdout or confirmatory success is created by this audit. Exact block/bootstrap uncertainty needs the retained session array/block values. No new rule is chosen from these results.

## Controls: match costs and weighting explicitly

Frozen earnings-news means are0.85%/5.88%, with1113/1213cases. B-FCFN1 differences are **+2.02/−0.31 percentage points**. All eligible FCF-filings mean−0.27%/3.44%: differences+3.14/+2.13points. Those aggregate control fields are retained, but NI/all-event row lists are NOT retained; their selection/individual economics cannot be independently reconstructed. These are net-income changes, not consensus earnings surprises. NI-eligible and FCF-eligible observations differ: not identical-event paired treatment/control. Cash-flow news's incremental mechanism over earnings news remains unestablished.

Matched same-stock-other-filings day edge reproduces+5.7496/+5.4581points, with292/255covered days (16/24formation days lack coverage). These benchmarks use the same stock's unselected filings across the same historical half, including later outcomes: legitimate retrospective comparisons, not information usable for selecting the original trade. No size/sector-matched untouched control is retained; don't relabel the average liquid universe as one.

The original `halfStat` day edge compares **rule net to average-stock gross**, despite avgStock being stored net. Reproduce it exactly as net−avgStock−0.008:3.4659%/2.6520%, dayt3.02/1.50. Equal-cost sensitivity net−avgStock gives4.2659%/3.4520%, dayt3.71/1.96. Keep both labels; neither changes frozen blockt1.02, proof threshold or verdict. This is conservative cost asymmetry, not a reason to silently repair historical returns. Trade-weighted control means differ from equal-day averages.

SPY frozen2.27%/4.79% is **gross** from spyAvg; rule-net minus gross-SPY is+0.60/+0.78points. Missing per-trade SPY rows/prices prevents independent cost/whole-share/account matching. Do not claim both sides are after-cost or show these simple means as account annual returns. A63session hold is not a92calendar-day exit. A3-slot/92-day/tie-break simulation would add assumptions and change timing; it is not this unchanged replay. No portfolio return versus SPY is established.

Yearly common-cost trade-weighted excess over the average stock is2022:+4.7922%,2023:+3.7074%,2024:+0.6785%,2025:+3.2920%,2026:+3.7665%. Same-day-equal-weight measures differ, including2024:+0.3090%; original net/gross day metric that year is−0.4910%. All weighting/cost definitions are exposed in results.json. These retrospective subdivisions are descriptions, not regime filters or new tests used to rescue the rule.

## Whole-share fees and execution sensitivity

Actual per-trade entry/exit reference prices are missing for **all2230rows**. Gross ratio alone cannot determine share count, affordability, unused cash or exact $6 fee drag. Nor does an OHLC open prove available auction liquidity, order admission or a fill. No-fills, halts, limit restrictions and delisting proceeds must be retained explicitly, not replaced by hypothetical fills. The code's `fwd` searches backward from the target exit for a positive last close; that is a modeled mark when a later executable exit is absent, **not verified delisting cash realization**. Preserve it as such, without zeroing or discarding genuine adverse outcomes.

Exact accounting prepared, pending actual prices: adverse entry E=P_entry×(1+b), exit X=P_exit×(1−s), q=floor(997/E). Ifq=0, no trade/no fee; otherwise terminal cash=1000−qE−3+qX−3, return=(q(X−E)−6)/1000. This reserves the$3entry fee and applies another$3only on executed exit; an unresolved exit has no invented sale. Each comparison must use its own matched whole-share prices/cash. The supplied strategy's exits remain unchanged.

The original0.8%/1.2% is an aggregate cost assumption, not a measured spread/slippage distribution and not proof it includes exactly$6. Do not simply subtract another0.6% from its reported net and call it actual owner performance. To show arithmetic rather than fabricate prices, results.json includes **synthetic reference-price grids** at5/25/100/500/1000USD using every retained capped gross ratio, q as above and$3each side. Symmetric0.4%/0.6% adverse sides illustrate splitting0.8%/1.2% into price friction, **an explicit scenario interpretation**, not the original flat-cost reproduction.2%each side is separate declared small-stock stress. At a synthetic100USD entry reference, nine shares, the illustrative mean dollar P&L is:

| Adverse price fraction each side |Older |Newer |
|---|---:|---:|
|0.4% plus$6 |19.74 |43.93 |
|0.6% plus$6 |16.07 |40.22 |
|2% plus$6 |−9.59 |14.21 |

These are NOT estimates of actual executable strategy economics; assigning100USD to every trade is synthetic, and affordability at1000USD prevents trading altogether. For a general trade, exact fee drag is6/(qE) on invested cash and0.6% on1000when both sides execute, but idle cash changes gross budget return. No softened costs or fractional shares.

Preserve separately the repository's small-stock gate: **2%each way PLUS flat0.8% or1.2%** (CLAUDE.md§4). Applying it to ALL retained rows gives older/newer means−1.1909%/+1.4019% at0.8%, and−1.5909%/+1.0019% at1.2%. It is a stress sensitivity, not a claim all2230are small stocks. The exact dated small-stock/market-cap mask is missing; a price-only proxy would change the test. At actual owner fees plus actual spreads, verdict remains unscored.

## Point-in-time and identity findings

* Compacted SEC facts preserve start/end/value/first-filed date, but discard **form/accession/acceptance/unit/source-context**. Event construction groups cash-flow rows by filing date with newest period end and1–120daylag; it does not prove original10-Q/10-K, exclude amendments/registration statements or retain a period-level original-filing key. Thus the claimed original-filing event population is unverified, not independently validated by a plausible function name.
* `known(asOf=f+1)` excludes future filed dates and uses latest known values. Pure-core probes confirm YTD subtraction forQ2 and annual-minus9months forQ4, same-day exclusion and no early use of later restatements. Actual CFO/capex/NI tag priorities, period alignment, units and every picked news/threshold require cached facts. Some cash-flow prior-quarter values can be restated in the current filing; they must be linked and labeled, not assumed original.
* Additional synthetic counterexample: compact keeps first occurrence of(start,end,value). For a value history10→12→10, the last10is dropped; `known()` then incorrectly retains12after the reversion. This reproduces a schema limitation, **not proof any actual trade is affected**. No frozen result or production code is changed. Actual affected counts cannot be determined without richer source facts.
* Next-session entry after the recorded filing day is conservative relative to same-day trading; a weekend maps to the preceding formation session and next session after filing. No acceptance-time input is retained to establish original publication lineage. Original portfolio formation timestamps/market calendar remain needed.
* Market value is30-day-lagged share count×formation close of most-traded mapped symbol. A30daylag is an assumption, not per-fact publication proof. Shares/raw counts/split lists are retained, ticker-map timestamp10November02:55:44.755UTC, but historical cover filing dates/classes/CIK-symbol intervals are not. Current ticker mapping omits/aliases past issuers; surviving/dead/unmapped exclusions can bias results, **direction and magnitude unknown**. Multiplying issuer share count by one class price can misvalue multi-class companies. Split-adjusted price/share basis and actual cash/spin-off/delisting exits require both raw price chain and corporate-action evidence.

## Exact blockers and next executable research step

Complete hosted log identifies price cache **leaders-study-42455753549**, archive119,475,894bytes, restored read-only; old financial cachevalue-cache-42487502111, refreshed saved **value-cache-42811574377**, factsAt10Nov12:00:41.498UTC. They are not local repository objects. Claude confirms no retained copy in its container (6801557129). GitHub's documented public REST cache API lists management/metadata operations, not content-download; the connected cache endpoint is unsupported. Run's uploaded artifact contains log only. No cache restore/export workflow is authorized here, so this route is blocked; don't dispatch blindly or claim archives are deleted. Reference: https://docs.github.com/en/rest/actions/cache .

**Smallest next step for separate review:** one cache-only recovery/export of the two EXACT saved keys into an authorized private/offline destination, no value-lab execution, no provider/network fallback, no refresh/threshold tuning, no main writes. Stop on missing exact key; do not silently restore newest-prefix or acquire replacements. It would enable independent event/news/threshold/calendar/control reconstruction, capped/uncapped price-chain checks, no-fill/exit classification and exact whole-share accounting. Inspect existing workflow capabilities/access/cost/artifact custody first and publish one exact bounded operational request before any dispatch/new workflow. This is not approval or a prepared executable workflow. If no existing route can export them, access/setup is a genuine next decision, not an instruction to the owner to supply technical facts.

Even a successful cache export cannot recover discarded accession/form/acceptance contexts. A separate bounded primary-source lineage resolution would then be needed for the fixed event census (including comparisons), plus dated historical identity/share/corporate-action and ZAD. Its exact population can only be bounded after event export; no thousands-of-request proposal invented now. Terminal decision for cache-only step: recovered exact inputs→offline reconstruction; absent/mismatched inputs→INCONCLUSIVE with specific key, zero provider fallback.

ZAD: frozen research list contains **48**, not47, records:45UNKNOWN,2OK(PARR/CVS),1FAIL(MPC);11blocked overall. Those are retained November6list classifications, not today's actionable recommendations or historical classification of2230trades. PARR's retained dated source is ZAD22Oct2026; CVS24Oct owner-ZAD; MPC23Octowner-ZADFAIL. Historical ZAD chain is absent; never backfill2022–26trade eligibility from today's marks. NoUNKNOWN can becomeBUY, and business research is not restricted to names already cleared.

LFST/GCT/BB broader investigations remain separately completed in3beeed52 with66SEC facts verified, two issuer-release-only exceptions and dated business countercases; refreshed discovery still carries older financial periods. Their short-entry status remainsWAIT with source-timed price/setup/ZAD gaps. Earlier ED1/B adverse results stay preserved. No production, rule-policy activation, data acquisition, spending or trades; ThursdayStage1 frozen. This evaluation is finished at retained-evidence scope, with exact executable/PIT questions unresolved rather than a renamed strategy or new framework.
