> Continuation update, 29 October: Owner-supplied Massive Stocks Starter capability is $29/month, 15-minute delayed data, five years of history and broad US ticker coverage. This describes the product; enrollment and field-specific permissions are not independently established. Delayed data can support appropriately timed historical research but cannot supply this project's three-minute fresh execution/lead-time evidence. Five years of prices alone does not establish point-in-time identities, delistings or a survivor-free universe.
>
> Existing observed Alpaca access must be investigated before any subscription recommendation: explicit SIP and IEX snapshots both returned HTTP 200 in run40859412224; SIP had 2/3 fresh prices at06:40EDT, IEX0/3. Rate-limit headers do not identify a subscription, and three targeted symbols do not prove broad coverage. No purchase is recommended and no additional live probe was run in this continuation. Phase A remains NO-GO and its reviewed pin is unchanged.

# Provider readiness evidence — 29 October 2026

Account plan names and representative premarket coverage remain **UNVERIFIED**. Existing GitHub bindings have now returned HTTP 200 for the five read-only probe endpoints; see observed evidence below. The local managed workspace itself has no provider runtime credentials. GitHub secret *names* in workflows and old comments about upgrades do not prove an active subscription. No credential was printed, requested in chat, altered, or changed. A separate branch-only GET diagnostic can observe existing GitHub bindings; no new binding is created. No purchase was made.

## Documented capability versus observed access

| Source | Documented capability | Repository behavior / remaining evidence |
|---|---|---|
| [Alpaca plans](https://docs.alpaca.markets/docs/about-market-data-api) | Basic equities are IEX-only; consolidated real-time coverage requires the appropriate entitlement. Published historical API budgets differ by plan. | The targeted SIP/IEX responses exposed limit 10,000, remaining 9,999 and reset headers. Those headers are observed for these requests; sustained budget, other endpoints and the account plan are not inferred. |
| [Alpaca snapshots](https://docs.alpaca.markets/reference/stocksnapshots-1) | SIP and IEX are distinct feeds; delayed SIP is explicitly delayed. Responses include forbidden, invalid-request and rate-limit errors. | Concurrent requests previously inferred feed from mutable global state. Each returned payload now carries its own feed provenance; only a SIP payload contributes consolidated volume. HTTP 422/429 no longer triggers an assumed entitlement fallback. |
| [Massive full-market snapshot](https://massive.com/docs/rest/stocks/snapshots/full-market-snapshot) | Market-wide tickers, with default OTC exclusion; daily reset and early-morning repopulation; access may be delayed or real-time. Trade/quote fields depend on plan. | An HTTP 200 or a received-symbol count is not fresh all-exchange coverage. Current code measures per-field clock age and fresh/evaluated counts. Real entitlement, premarket completeness and symbol-type denominators remain unverified. |
| SEC | Public filings require acceptable client identification, ingestion timing and error accounting. | An event/filing check failure blocks approved ignition eligibility; dated quarterly insider summaries are not live filing timestamps. Full ingestion and rate-limit review remains open. |
| Finnhub / earnings and company-news collectors | Provider calendars/news are distinct products with field-specific timestamps. | No current account entitlement, retention completeness or ingestion-lag sample established. Source availability and exact versus derived timestamps remain explicit in discovery. |

Sources were read directly on the audit date. This is a capability review, not confirmation of the owner's account plan or a recommendation to buy a plan.

## Verified code repairs

- Regression reproduces a slow SIP response racing an IEX downgrade. Normalization now reads the response's own feed; a mixed run is labelled mixed, not silently treated as SIP.
- Feed success requires a valid snapshot map. An error-shaped successful HTTP response does not establish a working feed.
- Request diagnostics distinguish HTTP refusal/rate limiting from successful payloads without storing tokens or request query strings.
- Share-class ticker syntax such as `BRK.B` and `BRK-B` is no longer discarded. Punctuation is retained: there is no unverified issuer/security alias merge. Symbol syntax alone does not establish common-stock status, tradability, exchange membership, corporate-action identity or ZAD compliance.

## Premarket investigation

`premarket-check.mjs` is a holdings report, not a whole-market scanner. The ignition workflow waits until 09:25 New York, and its loop starts around 09:28; this cannot establish coverage of the full 04:00–09:30 premarket window. A provider's market-wide snapshot capability does not prove continuous collection, current per-symbol trades, consolidated volume, or entitlement to every field. Basic IEX is a partial exchange view; delayed data cannot establish early lead time using current executable prices.

A branch-only, read-only diagnostic is prepared to make at most five whitelisted GET requests with existing GitHub bindings, publish sanitized counts/statuses as an artifact, and avoid all orders, messages, raw payloads and production-data writes. It retains regular/premarket/outside-session context so old prices while markets are closed are not automatically called feed failures. Secret-free simulated premarket sessions remain a separate validation step. No new subscription is necessary to test refusal, missing fields, stale quotes, symbol handling or rate-limit behavior. Observed overnight responses/headers are now available; a definitive premarket gap list still requires representative 04:00–09:30 sampling and a symbol/security-type denominator.

## Owner-action blockers

1. Existing read-only bindings are working for the targeted endpoints. Remaining evidence is representative premarket/full-session coverage, fresh fields, error/rate-limit behavior and instrument denominators. No new secret binding or subscription is currently justified. An overnight spot probe cannot supply that evidence.
2. Approve deployment separately before live collection. The development branch has not been deployed. Complete real sessions, prospective paper samples and authorized delivery verification cannot be manufactured from fixtures.
3. If observed responses later show missing paid entitlements, review that evidence before any purchase. No price, paper account or old upgrade comment is taken as proof of access.

## Observed branch result (not a simulated entitlement claim)

[Probe run 40819160719](https://github.com/drrazaq/Stock-2/actions/runs/40819160719), source `62bcd65cdc095ecbd068f478301ec1db4e498a5f`, at 2026-10-29 04:41:43 UTC (00:41 New York): Massive snapshot, explicit Alpaca SIP, explicit IEX, Finnhub general news and SEC ticker map all returned HTTP 200. Massive returned 13,262 symbols; Alpaca requested three diagnostic symbols. Observed headers exposed Alpaca limit 10,000 and Finnhub 60; account plan names and other endpoint budgets are not inferred. Public sanitized evidence is in provider-observed-2026-10-29.json.

The initial probe labelled 00:41 as PREMARKET; this was wrong. Corrected classification distinguishes OVERNIGHT before 04:00. The original label and the correction are both preserved in the evidence. Zero fresh prices at this overnight instant is not proof of a market-hours outage. Working existing bindings replace the earlier workspace-only credential uncertainty; no new purchase is supported by this observation. Real 04:00–09:30 and full-session coverage, fields, latency percentiles and every other provider endpoint still require representative measurement.


## Other provider paths still outside the targeted diagnostic

FMP is called by discover.mjs, smart-money.mjs, expert-lab.mjs, earnings-study.mjs and scan.mjs for distinct data products. Alpha Vantage is an earnings/calendar fallback. TipRanks MCP is used by tipranks.mjs and calendar.mjs; the repository explicitly tracks scarce monthly calls and response-shape failures. No new requests to these potentially metered products were made. Passing the five-endpoint probe does not clear their endpoint permissions, quotas, timestamp quality, completeness or historical retention. All-source entitlement and ingestion review remains an outstanding acceptance check.

The current watcher starts around 09:28, so broad premarket collection is missing operationally even if a full-market snapshot endpoint is accessible. The new 04:00–13:00 adapter simulation verifies code under synthetic inputs, not continuous collection or provider completeness. The matched paper protocol requires point-in-time security identities/industry, fresh executable quotes and liquidity metadata; those real prospective samples have not been collected. Raw last-trade followups alone cannot satisfy the protocol. No provider purchase is recommended from current evidence.

