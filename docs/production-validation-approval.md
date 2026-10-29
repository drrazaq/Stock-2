# Production validation proposal — approval required

Status: **not deployed, not dispatched, no live collection or Telegram validation performed**. Approving this document does not approve a strategy, a BUY alert or a trade.

## Phase A: one research-only premarket session

Approve at most one reviewed NYSE trading day, with manual startup around 03:55 New York. No recurring schedule is proposed. The collector waits until 04:00 and stops at 09:30, or earlier for an expired approval, request/storage budget, cancellation or runner limit. A late runner retains gaps and fails complete-window acceptance; it never backfills observations. Reviewed half-days have the same premarket window. Holidays and unreviewed calendar years do not collect.

**Pinned runtime source: `7dd702d5d2ed3578f7558bc4f7fcc211f3619669`.** The exact proposed workflow is [validation/premarket-research-validation.yml.proposed](validation/premarket-research-validation.yml.proposed). Its `.proposed` extension and location make it non-active. Only after explicit approval would an operator add that exact file as `.github/workflows/premarket-research-validation.yml` on main. No existing main workflow is edited. No whole-branch merge is proposed.

The workflow checks out only these runtime files from the pinned source into an isolated `code/` directory:

- `research-collector.mjs`, `tools/research-collector.mjs`, `tools/seal-research-artifact.mjs`;
- `market-session.mjs`, `market-symbol.mjs`, `snapshot-fields.mjs`;
- `discovery-runtime.mjs`, `multi-angle-discovery.mjs`, `ignition-gates.mjs`.

It separately checks out only these current public inputs from main: `data/news-log.jsonl`, `data/events-recent.json`, `data/insider-study.json`, `data/earnings-recent.json`, `data/chain-ripple.json`, `data/share-supply.json`, `data/discovery2-today.json`, `data/comeback-today.json`. The input commit SHA is recorded. Missing/stale/derived inputs keep their availability caveats. Owner positions, settings, halal marks, private files, practice accounts and frozen study results are excluded from both sparse checkouts. Copies exist only on the ephemeral runner; no repository data is written or committed.

### What would run live

One GET per minute to Massive's full US-stock snapshot endpoint; optional Finnhub general news every fifth cycle. A complete session uses 330 snapshot requests and up to 66 news requests; the attempt cap is 420. No new service is purchased. HTTP errors, invalid JSON/schema, missing credentials, cooldowns, latency, invalid/duplicate symbols, stale/future field clocks, fresh-price/BBO counts and received-symbol denominators are recorded. There is no partial IEX substitute labelled as whole-market coverage. The pre-ignition rule remains inactive before its registered regular-session window; no frozen threshold is changed.

Existing `MASSIVE_KEY` and `FINNHUB_KEY` are bound only to collection. Existing `PRIVATE_KEY` is bound only to an encryption preflight and sealing step, and is never passed to the collector. This proposed additional use of the existing encryption secret requires approval; no new secret value or permission change is requested. Missing/unusable encryption aborts before provider requests. Keys stay in environment bindings, never workflow inputs, command arguments, logs or artifacts. Repository permissions are `contents: read`, checkout credentials are not persisted, and no push/dispatch/order permission is granted.

The approved manifest must contain the pinned source SHA, exact trading day, approval/expiry timestamps within 24 hours, `mode: RESEARCH_ONLY`, `maxCycles: 330`, `maxRequests: 420`, and `maxCompressedBytes: 67108864`. A non-active example is [validation/research-approval.example.json](validation/research-approval.example.json). A file is an activation interlock and audit record, **not evidence that approval was granted**. No valid live approval file has been generated. The job has a 360-minute timeout; delayed starts do not extend the trading window.

### Preventing orders and unproven recommendations

The collector imports no broker client, scan, Telegram sender, promotion module or lab runner. Its transport fixes GET-only provider endpoints, blocks arbitrary remote base overrides, refuses redirects and never retries ambiguous responses. No Alpaca, Telegram, private-data-write or trading credential is bound to it. The workflow never runs `scan.mjs`, `ignition-watch.mjs`, any lab, or the paper-order opt-in. Research candidates remain `NOT AN APPROVED BUY`; no Telegram message is sent. Existing production alert workflows receive none of these artifacts or candidates and are outside this deployment. Deploying the separate broker safeguards or changing existing approved-alert behavior requires a separate review; this proposal does not claim to disable unrelated existing production practice-account activity.

### Storage and privacy

Outputs are attempt-specific compressed files under `research-output/`, never canonical production data. All quote/news/discovery payloads, heartbeats and provenance are authenticated/encrypted before upload with AES-256-GCM, random per-file nonces and source/path-associated data. Only `sealed-research/` is uploaded; raw `research-output/` is never an artifact path. This prevents public plaintext market-data redistribution or disclosure of research inputs. Failure artifacts may be incomplete but remain encrypted. Source files are not rewritten. The sealed upload cap is 96 MiB and retention is three days; the compressed collection cap is 64 MiB. If existing artifact quota is unavailable, stop and report it; no upgrade or purchase is authorized. Before activation, confirm the existing decryption key is recoverable by the owner; never paste it into chat. The owner must retain/decrypt the artifact before expiry. Secret-free roundtrip, tampering, wrong-key, path and budget tests run before approval.

### Success/failure measurements, fixed before collection

Collection acceptance is separate from strategy acceptance:

1. Exact runtime/input SHAs, trading day and run/attempt identity are present. Exactly 330 distinct 04:00–09:29 minute observations exist, with no gap over two minutes. Late/partial/expired/budget-limited attempts fail full-window acceptance.
2. At least 95% of minutes have valid full-snapshot responses; p95 request latency is under ten seconds. Report each error/refusal/rate-limit and missing-news period. Zero broker, Telegram or repository-write requests are permitted.
3. Record received/unique symbols, invalid symbols, price/BBO freshness, future clocks, last successful cycle and p50/p95 age for every minute. Fresh prices on one symbol are not full-market coverage. `executionWindowComplete` and `allMinutesHadSomeFreshPrices` are execution/observation flags only; tradable-universe coverage remains UNVERIFIED until a separately verified security-type/liquidity denominator exists. No arbitrary fresh-price threshold will be retrofitted after seeing the results.
4. Verify every decrypted payload and count against the encrypted summary; preserve failed attempts and gaps. A budget, encryption, source-shape or upload failure is an incident, not a successful session.
5. Report first observed detection/price, source/publication versus ingestion time, subsequent **observed** moves, misses, unknown prices and suppression reasons. No later quote may fill a missing first-detection price. Record false-positive definitions and unresolved outcomes separately.

## Phase B: prospective after-cost comparison — separate approval and readiness gate

Phase A cannot establish profitability. The existing fixed `DISCOVERY_PAPER_V1` protocol requires next fresh ask entries, bid exits, whole shares/$1,000, $3 per order, spread/liquidity limits, 0.5% per-side slippage stress, observed drawdowns and deterministic same-time industry/price/liquidity controls. Missing exits remain unresolved. Actual prospective resolved cases are currently **zero**.

Before requesting Phase B deployment, complete and test regular-session quote followups, point-in-time security/industry and liquidity capture, historical share-class/ticker lineage, and a verified common-stock denominator. Public CIKs alone are insufficient. Current Phase A collector stops at 09:30 and cannot supply the protocol's regular-session execution horizon by itself. Any extra endpoint must first prove access using existing bindings; HTTP403/429 or missing identities must not trigger a purchase, fabricated metadata or a substitute profitability claim.

Freeze the protocol/hash, candidate and control eligibility, sample period, minimum resolved samples/days, missing-data rules, confidence intervals and independent confirmation period **before** Phase B collection. The existing forward-paper minimum is 30 resolved trades on ten days; that alone is not enough to approve an engine. Require positive matched after-cost edge with a positive lower confidence bound using date/security clustering, realistic liquidity/capacity and false-positive/drawdown analysis, verified broker fees, spread/slippage stress, survival without the two largest wins and an untouched confirmation sample. Predeclare multiple-comparison treatment because the nine lanes share correlated inputs. Fix the evaluation end date so reaching a favorable sample count cannot cause optional stopping. A resolved negative after-cost result is not suppressed; missing quote paths remain unresolved. This 30-minute protocol cannot be relabelled evidence for medium- or long-hold strategies; those require separately frozen horizons. Do not tune on the evaluation sample. If results are negative or inconclusive, preserve that verdict and continue paper-only; do not relabel it approved. No BUY permission is included in either phase.

## Rollback

Cancel the single validation run in Actions; there is no automatic restart or recurring schedule. Revert/delete only `.github/workflows/premarket-research-validation.yml` on main, or retain it disabled without dispatch. Approval expires within 24 hours and the pinned source never changes silently. Preserve encrypted failure evidence for review before deleting artifacts. No data reconciliation, position reversal, order cancellation or frozen-result restoration is required because this workflow writes none of them. Existing production schedules, alerts, settings and research remain untouched.

Requested approval scope, when ready: installation of this one manual, read-only workflow; its listed existing-secret bindings; and one specified trading-day research session. Merge, recurring collection, Telegram delivery, approved BUY alerts, orders, service purchases and Phase B are excluded.
