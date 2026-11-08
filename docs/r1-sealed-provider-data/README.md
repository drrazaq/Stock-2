# R1: stop publishing provider market data in the public `Stock-2` repository (complete candidate, review only)

**Prepared by Claude on 8 Nov 2026 at the owner's request. Not deployed.**
- **Not done:** no production change, workflow run or dispatch, settings or secret change, history rewrite, visibility change, spending or provider message. No real key was used and no real provider data was decrypted or published: every test is synthetic; the cost figures are aggregate sizes of files already public.
- **Base:** `origin/main` `b0d76987`. **Branch:** `claude/r1-sealed-provider-data`. The candidate commit and the exact file allowlist are in `MANIFEST.md`.
- **Inputs:** D2 (`276215ff`), Stage 1 (`0b3bc095`), and Codex's Stage 1 verdict (CHANGES REQUIRED, PR #1 comments 6717284560 and 6717307865; evidence `a7a2039a`).
- **Not a legal conclusion.** Ciphertext in a public repository reduces plaintext exposure. It is not shown to satisfy any provider's terms, and what this owner actually accepted is not established. **R1 removes nothing already published** (§9).

## 0i. Rev12 (8 Nov): current price versus a timed stop observation

- Codex 6722848900 showed that rev11 froze every verdict at fetch time. A price 290 s old when fetched and 320 s old when the first check was written was shown as "HOLD … above your stop … 5 min old". The 5-minute gate was not applied at report time.
- **Fix: two distinct judgements.**
  - `quoteEvidence()` (current price) must be valid when fetched (rev10) **and** still within its age gate when the check is written. It governs HOLD, targets, % from entry and buy ranges. The 3/5/20-minute gates are unchanged.
  - `stopObservation()` is the fetch-time stop check, using the same 5-minute rule as the stop route. Only "STOP LEVEL REACHED" uses it, and it is shown with its own times: "N min old when checked at <time>; no current price now: <reason>". It never supports % from entry.
- **Regressions** (actual caller, `test/open-check-repair.test.mjs`): both rev12 cases fail on rev11. The rev10 future-at-fetch and rev11 near-limit cases still pass (15/15).

## 0h. Rev11 (8 Nov): one verdict per quote per run

- My re-review of Codex's corrected development port (finding R1) showed a narrower form of the same problem, and rev10 had it too.
  - A stop quote 4 min 50 s old when fetched, under the stop, was REACHED in the stop route, which judges right after the fetch.
  - Thirty seconds of later fetching, and the first check in the same run re-aged it past 5 minutes and said STOP STATUS UNKNOWN.
- Fix: a quote stamped with `observedAt` is judged once, at that moment, with the same 5-minute rule as the stop route. Thresholds are unchanged.
- Regression: `test/open-check-repair.test.mjs` "rev11 …" fails on rev10 and passes on rev11. The rev10 future-at-fetch case still passes.

## 0g. Rev10 (8 Nov): observation-time latch for the first market-hours check

- Codex's review 6720355907 of rev9 reproduced, through the actual `liveQ` → `intraday()` → `firstCheckText()` → Telegram caller, the future-at-fetch defect I had reported on the development port (F2). A holding's quote stamped 20 s in the future when fetched became "STOP LEVEL REACHED … 10 s old" once fetching the next quote moved the clock 30 s, while the same run's stop route said STOP CHECK UNKNOWN.
- Fix (narrow, composition side; no development code transplanted): `intraday()` stamps each quote with `observedAt` when `liveQ` returns it. `quoteEvidence()` first judges the quote at that moment and keeps it UNKNOWN if it was not valid then ("the price timestamp was in the future when fetched"), then judges it again at report time. The 5-minute `STOP_MAX_AGE_MIN` rule and every other threshold are unchanged; `stopFallback` already judged at fetch time.
- Regression through the actual caller: `test/open-check-repair.test.mjs` "rev10 …" fails on rev9 and passes on rev10.

## 0f. Rev9 (8 Nov): exact source-unit attestation

- Codex's review 6719707423 of rev8 `af11dbfd` reproduced two gaps in the new build/verify. (1) `--verify-unit` did not compare Git modes: a commit with `scan.mjs` made executable (same bytes, same parent) printed PASS. (2) `--build-unit` ignored the binding's candidate and took modes from whatever commit was supplied.
- Fixed: the binding must pin `candidate` (40 hex) and a `mode` (`100644`/`100755`) for every file. Build refuses any other candidate commit and any byte or mode mismatch. Verify checks modes and also compares `C`'s complete tree with `M0` + the pinned candidate's bound entries, failing closed if that commit is missing. This is a stricter form of Codex's proposed patch, which skipped both checks when the binding had no `candidate`.
- New negative controls in `test/sealed-release-rehearsal.test.mjs`: mode mutant, unpinned candidate, binding without candidate or mode, bound mode differing from the candidate, and pinned candidate unavailable. They fail on rev8's tool and pass on rev9.
- Runtime code is unchanged.

## 0e. Rev8 (8 Nov): combined-unit binding

- Codex's review 6719376168 passed rev7, open-check r2 and the composition, and found one release blocker: the 51-file R1 manifest does not bind the 68-path combined unit.
- Adopted: the external 68-path binding (`docs/r1-combined-binding/` on `claude/mentor-release-handoff`), refreshed STOP pins, and RELEASE.md G1/G4/G6/B4/B5/R-0 for the combined unit.
- New offline tool: `r1-release-precheck.mjs --build-unit` / `--verify-unit` builds and checks `C` = fresh `M0` + exactly the bound files, so the candidate branch's older data and Telegram offset can never be released. Tested in `test/sealed-release-rehearsal.test.mjs`.
- Runtime code is unchanged from rev7.

## 0d. Rev7: Codex's review of `dc11c03a` (PR #1 comment 6719132742)

- **B5b failure wording:** Codex's exact replacement, applied verbatim. A FAIL or missing proof stops with **R-0**, and the evidence is **UNVERIFIED**. The selected input, vector and source binding are diagnosed privately before concluding that a key or backup differs; a missing receipt is not evidence of a mismatch. There is no automatic retry or credential change. Later, a separately reviewed unit may re-verify K1 with a confirmed backup, or, only if the owner separately chooses it, enrol K2. The earlier "the only way forward is then K2" is withdrawn.
- **Manifest:** the diff hash is now computed with `git diff --full-index`, which is canonical and independent of local object abbreviation (Codex's optional improvement).
- **No code change since rev6.** Runtime, tests and gated results are as rev6.

## 0c. Rev6: Codex's review of `d02cdfea` (PR #1 comment 6718847939)

| Codex finding | Rev6 repair | Test |
|---|---|---|
| 1. Main `{}`→NEW→`{}` let an OLD checkpoint resurrect OLD (blob equality treated as lineage) | **Causal provenance**: the tip may replace a file only if **no commit on main touched it** since the base, or every such commit is a recovery commit of this same lineage (`Recovered-From: <tip>` trailer, an ancestor of this tip). Otherwise only the append-only union or the keyed merge applies; anything else refuses and keeps the checkpoint. A checkpoint already contained in a newer recovered one is deleted as superseded. | `sealed-recovery`: Codex's case; foreign lineage refused; newer-first supersession |
| 2. A merge commit introduced `sentinel.mjs`, which per-commit diffs do not show | Checkpoints must be **linear**: any merge commit is refused. The **final** base..tip path set is also checked against the data-only allowlist. | `sealed-recovery`: Codex's merge case |
| G3b was circular (the workflow exists on main only after B4) | The proof becomes stage **B5b**, after the code is verified and before migration. FAIL → R-0 (safe: nothing sealed yet). Route chosen at G3b: (a) **`backup-compare`**, using GitHub's secrets page only (a temporary `R1_BACKUP_CHECK`; constant-time comparison of derived keys; PASS/FAIL only); or (b) the local key-check, only if verified beforehand. | `sealed-migrate` backup-compare test |
| A 36 h `created` window is not a census (re-runs and waits up to 30 days) | **Capture v2**: one complete query per **open status**, whatever the creation date, **plus** `created` coverage of the **last 31 days** for every writer, each query complete and under the 1,000-result cap | `sealed-blockers` gate cases (old waiting run caught; missing status query; coverage gap; future status; cap) |

Codex's `boundaries.mjs` against rev6: all three cases refused (offset 9 kept; positions stay `{}`; `sentinel.mjs` unchanged).

## 0b. Rev5: Codex's review of `292557c2` (PR #1 comment 6718423725)

| Codex finding | Rev5 repair | Test |
|---|---|---|
| 1. Whole-commit `cherry-pick -X theirs` rewound the Telegram offset 9→2 and replaced NEW positions with STALE ones | `sealed-recover.mjs` replaces it. Per-file rules: lineage (main still holds an older state of the same checkpoint chain → take the tip), append-only union, keyed options merge. **Anything main changed since (offset, positions, settings) refuses the whole checkpoint**, which is kept. A stale state never overwrites a newer one. | `sealed-recovery`: Codex's case, plus a data-only stale offset |
| 2. A code file in a recovery branch was published | **Data-only provenance:** every commit in the checkpoint may touch only `data/`; anything else is refused | `sealed-recovery` (sentinel refused, main code unchanged) |
| 3. A newer checkpoint was deleted unmerged | Producers create **immutable** refs (UTC stamp + sha; no force, no reuse). The consumer deletes by **compare-and-delete** on the exact merged tip. | `sealed-recovery`: Codex's post-receive race (kept, merged next pass); two checkpoints merge in order |
| 4. A failed fetch was reported as success | Exit **2 = UNKNOWN**, visible, and the bot warns. (Codex's shell `git()` shadow cannot intercept the Node consumer, so the equivalent reproduction uses an unreachable remote.) | `sealed-recovery` |
| B6: a red migration was said to mean "nothing published" | Corrected: establish the remote state first; writers stay off and state is UNKNOWN; R-1 if published | `RELEASE.md` B6 |
| Writer-gate capture envelope | Repository on every run, a ≥ 36 h `created_since` window, freshness, every page, unique ids = `total_count`, writers `completed` | `sealed-blockers` gate cases |
| The keyless check is not a full receipt; an owner statement is not a recovery exercise | B7 requires the keyed hosted log too. New **G3b** backup-key proof: a sealed random check vector from `mode=key-check`, verified on the owner's own computer with the backup | `sealed-migrate` key-check test |

Codex's own `recovery-check.mjs` against rev5 (with the new consumer file added to its seed): the stale recovery is refused, the offset stays 9, the NEW positions and current code stay, and the advanced checkpoint is kept, not deleted.

## 0a. Rev4: release package and save-loss reduction

- **`RELEASE.md`** is the complete executable unit, review only and not approved:
  - entry gates G1–G7;
  - procedure B1–B10, with who, the pass condition and what to do on failure;
  - state-safe rollback R-0/R-1/R-2;
  - recovery procedures;
  - **the explicit loss-of-save limitations L1–L6**;
  - the receipts.

  Rehearsed end to end offline (`test/sealed-release-rehearsal.test.mjs`).
- **Save recovery:**
  - every save path (bot, nightly, watcher, movers, options-survey, Smart-money, leaders-study) pushes an unpublished commit to `save-recovery/<workflow>-<run>-<attempt>` when main refuses it after the retries, through the same push guard;
  - the bot merges those branches into main (`bot_recover`) and deletes them; a clash is kept, never dropped;
  - a final `if: always()` bot save step runs on loop failure, timeout or cancel;
  - Smart-money no longer ignores a failed save.

  Tests: `test/sealed-recovery.test.mjs`.
- **Interrupted writes:** temp files are git-ignored. Before rev4, a leftover temp file would make the guard refuse every later save in that run.
- **Independent verification without the key:** `sealed-migrate.mjs --verify-structure <ref>`.
- **Drift check before the code push:** `r1-release-precheck.mjs`. On 8 Nov against production main: PASS, 0 drift.

### Codex's rev3 counterexamples (PR #1 comment 6718099309), resolved in rev4

Each counterexample is a test that fails on `a791b438` and passes on rev4.

| # | Counterexample | Fix |
|---|---|---|
| 1 | An identical retry after a directory-fsync EIO removed the plaintext | The "unchanged" shortcut now acknowledges the sealed copy's directory durability **before** removing plaintext (`sealed-blockers`) |
| 2 | Export wrote base A+B+C **and** segments B, C, so restoring gave A+B+C+B+C | The export writes **logical** files only: one plaintext ledger = base + segments; segment files are not exported; a segments-only ledger is exported too (`sealed-migrate`) |
| 3 | Deleting a sealed file **and** its manifest entry gave a clean receipt | The receipt recomputes the expected set, sizes and hashes from the **approved source commit**; the manifest is no longer trusted. This also applies to the keyless structure check (`sealed-migrate`) |
| 4 | The gate passed `total_count`=2 with one run supplied, and passed an unknown writer status | A listing must be complete (`workflow_runs.length == total_count`); every writer run must be `completed`, and any other or unknown status fails (`sealed-blockers`) |
| — | Cost projection needed qualification | Every T1 family, stated assumptions, labelled **nominal, not an enforceable bound** (§8) |

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

Projected one-year growth for the ledgers is now about **26 MB** at 2 same-day re-saves (13.7 MB as plaintext today). The **nominal** all-family total is about **137 MB a year** (rev4 §8, qualified, not an enforceable bound).

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

## 8. Cost: NOMINAL projection, not an enforceable bound (rev4; Codex rev3 qualification)

Reproduce with `node docs/r1-sealed-provider-data/cost-projection.mjs` from a checkout of the base with the R1 store. It covers **every T1 family**, with stated assumptions: 250 weekdays; `K_SEG`=2 same-day ledger re-saves (watcher runs a day); `OWNER_CMDS`=5 owner option commands a day; analyst archive rewritten each weekday through its month. Override them with environment variables.

| Family (git object bytes added per year) | Nominal | Note |
|---|---|---|
| Append ledgers, daily segments | 26.3 MB | whole-file rewrites (as in `ae8cbb63`) would add 1,764 MB |
| `ignition-live`, once per watcher run | 22.5 MB | |
| `movers-state` + `fastmover-live` | 0.4 MB | unchanged content skipped |
| Options record (nightly + owner commands) | 1.7 MB | **owner commands are unbounded by any schedule** |
| Per-run archives | 56.5 MB | new files; same size as plaintext today (already gzip) |
| Shadow day files | 26.8 MB | same as plaintext today |
| Analyst archive | 3.1 MB | quadratic within a month, as today |
| Options survey | per dispatch | |
| **Nominal total** | **about 137 MB a year** | ledgers as plaintext today: 13.7 MB |

**Not established:**
- GitHub packing (ciphertext gets no delta compression);
- billing and storage allowances;
- clone and fetch time;
- growth in daily data volume;
- merge commits from retries and recovery merges;
- intermediate saves beyond the stated K_SEG.

Measured, not projected: the 45 files are 8.21 MB plaintext, 2.56 MB as git stores them, and 2.53 MB sealed; sealing all of them takes about 0.4 s of CPU.

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
| R1 tests (rev6): `sealed-store` 12, `sealed-git` 8, `sealed-migrate` 11, `sealed-readers` 9, `sealed-wiring` 14, `sealed-blockers` 13, `sealed-recovery` 14, `sealed-release-rehearsal` 2 | **83/83** |
| Codex's `boundaries.mjs` (`0d6237d0`) against rev6 | stale state refused (offset 9); returned-to-base refused (positions `{}`); merge-introduced code refused (code unchanged) |
| Codex's `recovery-check.mjs` (`344a0a31`) against rev5/rev6 | closed (see §0b) |
| Gated actual-watcher scenarios (`INCIDENT_WATCHER_SRC`) | `watcher-resilience` 9/9, `watcher-incident-revision` 11/11 |
| Full serial suite (149 registered files, rev6) | **149/149** |

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

**Loss-of-save limitations:** see `RELEASE.md` §E (L1–L6). The main residual is L1: a hard runner loss between a bot reply and its save loses that change, and the owner must resend it.

**Residual code limits (documented, not blockers in Codex's list):**
- **Owner command acknowledgement:** "recorded" means recorded in this run. If publication keeps failing, the change is kept locally and retried, and you are told once per run (SAVE NOT CONFIRMED). If the runner ends before a later save succeeds, the unpublished commit is lost with the runner, as before R1. Making the reply wait for a durable push would be a larger bot change.
- A **real clash** on the same options key (both sides changed `real`) is refused until it clears. The scan never writes `real`, so it needs two concurrent bot writers, which the bot's concurrency group prevents.
- No replay detection for an older version of the same file.
- Pre-existing, unchanged: `health.mjs` throws without `data/health.json`.
