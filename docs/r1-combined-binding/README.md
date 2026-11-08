# R1 combined-unit binding, rev8 (review only; NOT approved, NOT deployed)

This folder binds the **68-path combined release unit**: R1 + the reviewed calendar/watcher composition + open-check r2. Codex's review (PR #1 comment 6719376168) passed the source, and found that R1's 51-file manifest does not bind this unit. This folder adopts Codex's proposed binding (`0dc81ef1`), updated for candidate rev8.

| Item | Value |
|---|---|
| Candidate (never push or merge this branch) | `af11dbfd3c5a65a3c522d43bd0075e5deafc93a0` on `claude/composed-r1-opencheck-calendar-watcher`, tree `ed4fa84c…` |
| Historical R1 base (allowlist = diff from it) | `b0d76987` → **68 paths**, the same set as Codex's proposal |
| Bound against main | `774273205e1c8ce3db30c59ca368dc107617ef73` (precheck: PASS, 68 files, 0 drift) |
| `source.patch` (main → unit, 68 paths, `--full-index --binary`) | see `SHA256SUMS` |
| `inverse.patch` | see `SHA256SUMS` |
| Unit tree when `M0` = `7742732` | `dbfb746b80e98f9c00f3e1e6e49bea0d91a45a34` |

## Why the candidate branch must never be released as is

It was cut from `b0d76987`, so it holds older copies of `data/calendar-status.json`, `calendar.enc`, `health.json`, `shares.json.gz` and `tg-state.json`. Pushing or merging it would put back old data and an old Telegram offset. The release commit is built **source-only** instead:

```
node r1-release-precheck.mjs --build-unit  M0 af11dbfd binding.json   # creates C (parent M0), pushes nothing
node r1-release-precheck.mjs --verify-unit M0 C        binding.json   # PASS: parent M0, 68 files exact, nothing else changed
```

## Verified on 8 Nov (offline, local objects only)

- `--build-unit 7742732 af11dbfd` → tree `dbfb746b…`; `--verify-unit` → **PASS** (68 files, 0 problems).
- Applying `source.patch` to main in a temporary index gives the **same tree**; `inverse.patch` restores main's tree exactly.
- `--verify-unit` on the whole candidate branch → **FAIL**: wrong parent and the 5 stale data paths.
- Against Codex's proposal: same 68 paths; 63 files byte-identical. The 5 that differ are the rev8 procedure files only: `RELEASE.md`, `README.md`, `MANIFEST.md`, `r1-release-precheck.mjs` (new `--build-unit`/`--verify-unit`) and `test/sealed-release-rehearsal.test.mjs` (new test). Runtime code is unchanged.
- Candidate tests (Node 20, network guard): full serial suite **156/156**; gated watcher scenarios 9/9 and 11/11; rehearsal test 3/3, including the new build/verify test.

## Refreshed STOP pins (`stop-pins-refresh.json`)

The unit changes 7 of the 17 STOP R2 pinned files: `ignition-watch.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/watcher-resilience.test.mjs`, `test/watcher-incident-revision.test.mjs`, `.github/workflows/bot.yml` and `.github/workflows/ignition.yml`. Each row gives the STOP pin, the current main hash and the unit hash. `scan.mjs` already differed from its STOP pin on main, because T and D1–D4 changed it after STOP; that is not drift.

## Still required before any release (unchanged)

The owner's key and backup-proof route, a fresh writer census, the residual public-output decision, recovery-ref retention, an approved unit and window, and complete hosted receipts. Nothing here authorizes a push, dispatch or migration.
