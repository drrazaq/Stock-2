# R1 release: operator overlay O1, rev2 (review only; not approved, not executed)

**Scope:** an operator overlay on Codex's `RELEASE-PROPOSAL.md` @ `ff587b508`, now pinned to exact unit **rev19 `72ff1f5bdf1ec747ccdaa6374515a3a238b2acae`**, binding `docs/r1-combined-binding/binding.json` on `claude/mentor-release-handoff` (identity refresh; rev17 `73aa701f`/`c29852d1` and rev18 `304657d9` superseded). Combined deployment remains **DEFERRED** by the owner. `r1-writer-gate.mjs` is byte-identical in rev17 and rev19, so the overlay gate and its tests are unchanged.
- **Rev2:** corrects Codex's procedural review 6727767980 / 6727798225 / 6727863726 / 6727897764 (P1–P3). It supersedes rev1 (`93c8a4e4`), whose census JSON missed `main`'s save helper and `squad26-watch`'s internal push.
- **Status:** nothing was dispatched, paused, pushed or changed.
- **Attendance:** the owner's and Codex's (G7) attendance at the window and at every receipt is **UNCONFIRMED**. This document books none of it.

## 1. Why main must stay quiet (unchanged from rev1)

- **B4:** `C` is pushed only if main still equals `M0`.
- **`r1-migrate.yml`:** exits before `--apply` unless `origin/main == source_sha (C)`.
- **Push triggers:** only `tests.yml` matches the bound source push paths, and it does not push. No `workflow_run`, `repository_dispatch`, `issues` or `issue_comment` triggers exist.

## 2. Census (P3; `census-main-publishers.json`, from M0 `6e72a8d0`)

**Publishers:**
- 80 workflow definitions. **74** show push evidence:
  - in the workflow (`git push`, `bot-save.sh`, `save-data.sh`, `private-data.sh push`);
  - or in a Node script it runs (for example `squad26-watch.mjs`, which commits and pushes internally).
- `feed-check.yml` shows none, but has default token permissions. It is **treated as a possible publisher** (fail closed), giving 75.
- **58** of the publishers are scheduled.
- **Proven non-publishers (5):** `tests`, `pages`, `premarket`, `private-data-check`, `Tiprank`. Each has `contents: read` and no push. `r1-migrate.yml` publishes only when dispatched (B6).

**Lookback** (a delay heuristic, not a guarantee): for a window [S, E], count the scheduled publishers outside the 10 writers that have a cron minute in [S − 14 h, E].
- 14 h covers the largest delay observed (Fri 22:17 → Sat 09:32).
- It does **not** bound GitHub's queue delay or a run's duration: runs may last up to their job timeouts, for example bot 350 min and `squad26-watch` about 358 min.
- External claude.ai tasks (the daily researcher Sat–Thu 08:37 UTC; Agent A Sun 11:47 UTC) are listed separately. Their finishing is not proven by this census.

| Window (UTC) | Kuwait | Extra pauses, [S−14h, E] | [E−14h, E], for reference |
|---|---|---|---|
| Sat 14 Nov 08:00–10:00 | 11:00–13:00 | 45, plus the researcher at 08:37 | 43 |
| Sat 14 Nov 15:00–17:00 | 18:00–20:00 | 6 | 4 |
| **Sat 14 Nov 17:00–19:00 (proposed)** | **20:00–22:00** | **4: `discover`, `ml-lab`, `options-lab`, `squad26-lab`** | 4 |
| Sun 15 Nov 05:00–07:00 | 08:00–10:00 (Kuwait workday) | 2 | 2 |

(Rev1 said 44/6/4/2 and 56 scheduled. Both are superseded; the selected pause set is unchanged.)

## 3. Pause set and the writer gate (P1)

**Pause set: 14.**
- The 10 writers, plus `discover`, `ml-lab`, `options-lab` and `squad26-lab`.
- Each prior state is recorded just before the window. After the Enable decision, only those exact states are restored (bot first). No other setting is changed.

**Gate:** at B3 and B8, both checks run over **the same complete saved capture v2**:
1. The **bound** `r1-writer-gate.mjs` from `C`, unchanged. It must PASS with its own **11** workflows (the 10 writers + `r1-migrate.yml`): the six open statuses, 31-day created coverage for all 11, page completeness, the 1,000 cap, the repository and capture age ≤ 10 min.
2. The overlay, `r1-overlay-gate.mjs` (this folder; `node r1-overlay-gate.mjs <C's r1-writer-gate.mjs> capture.json`). It must also PASS:
   - **S1:** any run in the six open-status queries from **any** workflow other than the 5 proven non-publishers fails. That covers the 4 additions, `main`, `squad26-watch`, every other publisher, and any path not in the census.
   - **S2:** any created-query run that is not `completed`, from a possible publisher, fails. This includes statuses GitHub may add later.
   - **S3:** the 4 additions need 31-day created coverage in `overlayQueries` (per workflow, or `*`), with complete pages. The bound gate never reads that key, so its accepted 11-workflow input is unchanged.
   - **Tests:** `r1-overlay-gate.test.mjs`, 15/15 against the bound gate extracted from `73aa701f`. They cover open runs of the 4 additions, `squad26-watch`, `research-lab`, `feed-check` and an unknown new path; the allowed CI run on `C`; an unknown created status; missing coverage for an addition; missing migration coverage; an open writer run; and incomplete pages.

**Limits of the gate:**
- It sees GitHub runs only. It does not certify that a non-paused publisher stays quiet later.
- The **quiet-main check** remains the guard: `origin/main == M0` immediately before the `C` push, and `== C` immediately before B6.
  - Moved before the push: restart at B1 within the cutoffs.
  - Moved after `C`: no migrate dispatch; R-0; no second dispatch.
  - A migrate log line "main is no longer the approved source", with no manifest on remote main, establishes **not published**.

## 4. Cutoffs (Codex's table +9 h; every other rule unchanged)

| Phase | Cutoff, Sat 14 Nov, UTC / Kuwait |
|---|---|
| Fresh precheck, record states, owner pauses the 14, drain, capture, both gates PASS | 17:15 / 20:15 |
| `C` publication and complete CI receipt | 17:35 / 20:35 |
| Backup proof (rev19 B5b: one `key-check` dispatch; the owner checks the printed record off GitHub with the password-manager copy and, separately, the hand-typed paper copy, in `k2-key-tool.html` on a computer; both must PASS; no `R1_BACKUP_CHECK`) | 17:50 / 20:50 |
| Migration plus independent proof | 18:20 / 21:20 |
| Fresh capture, both gates PASS, owner Enable decision | 18:30 / 21:30 |
| Reserved recovery / first bot observation | 19:00 / 22:00 |

**Timing limitations:**
- The 17:15 drain gate **may fail**. A bot run can last up to 350 min, and queued or pending runs may exist.
- There is no cancellation, no early pause and no window extension. If a cutoff is missed, the unit is **deferred** under the existing cutoff and defer rules. No particular downtime is promised.

## 5. Post-window receipts (P2; separate from the window; attendance UNCONFIRMED)

**Receipt rule (unchanged):** a run's complete receipt is due by the actual `started_at` + its job timeout + 15 min.

**First runs after Enable:**
- **First bot save:** the first scheduled bot run after Enable. Observing its save by 19:00 UTC is **not** its complete receipt: that is due at `started_at` + 350 + 15 min, which can fall after **midnight UTC** (after 03:00 Kuwait, Sunday).
- **First watcher day:** **Mon 16 Nov**, the admitted winter cron **`10 14 * * 1-5` = 14:10 UTC / 17:10 Kuwait (09:10 EST)**. `watcher-schedule.mjs` maps 13:10 → −240 and 14:10 → −300. On 16 Nov the 13:10 run returns `OPPOSITE_DST_CRON` and **cannot** serve as the watcher-day receipt. Receipt: actual start + 360 + 15 min.
- **First nightly scan:** Mon 16 Nov, 21:30 UTC. Receipt: actual start + 300 + 15 min.

No receipt appointment is booked by this document. Each needs confirmed attendance from the owner where an owner action may be needed, and from the verifier.

## 6. Confirmed as written in the proposal

- **Job limits:** Tests 10 min; key-check 5 (`backup-compare` is no longer used); migrate 15; bot 350; main 300; ignition 360. Capture age ≤ 10 min.
- **The 10 writers** equal RELEASE B2.
- **Dispatches:** 2 (B5b `key-check` + B6), with one R-0 at most.
- **Key mappings:** SEALED_SECRET 21; `PRIVATE_KEY` 7 on M0.
- **Unchanged rules:** the receipt rule, the rollback/UNKNOWN rules and the $0 constraints.
