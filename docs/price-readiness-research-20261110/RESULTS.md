# Price readiness and frozen B research — completed offline work, review pending

Source correction: `322c08b57aece8d22b52e4c9292d282ae0a84239`, development branch only, based on research receipt7d07e701. Existing approved release/Stage1/Stage2/guard source is unchanged. Complete exact hosted receipt in validation.json. No provider acquisition, collection, production action or rule change.

## Price diagnosis: correct the causal conclusion

Claude’s1876 records/16.7min first-price-age result reproduces. But firstQuoteAgeMin is the selected PRICE clock, not necessarily a quote.1638/1876 first sightings are09:28/29 preopen. Regular first sightings238 comprise231 UNDER_1_USD-coded records. This is a winner-selected, mixed-instrument record population, not all tradable common stocks or all opportunities.

All537 UNDER_1_USD-coded records never became fresh. Caller refresh explicitly selects prevC>=1. Thus537/541 never-fresh records belong to a deliberately unrefreshed previous-close eligibility group; it does not prove each current price remains below1. Among1339 other records, four never became fresh: XQTM/RDACU/BULLW/BKHAU. Nov9’s126=124under1-coded+2others. No suffix-based security-class inference is made. This is a strong denominator explanation, NOT proof eligible prices were timely at the relevant entry instant.

The six source summaries all report SIP response provenance. Old eligible trades can coexist with current quotes; latest-trade endpoints exclude non-price-updating conditions. No authentic response/request receipts survive for the whole universe, so inactivity versus feed transport delay cannot be apportioned numerically.

| Potential cause | Supported conclusion |
|---|---|
| Last eligible trade inactivity | Possible; old trade time alone does not prove feed lag. Need same-symbol quote/bar/trade-count and repeated response clocks. Never substitute quote midpoint for the adopted trade-price rule. |
| Actual provider/feed delay | Late Massive price basis and SIP-refreshed groups coexist. Six end-of-run SIP labels do not prove every response’s entitlement or transport latency. No paid-feed shortfall is established. |
| Timestamp/session | ns-to-ms/RFC3339 clocks are field-specific in source. Daily-bar timestamp is session start, not volume as-of. Overnight/weekend ages and preopen sightings are not proof of timezone error. Raw bytes needed to prove a particular historical conversion defect. |
| Caller clock | REPRODUCED: snap captured now BEFORE awaited Alpaca refresh and used it for merge. A valid trade during request was rejected as future. Corrected merge uses post-response time; batch/top50 future fields are invalidated at their own receipt so they cannot become valid while waiting. |
| Cache | No snapshot memoization in inspected caller. Feed preference/cooldown is transport state, not cached market price. Normal-volume fm-cache is separate. Identical prices across polls cannot alone distinguish inactivity/provider caching; raw response IDs/receipts missing. |
| Polling | REPRODUCED: loop waited60sec after snapshot I/O, accumulating fetch time. Wait now anchors before I/O; minute is recalculated after fetch and responses beyond15:00 discarded. Same thresholds/endpoints remain. |

All9 run archives, including companion runs, were unioned per day: retained usable minutes318,319,324,315,320,317 of331 configured minutes on Nov2/3/4/5/6/9. Missing13/12/7/16/11/14. Do not report main-only tails as whole-day gaps. Full cash-session coverage remains unproved;15:01–15:59 is outside the unchanged inclusive15:00 endpoint. Missing-minute facts do not establish a scheduler/provider cause.

## Liquidity and identity limits

931 retained opportunity records from Nov2–9: cumulative traded-dollar-volume >=2m:541records,340fresh valid BBO;0<2m:176records,137fresh BBO; unknown volume214records,167fresh BBO. Fresh here means0..120sec quote age and valid bid<=ask; total644/931, valid BBO648. This corrects my earlier comment’s646 typo. These are selected lead/paper records, not an unbiased full-universe denominator. Dollar-volume is the recorded cumulative proxy, not displayed liquidity or fill capacity. All931 have instrument identity UNKNOWN. A common-stock-versus-fund/warrant comparison cannot honestly be produced from them.

Nov6’s separate249-symbol radar universe joins only ONE of Nov9’s474 mover rows, so it cannot supply a representative historical liquidity split. No lookahead join to other dates, suffix guess or invented identity is used.

## Implemented and measured

Only watcher timing/cadence and one regression file changed. Actual unmodified snap body with deterministic adapters rejected a trade250ms into a500ms request:0/1updates. Correction:1/1; a future-at-receipt trade/BBO stays invalid even after later merge. Old-trade/fresh-BBO fixture keeps the trade stale. Cadence fixture with2sec I/O changes sleep60sec->58sec, removing artificial62sec cadence. Constant-latency331min sensitivity allows320->331 iterations; this is SYNTHETIC opportunity coverage, not measured market improvement. Full historical before/after freshness percentage is UNRECOVERABLE from retained aggregates: discarded provider timestamps and exact receipts were not saved. No counterfactual numerical uplift is invented.

## Frozen five-session B: all matured retained observations

Radar panelB is NOT ranking modelB. All45 radarB list observations and20 matured s5 outcomes throughNov2 were inspected; remaining25 have no matured endpoint before Nov10 cash close. No fresh market requests or horizon/exit/rule changes.

Frozen ledger model: mean+6.135%, median−2.365%,7/20positive;10/20 beat stored SPY. CHSN+178.19% accounts for more than the aggregate gain. Without best−2.921%; without two best−4.306%. Three of four entry-date means are negative. Dates overlap five-session horizons; observations are not independent.

Whole-share cost sensitivity is SEPARATE, not a replacement frozen series: fixed1000budget, entry quantity floor(997/askProxy),3fee each executed side, frozen1%/0.3% spread proxy counted as half each side, unspent cash idle. No zero-share entry here. Mean+6.113%,median−2.328%; fixed existing slippage stress0.5%eachside under5else0.1% gives+5.686%. Removing top2 base mean−4.181%. All modeled entry outlays<=1000. These are proxy ask/bid and daily endpoints, not executable fills. Missing BBO/size/halts/action/split chains prevent an after-cost execution verdict. CHSN’s outcome is retained, not assumed clean or deleted.

Controls remain untouched: SPY stored return is not an executable benchmark; panelA has different historical caps and is not a matched control. A GNSS Oct29 has2list and2s5 observations under one day/symbol/panel key. Existing Map reuses the later outcome: publishedA−7.10% differs from raw35s5 arithmetic−7.1166%. Missing original observation clock in s5 means no invented join. B keys are unique. This comparator issue is sent for focused review, not silently repaired/tuned.

Separate ranking modelB remains frozen COLLECTING7/20sessions,35/50picks. Its report: same-day−1.74%; d5+1.50% on10,median−0.63%,withouttop2−0.60%. A−0.61%,R−4.09%,R0+1.02% at d5. These receipt results were reconciled, not re-evaluated from unavailable compressed originals. A small positive five-day mean does not pass the frozen dual-horizon criteria.

Verdict: CONTINUE unchanged bounded observations where authorized; executable economics INCONCLUSIVE, concentration unfavorable. No promotion or tuning.

## Primary-source work and next concrete experiment

New MRNA/TMO investigations and OIS/TALO cash reconciliations are in primary-followup.json. They expand business investigation without inventing a trade entry. All current prices/BBO and final ZAD remain UNKNOWN. No news-causation or performance claim.

Next offline experiment: replay the unchanged existing full-watcher fixture with the corrected source under0/2/10/65sec snapshot latency, both active-trade and inactive-trade/fresh-BBO paths, and actual minute/endpoint boundaries. Acceptance: valid during-request clocks retained; future-at-receipt never promoted; no quote-for-trade substitution; no post15:00 evaluation; known>60sec overruns explicitly remain gaps. Finite12-case matrix, no live calls or historical rescore. The six committed actual-function regressions are already complete; full-process matrix needs Claude’s healthy existing local route, requested directly. Do not repeat stalled executor attempts.

To establish historical inactivity-versus-feed-delay shares, the precise missing evidence is a same-symbol series of original responses, request/receipt clocks, feed/status, eligible trade time/conditions/count, BBO/bar clocks and authenticated security/session identity. Aggregates cannot reconstruct it. Any new paired capture needs separate bounded review/approval; parkedIG1 stays parked. No spending proposal is justified before this diagnosis and existing-access evidence are resolved.

Official semantics: https://docs.alpaca.markets/us/docs/market-data-faq ; https://docs.alpaca.markets/us/reference/stocklatesttradesingle-1 ; https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot . Documentation establishes contracts, not the private account’s actual plan. No provider messages.
