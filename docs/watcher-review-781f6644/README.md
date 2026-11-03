# Independent review: watcher scheduling package, patch 781f6644

**Publication of existing review evidence only.** No new review was run for this publication. No deployment, merge, dispatch, workflow control, credential use, provider call or real message occurred.

## Subject

| Item | Value |
|---|---|
| Codex checkpoint | `7f579b23a487cdf84d80b50bab1e04e0b170cf6e` (branch `Stock2-safety-fixes`) |
| Package folder | `docs/nov2-watcher-scheduling/` (11 files; the patch itself touches 10 paths) |
| `production.patch` SHA256 | `781f6644faf97b160451d3b455dfb12efb84679a5adcec9e69a5cafdee431d2e` |
| `rollback.patch` SHA256 | `3f628c2e8a2d3788712aa94250703d83657268b11e3bcc8d8d911a12732c3c86` |
| `manifest.json` SHA256 | `5d9f8c443fc3b04cdff0231bcbfbedf2b8cd08f3037546b43d086ca847a970d7` |
| Current main reviewed against | `eae28a73cde999fd10852aea3707e705dcce3421` |
| Main tree / patched tree | `443a9bc9dc1f632fa42b7ce8ecbb96324a4b1264` / `c2c879b51a93c6daf84c8f0d66def61f7df5983f` |

## Attribution: who ran what

| Who | What | Evidence |
|---|---|---|
| **Separate reviewer** (a Claude subagent spawned by the Claude review session; read-only brief, own worktrees, 3 Nov 2026 10:02–10:10 UTC) | All execution below: hash checks, 37-pin check, apply/rollback/reverse proof, full suites on both trees, focused tests, race reproduction, code reading | `command-log.md` (all 24 Bash calls, verbatim commands, outputs truncated at 3,000 chars), `run.sh`, `results-*.txt`, `logs/`, `focused-results.txt`, `race.mjs`, `race-output.txt` |
| **Claude review session** (the delegating session) | Spot-checked after the report: patch SHA256 prefix `781f6644faf9`, folder has 11 files, the `state.started` min-only line in the patch, and the "133/133" text in the readiness doc. Did **not** re-run the watcher suites. Assembled and sanitized this folder. | This README |

The evidence was retained: per-file logs, results lists, runner script and race script were still in the scratch directory, and the reviewer transcript was retained for the command log. The reviewer's two git worktrees were removed after the run (call 24), so trees were not retained; their tree hashes are recorded above.

## Commands and results (reproduced by the separate reviewer)

1. **Identity.** `sha256sum` on every file extracted from `7f579b23:docs/nov2-watcher-scheduling/` (call 2). Patch and rollback hashes match `manifest.json`, `readiness-20261103.json` and the README.
2. **Pins.** Node check of every `files[].beforeSha256` and `unchangedDependencies[].sha256` against `git show origin/main:<path>` (call 5): `checks 37 bad 0`.
3. **Apply / inverse** (call 6): `git apply --check` clean; `after bad 0` for all 10 after-hashes; applying `rollback.patch` gives tree `443a9bc9…` = main; reverse-applying `production.patch` gives `443a9bc9…` = main.
4. **Full suite**, mirroring `.github/workflows/tests.yml` (`node "$f"` per file), sequential, `env -i PATH HOME`, Node v20.20.0 (`run.sh`, calls 8–9, 22):

   | Tree | Test files | Pass | Fail |
   |---|---|---|---|
   | main `eae28a73` | 130 | 129 | `test/try-small-audit.test.mjs` |
   | main + patch | 132 | 131 | `test/try-small-audit.test.mjs` |

   Both failures are the same known baseline: cases 1 and 3b (an expired dated fixture), 14 pass / 2 fail in each tree. **No new regression.** Per-file logs: `logs/logs-{main,patched}-<file>.log`.
5. **Focused actual-caller tests** (call 23; see `focused-results.txt`): guard + Nov 2 clock + Nov 2 guard 38/38; publish, incident-revision, resilience and retry-recovery 27/27; main `watcher-guard.test` 8/8.
6. **Race reproduction** (call 19; `race.mjs`, `race-output.txt`): synthetic three-tick sequence on winter day 2026-11-04.

## Verdict (separate reviewer): PASS WITH CONDITIONS

- **Actual-job attribution: correct, with one low-severity race.** The guard uses job `started_at` and the earliest measured job wins. Queued runs are unmeasured, so the Nov 2 replay gives 08:53 and no false LATE. The race: an opposite-season run caught while its admission step is still in progress is counted as MEASURED. `state.started` only decreases, so the guard keeps that run (tick 3: `started 569`, `startedRunId 1`), and a real 09:37 start gets no LATE alert. Fixing it means ignoring a job until its admission step has succeeded.
- **Early stop through duplicates: fixed.** It is evaluated before the running and queued branches. A first run cancelled after more than 10 minutes counts as an early stop, with no automatic restart.
- **Observation budget: fixed.** `RUN_START` now starts after the pre-open wait, and the loop stops after 15:00. The job timeout is 360 minutes, so an on-time 09:10 start leaves only about 8–10 minutes after 15:00 for save and push.
- **DST admission: correct.** Closed days, holidays, opposite-season or unknown crons, starts before 09:10 or after 15:00, and unsupported events are all refused. Admission is checked before and after the cache restore and again in-process, before any state is written.
- **Archive and delivery protections: preserved.** Session-finished skip, progress archive, per-run `wx` archives and the canonical selector are unchanged. Guard state is now written atomically (temp file + rename).
- **Misleading figures in Codex material:**
  - "133/133 current-main files" is wrong: main has 130 test files and main+patch has 132.
  - The baseline count of 131 is wrong.
  - The TRY SMALL pass relied on a historical fixture clock.
  - The README says "ten-file", but the folder holds 11 files (the patch touches 10 paths).
- **Not verified by the reviewer:** "6 of 7 baseline defect controls fail on old code", and the Nov 2 historical figures (318/331 slots, blob IDs).

## Deployment prerequisites

1. Owner written approval, separate from ACTIONS and mentor. Re-check all 37 pins and both patch hashes on fresh main immediately before applying.
2. Deploy outside the watch window, with no ignition run in progress.
3. Optional: fix the admission-in-progress race first.
4. Accept that coverage of the open depends on the guard. The scheduled run typically starts around 09:45–10:18 New York, so the 09:25 record and the open rely on the guard's start request around 09:10. `bot.yml` must be enabled and healthy.
5. Watch the first scheduled days: admission reason, job and process clocks, archives and guard attribution.

## Sanitization

- Local scratch paths are replaced with `$W` / `$SCRATCH`.
- The logs were checked for token patterns, email addresses and absolute paths, and for owner files (`my-positions`, `my-trades`, `halal.json`): none were present (the only pattern hits were false positives on the word "risk-adjusted").
- All tests ran on synthetic or loopback fixtures.

`SHA256SUMS` lists every file in this folder.
