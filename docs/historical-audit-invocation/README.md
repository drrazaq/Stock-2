# Bounded historical audit: inactive protected invocation

Prepared 4 November 2026. **NOT AUTHORIZED TO EXECUTE.** No workflow is installed by this package. No provider-data request, credential read, private mirror read, upload or collection was performed. Tests use synthetic credentials, loopback providers and mocked artifact transport. Subscription ownership is confirmed; endpoint access and historical response semantics are separate questions.

## Decision and unchanged scope

Preserve the [original decision](../subscription-evaluation-decision-20261104/README.md), [client](../intraday-audit-client/README.md) and fixed twelve cases. Scope SHA256: `9751a2a0db8bf41a1788a61270be927a983da28170e51c72d68ee8f8759e2772`. Client source remains byte-identical to `84937c966cd1bc85ab5f240f3e53a44dc4fa98ba`. No replacement cases, retries, fallback feeds, order calls or automatic resume. This is historical counterfactual feasibility, not original contemporaneous evidence, an untouched holdout, prospective admission or proof of an edge. Early intraday/short-term opportunities remain the objective; the six-month study is separate.

| Boundary | Enforced limit |
|---|---|
| Massive reference | 36 requests: identity, splits and dividends for each case |
| Alpaca historical | 120 requests: daily + minute bars and at most eight quote pages per case |
| Combined provider maximum | **156**, including failed attempts; no retries/fallbacks/replacements |
| Provider phase | 600 seconds; one request start/second; 20-second full-response timeout |
| Bodies / raw storage | 4 MiB/response; 128 MiB total raw responses |
| Encrypted archive | 160 MiB including journal/ZIP overhead; private repository ACL required |
| Upload/readback | 120 seconds total; 10 seconds/full wire request; at most 23 upload + 3 recovery wire calls (separate GitHub/storage control plane, not provider calls) |
| Public result | At most 16 KiB; exact allowlisted status/reason and request/response counts only |
| Invocation | One attempt, one dedicated ref/run, exclusive durable batch claim; 780-second child deadline + 5-second termination grace; proposed job 15 minutes |
| Private retention | Proposed three days; licence and current key custody must be verified before approval |

There are also exactly two bounded read-only Actions-history requests (credential-free preflight and action revalidation). At most 28 history/upload/recovery wire requests are allowed by the companion; these are separate from the 156 provider requests. Ordinary immutable source/toolchain checkout is setup, not market-data acquisition. Failed history lookup blocks credential use.

The request budget covers reference preparation and historical capture separately and together. A failed or interrupted batch cannot spend the remaining budget in another run without new review/authorization. Quotes are observations, never guaranteed fills. Whole-share economic evaluation remains a later step: $1,000 cash unit, $3/side, ask entry/bid exit (spread counted once), existing stress assumptions; no fill at a stop is assumed.

## Implementation and recovery

`historical-audit-preflight.mjs` validates immutable inputs, private execution context, single-run history, approval, official semantic evidence, independent review and the dispatch window **before** the credential-bearing action. `historical-audit-action.mjs` repeats these guards and history read, then binds only the four named inputs. `historical-audit-invocation.mjs` rechecks every pinned dependency before each provider request and records every case disposition, including unresolved/unattempted cases. The native HTTPS adapter has no redirects or retries.

The custody module encrypts/fsyncs request intents before I/O and responses afterward. A terminal authenticated manifest commits the ordered record hashes. FD-anchored private-directory writes and exclusive claims prevent symlink replacement and repeated batch execution. The uploader uses an explicit bounded Actions artifact protocol; acknowledgement alone is insufficient: exact encrypted bytes must download, hash-match and decrypt/recover. Readback failure is INCOMPLETE, never success. The live path verifies the real ZIP structure/bytes against the one existing sealed journal and decrypts/verifies its chain; it does not create extra on-disk recovery copies. Offline recovery extracts into a separate private destination. Recovery verifies archive hash, original context, AEAD and terminal record chain. It does not fetch missing pages, retry providers, score cases or create trades.

Offline recovery invocation, after separately authorized execution and with an operator-held existing key binding: `node tools/recover-historical-audit.mjs ARCHIVE RECEIPT NEW_PRIVATE_DIRECTORY`. The receipt must contain the expected archive SHA256 and original context. It logs status/counts only. A hard runner loss before verified upload can lose ephemeral evidence; sealed local fragments/uncertain intents are not proof of complete remote retention. An interrupted batch remains partial and is not automatically resumed. No public raw data or decrypted record is uploaded.

## Verified execution-location finding

Supported read-only metadata did **not** establish an already-authorized private research executor. The current managed executor has no configured bindings. The public repository's bot source names Alpaca/Massive bindings, but source references do not establish availability. Secret-name inventory requests failed; no names or values were obtained. The existing private financial mirror is readable in metadata, has zero registered workflows/environments, and has no research authorization. Its token and contents were not used. One public environment exists, but no suitable research binding/permission was established. Historical October 29 key proof does not verify today's `RESEARCH_ARTIFACT_KEY` binding/custody.

Public-repository artifacts are **not private storage**, even when encrypted. The guard refuses a public repository or unverified private artifact ACL/key custody. There is no permission to repurpose the financial mirror, add/copy bindings, install a workflow or execute a diagnostic.

## Minimum concrete arrangement requiring owner authorization

Use one dedicated **private research-only Actions repository** under the owner's account, or an equivalently reviewed private protected runner/store. Do not use the financial mirror. Limit access to owner and the explicitly named on-demand operator. Install only the separately reviewed `historical-audit-once.yml` proposal on its dedicated `historical-audit-once-9751a2a0` ref, using immutable public source and private immutable approval/evidence inputs. Job permissions: `contents: read`, `actions: read`; no write token, Telegram, financial-state, broker or production access.

Required existing binding names: **ALPACA_KEY, ALPACA_SECRET, MASSIVE_KEY, RESEARCH_ARTIFACT_KEY**. No key values belong in chat, commits or public outputs. Establish current owner recovery-key custody and private retention/deletion controls. Any creation/copying of bindings, private repository/runner provisioning or workflow installation needs an exact separate setup approval; none is performed here. Setup approval would not authorize provider-data execution. After setup, applicable semantics/rights and independent review pass, one later execution approval must pin repository, operator availability, source/workflow/manifest/auth/evidence hashes and a dated thirty-minute authorization window. The on-demand operator is proposed as Codex, with no unattended availability promise.

Concrete proposed location: `drrazaq/stock-2-research-audit`, a new dedicated private repository **whose existence/access is not currently verified**. This name is a setup proposal only. Minimum setup authorization would cover this research-only location, the exact reviewed workflow proposal and four binding names, three-day private retention and owner recovery custody. Installation produces a workflow commit that must then be pinned in the separate execution approval. Dispatch actor must be the approved owner account; it and the immutable workflow commit are checked before research bindings are read.

The proposed workflow is kept under docs with a `.proposed` suffix. Checkout pin `11bd71901bbe5b1630ceea73d27597364c9af683` and setup-node pin `49933ea5288caeca8642d1e84afbd3f7d6820020` were confirmed against official actions/checkout and actions/setup-node Git commit metadata, respectively. It uses Node20.20.2, no persisted checkout credentials and no upload-artifact retry wrapper. Cleanup removes control/result files; sealed partials remain until hosted-runner teardown if publication fails. That does not guarantee survival of an unuploaded tail. The workflow's runtime token remains confined to artifact-service requests; provider keys are not forwarded to storage. No public artifact ACL is treated as private.

## Dependency table

| State | Exact dependency / next action |
|---|---|
| Offline implementation complete | Guard/client path, private AEAD journal, actual ZIP upload/readback protocol, native timeout and recovery regressions; see verification.json. Inactive pending independent review. |
| Independent review pending | Claude must review both unchanged client `84937c96` + fixed scope `f33447aa`, and this exact companion publication. CI is not independent approval. |
| External semantic evidence | Official dated Alpaca quote-size units, condition/firmness/halt interpretation, historical correction semantics and private hosted retention rights; see provider-questions.md. |
| Execution arrangement / owner decision | No already-authorized suitable private environment verified. Approve a concrete research-only setup and key-custody arrangement after review, without repurposing financial storage. |
| Execution still unapproved | No dispatch date is proposed until those prerequisites pass; then one bounded 12-case/156-request approval. |
| Evaluation later | Every case retained, including empty/unavailable/excluded/loss cases; unknown firmness/halt/capacity remains UNKNOWN. No automatic sample extension or strategy promotion. |

Stop-alert review is independent of this historical-only preparation. A-pathway findings remain with its implementation owner; no A policy is adopted by this package. No acceptance row is closed by inactive tooling or synthetic success.
