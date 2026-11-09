# Independent review: 10874f68 (standalone repairs without R1)

Package: 10874f6867cd6564c236e2dba217497f1cc591e8, parent 6e72a8d0 (production main), tree d2d69949.
Reference: combined candidate 73aa701f; R1 range b0d76987..67f1beba (b0d76987 is the merge base of main and 73aa701f).
Method: read-only, offline. I used temporary worktrees (now removed), Node 20 and the network guard. Nothing was pushed, commented or run on GitHub.

## Verdict: PASS (no blocking findings)

---

## Q1. Any R1 or encryption code or wiring in the package? None found.

- I grepped all 24 package paths for `sealed|SEALED|T1ERR|readT1|t1Unknown|keyMissing|isT1|sealedSave|readLive|PRIVATE_KEY|.enc`.
  - The only hits are pre-existing main code: `calendar.mjs`'s `data/calendar.enc` with `PRIVATE_KEY`, and `scan.mjs` `calRead0`/`privKey`/`private.enc`.
  - The rest are comments that cite review labels ("R1 rev15", "Codex ... R1").
- A whole-tree grep of the package for `sealed-store` or `SEALED_SECRET` in `*.mjs`, `*.yml` and `*.sh` returned nothing.
- `git ls-files` has no `sealed*` or `r1-*` file.
- Every identifier that the R1 diff (b0d76987..67f1beba) defines in `scan.mjs` and `ignition-watch.mjs` appears the same number of times in the package as on main. These include T1ERR, readT1, t1Unknown, readSealedJson, writeSealedJson, sealedSave, readLive, LIVE_UNKNOWN and SEALED_FAIL. Result: 0 leftover references, so there is no runtime ReferenceError risk.
- Every relative import in the package `.mjs` files and in `test/` resolves to an existing file. `nyStamp` is exported by `stop-watch.mjs` on main (line 13).

## Q2. Was any non-R1 change dropped or altered? No.

**Packaged files.**
- 19 of the 24 package paths are byte-identical to 73aa701f: `git diff 73aa701f 10874f68` is empty for them.
- The 5 that differ are `scan.mjs`, `ignition-watch.mjs`, `.github/workflows/ignition.yml`, `test/watcher-nov2-fixture.mjs` and `test/watcher-nov2-clock.test.mjs`. For these I reproduced the removal myself with `git merge-file cand 67f1beba b0d76987`:
  - **ignition-watch.mjs:** the package equals the 3-way result exactly, with 0 conflicts.
  - **scan.mjs:** 1 conflict, in the import block. The package resolved it to main's line with `nyStamp` added, which is correct.
  - **ignition.yml:** 2 conflicts (env `SEALED_SECRET` and sealed staging/push). The package resolved them to main's commands plus the composition's `steps.ready` gating, which is correct.
  - **Strongest check, for scan.mjs, ignition-watch.mjs and ignition.yml:** the changed lines of `git diff -U0 6e72a8d0 10874f68` are identical to those of `git diff -U0 67f1beba 73aa701f`, so every non-R1 hunk is carried byte for byte. `--stat` is also identical (scan.mjs: 213+/33-).
  - **Separately:** none of the 67f1beba..73aa701f changes to scan.mjs or ignition-watch.mjs contains an R1 identifier, so nothing from that range had to be removed.
  - **The two test files:** the only differences from 73aa701f are the sealed fixture key and readers, and one `...101-1.json.sealed` non-existence assertion, all reverted to plaintext. That assertion does not apply without R1, so removing it does not weaken the test.
  - **Fixture source:** commit 954c2ed5 (cited as the source of the plaintext fixture) is not in the local clone, so I could not check that it came from there. Its content does match the 3-way result minus the sealed lines.

**Files that differ between main and 73aa701f but are not in the package** (61 non-data paths, plus 132 data paths):
- 9 are main-advanced, meaning main changed them after b0d76987 and 73aa701f is stale. The package correctly keeps main's version:
  - `research-core.mjs`, `research-lab.mjs`, `autolab.mjs`, `run-research-now.txt`, `.github/workflows/research-lab.yml`
  - `test/research-core|research-dst|research-tender|autolab-library-guard.test.mjs`
- 49 are in the R1 range. These include `health.mjs`, `watcher-reporting.mjs`, `movers.mjs`, `test/load-scan.mjs`, every other workflow, `missed-runners`, `options-survey`, `smart-money`, `shadow-outcomes`, `fastmover-lab`, `scorecard-1023`, `.gitattributes`/`.gitignore`, `save-data.sh`, `bot-save.sh`, `sealed-*` and the docs. I read the R1 diffs for `health.mjs`, `watcher-reporting.mjs`, `movers.mjs` and `load-scan.mjs`: they are pure sealed-store wiring.
- 3 changed only after 67f1beba and are R1:
  - `opportunity-radar.mjs`: `closeText()` imports sealed-store.
  - `test/radar-sealed-reader.test.mjs`.
  - `test/sealed-recovery-actual-paths.test.mjs`.
- Exceptions: none.
- `health-text-watcher-qualification.test.mjs` passes against main's `health.mjs`, so the health-text repair does not depend on the R1 `health.mjs`.

## Q3. Data behaviour and trading rules: production's data behaviour is kept, and no trading rule changes.

**ignition.yml versus main:**
- Changed: cron moves to 13:10/14:10 UTC; `IG_SCHEDULE` is added; there are two `watcher-schedule.mjs` admission steps; and the observe, missed-runner, save, failure and upload steps are gated on `steps.ready.outputs.run == 'true'`.
- Unchanged: the `git add` list line and the pull/push retry lines are byte-identical to main. There is no `SEALED_SECRET` and no `sealed-git.sh`.

**ignition-watch.mjs:**
- The only changes are the admission check (exits 0 when not admitted), `RUN_START` (the budget runs from after the 09:25 wait) and `passStartedAt` (pacing).
- No save or write code changed: `writeFileSync` calls, `ignition-live.json` and `ignition-runs` are the same as main.

**scan.mjs** hunks, all identical to the candidate:
- calendar exact-series text;
- `tgParts`/`telegramLive`/`tgRemainder`;
- health `compactProblem`;
- `holdingAction`/`firstCheckText`/`quoteEvidence`/`stopObservation`/`alertEvidence`/`ALERT_GATE`;
- intraday send-time rechecks.

The lane and movers code is unchanged:
- `moverEvidence`, `moverSituation`, `optionsShadow`, `optionsText`, `freshHaves`, `fastText`, `readJson`/`readJson0`, the Friday options message and all 4 `writeFileSync('data/options-shadow.json'` calls are identical to main.
- `data/alert-state.json` is still written in plaintext. It is now saved before and during sends, which is more often, but it is the same file.

**Gates:**
- BUY NOW keeps the strict `< 20 min` rule, and the buy range check `p >= lo && p <= hi` is unchanged.
- The stop rule is `priceEvidence` with STOP_MAX_AGE_MIN unchanged, and `p <= stop` is unchanged.
- Plan/quick/leader lines gain a 20-minute age check they did not have before, which is stricter.
- Holdings without a valid price show UNKNOWN instead of HOLD.
- No cost, threshold, halal, lane or slot logic is touched.

**calendar.mjs:** it still writes only `data/calendar.enc` (with the existing PRIVATE_KEY) and `calendar-status.json`. The macro-reaction feature (`macroNow`, `scan.mjs:126`) now sees only exact-series values. Unverified rows give null figures, which can only make it signal less often, so this is not a weakening.

## Q4. Tests: all pass.

Run with Node 20 and `NODE_OPTIONS=--import .../guard/noext.mjs`, one file at a time, with no secrets set.

| Tree | Files | Passed | Failed | Skipped | Non-zero exits |
|---|---|---|---|---|---|
| Package 10874f68 | 154 | 1470 | 0 | 0 | 0 |
| Main 6e72a8d0 | 143 | 1374 | 0 | 0 | 0 |

- The package's extra 96 tests are 11 new files plus watcher-guard going from 8 to 14.
- Two files (`event-orb-retest-core`, `sec-time`) are plain scripts with no node:test output; both print "validation passed" and exit 0.
- The guard log recorded no external connection attempts.
- **Gated suites, package:** `INCIDENT_WATCHER_SRC=<pkg>/ignition-watch.mjs`. watcher-resilience 9/9 and watcher-incident-revision 11/11 pass.
- **Gated suites, main:** same two suites, 9/9 and 11/11.
- `test/try-small-audit.test.mjs` passes 16/16 on both trees today (Mon 9 Nov 2026), including case 1b. I could not reproduce the reported clock dependence; it would show up on main too, since the package does not touch try-small.

## Q5. Binding: verified.

- `node r1-release-precheck.mjs --build-unit 6e72a8d0 10874f68 binding.json` gives "built (NOT pushed): commit 4710b477, tree d2d69949". That tree equals 10874f68's tree. The commit is an unreferenced local object.
- `--verify-unit 6e72a8d0 10874f68 binding.json` gives PASS (24 bound files, 0 problems). `--verify-unit` on 4710b477 also gives PASS.
- The binding's 24 files match `sa/bind/paths`. The `sha256` values of `source.patch` (df212ce6…) and `inverse.patch` (a0486249…) match the binding.
- `git apply source.patch` on main, then `write-tree`, gives d2d69949, the package tree. Applying `inverse.patch` on top gives 060f24f2, which is main's tree.

## Q6. Blocking issues: none.

There is no merge mistake, no leftover R1 identifier, no change to the watcher save step, the options lane or the movers text, and no unresolved conflict marker (all conflicts are resolved to main's lines).

Non-blocking observations, all inherited unchanged from the reviewed candidate:
1. **Failure alert gating:**
   - In `ignition.yml`, the failure Telegram step is `if: failure() && steps.ready.outputs.run == 'true'`.
   - So if `watcher-schedule.mjs` itself crashes in the admission step, no "RUN FAILED" message is sent and the save step is skipped.
   - The watcher guard (WATCHER LATE/DOWN) is the remaining signal. This is a design choice of the composition, not a defect of the package.
2. **Dead code:** in `intraday()`, the `alerts` array is still declared but no longer used, now that `queued` is used instead.
3. **Comment labels:** the code comments keep review labels like "R1 rev16". These are labels only; renaming them would make the package differ from the reviewed text.

## Not verified
- Fixture origin commit 954c2ed5 (not in the local clone).
- Real GitHub Actions behaviour of the new admission and cache-recheck steps (only the synthetic workflow tests in `watcher-nov2-*` were run).
