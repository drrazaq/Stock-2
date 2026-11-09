# Standalone repairs without R1, rev2 (review only; not approved, not deployed)

This package ships the already-reviewed **calendar, watcher, open-check and intraday price-freshness repairs** on their own. It contains **no R1 encryption**.

| Needs no | Details |
|---|---|
| New or rotated key | none. The calendar's **existing** `PRIVATE_KEY` encryption of `data/calendar.enc` and its access are unchanged. |
| Secret | none is added |
| Migration | none |
| Workflow pause or dispatch | none |
| Data change | production data and newer code on main are preserved |

| Item | Value |
|---|---|
| Package commit (review branch `claude/standalone-repairs-no-r1-rev2`) | `89d21db67cc9da1ab8254144d5d97ab80b5c4de3`, sole parent = production main `6e72a8d0`. Supersedes rev1 `10874f68` (branch `claude/standalone-repairs-no-r1`, kept unchanged). |
| Paths | **25** (`paths`; rev2 adds `test/try-small-audit.test.mjs`); fingerprint, size and Git mode of each in `binding.json` |
| `source.patch` / `inverse.patch` | against main `6e72a8d0`; hashes in `SHA256SUMS` |
| Package tree | `fbd577399679dee0a36f9c92005ecf12fd365f2e` |
| Derived from | reviewed combined candidate `73aa701f` (Codex PASS 6726424167), with every R1 change removed |

## What it repairs (each defect reproduced on production main `6e72a8d0`)

The package's own regression tests were run against **production code**:

| Area | Test on production main | On this package |
|---|---|---|
| Intraday open check: no-stop holding with no valid price shown as HOLD; first check skipped when quotes fail | `open-check-repair` **16 of 17 fail** | pass |
| Alerts sent with a price that expired between fetch and send / during a retry | `intraday-alert-send-time` 3 fail; `intraday-alert-evidence` 3 fail | pass |
| BUY NOW card: 20-minute boundary, and later parts or retries sending an expired price | `buynow-evidence` 1 fail; `buynow-multipart` 2 fail | pass |
| Stop batch timing wording ("when checked at") | `stop-alert-validity` 3 fail | pass |
| Watcher: Nov 2 clock incident and season-correct start | `watcher-nov2-clock` **8 of 9 fail**; `watcher-cadence-review` 2 fail; `watcher-guard` cannot load (no `watcherJobEvidence` export) and `watcher-nov2-guard` cannot load (`watcher-schedule.mjs` missing) | pass |
| Economic calendar exact series | `econ-calendar-exact-series` cannot load (`econ-series.mjs` missing) | pass |
| Health line watcher qualification; SEC 404 wording | `health-text-watcher-qualification` 4 fail; `discover-sec-note` 3 fail | pass |

**Codex's own reproducers**, unmodified, with `REVIEW_TREE` set to each tree:

| Reproducer | Production main | This package |
|---|---|---|
| `09f58ca5/actual-send` | 3 fail | 4/4 |
| `09f58ca5/buy-now` | 1 fail | 4/4 |
| `cdda3dc3/multipart` | 2 fail | 4/4 |
| `df5ee960/general-alert` | 2 fail | 3/3 |

## How R1 was removed (exact, mechanical)

- **Mixed files** (`scan.mjs`, `ignition-watch.mjs`, `.github/workflows/ignition.yml`): three-way merge of `73aa701f` minus the R1 diff (`b0d76987` → `67f1beba`).
  - Two conflicts were resolved by hand. In `scan.mjs`, the later `nyStamp` import was kept and the sealed-store import dropped. In `ignition.yml`, the composition's `steps.ready.outputs.run == 'true'` gating was kept, with main's own push lines.
  - Check: every line that differs from `73aa701f` is either an R1-introduced line removed, or main's own line restored (`scan.mjs` 26 removed / 15 restored; `ignition-watch.mjs` 21 / 11; `ignition.yml` 12 / 3, the 2 exceptions being the now-empty `env:` headers of the removed `SEALED_SECRET`).
- **Whole files from `73aa701f`:**
  - code: `calendar.mjs`, `discover.mjs`, `econ-series.mjs`, `watcher-guard-core.mjs`, `watcher-guard-history.mjs`, `watcher-guard.mjs`, `watcher-schedule.mjs`;
  - 12 test files.
- **`test/watcher-nov2-fixture.mjs`:** the plaintext original from branch `Stock2-safety-fixes` (content sha256 `954c2ed5…`), identical to `73aa701f` apart from the three sealed lines.
- **`test/watcher-nov2-clock.test.mjs`:** `73aa701f` with its two `.sealed` path edits reverted. The current stop wording assertions are kept.
- **Not included (R1-only):** `sealed-*.mjs`, `r1-*.mjs`, `.github/sealed-git.sh`, `bot-save.sh`, `save-data.sh`, every other workflow, `health.mjs`, `watcher-reporting.mjs`, `opportunity-radar.mjs` (sealed reader), the R1 reader/writer changes in the other modules, `test/load-scan.mjs`, R1 tests and docs, `.gitattributes`, `.gitignore`.
- **Encryption mentions left:** the only `PRIVATE_KEY` in the patch is the synthetic test key of the calendar's **existing** `data/calendar.enc` encryption, which production already uses.

## Independent review of rev1: PASS (`REVIEW.md`); rev2 changes only `test/try-small-audit.test.mjs` and this README

No blocking findings. Non-blocking points, all inherited unchanged from the reviewed candidate:
- If `watcher-schedule.mjs` itself crashed, no RUN FAILED message is sent; the watcher guard remains the warning.
- An unused `alerts` list remains in `intraday()`.
- Comments still carry review labels such as "R1 rev16".

## Checks (offline; Node 20 with the network guard)

- **Complete test inventory (F2):** 155 files = 154 root `test/*.test.mjs` + `tests/instrument-type.test.mjs` (main: 143 + 1 = 144).
  - On rev2 at the actual clock (9 Nov, Node 20, network guard): **155/155 files PASS**. That is 154/154 root files with 1,470/1,470 tests, plus `tests/instrument-type` 9/9.
  - Rev1's "153/154" counted root files only and is superseded.
- **Deterministic try-small fixture (F1):** `test/try-small-audit.test.mjs` is the development version from `b9753abb2`, unchanged.
  - Its stale/fresh cases use real NYSE sessions (`closes[6]` is 6 sessions old, `closes[1]` is 1) with positive controls kept. No runtime gate was changed.
  - Fixed-clock runs on this package and on main:

    | Clock (UTC) | Old fixture | New fixture |
    |---|---|---|
    | 2026-11-09 04:30 (NY Sunday 23:30) | 15/16 (case 1b fails) | 16/16 |
    | 2026-12-28 04:30 | 15/16 (case 1b fails) | 16/16 |
    | 2026-11-09 05:30 | 16/16 | 16/16 |
    | 2026-11-07 15:00 | 16/16 | 16/16 |
    | 2026-11-10 03:59 | 16/16 | 16/16 |
- **Gated watcher suites** (`INCIDENT_WATCHER_SRC` = this package): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
- **Precheck** against `6e72a8d0`: PASS (25 files, 0 drift).
- **Build and verify:** `--build-unit 6e72a8d0 89d21db6` then `--verify-unit`: PASS (25 files). Unit tree `fbd57739…` = package tree.
- **Patches:** `source.patch` on main gives the package tree, and `inverse.patch` restores main exactly.
- **STOP R2 pins** (`stop-pins.json`): 4 of 17 pinned files change: `scan.mjs`, `ignition-watch.mjs`, `ignition.yml` and `test/stop-alert-validity.test.mjs`. On main, `scan.mjs` already differs from its STOP pin because of the approved 7 Nov D1–D4 patch.

## Live-switch and rollback qualifications (F3)

- **The running bot job switches mid-run.**
  - `bot.yml`'s loop runs `git pull --rebase` before every iteration and starts a new `node scan.mjs` / `node watcher-guard.mjs` process each time.
  - So the bot job already running when `C` is pushed loads `C` at its next iteration: within about 5 minutes, or 25 seconds in reply mode. The same applies to a revert.
  - Its application output goes to `run.log`, which the job does not retain. A green hosted job therefore cannot show which source ran.
  - First post-change evidence must name the loaded source by content:
    - a message string that only `C` produces (open-check STATUS UNKNOWN wording, or the calendar "figures UNKNOWN (saved before the exact-series check…)" line);
    - or a data commit made after `C`'s push by the bot.
  - The job head or the next job's head is not proof.
- **Running watcher and scan jobs** keep their own checkout until they end. The workflow file `ignition.yml` takes effect for the next run.
- **Calendar data compatibility** (`cal-rollback-compat.test.mjs`, review evidence, not part of the package: copy it into this package's `test/` and run `OLD_TREE=<checkout of main 6e72a8d0> node test/cal-rollback-compat.test.mjs`; runs the actual `calendar.mjs` job and the actual `calendarText`/`macroNow` readers of main `6e72a8d0` and of this package on synthetic schedules; 4/4 PASS):
  - **First run (old file, new code):** the new reader shows every saved row as "figures UNKNOWN (saved before the exact-series check; the next calendar run refreshes them)". It never shows merged figures. The next calendar run (`calendar.yml`: weekdays 20:45 UTC, Sundays 05:30 UTC) converts the file to the new layout (schema 2).
  - **Rollback (new file, old code):** the old reader renders the new file without errors or broken values. But once the old calendar job runs on a new-layout file, it keeps the schema-2 rows until its provider refresh (up to 6 days). The old message then shows some figures **without units**, for example "Jobs report: forecast 40, previous 29" instead of 40K/29K, and "CPI forecast 0.3" instead of 0.3%. This is a display limit of the old code, not a crash.
  - **So rollback is code-safe at any time, but calendar figures can be mislabelled for up to 6 days afterwards.** No data file is rewritten by the rollback itself.
- **Concurrent saves:** the package changes no data path, so `C` or its revert cannot conflict with a data commit. The bot's `pull --rebase -X theirs` save is unchanged.

## Applying it (only after separate owner approval; not authorized by this document)

1. Fresh precheck: main must still match `6e72a8d0` on the 25 paths. If not, stop and rebase for re-review.
2. Build `C` on the then-current main, verify it, then make one fast-forward source-only push.
3. Check the Tests run on `C`.
4. No pause is required. The running bot job loads `C` at its next loop iteration (see qualifications); watcher and scan jobs use it from their next run.
5. **Rollback:** `git revert C`, or `inverse.patch`. The tree returns byte-identical on the 25 paths, and data saved since is kept. It is code-safe at any time, but subject to the calendar display limit above.
6. **First observations:** the next bot run, the next intraday market-hours check, the next watcher day (14:10 UTC on a weekday) and the next calendar refresh.
