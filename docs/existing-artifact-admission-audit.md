# One existing artifact:30-minute admission audit

**Result:0 genuine admissions.** No new collection/capture, reconstructed quotes, trades, messages or protocol changes. This is a labelled secondary audit of an original legacy artifact, not retroactive prospective confirmation. [Aggregate audit](validation/oct30-shadow-v1-audit/audit.json), [every original row and reason](validation/oct30-shadow-v1-audit/cases.csv), [source evidence](validation/oct30-shadow-v1-audit/source.json).

## Artifact and integrity

Selected **`data/shadow/2026-10-30.jsonl.gz` at commit `f8a3fa97b08d94e1e5608e6c777787ac347da0a3`**, the first run's retained Git version before the later duplicate overwrite. Selection was for original observation coverage, not outcomes; every row is included. Git blob **7addb934baf4d57cdd5a7f7f7e808b3678abf4a3**; compressed SHA256 **722e4923fc9a5ae9fc6ba8596bf20ebea71de7efd346840d00c6b0911c324228**,64,133bytes. Decompressed SHA256 **17d0ba8373b41d869c85f18221633b492af1de4837fdec27b8fc9534b55c9aaa**,398,695bytes. The original compressed bytes, original summaries and frozen results are unchanged.

Source run **41061535419**, job **124082233084**: existing `workflow_dispatch` event, not a dispatch performed by this audit. The run's metadata head is **8fa8022…**, but the checkout log actually records **8b3de098de7afd77b956e792921da432cf907eec** at13:14:18Z. The watcher step ran13:14:23–19:00:08Z. Commit author time19:00:08Z, commit time19:00:16Z, successful final push19:00:18Z. Component hashes and exact timestamps are in the source record. The original summary reports version3; neither summary nor shadow payload embeds its own source SHA/run ID. Thus checkout/publication linkage is established, not an independently signed runtime or provider attestation. Job duration is not coverage proof.

Original payload day is30October. `d/m0` and entry `m` encode New York minute context. They do **not** supply recorded UTC first-ingestion timestamps, provider BBO clocks or exact ordering within that minute. Commit times establish publication, not detection or fill time. The audit uses publication time only as the evaluator's audit cutoff; it does not substitute that time for observations.

The original producer `shadow-stream.mjs` records bid/ask and rounded quote age at some trigger entries, then `next`, `px30`, high and low **prices**. It does not retain a timed exit bid/ask path with displayed sizes. Original source hashes are pinned. The later overwrite at `bf9bc94…` remains preserved separately; no main file is restored by this audit.

## Exact counts and requirement outcomes

**978 original security-day rows**,968 candidate-context rows and10 R0 control-context rows;0 repeated legacy day/ticker keys. These are audit denominators, **not968 retrospectively enrolled V1 events**. The951 nested variant/trigger slots are different research hypotheses/contexts, not independent admissions. No signal, loser, control or blank-variant row is discarded.

| Requirement | What this artifact actually supports | Admission outcome |
|---|---|---|
| Immutable original and traceable row identity | All978 parsed rows have original line numbers and SHA256 locators | Repository integrity/traceability established. Audit row hashes are not invented event IDs. |
| Original discovery event ID and first observation clock | Candidate records have legacy symbol/day/minute context;129 retain filing accessions |0 valid V1 event envelopes. Filing accession is partial source identity, not a first-ingestion timestamp or a V1 case binding. |
| Point-in-time security ID and industry | No required security/industry metadata is present |0; unresolved, not joined retrospectively from today's reference. |
| Fresh executable entry quote after detection |428 candidates have at least one positive ordered bid/ask;413 have a reported age0–120seconds |0 protocol-compliant entries. Original absolute observation/provider clocks, size and liquidity-asOf are missing; reported age alone cannot establish freshness. Other540 candidates have no recorded entry BBO. |
| Liquidity clock/capacity | Some legacy dollar-volume values exist |0 with required contemporaneous dollarVolumeAsOf and displayed quantity. No missing size is treated as unlimited capacity. |
| Same-time same-industry matched control |10 original R0 controls at9:45 |0 verified V1 pairs. No point-in-time industry/security mapping or candidate-time quote matching exists. R0 is not silently repurposed as the protocol's deterministic control. |
| Candidate/control30-minute followups |422 candidates have a `px30` price summary |0 required exit-BBO paths. A price30minutes later, future high/low, or initial spread does not supply an exit bid, its timestamp, quote age or size. |
| Audited prospective capture/enrollment binding | Legacy research captured in an existing run and preserved in Git |V1 source/identity/clock/enrollment provenance is not established. `prospective=true` would be a declaration, not evidence. |

The **unchanged** `evaluatePaperEvidence` receives the original968 candidate objects **as-is**, with no invented IDs/clocks/quote rows or metadata joins. Its formal result is **968 BLOCKED (`INVALID_DISCOVERY_EVENT`),0 UNRESOLVED,0 RESOLVED**. This is an early structural block, **not**968 successful downstream checks: every candidate also has unresolved identity/entry/control/exit/provenance requirements. The10 control rows are retained as context, not attempted discovery cases. The CSV exposes every row's role, original line hash, available hints and each downstream deficit. No row becomes a profitable/executable trade.

The frozen protocol source SHA256 is **57254fa0a2845cf392d4f5cbb59225eeda5d9387e34f1d7be6de546baf452b43**; protocol ID DISCOVERY_PAPER_V1 and admission revision IDENTITY_EVENT_QUOTES_EXPOSURE_V3 are unchanged. Existing paper admission is distinct from executable approval: this audit does not add ZAD or instrument-type rules to V1, and does not relax those separate execution gates.

Reproduce offline from a checkout that already contains the pinned Git objects:

```sh
node tools/audit-legacy-shadow.mjs
node tools/audit-legacy-shadow.mjs --output /tmp/new-unused-audit-directory
```

The tool performs bounded local Git reads, refuses a mismatched artifact/protocol hash and existing output directory, and never fetches or changes original data. Missing old objects require an explicit separate repository recovery step; the audit will fail rather than silently fetch. Unit tests use local synthetic Git history; they do not pretend fixtures are this artifact.

## Smallest missing scope — proposal only

First prepare an offline adapter for actual existing-stream event/quote/metadata frames. **This artifact cannot be repaired into V1 evidence:** no calculation or identity lookup can recreate the absent contemporaneous quote path. If another authorized immutable archive already contains complete fields, audit that archive without new requests. None is supplied by this selected file.

If no existing complete archive exists, the minimum additional persistence/capture proposal is **one predeclared candidate/control cohort inside the already configured regular-session watcher window**, recording every eligible case and missing row. Persist the actual observation UTC, original event/revision identity, provider trade/BBO/volume clocks, bid/ask sizes, authenticated known-at security/industry mapping and deterministic same-time controls; retain actual candidate/control quote followups through entry+30minutes+up-to3minute exit wait. At most36minutes after the latest accepted detection is needed when all3minute entry/exit waits are used. Do not copy a close/last price into bid/ask or reconstruct timestamps from legacy minutes.

For an existing09:30–15:00 stream,14:24New York is the theoretical latest detection allowing that full36minute path by15:00. Actual early termination/outages still leave cases unresolved. Predeclare the cutoff, retain later events as incomplete followup context, and do not extend collection to16:00 or remove missing cases to improve results. No assumption is made that current raw responses contain every required field or that persistence/encryption is already approved.

Prefer retaining already returned authorized feed fields over adding requests. Missing trustworthy reference metadata may need a separately bounded reference capture. **Neither is authorized here.** Before execution, specify an immutable reviewed runtime/dependencies/workflow, exact date/universe/control denominator, request/time/response/storage limits, encrypted retention/recovery and shutdown conditions; obtain official account-specific quote/reference rights and quota/retention evidence, independent identity provenance and dated owner approval of that precise scope. Existing C0 is date-UNSET,15minutes and diagnostic-only; it cannot authorize enrollment or supply a30minute lifecycle. No secret values or new bindings are requested.

Keep V1 unchanged:1000USD notional,3USD/order, entry ask/exit bid (spread already included),0.5% per-side stress slippage,3minute entry/exit waits and existing quality/control constraints. Even a fully resolved quote path is paper evidence, not a broker fill or strategy verdict. **The concrete next decision is whether to prepare and independently review that exact bounded persistence proposal after feed/reference rights are documented—not whether to count this legacy artifact. Its admitted count remains0.**

## Separate one-session adapter specification

[Machine-readable ANG-FOMC one-session adapter specification](one-session-adapter-spec.json) reuses calendar/session arithmetic, source-snapshot/fingerprint patterns and UNRESOLVED/EXPIRED/NOT_ACTIONABLE handling. It does not reuse the LEADER DIP contract builder, target,126-session hold or1000USD/three-slot policy.

The existing ANG-FOMC strategy remains **REJECTED**. This is a research-only negative-control/specification adapter, not a candidate for trading. Entry is the close of the last trading session before an independently verified official statement day; entry expires at that close with no next-open substitution. Exit is the statement session's close: **one close-to-close return interval across two dated sessions**, not an invented two-session strategy. Hold/no-target/no-stop and historical0.8%/1.2% costs match the frozen definition. Missing/changed calendar, identity, quote or halt evidence remains unresolved; no later price replaces a missed close.

Prospective quote windows, allocation, actual fees and slippage remain explicitly UNSET. Ask/bid observations at the boundary are not auction fills, and any quote-execution overlay needs a separate version/protocol/approval; V1's30minute horizon is not changed. It stays research-only and non-actionable unless a separately justified strategy actually meets agreed evidence/execution gates. Fixtures or a convenient horizon cannot reverse the frozen rejection.

Accounting and watcher deployment records remain preserved; no production deployment, collection, message, order, purchase, gate change or historical rewrite occurred. Live watcher/DST verification remains pending naturally scheduled evidence; this pre-deployment artifact is not new-runtime proof. Engineering acceptance stays24/40 and admitted prospective cases0.
