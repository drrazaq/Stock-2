# Focused review of `e8ac76d79a6db1ec2c734c304e01d6f8153839e7` (P1 spool, first-capture host, policy scope)

Reviewer: the Claude session, 6 Nov 2026, offline only.
- **Not done:** no setup, provider calls, collection or production change.
- **How tests ran:** Node 20.20.0, with a preload refusing every non-loopback connection; 0 were attempted.
- **Scope:** base `118ed4c5`; the commits are `3c0ec3fd` and `e8ac76d7`.
- Saturday's approved maintenance is unaffected.

## Consolidated verdict

| Area | Verdict |
|---|---|
| **P1 (received response lost under contention)** | **FIXED for contention, crash and restart**, with one new gap, Q1 (after an authorized takeover). |
| **Actual caller chain** | **PASS offline.** `advanceASourceFirstCaptureBindings` → `runASourceFirstCaptureBindings` → `runAFirstCaptureStep` → shared `acquire` / `colocatedPrefixPort` → unchanged `importNativeAEvidence` → strict evaluator, card and outcome. The CLI is still inspection-only. |
| **Pre-follow-up input freeze** | **PASS.** Follow-ups are refused before the decision is frozen, with 0 GETs. A frozen decision cannot be replaced. Later producer appends don't change the frozen prefix. Q2 (Low): the freeze write has no busy-retry. |
| **Earlier passes** | **Preserved.** 25 files, 502/502 tests. Client, N1, N3, store and 27-control importer probes are identical. The 4-process race still gives 22/22 GETs, at most 1 per item, and 0 on re-run. |
| **First capture** | **Still not authentic first capture.** This is a synthetic local first-receipt lifecycle (G2, G3, G7 partial; G4, G5, G6, G8 open, as Codex states). |
| **Acceptance rows** | **None meets its complete closure criteria.** 24/40, 16 OPEN, 0 admissions. |

Tests (`tests.txt`): new files a-acquisition-spool 6/6, a-first-capture-host 12/12 and a-first-capture-package 2/2; all 22 earlier A, N and B/C files unchanged.

## P1 independently re-probed (`probes/`)

| Probe | Result |
|---|---|
| External `flock` held 0.6 s after the 3rd CAPTURE GET (`p1`) | Retried inline: 22 GETs, 11 raw files, 11 spool packets per role. |
| Held 4 s, longer than the 2 s retry budget (`p1`) | First run is UNKNOWN `WRITER_BUSY`, but the received body is **in the spool** (3 packets, 2 raw). Re-run: complete, with **exactly the 17 remaining GETs; the 3rd item was not refetched.** (Compare 118ed4c5: the body was lost and the item was permanently UNKNOWN.) |
| **SIGKILL of a separate host process** after the spool fsync, while waiting on a busy store (`p1crash`) | A fresh process completes from the spool: 17 GETs, no refetch of item 3. |
| SIGKILL during the GET, response hanging (`p1crash`) | Restart: `ACQUISITION_REQUEST_OUTCOME_UNKNOWN`, **no redial**, 0 GETs. This is by design: bytes still in memory at a crash are lost, and the request stays unresolved. |
| Truncated packet of the exact unpublished item (`p1trunc2`) | UNKNOWN (`ACQUISITION_IO_UNKNOWN`), packet left byte-unchanged, no GET. (The truncation case in `p1crash` hit an item already published and is superseded by this probe.) |
| Deleted packet (`p1trunc2`) | `ACQUISITION_REQUEST_OUTCOME_UNKNOWN`, no GET. |
| Spool folder mode 0755 (`p1crash`) | `PRIVATE_SPOOL_UNSAFE` **before** any reservation or GET. After the fix, the first run completes: 22 GETs. |
| **Authorized new generation (takeover) after a spooled response** (`p1gen`) | **Q1:** `PRIVATE_SPOOL_CONFLICT`. The spooled original cannot be published, and the role's whole spool blocks every later item. It fails closed: no GET, and the packet is retained. |

## First-capture order (`fc`)

| Probe | Result |
|---|---|
| Follow-up before decision | `FIRST_FOLLOWUP_BEFORE_DECISION`, 0 GETs |
| Evaluation store busy at freeze | `WRITER_BUSY`. With the same clock after release, `FIRST_DECISION_DURABLE`. Past the deadline the case would become `FIRST_DECISION_LATE` (Q2). |
| Producer appends a later Atom response after the freeze | Evaluation still `OFFLINE_RESEARCH_ONLY` from the frozen prefix |
| A changed decision after the freeze | `FIRST_DECISION_CHANGED` |

## Findings

| # | Severity | Finding | Remedy |
|---|---|---|---|
| **Q1** | Medium (only matters live; fails closed) | The spool binding and packet context include `tokenHash`. After a legitimate takeover, which is exactly the recovery case, the new generation cannot publish a spooled first response, and `SCOPE.json` blocks the role's spool entirely. | Bind the spool to plan, role, storeId and contract, and record the generation inside each packet. Allow an explicitly authorized adoption under the new generation that publishes the original bytes and first-receipt clocks unchanged, recording the generation change. Add a regression (spool, then takeover, then recover without a GET). |
| **Q2** | Low (liveness) | `prepare`, `freeze-decision` (prefix and decision) and the evaluation audit write call `appendImport`/`lookup` without `busyRetry`. Contention lasting beyond a tight decision deadline (the fixture uses asOf + 1 s) loses the case as `FIRST_DECISION_LATE`. No data is lost. | Use `busyRetry` within the remaining deadline, and keep read-only views (`exportSnapshot`) off the exclusive writer lock where possible. |
| Q3 | Info | A truncated packet surfaces as the generic `ACQUISITION_IO_UNKNOWN`. | Map JSON parse failures on spool packets to `PRIVATE_SPOOL_CORRUPT`. |

## What this completes versus what still prevents authentic first capture

**Completed offline:**
- a plan without response hashes, durable before any GET, with discovery evidence observed before the plan;
- durable reservation before each GET, and a private fsynced spool before any contended write;
- restart without refetch, and UNKNOWN for uncertain transport;
- an entry set that must be complete before the decision freeze, the native SEC prefix frozen at decision time, and no follow-up before the freeze;
- evaluation only through the unchanged importer and strict evaluator, on an immutable local view.

**Still preventing authentic first capture:**
- **G2:** a production assembler that builds the native dataset from acquired originals. Fixture data is still pinned.
- **G3:** a protocol-level risk set and a clock template published before events.
- **G4:** per-resource WITNESS comparison for mutable submissions, Atom and asset responses.
- **G5:** the SIP streaming collector wired to the importer for exit and close windows.
- **G6:** separate role workers and a verified merge. Today one process holds both clients **and both signers**.
- **G7:** live dispatch, plus REVIEW and owner-ZAD state within expiry.
- **G8:** a global per-session or per-day budget.
- **Q1, Q2** above.
- **External:**
  - real distinct roots and custody;
  - private host, custody and encrypted spool at rest;
  - provider semantics and rights;
  - adopted A, close-finality and ZAD policies.

## "Physically separate role workers": threat and minimum boundary

The dependency text asks for "authenticated independent execution" and "separate actual CAPTURE/WITNESS role workers". It does not, strictly, require separate hardware; the gap is reconciled as follows.

| Threat | Does today's host defend it? | Minimum necessary boundary (mandatory) | Physical separation adds (recommended, not required) |
|---|---|---|---|
| One code defect or one operator action silently omits or alters an event in **both** records | **No.** One process holds both clients, both stores and **both signing functions**, so it can produce both records. | **Two OS processes (separate jobs) per role.** Each loads only its own signing key, writes only its own store and spool, holds no write authority over the other's, and makes its own fetch with its own receipt clock. A separate **merge/verify** step reads both and checks both signatures. | — |
| A crash or contention in one role destroys the other's evidence | Partly (separate stores and spools) | Already met by separate stores and spools, once the roles run as separate processes. | — |
| **Common-mode network or provider-path fault** (a caching proxy, DNS or an intermediary serving the same wrong bytes to both) | No | Not addressed by any process boundary. Byte equality between roles never proves source truth, so it stays labelled `NOT_INDEPENDENTLY_ESTABLISHED`. | **Different egress paths** (for example one GitHub-hosted runner and one other host) lower common-mode risk. Recommended before any claim stronger than "local first receipt". |
| Host compromise or a malicious operator with full machine access | No | Outside the stated threat model (research only, owner trades by hand). | Separate machines and custodians. Recommended only if results ever gate money. |

**Conclusion:** my earlier position stands. Separate processes, separate keys and protected records are the minimum. The current host does **not** yet meet even that minimum, because both signers live in one process (G6 is a genuine open implementation item, not hardware). Physical separation remains a recommendation, mainly against common-mode network faults.

## Consolidated policy choices

`policy-decisions.md` is complete and correctly separated:
- the factual provider questions are not presented as owner choices;
- no cost or gate relaxation is requested;
- each listed scope needs its own approval.

Two notes:
1. The private spool's plaintext-at-rest risk needs an explicit custody decision before any live use. It is listed under external evidence; it should also appear in the setup decision.
2. The A pilot policy items (ZAD validity, close finality, pilot) are **not needed** for the smallest useful scope below. Deciding them now would be premature.

## Smallest complete execution scope that could produce a useful evidence result

Codex's `warning-preservation-scope.md` (existing F6 delisting-warning clocks; one session; tee only the watcher's existing SEC responses; no extra requests, quotes or keys) is the right smallest scope, with these adjustments:

1. **Make the result useful even with zero F6 events.** F6 averaged about 0.8–0.9 per session market-wide in the SQ29 data, so one session has roughly a 40% chance of none. The primary output should be **first-receipt preservation for every filing in the observed stream** (denominator, revisions, receipt clocks, acceptance-proof availability). F6 latency is a subset result.
2. **Report the polling cadence as part of latency.** The watcher's loop drift (about 62 s passes, one skipped minute about every 30) and its 345-minute budget bound what "first receipt" can mean.
3. **Order:** it taps the watcher (`ignition-watch.mjs`, inside Saturday's STOP scope), so its fresh current-main tee-only patch comes after Saturday, with its own review.
4. **Single role is acceptable** for this measurement if labelled `NOT_INDEPENDENTLY_ESTABLISHED`. G4, G5, G6 and G8 are not needed. G2 is needed only for SEC originals, which the native prefix already preserves.
5. **Owner decisions needed:**
   - (a) the existing setup-only private custody package, including spool and at-rest handling;
   - (b) one dated session for the tee.

   Nothing else (no ZAD, close or pilot policy).

This answers whether authentic first-receipt timing is obtainable from the system's own stream. It makes no strategy or profitability claim.

## Acceptance rows

A3, A4, A5, A7, CATALYST-03, CATALYST-04, MARKET-03, HISTORY-02, HISTORY-04, REPO-03, ACTIONS-04 and EXEC-03 remain **OPEN**. **No row meets its complete closure criteria.**
