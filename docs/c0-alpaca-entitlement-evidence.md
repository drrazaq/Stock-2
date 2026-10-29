# C0 Alpaca evidence still needed

Prepared 29 October 2026. Public documentation clarifies the product; it does not prove this account's subscription. No credentialed requests were made for this review.

| Official reference | Public fact resolved | Saved reference SHA256 |
|---|---|---|
| [Market Data API](https://docs.alpaca.markets/docs/about-market-data-api) | Trading API Basic lists IEX; Algo Trader Plus lists all US exchanges. Trading and Broker product terms differ. The table describes historical request allowances, not proof of this account's latest-snapshot allocation. | ff3f8537b88c7e2640fc6f60ed0143a7441c9f503e23c1da8c889f04c9b9362f |
| [Multiple snapshots](https://docs.alpaca.markets/us/reference/stocksnapshots-1) | Explicit sip means SIP; delayed_sip is 15-minute delayed. Rate headers are requests per minute; reset is an epoch timestamp. Current quote sizes are shares (round lots before 3 November 2025). This schema does not establish a 200-symbol contractual maximum. | 8d17528e41b4a54e2ead9f43d8fc7b2901016541c02442376de653d9a1ca7969 |
| [Assets](https://docs.alpaca.markets/us/reference/get-v2-assets-1) | Paper assets use paper-api.alpaca.markets; active/us_equity/tradable is current provider reference, not authenticated common-stock or historical membership. | 4e529c2f1eeb21a87f544932f15139549e2e5aaf5ca148701789e235be7aac4b |
| [Market data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq) | Latest SIP snapshots require the applicable subscription; historical free SIP with an old enough end time is different. Default feed selection and isolated successful samples cannot prove account-wide entitlement. | b6d9225409d2211b60cfeed72e8716fc1e05f2d7593ffed6dc120a0b5ebaef13 |

Hashes identify the retrieved Markdown references; they are not account evidence or promises that terms never change. Summaries above are paraphrases. No full documentation copies are committed.

## Exact account-specific gap

Provide a dated, redacted official subscription/entitlement page, invoice plus applicable terms, or Alpaca support confirmation covering the following. Include the official URL/document date and distinguish Trading API from a Broker/partner product. Omit account IDs, balances, addresses, key IDs and all secret values.

1. Current plan/product and active latest **SIP snapshot/quote** rights for US equities, exchange scope, premarket/extended-hours availability and any symbol/category restrictions. Clarify whether rights cover the same existing key pair used for data and the read-only paper-assets endpoint; no key values are needed.
2. This account's allocated latest-endpoint requests/minute and any batch-symbol or concurrent-request constraints. The proposal caps itself at 60/minute and 200 symbols, but those are internal bounds, not entitlement evidence. A stricter allocation requires a reduced, newly reviewed scope; if a full sweep cannot fit the window, fail broad-scope feasibility rather than silently sample.
3. Permission to retain raw snapshots and asset reference encrypted in private-access GitHub Actions artifacts for three days and download/decrypt locally for research. State redistribution/storage restrictions and who may access artifacts. Public aggregate logs do not remove raw-data licensing obligations.

A Basic/IEX-only answer means this SIP proposal cannot proceed under that plan. No automatic fallback, upgrade or purchase is authorized. A fresh sample or HTTP 200 cannot replace official rights. Massive Starter remains 15-minute delayed and is not bound into the selected workflow.

## Other external dependencies

Before any execution approval, the owner must also confirm available GitHub Actions/artifact quota, ability to download within three days, and acceptable artifact access under the feed terms. Existing independent key-recovery proof is preserved; the new format passes independent fixture recovery, but actual uploaded bytes and hard-cancellation recovery remain unobserved. No secret rotation or permission change is requested.

After these non-secret facts are reconciled, review [the inactive C0 package](c0-diagnostic-review.md), select one eligible date and provide a dated approval referencing the exact source, workflow hash, credential bindings, budget and recovery/shutdown limits. This document requests evidence, not execution. Approval for C0 would cover an operational diagnostic only; it cannot authorize paper enrollment, real messaging or trading.
