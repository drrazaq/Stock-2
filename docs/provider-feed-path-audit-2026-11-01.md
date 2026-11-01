# Confirmed subscriptions and actual decision feeds — 1 November 2026

The owner’s account screenshots confirm **Alpaca Algo Trader Plus** and **Massive Stocks Starter**. Only plan names and public product capabilities are transcribed in [sanitized evidence](validation/subscription-evidence-2026-11-01.json). Original images and all private account, payment, invoice and billing details remain outside the repository. Receipt date is not a claimed capture/effective date.

Production source: `6e806c4f2ea5d0f299b86c435fdc449c2f87e291`; development audit baseline: `7915056b214257e4123c6a4857ac36eca4e9fdd6`. [Source hashes and every liveQ call site](validation/provider-feed-path-audit.json). This is code inspection and existing sanitized evidence, not a new live probe, feed switch or expanded collection.

## Subscription, endpoint access and freshness are separate

| Evidence | What it establishes |
|---|---|
| Account UI | Plus: advertised real-time/all-US-exchanges product and10,000calls/minute. Starter:15-minute delayed data and5years history. Plan-name uncertainty is resolved. The UI does not authenticate which runtime key carries these rights, all individual endpoints, OPRA or retention terms. |
| Prior endpoint observation | [Run40859412224](validation/provider-diagnostic-2026-10-29T104040Z.json),29October10:40:40Z/06:40EDT: HTTP200 for explicit SIP and IEX three-name snapshots, Massive whole-market snapshot, Finnhub general news and SEC ticker map. This was access then, for that exact scope; not a current access test. |
| Prior price-age observation | Same probe: fresh prices2/3SIP,0/3IEX,0/13,238Massive;10,751Massive clocks unknown; SIP p95price age17.16minutes. These are **price**, not BBO-age/size, statistics. Overnight0fresh is not evidence of a market-hours outage. |
| Still unverified | Current key-to-plan mapping, representative names/sessions, BBO age/size/conditions/halts, realistic execution, shared quota headroom and licensed storage/replay/reference rights. No new provider request was run. |

## Is SIP configured correctly?

**The request is SIP-first; production handling is not correct end to end.** Production `alpaca-feed.mjs` requests `feed=sip`, then downgrades to IEX on403 **or422** unless forced.422can mean invalid parameters. Its mutable global feed label can misattribute concurrent responses. Ignition/premarket workflows supply existing bindings but do not pin ALPACA_FEED; an external manual launch can override it. No secret inspection was performed.

Existing development repairs already attach feed provenance to each response, refuse malformed maps, distinguish422/429 from entitlement refusal, bound requests and track rate limits. Only existing403fallback remains, labelled IEX. Forced SIP refuses fallback; inactive capture explicitly requires SIP. This task does not change feed defaults or activate capture.

Production inline watcher normalization also borrows the refreshed trade clock for aggregate volume, and its median-fresh shortcut can hide individual stale symbols. Earlier development `snapshot-fields` / `live-refresh-universe` repairs are **not** implied deployed by the operational watcher/SEC releases. Historical global feed labels cannot be certified retrospectively without original response evidence.

## Discovery and selection

| Actual path | Provider/feed and remaining timing constraint |
|---|---|
| Watcher snapMassive→snap→alpacaAll | Massive `/v2/snapshot/locale/us/markets/stocks/tickers` seeds the universe and initial fields. Existing selected stale names receive200-symbol Alpaca snapshot batches,6workers, SIP-first. Massive Starter remains delayed; a later Alpaca refresh cannot discover a name absent from the delayed universe. Price, BBO and aggregate volume are independent fields/clocks. |
| Top50fallback | Alpaca `/v1beta1/screener/stocks/movers?top=50` then explicit-feed snapshots. Partial discovery, never whole-market replacement. New development fix uses independent field merging instead of overwriting SIP volume with Massive volume and keeping the wrong provenance. |
| Opening range/premarket volume | Watcher minuteBars/openingRange uses Massive `/v2/aggs/ticker/{symbol}/range/1/minute/{day}/{day}`. First09:30–09:34bars may not be available until roughly15minutes later. This still constrains ORB decisions; no new Alpaca bars request/rule is silently substituted. |
| Pre-ignition, early-wave, SEC D, radar, ignition rules | Same hybrid rows; relative/dollar volume may still use delayed Massive aggregates even when trade price is fresh. SEC Atom/submissions and Finnhub headlines are separate event sources. Fresh trade does not establish fresh volume, a verified catalyst or executable BBO. Frozen scoring/enrollment unchanged; unknown identity still blocks approved ignition BUY. |
| Holdings stop watch | Watcher hybrid prices; separate bot intraday uses Finnhub/Twelve liveQ. Original production field-age limitations remain. Development rejects stale/future/unknown source clocks. |
| Fundamentals discover.mjs | Massive reference ticker list and grouped daily liquidity; Finnhub profiles/metrics/insider sentiment; FMP/AlphaVantage financials; SEC/ClinicalTrials context. These are research, not entry quotes. |
| NEWS_CATALYST | news-watch→Finnhub company/peer/general news→news-log; price at discovery comes from watcher rows, not a news price. |
| SEC_EVENT | events-study→SEC submissions/index, FDA context→events-recent; live EDGAR is separately polled. Atom updated is not acceptance. |
| INSIDER_CLUSTER | insider-study→official SEC quarterly Form345ZIP→insider-study; filing/trade dates are not a current tape. |
| EARNINGS_SURPRISE | earnings-study→AlphaVantage/FMP/Finnhub→earnings-recent; provider-specific clocks and failure status remain necessary. |
| INDUSTRY_RIPPLE | chain-ripple→Massive-derived grouped historical cache plus chains→chain-ripple. |
| SUPPLY_SHIFT | share-supply/share-supply-source→official SEC indexes/submissions/company facts→share-supply. |
| TECHNICAL_BUILDUP | discovery2→Massive grouped cache plus source/event caches→discovery2-today. |
| MARKET_DISLOCATION | comeback caches and Massive SPY daily benchmark→comeback-today. |
| Research adapters | research-collector uses Massive snapshot/Finnhub news. Inactive hybrid/capture client requests explicit SIP. No installation or activation follows from subscription confirmation. |

The eight persisted lanes converge through discovery-runtime/updateDiscovery and use the watcher’s actual hybrid rows for price evidence. Unknown prices/revisions remain research context; receipt clocks are not backdated. Price history is chiefly the Massive-derived study-cache/grouped.json.gz, with further script-specific daily fetches. Historical access does not establish point-in-time membership, delisting completeness or session finality.

## Entry prices, holding guidance and mentor

| Consumer | Actual price chain |
|---|---|
| Quick/swing setup, scanner checks and nightly signals | Twelve Data `/time_series?interval=1day` for core histories; Massive grouped and daily aggregates for wideUniverse/loadWide. Corporate-action context can query Massive. Dated ranges/stops/targets are reference plans, not current executable quotes. |
| hotList, detailList, intraday, details, check/add/follow, theme comparisons, recording suggestions | **Finnhub `/api/v1/quote` first**, Twelve Data `/price` fallback—not Alpaca. Every actual liveQ call site is indexed in JSON. Neither screenshot confirms Finnhub/Twelve entitlements. Development retains provider, original source clock, observation clock, age and raw reportedPrice. A fresh last trade still is not BBO/fill evidence. |
| Leaders/trend | leaders-study Massive daily prices, scanner reference levels, liveQ for market-hours repricing. |
| Early-wave/radar | Watcher hybrid rows plus separate source/identity/ZAD gates above. |
| Earnings/event drift | AV/FMP/Finnhub or SEC/FDA events, Massive grouped cache, scanner stored levels; liveQ for repricing. Source and close/next-open variants remain qualified. |
| Octopus, Horizons, catalyst run-up, chains, Discovery2/comeback | Their dated artifacts use the Massive historical cache and event/reference inputs; scanner builds reference ranges. No current BBO is inferred from plan generation time. |
| Owner LEADER DIP/months | squad11-lab Massive grouped history and SEC facts/submissions→squad11-today. Signal close is not tested next-open fill.126-session close versus legacy next-open reminder remains unresolved; target overlay unadopted. |
| mentor SYMBOL / standalone explanation | Development only: saved fill/contract or squad11-today→pure mentor-plan. **No market request.** Legacy holdings cannot borrow current signals. NOT PROVEN/NOT_ACTIONABLE. Separate five-file PR3 remains pinned to current main; this feed repair is not bundled into it. |
| Browser index.html | Cloud JSON plus user’s Twelve Data daily and /price requests; optional Finnhub news/research. No Alpaca binding. Receipt time previously made unclocked /price look “now”; repaired development retains daily reference levels and explicitly unverified quote context. |
| Premarket holdings | Alpaca SIP-first snapshots, possible labelled IEX downgrade. Production accepted stale same-date trades/close fallback. Earlier development adds age/day checks; this task adds actual feed and literal trade timestamp to output. Holdings-only, not broad premarket coverage. |
| Options/paper laboratories | Script-specific indicative/OPRA requests; stock SIP is separate. Plus stocks subscription does not prove options entitlement. No feed, orders or strategy policy changed. |

## Bounded development repairs

1. Top50fallback independently merges price/BBO/volume, retains fresh SIP volume, and labels remaining Massive volume honestly. No added request or feed switch.
2. Shared browser/scanner observation policy: only known nonfuture source time≤3minutes yields usable price. Unclocked/stale/future raw prices remain reference evidence. A valid but stale Finnhub result does not add a fallback request. Twelve /price has no verified event clock; fetch time is never substituted.
3. Browser /price no longer reprices entry/stop/target or stamps the daily reference as fresh; request-throttle bookkeeping retains observation time separately. Premarket output names the actual returned feed and source clock.
4. Existing positive recording tests now supply a real-shaped timestamped Finnhub quote; explicit reported fills remain separate facts. No historical accounting/financial record is rewritten.

Some downstream cards still discard metadata after selecting a numeric fresh trade and lack full executable BBO/size/fee/adjustment contracts. These remain EXEC-03 gaps, not silently cleared by this patch. No numerical strategy function, V1, frozen result or risk/ZAD policy is altered.

[Verification and execution limitation](validation/provider-feed-decision-verification.json): local resource exhaustion caused EAGAIN/thread failures during the full suite; that run is not a pass. Focused evidence, preserved local checkpoint and later exact-commit CI are reported separately. Do not claim the new repairs deployed.

The [entitlement checklist](alpaca-entitlement-owner-checklist.md) now treats both plan names as confirmed. Remaining official evidence concerns actual runtime entitlement mapping, quota headroom, firm quote/bar/adjustment semantics and permitted raw/derived/reference retention and encrypted GitHub artifact access. Repository is PUBLIC; encryption alone is not a license or private access control. No credentials requested.

Acceptance remains24/40 with0genuine admissions. MARKET-02 is advanced, not closed. Next: independent review of the development safeguards and the separate V2/mentor packages; a production feed repair/switch or new measurement still needs its own exact approval. No purchase is needed or proposed.
