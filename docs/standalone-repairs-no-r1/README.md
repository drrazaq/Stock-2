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

## Live switch, loaded-code evidence and rollback limits (F3, corrected per Codex 6733545959)

### How new code is picked up

- **Bot job: refresh is attempted, adoption is not bounded.**
  - `bot.yml`'s loop runs `git pull -q --rebase -X theirs 2>/dev/null || git rebase --abort 2>/dev/null || true` before each iteration, then starts new `node scan.mjs` / `node watcher-guard.mjs` processes. A failed pull is swallowed and the loop continues on whatever code is checked out.
  - The time each iteration takes to process, save and mirror is also unbounded. The running bot job **may** therefore adopt `C` at some later iteration, or not before it ends. No switch time is promised.
  - The same holds for a revert.
- **Watcher, scan and calendar jobs** check out once. Their run's `head_sha` identifies the code they ran. `ignition.yml` changes apply to the next run.

### Loaded-code evidence (required; otherwise UNKNOWN)

A bot job's head, its green status, or a data commit made after the push does **not** show which code the bot loop ran. An old in-flight process can still save after the push, even rebased onto `C`, and `run.log` is not retained. Acceptable evidence:

| Component | Evidence that the new code ran | Note |
|---|---|---|
| Watcher guard (bot loop) | The **first** bot data commit after the push that **introduces** `"version":2` / `"attempts"` into `data/watcher-guard.json` | Only the new guard creates these keys. Later commits are not independent proof, because the old guard copies existing keys forward. |
| Scanner (bot loop) | A delivered Telegram message whose text only `C` can produce (for example the open-check "STATUS UNKNOWN" holding line, or the calendar "figures UNKNOWN (saved before the exact-series check…)" line), with its delivery time | The owner's forwarded message, or the bot's own reply record |
| Calendar job | That run's `head_sha` = `C`, and `data/calendar-status.json` gaining `officialSources` | Single checkout, no pull loop |
| Watcher job | That run's `head_sha` = `C` | Single checkout |

**If none of these is present for a component, its loaded-code status is UNKNOWN.** No adoption is claimed for it, and no check that depends on it is marked passed.

### Mixed old/new processes during the switch (verified forward cases)

| Case | Verified behaviour |
|---|---|
| New calendar reader on an old-layout file | Shows "figures UNKNOWN (saved before…)", never merged figures (`cal-rollback-compat.test.mjs`) |
| New watcher guard on old guard state | Converts it to `UNCONFIRMED_LEGACY` attempts and does **not** re-dispatch (`guard-rollback-sim.mjs`) |
| `data/alert-state.json` | The same `{day, sent}` layout in both versions |

**These are the verified cases, not a blanket concurrency guarantee.** That `C` and its revert touch no data path proves only that the inverse preserves data.

### Rollback limits (verified with the actual old and new code; require explicit owner acceptance, or a rollback inside the stated boundary)

- **R-A, calendar units (up to 6 days).**
  - After a revert, once the **old** calendar job runs on a file the new job wrote, it keeps the new-layout rows until its provider refresh (up to 6 days).
  - The old message then shows some figures **without units**: "Jobs report: forecast 40, previous 29" for 40K / 29K, and CPI "0.3" for 0.3%.
  - Nothing crashes. No procedural boundary avoids this without changing data or code, so it needs the owner's **explicit acceptance** before approval. The alternative is a separately reviewed forward-compatibility change, which is not in this package.
- **R-B, watcher guard on the rollback day (found in this correction).**
  - The new guard records its start attempts only in `attempts`, not in the old `dispatched` list.
  - Actual functions, `guard-rollback-sim.mjs`: on Mon 16 Nov, the new guard dispatches at 09:16 NY; an old guard restored by rollback dispatches **again at 09:20** with a second "WATCHER NOT STARTED" alert. The old guard's own control waits 15 minutes.
  - This is limited to that New York day, because guard state resets daily, and to at most 3 old-guard attempts. It never happens while a watcher run is visible as running or queued.
  - **Boundary that avoids it:** roll back only **outside 09:00–15:05 New York on a trading day**. Otherwise owner acceptance is needed.
- **No mandatory safeguard is removed** by a rollback. It restores the previous code exactly (the inverse is byte-exact on the 25 paths). Data saved since is kept.

## Applying it (only after separate owner approval; not authorized by this document)

1. Fresh precheck: main must still match `6e72a8d0` on the 25 paths. If not, stop and rebase for re-review.
2. Build `C` on the then-current main, verify it, then make one fast-forward source-only push.
3. Check the Tests run on `C`.
4. No pause is required. The running bot job may load `C` at a later loop iteration (no time promised; see qualifications). Watcher and scan jobs use it from their next run.
5. **Rollback:** `git revert C`, or `inverse.patch`, preferably outside 09:00–15:05 New York on a trading day (R-B). The tree returns byte-identical on the 25 paths and data saved since is kept, subject to limit R-A, which needs explicit owner acceptance.
6. **First observations** (each needs the loaded-code evidence above, otherwise UNKNOWN): the next bot run, the next intraday market-hours check, the next watcher day (14:10 UTC on a weekday) and the next calendar refresh.
