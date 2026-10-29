# Provider readiness evidence — 29 October 2026

Account entitlement is **UNVERIFIED**. The managed environment reports zero secret bindings or provider runtime credentials. GitHub secret *names* in workflows and old comments about upgrades do not prove an active subscription. No credential was printed, requested in chat, altered, or changed. A separate branch-only GET diagnostic can observe existing GitHub bindings; no new binding is created. No purchase was made.

## Documented capability versus observed access

| Source | Documented capability | Repository behavior / remaining evidence |
|---|---|---|
| [Alpaca plans](https://docs.alpaca.markets/docs/about-market-data-api) | Basic equities are IEX-only; consolidated real-time coverage requires the appropriate entitlement. Published historical API budgets differ by plan. | Account plan and endpoint-specific rate budget are not observed. No rate-limit figure is treated as this account's verified snapshot budget. |
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

A branch-only, read-only diagnostic is prepared to make at most five whitelisted GET requests with existing GitHub bindings, publish sanitized counts/statuses as an artifact, and avoid all orders, messages, raw payloads and production-data writes. It retains regular/premarket/outside-session context so old prices while markets are closed are not automatically called feed failures. Secret-free simulated premarket sessions remain a separate validation step. No new subscription is necessary to test refusal, missing fields, stale quotes, symbol handling or rate-limit behavior. A definitive account-specific gap list requires observed endpoint responses/headers and a representative premarket sample; neither is available here.

## Owner-action blockers

1. Provide an approved runtime with existing read-only provider bindings, or sanitized entitlement/status diagnostics from it. Do not paste credential values into chat. This is needed to establish actual coverage and API budgets; absence here does not prove the production account lacks access.
2. Approve deployment separately before live collection. The development branch has not been deployed. Complete real sessions, prospective paper samples and authorized delivery verification cannot be manufactured from fixtures.
3. If observed responses later show missing paid entitlements, review that evidence before any purchase. No price, paper account or old upgrade comment is taken as proof of access.
