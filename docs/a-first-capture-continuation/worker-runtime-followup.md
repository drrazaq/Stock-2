# A worker startup and lifetime follow-up — 6 November 2026

Qima is parked. This is an inactive A-only implementation correction; no production code, workflow, provider, credential, collection, rule, evidence standard or deadline was activated or changed.

## Diagnosis and attribution

Two distinct problems were found. **The executor is currently unsuitable for ordinary Node worker verification.** Serial Python, util-linux flock and small Node controls initially passed (seven controls, no retries). The unchanged seven-case first-entry suite then aborted before TAP with exit134. A separately labelled low-thread diagnostic produced0/7: its first INIT timed out at15seconds, later INIT attempts failed in about20milliseconds. Reducing the parent V8 pool was diagnostic only, never an accepted test configuration or source fix. Later even Node syntax checks timed out at8seconds, and the exec server refused a shell with `Resource temporarily unavailable (os error11)`.

A read-only snapshot found32,317 zombie processes parented by PID1, memory about12GB of16GiB and no recorded cgroup OOM/PID-max events. Other programs also failed thread creation (Git lstat, Rust search and Go startup). This supports an executor/resource problem independent of an A assertion, but does **not** establish the exact exhausted resource, its threshold, or that A created these zombies. No limits, PID1, existing locks, evidence or other sessions were altered.

**A separate implementation lifetime defect was reproduced.** Default flock forks a worker. After its launcher is killed, that child can remain alive holding the kernel lock and writing later; inherited output descriptors can also delay completion of a synchronous timeout. The corrected v2 Linux primitive probe demonstrated: original launch exits−15, the lock still refuses with73 and a later synthetic write occurs; `--no-fork` control exits−15, the lock becomes available and no later write occurs. Both permanent lock files remain. The controller acts as subreaper only for its own disposable children and reaps them.

The first primitive probe had a test-order error: it waited for the child's output before testing the lock, after the child had already finished. That failed attempt remains preserved and is not used as proof. v2 checks the lock while the child is still alive. This is independently executed Linux primitive evidence, not a claim that the actual A integration passed here.

## Narrow repair and required regression

The existing store now execs the worker in the PID being waited for using `flock --no-fork`; the existing15,000ms timeout uses SIGKILL so even a stopped worker cannot outlive it. Abnormal termination still returns WRITE_OUTCOME_UNKNOWN. No automatic retry, takeover, lock deletion, evidence truncation or speculative success is introduced. Explicit existing recovery, enrolled authority requirements, permanent kernel lock, generation fencing,16MiB/2,000-file limits and original-byte preservation remain.

The new `test/a-worker-lifetime.test.mjs` invokes the **actual** store via a Python child controller. In a SYNTHETIC-only store it pauses after durable intent, proves lock contention, requires15-second termination, no surviving worker, retained pending intent and explicit recovery. A synthetic−$42 record must survive exactly once, idempotently, with original files and lock identity unchanged. The pause hook is refused for non-synthetic stores just like existing crash hooks. The controller watches only its own child PIDs, bounds its lifetime and cleans/reaps its own process group on interruption.

The first local attempt timed out at the43-second outer harness bound without TAP. No test worker remained active on subsequent readback. It is a FAILED/UNVERIFIED attempt, not a pass. Python AST validation passed. Exact-commit ordinary hosted CI is the available separate clean verification path; its result must be recorded explicitly before this repair is called verified. No manual dispatch or new workflow is needed or authorized.

## Finite continuation and terminal deliverable

This repair is a prerequisite within G6/G7 worker/failure handling, **not** completion of the six components in [the finite plan](finite-integration-plan.md). That plan's48–74 focused hours remains the essential estimate, with conditional G4 adding6–10hours only if necessary. Once the clean actual-worker and existing host/recovery suites pass, resume G2's source-derived opening/reclaim bars and prior panels through the existing caller. Do not add another standalone acquisition system. Qima/F6 and Saturday maintenance remain separate.

The terminal deliverable is an authentic-data A feasibility evaluation with timely discovery and original clocks, verified population/controls, executable whole-share entry/exit evidence and after-cost results ($3each side, spread counted once, losses/missingness retained). It is not delivered by this worker checkpoint, synthetic signatures or CI. Genuine admissions remain zero; all16 acceptance rows remain open. No new approval is needed for offline implementation. Real hosts/trust roots, source/quote rights and semantics, custody, timely independent reviewer/owner inputs, proposed ZAD-validity policy and a frozen bounded acquisition scope still require their respective evidence/decisions before activation.
