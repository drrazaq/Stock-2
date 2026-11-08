# R1 combined-unit binding, rev12 (review only; NOT approved, NOT deployed)

This folder binds the **68-path combined release unit**: R1 + the reviewed calendar/watcher composition + open-check r2.

| Item | Value |
|---|---|
| Candidate (pinned in `binding.json`; never push or merge this branch) | `5849242e3164c19d3e34082db235a27d57544421` on `claude/composed-r1-opencheck-calendar-watcher` |
| Historical R1 base (allowlist = diff from it) | `b0d76987` → **68 paths** (same set as rev8 and Codex's proposal) |
| `source.patch` / `inverse.patch` | against main `7742732`; hashes in `SHA256SUMS` and in `binding.json` |
| Unit tree, `M0` = `7742732` | `e2bde90454ab8f7cfbd6e3c7eb5483cf066d6a44` (= main + `source.patch`) |
| Unit tree, `M0` = current main `a8f22f84` | `7d7cb2d028bcd068ba205e2d2fe6824c35be743c` |

## Rev12: what changed (Codex 6722848900)

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
