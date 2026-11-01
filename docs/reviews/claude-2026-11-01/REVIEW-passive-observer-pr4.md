# Independent review: passive snapshot-contract observer, PR #4

**Reviewer:** Claude.

**Scope:** read-only review. I made no implementation change, activation, installation, dispatch, provider call or message. Every run used synthetic local services, with external fetch refused.

**Verdict: PASS** for the default-off package. One minor finding (O1) should be fixed before any activation; O2 and O3 are notes.

## What was reviewed

| Item | Value |
|---|---|
| PR #4 head | `7b3e5a6cae542f2290efa2c283d4b118b23bc31a`; the package is byte-identical at source `fbbd0e43` |
| Checkpoint `71cccb62` | Does not contain the observer files; it links to PR #4 / `fbbd0e43` |
| Runtime patch | SHA256 `f84964369ba8479b14a241780bc4ca44a84d32f33a7cf56f32033c1e19b355ca` (4 files) |
| Activation patch (unapproved) | `c4154429…`: one line, `CONTRACT_OBSERVER: research` in `ignition.yml` |
| `market-data-contracts.mjs` | Byte-identical to the reviewed `f61bcf74` |

## Compatibility with current production

- **Main at the time of review:** `8c638c5b7906cbf513da5d85e69e5f1bf7b99df9`.
- **Newer changes since the PR base `97001c3f`:** Agent-A/Agent-C research, `scan.mjs`, `yardstick.mjs`, `anomaly-lab.mjs` and others. None touch `ignition-watch.mjs`, `snapshot-fields.mjs` or the observer.
- **Patch application:** the runtime and test patches apply cleanly to current main, and the 4 runtime files are then byte-identical to the PR head.

## Independently executed (this reviewer, Node 20.20.0, the production watcher runtime)

**Tests**
- Author tests: `watcher-contract-observer` 7/7, `watcher-contract-parity` 4/4, package test 1/1 (at the PR head).
- **Full suite on current main plus the PR #4 patches,** with `INCIDENT_WATCHER_SRC` set: 131 files, 1,272 pass, 0 fail.

### Actual-watcher harness (`observer-harness.mjs`)

What it compares:
- the real `ignition-watch.mjs` under three conditions: unpatched main, patched with the observer off, patched with it on;
- the same synthetic Massive and Alpaca services and a fixed clock;
- the provider request sequence (hashed), and every persisted file under `data/`, normalized to mask timestamps and SHAs, with the observer directory excluded.

| Run | Provider requests | Request sequence | Persisted files differing from main |
|---|---:|---|---|
| main, off | 642 | `360b7700…` | — |
| patched, off | 642 | identical | none (10 files) |
| patched, on | 642 | identical | none (10 files) |

**Observer on**
- 321 minute records (09:40–15:00), each self-hashed (sha OK).
- **Contents:** aggregate counts (missing or future clocks, one-sided or crossed quotes, unknown size units, volume as-of unknown), plus provider and feed tallies, `entryPolicy: NOT_ADOPTED_NOT_EVALUATED` and `fillGuarantee: false`.
- **Provenance:** day, run ID, source SHA, minute, observedAt.
- **No price fields.**
- **Health line:** `ACTIVE/321`, `fullSession: false`, `sourceCoverageVerified: false`, `policyApproved: false`.

**Observer off:** no directory and no health line.

**Concurrent 250-symbol case:** the request sequence is identical across all five runs (main ×3, off, on). Three heartbeat-derived files differ between runs, but unpatched main differs from itself across three identical runs in the same three files, so that is run-to-run timing noise, not the patch.

### Failure isolation (observer on)

In every mode the watcher exits 0, makes the same 642 requests and writes the same persisted data.

| Mode | Observer result |
|---|---|
| Run directory is a regular file | QUARANTINED in memory |
| Pre-existing QUARANTINED marker | QUARANTINED |
| Conflicting record for the first minute | QUARANTINED |
| Symlinked run directory | QUARANTINED (see O1) |
| Read-only directory | **Not valid as a test:** I ran as root, so permissions don't block writes |

### Code review

- **Default off:** enabled only when `CONTRACT_OBSERVER === 'research'`.
- **Isolation:** every observer operation is inside try/catch and only ever switches the observer to QUARANTINED.
- **Bounds:** at most 331 records of 6,144 bytes each per run (2,033,664 bytes). Records are written with `wx` and fsync.
- **Strategy inputs:** the new `quoteBidSizeRaw` / `quoteAskSizeRaw` / `quoteSizeUnit` row fields are read only by the observer, and the top-50 path deletes them. Persisted output is unchanged (above).
- **Duplicate minutes:** the watcher loop cannot revisit a minute within one process, because iterations start at least 60 s apart. A rerun gets a new attempt and so a new run ID. Conflict-quarantine therefore applies only to real anomalies.
- **Missingness:** a minute with no record means a missed or skipped iteration. The health line counts records but doesn't list the missing minutes. It is labelled `fullSession: false`, so it makes no completeness claim.

## Findings

- **O1 (minor; fix before activation): the quarantine marker is written through a symlink.**
  - When the run directory is a symlink, `noLinks` correctly refuses to record.
  - But `quarantine()` then writes `QUARANTINED` (fixed content, flag `wx`) through that symlink into its target. I reproduced this directly with `createContractObserver` on a symlinked root.
  - Impact is low: fixed content, never overwrites, and a symlink must already exist inside `data/ignition-runs`. But it contradicts the module's own no-links rule.
  - Suggested fix: don't write the marker when a link is detected anywhere in the path (in-memory quarantine only), or open the marker with `O_NOFOLLOW` after an `lstat` check.
- **O2 (note): the contracts module ships without its tests.** The package adds `market-data-contracts.mjs` but not `test/market-data-contracts.test.mjs` (26 cases, on branch `claude/market-data-contracts`). If this package reaches main alone, that module is untested there.
- **O3 (note): missing minutes are implicit.** Missingness is inferable from absent files and the record count, but there is no explicit list of missing minutes. That's acceptable for research use; the record already disclaims full-session coverage.

## Hosted CI (GitHub; not executed by me)

- **PR #4 head `7b3e5a6c`:** Tests 41304745853 (push) and 41305375189 (pull_request), success.
- **Combined compatibility** (per the author): `297b43c6`, job 124848352743. I didn't inspect it.

## Author evidence only (not reproduced)

- Physical disk-quota behaviour.
- Behaviour on a real GitHub runner with the activation patch (not installed).

## Is Node 22 verification required?

**No.** The observer runs inside the production watcher, which `ignition.yml` runs on `node-version: 20`; `tests.yml` and `premarket.yml` also use 20. I ran all checks on Node 20.20.0. Node 22 would matter only if the watcher workflow's runtime changed.

A review PASS is not activation or deployment approval.
