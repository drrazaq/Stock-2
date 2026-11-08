# R1 combined-unit binding, rev14 (review only; NOT approved, NOT deployed)

This folder binds the **68-path combined release unit**: R1 + the reviewed calendar/watcher composition + open-check r2.

| Item | Value |
|---|---|
| Candidate (pinned in `binding.json`; never push or merge this branch) | `df5ee960f5d118e5c5b638e22c3fe3788fe4598a` on `claude/composed-r1-opencheck-calendar-watcher` |
| Historical R1 base (allowlist = diff from it) | `b0d76987` → **72 paths** (rev14 adds 4; see below) |
| `source.patch` / `inverse.patch` | against main `7742732`; hashes in `SHA256SUMS` and in `binding.json` |
| Unit tree, `M0` = `7742732` | `0d2451b94466a63f93712157c6cf3b7f7d1ff445` (= main + `source.patch`) |
| Unit tree, `M0` = current main `a7c597b7` | `ae727b9c9f6e15dfcf79a5500d672c268163e329` |

## Rev14: what changed (Codex review 6723732821, blockers B1–B5)

**The fixes:**
- **B1:** a failed, FULL or UNKNOWN recovery under bot.yml's `bash -e -o pipefail` is logged, SAVE NOT CONFIRMED is sent, and the loop continues.
- **B2, B3:** a per-run recovery state file (confirmed state, plus the pending attempt written before each push) in `RUNNER_TEMP`. It is reconciled read-only first, survives the final `always()` shell, loads only this run's own names and this role's slots, and leases still decide.
- **B4:** YOUR STOPS says "when checked at <time>". When the price is no longer current, it drops the entry % and says "No current price now".
- **B5:** the after-close radar reads the sealed live record. Missing key, damage or plaintext gives "LIVE WATCHER RECORD UNKNOWN (SEALED_…)", never "no results".

**Allowlist expanded by 4 paths, explicitly:** `opportunity-radar.mjs`, `test/radar-sealed-reader.test.mjs`, `test/sealed-recovery-actual-paths.test.mjs`, and the STOP-pinned `test/stop-alert-validity.test.mjs` (bot-route assertion tightened). The STOP-pinned files changed by the unit are now 8 of 17.

**Proof:**
- Every new regression fails on rev13.
- On the **built unit tree**, all of Codex's fixtures pass: `render-age` and `future-fetch` exit 0; `stop-provenance` exit 0; `radar-reader` exit 0; `independent-races` 5/5.

**Checks:**
- Precheck against `a7c597b7`: PASS (72/0/0).
- Build + verify PASS on `7742732` (tree `0d2451b9…`, equal to main + `source.patch`; the inverse restores main) and on `a7c597b7` (tree `ae727b9c…`). Revert restores each `M0`.
- Refused: the mode mutant, the whole branch, the old candidate, and the rev13 binding (68 paths).
- Full suite **158/158**; gated watcher 9/9 and 11/11.

## Rev13 (history): what changed (bounded save recovery; Codex 6722943461, review `ea99db8b`)

- **Design:** Codex's four atomic reservation slots (`r1-recovery-slot/{bot,main,shared-0,shared-1}`):
  - checkpoint and slot are created in one atomic push, both leased as absent;
  - the unpublished data must be of known size, at most 32 MiB;
  - paired leased cleanup only after confirmed recovery;
  - no eviction; L7 in RELEASE.md §E.
- **Additions:**
  - **same-run advance** (atomic, leased): a run's newer state replaces its own checkpoint;
  - **`bot-save.sh` subshell fix:** its kept-state now persists between saves.
- **Proof:** 6 new tests in `test/sealed-recovery.test.mjs` fail on rev12 (20/20 on rev13). The wiring test forbids the pipe.
- **Unchanged:** runtime `scan.mjs` and the STOP-pinned files are unchanged from rev12.
- **Checks:**
  - Precheck against `a8f22f84`: PASS (68/0/0; the same 68 paths).
  - Build + verify: PASS on `7742732` (tree `d4b60206…`, equal to main + `source.patch`; the inverse restores main) and on `a8f22f84` (tree `abaecb0d…`). Revert restores each `M0`.
  - Refused: the mode mutant, the whole branch, and the old candidate.
  - On the built unit: the render-age and future-at-fetch probes pass, and the recovery tests pass 20/20.
  - Full suite 156/156; gated watcher 9/9 and 11/11.

## Rev12 (history): what changed (Codex 6722848900)

- **The defect:** rev11 froze every verdict at fetch time. A price 290 s old when fetched and 320 s old when the check was written showed "HOLD … above your stop".
- **The fix:** two distinct judgements.
  - **Current price** (`quoteEvidence`): valid when fetched **and** within the unchanged 3/5/20-minute gate at report time. It governs HOLD, targets, % from entry and buy ranges.
  - **Stop observation** (`stopObservation`): fetch time, the same 5-minute rule as the stop route. Only "STOP LEVEL REACHED" uses it, shown as "N min old when checked at <time>; no current price now: <reason>".
- **Proof:**
  - Two actual-caller regressions fail on rev11 and pass on rev12 (15/15).
  - On the **built unit tree**, Codex's `render-age-hold-actual-caller.mjs` assertions pass (exit 0) and the future-at-fetch probe reports `contradiction: false`.
- **Changed against rev11:** `scan.mjs`, `test/open-check-repair.test.mjs`, the R1 `README.md` (§0i) and `MANIFEST.md`.
- **Checks:**
  - Precheck against `a8f22f84`: PASS (68/0/0).
  - Build + verify: PASS on `7742732` (tree `e2bde904…`, equal to main + `source.patch`; the inverse restores main) and on `a8f22f84` (tree `7d7cb2d0…`). Revert restores each `M0`.
  - Refused: the mode mutant, the whole branch, and the old candidate.
  - Full suite 156/156; gated watcher 9/9 and 11/11.

## Rev11 (history): what changed (review 6721730197, R1)

- **The defect:** a stop quote 4 min 50 s old when fetched, under the stop, was REACHED in the stop route. Thirty seconds of later fetching, and the first check in the same run re-aged it past 5 minutes and said STOP STATUS UNKNOWN. Rev10 had this.
- **The fix:** a quote stamped with `observedAt` is judged **once, at that moment**, with the same 5-minute rule as the stop route. Thresholds are unchanged.
- **Proof:** the regression "rev11 …" in `test/open-check-repair.test.mjs` fails on rev10 and passes on rev11 (13/13). Codex's future-at-fetch probe on the built unit still reports `contradiction: false`.
- **Changed against rev10 (same 68 paths):** `scan.mjs`, the test, the R1 `README.md` and `MANIFEST.md`.
- **Rev11 checks:**
  - Precheck against `b58a5caa`: PASS (68/0/0).
  - Build + verify: PASS on `7742732` (tree `8be95a13…`, equal to main + `source.patch`; the inverse restores main) and on `b58a5caa` (tree `df819e84…`). Revert restores each `M0`.
  - Refused: the mode mutant, the whole branch, and the old candidate `b6ffea2f`.
  - Full suite 156/156; gated watcher 9/9 and 11/11.

## Rev10 (history): what changed (Codex 6720355907)

- **The defect:** a holding's quote stamped in the future when fetched became "STOP LEVEL REACHED" in the first market-hours check once later fetches moved the clock, while the same run's stop route said UNKNOWN.
- **The fix:** `intraday()` now stamps each quote with `observedAt`. `quoteEvidence()` keeps a quote UNKNOWN if it was not valid evidence at that moment ("the price timestamp was in the future when fetched"), then judges it again at report time. All thresholds are unchanged.
- **Proof:** an actual-caller regression in `test/open-check-repair.test.mjs` fails on rev9 and passes on rev10. Codex's own probe, run on the **built unit tree**, now reports `contradiction: false`.
- **Changed against rev9 (same 68 paths):** `scan.mjs`, `test/open-check-repair.test.mjs`, the R1 `README.md` and `MANIFEST.md`. The binding format and tool are unchanged.
- **Rev10 checks:**
  - Precheck against `b58a5caa`: PASS (68/0/0).
  - Build + verify: PASS on `7742732` (tree `de98bc31…`, equal to main + `source.patch`; the inverse restores main) and on `b58a5caa` (tree `32fe5874…`). Revert restores each `M0`.
  - Refused as before: the mode mutant, the whole branch, and the old candidate `0663f337`.
  - Full suite **156/156**; gated watcher 9/9 and 11/11.

## Rev9 (history): what changed (Codex 6719707423)

Rev8's tool ignored Git modes and the binding's candidate: a unit with `scan.mjs` made executable verified as PASS, and a mode-mutated, unreviewed candidate could be built. Now:
- `binding.json` must pin `candidate` (40 hex) and a `mode` for every file. Rev8's binding is refused.
- `--build-unit` refuses any candidate commit other than the pinned one, and any byte or mode mismatch.
- `--verify-unit` checks each file's bytes and mode, the sole parent `M0`, that no other path changed, **and** that `C`'s complete tree equals the tree rebuilt from `M0` + the pinned candidate's bound entries. It fails closed if the pinned candidate is not available.
- This is stricter than Codex's proposed patch, which skipped both checks when the binding had no `candidate`.

## Verified on 8 Nov (offline, local Git objects only; no ref, index or working-tree change)

| Check | Result |
|---|---|
| Precheck `b0d76987 → 0663f337` against current main `6b3c49bc` | PASS, 68 files, 0 drift, 0 sealed |
| Build + verify on `M0` = `7742732` | PASS, tree `f7dc52f9…`, equal to main + `source.patch`; `inverse.patch` and revert restore main exactly; 0 paths outside the binding |
| Build + verify on `M0` = current main `6b3c49bc` | PASS, tree `f5a6a43a…`; revert restores main exactly; all newer data and unbound changes kept |
| Mode mutant (correct unit, `scan.mjs` → 100755, same bytes and parent) | **FAIL**: `mode: scan.mjs` and `tree differs` |
| Mode-mutated candidate commit | build **REFUSED**: not the pinned candidate |
| Whole candidate branch | **FAIL**: parent, 5 stale data paths, tree |
| Rev8 binding (no candidate or modes) | **REFUSED** |
| Candidate suite (Node 20, network guard) | full serial suite 156/156; gated watcher 9/9 and 11/11; rehearsal 3/3, whose new negative controls fail on rev8's tool |

Changed against rev8 (same 68 paths): `r1-release-precheck.mjs`, `test/sealed-release-rehearsal.test.mjs`, `RELEASE.md`, `README.md` and `MANIFEST.md`. Runtime code is unchanged.

## Refreshed STOP pins (`stop-pins-refresh.json`)

The unit changes 7 of the 17 STOP R2 pinned files: `ignition-watch.mjs`, `scan.mjs`, `test/load-scan.mjs`, the two watcher tests, `bot.yml` and `ignition.yml`. Each row gives the STOP pin, both mains (`7742732` and `6b3c49bc`, which agree on all 17) and the unit hash.

## Still required before any release (unchanged)

The owner's key and backup-proof route, a fresh writer census, the residual public-output decision, a recovery-ref retention proposal (owed by the author), an approved unit and window, and complete hosted receipts. Nothing here authorizes a push, dispatch or migration.
