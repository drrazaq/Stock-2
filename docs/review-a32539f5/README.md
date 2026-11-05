# Focused review of `a32539f533b89d789822c0896a7ea3dfa2ef410f` (L1–L4: enrolled authority, durable signed requests, native importer)

Reviewer: the Claude session, 5 Nov 2026, offline only.
- **Not done:** no setup, credentials, provider calls, collection, activation or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** `2c9f4186..a32539f5` (`56960fd4`, `a32539f5`).
- Saturday's approved STOP-plus-D maintenance is unaffected.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **L1 (mandatory recovery authority)** | **RESOLVED.** A non-synthetic INIT without an authority is refused. A store created by the frozen 2c9 module (retained, no authority) opens read-only: only HEAD, RECOVERY_VIEW and GENERATION_ATTEMPT work. It cannot be re-initialized to add an authority. |
| **L2 (durable signed request)** | **RESOLVED.** Non-synthetic stores refuse an inline-only signature. The signed bytes must come from a private 0600 single-link file whose hash is pinned. The request is archived before any generation mutation. At every torn stage, **with the original request deleted**, `resumeClaim` completes from the archive. Torn DISPOSE also completes, leaving 1 permanent UNRESOLVED record. A tampered archive is refused. |
| **Stale-writer fencing** | **PASS.** Old token during a transition: `GENERATION_TRANSITION_PENDING`. After it: `STALE_FENCE`. A conflicting takeover gets `GENERATION_ATTEMPT_CONFLICT` at every stage. Replaying the same authorization gets `CONTROL_CAS_FAILED`. The importer with a stale token gets `STALE_FENCE` and copies nothing. |
| **L3 (native original → importer → evaluator → paper card → outcome)** | **PASS offline.** `importNativeAEvidence` and its CLI are now the non-test callers. Evaluations still run only through the store's strict `EVALUATE`. There is still no production caller, by design. |
| **L4 (close identity)** | **RESOLVED under the supplied review.** Each close binds its own FIGI/CIK/provider-asset identity originals. A close bound to a different identity is UNKNOWN. |
| **UNKNOWN propagation** | **PASS.** All 27 negative importer probes give UNKNOWN for status, paper card and outcome, with `allowBuy:false`. |
| **Synthetic never presented as authenticated** | **PASS for wording**, with finding N2: every output says `sourceAuthentication: NOT_INDEPENDENTLY_ESTABLISHED` and RESEARCH / PAPER ONLY. But the `synthetic:false` label can be produced from invented bytes. |
| **New findings** | **N1** (Low–Medium, liveness): retrying the importer can't resume an interruption after its first append. **N2** (Medium, labelling): a synthetic fixture relabelled as retained research is accepted. **N3** (Low): a planted request file blocks the store. All three fail closed. |
| **Acceptance rows** | **None meets its complete closure criteria.** 24 accepted / 16 OPEN unchanged; 0 genuine admissions. |
| **Prior passes** | Preserved. See the test table. |

## Executed

**Tests (Node 20), all passing** (`tests.txt`):

| File | Result |
|---|---|
| a-fenced-recovery | 63/63 |
| a-native-evidence-importer | 20/20 |
| a-native-importer-package | 2/2 |
| a-native-source-package | 2/2 |
| a-fenced-store | 12/12 |
| a-native-source-join | 24/24 |
| a-close-source | 20/20 |
| a-authenticated-collector | 38/38 |
| a-evidence-contract | 35/35 |
| a-independent-coverage | 32/32 |
| a-recovery-copy | 17/17 |
| a-pathway-review-regressions | 13/13 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |

**Independent probes** (`probes/`, outputs saved). They run against the actual worker processes and the actual importer. `fx.mjs` is a copy of the repository fixture with origin and provenance made settable.

### Store: L1, L2 and fencing (`store-probes`, `plant-resume`)

| Probe | Result |
|---|---|
| Retained INIT without an authority | `RECOVERY_AUTHORITY_ENROLLMENT_REQUIRED` |
| **Previous-version store** (created by the frozen `a-fenced-store-2c9.source`, retained, no authority), opened with the new module | HEAD, view and attempt work. Append, lookup, claim and evaluate all give `RECOVERY_AUTHORITY_ENROLLMENT_REQUIRED`. Re-initializing to add an authority is refused. |
| Non-synthetic claim with an inline signature only | `DURABLE_SIGNED_REQUEST_REQUIRED` |
| Source file mode 0644 | `UNSAFE_SIGNED_REQUEST_SOURCE` |
| Wrong pinned hash | `SIGNED_REQUEST_SOURCE_CHANGED` |
| Inline signature disagrees with the source | `SIGNED_REQUEST_SOURCE_CONFLICT` |
| Fault injection on a non-synthetic store | `FAULT_INJECTION_REFUSED` |
| Valid claim | Generation 2. Old token gets `STALE_FENCE`; replaying the same request gets `CONTROL_CAS_FAILED`. |
| **Torn at AFTER_REQUEST_ARCHIVE, DURING_ATTEMPT_WRITE, AFTER_CLAIM_ATTEMPT, AFTER_GENERATION, BEFORE_HEAD and AFTER_SWITCH_WRITE, with the original request deleted** | Discovery gives `RECORDED_REQUEST` or `RECORDED`. Old token: `GENERATION_TRANSITION_PENDING`. A signed conflicting takeover: `GENERATION_ATTEMPT_CONFLICT`. `resumeClaim` with the pin completes generation 2. Old token afterwards: `STALE_FENCE`. (This closes the 2c9 L2 gap.) |
| Torn DISPOSE with a lost-body intent, original request deleted | Resume gives generation 2 with 1 UNRESOLVED record. No bytes are invented. |
| Archived request edited after the crash | `RECOVERY_AUTH_SIGNATURE_INVALID` on discovery and on resume |
| Planted unsigned or bad-signature request file (N3) | It can't take over: `DURABLE_SIGNED_REQUEST_REQUIRED` or `RECOVERY_AUTH_CONTEXT_MISMATCH`. But it blocks appends (`GENERATION_TRANSITION_PENDING`), and both a legitimate signed claim and DISPOSE get `GENERATION_ATTEMPT_CONFLICT`. Only deleting the file by hand, with no authorization, unblocks the store. |

### Importer: native original to outcome (`imp-probes`, `resume-probes`)

Baselines: the synthetic win and loss cases give `OFFLINE_RESEARCH_ONLY`, a paper card and `MODELED_PAPER_ECONOMICS_ONLY`, with `synthetic:true`, `NOT_INDEPENDENTLY_ESTABLISHED` and `allowBuy:false`.

Every case below gives UNKNOWN (status, card and outcome):

| Class | Probe | Reason |
|---|---|---|
| Identity | Massive CIK differs from SEC | `IDENTITY_SOURCE_ROUTE_UNKNOWN` |
| Identity | FIGI differs | `IDENTITY_REFERENCE_CONFLICT` |
| Identity | Alpaca exchange differs | `IDENTITY_INSTRUMENT_UNKNOWN` |
| Identity | Alpaca symbol differs | `IDENTITY_REFERENCE_CONFLICT` |
| Identity | Review window expired | `IDENTITY_NOT_KNOWN_OR_VALID` |
| Identity | One close bound to a non-tradable identity | `IDENTITY_INSTRUMENT_UNKNOWN` |
| Omitted or conflicting | Close binding removed | `NATIVE_CLOSE_COVERAGE_MISMATCH` |
| Omitted or conflicting | Duplicate close binding | `NATIVE_CLOSE_BINDING_MISSING_OR_DUPLICATE` |
| Omitted or conflicting | Close removed from both tape and binding | `MISSING_OR_DUPLICATE_CLOSES` |
| Omitted or conflicting | Exit quotes removed | `NATIVE_EXIT_QUOTE_SET_MISMATCH` |
| Omitted or conflicting | **Exit slot narrowed to hide the adverse quote** (re-signed tape and witness) | `QUOTE_OUTSIDE_WINDOW_OR_FUTURE` |
| Omitted or conflicting | Entry quote, finality review or archive removed | `UNTRUSTED_RECEIPT`, `UNTRUSTED_RECEIPT`, `ORIGINAL_REFERENCE_REQUIRED` |
| Omitted or conflicting | Tape close price changed | `NATIVE_CLOSE_PRICE_CLOCK_OR_BASIS_MISMATCH` |
| Omitted or conflicting | Close contract marked adopted | `CLOSE_SOURCE_CONTRACT_REQUIRED` |
| Omitted or conflicting | CAPTURE and WITNESS share a hostId | `INDEPENDENT_HOST_CONTEXT_REQUIRED` |
| Clocks | Primary observedAt shifted by 1 s | `PRIMARY_INPUT_CLOCK_OR_BYTES_MISMATCH` |
| Clocks | publishedAt set to the Atom `updated` time | `PRIMARY_INPUT_CLOCK_OR_BYTES_MISMATCH` |
| Clocks | Close received before the session close | `NATIVE_RESPONSE_RECEIPT_MISMATCH` |
| Clocks | Entry quote clock without a zone | `NATIVE_RESPONSE_UNKNOWN` |
| Clocks | Provenance review after asOf | `NATIVE_PROVENANCE_REQUIRED` |
| Clocks | Close finality after availableAt | `CLOSE_FINALITY_EVIDENCE_REQUIRED` |
| Origin | `SYNTHETIC_FIXTURE` archive in a retained store | `NATIVE_ORIGIN_MISMATCH` |
| Origin | `DECLARED_UNAUDITED_NATIVE` archive in a synthetic store | `NATIVE_ORIGIN_MISMATCH` |
| Origin | Provenance review origin mismatch | `NATIVE_PROVENANCE_REQUIRED` |
| Origin | Request store label mismatch | `NATIVE_IMPORT_ORIGIN_MISMATCH` |

**Interrupted writes** (SIGKILL in the store worker, then the store is reopened):

| Interruption | First run | Exact importer retry | What actually recovers it |
|---|---|---|---|
| First original append, AFTER_INTENT | UNKNOWN | **completes** | — |
| Append #2, AFTER_COMMIT | UNKNOWN | **completes** | — |
| Append #2, AFTER_RECORD | UNKNOWN | **`PENDING_INTENT_REQUIRES_RECOVERY`** | `store.recover(token)`, then the importer completes |
| Append #2 or #5, AFTER_INTENT | UNKNOWN | **`PENDING_INTENT_REQUIRES_RECOVERY`** | `recover` gives `PENDING_ORIGINAL_UNAVAILABLE`. Only a manual, exact single `append` of the pending item recovers it; then the importer completes. |
| EVALUATE, AFTER_INTENT | UNKNOWN | **`PENDING_INTENT_REQUIRES_RECOVERY`** | `store.recover(token)` re-runs the strict evaluation, then the importer completes |

Every original byte was preserved in every case. No interruption produced a card or outcome.

## Findings

| # | Severity | Finding | Suggested remedy |
|---|---|---|---|
| **N1** | Low–Medium (liveness and procedure; fails closed) | **Exact importer retry resumes only an interruption of the *first* append (or one at AFTER_COMMIT).** The worker's `APPEND` checks for pending intents *before* its committed-record shortcut. So when the retry re-appends originals that are already committed while a later intent is pending, it is refused. The existing regression covers only the first append. `resumption-procedure.md` step 7 ("Exact same pinned import request/originals may retry an append to recover its identical intent") is therefore true only for that case. The CLI exposes neither `recover` nor a single exact append. An operator following the procedure may conclude the bytes are missing and use the authorized UNRESOLVED disposal, which **permanently** makes the whole store `UNRESOLVED_STORE_EVIDENCE`. | In the worker: return the idempotent result for an already-committed identical record before the pending-intent check. Or, in the importer: when resuming, first finish the pending intent that matches this request's (logicalId, recordHash) and call `recover` for record-stage and EVALUATION intents. Add regressions for append #2 at AFTER_INTENT and AFTER_RECORD, and for EVALUATE at AFTER_INTENT. Correct step 7. |
| **N2** | Medium (labelling; not a BUY path) | **`synthetic:false` can be produced from invented bytes.** Take the repository's own synthetic fixture (test keys, roots and collectors named `SYNTHETIC_*`, hostIds `SYNTHETIC_HOST_*`). Label its native run `DECLARED_UNAUDITED_NATIVE`, its provenance review `RETAINED_RESEARCH`, and use an enrolled retained store. It returns `OFFLINE_RESEARCH_ONLY` with a paper card and a modeled outcome, `origin:RETAINED_RESEARCH`, `synthetic:false`. The output still says `NOT_INDEPENDENTLY_ESTABLISHED`, RESEARCH / PAPER ONLY and `allowBuy:false`, so it is **not** presented as authenticated collection. But "retained" versus "synthetic" is self-declared under caller-supplied keys. | Refuse RETAINED_RESEARCH when any trust root, collector, host or authority ID carries a `SYNTHETIC` marker. Pin the allowed retained trust roots by fingerprint in a reviewed, separately approved contract. The real remedy is external: genuinely distinct trust roots with key custody. |
| **N3** | Low (liveness; needs local write access, inside the K3 host boundary) | Any parseable `claim-request-*` or `takeover-request-*` file whose expected head matches blocks the store. It can't take over. But no **authorized** operation can retire it: claim and DISPOSE both get `GENERATION_ATTEMPT_CONFLICT`. The only exit is deleting the file by hand, without authorization, which the procedure forbids ("no deletion"). | Count only requests whose signature verifies (or an unsigned first-generation claim) as reservations. Let an authorized DISPOSE retain and retire an unverifiable request as UNRESOLVED residue. |
| N4 | Info | Previous-version retained stores without an authority are now permanently read-only. Even `lookup` is refused, and there is no migration path ("blocked for separate review"). This fails safe; any such store needs an explicit, reviewed copy-out into an enrolled store. | Keep it as a documented precondition. Reading lookups could be allowed read-only. |

## 1. Completed offline integration

- Mandatory recovery authority for every non-synthetic store. Previous-version stores without one are fenced to read-only.
- A durable, pinned, privately stored signed request, archived before any generation mutation. Exact resumption from the archive at every torn stage. Conflicting takeover refused. Tamper detected. 2c9-format hash pins honoured.
- Stale-writer rejection in the store and the importer.
- One inactive local path from native originals to the paper card and modeled outcome:
  - SEC submissions, acceptance and primary originals;
  - explicit Massive, Alpaca and SEC identity originals plus a review;
  - native SIP quote originals for entry and the full exit set;
  - native close originals with per-close identity and finality review;
  - the fenced store, the strict evaluator, the existing paper card and a deterministic close/BBO outcome.
- Persistent conflicts survive reversion. Origin is cross-checked between store, request, dataset, archive and provenance.
- UNKNOWN propagates through status, card and outcome for every probed omission, conflict, identity mismatch and invalid clock.

## 2. Remaining work

**Engineering (inside the repository):**
- N1: importer resume after a later append or EVALUATE is interrupted, plus procedure step 7.
- N2: refuse SYNTHETIC-marked roots or hosts in retained stores, and pin retained roots by fingerprint.
- N3: retire an unverifiable reservation by authorized DISPOSE.
- N4: a reviewed copy-out for rootless previous-version stores, if any exist.
- A live acquisition client through the reviewed ports (SEC, close source, SIP) and a collector-to-importer handoff. All inputs today are local files.

**External authorization dependencies (cannot be closed by code):**
- Genuinely distinct trust roots and recovery authority with key custody.
- Physically independent CAPTURE and WITNESS hosts.
- A private host, binding and custody.
- An authenticated stop or fence of legacy writers.
- Provider semantics and rights:
  - an official close versus the aggregate bar, and its finality;
  - SIP completeness;
  - Massive and Alpaca reference terms.
- An adopted A policy and cohort, controls and population, plus an owner ZAD policy.
- Owner approval for any setup or activation.

## 3. Acceptance rows

| Row | Status |
|---|---|
| A3, A4, A5, A7 | OPEN |
| CATALYST-03, CATALYST-04 | OPEN |
| MARKET-03 | OPEN |
| HISTORY-02, HISTORY-04 | OPEN |
| REPO-03, ACTIONS-04, EXEC-03 | OPEN |

**No row meets its complete closure criteria.** Every positive result rests on synthetic originals under supplied test keys. 24 accepted / 16 OPEN unchanged, 0 genuine admissions, in agreement with the checkpoint's own board.
