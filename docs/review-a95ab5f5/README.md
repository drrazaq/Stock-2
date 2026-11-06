# Focused review: A worker-lifetime repair at `a95ab5f50329a4ed1e92e535851b71f1f527cf25`

**Reviewer:** the Claude session, 6 Nov 2026, offline only. Codex owns the implementation; this review changes none of its files.

**Scope:** the delta from `5713011e` to `a95ab5f5`:
- `a-fenced-store.mjs`, 2 changed lines;
- the new `test/a-worker-lifetime.test.mjs` and its helper;
- manifests and evidence.

**Not done:** setup, provider calls, collection or production changes.

## Verdict: PASS (offline correctness) for the exact delta. Authenticated-data readiness NOT established.

| Check | Result |
|---|---|
| **What changed** | The fenced writer now runs `flock --no-fork …` with `killSignal: 'SIGKILL'` at the **unchanged** 15,000 ms bound. `fault()` gains a synthetic-only `PAUSE_<point>` (SIGSTOP), refused unless `STORE.json` origin is `SYNTHETIC`. Nothing else in the store logic changed. |
| **Why it is correct** | With default (forking) flock, the 15 s timeout signals only the flock parent, so a node worker that still holds the lock can outlive the call and write later. With `--no-fork`, the waited PID *is* the worker. SIGKILL is needed because a stopped worker does not act on SIGTERM. The outcome stays `WRITE_OUTCOME_UNKNOWN`, the intent is kept, recovery is explicit, and there is no lock deletion or retry. |
| **New regression, run locally** (Node 20.20.0, util-linux flock 2.39.3, non-loopback connections refused, 0 zombie processes before and after) | `a-worker-lifetime` **1/1 PASS** (16 s). The neighbouring `a-fenced-store` gives 12/12 and `a-acquisition-spool` 6/6. No `--fenced-worker` process was left afterwards. |
| **Negative controls** (local, reverted afterwards) | The regression **fails** when either half is removed: `--no-fork` alone (SIGTERM) fails, `killSignal: SIGKILL` alone (forking flock) fails, and neither fails. So the test detects exactly the defect it claims to. |
| **Hosted evidence** (Codex) | Run 42279327357 / job 128103844897: 303/303 files PASS. Attributed to Codex's complete-log reading; I did not re-read that log. |

## Observations (not blocking this delta)

1. **Same pattern outside A, on production `main`.**
   - `radar-ledger.mjs` `appendRadarRows` runs a forking `flock --exclusive --wait 5 … node … --append` through `execFileSync`, with a 15 s timeout and the default SIGTERM.
   - A timeout there could leave an appending child alive after the caller has reported failure. That child would then write a radar ledger row the caller did not count.
   - This is a production radar-ledger file, not A. It is reported for a separate owner/Codex decision and is not part of this review or of Saturday.
2. **`--no-fork` depends on the host's flock supporting it.** It is present in the local util-linux 2.39.3 and on the hosted runner, as the PASS shows.
   - A host with an older flock would refuse the option before any write, which fails closed.
   - Recommendation: a one-line capability check during private-host setup (G-items), so the failure is named rather than generic.
3. **Linux-only helper.** The regression relies on `prctl(PR_SET_CHILD_SUBREAPER)` and `/proc`. It is appropriate for the Linux CI and private host, and should be documented as such.

## Offline correctness versus authenticated-data readiness

- **Offline correctness (this delta):** PASS. A timed-out or stopped writer can no longer outlive its bound and write later. The uncertain outcome stays UNKNOWN, with exactly-once recovery shown on a synthetic −$42 record.
- **Authenticated-data readiness:** **not established.**
  - G2 (production assembler from acquired originals) through G8 remain open.
  - The data is synthetic only, and there are 0 genuine admissions.
  - The acceptance rows are unchanged at 24/40.
  - Nothing here demonstrates first receipt of real provider data, custody, or separate role workers.
- **Codex's G2 checkpoint:** not yet published. It will be reviewed separately when available, without duplicating its implementation.
