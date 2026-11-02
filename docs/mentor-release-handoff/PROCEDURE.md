# Mentor release: FINAL plan (single version, revision 4)

**Status: final amendment, awaiting Codex's focused confirmation. Nothing in this document has been executed. Prepared 2 Nov 2026 by Claude (release-preparation owner).**

This one plan replaces Claude's `bd415ecb` procedure and the control proposal in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`). It keeps that decision's committed-checkpoint boundary and all preservation rules.

**The patch, the inverse and the eight-file scope are unchanged.** No new infrastructure is added.

§12 lists what changed from revision 3 (`5dd412b6`). It incorporates Codex's revision-3 review and emergency-rollback arrangement ([comment 6575439115](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6575439115)).

## 1. Roles: one production writer at any moment

| Role | Who | Authority |
|---|---|---|
| **Operator** | **Claude, this session** (`session_017cC8uWFU58B3u4ZSirToHT`) | The only writer of `main` code by default. Pushes D (release) and, if needed, R (rollback). **Suspended at once by a rollback transfer (§9b)** until an explicit handback. |
| **Emergency rollback operator** | **Codex**, in its existing task | **Rollback only.** Active only after the owner's explicit per-incident transfer (§9b). Pushes at most one R (one fully revalidated data-race retry). No release, forward fix, data or offset restore, workflow action, secret or permission change, or message. Never unattended and never automatic. |
| **Read-only verifier** | Codex, when the owner activates its thread | Reports VERIFIED V0 / V1 / V2, or "UNVERIFIED: <missing proof>". |
| **Workflow clicks** | **Owner** | Disable and Enable on "Telegram bot replies" only. |

**There are never two concurrent production writers.**
- Write authority passes only by the owner's explicit transfer and returns only by the owner's explicit handback (§9b).
- Silence, a timeout or a CAS (expected-HEAD) guard alone never transfers authority.

**Who can perform each check:**

| Check | Claude | Codex (activated) | Owner (authenticated GitHub page) |
|---|---|---|---|
| Workflow enabled/disabled state | Yes (`GET /actions/workflows/{file}`) | **No** (endpoint rejected as unsupported) | Yes: https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml shows "This workflow was disabled manually" and an **Enable workflow** button when disabled. Recorded as **owner-confirmed**. |
| `main` bytes, pins, diffs, ancestry | Yes | Yes | No |
| Runs, jobs, logs, checkout SHAs, CI | Yes | Yes | Viewing only |
| Push D | **Claude only** | Never | No |
| Push R | Claude, or Codex **only after a transfer** | After a transfer only. Capability evidence: repository metadata reports push access, `main` is unprotected, and its tool has expected-HEAD ref updates. That is not a production-write test or a guarantee. | No |

## 2. Workflow states

- **2 Nov:** Claude read both workflows as `active` (09:09 and 09:46 UTC).
  - `bot.yml` last changed at 09:02:56 UTC (the owner's re-enable).
  - Job 125091176540 ran 04:15:06 → 09:45:34 SUCCESS; its successor started at 09:45:36.
- **During the window:** both states are read at entry, after Disable and after Enable, by Claude or as owner-confirmed.
- **Only `bot.yml` is ever switched.** The Stock scanner stays enabled and is monitored (§6c).

## 3. The release: exact and unchanged

| Item | Value |
|---|---|
| Approved head | PR #3 `25a85000b076c4da649634606467e71b577bc75c` |
| Patch | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production.patch). SHA256 `1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7`, blob `4a858467bb0c912efdf37eaeebcd4081f3470b22`. |
| Manifest | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/25a85000b076c4da649634606467e71b577bc75c/docs/validation/mentor-readonly-production-manifest.json). SHA256 `13b120e52a2e6dcfe505136c430ebd7875fea6e18a581e39f610e62fa4f3e250`. |
| Code-only inverse | [immutable link](https://raw.githubusercontent.com/drrazaq/Stock-2/fd961e3b613e493880e40806d7c2b9be0ccb70e3/docs/mentor-persistence-receipt/mentor-approved-rollback.patch). SHA256 `15ed525606b42b9b36e32ec593cb4c582c0c36640da5a94295d7b4cb5d21f521`. |
| Eight paths | `mentor-plan.mjs`, `scan.mjs`, `test/load-scan.mjs`, `test/mentor-m1-m3.test.mjs`, `test/mentor-readonly.test.mjs`, `test/mentor-release-examples.mjs`, `test/mentor-release-plan.test.mjs`, `test/mentor-release.test.mjs` |
| All manifest pins | 2 dependencies, 7 caller/baseline pins, 4 protected code regions, and the `scan.mjs` before-hash. **All matched on main `f4e4d951` on 2 Nov.** |

### Verified code states: the bot is re-enabled only in one of these

| State | Required evidence (all of it, freshly read) |
|---|---|
| **V0, unchanged** | Current `main`: the eight paths in the before-state (`scan.mjs` `76ffcd56…`, `test/load-scan.mjs` `6478d0b8…`, six paths absent); every manifest pin matching; every commit since M0 data-only. A title is never evidence. |
| **V1, released** | D's parent is M; D changes exactly the eight paths with the after-hashes; all pins match; D's hosted CI failure set equals the accepted baseline (§4) and the four mentor test files pass; later commits are data-only. |
| **V2, rolled back** | R's parent is the then-current `main`; R changes **exactly the eight paths**, restoring the before-state; all other code is unchanged; **the complete data tree is unchanged between R's parent and R**; all pins match; commits between D and R are data-only and preserved. CI on R is recorded as it ran (no manual dispatch); V2 does not depend on it. |

## 4. Test criterion

1. **Baseline M0, measured at entry** with main's CI command (`test/*.test.mjs`, Node 20).
   - M0 may fail **only** `test/try-small-audit.test.mjs` cases 1 and 3b, or nothing.
   - Anything else means no entry; it is never inherited by equality.
2. D is V1 only when its hosted CI failure set equals the accepted M0 set and the four mentor test files pass.
3. Anything else, or no result by the CI cutoff, means rollback.
4. Counts are never compared.

## 5. Historical uncertainty the owner must accept

- The earlier bot runs (41327224130 / job 124919084401, 41354916865 / job 125004035374, and every run before them) kept **no record of the state they intended to save** or of their final Telegram offset.
- It cannot be proved that every command they fetched was saved, and nothing can recreate that proof.
- **Accepted starting point:** the committed `main` at release time, fully preserved. Nothing is backfilled or replayed, offsets are not reset, and Telegram is not read to investigate.

## 6. Timing and writers

### 6a. The running job

At entry, the operator reads job J of the running bot run:
- **L** = start of its loop step.
- **Estimated end E = L + 330 min.** Observed endings were L + 330 min 17–19 s; the last pass can add about 7 minutes.

The projection for Tue 3 Nov is E ≈ 07:47 UTC (10:47 Kuwait). This is not an entry guarantee.

### 6b. Target timeline (relative to the actual E; targets, not guarantees)

| Point | Target | Projection if E = 07:47 (UTC / Kuwait) |
|---|---|---|
| Entry checks | E − 45 | 07:02 / 10:02 |
| Disable permitted only while 8–15 min remain | E − 15 … E − 8 | 07:32–07:39 / 10:32–10:39 |
| J ended (else ABORT A) | E + 10 | 07:57 / 10:57 |
| D pushed (else ABORT A) | E + 20 | 08:07 / 11:07 |
| CI cutoff | E + 30 | 08:17 / 11:17 |
| R verified (if needed) | E + 40 | 08:27 / 11:27 |
| **Target verified Enable** | **E + 45** | **08:32 / 11:32** |

- **Target start suppression:** 60 minutes or less, **conditional on reaching a verified state**.
- **What can extend it:** draining writers, verification or rollback, a transfer (§9b), GitHub scheduling, or no reachable operator.
- **GitHub schedule delay:** 49–96 minutes was observed on 2 Nov, and 120 minutes is a planning allowance, not a bound.
- **Silence:** typically under 1.5 hours, about 2 h 45 m if targets hold; **not guaranteed**.
- **Telegram:** a longer outage is not lossless. Unread updates expire after about 24 hours, and queued commands are not proven processed.

### 6c. One writer rule for entry, release and rollback

**Writers** are runs of `bot.yml`, `main.yml`, `discover.yml` and `movers.yml`.

**One designated exception, D-Q:** at entry, the operator records the ID of **at most one** pre-existing queued bot run with **zero jobs**. If there are two or more, there is no entry.

**Writer check (WC).** It is run, by whoever is the current operator, at:
- entry;
- immediately before the D push;
- immediately after the D push;
- immediately before every R push or retry;
- immediately after the R push.

**WC passes only if all of these hold on fresh, complete listings:**
1. No writer run is in progress or waiting, other than D-Q.
2. D-Q (if recorded) is still queued or pending, **with zero jobs**, and `bot.yml` reads disabled (after Disable).
3. No new run of any writer has appeared since the previous WC.
4. No status is unknown or unreadable.

**If WC fails before a push:**
- Before D → ABORT A.
- Before R → **do not push.** Let the writer drain naturally (no cancellation, no extra suppression), then repeat WC.
- In both cases the bot stays disabled.

**After a push, for every job running then, its checkout SHA is read from its `actions/checkout` log (`git log -1 --format=%H`):**
- **A job that checked out a commit older than the push** (an old-code writer; the bot also pulls on every pass) **is an incident.** Report it, let it drain, repeat WC, then decide. Never roll back underneath it.
- **A job that checked out D (or R)** runs on that code: no incident.
- If D-Q gains a job at any point, it is a writer: handle it as above.

**Other context:**
- **Research writers** (`squad26-lab`, `squad26-watch`, `research-lab`) commit data only and never run `scan.mjs`. Every D or R is built on fresh `main` and pushed non-force with an expected HEAD; intervening data is preserved.
- **Only `bot.yml` and `main.yml` run `scan.mjs`.** Their bytes match the approved caller pins on `f4e4d951`.
- **Eligible E:** 04:55–09:20 UTC on Tuesday. The scanner schedule makes overlap unlikely, but WC, not the schedule, is the control.

## 7. Entry conditions (all checked before the owner is asked to Disable)

If any fails: **no Disable request, nothing changed.**

1. **Owner approval** of §11.
2. **Transfer rule acknowledged by both operators, before entry:**
   - Claude posts "ACK TRANSFER RULE r4" in this chat and on PR #3.
   - The owner sends Codex's task a readiness message. Codex replies with "READY — ACK TRANSFER RULE r4" for read-only verification and rollback-only takeover.
   - No reply means no entry.
3. **Claude ready:**
   - one continuous turn, with in-session timers;
   - a status line at every step and at least every 10 minutes;
   - "OPERATOR READY" written. No "OPERATOR READY", no click.
4. **States:** both workflows `active`.
5. **Running job J:** exactly one; E computed and within 04:55–09:20 UTC. Disable is requested only inside E − 15 … E − 8; if under 8 minutes remain, **no attempt today**.
6. **WC passes;** D-Q is recorded (or none).
7. **Code:** patch, manifest and inverse hashes; the before-state; **every manifest pin**.
8. **Baseline M0:** only cases 1 and 3b fail, or none.
9. **R prepared and checked** in a scratch tree.

## 8. Steps (operator: Claude unless a transfer is active)

**Before every push and every retry, the operator first re-reads PR #3 for a "ROLLBACK TRANSFER" marker (§9b). If one exists, Claude stops writing.**

| # | Target | Who | Action |
|---|---|---|---|
| 1 | E − 15 … E − 8 | **Owner** | On "CLICK DISABLE NOW": https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml → **"…" → Disable workflow**, reply "done". |
| 2 | +1 min | Claude | Read `bot.yml` = `disabled_manually`, `main.yml` = `active`. Still `active` after 3 minutes means nothing changed: stop (no code mutated). |
| 3 | to E + 10 | Claude | Watch J and D-Q. D-Q gains a job, a new run appears, or J has not ended by E + 10 → ABORT A (no cancellation). |
| 4 | after J ends | Claude | J must be SUCCESS. Its raw log must contain the echoed `echo "Error: could not save the data folder` line and must **not** contain an output line matching `^[0-9T:.Z-]+ Error: could not save the data folder`. Otherwise → ABORT A. |
| 5 | by E + 20 | Claude | Fetch M; M0 → M data-only. Build D on M: exactly eight paths, after-hashes, all pins. **Transfer-marker check, then WC.** Push non-force with expected HEAD M; one retry after a full rebuild and revalidation. Second rejection or E + 20 passed → ABORT A. |
| 6 | right after the push | Claude | WC with checkout SHAs (§6c). |
| 7 | to E + 30 | Claude | Hosted CI on D (§4). Pass → V1 → step 8. Fail or no result → ABORT B. |
| 8 | target E + 45 | **Owner** | On "VERIFIED V1 – CLICK ENABLE NOW": **Enable workflow**, reply "done". |
| 9 | after 8 | Claude | Restoration checks (§9c), final report. |

## 9. Abort, transfer and restoration

### 9a. Aborts by the operator

- **ABORT A (D not pushed):** verify V0 → "VERIFIED V0 – CLICK ENABLE NOW" → the owner enables.
- **ABORT B (D pushed):**
  1. Transfer-marker check, then WC (drain if needed).
  2. Build R on fresh `main`: exactly the inverse, eight paths only, data tree unchanged.
  3. Push non-force with expected HEAD; at most one retry, only for data-only advancement, after full revalidation. If the response is lost, inspect `main` first: an already restored state is a no-op.
  4. Verify V2 → "VERIFIED V2 – CLICK ENABLE NOW" → the owner enables.

### 9b. Explicit rollback transfer to Codex (rollback only, per incident)

**When:** only if Claude has posted nothing for 20 minutes at any point after Disable, the owner has then messaged Claude, and there has been no reply within 10 more minutes. The bot stays disabled throughout.

**Transfer record (owner-owned):**
1. The owner sends the **same transfer text** in **this Claude chat** and in **Codex's task**:
   > ROLLBACK TRANSFER r4 — instance 2026-11-03 mentor release; M0 = <sha>; D = <sha or "none">; new sole operator: Codex (rollback only); inverse 15ed5256…; Claude write and retry authority revoked until I send HANDBACK.

   The owner's own chat messages are the authenticated record. The M0 and D SHAs come from Claude's last status lines, or Codex reads them from `main`.
2. **Codex posts the same text on PR #3 as the fail-safe marker.**
   - PR comments from all parties appear under one account, so the marker is **not** proof of authorship.
   - Its only purpose is to stop Claude: **Claude treats any "ROLLBACK TRANSFER" marker posted after Disable as an immediate stop of all writes, whoever posted it.**

**How Claude's write and retry authority is suspended:**
- Claude checks for the marker before every push and every retry (§8), and checks its chat on every turn.
- On seeing the marker or the owner's transfer message, Claude:
  1. makes no further push or retry;
  2. posts "CLAUDE SUSPENDED — last pushed <sha or none>" in chat and on PR #3;
  3. becomes read-only.
- **If Claude returns after the transfer, it does not push**, even to finish an interrupted step. It stays read-only until the owner sends **HANDBACK** in Claude's chat.

**How outstanding writes are resolved before Codex writes (Codex, read-only first):**
1. Read the current owner transfer record, and any "CLAUDE SUSPENDED" line.
2. Read `main` and its recent history. Any Claude push that was in flight has either **landed** (visible, and it becomes the parent) or been **rejected** by the expected-HEAD guard (no effect). There is no third outcome.
3. Wait **5 minutes** after the marker with no new non-data commit on `main`, then re-read.
4. If `main` is **already V0 or V2** → no write; report VERIFIED.
5. If ownership is ambiguous (for example, Claude posts after the marker without "SUSPENDED"), or a non-data commit appears during the wait → Codex stays **read-only** and reports UNVERIFIED.

**Codex rollback steps** (its own published steps 1–5):
1. Announce "ROLLBACK TAKEOVER READY". Verify D's scope and eight after-hashes, all pins, protected regions and the inverse hash.
2. Obtain the owner-confirmed state (bot disabled). Run WC, including the D-Q rule; drain naturally; re-run WC immediately before the push.
3. Prepare R on fresh M with only the inverse: eight paths restored or removed, other code unchanged, data tree unchanged. One normal commit, parent M, pushed non-force with expected HEAD M.
4. On rejection: refetch, then re-check ownership, WC, pins, ancestry and changes. At most one retry, and only for data-only advancement. A lost response means inspect `main` first.
5. Verify V2 and report "VERIFIED V2". The owner alone enables.

**After the incident:** authority returns to Claude **only** by the owner's HANDBACK sent in both chats, and Codex posting "HANDBACK" on PR #3.

### 9c. Restoration checks (after any Enable; Claude, or Codex if a transfer is active)

1. **States:** `bot.yml` and `main.yml` both `active` (Claude's read, or owner-confirmed).
2. **The first new bot job's actual checkout:**
   - its checkout SHA, from the job log;
   - **at that SHA, the eight paths have the bytes of the verified state** (after-state for V1, before-state for V0 or V2);
   - **every manifest pin matches;**
   - **all changes between the verified commit and that SHA are data-only.**

   Ancestry alone is not enough.
3. Later `bot …` save commits follow, data only.
4. No bot run 120 minutes after Enable → report (an observation). Job success is never taken as proof that queued commands were processed.
5. **Owner optional,** after V1: send `mentor SPUS`; expect the read-only view marked NOT PROVEN.

**Never:** reset, history rewrite, data or offset restore, message replay, cancellation, dispatch, workflow edit, secret or permission change, or a test message from the bot.

## 10. Residual risk (disclosed; accepted only through §11)

- **If neither operator can be reached after D is pushed and its CI fails,** the bot stays disabled until one returns or a transfer completes.
  - This is service loss, never unverified code.
  - **A prolonged outage can let Telegram updates expire (about 24 hours),** so commands sent in that time may be lost.
- **Codex's write capability is evidence, not a guarantee.** If exclusivity, access or the boundary cannot be verified, Codex leaves production untouched and reports UNVERIFIED.
- **Codex cannot read workflow switch states.** During a transfer, those checks are owner-confirmed.

## 11. Consolidated owner approval text

> **I approve the following for the mentor release only.**
>
> 1. **Release:** the unchanged mentor patch `1841837e…` (PR #3 `25a85000`, eight files), released by **Claude (this session) as the sole operator**, using procedure revision 4 (`docs/mentor-release-handoff/PROCEDURE.md`), on Tue 3 Nov 2026. The exact time comes from the running bot job (projected Disable request about 10:32–10:39 Kuwait), and it happens only if every entry condition holds.
> 2. **Revised boundary:** instead of the unavailable original-run save/offset proof, I accept the **committed `main` at release time** as the starting point, fully preserved. I accept that the earlier bot runs' intended-save and offset proof cannot be recovered, and that nothing will be backfilled, replayed or reset.
> 3. **Baseline:** I accept the two TRY SMALL failures (cases 1 and 3b) as pre-existing. Any other baseline failure stops the release.
> 4. **Writers and clicks:**
>    - I click Disable and Enable for "Telegram bot replies" only, when the operator says so.
>    - The Stock scanner stays enabled and is checked before every push.
>    - Nothing is cancelled or dispatched.
>    - I enable only after a "VERIFIED V0 / V1 / V2" report, never on a title or a timeout.
> 5. **Conditional rollback authority for Codex:**
>    - Only if Claude is unreachable as described in §9b, and only after **I send the transfer text in both chats**, Codex may act as the **sole operator for rollback only**: one R with the exact inverse `15ed5256…`, at most one revalidated data-race retry.
>    - Claude's write and retry authority is suspended from my transfer until my HANDBACK.
>    - No release, forward fix, data or offset change, workflow action or message by Codex.
>    - If exclusivity or access cannot be verified, nothing is written.
> 6. **Residual:** all durations are targets. If no operator can complete a verified state, the bot stays off, and a long outage can let Telegram commands expire.
>
> No cancellation, dispatch, data change, workflow edit, secret or permission change, or trade is part of this. The Nov 2 ACTIONS correction is **not** included.

LEADER DIP remains NOT PROVEN. The mentor is read-only. Acceptance stays 24/40.

## 12. Changes from revision 3 (`5dd412b6`)

1. **Queued-writer consistency (Codex):**
   - One designated queued bot run with zero jobs (D-Q) is recorded at entry.
   - The same writer check (WC) is applied at entry, before and after D, and before and after every R push or retry.
   - D-Q must stay jobless with `bot.yml` disabled; any job, new run or unknown status blocks the push. Before R that means drain, not abort (§6c).
2. **Restoration verification (Codex):** the first new job's checkout SHA must carry the verified state's eight-path bytes and all pins, with data-only changes since, not just ancestry (§9c).
3. **V2:** the complete data tree must be unchanged between R's parent and R.
4. **Emergency rollback (Codex's arrangement), new §9b:**
   - An owner-owned transfer record (the same text in both chats).
   - A PR marker as fail-safe stop only.
   - Claude's write and retry authority suspended until HANDBACK.
   - Outstanding writes resolved by landed-or-rejected inspection plus a 5-minute settle.
   - Codex's rollback-only steps 1–5.
   - **Both operators acknowledge the rule before entry** (§7.2).
5. **§10:** the residual is kept, including Telegram expiry; Codex's capability is evidence only.
6. **§11:** one consolidated approval covering release, revised boundary, historical uncertainty, baseline, conditional rollback authority and residual.
7. **Unchanged:** the patch `1841837e…`, the manifest `13b120e5…`, the inverse `15ed5256…`, the eight-file scope, and the test rule.
