# R1: stop publishing provider market data in the public `Stock-2` repository (complete candidate, review only)

**Prepared by Claude on 8 Nov 2026 at the owner's request. Not deployed.**
- **Not done:** no production change, workflow run or dispatch, settings or secret change, history rewrite, visibility change, spending or provider message. No real key was used and no real provider data was decrypted or published: every test is synthetic; the cost figures are aggregate sizes of files already public.
- **Base:** `origin/main` `b0d76987`. **Branch:** `claude/r1-sealed-provider-data`. The candidate commit and the exact file allowlist are in `MANIFEST.md`.
- **Inputs:** D2 (`276215ff`), Stage 1 (`0b3bc095`), and Codex's Stage 1 verdict (CHANGES REQUIRED, PR #1 comments 6717284560 and 6717307865; evidence `a7a2039a`).
- **Not a legal conclusion.** Ciphertext in a public repository reduces plaintext exposure. It is not shown to satisfy any provider's terms, and what this owner actually accepted is not established. **R1 removes nothing already published** (§9).

## 0. Rev3: Codex's re-review of `ae8cbb63` (PR #1 comment 6717623537) and the owner-state race

Each blocker has a reproduction test. The tests were run against the corrected code (pass) and against `ae8cbb63` (fail), except where noted.

| Blocker | Repair | Reproduction (rev3 pass / `ae8cbb63` fail) |
|---|---|---|
| **1. Recovery escape** | `--export-to` checks the **real path**, not the lexical one. It refuses the checkout and its ancestors and any symlink in the destination path, creates each component itself, writes files with `O_EXCL\|O_NOFOLLOW`, mode 0600, and only into a new or empty folder. | `sealed-migrate`: Codex's outside symlink into the checkout; symlink below the root; non-empty folder; second export. |
| **2. Durability error swallowed** | A directory `fsync` error now propagates (only EINVAL/ENOTSUP, "unsupported", is tolerated). The plaintext copy is removed only after a durable, read-back-verified sealed copy exists. Short writes are completed; a zero-progress write fails. An I/O seam (`sealedIO`) is used for fault injection. | `sealed-blockers`: injected directory EIO (the write fails and the original plaintext is kept); 7-byte short writes; zero write. |
| **3. Missing key + absent record** | Without the key an absent record is **not "known empty"**. `scan.mjs` marks every T1 read `SEALED_KEY_MISSING`, so the options lane returns **before any request or ticket**, and owner option commands reply NOT RECORDED. Every writer job (missed-runners, shadow-outcomes, scorecard, movers, options-survey, fast-mover live) exits 1 at start, before any request. Health and watcher evidence report it even when the files are absent. When the key is present, absent and unreadable stay distinct. | `sealed-blockers`: Codex's options-lane reproduction (0 requests); the command with and without the key; six writer jobs under a fetch tripwire (0 requests, 0 files); health. |
| **4. Migration provenance and completeness** | `--apply <approved source sha>` requires HEAD = that commit and a **clean** checkout (no staged, unstaged or untracked change). Bytes come from the commit. It writes and commits `.github/r1-migration-manifest.json` (source id; every path, size, sha256). The index and the pushed tree must hold **exactly** that set, decrypting to the same hashes, with no plaintext. Zero files is refused. The receipt checks that the migration commit's **parent is the approved source**. The workflow checks out that sha, pushes **fast-forward only** (no rebase, no retry), and verifies `origin/main`. | `sealed-migrate`: Codex's staged synthetic addition; untracked file; dirty tree; HEAD ≠ source; zero files; missing, extra or changed sealed file; a commit rebased off the source. |
| **5. Guard after reconciliation** | `sealed_push_guard` (`sealed-guard.mjs --push`) runs **after** pull/rebase, immediately before **every** push (5 workflows, `save-data.sh`, the bot). It checks the exact tree to be published. **Pre-migration policy:** it refuses T1 plaintext that is new or changed relative to `origin/main`, so offset-only bot saves still publish. **After migration** (manifest present): it refuses **any** T1 plaintext, so an old writer's plaintext arriving through the rebase is never re-published. **Writer quiescence:** `r1-writer-gate.mjs` decides offline, from saved GitHub run listings, and passes only when no T1 writer run is queued, waiting or in progress. | `sealed-blockers`: a pre-migration offset save publishes; after migration, an old writer's plaintext arriving through the rebase is refused at push with nothing published; gate cases. `sealed-wiring`: every push line is guarded. |
| **Owner-state race** | `data/options-shadow.json` merges **by top-level key**: your `real` trades (bot) and the paper keys (scan) never overwrite each other. A key changed differently on both sides is a **conflict whatever `-X theirs` says**: refused, never one side. The bot's save moved to `.github/bot-save.sh`. It now retries **any unpublished commit** at the next save (before rev3, a refused push left the commit behind indefinitely unless something new changed), and on failure tells you **once per run**: "SAVE NOT CONFIRMED". A "recorded" reply means recorded in that run; it is published at the next successful save. | `sealed-blockers`: Codex's exact case (`ae8cbb63` result `real: []`; rev3 keeps both); a real clash refused, origin untouched, local commit kept, one warning; unpublished-commit retry*. |

\* The retry test exercises the new `bot-save.sh`. The old inline bot save cannot be run as a file, so that case shows the fix, not a reproduction.

**Cost (Codex: 0.49 MB/day was not a bound).** The calculation exposed a real problem. Whole-file rewrites of ever-growing ledgers grow history **quadratically**: about **1.78 GB in a year** at today's growth rates. Rev3 fixes it:
- the five append-only ledgers append to **daily sealed segments** (`data/x.jsonl.d/DAY.jsonl.sealed`);
- readers see base + segments unchanged;
- an unchanged record is not rewritten, so a fresh IV no longer makes an identical record a new blob.

Projected one-year growth is now about **25 MB**, against about **26 MB** for plaintext today (§8).

## 1. Codex's Stage 1 findings and how this candidate answers them

| Finding | Repair in this candidate | Proof (tests) |
|---|---|---|
| **R1-C1: publishing completeness.** The website also fetches `discovery.json`; options Markdown and logs; derived outputs; dynamic archives; the watcher artifact. | **Publishing-path matrix (§4)** with a disposition for every channel. Options JSON and Markdown are sealed. Per-stock option quotes and the survey summary are no longer printed to the public log. The smart-money message text is no longer printed. Artifact: `data/ignition-runs/` now holds sealed files only. Derived and T2 outputs are listed as **residual**, not claimed. | `sealed-wiring` 11/11: no plain fs I/O on any T1 path in any module; logs; stage lists; artifact; website. |
| **R1-C2: plaintext left in HEAD.** | Every stage step uses `sealed_stage` (`git add -A` on both the plain and the `.sealed` name), so the deletion is committed. The guard reads the **index or tree**, never the working folder. | `sealed-git`: reproduces the trap (plaintext still in HEAD), then shows ciphertext only in HEAD. `sealed-migrate`: every deletion is staged and the tree verified. |
| **R1-C3: no file binding; keyless legacy read; malformed input; durability.** | Format v2 binds the **logical path** (for example `data/opp-ledger.jsonl`) and the version in the AES-GCM additional data. Reading plaintext when no sealed copy exists is **refused** (`SEALED_LEGACY_PLAINTEXT`), with or without a key, so the only way in is the reviewed migration. Binary format with a strict header; base64 or other renderings are rejected. Each write is temp file + fsync + rename + directory fsync + read-back decrypt and compare, and only then is a plaintext copy removed. Callers show UNKNOWN with the code; they never treat the file as empty or overwrite it. | `sealed-store` 10/10 (replay at another path, keyless legacy read, every tampered region, base64 and the inserted-`!` probe, exclusive write, no temp files left). `sealed-readers` 8/8 (bot, health, watcher evidence, ledgers). |
| **R1-C4: custody, key and terms.** | The key is read from `SEALED_SECRET` only. The workflows map it per step (never job-wide) from a secret. **Which secret is an owner decision (§7), and the backup of the master secret is NOT established.** The "owner backup" claim from Stage 1 is withdrawn. No legal claim is made. | `sealed-wiring`: the key appears on exactly the 18 listed steps; never job-level, never echoed. |
| **R1-C5: concurrency, cost, rollback.** | A **git merge driver** for `*.sealed` (`sealed-merge.mjs`): it decrypts, takes a 3-way line union for `.jsonl` and a 3-way text merge for `.json`/`.md` with the workflow's existing `-X theirs` preference, then re-encrypts. A `.gz` changed on both sides, a missing key or an unreadable file is a **conflict**: the save fails loudly and never keeps one side. The guard refuses to commit if the driver is not registered. The leaders-study copy-back now does a 3-way sealed merge. Cost is **measured** (§8). Rollback is state-safe (§6). | `sealed-git` 8/8: Codex's lost-append case reproduced without the driver and fixed with it; JSON merge and conflict; binary and keyless conflicts; `save-data.sh` end to end; the leaders-study merge. |

## 2. Mechanism (format v2)

- **Storage:** `data/x` is stored as `data/x.sealed`, raw binary: `"S2SEAL" | 0x02 | flags | IV(12) | tag(16) | ciphertext`.
- **Compression:** compress then encrypt (deflate; gzip payloads are not compressed twice).
- **Encryption:** AES-256-GCM. The additional data is the header plus the logical path.
- **Key:** `sha256("stock-2 sealed provider data v1\0" || secret)`, so it is domain-separated from `private.enc`'s `sha256(secret)`.
- **Writes:** `writeSealed` never writes plaintext. A missing key throws **before** any file is touched. `{exclusive:true}` replaces `{flag:'wx'}` (an archive is never replaced).
- **Reads:** sealed copy → decrypt. Plaintext only → `SEALED_LEGACY_PLAINTEXT`. Neither → absent (`null`).
- **Git integration (`.github/sealed-git.sh`):**
  - registers the merge driver;
  - provides `sealed_stage`;
  - provides `sealed_guard` (`sealed-guard.mjs --staged`), which refuses a commit that **adds or modifies** a T1 path in plaintext or a temp file, or a commit made without the driver.
  - Plaintext tracked from before the migration does not block unrelated saves, so the bot keeps saving its Telegram offset.
  - `--all` and `--tree` are the strict forms, used by the migration and deployment checks.
- **`.gitattributes`:** `*.sealed -text -diff merge=sealed`.

## 3. Inventory reconciliation (exact denominator)

`t1-inventory.tsv` lists every T1 path tracked at `b0d76987`, with family, writer and provider:

- **45 tracked files** = **D2's 34** + **11 same-family files** that D2's numeric price-field scanner did not count.
- **The 11 added files:**
  - 8 `ignition-runs/*/RUN-progress.json` (quote-age heartbeats);
  - `fastmover-live.json`;
  - `movers-journal.jsonl` (per-stock returns);
  - `options-spread-survey.md` (the Markdown table of OPRA quotes Codex flagged).
- **They are sealed by family:**
  - shadow days;
  - every file under `ignition-runs/DAY/` (including the delivery-recovery file);
  - 5 append ledgers;
  - 5 state files;
  - the survey Markdown;
  - the monthly analyst archives (`T1_PATTERNS` in `sealed-store.mjs`; 6 rules, plus a 7th in rev3 for the daily ledger segments).
- **Correction:** Stage 1's phrase "35 paths/patterns" was imprecise. The exact figure is 45 files today, under 6 pattern rules covering 14 families.
- **Not T1 (unchanged, residual):** `opp-days.jsonl`, `ignition-days.jsonl`, `ignition-paper.jsonl`, `radar-v3-*`, `shadow-outcomes/`, `shadow-report.json`, `missed-runners.json`, `smart-money.json`, the tips ledger, `signals.json`, `discovery.json`, and the other D2 T2 files.

## 4. Publishing-path matrix

| Channel | Before | After R1 (this candidate) |
|---|---|---|
| **Writer output** | `ignition-watch` (live, runs, progress, delivery-recovery, shadow, premarket, early-wave, opp-ledger), `missed-runners`, `movers`, `fastmover-lab` (live mode), `options-survey` (JSON+MD), `scan.mjs` options lane + owner option commands, `smart-money` archive | **All sealed** through `sealed-store` (statically enforced: no plain fs call on a T1 path in any module) |
| **Readers** | `shadow-outcomes`, `watcher-reporting`, `health`, `scorecard-1023`, `scan.mjs` (fast movers, MOVED TODAY, movers, options) | Sealed reads. On failure: UNKNOWN with the code, or the job stops (`exit 1`) without writing |
| **Git staging** | explicit `git add` lists (`ignition`, `options-survey`, `leaders-study`); broad `git add data` (`bot`, `main`/`save-data.sh`, `movers`, `Smart-money`) | `sealed_stage` for every T1 name and folder (deletions included); `sealed_guard` before every commit in these 6 workflows and `save-data.sh`; the merge driver is registered in each. The other 8 broad stagers run no T1 writer (tested) |
| **Concurrent saves** | `pull --rebase [-X theirs]`; text merge | Sealed merge driver (union / 3-way / conflict) |
| **Website (Pages)** | `pages.yml` publishes `index.html` only; the page fetches `signals.json` + `discovery.json` raw from the repository (T2) | **Unchanged**; the page names no T1 or `.sealed` file (tested). T2 contents are not re-checked here (residual) |
| **Raw URLs / clones / API of the tip** | T1 plaintext readable | Ciphertext only, once the migration commit is made. **History is unchanged** |
| **Watcher artifact** (`watcher-evidence-*`, 7 days) | `ignition-runs/` plaintext + `radar-v3-*` + runtime message state | `ignition-runs/` sealed only; `radar-v3-*` and message state unchanged (residual T2) |
| **Actions logs (public)** | options survey per-stock lines + summary JSON; full smart-money message | Counts only. Other modules' log lines were **not fully audited** (residual: alert and ACTIONS text echoes) |
| **Actions caches** | `fm-cache` (Massive minute bars) | **Unchanged (residual).** Not repository content, but restorable by workflows in this repository |
| **Alternate writers / CLI** | any script writing the T1 names | Static test covers every root module; `sealed-guard` blocks any plaintext T1 reaching a commit |
| **Failure paths** | — | No key: the watcher keeps **watching and alerting**, saves nothing T1, exits 1 (run shows failed). Other jobs stop with `SEALED_KEY_MISSING`. The bot replies NOT RECORDED to an option command and never overwrites the record |

## 5. Fail-closed behaviour (tested through the actual processes)

- **Watcher (actual `ignition-watch.mjs` process):**
  - with the key: every T1 output is sealed, with no plaintext or temp files;
  - without the key: market requests continue, nothing T1 is written (sealed or plaintext), and the exit code is 1;
  - an unreadable live file is not overwritten.
- **Bot:**
  - options record under another key, or no key: the owner's option command answers **NOT RECORDED**, and the record bytes are unchanged;
  - the nightly options lane stops before any ticket, market request or paper change;
  - the options lab and movers lines show UNKNOWN with the code.
- **Health:** a tampered or keyless sealed file is a named problem with state UNKNOWN. Watcher evidence becomes "UNKNOWN" and actionable.
- **Ledger jobs** (missed-runners, shadow-outcomes, movers journal): they stop with the code and write nothing. They never restart a ledger from empty.

## 6. Migration, deployment order and state-safe rollback

**Migration (`sealed-migrate.mjs --apply <approved source sha>`, dispatch-only `r1-migrate.yml` with `MIGRATE-R1` and `source_sha`; never run here), rev3:**
1. Checks out exactly the approved source. `main` must still equal it.
2. Requires a clean checkout.
3. Seals each T1 file from the commit's own bytes, with a durable read-back.
4. Stages each deletion with its addition.
5. Writes the manifest.
6. Verifies the index (exact set, hashes, no plaintext).
7. Commits.
8. Verifies `HEAD` again.
9. Pushes **fast-forward only** (no rebase, no retry).
10. Verifies `origin/main`, including the parent = source check.

An interrupted run leaves nothing committed. A clean checkout of the source restarts it (tested).

**Deployment order (separate owner approval; STOP-style release discipline; not yet an approved executable unit):**
1. Owner key decision (§7).
2. Disable the T1 writer workflows: ignition, movers, options-survey, Smart-money, leaders-study, main, bot, opportunity-radar, scorecard, fastmover-intraday.
3. **Writer gate:** save the run listings, then `node r1-writer-gate.mjs` must PASS (no writer run queued, waiting or running).
4. Push the code. The parent is recorded.
5. Dispatch `r1-migrate.yml` once with `source_sha` = main after step 4.
6. Receipt: the job's `--verify-tree origin/main`, plus an independent re-check.
7. Writer gate again, then re-enable.

Any missing, partial or late receipt follows the reviewed rollback path: no re-enable, and the readers show UNKNOWN.

Between steps 3 and 4 the readers would show `SEALED_LEGACY_PLAINTEXT` (fail-closed), which is why the writers are off. `ignition-watch.mjs` is in the STOP-pinned set: its pins need a refreshed review, not an automatic release.

**Rollback without re-publishing plaintext:**
- **Code defect:** fix forward on the sealed format. A code-only inverse to pre-R1 is **not safe**: pre-R1 code would not see the sealed files, would start fresh **plaintext** files (publishing new data again) and would lose the ledgers' history in use.
- **Emergency:** disable the affected T1 writer workflow. The sealed data stays intact, and the readers show UNKNOWN.
- **Recovery of the data:** `sealed-migrate.mjs --export-to <dir outside the repository>`. It refuses any folder inside the repository (tested), for example a folder in the private repository or on the owner's computer.
- **Returning to plaintext in this public repository** would re-publish. It is an explicit owner decision, not a rollback step.

## 7. Key custody: owner decisions, not established facts

- **K1 (candidate default): reuse `PRIVATE_KEY`.**
  - The secret already exists and nothing needs creating.
  - The same master secret reaches **18 workflow steps**: 16 that did not have it before (the readers, writers, save steps and the migration), plus the 2 that already had it (the nightly scan and the bot loop). The subkey isolates the files' key from `private.enc`'s key, not the master secret's exposure.
  - Its entropy, the owner's backup and recovery are **NOT established**, and nothing was inspected.
  - If it is lost, the sealed files are unreadable (as `private.enc` already is).
- **K2: a dedicated new secret.**
  - Better isolation.
  - Needs the owner to create a strong random secret **and keep a backup**, which is a credential action not authorized now.
  - The change is a one-word edit per step (`secrets.PRIVATE_KEY` → the new name).
- **Recommended:** K2 if the owner can keep a backup; otherwise K1 with a written recovery requirement. Before deployment, either way, the owner should confirm that **a copy of the chosen secret exists outside GitHub**, because GitHub secrets cannot be read back.

## 8. Cost (public T1 files at `b0d76987`; aggregate sizes only; reproducible with `node docs/r1-sealed-provider-data/cost-projection.mjs` from the base checkout)

| Measure | Value |
|---|---|
| Plaintext / as git stores it (zlib) / **sealed v2** | 8.21 MB / 2.56 MB / **2.53 MB** (Stage 1 base64: 10.95 MB) |
| CPU to seal all 45 files | about 0.4 s |
| **Rewrites per weekday**, from the schedules | watcher 1 effective run (the second cron exits); movers 1; nightly scan 1 (the options lane runs in `daily()` only); bot only on your option commands; smart-money 1; leaders-study weekly; options-survey on dispatch. A retry adds no blob; each driver merge adds one. |
| Ledger growth | about 52.7 KB/day sealed across the 5 append ledgers (their measured size divided by the days each has existed) |
| State files rewritten whole (live, movers-state, fastmover-live, options-shadow) | about 47.7 KB per weekday, upper bound (an unchanged record is now skipped) |
| **One year (250 weekdays), whole-file rewrites (`ae8cbb63`)** | **about 1.78 GB**: quadratic, because each day re-adds the whole grown ledger |
| **One year, rev3 daily segments** | **about 25 MB**, against about 26 MB for plaintext today (same method) |
| Per-run archives and shadow days | new files each day in both designs, so no difference |
| Not established | GitHub's packing of these blobs (ciphertext has no deltas; the figures are object sizes); storage billing beyond the public allowances; clone and fetch time. Public runners do not prove zero spend. |

## 9. Existing public copies (separate assessment; unchanged by R1)

- **What stays public:**
  - every earlier commit, raw URLs to old commits, clones and forks (0 forks visible, which does not prove there are no copies);
  - caches and search or archive copies;
  - the unexpired watcher artifact 13536188063 (run 42231862220, expires 13 Nov 19:58 UTC, per Codex's metadata check).
- **What R1 does:** changes only the **tip** and future commits.
- **What removing history would need:**
  - a rewrite of the full history;
  - coordination with the running workflows;
  - a GitHub cache purge.

  It is **not authorized**. Making the repository private costs money (not authorized). Asking the providers (R4) is optional, and nothing was sent.

## 10. Tests (Node 20.20.0; non-loopback network refused, 0 attempted)

| Run | Result |
|---|---|
| R1 tests (rev3): `sealed-store` 12, `sealed-git` 8, `sealed-migrate` 7, `sealed-readers` 9, `sealed-wiring` 12, **`sealed-blockers` 12 (new)** | **60/60** |
| Same reproduction files against `ae8cbb63` (imports shimmed only) | `sealed-blockers` 9 of 12 fail, `sealed-migrate` 6 of 7 fail (the passing ones are the writer gate, `bot-save.sh` itself and the loopback check, which are new rev3 files, plus `plan`) |
| Updated fixtures (T1 fixtures now sealed with a synthetic key, as production writes them): `load-scan` harness, `feed-integrity-watcher` (+2 new end-to-end R1 cases), `sec-request-runtime`, `private-data`, `watcher-resilience`, `watcher-incident-revision` | pass |
| Gated actual-watcher scenarios (`INCIDENT_WATCHER_SRC`) | `watcher-resilience` 9/9, `watcher-incident-revision` 11/11 |
| Full serial suite (147 registered files, rev3) | **147/147** (`premarket-feed` is wall-clock dependent; see `MANIFEST.md`) |

## 11. Remaining blockers and unresolved findings (rev3)

**Release blockers, not code:**
1. **Key custody:** K1 or K2, plus your backup verified outside GitHub (§7). An owner decision; no key was changed.
2. **An approved executable deployment unit:** exact parent; writer gate evidence; the complete hosted receipt; restoration gates; refreshed STOP watcher pins and independent release review (`ignition-watch.mjs` is unchanged since `ae8cbb63` but changed from STOP's pins).
3. **Residual public outputs need an explicit disposition** (R1 does not close them):
   - T2 and derived files: `signals.json`, `discovery.json`, `smart-money.json`, the tips ledger, `radar-v3-*`, `missed-runners.json`, `ignition-paper.jsonl`, `shadow-outcomes/`, `opp-days.jsonl`;
   - other alert and ACTIONS log echoes;
   - `fm-cache` minute bars;
   - the artifact's radar and message state.

   There is no licence closure. Actual contract acceptance is unknown.
4. **Existing copies:** history, raw SHA URLs, clones, caches, and artifact 13536188063 (expires 13 Nov 19:58 UTC) remain (§9).

**Residual code limits (documented, not blockers in Codex's list):**
- **Owner command acknowledgement:** "recorded" means recorded in this run. If publication keeps failing, the change is kept locally and retried, and you are told once per run (SAVE NOT CONFIRMED). If the runner ends before a later save succeeds, the unpublished commit is lost with the runner, as before R1. Making the reply wait for a durable push would be a larger bot change.
- A **real clash** on the same options key (both sides changed `real`) is refused until it clears. The scan never writes `real`, so it needs two concurrent bot writers, which the bot's concurrency group prevents.
- No replay detection for an older version of the same file.
- Pre-existing, unchanged: `health.mjs` throws without `data/health.json`.
