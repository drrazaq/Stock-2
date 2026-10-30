# Accounting preflight checker v2.2: approval package (proposed, not installed)

30 Oct 2026. Prepared by Claude on the isolated branch `claude/accounting-preflight-v2`. It supersedes the reviewed `d3596bf` (v2) and `f6076bb` (v2.1), for both of which Codex returned CHANGES REQUIRED. **The expanded output contract (`BLOCKED <CODE>`) awaits owner approval.**

**Nothing in production was changed:**
- no installation or workflow pause;
- no protected execution or dispatch;
- no ledger created, no financial state touched;
- **the single remaining fresh preflight authorization is unused.**

The accounting patch (SHA256 `f508496f14d729bc2898e430ba24be339f2d98b55a13cb093d158e6b7dd81d27`) and its approval are unchanged.

## Why v1 blocked

Preflight run `41053549859` (checker v1, blob `92fc955…`) returned `BLOCKED`:
- v1 treats any missing input as BLOCKED.
- `data/leaderdip-ledger.jsonl` has never existed on main.
- The other three inputs are present.

## Owner decision implemented

A missing LEADER DIP ledger counts as an *unused optional ledger* only when **all** conditions hold. Otherwise it BLOCKS with a reason code.

| Condition | Check (offline, read-only) | Code if it fails |
|---|---|---|
| History complete | Not shallow; no `info/grafts`; replace objects ignored; root commit present; every commit and tree reachable from HEAD present (`rev-list --objects --filter=blob:none --missing=error`); lazy fetch disabled (`GIT_NO_LAZY_FETCH=1`) | `LEDGER_HISTORY_UNCERTAIN` |
| Never existed | `git log --full-history --no-renames HEAD -- data/leaderdip-ledger.jsonl` empty (also covers deletions and renames) | `LEDGER_EXISTED` |
| Privacy mode off | The marker is absent from **both** HEAD's tree and the working tree | `PRIVACY_MODE` |
| Code supports absence | `scan.mjs` (identical to HEAD) has the reviewed SHA256 `dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c` (main `4dfecf3`; `ldipRows()` returns `[]` for a missing file, `ldipAppend()` creates it) | `CODE_UNREVIEWED` |
| No completed LEADER DIP full sale without its result | No journal row that is a LEADER DIP full sale. Part sales (`part`) and half sales (`half`) write no result row, so they are allowed. | `LEADER_DIP_RESULT_WITHOUT_LEDGER` |

### In every case (ledger present or absent)

**Mandatory inputs and key:**
- `private.enc`, `my-positions.json` and `my-trades.jsonl` are mandatory (`MISSING_REQUIRED_INPUT`). Missing state is never read as an empty account.
- No key gives `MISSING_KEY`. A wrong key, unauthenticated state or malformed inputs give `ERROR`.

**Pending work:** a `pendingSale` gives `PENDING_SALE`; any other top-level `pending` / `intent` / `recover` key gives `STATE_INTENT`.

**Receipts (finding 3), checked for consistency, never rejected wholesale:**

| Condition | Code |
|---|---|
| Not an array of 64-hex ids, or a malformed `saleId` | `RECEIPT_MALFORMED` |
| A repeated receipt | `RECEIPT_DUPLICATE` |
| One sale id on two journal or ledger rows | `RECEIPT_AMBIGUOUS` |
| A receipt with no journal row; a ledger sale id with no journal row; a receipted LEADER DIP full sale whose existing ledger lacks the `result` row | `RECEIPT_UNMATCHED` |
| A receipted LEADER DIP full sale with no ledger at all | `LEADER_DIP_RESULT_WITHOUT_LEDGER` |
| A journal or ledger sale id without a receipt (an unfinished transaction) | `JOURNAL_UNRECEIPTED` |
| At the accounting patch's 500-receipt cap, a missing receipt (no longer provable) | `RECEIPT_AMBIGUOUS` |

Consistent completed receipts PASS. The checker never clears receipts or writes ledger rows.

**Local copy = authoritative HEAD (finding 2):**
- Every dependency must be byte-identical to its HEAD tree entry, or absent from both: the four inputs, `scan.mjs` and `.github/private-data-mode`. Otherwise `LOCAL_STATE_DIFFERS`.
- So a committed privacy marker deleted locally, an edited `scan.mjs`, or an uncommitted input change cannot steer the result.
- A file that changes during the check, or a HEAD that moves, gives `STATE_CHANGED`.

**Existing ledger:** validated as in v1. Unreadable, malformed, a symlink or not a regular file give `ERROR`.

**Freshness (finding 1), new `--fresh` mode:**
- After the protected check, the workflow fetches current main into `FETCH_HEAD`.
- `node checker --fresh ROOT` (offline, no key) returns `BLOCKED STATE_CHANGED` if:
  - the checked-out HEAD is not an ancestor of main (rewritten history); or
  - any dependency differs; or
  - any commit in `HEAD..main` touched any dependency, even with no net change (for example a ledger added and then removed).

**Final consistency check (v2.2, Codex review of `f6076bb`):**
- When every dependency is proven identical to HEAD, the checker records its local state (absent, a regular file with its SHA256, or other) and its HEAD tree entry. Dependencies: the four inputs, `scan.mjs` and `.github/private-data-mode`.
- The bytes it evaluated must be those bytes.
- **Immediately before PASS**, it re-reads HEAD and every dependency's local state and tree entry. Any difference gives `BLOCKED STATE_CHANGED`.
- So an edit, creation, deletion or symlink swap of any dependency, or a commit moving HEAD, during the history walk blocks. Rewriting identical bytes does not.

**Output contract (awaiting owner approval):** exactly one line: `PASS`, `ERROR`, or `BLOCKED <CODE>`.
- The code comes from a fixed vocabulary of **16 reviewed codes**, carrying no symbol, amount, identifier or exception text: `MISSING_KEY`, `MISSING_REQUIRED_INPUT`, `PENDING_SALE`, `STATE_INTENT`, `RECEIPT_MALFORMED`, `RECEIPT_DUPLICATE`, `RECEIPT_UNMATCHED`, `RECEIPT_AMBIGUOUS`, `JOURNAL_UNRECEIPTED`, `LEADER_DIP_RESULT_WITHOUT_LEDGER`, `LEDGER_EXISTED`, `LEDGER_HISTORY_UNCERTAIN`, `PRIVACY_MODE`, `CODE_UNREVIEWED`, `LOCAL_STATE_DIFFERS`, `STATE_CHANGED`.
- Exit codes are 0, 2 and 1, with nothing on stderr.
- **The workflow allowlists exactly these codes** in both the protected and emit steps. An unknown code (for example `BLOCKED NOT_A_REVIEWED_CODE`), a malformed line, extra lines or a mismatched exit code is ERROR. The workflow publishes `status` and `reason` separately.

### Corrected documentation

**An open LEADER DIP position does not itself require a ledger or a sale.**
- Ledger rows are written by **offer logging** (`ldipOfferLog`, the nightly scan) and by **sale results**.
- An absent, never-committed ledger therefore means neither has been recorded: both workflows commit the whole `data/` folder, and the ledger is not gitignored.
- An open LEADER DIP position recorded through `ldipHit()`'s fallback to the published SQ11-PB12 list is consistent with that. It passes.

## Exact artifacts (branch `claude/accounting-preflight-v2`)

| File | SHA256 | git blob |
|---|---|---|
| `ops/accounting-preflight-v2.mjs` (checker v2.2) | `957560f0f3ebb8885492c21da623cd499241657411ac4df7e4efc133c8a22d35` | `aa45a67686ad8528a50404e6aa88b8c19d26e0ba` |
| `ops/accounting-preflight-v2.test.mjs` (57 synthetic checker tests) | `f4fa6448618d921403be2b65043c1f434731ca591e8b0ed1837fe68a59b533ad` | |
| `ops/accounting-preflight-wrapper.test.mjs` (16 wrapper tests on the amended `bot.yml`) | `84a50b5a21bb53354e0da1eb19dc997b72b736134b14fb3481700c613daa20b9` | |
| `ops/bot-yml-preflight-v2.patch` (workflow amendment) | `6f411d6a4d6b26d6e0249a5d49e9f75e58ec9fafe71508d679b8b4fea8a3f078` | |

The patch applies to main's `bot.yml` (SHA256 `1d25e6fec025f7a7e5e7a254cd61a9df4ecd7df97423b74a84fabd68ab6061e8`). It changes only the `accounting-preflight` job:
1. **Checkout:** `fetch-depth: 0` and `filter: blob:none`. The pinned `actions/checkout@11d5960…` is v4.3.0, which supports both. The clone takes about 1 s and about 2.3 MB.
2. **Blob and SHA256 pins:** set to the values above.
3. **Protected step:** accepts only `0:PASS`, `1:ERROR` or `2:BLOCKED <one of the 16 reviewed codes>`; anything else is ERROR. The timeout (`timeout 10s`), memory limit and raw-file cleanup are unchanged.
4. **Emit step:** re-validates the result against the same allowlist. On PASS, it fetches current main and runs the pinned checker's `--fresh` mode across every dependency, replacing v1's four-path diff; its output and **exit status are validated together**: only `0:PASS`, or `2:BLOCKED STATE_CHANGED`, is accepted, and a failed, timed-out (124), killed (137) or interrupted run, or any mismatch, is ERROR. A missing or unreadable protected result is ERROR. It emits `status` and `reason` outputs, exits 0, 2 or 1, and removes the checker files as before.

## Evidence

### Amendment exit/result consistency (Codex review of `77e4ead`; checker unchanged)

**The fix.** The freshness call no longer discards its exit status with `|| true`:
`frc=0; fresh=$(timeout 10s node … --fresh …) || frc=$?`, then `case "$frc:$fresh" in "0:PASS") …; "2:BLOCKED STATE_CHANGED") …; *) value=ERROR`. These are the same fail-closed rules as the protected step.

**Audit of every other command in the job:**
- The verify step runs under `set -euo pipefail`, so any failure fails the step, and the emit step then finds no result: ERROR.
- The protected step already captured `rc` and validates it with the output.
- The emit step's read of the result file used `|| true`. That was fail-closed (an empty value is ERROR), but it is now explicit: `if ! value=$(cat …); then value=ERROR; fi`.
- No `|| true` remains in the job, and a test asserts this.

**Wrapper regressions** (8 new; 16/16 pass):

| Case | Result |
|---|---|
| Freshness output `PASS` with exit 1, 2, 124 or 137 | ERROR |
| `BLOCKED STATE_CHANGED` with exit 0, 1 or 124 | ERROR |
| `ERROR` with exit 0 or 2; an empty line; `PASS` twice | ERROR |
| A **real** 10-second timeout after printing `PASS` | ERROR |
| Self-interrupted or killed (`SIGINT`, `SIGTERM`, `SIGKILL`) after printing `PASS` | ERROR |
| A missing protected result | ERROR |
| Protected step, real timeout or interruption after printing `PASS` (audit) | ERROR |
| Controls: `0:PASS`, `2:BLOCKED STATE_CHANGED`, `1:ERROR` | PASS, `BLOCKED STATE_CHANGED`, ERROR |

On the reviewed `77e4ead` amendment, 5 of these tests fail (it accepted `PASS` regardless of exit status). All pass now.

**Unchanged:** the checker (SHA256 `957560f0…`, blob `aa45a676…`, 57/57 tests). The end-to-end workflow simulation gives the same seven results as before.

### v2.2 focused evidence (Codex review of `f6076bb`)

**Gap 1, final consistency.** 8 new tests use a wrapper `git` that performs one local mutation when the checker reaches a history walk (the ledger log walk or the object walk), then runs the real git.

| Mutation during the walk | Reviewed `f6076bb` | v2.2 |
|---|---|---|
| `scan.mjs` edited (either walk) | PASS | `BLOCKED STATE_CHANGED` |
| Privacy marker created (either walk) | PASS | `BLOCKED STATE_CHANGED` |
| Dependency replaced by a symlink | PASS | `BLOCKED STATE_CHANGED` |
| Each input changed; ledger created; HEAD moved | `BLOCKED` | `BLOCKED STATE_CHANGED` |
| Controls: no mutation (either walk); unrelated file; identical bytes rewritten | PASS | PASS |

The 3 tests that fail on `f6076bb` reproduce the gap; all pass on v2.2. Mutation check: removing the final dependency loop fails 5 tests; removing the HEAD check fails 1; restricting the loop to the inputs fails 3.

**Gap 2, wrapper vocabulary.** `ops/accounting-preflight-wrapper.test.mjs` applies the patch to this checkout's `bot.yml` (pinned main version) and runs the protected and emit steps as written, against a fake checker. There is no key and no network: the emit step's GitHub URL is replaced by a local `file://` repository.
- **No drift:** both allowlists equal the checker's 16 reviewed codes.
- **Plumbing kept:** the timeout, memory-limit and cleanup lines are present.
- **Protected step:** keeps `PASS`, `ERROR` and **every one of the 16** `BLOCKED` codes. It turns 23 unknown or malformed outputs into ERROR, including `BLOCKED NOT_A_REVIEWED_CODE`, a bare `BLOCKED`, extra spaces or tokens, lower case, regex-like `MISSING_KEY|PASS` / `.*`, multi-line output, an empty line and a tab separator. It also turns 8 mismatched exit codes into ERROR.
- **Emit step:** publishes `status=BLOCKED reason=<code>` with exit 2 for every reviewed code, and turns every malformed value into `status=ERROR` with exit 1. PASS needs a fresh-mode PASS: `STATE_CHANGED` blocks, while any other fresh output, or a fetch failure, is ERROR. The checker files are always removed.

On the reviewed `f6076bb` patch, 3 of the 8 wrapper tests fail (no allowlist; unknown codes accepted by both steps). For example, a checker printing `BLOCKED NOT_A_REVIEWED_CODE` produced the result `BLOCKED NOT_A_REVIEWED_CODE`. All 8 pass on v2.2.

**Previously passed behaviour is unchanged.** All 49 earlier checker tests still pass (57/57 in total). The end-to-end workflow simulation with the v2.2 pins gives the same results as before: clean main PASS, unrelated change PASS, `scan.mjs` or marker change `BLOCKED STATE_CHANGED`, no key `BLOCKED MISSING_KEY`, pending sale `BLOCKED PENDING_SALE`, wrong key ERROR.

### Evidence carried from v2.1

- **Checker tests (run explicitly; ordinary CI runs only `test/` and `tests/`):** `node --test ops/accounting-preflight-v2.test.mjs` gave **49/49 pass** at v2.1 (57/57 at v2.2). They include:
  - regression tests for each finding: a committed marker deleted locally; local pinned bytes over unreviewed HEAD code; a `scan.mjs` or marker change during the preflight; a ledger added then removed; any input change; rewritten history; malformed, duplicate, unmatched, unreceipted and ambiguous receipts; receipts at the cap; ledger-only sale ids;
  - valid controls: legitimate receipts (manual, part, half, and LEADER DIP with its matching ledger result); a marker removed in history; unrelated changes on main;
  - integration: a blob-free full clone passes and a shallow one blocks; read-only behaviour in both modes.
- **Findings reproduced on the reviewed `d3596bf` and fixed in v2.1:**

  | Finding | Reviewed v2 | v2.1 |
  |---|---|---|
  | Committed privacy marker deleted locally | `PASS` | `BLOCKED LOCAL_STATE_DIFFERS` |
  | Legitimate completed receipt | `BLOCKED` | `PASS` |
  | Unmatched receipt | `BLOCKED` | `BLOCKED RECEIPT_UNMATCHED` |
  | `scan.mjs` changed on main during preflight | v2 workflow freshness `PASS` (change not seen) | `BLOCKED STATE_CHANGED` |

- **Mutation check:** I removed each guard in turn. 15 of 16 removals fail at least one test: local-vs-HEAD 5, freshness dependency list 4, freshness log range 1, freshness ancestry 1, receipt unmatched 1, unreceipted 3, duplicate 1, ambiguous 1, LEADER DIP result 1, legacy LEADER DIP 1, the part/half rule 2, blanket receipt rejection 12, ledger existed 2, code pin 1, shallow 2. The explicit HEAD-tree marker check is defence in depth: a committed marker deleted locally already fails local-vs-HEAD, and a present marker fails the local check.
- **Amended workflow simulation.** I extracted and ran the job's three shell steps on synthetic repositories (URLs swapped to `file://`):
  - clean main → `PASS`, outputs `status=PASS`;
  - unrelated change on main → `PASS`;
  - `scan.mjs` changed during preflight → `BLOCKED STATE_CHANGED`;
  - privacy marker committed during preflight → `BLOCKED STATE_CHANGED`;
  - no key → `BLOCKED MISSING_KEY`;
  - pending sale → `BLOCKED PENDING_SALE`;
  - wrong key → `ERROR`.

  The checker's own temporary files were removed.
- **Status-only dry check** against current main `9a94f80` (a blob-free full clone, booleans only, public files only):
  - not shallow; ledger never in history;
  - privacy off in both HEAD's tree and locally;
  - `scan.mjs` pinned; dependencies clean versus HEAD;
  - no LEADER DIP full sale in the journal; no journal sale-id rows.

  Without a key the checker returns `BLOCKED MISSING_KEY`. The **predicted protected result is PASS**, provided `PRIVATE_KEY` is available, the state authenticates, and it holds no `pendingSale`, other intent or receipts. With no sale ids in the journal, any receipt would be unmatched. These can only be checked by the protected run.

Reproduction harnesses (synthetic, reviewer-run): `ops/evidence/reproduce-findings.mjs`, `ops/evidence/simulate-workflow.py`.

## Procedure after approval (unchanged order)

1. Install the amendment on main: an approved ops commit applying `ops/bot-yml-preflight-v2.patch` only. Do not merge this branch.
2. Before the run, recheck the main SHA, `scan.mjs` (still `dec6e8d4…`), both pins, and that no bot or scanner run is pending.
3. Pause, drain and verify the save as approved. Do not cancel active writers.
4. Use the **one remaining** fresh preflight. Continue only on `PASS`. On `BLOCKED <CODE>` or `ERROR`, abort safely, restore the ordinary workflows, and report the status and code only.
5. Deploy only the approved accounting patch, verify CI and the hashes, and re-enable the ordinary workflows.

If main's `scan.mjs` changes before the run, v2.2 BLOCKS by design (`CODE_UNREVIEWED`), and the pin needs re-review.
