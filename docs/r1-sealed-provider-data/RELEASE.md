# R1 release, migration and recovery package (review only; NOT approved, NOT executed)

This is the executable plan for deploying R1. Nothing here has been run against production.
- **Rehearsal:** every step below is exercised offline by `test/sealed-release-rehearsal.test.mjs` against a throw-away origin, with the real scripts and a synthetic key.
- **Roles** (as in the 7 Nov STOP/T/D maintenance):
  - **Owner:** the only person who approves, disables and enables workflows, and holds the key.
  - **Claude:** operator for pushes and the dispatch.
  - **Codex:** independent read-only verifier. Codex does not hold the key, so it uses the keyless checks.

## A. Entry gates (all required before the window opens)

| Gate | Evidence |
|---|---|
| G1 Codex verdict PASS on the **exact** candidate commit and manifest | PR #1 comment |
| G2 Owner approval of **this** unit, window and roles | owner message |
| G3 Key decision K1 (`PRIVATE_KEY`) or K2 (new dedicated secret, created by the owner) **and** the owner's statement that a copy exists outside GitHub. Claude never sees or asks for the value. | owner message |
| G4 Refreshed review of the STOP-pinned `ignition-watch.mjs` (changed by R1) | Codex |
| G5 Owner acceptance of the residual public outputs (README §11 item 3) **or** a separate decision to defer them. R1 does not close them. | owner message |
| G6 `node r1-release-precheck.mjs b0d76987 <candidate> origin/main` = **PASS**, run at the start of the window (on 8 Nov: PASS, 46 files, 0 drift) | operator log |
| G7 No other release in flight; Codex available for the whole window | both |

**Suggested window:** a weekend, outside the market. Production writers on weekends:
- bot: every 30 min;
- `fastmover-intraday`: Sat 05:00 UTC;
- `leaders-study`: Sun 06:00 UTC;
- Smart-money: Sun 09:30 UTC.

For example, Saturday 08:00–10:00 UTC (11:00–13:00 Kuwait). During the window the bot does not answer, for about 20–40 minutes.

## B. Procedure

| Step | Who | Action | Pass condition (receipt) | On failure |
|---|---|---|---|---|
| B1 | Claude | Record `M0` = current main sha. Re-run G6 against `M0`. | precheck PASS | stop: rebase and re-review |
| B2 | Owner | Disable the 10 T1 writer/saver workflows: `ignition`, `bot`, `main`, `movers`, `options-survey`, `Smart-money`, `leaders-study`, `opportunity-radar`, `scorecard-1023`, `fastmover-intraday`. Reply "DONE DISABLE". | — | — |
| B3 | Claude | Save the GitHub run listings (statuses: queued, in_progress, waiting, requested, pending). Run `node r1-writer-gate.mjs <files>`. | **PASS** (no writer run active) | wait for the run to finish, then repeat. **Never cancel** without a separate owner approval. |
| B4 | Claude | Apply the reviewed allowlist diff onto `M0` (it applies byte-exactly, since G6 passed). Push as commit `C`, parent `M0`. | push accepted; CI on `C` green with a complete hosted log | revert `C` (rollback **R-0**) |
| B5 | Codex | Verify `C`: allowlist hashes equal the manifest; the tree is `M0` plus exactly the allowlist. | Codex receipt | R-0 |
| B6 | Claude | Dispatch `r1-migrate.yml` once with `confirm=MIGRATE-R1` and `source_sha=C`. | job green; log shows `--apply` and `--verify-tree origin/main`, problems 0 | job red: nothing published (fast-forward-only push). Fix the cause, then dispatch again with the then-current `C`. Writers stay off. |
| B7 | Codex | Clone main. `node sealed-migrate.mjs --verify-structure origin/main` (keyless): manifest count = the T1 plaintext count at `C` (`--plan` at `C`), exact sealed set, no T1 plaintext, parent = `C`. | Codex receipt | **R-1** |
| B8 | Claude | Writer gate again (nothing ran meanwhile). | PASS | wait |
| B9 | Owner | Enable the workflows: the **bot first**, then the others. Reply "DONE ENABLE". | — | — |
| B10 | Claude + Codex | Post-release checks: first bot save published (tg offset advanced; `save-recovery/*` branches = 0; health line contains no `SEALED_*`); first nightly scan (options lane ran, `options-shadow.json.sealed` updated, no plaintext); first watcher day (live record and run archives sealed; ledger day segments; artifact holds `.sealed` only); guard and driver lines present in each save log. | receipts | **R-2** |

## C. Rollback (state-safe: nothing re-publishes plaintext)

| Where it fails | Rollback |
|---|---|
| **R-0**: before the migration (after B4 or B5) | `git revert C`. The tree returns **byte-identical** to `M0` (rehearsed). Plaintext was never removed, so nothing new is published. Re-enable the writers on the old code. |
| **R-1**: the migration is published but the receipt fails | **Do not revert the code** (pre-R1 code cannot read sealed files and would start new **plaintext** files). Keep writers off. Diagnose using the receipt problems; fix forward with a reviewed patch. The data is safe in the sealed files and in history. |
| **R-2**: after re-enable, a defect | Disable the affected writer only. Readers show UNKNOWN; the sealed data stays intact. Fix forward. |
| Returning to plaintext in this public repository | Not a rollback: it re-publishes. A separate explicit owner decision. |

## D. Recovery procedures

| Situation | Procedure |
|---|---|
| A save could not reach main | **Automatic.**<br>1. The saving job pushes its unpublished commit to `save-recovery/<workflow>-<run>-<attempt>`, through the same push guard.<br>2. The bot merges these branches into main on every 5-minute check (`bot_recover`) and deletes them.<br>3. A branch that cannot merge (an options clash) is **kept**, and the owner is told "SAVE NOT CONFIRMED".<br>**Manual:** list `save-recovery/*` branches; a merged one is gone. |
| Data needed outside the repository (audit, provider question, move to private storage) | `node sealed-migrate.mjs --export-to <new empty folder outside the checkout>`. Needs the key; refuses folders inside the checkout, symlinks and non-empty folders. |
| Key lost | The sealed files cannot be recovered. **Prevention is G3.** History before the migration still holds the old plaintext (public); data written after the migration is lost. |
| Key compromised | The sealed files must be considered readable by whoever holds the key. Rotating needs a reviewed re-seal (decrypt with the old key, seal with the new) **and** an owner key action. Not built; not authorized now. |

## E. Loss-of-save limitations (explicit)

What R1 rev4 guarantees, and where a recorded change can still be lost:

| # | Limitation | When | Mitigation in rev4 | Residual |
|---|---|---|---|---|
| **L1** | **Runner lost before any push attempt** | the VM dies, or the job is force-killed between recording a change and its save (a bot owner command: within about 25 s to 5 min of the reply) | saves run every bot loop; a final `if: always()` save step runs on loop failure, timeout or ordinary cancel | a hard kill or runner loss in that window loses the change. **The bot already replied "recorded"**, and Telegram has delivered the message, so it is not sent again. The owner must resend it. |
| **L2** | **Both pushes refused** | GitHub refuses or is unreachable for main **and** the recovery branch, and the runner then ends | the commit is kept locally and retried at every later save in the same run; SAVE NOT CONFIRMED is sent once per run | if the outage outlasts the runner, the change is lost (tested: "exists only on this runner") |
| **L3** | **A real clash on the owner's options record** | two writers changed `real` differently | refused, never one side; kept on the runner, then on a recovery branch; the owner is warned | pending, not lost, until resolved by hand (the scan never writes `real`, so this needs two bot writers at once) |
| **L4** | **A guard refusal** | a save would publish T1 plaintext | the save is refused, and so is the recovery push | that save's **other** changes (for example a Telegram offset) wait locally and are not published until the plaintext is removed. A design choice: no publication beats a leak. |
| **L5** | **Sealed-file conflicts outside the options record** | a `.gz` changed on both sides, or no key at merge time | conflict → retry → recovery branch | pending on the recovery branch until a later merge succeeds |
| **L6** | **Nightly scan, watcher and labs** | the same as L1 and L2 for their own runs | recovery branch on final failure (all save paths) | as L1 and L2. Before rev4 the watcher's whole day of ledgers was lost in this case; Smart-money also failed silently (now it fails loudly). |

"Recorded" in a bot reply means recorded in that run. It is durable once a later save publishes it to main or to a recovery branch. Making the reply itself wait for a durable push would remove L1 for owner commands; that is a larger bot change and is **not** in R1.

## F. Receipts to record

- **Precheck:** precheck output.
- **B3/B8:** writer-gate output and the saved listing hashes.
- **`C`:** sha, parent `M0`, CI run id, and a complete hosted-log hash.
- **Migration:** job run id, `--verify-tree` line, `--verify-structure` line (Codex), manifest count and its hash.
- **Post-release:** the first bot, nightly and watcher run ids with the B10 checks.
