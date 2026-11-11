# Massive / Alpaca: what the existing access actually supports (retained evidence only; main `ead44d8d`)

- **Reviewer:** Claude.
- **Method:** code reading plus retained archives. No provider request was made; this container has no keys. An "Evidence" item is a retained observation, not a guarantee from the plan.

| Question | Finding | Evidence |
|---|---|---|
| **Alpaca stock quotes: real-time or delayed?** | **Observed near-current SIP quotes in the sampled responses** (this is observed freshness for those responses, not proof of an unqualified real-time entitlement for every symbol and endpoint). Quote age (request time − quote timestamp) for liquid names (≥ $20M daily value): median 7 s and 3 s, p90 21 s and 26 s, on 5 and 10 Nov. Larger p99 values (179 s and 328 s) are illiquid names with no new quote, not a delay. | `data/ignition-runs/2026-11-0{5,10}/*.shadow.jsonl.gz`, field `v.*.qAgeSec`, computed as `Date.now() − r.qt` (`ignition-watch.mjs:252,304`) |
| **Alpaca SIP feed accepted?** | Yes. On 10 Nov the snapshot run reported "alpaca live prices (SIP feed) for 11,345 of 12,722 stocks", mode `FULL_SNAPSHOT_PLUS_ALPACA_LIVE` for all 322 minutes. There is an IEX fallback only on refusal (tests `alpaca-feed`, `feed-integrity-watcher`). | `data/ignition-runs/2026-11-10/42832152178-1.json` (`src`, `coverage`) |
| **"Old price" ≠ delay** | Coverage on 10 Nov: price age p50 6.4 min, **p95 1,026 min**; live rate 42%; 60 of the day's movers never live. This is last-trade age across 12k symbols. It is **consistent with** no recent trading, but it does not prove that by itself: delayed or unrefreshed symbols cannot be ruled out without paired quote, receipt and liquidity evidence per symbol. Per-symbol separation needs the liquidity band, as in the row above. | same file, `coverage` |
| **Massive snapshot: real-time or delayed?** | **Observed late in the sampled session, plan and exact delay not established.** The watcher switches to Alpaca live prices whenever Massive's median trade-clock lateness is above 3 min (`ignition-watch.mjs:97-102`). On 10 Nov that held in all 322 minutes. The code comment saying "Starter = 15 minutes late" (line 16) is a claim in the code, not evidence of the actual plan or delay. Keep the sampled observation separate from the plan. The per-minute lateness value is **not retained**, which is a missing field. | mode log, `ignition-watch.mjs:16,97` |
| **Volume** | Daily volume comes from the Alpaca SIP daily bar with an **unstated as-of time** (`SIP_DAILY_BAR_ASOF_UNSTATED`), else the late Massive figure. The missing volume clock is an **evidence limitation**. It is plausibly related to the "volume figure late" miss code (244 of 2,027 misses in ED1), but it is not proven to be the root cause of every such case. | `ignition-watch.mjs:100-102,319` |
| **Historical bars** | Alpaca SIP daily bars: from 2016 onward HTTP 200 (`squad15` probe, 24 Oct). A minute-bar request on a Saturday returned 0 bars: that is market closed, not a lack of entitlement. Massive grouped daily bars feed the 5-year study cache (Actions cache only; see the B-FCFN1 custody note). | `data/squad15-lab.json` `probe.stockSipOld/Today/MinuteNow` |
| **Adjustments** | Mixed by caller. Alpaca `adjustment=raw|split|all` is set per call (for example `squad27` raw, `squad2` all). Massive `adjusted=true` is used in watcher minute bars. Shares in `data/shares.json.gz` are split-adjusted, known 30 days after their date. Each study must state its basis. | grep of `adjustment=` / `adjusted=` |
| **Options** | **Out of Stock-2 scope** (options education stays separate). The 24 Oct probe recorded OPRA latest quote 200 and historical option quotes 404; a 404 alone does not prove that historical entitlement is absent. | `squad15` probe |
| **Missing symbols** | The watcher keeps only `/^[A-Z]{1,5}$/` tickers (`ignition-watch.mjs:80`), so class shares such as BRK.B and suffixed listings are dropped. 5-letter test symbols such as ZXZZT pass. | code |
| **Instrument type** | Massive `/v3/reference/tickers/{sym}` (type CS/ETF/…) is wired into `instrument-type.mjs`, but **not configured or captured in production** (see the radar trace T1). | `docs/radar-trace-20261111/TRACE.md` |
| **Rate limits, plan names** | **Not established** from retained evidence: no retained headers or plan responses. | — |

## Draft (unreviewed, NOT an approval request): instrument-reference capture in the format `instrument-type.mjs` accepts

The earlier "one paginated list request, about 12 pages" draft is **withdrawn**. Paginating is many GETs, not one; it had no finite cap; and a list response cannot be stored in the per-ticker record schema that `instrumentType()` checks. That schema requires all of:
- URL path exactly `/v3/reference/tickers/{SYMBOL}` on api.massive.com or api.polygon.io, with no query string;
- `transport: HTTPS_OFFICIAL_CAPTURE`;
- `raw.status: OK`;
- `raw.results.ticker` equal to the symbol;
- `observedAt` no older than 7 days;
- a file of at most 4 MiB and at most 20,000 records.

**Bounded shape for review:**
- **Scope:** only symbols that reach admission, a radar panel or a D line. A cap of **N = 60 GETs per session** (exact; no pagination, no list endpoint).
- **Limits:** one attempt per symbol, a 10 s timeout, and a response cap of 64 KiB. A failure, 4xx or 5xx, an oversize response or a cap overflow leaves that symbol **UNKNOWN**. No retry, no fallback provider and no inference.
- **Storage:** append-only records `{url, transport, observedAt, raw}` in a private file. Pin the sha256 of the file the watcher reads, and keep the file ≤ 4 MiB by rolling at the 7-day staleness boundary.
- **Exclusions:** the six known exclusions are public-primary verified and need no provider read.
- **Scope limits:** this does not expand IG1, the three-GET caps or any other acquisition. Cost, account limits and the storage location are still to be confirmed against the existing plan before any request.
