# Accounting preflight checker v2.1: approval package (proposed, not installed)

30 Oct 2026. Prepared by Claude on the isolated branch `claude/accounting-preflight-v2`. It supersedes the reviewed `d3596bf` (v2), for which Codex returned CHANGES REQUIRED.

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

**Output contract:** exactly one line: `PASS`, `ERROR`, or `BLOCKED <CODE>`. The code comes from a fixed vocabulary that carries no symbol, amount, identifier or exception text. Exit codes are 0, 2 and 1, with nothing on stderr. The workflow rejects any other output as ERROR and publishes `status` and `reason` separately.

### Corrected documentation

**An open LEADER DIP position does not itself require a ledger or a sale.**
- Ledger rows are written by **offer logging** (`ldipOfferLog`, the nightly scan) and by **sale results**.
- An absent, never-committed ledger therefore means neither has been recorded: both workflows commit the whole `data/` folder, and the ledger is not gitignored.
- An open LEADER DIP position recorded through `ldipHit()`'s fallback to the published SQ11-PB12 list is consistent with that. It passes.

## Exact artifacts (branch `claude/accounting-preflight-v2`)

| File | SHA256 | git blob |
|---|---|---|
| `ops/accounting-preflight-v2.mjs` (checker v2.1) | `1ccf8c06d071627b92871331e21016acbd6bd82cae0250c353ce7a07150290df` | `4be2f5ad078aa99cba513290f25d50e6a549663d` |
| `ops/accounting-preflight-v2.test.mjs` (49 synthetic tests) | `088b44dc9e9ba8eca76e45ed98df40b5209ba2de9651d8343d21b3a85a7cfb33` | |
| `ops/bot-yml-preflight-v2.patch` (workflow amendment) | `5eb17d2fd23a56edf378ae43e5af057864ad1e7c1f4500a79a2914b90a14b517` | |

The patch applies to main's `bot.yml` (SHA256 `1d25e6fec025f7a7e5e7a254cd61a9df4ecd7df97423b74a84fabd68ab6061e8`). It changes only the `accounting-preflight` job:
1. **Checkout:** `fetch-depth: 0` and `filter: blob:none`. The pinned `actions/checkout@11d5960…` is v4.3.0, which supports both. The clone takes about 1 s and about 2.3 MB.
2. **Blob and SHA256 pins:** set to the values above.
3. **Protected step:** accepts `0:PASS`, `1:ERROR` or `2:BLOCKED <CODE>`; anything else is ERROR.
4. **Emit step:** on PASS, it fetches current main and runs the pinned checker's `--fresh` mode across every dependency, replacing v1's four-path diff. It emits `status` and `reason` outputs and exits 0, 2 or 1.

## Evidence

- **Checker tests (run explicitly; ordinary CI runs only `test/` and `tests/`):** `node --test ops/accounting-preflight-v2.test.mjs` gives **49/49 pass**. They include:
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

If main's `scan.mjs` changes before the run, v2.1 BLOCKS by design (`CODE_UNREVIEWED`), and the pin needs re-review.
