# Focused review of `572dc5aeacb1f10d4590123432e4203cd0d347e2` (A collector, fenced store, setup-only request)

Reviewer: the Claude session, 5 Nov 2026, offline only.
- **Not done:** no setup, bindings, runs, collection or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** delta `303ec230..572dc5ae` (6 commits). Saturday's approved maintenance is unaffected.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **Offline engineering** (`a-sip-window-client.mjs`, `a-authenticated-collector.mjs`, `a-fenced-store.mjs`) | **PASS WITH FINDINGS.** The protocol, request reservation, revision conflicts, fencing and strict-evaluator gate behave as claimed. K1 (medium) and K2 (low) concern recovery liveness, not safety; both fail closed. |
| **Authenticated integration** | **MISSING, as Codex states.** No native SEC-response join, no close-source client (so no real outcome can be complete), no real trust roots or independent acquisition, no private host, binding or custody. |
| **Setup-only approval request** (`bbc8420b…`) | **PASS for setup-only.** The repository's existence and access are **UNVERIFIED** (metadata 404) and quota is **UNVERIFIED**. The request correctly makes both owner-verified preconditions with stop-before-mutation, and adds no bindings and no run. |
| **Acceptance rows** | **None meets its complete closure criteria.** 24 accepted / 16 OPEN unchanged. |
| **Prior passes** | Preserved. A1/A2/A6 regressions 13/13; F1–F3 contract 35/35 and coverage 32/32; H1–H6 untouched. |

## Executed

**Tests (Node 20):**

| File | Result |
|---|---|
| a-fenced-store | 12/12 (real child processes, real `flock`, SIGKILL at intent, record and commit) |
| a-authenticated-collector | 38/38 |
| a-evidence-contract | 35/35 |
| a-independent-coverage | 32/32 |
| a-recovery-copy | 17/17 |
| a-pathway-review-regressions | 13/13 |
| catalyst-reclaim-prototype | 20/20 |
| reclaim-research-workflow | 46/46 |
| a-catalyst-reclaim-store | 27/27 |

**Independent probes** (`probes/fenced-store-probes.mjs`, output saved) against the actual `createAFencedStore` worker processes:

| Probe | Result |
|---|---|
| **Request-intent recovery, body lost:** append killed after its intent, original bytes never retained | `WRITE_OUTCOME_UNKNOWN`; `recover` → `PENDING_ORIGINAL_UNAVAILABLE`; new `claim` → `PENDING_INTENT_REQUIRES_RECOVERY`; **other appends under the old generation still succeed**; 2 pending intents remain. |
| **Interrupted CLAIM residue:** `generation-2.json` written, HEAD not moved | A different claim → `IMMUTABLE_RECORD_CONFLICT`; only an **identical-parameter retry** succeeds. |
| **Generation fencing** | A stale token's append and recover → `STALE_FENCE`; the new generation succeeds. The token is **derivable by anyone from `HEAD`**. |
| **Revision conflicts** | A pending intent with a different payload → `IMMUTABLE_RECORD_CONFLICT`; the same payload completes; a committed different payload → `LOGICAL_RECORD_CONFLICT`; different original bytes under the same ID → `LOGICAL_RECORD_CONFLICT`. |
| **Evaluator gate** | A generic `EVALUATION` append → `STRICT_EVALUATOR_REQUIRED`. Evaluations only come through `EVALUATE`, which runs the unchanged `runAEvidenceDataset` on content-addressed originals inside the same serialized worker. |

**Code review of evaluator integration:**
- The collector's frame output (`slotId/start/end/status/transportComplete/nextPage/receivedAt/recordCount/original` and the `A_INDEPENDENT_FRAME_V1` original with native-clock BBO records, `observedAt` = system receipt, `sourceDelayMs` 0) matches the witness schema that `verifyIndependentCoverage` checks.
- A **real** collection still can't verify end to end. The coverage plan needs CLOSE slots, and there is no close-source client. The positive evaluator test uses labelled synthetic fixtures.
- **Evidence completeness:** a SIP window is COMPLETE only when subscribed before the start and continuous to the end. That means continuity of this subscriber, not a provider no-loss guarantee, because Alpaca quotes carry no sequence numbers. The historical REST frame can't be COMPLETE: the request starts after the slot end and the response must arrive by the slot end. This is intended; it is research only.

## Findings

| # | Severity | Finding | Suggested remedy |
|---|---|---|---|
| **K1** | Medium (liveness; fails closed) | If an intent's original body is lost (the collector died before persisting it), the intent can never be recovered. **No new generation can ever be claimed.** The only way forward is to keep writing with the old generation's token, which anyone can derive from `HEAD`. That defeats the purpose of fencing in exactly the failure case it exists for. | Add a reviewed terminal disposition. A newly authorized owner, under a recorded boundary, retains the intent unchanged, writes an immutable `INTENT_UNRESOLVED` record for that logical ID (never inventing bytes; the evaluator treats it as UNKNOWN), and then may claim. |
| **K2** | Low | An interrupted CLAIM leaves `generation-N.json` without moving HEAD. Any later claim with different owner/at/boundary parameters is refused permanently; only an exact retry works. | Record the claim request before writing, so recovery can replay it, or treat an unreferenced generation file with the expected `previous` as retryable residue. Document the operator step either way. |
| K3 | Info | The fencing token is not a credential. Protection against non-cooperating local processes is the 0700 directory, `flock` and the host boundary, as the README says. | Keep the host boundary as a deployment precondition. |
| K4 | Info | SIP "COMPLETE" means subscriber continuity only (no provider sequence numbers). | Keep it among the H6/provider questions. |

## Completed offline engineering versus missing authenticated integration

**Completed offline:**
- bounded SIP protocol client with original bytes and receipt clocks;
- durable request reservation before transport (an unresolved earlier request gives INCOMPLETE, never a redial);
- persistent revision conflicts;
- registered role signers;
- `flock`-serialized, generation-CAS store with immutable intents, records and commits;
- SIGKILL recovery;
- strict-evaluator-only evaluations.

**Missing (engineering plus external):**
- native SEC-response context for primary originals;
- a close-source client and contract;
- four genuinely distinct trust roots with key custody, and **physically independent** CAPTURE and WITNESS acquisition;
- private host, binding, permissions and custody;
- an authenticated stop or fence of legacy and external writers;
- official provider semantics and rights;
- an adopted A policy and cohort, controls and population.

## Rows

| Row | Status |
|---|---|
| A3, A4, A5, A7 | OPEN |
| CATALYST-03, CATALYST-04 | OPEN |
| HISTORY-02, HISTORY-04 | OPEN |
| REPO-03, ACTIONS-04, MARKET-03, EXEC-03 | OPEN |

Engineering advanced on several rows; no row has its complete closure evidence. **No row closes.**
