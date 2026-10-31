# Guarded paper capture — finished offline implementation, inactive

This supersedes the unfinished-wrapper status at6e22b65. That checkpoint passed all five CI checks. The requested guard, source/input checks, reference-provenance validation, acknowledged encrypted persistence and downloaded-archive recovery are now implemented and exercised with synthetic clients. [Exact source/file/workflow hashes](validation/prospective-paper-capture-manifest.json), [verification](validation/prospective-paper-capture-verification.json), [unchanged research proposal](prospective-paper-capture-proposal.md).

Nothing is installed or credential-bound. The proposed workflow is an **offline rehearsal**, not a collector: it runs the same guarded caller with disposable Git repositories and mocked service clients. Its only CLI execution mode is `--simulate`; supplied reference bodies must be explicitly synthetic. No real network client or credential is looked up implicitly. The service adapters accept explicitly injected clients; they do not read environment secrets or install an SDK. The trusted live host, workflow/client bindings and native producer integration are implementation gaps, not merely an activation or external-evidence step. [Current native implementation and remaining live scope](native-sec-event-integration.md) supersedes the earlier readiness wording.

## Guard and immutable inputs

`paper-capture-wrapper.mjs` checks a dated affirmative approval, exact limits, the fixed six-name CALIBRATION scope, explicit SIP/retention/condition-semantics evidence pins, recovery proof, manual branch/owner/attempt context, actual read-only workflow bytes and their Git blob, and the complete runtime dependency set against both Git and regular local files. It checks source/workflow HEAD, bytes, inode and timestamps again before observations, persistence and finalization. Same-byte symlink or file replacement is rejected. Git reads prohibit lazy-fetch transport; missing promisor blobs fail instead of fetching. No reset, checkout mutation, rebase or financial state is used.

Before any injected external operation, local approval/source/reference validation must pass. The complete run-history result must then contain exactly one eligible manual attempt: this run. Partial pagination, a previous run, a rerun or another candidate prevents provider access. No automatic retry or second-session rollover exists.

Static approval/reference inputs are pinned byte-for-byte. Future observations are not falsely pre-hashed: every source event batch is retained verbatim with its observation clock/hash inside the encrypted checkpoint. The original event IDs, source clocks and revisions are not manufactured. Missing or malformed native rows remain research rejections; unknown identity remains research-only. The source capture clock remains separate from actual guard-input ingestion; metadata availability is never backdated to an earlier owner/source download. Both clocks survive recovery. Source handoff occurs before quotes; late forwarding cannot select prior captured entries.

## Reference provenance, not a URL-shaped assertion

`paper-capture-references.mjs` verifies the exact six-record package and owner-reviewed hashes of each original Massive, Alpaca and SEC response, official endpoint mapping, HTTP outcome, acquisition/review/validity clocks, CIK equality, class FIGI, UUID/exchange mapping, SIC agreement and separately pinned current ZAD state. Explicit source error is `REFERENCE_SOURCE_FAILURE`; warrant/inactive status is an instrument exclusion; missing/contradictory identity or ZAD stays UNKNOWN/research-only. None becomes an approved BUY. Duplicate/conflicting review records or stale/future provenance blocks preparation.

An owner review digest is a dependency, not something software can invent. Hashes and declared URLs cannot prove an official download occurred or establish account entitlements. The real source evidence/independent provenance review remains required. No170-mark/P2/privacy/ZAD-policy migration is included.

## Acknowledgement and bounds

Every cycle seals original approval/reference/source bytes and the capture state with AES-256-GCM, bound to source SHA, approval/reference hashes, run ID, CALIBRATION, sequence and chain. The file is created exclusively; existing output is never overwritten. Plain checkpoint≤8MiB, each sealed/archive object≤16MiB, cumulative sealed bytes≤160MiB and acknowledged archive bytes≤164MiB. At most41upload invocations, retention3days. Provider attempts remain41, serial,≤2/rolling minute,65,536bytes/response,10second timeout, no retries/fallback. Reference acquisition remains a separate unapproved scope.

The next provider request requires a successful bounded upload receipt with unique artifact ID, archive SHA/size, exact file SHA/size and retention. Refusal, uncertainty, mismatched metadata, interruption, failed write or cap stops collection, retaining any completed encrypted local file. Receipt output is a fixed field list; arbitrary client-response properties are never persisted. Acknowledged upload is not independent proof that downloaded bytes are correct: recovery checks that separately.

`paper-capture-ports.mjs` supplies tested adapters for the fixed SIP GET, complete bounded GitHub history read, immutable existing-event file and Actions artifact-client method/response shape. Every external client is injected and mocked in tests. The wrapper caps invocation count and unique retained bytes. An actual SDK's internal wire retries/service behavior are not claimed observed; these must be reconciled before activation. No financial-provider request was made during development.

## Actual archive recovery

`tools/recover-paper-capture.mjs` verifies a pinned receipt manifest and each downloaded ZIP digest, exactly one expected file, names/size/CRC/format, file hash, encryption tag/context, original input pins and contiguous state/source-event chain before creating any plaintext output. Original approval/reference bytes and every original source batch are restored, not merely normalized quote summaries. Stored and deflated ZIPs, including streamed data descriptors, are tested. ZIP64, extra files, symlinks, traversal and unsupported archive variants fail closed; no blanket GitHub-format compatibility is claimed before the actual service calibration. There is no archive extraction to arbitrary paths.

A40-frame authenticated prefix is **AUTHENTICATED_INCOMPLETE**, never complete confirmation. A bad or missing acknowledged archive causes failure with no plaintext output; it is not silently skipped. Original archives/receipts are unchanged. New output must not exist. Real recovery accepts a key only through a hidden local TTY, never argv/environment/chat. All tests use the public fixture key. Device-specific recovery and an actual newly uploaded artifact remain unobserved; this is not the old key-proof marker format.

Hard runner loss can lose a file before sealing/upload. Unacknowledged local ciphertext needs the retained file and a separately reviewed quarantine procedure; it is not automatically admitted or resumed. No automatic restart of an interrupted approved session is authorized. Frozen protocols/results and the original zero-admission artifact audit remain unchanged.

## Reproduce without credentials or external calls

```sh
node test/paper-capture-wrapper.test.mjs
node test/paper-capture-ports.test.mjs
node test/prospective-paper-capture.test.mjs
node test/prospective-capture-package.test.mjs
```

Wrapper tests use the actual guarded caller, temporary source/workflow Git commits, raw source responses, mocked41-cycle provider/upload runs, actual command-line entry points and downloaded ZIPs. The Python ZIP generator uses standard-library files rather than stdin; CLI tests use bounded regular-file output because this execution sandbox returned `spawnSync node EPERM`/lost pipe output. No assertion or case was skipped. Interrupted and failing local logs are preserved under `/workspace/milestones/paper-capture`; earlier local preservation commits/tags were explicitly UNVERIFIED.

## Remaining external decisions

| Dependency | Exact remaining evidence |
|---|---|
| Latest feed | Official account-specific latest SIP snapshot/size/bar/quote-condition rights, rate/batch allocation and encrypted storage/retention terms for these six names; no inference from a few HTTP200s. Massive prices remain15-minute delayed. |
| Reference provenance | Actual reviewed current raw class/FIGI/CIK/SIC/exchange responses and current unchanged ZAD for each name. Existing SEC exports are required; if absent, any new SEC acquisition needs a separately bounded proposal, not an uncounted request. |
| Native event evidence | Original contemporaneous first-ingestion, discovery and accession/revision envelope from the existing stream. Legacy rows missing these are retained, not backfilled. The mock contract does not certify today's production producer supplies them. |
| Recovery/service | Owner ability to authenticate this actual uploaded format with the existing research key, allowed artifact access/quota, and real service receipt/ZIP behavior. No real-key test or service request is authorized now. |
| Owner | Focused independent review, then exact dated scope/rights/input/activation approval.5November remains a proposal, not agreed; lapse if prerequisites miss4November18:00UTC. Calibration never becomes untouched confirmation; evaluation needs separately frozen rules/gates/dates. |

The rehearsal components above are tested. Native producer and live-host/client integration remain implementation work; the current [native SEC package](native-sec-event-integration.md) records what is implemented offline and what is still missing. No active workflow or live host binding is installed. Calibration readiness remains **NOT ESTABLISHED**, acceptance24/40 and genuine admissions0. LEADER DIP is NOT PROVEN; rejected-strategy adapters remain paused. Watcher/DST evidence still needs naturally scheduled observations. This package neither proves profitable trading nor authorizes collection.


Current request authority: [canonical budget](validation/paper-capture-request-budget.json). Reference preparation≤18 (separate approval), capture≤41 (separate approval), combined≤59 additional source HTTP requests; shadow tee adds0. Existing watcher traffic and bounded GitHub control-plane invocations are separate, not hidden inside59. Earlier53/12-reference figures omitted the six SEC reference responses and are superseded. No phase is authorized.
