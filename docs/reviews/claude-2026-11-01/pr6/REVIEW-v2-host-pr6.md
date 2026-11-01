# Independent review: inactive V2 host, guard and recovery, PR #6

**Reviewer:** Claude.

**Scope:** read-only review. I made no edit to any reviewed file, and no deployment, credential use, provider call or activation. Every run used the tree's own synthetic fixtures: local child processes, mock transports and synthetic keys. The only network listener was a 127.0.0.1 HTTP server I started myself, used in case I3.

## Verdict: CHANGES REQUIRED

The package does what it says on guards, recovery, acknowledgments, restart, contention and partial writes. One defect blocks it:

**F1.** The actual-host "success" capture fails intermittently: 3 of 18 local runs, on both Node 20 and Node 22. The cause is real and reproduced. The reused host storage monitor kills the capture when the V2 store's short-lived `.observing` lock directory disappears during a scan.

This contradicts checklist item 7 ("actual host … tests"), which rests on hosted runs that happened to pass. The fix is small (see F1), but the package should not be called engineering-complete until it is fixed and re-verified.

## What was reviewed

| Item | Value |
|---|---|
| User-named commit | `6868d9a39518fdf4168f67167f681bbba7c68ab0` (branch `Stock2-safety-fixes`, parent `71cccb62`) |
| PR #6 head | `64611cdf47dd230026911dde53b98cf7413c17f1` (base `71cccb62e291c9c3084ff279118c8b393443a332`, 8 commits, draft, mergeable "clean") |
| Hosted-tested source | `b4cebc98a3b36b1818bdc4f041e9a439ba07af7f` |
| Patch | `docs/validation/v2-host-guard-recovery.patch`, SHA256 `e8dfe292b8133c458463fd8b63338d92eb1687420107b52e76f216dcc5bad0c1` (the same at 6868d9a3 and at the PR head) |
| Package | 6 runtime files: `artifact-wire-client.mjs`, `native-sec-bounded-clients.mjs`, `sec-v2-evidence.mjs`, `sec-v2-host-binding.mjs`, `sec-v2-recovery.mjs`, `tools/native-sec-v2-capture-worker.mjs`. 4 test files: `test/sec-v2-host-fixture.mjs`, `sec-v2-host.test.mjs`, `sec-v2-host-guard.test.mjs`, `sec-v2-wire.test.mjs` |

**Identity checks (independently executed)**
- **Patch application:** the patch applied to `71cccb62` produces 10 files byte-identical to both `6868d9a3` and the PR head.
- **Same package everywhere:** the 10 files are also identical at `b4cebc98`. Outside `docs/`, `6868d9a3` and the PR head have no differences.
- **Manifest:** all 46 hash entries in `docs/validation/v2-host-guard-recovery-manifest.json` (runtime, test, dependency) match, and its patch hash matches.
- **Flags:** the manifest records `liveModeImplemented: false` and `activationApproved: false`.
- **Excluded:** the CI timeout/order change in `.github/workflows/tests.yml` is outside the patch, as stated.

**Inactive in fact**
- No file outside `test/` and `docs/` imports `sec-v2-host-binding`, the V2 worker, `sec-v2-recovery` or `createV2Bindings`.
- The only workflow that mentions V2 is `tests.yml`.
- `ignition-watch.mjs` is untouched.
- The only accepted mode literal is `INACTIVE_SYNTHETIC_REHEARSAL`.
- The host lifecycle files the package reuses (`native-sec-colocated-host.mjs`, `native-sec-host-schedule.mjs`) are unchanged by the PR.

## Independently executed (this reviewer)

### Author tests at 6868d9a3 (package files identical to the PR head)

| File | Node 20.20.0 | Node 22.22.0 |
|---|---|---|
| sec-v2-host (10 actual-host cases) | 9/10: **"success" failed (F1)** | 10/10 |
| sec-v2-host-guard | 6/6 | 6/6 |
| sec-v2-wire | 3/3 | 3/3 |
| sec-v2-evidence | 8/8 | 8/8 |
| artifact-wire-client (legacy) | 20/20 | 20/20 |
| native-sec-bounded-clients (legacy) | 8/8 | 8/8 |
| native-sec-host-guards (legacy) | 3/3 | 3/3 |

- **Loopback:** sockets work in this environment, so the author's local "EPERM" limitation does not apply here. These are real local executions of the socket- and process-based tests.
- **Repeat runs:** the "success" case alone, 8 times on each Node version: 2 failures in 16 (once each). Every failure gives host `CAPTURE_FAILED`, `captureFailureReason: null`, `captureExitSignal: SIGTERM` and no result file. In every case the producer is unaffected: exit 0, full 332-minute heartbeat.

**Full suite at 6868d9a3,** Node 20.20.0, with `INCIDENT_WATCHER_SRC` set (which also enables the gated actual-watcher tests that hosted CI does not run):
- 235 files; 233 passed, 2 failed (2,251 cases pass, 8 fail).
- The failures are `watcher-incident-revision` (1 case) and `watcher-resilience` (7 cases).
- Both fail identically at the base `71cccb62` without the patch (1 + 7, same cases), so they predate this PR and the PR does not change them (N5).
- In this run the "success" actual-host case happened to pass.

### F1 root cause (`diag-monitor.sh`)

**Method**
- Copies the tree to a throwaway directory.
- Instruments only the swallowed `catch` of the host's 100 ms storage monitor (`native-sec-colocated-host.mjs`) so the error is logged.
- Reruns the author's "success" case.

**Result:** 10 runs on Node 20 gave 9 passes and 1 failure. The failing run logged exactly one monitor error:

```
ENOENT ENOENT: no such file or directory, lstat '/tmp/guarded-paper-…/sealed/.observing'
```

The passing runs logged no monitor errors.

**Mechanism**
1. Each V2 observation creates and removes a `.observing` lock directory inside the output directory (`sec-v2-evidence.mjs`; `.writer-lock` works the same way). The output directory is inside the host's monitored `storageRoot`.
2. The monitor's `treeBytes` calls `readdirSync` and then `lstatSync` per entry. If the lock directory is removed between those two calls, `lstat` throws ENOENT.
3. The monitor's `catch{limitHit=true;captureChild.kill('SIGTERM')}` treats that as a resource breach and kills the capture.
4. The host then reports `CAPTURE_FAILED` with no reason. This is consistent with the worker's signal exit winning the race against the host's 1-second control check, which would otherwise report `HOST_SOURCE_OR_RESOURCE_UNHEALTHY`. Either way, the cause is invisible in the health record.

**Effect in a real session:** any capture day can be lost at random. The loss fails closed: the producer and its archives are untouched, and no false COMPLETE is reported. But the run gets no receipt manifest (it is written only at the end), so it cannot be recovered with `recoverInactiveV2Capture`.

**Why hosted CI did not catch it:** the failure rate here is about 1 in 6 to 1 in 10 per run, so a passing hosted run is expected most of the time.

### Independent harness (`v2-host-harness.mjs`), Node 20.20.0 and Node 22.22.0

What it runs:
- the actual `startInactiveV2Host` → worker → real artifact wire client → `recoverInactiveV2Capture`;
- the tree's own synthetic producer and fixtures.

The results on both versions were identical (one JSON per version is attached).

**Complete capture**
- First attempt: `CAPTURE_FINISHED / COMPLETE`.
- 41 provider attempts, 41 confirmed uploads, 164 wire requests (bound 205), 0 unreconciled uploads, `automaticResumeAuthorized: false`.
- The on-disk `manifest.json` equals the returned manifest and its SHA256.
- Producer: exit 0, not cancelled, all 332 heartbeat minutes.

**Recovery of the actual downloaded ZIPs**

| Case | Result |
|---|---|
| R00 baseline | AUTHENTICATED_COMPLETE_CAPTURE, 41 frames |
| R01 wrong receipt pin | V2_RECOVERY_RECEIPT_PIN |
| R02 scope runId changed | V2_RECOVERY_SCOPE |
| R03 wrong key | AES-GCM authentication failure |
| R04 archive missing | V2_RECOVERY_ARCHIVE |
| R05 two archives swapped | V2_RECOVERY_ARCHIVE |
| R06 one byte flipped, receipt archive hash re-pinned | ARTIFACT_ZIP_SCOPE_OR_INTEGRITY |
| R07 duplicate artifactId | V2_RECOVERY_RECEIPT |
| R08 middle receipt dropped (re-pinned) | V2_RECOVERY_RECEIPT |
| R09 receipts reordered (re-pinned) | V2_RECOVERY_RECEIPT |
| R10 receipts truncated to 20 (re-pinned) | AUTHENTICATED_PARTIAL_CONTEXT, 20 frames (never COMPLETE) |
| R11 extra 42nd receipt | V2_RECOVERY_SCOPE |
| R12 manifest primaryAdmission true | V2_RECOVERY_SCOPE |
| R13 key-holder re-seal, content unchanged | COMPLETE (control) |
| R14 key-holder edits the outcome | V2_RECOVERY_OUTCOME |
| R15 key-holder sets policyApproved | V2_RECOVERY_CHAIN |
| R16 key-holder rewrites an earlier frame (outcome recomputed) | V2_RECOVERY_FRAME_REWRITE |
| R17 key-holder alters the LAST frame and recomputes the outcome | **COMPLETE (accepted; see N2)** |
| R18 key-holder alters native SEC bytes (sha updated) | V2_RECOVERY_NATIVE_PREFIX |
| R19a key-holder adds whitespace to a telemetry record | COMPLETE (hash covers parsed JSON; no semantic change) |
| R19b key-holder changes a telemetry field (stale hash) | V2_RECOVERY_TELEMETRY_HASH |
| R20 key-holder removes `context:reference` | AUTHENTICATED_PARTIAL_CONTEXT |

The "key-holder" cases (R13–R20) re-seal checkpoints with the synthetic key and rebuild the ZIPs and receipts.

**Guards (synthetic-only and inactive)**

| Case | Result |
|---|---|
| G00 exact inactive inputs | accepted |
| G01 one reference record `synthetic: false`, re-pinned | V2_BINDING_SYNTHETIC_REFERENCE_REQUIRED |
| G02 `synthetic` flag removed, re-pinned | V2_BINDING_SYNTHETIC_REFERENCE_REQUIRED |
| G03 `policyApproved: true` | V2_BINDING_SCOPE |
| G04 mode `LIVE` | V2_BINDING_SCOPE |
| G05 protocol changed | V2_BINDING_SCOPE |
| G06 output outside storage root | V2_BINDING_STORAGE_SCOPE |
| G07 host mode `LIVE` | V2_HOST_INACTIVE_SCOPE |
| G08 host with another worker entry | V2_HOST_INACTIVE_SCOPE |
| G09 history UNKNOWN or AUTHENTICATED_EARLIER | BLOCKED / HISTORY_NOT_ELIGIBLE; 0 credential reads, 0 transport calls, no output |
| G10 start 31 s early / 9 s before start | V2_BINDING_START_WINDOW; 0 credential reads, 0 transport calls, no output |

**Failure isolation from the watcher (actual host and producer)**

| Case | Host | Producer |
|---|---|---|
| I1 binding module throws | CAPTURE_FAILED | exit 0, 332/332 minutes |
| I2 worker `process.exit(7)` at its first quote | CAPTURE_FAILED | exit 0, 332/332 |
| I3 binding module probes the network | CAPTURE_FAILED | exit 0, 332/332 |

In I3:
- the replaced global `fetch` → `INACTIVE_NETWORK_FORBIDDEN`;
- a `node:http` request to my local listener → **ALLOWED** (1 hit). See N1.

**Restart, contention, partial writes, acknowledgments:** the author's actual-host cases passed in my runs (except F1).
- Contention: a second worker is refused with `V2_CAPTURE_BLOCKED`.
- Restart: rerunning the worker after an outcome is refused, and the result file is byte-unchanged.
- Partial writes: partial checkpoint, ACK, receipt and manifest writes stop the capture with ≤1 provider attempt and keep the 12-byte partial file.
- Refusals: upload refusal stops at 2 wire requests with no retry; quote refusal stops at 0 wire requests.
- Acknowledgment checks in the code:
  - `success === true`;
  - `fileSha256` equals the sealed checkpoint hash;
  - a unique positive `artifactId`;
  - `0 < archiveBytes ≤ 16 MiB`;
  - a 64-hex `archiveSha256`;
  - a cumulative archive budget of 64 MiB.

  Each ACK is persisted privately (O_NOFOLLOW/O_EXCL plus fsync) before the next quote.

## Hosted CI (GitHub; not executed by me)

| Commit | Run | Result |
|---|---|---|
| `b4cebc98` (source) | Tests 41321877142 / job 124893641478 | success (author: 235 files) |
| `6868d9a3` | Tests 41323418782 / job 124898249872; Stock2 safety checks 41323418761; preservation 41323418791 | success, success, success |
| PR head `64611cdf` (push) | Tests 41323469330 | success |
| **PR #6 terminal compatibility** (pull_request, base `71cccb62` is an ancestor of the head) | Tests 41323868448 / job 124899606708 | **success**; preservation 41323868416 **skipped** |

**Terminal PR compatibility:** verified as a hosted result. The pull_request Tests run on the PR's merge ref completed successfully, and GitHub reports the PR as mergeable ("clean"). I did not execute that run; my local suite above is the independent counterpart. The hosted pass does not contradict F1: an intermittent failure at this rate passes most single runs.

## Hosted versus independently reproduced

**Reproduced by me**
- package identity and hashes;
- all author V2 and legacy test files on Node 20 and 22;
- the F1 failure and its root cause;
- the full recovery, guard and isolation batteries above;
- the inactivity checks (no imports, no workflow);
- the full suite at `6868d9a3`.

**Hosted only (not reproduced)**
- the GitHub runner results listed above;
- the author's statement that hosted Node 20 ran 235 files;
- the behaviour of the real GitHub artifact service and of real downloads. My recovery used the mock service's finalized ZIP bytes, which use the same ZIP codec but are not GitHub's servers.

**Author claims not reproduced**
- the local EPERM failures (not applicable here);
- the retained failure branches `e6e737be`, `9ff9e273`, `50d27330`, `ffdc6d0e`, `19642632` (I only confirmed their hosted runs failed or were cancelled as described).

## Findings

### F1 (blocking): the host kills the capture on a benign lock-directory race; the failure is unreported

Reproduced and diagnosed above. The fix should be minimal and should not weaken the storage bound:
- in `treeBytes`, treat ENOENT from `lstat` on an entry returned by `readdirSync` as a vanished entry (skip it); **or**
- place the V2 store's lock directories outside the monitored tree; **or**
- make the lock a file whose removal is not raced by the scan.

Also record the monitor's error code as `captureFailureReason` (for example `HOST_STORAGE_MONITOR_<code>`), so that a killed capture is never reported as a reason-less `CAPTURE_FAILED`.

To verify the fix, the author's "success" case should pass at least 30 consecutive runs on Node 20. The change must also be re-hashed in the manifest. Note that `native-sec-colocated-host.mjs` is outside the current 6-file runtime patch, so a host-side fix widens the package by one file. Fixing it in `sec-v2-evidence.mjs` would stay within the package.

### N1 (note; required before any live mode): "synthetic-only" is a data and label restriction, not a network sandbox

The worker replaces `globalThis.fetch`, but a pinned binding module can still use `node:http`/`node:https` or `net` (I3).

What actually keeps the package synthetic today:
- the mode literal;
- `policyApproved: false`;
- the draft protocol;
- every reference record marked `synthetic: true`;
- there being no non-test binding module and no workflow.

If a binding module ever wraps a real transport while the references are marked synthetic, real provider calls would run under "INACTIVE_SYNTHETIC_REHEARSAL". Live mode needs explicit transport destination allowlists that the guard checks, not that the binding module promises.

### N2 (note, consistent with the package's own claim): the encryption key authenticates integrity, not source

A holder of the encryption key can re-seal the last checkpoint with an altered final frame and a recomputed outcome, and recovery accepts it as COMPLETE (R17). Earlier frames, outcomes, native bytes, telemetry and policy flags are protected by chain, prefix and recompute checks (R14–R19b).

This matches `sourceAuthenticity: 'NOT_ESTABLISHED_BY_ENCRYPTION'` and the package text. Approvers should read "AUTHENTICATED" as "untampered since sealing by a key holder", not as independent provenance.

### N3 (note): interrupted captures cannot be recovered

`manifest.json` is written only at the end. A SIGTERM'd or crashed worker (F1, I2) leaves per-checkpoint `receipt-NNNNNN.json` files but no manifest, and recovery accepts only a pinned manifest. The package discloses this ("not a guarantee that an interrupted host will … retain its receipt manifest"), but there is no recovery path for such runs.

### N4 (note): status naming

`AUTHENTICATED_PARTIAL_CONTEXT` is returned both for missing context assets (R20) and for fewer than 41 frames (R10). The `frames` and `contextComplete` fields disambiguate, but a distinct status for frame-incomplete captures would be clearer.

### N5 (note, pre-existing, outside this PR): gated watcher tests fail at the base checkpoint

With `INCIDENT_WATCHER_SRC` set, `test/watcher-resilience.test.mjs` (7 of 9) and `test/watcher-incident-revision.test.mjs` (1 of 11) fail at `71cccb62` and at `6868d9a3` alike. Hosted CI does not set that variable, so these tests do not run there. They are not caused by PR #6 but should be tracked separately. I did not diagnose their cause in this review.

## Live-mode implementation still missing (precisely)

1. **Mode and guard.** No live mode exists anywhere. `startInactiveV2Host` and `prepareInactiveV2Binding` accept only `INACTIVE_SYNTHETIC_REHEARSAL`, `policyApproved: false` and protocol `SEC_PROOF_READY_V2_DRAFT3_REVIEW_ONLY`. They require every reference record to be `synthetic: true`. Live mode needs a separately named, separately guarded path, with an approved protocol identity and a non-synthetic reference check bound to an approved reference-review pin.
2. **Real binding module.** The only `createV2Bindings` is the test fixture's synthetic module. A real module is missing. It would supply:
   - the provider transport (SIP snapshot) and artifact transport (runtime token, results/storage origins);
   - the encryption key and credentials from secrets;
   - real `now`/`wait`;
   - enforced destination allowlists (N1).
3. **Workflow wiring.** No workflow starts the V2 host or worker. `ignition.yml` and `ignition-watch.mjs` are untouched. Live mode needs a reviewed workflow change that:
   - launches the colocated host beside the watcher;
   - binds the secrets;
   - pins sources;
   - writes the plan and input pins;
   - applies the step and job timeouts.
4. **Real history binding.** Same-day history must come from an authenticated GitHub API call (`createSameDayLineageClient` with a real token and workflow ID). Today it is a test-supplied file.
5. **Reference preparation.** Real instrument and reference records (excluded by the synthetic guard) need a separately reviewed and authorized preparation step, plus retention.
6. **Download and recovery operation.** No runtime code downloads artifacts (no list or download client). Recovery is a library function fed by test-supplied archives. Live mode needs an authorized download step, a recovery CLI and a home for the independently pinned receipt hash. It also needs a path for interrupted runs (N3).
7. **F1 fix** (above) before any real session.
8. **Owner and policy decisions** outside engineering: protocol and continuity adoption, a dated collection authorization and the request budgets. The package doc lists these too.

## Is Node 22 verification required?

**No.** The watcher, `tests.yml` and `premarket.yml` all run Node 20, and the V2 host is designed to run beside the watcher. I ran everything on both versions anyway: F1 reproduces on both, and every harness result is identical on both.

A review result is not activation, installation or deployment approval.
