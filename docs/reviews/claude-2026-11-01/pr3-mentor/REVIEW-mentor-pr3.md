# Independent review: read-only LEADER DIP mentor, PR #3

**Reviewer:** Claude.

**Scope:** read-only review. I made no edit, deployment, credential use, provider call or message. Every bot run used synthetic positions and a fake Telegram server on 127.0.0.1.

## Verdict: CHANGES REQUIRED (not release-ready)

**Safe:** the mentor writes no financial record and changes no gate, cost, lane limit or strategy rule.

**Accurate:** its facts are correct. Dates match an independent session count on all 186 buy days checked, and the entry rule, the +20% target, the no-stop rule and the size checks are right.

**Not useful enough to release as is:**
- every real holding is headlined UNRESOLVED and told to "resolve contradictions" that do not exist (M1);
- the reply is about 3,200 characters of internal codes (M2).

**Not releasable mechanically:** the patch no longer applies to current main (M3).

All three are small, contained fixes. Nothing in the safety design needs to change.

## What was reviewed

| Item | Value |
|---|---|
| Package | PR #3, branch `review/mentor-readonly-20261101` @ `d63d3d10849e4addaa1c5e05d22ec5eeaecc82ea` (base `6e806c4f`) |
| Patch | `docs/validation/mentor-readonly-production.patch` (on `Stock2-safety-fixes`), SHA256 `ebc62f42571b0dddc9d7e44e8d81f49b0f7ff22ea097ce121ba18140a5846222` |
| Files | `scan.mjs`, `mentor-plan.mjs` (new), `test/load-scan.mjs`, `test/mentor-readonly.test.mjs` (new), `test/bot-actions.test.mjs` |

No newer mentor package has been published (checked the remote branches and PRs on 1 Nov). If Codex publishes a revision, I will review the delta.

**Identity:** the patch applied to `6e806c4f` gives 5 files byte-identical to the PR head, and all match the manifest's after-hashes.

## Safety: gates, financial records, strategy rules (independently executed)

**Code**
- `scan.mjs` gains only:
  - an import;
  - a `mentor SYMBOL` route that reads `my-positions.json`, `squad11-today.json` and the private share counts;
  - one change: `savePos` is skipped when every owner message in the batch is a mentor command.
- No `LDIP_*` constant, gate, cost, ledger, halal/ZAD, order, callback or reminder code is touched.
- `mentor-plan.mjs` is pure: no file or network access.

**Actual bot runs** (`mentor-harness.mjs`, real `tgCommands` via the tree's own loader; on base+patch and on current main+patch):
- **Mentor-only batches** (8 symbol cases plus 4 spellings): the only changed file under `data/` is `tg-state.json`, and the offset advances. That covers positions, private.enc, the LEADER DIP ledger and every other data file.
- **Foreign chat:** messages in the same batch (`mentor GOOD`, `stop GOOD 1`) are ignored.
- **Mixed batch** (`mentor GOOD` plus `stop OTHER 46`): the owner's stop is recorded as before, and the other position is byte-unchanged.

**Author tests**
- `mentor-readonly` 2/2 and `bot-actions` 9/9 on base+patch.
- On current main+patch (without the `bot-actions` hunk, see M3): `mentor-readonly` 2/2 and `bot-actions` 8/8.

**Full suite on current main `f6a9b166` + patch** (without the redundant `bot-actions` hunk), Node 20.20.0, run CI-style without `INCIDENT_WATCHER_SRC`: 130 files, 1,254 cases, **0 failures**.

## Accuracy: entry to exit

| Element | Mentor says | Checked against | Result |
|---|---|---|---|
| Entry rule | top-20% 12-1 momentum leaders among the 300 largest; first close ≥12% under the 50-session high, above the 200-session average; buy next open | `squad11-core.mjs` pre-registered header | correct |
| Entry session for a lead | next session after the signal close (2026-10-30 → 2026-11-02) | independent count | correct |
| Stale/mismatched lead | row date ≠ file `lastClose` → no source, UNKNOWN | — | correct (refuses rather than guesses) |
| Time exit | close of session 126, counting the buy day (buy 2026-10-30 → 2027-05-03; 2026-11-25 → 2027-05-27) | independent counter over 186 buy days, Oct 2026–Jun 2027, incl. Thanksgiving, Christmas, New Year, MLK, Presidents, Good Friday, half-days: **0 mismatches**; bot's own `ldipExitDay` gives the same dates | correct |
| Bot vs tested exit | flags that the live TIME EXIT says "sell at the next open" while the frozen test sells at the close | `ldipCloseFlags` in `scan.mjs` (fires after session 126, next open) | correct, useful |
| +20% sell limit | "separate target study, NOT PROVEN, adoption=false; unadopted owner-lane overlay" | `data/agent-a-tgt-lab.json`: A-TGT-TGT20-PB12 `adopt: false` (lower returns than the no-target base), verdict NOT PROVEN | correct |
| Stored target | matches fill +20% (120.00), or flags `TARGET_DIFFERS_FROM_REGISTERED_20_PERCENT` (130) | arithmetic | correct |
| Stop | none in the tested rule; a recorded stop is flagged as an untested variant | lane rule | correct |
| Size | 10 shares × 100 = 1,000.00; 25 shares → `RECORDED_NOTIONAL_EXCEEDS_SLOT_ALLOCATION` | lane limit 3 × $1,000 | correct |
| Wording | EXPLANATION ONLY, NOT_ACTIONABLE, NOT PROVEN, no promise of returns, ZAD shown as UNKNOWN | CLAUDE.md §9 | compliant |

## Findings

### M1 (blocking): every real holding is headlined UNRESOLVED and told to fix "contradictions"

Holdings never carry a saved source contract: fill-contract recording is deliberately excluded from this release. So `ENTRY_WINDOW_UNRESOLVED` and `ORIGINAL_SIGNAL_IDENTITY_UNKNOWN` fire for every holding, even a perfectly consistent one (buy recorded, fill +20% = target, no stop, $1,000). The reply then opens with:
- "Plan status: UNRESOLVED";
- "Workflow: RECONCILE_PLAN; Resolve the listed source/fill/variant contradictions before treating the stored plan as guidance";
- "Entry: … UNKNOWN; UNKNOWN", although the buy session is recorded.

There is no contradiction in that case, only a missing original signal record. Under this release, no holding can ever become resolved, so the main use (explaining the owner's actual holdings from entry to exit) always ends in a misleading "reconcile" instruction.

**Fix:**
- separate "original signal not on file" (informational) from real contradictions (target mismatch, untested stop, over-slot size, future buy date);
- headline a consistent holding with its plan (bought, sell limit, time exit date, no stop);
- reserve UNRESOLVED/RECONCILE for real contradictions;
- show the recorded buy session on the Entry line.

### M2 (blocking for owner use): the reply does not meet the owner-message rule

**Size:** about 3,200 characters in 21 dense lines, the same size for every case. The useful facts (sell limit 120.00, time exit 2027-05-03 at the close, no stop, 10 shares/$1,000, the next-open vs close gap) are lines 11–17.

**Unreadable content**
- internal enums and IDs: `RECONCILE_PLAN`, `MONITOR_CONTRACT_NOT_A_HOLD_APPROVAL`, `UNRESOLVED_PLAN_NOT_HOLD_GUIDANCE`, `SQ11-PB12 / A-TGT-TGT20-PB12`, fingerprints;
- missing spaces: "up to126 sessions (about6months)", "lane limits:1,000USD per slot,3slots", "session126", "model0.8%".

CLAUDE.md §1 and §9 require short, numbers-first, plain English with numbered actions for this owner, who is not a programmer.

**Fix:**
- a short plain-English first block, for example:
  - "AMD — LEADER DIP (explanation only, NOT PROVEN)";
  - "Bought 100.00 × 10 on 30 Oct";
  - "Sell limit 120.00 (+20%)";
  - "Time exit: close of 3 May 2027";
  - "No stop by design";
  - "Note: the bot's reminder says next open; the test sold at the close";
- the detailed caveats after that, without enum names;
- the spaces restored.

### M3 (blocking for release mechanics): the patch is stale against current main

**What changed:** main (`f6a9b166`) changed `scan.mjs` (commits `7c18977` and `b680988`) and `test/bot-actions.test.mjs` (`b680988`) after the base `6e806c4f`.

**What now fails**
- The `bot-actions` hunk no longer applies. Main already contains an equivalent RECORDS section-boundary fix, so that hunk is redundant.
- The manifest's before-hash for `scan.mjs` no longer matches main.

**What still works:** the other four files apply cleanly, and with them the mentor behaves identically on current main (harness and author tests above).

**Fix:** the proposal itself requires this. Re-cut the package against current main without the redundant test hunk, refresh the manifest hashes, and run main's full suite.

### Minor (not blocking)

- **m1.** A symbol from another lane or an unknown symbol gets the full 3,100-character template filled with UNKNOWN. A one-line reply would be clearer: "mentor covers LEADER DIP only; X is a TRY SMALL holding" or "no LEADER DIP signal or holding for X".
- **m2.** `mentor GOOD please` is not recognised. It falls through to the normal path: a generic reply plus the existing positions save, which is the same as base behaviour, not a new write. A short usage hint would help.
- **m3.** The as-of date is the real clock. A position with a future buy date is correctly flagged `BUY_SESSION_FUTURE`.

## Not changed by this release (confirmed)

- Testing gates, costs, the yardstick and frozen verdicts.
- `LDIP_*` constants: the entry, the +20% target, the 126-session hold, 3 × $1,000 slots and the brake.
- Ledgers, positions, private.enc, halal/ZAD files, reminders, callbacks, the order path and scheduled messages.

The only state written is the normal Telegram offset.

## Hosted versus independently reproduced

**Reproduced by me**
- package identity;
- the read-only proof on every `data/` file;
- accuracy against independent counts and the frozen research records;
- applicability to current main;
- the author tests and the full suite on main+patch.

**Author evidence not reproduced:** the "124 files / 1,208 cases" on the old base, and the development-PR CI.

**Not exercised:** real Telegram delivery and the real private key. The decryption-failure path was exercised only with a synthetic key.

A review verdict is not deployment approval.
