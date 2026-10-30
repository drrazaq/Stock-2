# Accounting preflight checker v2: approval package (proposed, not installed)

30 Oct 2026. Prepared by Claude on the isolated branch `claude/accounting-preflight-v2`. **Nothing in production was changed**:
- no workflow was paused;
- the remaining authorized preflight run was not used;
- no ledger file was created;
- no secret or permission was touched.

The accounting patch (`accounting-production-fix-v3/v4.patch`, SHA256 `f508496f14d729bc2898e430ba24be339f2d98b55a13cb093d158e6b7dd81d27`) and its approval are unchanged.

## Why v1 blocked

Preflight run `41053549859` (checker v1, blob `92fc955…`) returned `BLOCKED`:
- v1 treats any missing input as BLOCKED.
- `data/leaderdip-ledger.jsonl` has never existed on main: no commit has ever touched it.
- The other three inputs are present. Existence only was checked; no contents were read.
- Because of the missing file, v1 can never PASS, whatever the `PRIVATE_KEY` state.

## Owner decision implemented (option 1)

A missing LEADER DIP ledger counts as an *unused optional ledger* only when **all** of the following hold. Otherwise it still BLOCKS.

| Condition | How v2 checks it (offline, read-only) |
|---|---|
| Repository history verified complete | The checkout is a git work tree at the given root, and the history is complete: it is not shallow; there is no `info/grafts`; replace objects are ignored (`GIT_NO_REPLACE_OBJECTS=1`); a root commit exists; and every commit and tree reachable from HEAD is present (`rev-list --objects --filter=blob:none --missing=error`). Lazy network fetches are disabled (`GIT_NO_LAZY_FETCH=1`), so missing objects fail instead of fetching. |
| It never existed | `git log --full-history --no-renames HEAD -- data/leaderdip-ledger.jsonl` is empty, and the path is not in HEAD's tree. A deleted, renamed or locally removed ledger therefore BLOCKS. |
| Not stored elsewhere | `.github/private-data-mode` is absent. With privacy mode on, the ledger lives in the private repository. |
| Current production code supports absence | The checked-out `scan.mjs` must have the reviewed production SHA256 `dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c` (main `4dfecf3`). In that code `ldipRows()` returns `[]` for a missing file and `ldipAppend()` creates it. The approved accounting patch also creates it inside the sale transaction (`existsSync` plus atomic write). Any other `scan.mjs` makes a missing ledger BLOCK. |
| Authenticated state has nothing to reconcile with that ledger | The state decrypts and authenticates (AES-GCM), with: no `pendingSale` (as in v1, which always blocks); no other top-level `pending` / `intent` / `recover` key; no `saleReceipts`; and no completed LEADER DIP sale in `my-trades.jsonl` (`src` or `kind` matching "leader dip"), whose result row would have to be in the ledger. |

**Unchanged from v1:**
- `private.enc`, `my-positions.json` and `my-trades.jsonl` remain **mandatory** (missing = BLOCKED, never read as an empty account).
- No key = BLOCKED; wrong key or unauthenticated state = ERROR; malformed inputs = ERROR.
- An **existing** ledger is validated as before: unreadable, malformed, a symlink or not a regular file = ERROR.
- The output is status only: exactly `PASS`, `BLOCKED` or `ERROR`, with exit code 0, 2 or 1, and nothing on stderr.
- The final re-read detects files that change during the check, including a ledger that appears mid-check.

### One interpretation for the owner to confirm

**An open LEADER DIP position does not block.**
- Production records such a position without any ledger row: `ldipHit()` falls back to the published SQ11-PB12 list, a case documented in the code on 27 Oct.
- Only a *sale* writes a ledger row, so a held position is not a transaction awaiting reconciliation.
- A first draft blocked on open positions. The status-only dry check (below) showed that rule would block production on legitimate held state, so it was narrowed to completed sales.
- If the owner prefers the stricter reading, reinstate it. The preflight would then stay BLOCKED until that position is sold.

## Exact artifacts on this branch

| File | SHA256 | git blob |
|---|---|---|
| `ops/accounting-preflight-v2.mjs` (proposed checker) | `1060a9fd626c356cf5d01555a7d7c3cef3fa4734c1c787b0d9bf52699a38c83e` | `d018c8a2fa0a7bd4be1ee4582565f8128a4885fd` |
| `ops/accounting-preflight-v2.test.mjs` (32 synthetic tests) | `497b6c74f5bc294cd7eeb975645adc3de995353d0cc7a114bc968cc419000413` | |
| `ops/bot-yml-preflight-v2.patch` (workflow amendment) | `f82692d2b6ea35fd0ac3d54ddaf6fa1075b7e146050902081ab1f22592eae50a` | |

The checker sits under `ops/`, not `test/`. The production suites do not run it, so a later `scan.mjs` change cannot break production CI. Run it with `node --test ops/accounting-preflight-v2.test.mjs`.

## Workflow amendment needed (`.github/workflows/bot.yml`, `accounting-preflight` job only)

`ops/bot-yml-preflight-v2.patch` applies cleanly (`git apply --check`) to main's `bot.yml` (SHA256 `1d25e6fec025f7a7e5e7a254cd61a9df4ecd7df97423b74a84fabd68ab6061e8`). It makes three changes:
1. **Checkout:** `fetch-depth: 0` and `filter: blob:none`. This gives complete commit and tree history without historical file contents. The pinned `actions/checkout@11d5960…` is v4.3.0, which supports both. A blob-free full clone of the repository takes about 1 s and about 2.3 MB, within the job's 2-minute limit.
2. **Blob pin:** `92fc955…` → `d018c8a2fa0a7bd4be1ee4582565f8128a4885fd`.
3. **SHA256 pin:** `7d009d80…` → `1060a9fd626c356cf5d01555a7d7c3cef3fa4734c1c787b0d9bf52699a38c83e`.

Nothing else changes: the bot `reply` job, the concurrency groups, the protected step, the status-only emit, and the freshness re-check of the four paths against current main. The blob is downloadable once this branch is on GitHub, because the API serves any blob in the repository.

## Evidence

- **Synthetic tests: 32/32 pass.** They cover:
  - PASS in a complete history;
  - v1 behaviour with an existing ledger (valid, empty, malformed, a non-object row, a symlink, a directory);
  - a ledger deleted, renamed or locally removed;
  - shallow, grafted and missing-object history; no git; not a repository;
  - the privacy marker;
  - an unreviewed or missing `scan.mjs`;
  - a pending sale (ledger absent and ledger present), other intents, receipts;
  - LEADER DIP journal rows; an open position alone (PASS) and with a sale (BLOCKED);
  - each mandatory input missing; no key; wrong key; malformed inputs; argument count;
  - read-only behaviour (file hashes, git status and HEAD unchanged);
  - a blob-free full clone passing offline while a blob-free shallow clone blocks.
- **Mutation check: every rule is load-bearing.** I removed each guard in turn, and each removal fails at least one test: shallow 2, history 2, privacy 1, code 1, LEADER DIP journal 2, receipts 1, intent keys 1, v1-like 7, grafts 1, unconditional absence 15. The explicit missing-object scan is defence in depth: missing commits or trees already make the history queries fail.
- **Status-only dry check against production main `4dfecf3`.** I made a blob-free full clone, read public files only, and printed booleans only:
  - not shallow, objects complete;
  - ledger never in history, absent at HEAD;
  - privacy mode off, `scan.mjs` pinned, three mandatory inputs present;
  - no LEADER DIP journal row.

  All are true. The **predicted result is PASS**, subject to the parts only the protected run can check: `PRIVATE_KEY` availability, authenticated decryption, and the absence of `pendingSale`, intents and receipts.
- **Not verified here:** `PRIVATE_KEY` availability. The only evidence is indirect: the bot last wrote `data/private.enc` on 27 Oct, and the job maps `secrets.PRIVATE_KEY` correctly. No secret value was accessed.

## Procedure after approval (unchanged order)

1. Install the amendment on main, as an approved ops commit applying `ops/bot-yml-preflight-v2.patch` only, with no other file. Do not merge this branch.
2. Recheck before the run: the main SHA, the `scan.mjs` SHA256 is still `dec6e8d4…`, both pins, and no pending bot or scanner run.
3. Pause, drain, and verify the save, as previously approved. Do not cancel active writers: old bot run `41029059529` runs until about 14:39 UTC at the latest.
4. Use the **one remaining** fresh preflight. Continue only on `PASS`. On `BLOCKED` or `ERROR`, abort safely, restore the ordinary workflows, and report status only.
5. Deploy only the approved accounting patch, verify CI and the hashes, and re-enable the ordinary workflows.

If main's `scan.mjs` changes before the run, the pin no longer matches and v2 BLOCKS by design. The pin then needs re-review.
