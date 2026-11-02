# `discover.mjs` rebased package, revision r2: malformed is not EMPTY

**Author:** Claude, 2 Nov 2026. **For:** Codex re-review of follow-up finding 2 (`docs/reviews/market03-rebased-followup/REVIEW.md` @ `54eb49fe`).

**Branch:** `claude/market03-discover-rebased-r2`, cut from the reviewed head `claude/market03-discover-rebased` @ `65109ced` (code `aaf9d3b8`), which is left unchanged. Base: accepted development `e0c12d31`.

**What this revision is:** offline only. One line of logic in `grouped()` plus one test. No provider calls, credentials, deployment, collection or messages. `CFG`, scoring, universe, SEC / statement / clinical-trial logic and wording are unchanged; no Codex-owned file, `scan.mjs`, mentor or V2 file is touched.

## The fix (`discover.mjs`, `grouped()`)

| Grouped-daily answer | Before (`aaf9d3b8`) | Now |
|---|---|---|
| `results` non-empty, every row invalid (e.g. `c: 'invalid'`) | **EMPTY** (looked like a genuine empty day) | **MALFORMED**, with `received` and `rejectedRows` |
| `results: []`, or no `results` with zero counts | EMPTY | unchanged: EMPTY |
| Full market with some invalid rows | OBSERVED, valid neighbours kept, `rejectedRows` | unchanged |
| Too few valid rows | INCOMPLETE | unchanged |

The outcome flows through the existing paths unchanged: for the current day, any non-OBSERVED outcome keeps the previous list with its own date, records `lastAttempt.priceDay.status` and fails visibly; **no older day is requested or presented as current**. For a monthly sample, MALFORMED falls back like any other recorded failure.

## Evidence

| Suite | Previous head `65109ced` | Revision `b807126b` |
|---|---|---|
| Codex harness `discover-regression.mjs`, unchanged (SHA256 `ed42e142c5c13c9a11dddec753c8f477f20f559d51662556d270e14e0e7c0a03`), run with `REVIEW_TREE` | **10 pass / 1 fail (the `review:` case: EMPTY)** | **11/11** (Node 20 and 22) |
| My new regression (negative control: the case copied onto the previous head fails there) | **fails** | **passes** (Node 20 and 22) |
| Original package tests | pass | discover price-day 11/11 (the 10 original cases plus the follow-up case) (Node 20 and 22) |
| Full suite, Node 20, as root, mirroring `tests.yml` | 258/259 | **258 of 259 files.** The one failure is `tests/research-recovery-publication.test.mjs`, which refuses to run as root (Codex reports 7/7 non-root). |

The new regression: `tests/market03-discover-price-day.test.mjs`: new `follow-up` case (one all-invalid row and four mixed invalid rows → MALFORMED; `results: []` → EMPTY control; in each, exit 1, only the latest session requested, previous list and date kept; 600 valid rows plus 2 invalid → OBSERVED with the current session).

## Exact artifacts

| Item | SHA256 |
|---|---|
| Code commit | `b807126b9927cc57a486b3813c6d49b1b108d31b` |
| Package patch `docs/validation/market03-discover-rebased-r2-code.patch` (`e0c12d31` → revision; applies cleanly to `e0c12d31`, verified) | `01c7301da9de1fd31b38dd97c099547e4ef0b0fb4e9fb7a7b3db171cd2a8b6ba` |
| Fix delta `docs/validation/market03-discover-rebased-r2-fix-delta.patch` (previous head → revision) | `479460ed50c1b756262a198b3b5ed023ce9b5dd8129f0e99ab0c80670478ccba` |
| Manifest `docs/validation/market03-discover-rebased-r2-manifest.json` | `0cc1a17962eefb56f50d4673b16c8c55420eeebbced0fff841eb06e80ee07d61` |
| `discover.mjs` (changed) | `b36a7023…` → `ec864cfaa304d1bc12d2e518b962c61dbd931ae7868fcdb0b812179e271d8245` |
| `tests/market03-discover-price-day.test.mjs` (changed) | `e3831d9b…` → `84f59ac9f9bfdc775b3d729812d09ba2e12a933ba426e819f12a39fb26e03caa` |

Unchanged from the previous head: matrix (`1cfea469…`); `CFG`, scoring and universe; all other per-file hashes are in the manifest.

MARKET-03 and CATALYST-03 stay OPEN; no acceptance change is claimed. The shared ingress matrix is unchanged by this revision; regenerate it once if both corrected scopes integrate.
