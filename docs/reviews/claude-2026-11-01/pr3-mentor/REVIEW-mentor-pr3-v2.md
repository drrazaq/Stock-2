# Independent re-review: read-only LEADER DIP mentor, PR #3 revision 2 (changes only)

**Reviewer:** Claude.

**Scope:** read-only review. I made no edit, deployment, credential use, provider call or message. Every bot run used synthetic positions and a fake Telegram server on 127.0.0.1.

**Earlier review:** `REVIEW-mentor-pr3.md` (CHANGES REQUIRED: M1, M2, M3). This report covers only what changed since then.

## Verdict: CHANGES REQUIRED (unchanged; M1 and M2 open)

**Fixed**
- **M3 (release mechanics):** the package is rebuilt on current main and the redundant test hunk is dropped. The patch applies cleanly, and every file matches the manifest and the PR head.
- **New caller fix (found by Codex):** malformed or bare `mentor` requests no longer fall through to the normal position save.
  - They now get a one-line usage hint.
  - Multi-line messages that mix `mentor` with an owner command still record the command.

**Unchanged by design:** the explanation module `mentor-plan.mjs` is byte-identical (`c9450320…`, manifest `modulePreservedFromOriginalReview: true`). So:
- **M1 still holds.** Every real holding is headlined "Plan status: UNRESOLVED" and told to "Resolve the listed source/fill/variant contradictions", even when there is no contradiction, only a missing original signal record.
- **M2 still holds.** Every reply is about 3,200 characters of internal codes with missing spaces ("up to126", "about6months", "model0.8%").

The package does not answer M1 or M2. The proposal says "Missing archived contracts stay unresolved", which is the design choice M1 objects to, and nothing about readability.

Safety and accuracy are still sound. If the owner explicitly accepts the M1/M2 output as it is, the package is otherwise releasable. I don't recommend that: the feature's purpose is a useful entry-to-exit explanation, and for real holdings it doesn't give one.

## What was reviewed

| Item | Value |
|---|---|
| Revised PR head | `review/mentor-readonly-20261101` @ `8e9cb9bea2809a19048cdb36987e8d050872020a` |
| Release decision | `Stock2-safety-fixes` @ `3ce932e` (`docs/mentor-sip-release-checkpoint.md`) |
| Patch | `docs/validation/mentor-readonly-production.patch`, SHA256 `6c6d14dcc9db494583aa9ba997de52ed753720ee72b42f20f9beaa3d5cb2f5fb` |
| Production base | main `f6a9b1668d0591cf24a734034949b96b241fe35b` |
| Files | `scan.mjs`, `mentor-plan.mjs` (unchanged), `test/load-scan.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release.test.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release-examples.mjs` |

**Identity (independently executed):** the patch applies to main `f6a9b166`. All 7 resulting files match the manifest's after-hashes and are byte-identical to the PR head `8e9cb9b`.

## What changed in `scan.mjs` (versus the reviewed v1)

1. **`CMD_LINE`** now splits `/mentor` and `mentor@bot` lines as separate commands.
2. **`isMentor`** now matches any owner message starting with `mentor` / `/mentor` / `mentor@bot`, with or without a valid symbol.
3. **Route:** a malformed request ("mentor GOOD please", bare "mentor", bare "/mentor") now gets "MENTOR — EXPLANATION ONLY. NOT PROVEN. Use mentor SYMBOL (one symbol per line). This request records no trade; no BUY or HOLD recommendation." In v1 it fell through to the generic reply and the normal position save.

Nothing else in `scan.mjs` changed. The manifest pins four unchanged critical regions:
- accounting and sale recovery;
- the reply transport;
- position normalization;
- the LEADER DIP rule and brake.

## Independently executed (main + revised patch, Node 20.20.0)

**Actual-bot harness (`mentor-harness.mjs`, extended for v2)**

| Case | Result |
|---|---|
| Mentor-only batches: 8 symbol cases and 8 spellings | only `data/tg-state.json` changes; offset advances |
| Spellings covered | `/mentor good`, `/mentor@StockBot GOOD`, `mentor BRK.B`, two lines, two slash lines, `mentor GOOD please`, bare `mentor`, bare `/mentor` |
| Malformed or bare spellings | one usage-hint reply; no positions write |
| **New:** one message `mentor GOOD` + newline + `stop OTHER 46` (also reversed, and with `/mentor`) | the stop **is saved** (`my-positions.json` changes, OTHER stop = 46) and the mentor reply is sent. The broader `isMentor` does not swallow owner mutations, because messages are split into lines before the check. |
| Separate mentor + stop messages in one batch | stop saved, other positions unchanged |
| Foreign-chat messages in the batch | ignored |
| Exit dates | 0 mismatches over 186 buy days against the independent session count (as in v1) |
| Holdings | still `UNRESOLVED`, about 3,240 characters (M1, M2) |

**Tests** (Node 20.20.0, CI-style, without `INCIDENT_WATCHER_SRC`)
- `mentor-readonly` 2/2, `mentor-release` 10/10, `mentor-release-plan` 8/8, `bot-actions` 8/8.
- **Full suite** on main + revised patch: 132 files, 1,272 cases, **0 failures**.

## Findings

- **M1 (open, blocking):** as in the original review. No release text explains why a consistent holding should read as contradictory.
- **M2 (open, blocking for owner use):** as in the original review.
- **M3 (closed).**
- **m2 from the original review (closed):** malformed `mentor` text no longer falls through.
- **N1 (note):** the HISTORY-03 claim catalogue (branch `claude/history-03-claims`) found that the same owner reply surface also shows unsupported research claims elsewhere. That work is separate and does not block this package.

## Hosted CI (Codex's report; not executed by me)

- PR head `8e9cb9b`: push 41338524024 and PR 41338525568, PASS, 131/131 files on Node 20.20.2.

A review verdict is not deployment approval.
