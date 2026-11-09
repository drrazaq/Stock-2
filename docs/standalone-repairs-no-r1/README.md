# Standalone repairs without R1, rev3 (review only; not approved, not deployed)

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
| Package commit (review branch `claude/standalone-repairs-no-r1-rev3`) | `0e89cb90c1f9b9a4ec199a0c70b66115a6501f22`. Its parent is rev2 `89d21db6`, whose sole parent is production main `6e72a8d0`. Supersedes rev2 (branch `claude/standalone-repairs-no-r1-rev2`) and rev1 `10874f68`; both branches are kept unchanged. |
| Paths | **27** (`paths`; rev2 added `test/try-small-audit.test.mjs`; rev3 adds `test/watcher-guard-rollback-compat.test.mjs` and its pinned fixture `test/watcher-guard-core-pre-repair-6e72a8d0.fixture.mjs`); fingerprint, size and Git mode of each in `binding.json` |
| `source.patch` / `inverse.patch` | against main `6e72a8d0`; hashes in `SHA256SUMS` |
| Package tree | `cdb70068ac49ae1edddb6bf1dbc1b2af4f556ef6` |
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

## Independent review of rev1: PASS (`REVIEW.md`); rev2 changed only `test/try-small-audit.test.mjs`; rev3 changes only the watcher guard (R-B, below)

No blocking findings. Non-blocking points, all inherited unchanged from the reviewed candidate:
- If `watcher-schedule.mjs` itself crashed, no RUN FAILED message is sent; the watcher guard remains the warning.
- An unused `alerts` list remains in `intraday()`.
- Comments still carry review labels such as "R1 rev16".

## Checks (offline; Node 20 with the network guard)

- **Complete test inventory (F2):** 156 files = 155 root `test/*.test.mjs` + `tests/instrument-type.test.mjs` (main: 143 + 1 = 144).
  - On rev3 at the actual clock (9 Nov, Node 20, network guard): **156/156 files PASS**. That is 155/155 root files with 1,480/1,480 tests, plus `tests/instrument-type` 9/9. No network attempt was logged.
  - Rev2 had 155/155 files (1,470 root tests); the 10 added tests are the R-B regression.
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
- **Gated watcher suites** (`INCIDENT_WATCHER_SRC` = this package's `ignition-watch.mjs`): `watcher-resilience` 9/9, `watcher-incident-revision` 11/11 (rerun on rev3).
- **Precheck** against `6e72a8d0`: PASS (27 files, 0 drift).
- **Build and verify:** `--build-unit 6e72a8d0 0e89cb90` then `--verify-unit`: PASS (27 files). Unit tree `cdb70068…` = package tree.
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
| New watcher guard on old guard state | Converts it to `UNCONFIRMED_LEGACY` attempts and does **not** re-dispatch (`guard-rollback-sim.mjs`; `test/watcher-guard-rollback-compat.test.mjs`) |
| Old watcher guard on new guard state | Keeps its 15-minute spacing and 3-attempt cap (rev3; same evidence) |
| `data/alert-state.json` | The same `{day, sent}` layout in both versions |

**These are the verified cases, not a blanket concurrency guarantee.** That `C` and its revert touch no data path proves only that the inverse preserves data.

### Rollback limits (verified with the actual old and new code)

- **R-A, calendar units (no guaranteed time bound; corrected per Codex 6734009022).**
  - After a revert, once the **old** calendar job runs on a file the new job wrote, it carries the new-layout rows forward (`calendar.mjs` of main `6e72a8d0`, lines 71–73, 125, 128–130).
  - They are replaced **only by a successful TipRanks refresh**, which needs all of: `TIPRANKS_KEY` present, the 6-day interval elapsed since the last success, at least 20 calls left that month, and a reply that parses. If any fails (no key, budget skip, error), the old rows are kept again.
  - Otherwise each affected row drops out only **3 days after its own event date**. Rows for scheduled releases further ahead can therefore persist for weeks.
  - **"6 days" is the nominal refresh interval, not a repair deadline.** Whether the exposure has ended is shown only by `data/calendar-status.json` reporting a TipRanks `ok:` refresh after the revert, or by every affected row's event date being more than 3 days past.
  - The old message then shows some figures **without units**: "Jobs report: forecast 40, previous 29" for 40K / 29K, and CPI "0.3" for 0.3%.
  - Nothing crashes. No procedural boundary avoids this without changing data or code, so it needs the owner's **explicit acceptance** before approval. The alternative is a separately reviewed forward-compatibility change, which is not in this package.
  - **No bounded compatibility change exists inside this package.** The new scanner itself reads the legacy `fc` / `act` / `kind` fields of the new rows (`scan.mjs`), so the writer cannot stop emitting them without also changing the reader; and the old job's unit-less copy happens in the **old** `calendar.mjs`, which a revert restores. R-A therefore remains an owner decision: accept it, or ask for a separately reviewed change.
- **R-B, watcher guard on the rollback day: CLOSED in rev3 by code (Codex 6733778910).**
  - **Fix:** the new guard records every start reservation in the legacy `dispatched` list as well as in `attempts`, before the request is sent, which is what the old guard itself did. The CLI no longer appends to `dispatched`. Any reservation an old guard adds is read back by the new guard as an `UNCONFIRMED_LEGACY` attempt, never as an accepted request. "Guard request accepted" in `watcher-starts.jsonl` is read from attempt statuses only.
  - **Evidence:** `test/watcher-guard-rollback-compat.test.mjs` (10 tests) runs the old core of main `6e72a8d0`, vendored byte-for-byte with its sha256 pinned, against the same state as the new core:
    - new → old: after an ACCEPTED, REJECTED or UNKNOWN new request, the old guard waits 15 minutes; after 3 new attempts it sends its DOWN alert and never a 4th start;
    - old → new and old → new → old → new cycles: at most 3 starts, 15-minute spacing kept, no acceptance invented, no duplicate attempts;
    - visible running, queued or history-UNKNOWN never dispatch under the new guard, with or without old-guard state;
    - no warning is removed: NOT STARTED, DOWN, LATE and STOPPED EARLY still fire.
  - On rev2 code, 7 of these 10 tests fail. `guard-rollback-sim.mjs` rerun unchanged on rev3: the old guard at 09:20 now gives **dispatch false** (on rev2 it dispatched again).
  - **Correction to the rev2 description:** my earlier simulation called `guardDecide` only. The rev2 CLI did copy **accepted** requests into `dispatched`, so rev2's actual exposure was narrower than stated: an old guard could re-request early only after a REJECTED or UNKNOWN request, and its cap counted accepted requests only. Rev3 removes that exposure too.
  - **No rollback time boundary is needed for the guard any more.** Rolling back restores the old guard's own known limits (it uses run status, not job evidence); that is the pre-repair behaviour, not a compatibility defect.
- **No mandatory safeguard is removed** by a rollback. It restores the previous code exactly (the inverse is byte-exact on the 27 paths). Data saved since is kept.

## Applying it (only after separate owner approval; not authorized by this document)

1. Fresh precheck: main must still match `6e72a8d0` on the 27 paths. If not, stop and rebase for re-review.
2. Build `C` on the then-current main, verify it, then make one fast-forward source-only push.
3. Check the Tests run on `C`.
4. No pause is required. The running bot job may load `C` at a later loop iteration (no time promised; see qualifications). Watcher and scan jobs use it from their next run.
5. **Rollback:** `git revert C`, or `inverse.patch`, at any time (R-B is closed in rev3). The tree returns byte-identical on the 27 paths and data saved since is kept, subject to limit R-A (no guaranteed time bound), which needs explicit owner acceptance.
6. **First observations** (each needs the loaded-code evidence above, otherwise UNKNOWN): the next bot run, the next intraday market-hours check, the next watcher day (14:10 UTC on a weekday) and the next calendar refresh.
