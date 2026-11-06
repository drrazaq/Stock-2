# Inactive paired-response acquisition → strict A importer

This is **offline implementation**, with synthetic originals and mock/local HTTP services only. It is not an activated collector, authenticated source, preregistered cohort, market-coverage measurement or strategy result. No real keys/providers/setup/bindings. A/B/C/IG1 scopes remain separate.

## Actual path and interfaces

```
pinned request+response-plan files
 → tools/a-acquisition-rehearsal.mjs programmatic host binding
 → a-source-acquisition-bridge.mjs:
      supplied CAPTURE client → own fenced request/raw/receipt store
      supplied WITNESS client → different fenced request/raw/receipt store
 → exact official-route/body/receipt-clock/source-context comparison
 → existing importNativeAEvidence → native SEC/close/quote bindings
 → existing strict A evaluator / full independent-window checks
 → original paper card + deterministic outcome or UNKNOWN
      allowBuy=false / prospectiveAdmissions=0 / activation=false
```

The new non-test runner **calls the actual importer**, not an isolated evaluator lookalike. It consumes the same retained raw response bodies and system clock instants after two separately invoked clients match them. Identity references, primary SEC body, entry quote, close envelopes and exit quote envelopes are enumerated from the actual native dataset, deduplicated only by exact original reference hash, and compared to the pinned finite request plan. The native archive/acceptance join remains unchanged.

**Retained-response binding scope:** the plan is constructed against already retained originals for this offline rehearsal. Its createdAt and matching signatures do NOT prove it was published before outcomes. The bridge does not establish original/global first ingestion by refetching HTTP. boundResponseRecords counts matched archived records (including reuse), never new network calls; actual attempt counters remain in each bounded client and the request journal. Restart tests assert no additional HTTP calls. A genuine live first-capture host still needs a reviewed pre-event plan-publication/receipt builder, streaming acquisition-to-importer orchestration and private custody. Those are implementation/deployment dependencies, not a missing-key-only problem.

## Ports, limits and gates

- `createABoundedResponseClient({fetcher,clock,timers,limits})` implements one GET, streamed bounded body, status/redirect context, original body bytes, start/header/body/observation clocks, cancellation, timeout/late/cap refusal and no retries/fallback. There is no default fetcher, credential/env read, provider client or socket. Standard real timers/Date.now are defaults; test clocks/timers are explicit.
- Requests are limited to existing A SEC primary/submissions, Massive identity reference, Alpaca asset/SIP quote/raw-close routes. No orders, news, new endpoint or feed switch. URLs containing credentials/token/key query parameters are refused. This engineering allowlist is not permission to call a provider.
- Hard ceiling32GETs **per role per pinned plan**,64combined; actual synthetic native fixture requires11distinct envelopes/22requests. No retry or replacement. Each client≤1MiBresponse/8MiBaggregate/20secperrequest; each pre-existing store retains its16MiB/2000file/15secworker caps. Three distinct store namespaces mean≤48MiBstore ceilings combined, before original input files; those ceilings are NOT an approved allocation/collection budget. The immutable per-case plan and real quota/custody scope must be reviewed before any future activation.
- Evaluation store and both role stores must be distinct, with matching cohort/contract and current fences before fetching. CAPTURE/WITNESS require different declared execution contexts, write authorities, clients, signers and underlying public keys. Their declarations must match the existing signed native host/collector/transport/code provenance originals. Tests use two HTTP requests and separate local stores; they do not demonstrate two deployed independent hosts.
- Separate contexts mean separate keys, write authority and fetches under the stated threat model. No hardware/TLS attestation requirement is introduced. Matching names/fingerprints/signatures alone is never source authentication.
- All capture envelope clocks must equal the consumed original instants; original timestamp strings/HTTP-body bytes remain preserved. Different timestamp spellings of the same instant do not rewrite either artifact. Late/refetched bodies never backdate ingestion.
- HTTP refusal/redirect, missing/changed/partial response, pagination in native quote evidence, mismatched independent bodies, stale token, omitted plan item or ambiguous custody remains UNKNOWN. A non-200 response stops the plan before another role fetch; its body is retained. No failure becomes a genuinely empty source. Refusal reasons use a fixed allowlist; arbitrary uppercase provider text is mapped to ACQUISITION_IO_UNKNOWN and never becomes a status code. No favorable quote/body is selected.
- Pairing exact HTTP responses establishes only the finite **request-set correspondence**. It does not establish native event history, complete universe/stream coverage, valid semantics or real execution. Existing full quote/window/identity/ZAD checks still run. A valid receipt over incomplete or paginated evidence cannot create admission.

The CLI supports **inspection only**:
```
node tools/a-acquisition-rehearsal.mjs --inspect-plan ORIGINALS REQUEST_FILE REQUEST_SHA256 PLAN_FILE PLAN_SHA256
```
It reads pinned private input files, validates structural plan membership and prints only aggregate limits/status with runAuthorized:false/providerCalls:0. No execution flag, credential binding, store creation or live activation exists. The programmatic host takes explicit already-created synthetic stores/client ports; non-synthetic origin is refused. Adding credentials cannot enable a live CLI.

## Request state, interruption and recovery

1. Validate exact source/plan/contracts/roles/current fences before any GET. Persist a generation-fenced TRANSPORT request reservation first.
2. Stream the body with real bounds. On complete reception, persist the **raw envelope/body before invoking the signer**. If signing fails the raw original is still available. Then retain the independently signed acquisition receipt. A fresh durable REQUEST receipt is mandatory: an idempotent receipt cannot authorize another fetch. Two independent host processes are forced through the stale-read race; the uncorrected new adapter made23GETs for a22request plan, and the correction permits22with the competitor explicitly blocked. Existing store primitives are unchanged. The observation clock stays original; signedAt records the later actual attestation time, including resumed signing.
3. At a persistence interruption, reopen the same store with the same pinned plan/token. Existing N1 scoped replay finishes only that exact pending write. A durable raw envelope can obtain a later truthful attestation without another fetch or a new ingestion clock. A complete existing receipt is reused idempotently. Old bytes are compared/preserved; source code of N1–N3/export is unchanged.
4. A durable REQUEST with no complete raw envelope is **ACQUISITION_REQUEST_OUTCOME_UNKNOWN**. It is neither a safe retry nor proof the provider was never reached. No automatic redial, deletion, truncation, new generation or replacement outcome. Retain partial bytes if the client returned them. A host killed before durable raw publication may lose an in-memory prefix; the request reservation survives. Separate authorized operator reconciliation/new labelled attempt is required before any future real reacquisition.
5. Conflicting source/receipt/context/custody remains UNKNOWN. Preserve and inspect/export under the existing procedures; do not use the old fence token as recovery authority or remove a lock.
6. Final importer outputs remain research-only/UNKNOWN. No source authenticity/completeness is inferred from the successful software path.

## Execution evidence and timing limitation

Tests cover actual tool binding + bounded clients + local HTTP service + two stores + real strict importer/card/outcome; restart with no refetch; raw-transaction worker SIGKILL at intent/original/record/commit; unknown request interruption; signer failure; byte cap; HTTP429; independent disagreement; stale/equal/incorrect context/role/provenance; missing plan; no-retained-mode; omitted quote; valid signatures with paginated quotes; raw retention with missing owner attestation; original clocks and later signing.

The first local-service positive control failed because the inherited **synthetic fixture** gives HTTP start/header/body exactly the same timestamp, including an entry response at the decision deadline. A default wall timer then correctly affords only1ms. The historical synthetic replay now uses a controlled clock/timer plus a separate real watchdog; the full multi-day date schedule and original instants are preserved. That is not live zero-latency feasibility. Separate tests exercise **default real-clock/local-HTTP timeout** and post-response deadline/backwards-clock refusals. Production deadline checks are not relaxed; no failed startup is dismissed as readiness.

## Exact remaining readiness dependencies

- Independent focused review of this bridge and retired B/C dispositions.
- Authenticated immutable first-capture plan publication and timely event/stream/close/reference assembly, including full independent windows and portfolio marks; not implemented by this retained-response replay.
- Separate real execution/write/fetch contexts and approved distinct trust/custody roots; immutable runtime/source/binding pins and operator scope. No real roots generated.
- Official quote units/conditions/empty/correction/asof/retention and close finality/basis semantics; genuine entitlement/access/latency evidence. Alpaca Plus and Massive Starter ownership is confirmed; Massive remains15minute-delayed.
- Separate approved private host/output/key custody and verified upload/full-readback/recovery. Existing private setup-only proposal is unchanged and does not activate this code.
- Explicit A source-close/ZAD-validity/pilot policy and dated frozen cohort/acquisition budgets.90day non-halal exclusion untouched. No B/C study or replacement is authorized.
