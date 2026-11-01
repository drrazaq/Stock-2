# Inactive V2 host, guard and recovery package

Bounded deliverable for DISCOVERY-04 and HISTORY-04: one inactive integration package for independent review. It is not a collection, deployment, strategy endorsement or protocol adoption. V1, the rehearsal guard, frozen enrollment/evaluation and original artifacts are unchanged. All examples, references, credentials and service responses are explicitly synthetic. Genuine admissions remain0.

## Finite completion checklist

1. Actual colocated watcher host starts a separate pinned V2 worker; observation continues while quote and upload clients wait. Preserve the existing configured watcher window and archives.
2. Revalidate exact runtime closure, worker input, binding-module dependencies, original reference bytes and authenticated same-day history. UNKNOWN/earlier-run history is blocked; no changed continuity policy is adopted.
3. Read original native SEC/selection prefixes before the quote, retain original clocks and acceptance proofs, then seal source/reference/history/parent context, frame/state and paired outcome into immutable checkpoints. Never manufacture first ingestion.
4. Use existing bounded snapshot and artifact wire-client implementations through explicit mock transports. No ambient fetch, environment credential discovery, retries, fallback or extra SEC requests.
5. Require a durable checkpoint/ACK before another quote. Refusal, deadline, changed input or uncertain persistence stops capture and preserves evidence; it never cancels the producer. Restart does not automatically resume or re-enroll.
6. Verify the actual downloaded ZIP format against independently pinned receipts, archive/file digests, authenticated encryption context, contiguous chains, original native/telemetry byte prefixes and recomputed outcomes. Wrong keys, missing/truncated archives and altered scope are rejected. No financial record is read or written.
7. Run existing V2 regressions, new guard cases, actual host/client/failure/restart/recovery tests (including competing workers and partial checkpoint/ACK/receipt/manifest writes) and complete applicable checks. Only terminal exact-SHA CI establishes completion.

## Exact implementation boundary

Runtime: a separately guarded V2_CAPTURE profile in artifact-wire-client.mjs and a separate V2 adapter in native-sec-bounded-clients.mjs; sec-v2-host-binding.mjs; tools/native-sec-v2-capture-worker.mjs; sec-v2-recovery.mjs; one context-asset extension in sec-v2-evidence.mjs. Existing native host, D1/D2 lifecycle, D3 history clients, V2 proposal selector, quote parser, snapshot client and artifact wire client are reused. The worker remains synthetic-only; credentials cannot change mode or activate it.

The existing calibration timing document is reused ONLY as the unchanged40-minute transport-window/lifecycle contract. V2 selection uses its separately versioned DRAFT3 proposal; it does not invoke the V1 enrollment/evaluator. First proof-ready observation, exclusion of pre-open FIRST OBSERVATIONS (not a claim that an in-window observation was newly published), symmetric controls, fixed six-name scope and all clocks/rules remain unchanged. The proposal identity is the actual selector-source SHA256, not a nominal label.

The reviewed V1 artifact profile stays unchanged and continues rejecting V2 names/envelopes. A distinct V2 namespace and exact pinned encrypted context are required before any upload. The adapter preserves original six-digit checkpoint files and their bytes; only a separate encrypted wire copy uses the three-digit ZIP entry name required by the reviewed ZIP codec. Receipts bind both names and identical hashes. Wire copies add at most64MiB local encrypted staging within the existing400MiB host bound; no request or remote archive quota is increased.

The worker records the system reference ingestion clock when bindings initialize; source capture clocks stay separate. The first encrypted checkpoint retains original reference/review/history/runtime-pin bytes and any authenticated parent context, subject to the existing8MiB source-material bound. Every checkpoint retains a full state and original asset deltas; no original source file is rewritten. Recovery is read-only and does not authorize automatic resumption.

The complete capture is41 acknowledged archives plus the retained receipt manifest and its independently pinned hash. Recovery requires these explicit inputs; absent receipts or missing archives remain unresolved. A client ACK alone is not independent remote-byte verification; the recovery operation verifies downloaded bytes. Encryption verifies integrity, not independent historical/source authenticity. This is not a guarantee that an interrupted host will publish every artifact or retain its receipt manifest.

## Bounds and separate authorizations

No reference calls occur in this package. Any future reference preparation remains a separately reviewed/authorized scope. Proposed capture adds at most41 SIP snapshot requests; SEC proof responses are reused with0 additional SEC requests. Same-day history control-plane budget is at most256 requests under the existing day-scoped contract. Encrypted artifact transport is at most41 uploads/205 wire requests. Maximum new requests across these three categories is502, excluding the watcher's existing separately authorized traffic; these are not the separate seven-request SIP diagnostic.

Per quote/body deadline10seconds, response64KiB, aggregate response8MiB;41 frames across09:30–10:10 New York, final frame starts10seconds before end. Source material8MiB, plaintext checkpoint12MiB, sealed checkpoint16MiB, total sealed64MiB; downloaded archive total64MiB. Upload client and store timeouts remain bounded; no retries. Host lifecycle deadline is plan end plus the existing bounded shutdown margin, never a540-second ceiling. The producer owns its own natural stop and is not signalled by capture failure.

Existing development Node test-job timeout was10minutes. The initial hosted attempt reached that bound after revealing a fixture assertion error. The development-only budget is20minutes to finish the expanded full suite; permissions, triggers and provider/capture budgets are unchanged. The new integration tests execute first and are omitted only from the later loop because they already ran, so every test file still executes exactly once. This gives fast failure feedback without reducing full-suite coverage. This test-harness change is excluded from any production package/deployment proposal.

## Failure evidence preserved

Base71cccb62 is preserved. Local candidate46dc157d and7c84c711 retain the initial unverified implementation. Local process tests failed with listen EPERM on127.0.0.1; a later optional in-memory diagnostic hit spawnSync git EPERM in the child watcher. The transport experiment is preserved under /workspace/milestones/v2-host-integration and is not part of the package. No platform control was bypassed.

Hosted sourcee6e737be (run41317712179/job124881193440) exposed a TEST defect: pre-open startup at09:29 yields332 heartbeat minutes, not331. The corrected assertion checks the entire exact sequence09:29–15:00 rather than reducing coverage. The synthetic loss starts after entry, rather than widening the entry spread and accidentally excluding the intended case. Strategy predicates/rules were not changed.

The initial wire integration failed on incompatible filename and encrypted-envelope contracts; these failures are retained in source9ff9e273 andffdc6d0e. Explicit filename mapping and a separate strict V2 profile now pass real client tests; V1 is not relabelled or relaxed. A broad synthetic prefix filter also admitted pending filenames. It now copies only committed filenames, and progress assertions require a readable snapshot rather than treating read failure as zero. The initial generic stop did not retain its syscall details; no precise retrospective syscall cause is claimed.

Local guard tests cover mode/config/input mismatches, dependency changes, symlink replacement, blocked earlier/UNKNOWN history before keys/output, and link-safe result/failure reporting. Actual socket-based integration and full-suite results must be taken from exact-SHA hosted CI; local errors are not passing evidence.

## Readiness and review

This finite inactive package is engineering-complete with hosted source b4cebc98 (235 test files PASS), while DISCOVERY-04/HISTORY-04 acceptance remains OPEN. No whole row becomes engineering-complete merely because this scoped package is complete. A live-capable activation guard, actual credential/workflow binding, protocol/continuity adoption and dated collection authorization remain separately scoped requirements; this package deliberately contains no live mode. Instrument/reference/retention evidence and real quote/outcome observations are also absent. Confirmed subscriptions remain Alpaca Algo Trader Plus and Massive Stocks Starter (15-minute delay).

Node22 is not an additional40-row acceptance criterion. Production watcher/CI targetNode20. The independent SIP review separately executed its proposedNode22.22 target; that evidence does not activate that diagnostic or prove market coverage. Monday natural startup/DST/SEC/feed/archive/persistence/delivery observations remain separate.

After independent review of this bounded package, the implementation queue proceeds to REPO-03's per-script behavioral evidence and HISTORY-03's complete numerical-claim catalogue, coordinating with Claude's audit. Syntax/inventory alone will not close REPO-03, and extracted strings alone will not authenticate claims. No new strategy adapter is included.

## Verified checkpoint

[Exact source b4cebc98 full hosted suite](https://github.com/drrazaq/Stock-2/actions/runs/41321877142/job/124893641478):235 test files PASS, including10 actual-host cases,6 guard cases and3 V2 wire cases. Local guard6 + wire3 + legacy wire20 + legacy clients8 PASS. The exact ten-file patch applies to preserved71cccb62 and all runtime/test/dependency hashes match in a fresh disposable checkout; its guard and wire tests pass there. Consolidated development documentation receives its own exact-SHA CI; these source checks are not borrowed as consolidated checks.
