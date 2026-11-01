# Independent review: inactive SIP diagnostic package @ 107935f64d6dd4a9fe7f6c789f1ec94e23fa5d30

This review is read-only. I made no edits, installation, dispatch, provider call or secret access. Every run used synthetic keys and a local server on 127.0.0.1.

**Verdict: CHANGES REQUIRED.**
- **Safety bounds:** reproduced. They hold on the real runner and client paths.
- **Two required changes:**
  - C1: the start window makes the single approved run likely to be refused.
  - C2: a pre-transport refusal gives no non-sensitive reason.

## Independently reproduced (this reviewer)

| Check | Result |
|---|---|
| Manifest `fileHashes` (10), `planSha256`, `workflowSha256` | All match at 107935f6 |
| Source pin | `sip-access-diagnostic.mjs` `008f8b23…`, `tools/run-sip-access-diagnostic.mjs` `9f327827…`, plan `c83fd81e…` and the diagnostic test are byte-identical at 8af4e1ac (the pinned source); the workflow's embedded hashes are the same |
| Not installed | No `.github/workflows/sip-access-*` at the checkpoint; the package test asserts this |
| Author tests | `test/sip-access-diagnostic.test.mjs` 12/12; `test/sip-access-package.test.mjs` 3/3 (local Node 22.22.0) |
| Full suite at the checkpoint | 229 files, 2,215 pass, 8 fail; see the note below |

**Note on the 8 suite failures:** all are gated incident/resilience watcher tests run with `INCIDENT_WATCHER_SRC` pointed at this development branch's watcher. Unset, both files pass (10/10, 1/1). The SIP package touches neither file nor the watcher.

### Real-path harness

My own script (`realpath.mjs`, SHA256 `4253399a…`) ran the actual runner, `createBoundedSipRequest` and Node's real `fetch` over real HTTP to a local server. Only the origin was rewritten and the clock frozen at T0 (the 90 s wait fast-forwarded). The synthetic key reached the server in every scenario, which means the variable it travelled in was indeed the runner's real credential path. Neither the key nor any price or provider text appeared in the report or stdout.

| Scenario | Requests | Result | Report |
|---|---:|---|---|
| ok | 7 | COMPLETE_SAMPLED, exit 0 | 7 sampled, revision count 0, 2.2 KB |
| 403 at 1 | 1 | STOPPED HTTP_403, no IEX fallback | 402 B |
| 429 at 2 | 2 | STOPPED HTTP_429, no retry | 670 B |
| 302 redirect at 1 | 1 | STOPPED TRANSPORT_ERROR; redirect not followed | 416 B |
| server never answers | 1 | STOPPED TIMEOUT after ~10.1 s real time | 400 B |
| body stalls mid-stream at 3 | 3 | STOPPED TIMEOUT after ~10.1 s | 940 B |
| 195 KB valid body at 4 | 4 | STOPPED TOO_LARGE (> 128 KiB) | 1.2 KB |
| `next_page_token` at 4 | 4 | STOPPED INCOMPLETE_PAGE, no follow-up | 1.2 KB |
| start 5 s before T0 | 0 | BLOCKED_OR_ERROR, no report | none |
| start 31 s after T0 | 0 | BLOCKED_OR_ERROR, no report | none |

- **Harness error, found and fixed:** my first oversized-body case had an operator-precedence bug that sent about 45 KB of invalid JSON, so INVALID_JSON was the correct response to it. After the fix the client returns TOO_LARGE for both a single write and a chunked stream.
- **What these runs establish:**
  - the 7-request ceiling;
  - no retries or fallbacks;
  - feed=sip on every request;
  - per-request header and body timeouts;
  - the per-body byte cap;
  - refusal of redirects and pagination;
  - stop on the first failure;
  - aggregate-only output: no prices, no secrets, no provider text.

### Code review (read)

- **Credentials:** only in the "Protected diagnostic only" step env. Hashes and the source SHA are verified in an earlier step and re-verified by the runner. Headers go only to the fixed origin, with `redirect: 'error'`.
- **Approval input:** passed through env to Python (no script interpolation), at most 16 KiB, written with `'x'` mode.
- **Run identity:** `run_attempt == 1` in both the workflow and the runner; `concurrency` has no cancel; the job is `contents: read` with `persist-credentials: false`.
- **Report file:** reserved with `wx` before any transport; an existing file blocks.
- **Report contents:** the report is at most 16 KiB. Reason codes are allowlisted. Rate-limit headers are digits only.
- **Time limits:** 10 s per request (headers and body), a 180 s deadline from T0, a 180 s kill timer and a 190 s outer `timeout`, inside a 5 min job.
- **Claims:** the fixed `claims` flags (`sampledResponsesOnly`, no coverage, settlement, rate or fill guarantee, no strategy evaluation) and the proposal text stay within sampled access and response behaviour.

## Required changes

**C1. The start window makes the one approved run likely to be refused** (feasibility; it fails closed with 0 provider requests).
- The runner and `runSipDiagnostic` both require `now` in [T0, T0+30 s]. A start even 1 s before T0 is refused, and nothing waits for T0.
- On this repository, real runs reached their first script step 12–14 s after creation (runs 41298672379 and 41061535419). The proposed workflow does more setup, an estimated 15–25 s, and that latency varies.
- So a manual dispatch must land in an unguided band of about 30 s, and the proposal says a failed run must not be replaced without new approval.
- **Fix:** accept a bounded earlier start (for example from T0−5 min), wait until T0 inside the runner, and resize the kill timer, the outer `timeout` and the job timeout to fit. Also document when to dispatch.

**C2. A pre-transport refusal gives no non-sensitive reason.**
- Every guard failure prints only `BLOCKED_OR_ERROR` and writes no report.
- With a single-run approval, the operator cannot tell a timing refusal from a hash, approval-date or identity mismatch.
- **Fix:** emit an allowlisted guard code (for example START_TOO_EARLY / START_TOO_LATE / PIN_MISMATCH / APPROVAL_DATE / RUN_IDENTITY / BINDING_MISSING) without any value or secret.

## Notes (not blocking)

- **Workflow bytes:** the installed workflow must be byte-identical to `.proposed`, including its "INACTIVE REVIEW COPY" header comment, or the workflow hash check refuses the run. The installation procedure should say so.
- **Third-party action pins:** checkout `11bd7190…`, setup-node `49933ea5…` and upload-artifact `ea165f8d…` are pinned by SHA but were not independently resolved (I didn't read the action repositories).
- **Clock-age meaning:** reported ages are (runner receive time − provider timestamp), so they include runner clock skew. Worth one line in the claims.
- **Last request size:** `trades-window` (AAPL, 10 s, limit 10,000) is normally well under 128 KiB, but a burst could exceed it. That would stop only the last slot (TOO_LARGE).
- **Hosted evidence count:** the manifest says "all 5 applicable checks" for 8af4e1ac. I can see 3 successful runs per commit (Tests, Stock2 safety checks, Exact-source preservation).

## Hosted CI (GitHub; not reproduced by me)

| Commit | Tests | Stock2 safety checks | Exact-source preservation |
|---|---|---|---|
| 107935f6 | 41298672379 success | 41298672422 success | 41298672364 success |
| 8af4e1ac | 41297935006 success | 41297935104 success | 41297934994 success |

## Author evidence only (not reproduced)

- "Independent pure mock: 7 checks PASS in isolated JavaScript" (the author notes local Node was unavailable).
- The `.proposed` workflow's behaviour on a real GitHub runner (step timing, artifact upload, cleanup). No installed run exists.

A review result is not installation, binding or dispatch approval.
