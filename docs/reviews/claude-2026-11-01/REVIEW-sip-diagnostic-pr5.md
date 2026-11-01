# Independent review: SIP diagnostic, PR #5 (checkpoint 71cccb62)

**Reviewer:** Claude.

**Scope:** read-only review. I made no implementation change, installation, dispatch, credential access, provider call or message. Every run used synthetic placeholder credentials and local services on 127.0.0.1 only.

**Verdict: PASS** for the inactive package. C1 and C2 are closed. Follow-ups F1–F3 below are not blocking.

## What was reviewed

| Item | Value |
|---|---|
| PR #5 head | `510ef31cb90c9623ee8a0170cfed1010ebfd28bf` |
| Immutable runtime pin | `b8e0fe8ccaabe35642af16e9317a6fcf67d45d9c` (runtime files identical to the head) |
| Checkpoint `71cccb62e291c9c3084ff279118c8b393443a332` | Diagnostic runtime, plan and proposed workflow byte-identical to PR #5 |
| Proposed workflow | SHA256 `5c707d1df5494398e13068eab82f7f02464b0a00ae805a90d87c3bb656c6d1c3` |
| Hashes | All 23 manifest hashes and the 6 hashes embedded in the workflow match |

## Independently executed (this reviewer)

**Author test files**

| Runtime | corrections | diagnostic | package | workflow |
|---|---|---|---|---|
| Node 22.22.0 | 6/6 | 12/12 | 3/3 | 3/3 |
| Node 20.20.0 | 6/6 in 11 of 12 runs; 1 intermittent failure (F1) | 12/12 | 3/3 | 3/3 |

**Full suite at the PR #5 head,** Node 20 with `INCIDENT_WATCHER_SRC` set: 131 files, 1,270 pass, 0 fail.

### Real-path harness (`https-harness.mjs`)

What it runs:
- the actual `tools/run-sip-access-diagnostic.mjs`;
- the actual `createSingleAttemptHttpsRequest`, which is Node core `https`;
- real TLS, against a local HTTPS server with a throwaway self-signed certificate for `data.alpaca.markets`.

The preload changes only the TCP destination; the Host header and SNI are unchanged. It also runs a virtual clock. The harness counts TLS connections, so it would also see any hidden retry at the connection level.

| Scenario | Exit / code | TLS connections | HTTP requests | Notes |
|---|---|---:|---:|---|
| ok (start at T0) | 0 PASS | 7 | 7 | All `feed=sip`; key header present; report 2.2 KB |
| early-300s | 0 PASS | 7 | 7 | Waits for T0, then samples |
| early-601s | 2 BLOCKED_START_TOO_EARLY | 0 | 0 | No report file |
| late-31s | 2 BLOCKED_START_TOO_LATE | 0 | 0 | No report file |
| existing-report | 2 BLOCKED_EXISTING_REPORT | 0 | 0 | Existing file unchanged |
| no-binding | 2 BLOCKED_BINDING | 0 | 0 | Checked after the window gate |
| http403-at-1 | 1 ERROR_HTTP_403 | 1 | 1 | No IEX fallback |
| http429-at-2 | 1 ERROR_HTTP_429 | 2 | 2 | No retry |
| redirect-at-1 (302 to an IEX URL) | 1 ERROR_HTTP_OTHER | 1 | 1 | Redirect not followed |
| reset-at-1 (socket destroyed) | 1 ERROR | 1 | 1 | No reconnect or retry |
| hang-headers-at-1 | 1 ERROR_TIMEOUT | 1 | 1 | About 10.1 s |
| hang-body-at-3 | 1 ERROR_TIMEOUT | 3 | 3 | About 10.1 s |
| oversize-at-4 (195 KB valid JSON) | 1 ERROR_RESPONSE (TOO_LARGE) | 4 | 4 | |
| page-token-at-4 | 1 ERROR_RESPONSE (INCOMPLETE_PAGE) | 4 | 4 | No follow-up page |
| sigterm-during-wait | 1 ERROR_INTERRUPTED | 0 | 0 | No report; no credentials used |
| sigterm-during-request | 1 ERROR_INTERRUPTED | 1 | 1 | Report STOPPED / INTERRUPTED |

- **Runtimes:** every scenario was run on Node 22.22.0 (the version the proposed workflow pins). Seven key scenarios were repeated on Node 20.20.0 with identical outcomes: ok, early-300s, late-31s, redirect, reset, 429 and sigterm-during-request.
- **Code and exit:** in every case the printed code matches its exit status under `normalizeSipResult`.
- **Output privacy:** no secret, price or provider text appears in stdout, stderr or the report.

### Literal workflow Python (`wrapper-harness.py`)

The harness extracts the wrapper and finalizer heredocs from the `.proposed` workflow and runs them on crafted inputs.
- **Wrapper:** a valid code and exit pass through unchanged. These all become `ERROR` 1:
  - PASS with 1, 124 or 137;
  - a valid code with the wrong exit;
  - an unknown code, lowercase code or trailing text;
  - empty, oversized or missing output.
- **Finalizer:** a result that disagrees with the native step outcome becomes `ERROR` 1:
  - PASS with outcome "failure";
  - an error code with outcome "success";
  - an unknown outcome;
  - missing files.
- **Skipped step:** a pre-credential BLOCKED code with outcome "skipped" is accepted.

### Code review

- **C1 (closed):**
  - an early start is allowed within T0−600 s, and the runner waits internally with clock-regression and abort checks;
  - a start later than T0+30 s is refused;
  - the window is checked in a step before the credential-bearing step, and again in the runner before credentials are read or a transport is created;
  - nested bounds: runner 790 s, inside `timeout 800s` plus a 5 s kill, inside a 20-minute job.
- **C2 (closed):** a fixed allowlist of 20 codes, each paired with its exit (0, 1 or 2), validated twice, by the wrapper and by the independent finalizer. Codes carry no values.
- **Transport:**
  - core `https.request` with `agent: false`;
  - a fixed origin, and `redirect` must be `'error'`;
  - exactly seven fixed slots: no retries, no fallback, no pagination follow-ups;
  - per-request header and body timeout 10 s; 128 KiB per body; 896 KiB in total; report at most 16 KiB.
- **Output privacy:** the report contains IDs, statuses, counts, ages, latencies and numeric rate headers only. No body, price or provider text is stored.

## Hosted CI (GitHub; not executed by me)

| Commit | Tests runs | Other |
|---|---|---|
| PR #5 head `510ef31c` | 41304943132 (push) and 41305401023 (pull_request), success | |
| Checkpoint `71cccb62` | 41305881059 success | Stock2 safety checks 41305881216 and preservation 41305881090, success |

The PR body states that hosted CI did **not** run Node 22.22.0 (the verification job skipped it). I didn't check that job.

## Author evidence only (not reproduced)

- **Action tag-to-SHA mapping:** checkout v4.2.2 = `11bd7190…`, setup-node v4.4.0 = `49933ea5…`, upload-artifact v4.6.2 = `ea165f8d…`. I didn't read the action repositories; they are outside this review's repository scope.
- **Real runner behaviour:** the "five-check / three-workflow" provenance reconciliation, and behaviour on a real GitHub runner (step timing, artifact upload, cleanup), since nothing is installed.

## Is Node 22 verification required?

**Yes, for this package as proposed.** The proposed workflow pins `node-version: 22.22.0`, so that version is its target runtime. I ran every real-path scenario and the four author test files on Node 22.22.0 locally (independent execution on the exact pinned version). Hosted CI provides no Node 22 evidence.

## Follow-ups (not blocking)

- **F1. Intermittent test failure.** `test/sip-access-corrections.test.mjs` failed 1 of 6 cases once in 12 Node 20 runs, under concurrent load. I didn't capture which case failed, and 11 reruns passed (8 under the same load). It looks like a timing-sensitive test, not a runtime defect: every runtime failure path fails closed.
- **F2. Credentials sit in the environment during the wait.** The secrets are in the protected step's environment for up to 10 minutes of waiting before use. No transport exists during that time, and the runner reads them only after the gate. This is acceptable, but should be stated in the approval text.
- **F3. Action SHA pins not independently checked.** The pinned SHAs are consistent across the workflow, the manifest and the provenance file, but I didn't resolve them against the action repositories.

A review PASS is not installation, binding or dispatch approval.
