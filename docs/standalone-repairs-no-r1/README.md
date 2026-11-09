# Standalone repairs without R1 (review only; not approved, not deployed)

This package ships the already-reviewed **calendar, watcher, open-check and intraday price-freshness repairs** on their own. It contains **no R1 encryption**.

| Needs no | Details |
|---|---|
| Key | none is used or created |
| Secret | none is added |
| Migration | none |
| Workflow pause or dispatch | none |
| Data change | production data and newer code on main are preserved |

| Item | Value |
|---|---|
| Package commit (review branch `claude/standalone-repairs-no-r1`) | `10874f6867cd6564c236e2dba217497f1cc591e8`, sole parent = production main `6e72a8d0` |
| Paths | **24** (`paths`); fingerprint, size and Git mode of each in `binding.json` |
| `source.patch` / `inverse.patch` | against main `6e72a8d0`; hashes in `SHA256SUMS` |
| Package tree | `d2d69949e4e85dbe8a29d3ec3ba7ab427944460f` |
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

## Independent review: PASS (`REVIEW.md`)

No blocking findings. Non-blocking points, all inherited unchanged from the reviewed candidate:
- If `watcher-schedule.mjs` itself crashed, no RUN FAILED message is sent; the watcher guard remains the warning.
- An unused `alerts` list remains in `intraday()`.
- Comments still carry review labels such as "R1 rev16".

## Checks (offline; Node 20 with the network guard)

- **Full serial suite:** 153/154 in my run. The one failure, `try-small-audit` case 1b, failed identically on unmodified main at that time of day. It is the clock-dependent fixture Codex documented on 2 Nov, and it passes on both trees in the independent reviewer's later run (1,470/1,470 tests across 154 files on the package; 1,374/1,374 on main).
- **Gated watcher suites** (`INCIDENT_WATCHER_SRC` = this package): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11.
- **Precheck** against `6e72a8d0`: PASS (24 files, 0 drift).
- **Build and verify:** `--build-unit 6e72a8d0 10874f68` then `--verify-unit`: PASS. Unit tree = package tree.
- **Patches:** `source.patch` on main gives the package tree, and `inverse.patch` restores main exactly.
- **STOP R2 pins** (`stop-pins.json`): 4 of 17 pinned files change: `scan.mjs`, `ignition-watch.mjs`, `ignition.yml` and `test/stop-alert-validity.test.mjs`. On main, `scan.mjs` already differs from its STOP pin because of the approved 7 Nov D1–D4 patch.

## Applying it (only after separate owner approval; not authorized by this document)

1. Fresh precheck: main must still match `6e72a8d0` on the 24 paths. If not, stop and rebase for re-review.
2. Build `C` on the then-current main, verify it, then make one fast-forward source-only push.
3. Check the Tests run on `C`.
4. No pause is required. Running jobs keep their own checkout, and the next scheduled bot, scan and watcher runs use the new code.
5. **Rollback:** `git revert C`, or `inverse.patch`. The tree returns byte-identical on the 24 paths, and data saved since is kept. Unlike R1, this is safe at any time, because nothing about data storage changes.
6. **First observations:** the next bot run, the next intraday market-hours check, the next watcher day (14:10 UTC on a weekday) and the next calendar refresh.
