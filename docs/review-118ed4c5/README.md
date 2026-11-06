# Focused review of `118ed4c5a5c1db11ebb154afa0b326a1b9200d7f` (source acquisition bridge; B retired, C stopped)

Reviewer: the Claude session, 6 Nov 2026, offline only.
- **Not done:** no provider calls, collection, setup or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** base `3641a8e8`; requested in PR #1 comment 6679478895.
- Saturday's approved STOP-plus-D maintenance is unaffected.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **Bounded response acquisition** (client) | **PASS.** The route allowlist, no default transport, caps, deadlines, timeout, stopping after a non-200 response and no retries all hold. 16 independent probes. |
| **Durable originals and interruption recovery** | **PASS, with finding P1.** Raw bytes are saved before signing, restarts reuse records without refetching, and an unknown request outcome blocks redial. **But a response received at a moment when another process holds the store lock is discarded** (see P1). |
| **Strict-importer integration** | **PASS offline.** The non-test runner calls the real `importNativeAEvidence`, then the strict evaluator, card and outcome. It is a **retained-response replay only, not first capture** (G2). |
| **Two-process request budget** | **PASS.** 8 free-running races of 4 real processes each, without the test's barrier: always 22 GETs for a 22-request plan, at most 1 per item, and 0 extra GETs on re-run. In one race my probe also caught P1 occurring naturally. |
| **N1–N4, L1–L4 and earlier passes** | **Preserved.** 22 files, 482/482 tests. My N1, N3, store and 27-control importer probes reproduce identically to my 3641 review. |
| **N4 inventory** | **Accepted.** 0 store files were found in the inspected namespace, and the package explicitly says global absence is NOT ESTABLISHED. That is an honest scope statement. |
| **B retired** | **Consistent with retained evidence.** |
| **C stopped** | **Consistent with retained evidence.** |
| **Alternatives comparison** | **One materially distinct, feasible omission** (avoidance warnings). This is a recommendation, not a required replacement. |
| **Acceptance rows** | **None meets its complete closure criteria.** 24/40, 16 OPEN, 0 genuine admissions. |

## Tests (`tests.txt`, Node 20)

| File | Result |
|---|---|
| a-source-acquisition-bridge | 32/32 |
| review-ad3837-disposition | 4/4 |
| review-ad3837-package | 2/2 |
| bc-research-rehearsal | 33/33 |
| importer matrix | 11/11 |
| N regressions | 27/27 |
| a-n-bc-package | 2/2 |
| a-fenced-recovery | 63/63 |
| native importer | 20/20 |
| packages | 2/2 + 2/2 |
| fenced store | 12/12 |
| native join | 24/24 |
| close source | 20/20 |
| collector | 38/38 |
| contract | 35/35 |
| coverage | 32/32 |
| recovery-copy | 17/17 |
| A1/A2/A6 | 13/13 |
| catalyst prototype | 20/20 |
| workflow | 46/46 |
| catalyst store | 27/27 |

## Independent probes (`probes/`)

### Bounded client (`client-probe`)

These were all refused **before** any fetch:
- a credential query parameter;
- `http:`;
- a non-allowlisted host;
- `feed=iex`;
- the `/v2/orders` route;
- userinfo in the URL;
- a start before notBefore or after the deadline;
- a 3rd request on a 2-request budget;
- a `requests:33` limit;
- no explicit transport.

These were fetched once and returned UNKNOWN:
- a redirect flag;
- a responseUrl mismatch;
- a body over the cap;
- a timeout.

After an HTTP 429, the next request was refused. Only 8 fetcher calls happened in total, all from the accepted cases.

### Two-process race (`race-probe`, `racer`)

I wrote my own racers with no barrier and no store wrapping: 4 processes start at the same instant and retry `WRITER_BUSY`.

| Run | Racers | GETs | Planned maximum | Most GETs on one item | Extra GETs on re-run |
|---|---|---|---|---|---|
| Short retry, 4 trials | 4 | 22 | 22 | 1 | 0 |
| Persistent retry, trials 1–3 | 4 | 22 | 22 | 1 | 0 |
| Persistent retry, **trial 0** | 4 | **1** | 22 | 1 | 0 |

In trial 0 the item became `ACQUISITION_REQUEST_OUTCOME_UNKNOWN`. That is P1 occurring naturally.

The budget never exceeded the plan. The reservation-then-fetch rule holds across real processes.

### P1 reproduction (`busy-probe`)

1. The CAPTURE client fetches item 3 successfully.
2. An external `flock -x` (standing in for any other store operation, including a read-only `head()` or `lookup`) holds the lock for 2 s.
3. The raw-envelope append then fails with `WRITER_BUSY`, and the whole run returns UNKNOWN.
4. After the lock is released, an exact re-run returns `ACQUISITION_REQUEST_OUTCOME_UNKNOWN` with no new GET.
5. Only **2 raw files** are retained in the CAPTURE store. The third body, already received, was **never persisted**.

## Findings

| # | Severity | Finding | Remedy |
|---|---|---|---|
| **P1** | **Medium–High for live first capture** (fails closed; irreplaceable evidence loss) | After a successful GET, `acquire` writes the raw envelope with a single `appendImport`. The store invokes a **non-blocking** `flock` and refuses with `WRITER_BUSY`, which is a definitive "not started". The bridge does not retry, and keeps the received bytes only in memory. The durable REQUEST reservation then makes the item permanently `ACQUISITION_REQUEST_OUTCOME_UNKNOWN`, by design with no redial. So any concurrent store operation at the wrong millisecond destroys a real first-capture original: a second process, an operator's read-only status check, or export. The same applies to the `:PARTIAL` write. In replay mode this is harmless; in live first capture the original is gone. | Retry `WRITER_BUSY` (definitive not-started) with bounded backoff for post-fetch persistence of ENVELOPE, PARTIAL and RESPONSE. Spool the received bytes first to a private 0600 single-link file in the role's own directory, so a crash or busy store cannot lose them. Consider a blocking lock with a timeout for writer operations, and lock-free read-only views. Add a regression with an external `flock` held across the post-GET write. |

## Exact first-capture integration gaps (implementation, not credentials)

| # | Gap | Why the current bridge can't do it |
|---|---|---|
| **G1** | P1 above | A received original can be discarded under lock contention. |
| **G2** | **The data flow is inverted.** A producer must build the native dataset and bindings from newly acquired responses: archive, identity review, primary, entry quote, closes, tape and witness frames. | Today the plan is derived from **already-retained originals**: `notBefore` = original `requestStartedAt`; deadlines = `asOf`, the next open or slot end. CAPTURE must equal the original **byte for byte and clock for clock**, so it can only re-confirm data that already exists. |
| **G3** | **Plan clocks must come from the protocol, published before the event** (event receipt, slot boundaries), with immutable publication evidence. | `createdAt` and matching signatures do not prove pre-registration (correctly disclosed). |
| **G4** | **WITNESS comparison by resource type.** | Byte equality is right for immutable resources (Archives documents, fixed-range historical quotes/bars). Live **mutable** resources (submissions JSON, the Atom feed, asset status) will legitimately differ between two fetches seconds apart, and today that gives `INDEPENDENT_RESPONSE_CONFLICT`. It needs a declared per-resource rule, for example the matching accession row or field-level equality. |
| **G5** | **Exit and close windows need the streaming SIP collector** (`a-authenticated-collector`) wired into the importer. | A REST quote request for a slot can't be received by `slot.end` (deadline = `slot.end`). That collector exists but is not wired. |
| **G6** | **Separate role processes.** | The runner drives CAPTURE and WITNESS from one process (the `contexts` array). Real separation needs each role in its own execution context writing its own store, plus a reviewed merge or verification step. Only the race test uses separate processes. |
| **G7** | **Live event detection.** | Atom/submissions first-observation (`native-sec-events`) is not connected to plan creation. REVIEW-role identity and provenance signing, and the owner's ZAD attestation, must fit inside the entry deadline. That is a latency and operator dependency not yet measured. |
| **G8** | **A global budget.** | The budget is per plan (≤32 per role). There is no per-day or per-provider ceiling across plans. That is acceptable while inactive, and needed before activation. |

**External dependencies, unchanged:**
- distinct trust roots and custody;
- separate execution and write contexts;
- provider semantics and rights (quote units and conditions, empty responses, as-of, close finality, retention);
- private host and setup;
- A policy (close source, ZAD validity) and a frozen cohort and budget.

## B and C dispositions: checked against retained evidence

The pins in `retained-comparison.json` (13 files) match the tree.

**B (retired):**
- A-ORB1 is REJECTED: −0.84% per trade after 0.8% cost over 4,007 trades, own-stock t −29.
- EVENT_ORB_RETEST_15D is REJECTED.
- B offered only threshold, range and cost differences over these relatives, and no information mechanism. **Retirement follows the evidence.** No cheaper costs or easier controls were substituted.

**C (stopped):**
- `data/squad11-lab.json` firstRun for SQ11-PB12 is NOT PROVEN. Own-stock excess (vsOwn) −10.39% older and −11.02% newer; block t 1.24 and 0.54 (latest 0.42).
- Note: PB12 **did** beat the average stock (older edge +8.6%, day t 3.3). The decisive failure is that the **same leaders did better on their other days**: pullback timing added nothing over simply holding the leaders.
- **Stopping follows the evidence.** The finite bug-audit condition (only with recovered original archives and a concrete defect) is appropriate.
- It also means C's information is already captured by the existing large-cap momentum evidence (CLAUDE.md §5), so **no new C-like study is warranted**.

**Lane separation:** no rule was edited, the dispositions are hash-pinned, and the B/C CLI and persistence refuse with `BC_DESIGN_RETIRED_OR_STOPPED`. The LEADER DIP lane is explicitly unaffected.

## Alternatives comparison: one omission (recommendation only)

The comparison considered only **entry** hypotheses: earnings drift, regulatory decisions, and customer→supplier. It omitted the repository's **strongest retained evidence**, which is **avoidance warnings**. In `data/squad29-lab.json`:
- **delisting notices (F6):** mean 5-session return about −30%, block t −16.4 and −13.9, in both halves;
- **late-filing notices (F4):** −3.6% and −4.0%.

This is materially distinct (it reduces losses on holdings rather than finding buys), and it is already live as SELL reasons. It is also the most **feasible** first real use of this pipeline, because it needs only SEC routes the bridge already allows: `data.sec.gov/submissions`, `/Archives`, and the existing acceptance-clock join, with no quote semantics.

A bounded, measurement-only question would be: how much earlier, with acceptance-clock evidence, would the native pipeline have flagged held stocks than the nightly scan does?

**This is not required and not a replacement buy strategy.** The evidence does not support a new entry hypothesis, and none should be forced.

## Remaining engineering versus owner decisions

**Engineering (Codex):**
1. P1/G1: retry `WRITER_BUSY` and spool before persisting, plus a regression.
2. G2–G7: a first-capture producer that builds the native dataset from acquired responses:
   - protocol-derived plan clocks with publication evidence;
   - per-resource WITNESS comparison rules;
   - the SIP streaming collector wired into the importer for exit and close windows;
   - separate role processes plus a merge step;
   - live event detection, and REVIEW/ZAD timing.
3. G8: a global budget before activation.
4. Optional: scope the avoidance-warning measurement above as an offline design only.

**Owner decisions** (none needed now; unchanged):
- trust roots and custody;
- separate collector contexts;
- private setup (the existing setup-only request);
- close-source and ZAD-validity policies;
- the A cohort and budget;
- whether to scope the warning-timeliness measurement.

## Acceptance rows

A3, A4, A5, A7, CATALYST-03, CATALYST-04, MARKET-03, HISTORY-02, HISTORY-04, REPO-03, ACTIONS-04 and EXEC-03 remain **OPEN**. **No row meets its complete closure criteria**, because there is no authenticated first capture or real evidence. The count stays 24/40, 16 OPEN, 0 genuine admissions.
