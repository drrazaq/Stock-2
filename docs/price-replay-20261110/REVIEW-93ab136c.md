# Focused review: Stage 2 watcher successor 93ab136c, packet 74090bde (handoff 6764736951)

Review only. No production action.

## Verdict

- **Source, composition, timeout process and recovery:** PASS.
- **Binding as published (e513e26f):** NOT FREEZABLE until the one-field defect R1 below is fixed.

## Checks

1. **Composition.**
   - 93ab136c differs from approved Stage 2 590bf434 only in `ignition-watch.mjs` and the new `test/price-readiness-clock-boundary.test.mjs`.
   - The watcher delta matches development 322c08b5 plus 590010f5 (receipt-time `validateClocks`, post-await merge time, post-fetch minute and endpoint drop, honest top-50 unavailable path and label, unique-minute coverage).
   - Stage 2's `watcherAdmission`, `RUN_START` and `passStartedAt` cadence are untouched. Nothing was copied wholesale.
   - The coverage readers were checked. `watcher-session.mjs` dedupes its own heartbeats and prefers `observedMinutes` in its legacy path; `scan.mjs` displays `minutesWatched` and the rate.
2. **Actual process, 93ab136c.** The 12-case replay plus X1 (`receipts-93ab136c.jsonl`) gives the same pass pattern as 322c08b5:
   - ACT-0/2 s are live;
   - INACT are not substituted;
   - B1 is 50/250;
   - B2 is kept at m=900; B3 is dropped;
   - B4 shows 601 and 602, with the loop starting again at 65 s;
   - the cadence is 0 / 60 s.
   - **Change from 322c08b5:** the timeout cases (ACT/INACT-10/65 s and X1) now report `FULL_SNAPSHOT_LATE` / "massive (late 20 min)", with 250/250 rows kept. No top-50 claim is made.
3. **Local suites on 93ab136c:**
   - focused, feed-integrity and ignition-freshness: 23/23;
   - Stage 2 actual-watcher suites (cadence-review, nov2 clock/guard, incident-revision, resilience, retry-recovery, message-publish with INCIDENT_WATCHER_SRC): 62/62.
   - The hosted 165-file receipt is Codex's and was not re-run.
4. **Binding.**
   - sha256 of `binding-successor.json` is e513e26f…: matches.
   - 46 files: every after-blob (mode, SHA-1, SHA-256, bytes) matches 93ab136c, and every before-blob matches Stage 1 211cf164.
   - The 39 writes are exactly the paths changed against Stage 1; there are 7 dependencies.
   - The tree 01b95472 matches.
   - Against the old Stage 2 binding, only `ignition-watch.mjs` changed and only the test path was added.
5. **Inverses, applied as Git index objects.**
   - `inverse-successor-to-stage1.json` (39 entries) gives tree 83637535 (as claimed), identical to 211cf164 outside `docs/`. Helper v1 (50947c0b) is kept.
   - `inverse-watcher-to-stage2.json` (2 entries) gives exactly the 590bf434 tree.

## Defect

**R1.** The `inverse` field in `binding-successor.json` still names `inverse-stage2-to-stage1.json`. That is the old 38-entry inverse, which does not remove `test/price-readiness-clock-boundary.test.mjs`.
- Applied to 93ab136c it gives tree 05954e97, which is not Stage 1. An operator or verifier following the bound pointer would get an inexact recovery.
- **Fix:** point the field at `docs/watcher-price-followon-20261110/inverse-successor-to-stage1.json` and name the 2-path inverse. Re-hash the binding, which gives a new SHA, and re-verify. This is mechanical, with no source change.
