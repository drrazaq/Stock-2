# R1 save-recovery branches: bounded count, storage, retention, custody and limits (PROPOSAL; not implemented, not approved)

Requested by Codex (PR #1 6719813072, 6720355907). This is a proposal only: no code, setting, branch or deletion is changed by it. The cap check in §5 would be a separately reviewed code change, plus a new binding.

## 1. What a recovery branch is (current R1 design, unchanged)

- **When one is created:** a writer job whose save could not reach `main` after its retries pushes its unpublished commit(s) to a new, immutable branch `save-recovery/<workflow>-<run>-<attempt>-<UTC ns>-<sha12>` (`.github/sealed-git.sh` `sealed_recovery_push`). This goes through the same plaintext guard. There is one branch per distinct unpublished state per step.
- **Which jobs can create them (7):** `bot` (every 30 min), `main` (nightly 21:30 UTC, plus the 13:10–20:40 UTC weekday intraday runs), `ignition`, `movers`, `options-survey`, `Smart-money` and `leaders-study`. The other 3 T1 writers have no recovery path.
- **What happens next:**
  - The bot's recovery pass (`sealed-recover.mjs`, every bot run) merges a data-only checkpoint into `main` and then deletes **that merged branch only**, by compare-and-delete. This is the reviewed R1 behaviour, not retention cleanup.
  - Anything refused (code paths, stale owner state, a real conflict) is **kept** and the owner is warned. A person resolves it (RELEASE.md §D).
- **Today:** `git ls-remote` shows **0** `save-recovery/*` branches on the repository (8 Nov, read-only).

## 2. Measurement basis

- **Size of a checkpoint:** the bytes of Git objects reachable from it but not from `main`. Measured as the sum of `git cat-file -s` over `git rev-list --objects origin/main..<branch>`. These are uncompressed object sizes, an upper bound on stored size.
- **After R1:** T1 files are compressed and then encrypted. Ciphertext does not delta-compress, so stored size ≈ the sealed bytes.
- **Observed sizes:** new-object bytes per save commit, from the last 400 commits on `main`. These are pre-R1 plaintext sizes; sealed files are compressed, so they are generally smaller.

| Writer | Saves measured | Median | 90th pct | Max |
|---|---|---|---|---|
| bot | 40 | 0.2 KiB | 8.7 KiB | 11.2 KiB |
| main (scan) | 6 | 629 KiB | 1.24 MiB | 1.27 MiB |
| ignition | 4 | 4.5 MiB | 4.6 MiB | 5.4 MiB |
| movers | 4 | 430 KiB | 441 KiB | 458 KiB |
| Smart-money | 4 | 657 KiB | 685 KiB | 687 KiB |
| leaders-study | 1 | 17.4 MiB | — | 17.4 MiB |
| options-survey | 0 in this window | — | — | — |

- **Repository today:** packed objects 139.5 MiB, loose 59.6 MiB (local clone, 8 Nov).
- **Hosting limits:** GitHub recommends repositories stay under 1 GiB (5 GiB strongly recommended). A single push over 2 GiB is refused, as is a file over 100 MiB.

## 3. Proposed limits

| Limit | Value | Why |
|---|---|---|
| Open checkpoints, all writers | **at most 24** | A full day of bot runs failing (48) is covered at one checkpoint per run for half a day before the owner must act; the owner is already warned at the first. |
| Open checkpoints per writer | **at most 8** (`bot`, `main`); **at most 3** (the other 5) | One noisy writer cannot use up the shared budget. |
| Size of one checkpoint | **at most 32 MiB** | 1.8× the largest observed save (leaders-study 17.4 MiB). A larger one means something unexpected is in the save. |
| All open checkpoints together | **at most 128 MiB** | Under 10% of GitHub's 1 GiB recommendation, on top of today's ~140 MiB pack. It bounds the bot's every-run fetch of `save-recovery/*`. |

## 4. Retention

- **Clock start:** a checkpoint's age starts at the UTC timestamp in its name, which is also its commit time.
- **Merged checkpoints** are removed by the existing recovery pass, immediately after merge (§1). Nothing else is deleted automatically.
- **Kept (unmerged) checkpoints** are **never deleted automatically**:
  - **Day 0:** warned once, as today.
  - **From day 7 (proposed):** the daily health line would show `SAVE RECOVERY PENDING: N branches, oldest D days, X MiB`.
  - **From day 30 (proposed):** the line would read `STALE`. Nothing is deleted.
- **Deletion of an unmerged checkpoint** happens only with a separately approved, exact list (branch name + tip sha), after a person has inspected `git diff main...<branch> -- data/` and re-entered anything genuinely missing. Deletion uses compare-and-delete on that tip.
- **No cleanup is proposed or authorized now.**

## 5. When a limit is reached (behaviour to implement after approval)

`sealed_recovery_push` would check before pushing:
1. Count the existing `save-recovery/*` branches (`git ls-remote`), overall and for this writer.
2. Measure this checkpoint's size (§2) and the open total.

If any limit in §3 would be exceeded:
- **Do not push** a new recovery branch.
- **Never delete or overwrite** an existing one to make room (no eviction).
- Keep the commit on the runner and keep retrying the main push for the rest of the run (unchanged L2 behaviour).
- Print `Error: save recovery budget reached (<which limit>)`, fail the step loudly, and send the owner one `SAVE NOT CONFIRMED: recovery storage full` message per run.

**If the listing or size check itself fails (UNKNOWN):** push the checkpoint anyway, if its own size is within the per-checkpoint limit, and report `budget UNKNOWN`. A transient listing failure must not lose a save. The overshoot is bounded by one checkpoint (32 MiB).

**New explicit loss-of-save limit (L7):** once the budget is full, a save that also cannot reach `main` is lost when its runner ends, exactly as in L2. The owner has already been warned at the first kept checkpoint and again at the limit. This trades bounded storage for that risk. **It needs the owner's acceptance.**

## 6. Custody

- **Where they live:** checkpoints are branches in the same public repository `drrazaq/Stock-2`. They hold exactly the bytes `main` would have received, after the same guard: T1 files only as `.sealed` ciphertext.
- **Sensitivity:** they add no new class of data. They are as public as `main` and must be assumed copied by anyone watching the repository.
- **Who may delete:** only the owner, or Claude with an approved exact list (§4). No workflow gains a new permission; branch-protection and other settings are not changed by this proposal.
- **Key:** reading a sealed checkpoint needs the same key as `main` (G3). Losing the key loses checkpoints exactly as it loses `main`'s sealed files.

## 7. Cost basis

- **Money:** GitHub does not bill git storage for this public repository, and Actions minutes are free for public repositories. Checkpoints cost **$0**.
- **Real costs:**
  - repository size against the 1 GiB recommendation (bounded at +128 MiB by §3);
  - the bot's every-run fetch of `save-recovery/*` (bounded by the same 128 MiB, and 0 while none exist);
  - owner attention for kept checkpoints.
- `actions/checkout` in the writers uses the default shallow fetch of one ref, so checkpoints do not slow ordinary checkouts. The one exception is `bot.yml`'s dispatch-only accounting preflight (`fetch-depth: 0`, `filter: blob:none`): it also fetches the checkpoints' commits and trees, but not their file contents.

## 8. Decisions needed (in the single owner package, not now)

1. Accept the limits in §3, or name lower ones.
2. Accept L7: once the recovery budget is full, a save that also cannot reach `main` can be lost.
3. Confirm that unmerged checkpoints are never deleted automatically, and are deleted only from an approved exact list.
