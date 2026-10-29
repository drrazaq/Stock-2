# Hybrid data readiness: measured access, not validated discovery

Owner-confirmed Massive Stocks Starter: $29/month, 15-minute-delayed US-stock data, five years history, unlimited API calls under plan terms. This is suitable for delayed context and historical inputs subject to security-identity, delisting and coverage checks. Its current snapshots cannot prove real-time premarket discovery. An old or missing timestamp is retained, never relabelled with ingestion time. Five years of endpoint access does not establish a survivorship-free point-in-time universe.

The owner-requested Alpaca audit ran once on development source a31340002c54ffcc056854b6464c689757a2f5eb: run40871506655, job123439446169, 29October2026 at12:13:44UTC (08:13EDT). Eleven GETs,6,732,892 response bytes, no retries, orders, account/position reads, Telegram or Phase A. Aggregate observations are in validation/alpaca-access-2026-10-29.observed.json. The temporary trigger and credentials binding are retired after the run. No new entitlement was purchased or inferred from the account name.

| Measured endpoint | Returned | Trade fresh <=180s | BBO fresh <=180s | HTTP |
|---|---:|---:|---:|---:|
| SIP fixed24 snapshots |24/24|19/24 (79.17%)|21/24 (87.5%)|200|
| IEX fixed24 snapshots |24/24|5/24 (20.83%)|2/24 (8.33%)|200|
| SIP latest trades / quotes |24/24 each|19/24|21/24|200 each|
| IEX latest trades / quotes |24/24 each|5/24|2/24|200 each|
| SIP/IEX snapshots without symbols |not observed|not measured|not measured|400 each|
| Current active US-equity assets |14,346 active;13,488 tradable|not a quote endpoint|not a quote endpoint|200|
| SIP five-minute AAPL/SPY trades and quotes |1,000 records each|all clocks in requested interval|both pages truncated (`hasMore`)|200 each|

SIP snapshot trade median age15.505s /p95 1,557.425s; quote median4.023s /p95 807.797s. Fresh SIP BBO spread p95 29.8444 basis points. These high tail ages matter: a fresh majority cannot make every symbol fresh. No displayed-size/fill claim follows from this report. The24 symbols were fixed for diagnostics, not sampled randomly or selected for detected runners; the results do not generalize to13k symbols.

Data endpoints reported rate-limit limit10,000 and remaining9,999; assets reported200 and199. These are server headers for these calls, not verified sustained throughput, billing terms, entitlement contract or permission to stress the API. No burst/rate-limit saturation was attempted. HTTP400 on omitted-symbol snapshots indicates an invalid/unsupported request shape; it does not prove denied SIP access or unavailable market coverage. Explicit symbol batching is necessary to evaluate broad coverage. The current asset list includes instruments outside a desired common-stock universe; separate explicit asset-class/exchange/security-ID policy is required.

## Feasibility and remaining blockers

The hybrid is viable for **targeted confirmation**: identify supplied symbols from delayed context/news, obtain actual SIP trade and BBO timestamps, and withhold conclusions on stale/missing fields. Existing branch watcher already refreshes a bounded eligible subset of Massive rows through supplied Alpaca symbol batches. Fresh BBO followups now request refresh even when a trade is fresh; hybrid rows retain separate provider/feed provenance for price, quote and volume. No feed name guarantees freshness, no SIP daily-bar timestamp proves volume is current, and an IEX fallback is not consolidated SIP volume.

This is **not yet verified whole-market real-time discovery**. A candidate must already enter the refresh universe. New listings, missing previous closes, excluded asset classes and low-price caps can omit movers before Alpaca is queried. Delayed ranking followed by real-time confirmation can still discover runners15minutes late. A13,488-symbol reference at200symbols/batch needs68requests per sweep,22,440 over330minutes, plus reference/context/news/overheads. The old420-request Phase A budget cannot silently accommodate that. End-to-end completeness, pacing, latency and economic value remain unmeasured.

Real-time discovery would require a separately reviewed universe-sweep collector or licensed broad stream. First review official endpoint limits and explicit symbol shape; then fixture-test batching, truncation, symbol changes, failures and rate budgets; only then propose a separately pinned dated live session. Existing credentials observed200 do not establish all future access or vendor redistribution rights. Do not purchase anything.

The old Phase A runtime7dd702d and reviewed wrapper remain unchanged, uninstalled and unapproved. They must not be run as proof of real-time coverage. Acceptance stays22/40: MARKET02 is partial endpoint evidence; MARKET04/DISCOVERY03/04 remain open. Actual prospective cases0; no profitability finding.

## Proposed revision for Friday30October2026 — NOT APPROVED / NOT INSTALLABLE

Use a two-stage review, not a silent runtime substitution. First finish a branch-only hybrid collector implementation and fixture contracts. Produce its exact source SHA and workflow digest for review. Until those exist and pass CI, there is no deployable revised Phase A proposal and no approval request to dispatch it.

The intended session remains one manual dispatch at03:55EDT (07:55UTC), collection04:00–09:30EDT (08:00–13:30UTC), no schedule/retries/automatic restart, expiry13:35UTC. Proposed source labels: MASSIVE_15MIN_DELAYED_CONTEXT; ALPACA_SIP_OBSERVED_CLOCK; ALPACA_IEX_SINGLE_VENUE only if explicitly approved and separately counted. Never call unknown-clock data real-time. No automatic fallback may be hidden under SIP labels.

Files that would be reviewed: new pure `hybrid-research-collector.mjs`, new offline-default CLI `tools/hybrid-research-collector.mjs`, fixture tests under `tests/`, a new dormant `.proposed` wrapper under `docs/validation/`, and a separate unapproved manifest. A later approved installation would add only `.github/workflows/premarket-research-validation.yml`; no existing production workflows, watcher, Telegram, holdings or owner marks would change. These new collector files/wrapper are design work, not present or approved runtime. Original7dd702d/94824b7... cannot be relabelled as this new collector.

Before approval specify and test exact numeric request/byte/time/cancellation budgets sufficient for selected coverage; retain three-day encrypted artifacts with existing verified RESEARCH_ARTIFACT_KEY and Python3.9 offline recovery. Legacy PRIVATE_KEY untouched. Trading/message secrets absent; pinned imports must exclude order/message modules. Only GET whitelisted data/asset/reference endpoints, no sensitive account/position reads. Wrong branch/date/source/approval/attempt,403,429, malformed or over-budget evidence fail closed. Partial evidence is labelled incomplete. Hard cancellation still cannot guarantee final artifact recovery; encrypted intermediate checkpoint design must be separately reviewed rather than assumed.

Predeclare measurements: supplied universe and exclusions frozen before collection; every expected minute and requested/returned/missing symbol per sweep; trade and BBO clocks independently, p50/p95 ages, future/unknown/stale denominators; per-endpoint latency/errors/rate headers; first detection and subsequent observed+5/+10/+20/+25 using actual clocks, never backfilled; delayed-context timing separately from real-time observations. Operational completeness requires330 distinct intended minutes and every declared symbol attempted in each intended sweep; missing/truncated/cancelled cycles fail completeness. Freshness is an observed per-symbol measure, not guaranteed by that operational pass. Preregister empirical thresholds and independent case/day minima before outcome collection; they have not been approved here. Paper entries require current spread, actual size/liquidity/identity and unchanged registered costs; absent evidence is censored, not a fill. No strategy or BUY promotion from Phase A.

Rollback: cancel the single approved run, disable/delete only its added workflow, revoke no existing secrets and edit no existing production files. Download all available sealed artifacts before three-day expiry; verify authenticated decryption, pinned source and manifest locally; label incomplete intervals. If artifacts never upload, report unrecoverable evidence loss rather than inventing results. If review/approval misses the dated window, stop and propose a new date explicitly; no rollover.
