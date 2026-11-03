# Mentor release: FINAL plan (single version, revision 5)

**Status: revision 5.5 (communication amendment in §14, bounded corrections for Codex's four findings on `41892f06`; validated with `scenarios-r5.5.py`), awaiting Codex's focused confirmation and then the owner's approval. §14 overrides only the clauses it names; every other section is unchanged from r5.1. Earlier status: revision 5 (two narrow corrections), awaiting Codex's focused confirmation. Nothing in this document has been executed. Prepared 2 Nov 2026 by Claude (release-preparation owner).**

This one plan replaces Claude's `bd415ecb` procedure and the control proposal in `docs/mentor-checkpoint-boundary-decision.md` (`11f1ac9a`). It keeps that decision's committed-checkpoint boundary and all preservation rules.

**The patch, the inverse and the eight-file scope are unchanged.** No new infrastructure is added.

§12 lists what changed from revision 3 (`5dd412b6`), which incorporated Codex's emergency-rollback arrangement ([comment 6575439115](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6575439115)). §13 lists the two narrow corrections in revision 5, from Codex's revision-4 review ([comment 6576115715](https://github.com/drrazaq/Stock-2/pull/3#issuecomment-6576115715)); nothing else changed.

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

**Designated writers, recorded at entry:**
- **J:** the one bot job running at entry, whose end E is computed in §6a.
- **D-Q:** at most one pre-existing queued bot run with **zero jobs**. If there are two or more, there is no entry.

**Writer check (WC).** It is run, by whoever is the current operator, at:
- entry;
- immediately before the D push;
- immediately after the D push;
- immediately before every R push or retry;
- immediately after the R push.

**WC is phase-specific. Every phase needs fresh, complete listings, and fails closed on any unknown or unreadable status.**

**Entry and drain phase** (entry, then from Disable until J ends):
1. The only writer executing is **J**.
2. D-Q (if recorded) is still queued or pending with **zero jobs**; after Disable, `bot.yml` reads disabled.
3. No other writer run is in progress or waiting, and no new run of any writer has appeared since the previous WC.

**Pre-push phase** (immediately before the D push, and before every R push or retry):
1. **J is terminal:** it ended naturally with conclusion SUCCESS and the save evidence of step 4 (§8).
2. **No writer is executing.**
3. D-Q (if recorded) is still queued or pending with zero jobs, and `bot.yml` reads disabled.
4. No new run of any writer has appeared.
5. **No main-ref write is UNKNOWN** (§6d).

**Post-push phase** (immediately after the D push and after the R push): the checkout-SHA rules below.

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

### 6d. Write ledger: every main-ref update must be positively resolved

**Before each push, the writer records the update in this chat and on PR #3:**
> PUSHING <candidate SHA> onto <expected parent SHA> (D | R | retry)

If that record cannot be posted, there is no push.

**Each recorded update has exactly one disposition:**

| Disposition | Positive evidence required |
|---|---|
| **APPLIED** | A fresh read of `main` contains the exact candidate SHA. |
| **NOT APPLIED** | **Only** a definitive terminal rejection of **that exact request**, received by the writer that sent it: for example, an explicit non-fast-forward, expected-HEAD mismatch or permission error returned for that push. The movement or non-movement of `main` is **never** proof of NOT APPLIED. |
| **UNKNOWN** | Anything else, including a timeout, a lost response, `main` unchanged or moved without the candidate, silence, a "SUSPENDED" message, or the passage of time. |

**While any update is UNKNOWN:**
- **no further push or retry** by anyone;
- **no write takeover** (§9b);
- **no "VERIFIED V0 / V1 / V2"** or Enable invitation, even if `main` currently looks V0 or V2, because the pending update could still change it.

The bot stays disabled. The writer reports, read-only, exactly which evidence is missing. Re-reading `main` can show APPLIED; it can never show NOT APPLIED. **If neither positive outcome is ever obtained, the update stays UNKNOWN and the bot stays disabled; the owner decides the next step.** Nobody infers a result. Reading `main` is necessary, but the absence of the candidate alone is never enough to retry. This applies equally to Claude's updates and to Codex's own R.

## 7. Entry conditions (all checked before the owner is asked to Disable)

If any fails: **no Disable request, nothing changed.**

1. **Owner approval** of §11.
2. **Transfer rule acknowledged by both operators, before entry:**
   - Claude posts "ACK TRANSFER RULE r5" in this chat and on PR #3.
   - The owner sends Codex's task a readiness message. Codex replies with "READY — ACK TRANSFER RULE r5" for read-only verification and rollback-only takeover.
   - No reply means no entry.
3. **Claude ready:**
   - one continuous turn, with in-session timers;
   - a status line at every step and at least every 10 minutes;
   - "OPERATOR READY" written. No "OPERATOR READY", no click.
4. **States:** both workflows `active`.
5. **Running job J:** exactly one; E computed and within 04:55–09:20 UTC. Disable is requested only inside E − 15 … E − 8; if under 8 minutes remain, **no attempt today**.
6. **Entry-phase WC passes;** J and D-Q (or none) are recorded.
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
| 5 | by E + 20 | Claude | Fetch M; M0 → M data-only. Build D on M: exactly eight paths, after-hashes, all pins. **Transfer-marker check, then pre-push WC** (J terminal, nothing executing, no UNKNOWN write). Record the update (§6d), then push non-force with expected HEAD M. A retry is allowed only after a **NOT APPLIED** disposition, followed by a full rebuild and revalidation (one retry). A second rejection, any UNKNOWN, or E + 20 passed → ABORT A, as soon as no update is UNKNOWN. |
| 6 | right after the push | Claude | WC with checkout SHAs (§6c). |
| 7 | to E + 30 | Claude | Hosted CI on D (§4). Pass → V1 → step 8. Fail or no result → ABORT B. |
| 8 | target E + 45 | **Owner** | On "VERIFIED V1 – CLICK ENABLE NOW": **Enable workflow**, reply "done". |
| 9 | after 8 | Claude | Restoration checks (§9c), final report. |

## 9. Abort, transfer and restoration

### 9a. Aborts by the operator

- **ABORT A (D not applied):** verify that no update is UNKNOWN (§6d), then verify V0 → "VERIFIED V0 – CLICK ENABLE NOW" → the owner enables.
- **ABORT B (D pushed):**
  1. Transfer-marker check, then pre-push WC (drain if needed; no UNKNOWN write).
  2. Build R on fresh `main`: exactly the inverse, eight paths only, data tree unchanged.
  3. Record the update (§6d), then push non-force with expected HEAD. At most one retry, only after a NOT APPLIED disposition caused by data-only advancement, after full revalidation. **A lost response is UNKNOWN:** no retry and no VERIFIED until it is positively resolved.
  4. Verify V2 → "VERIFIED V2 – CLICK ENABLE NOW" → the owner enables.

### 9b. Explicit rollback transfer to Codex (rollback only, per incident)

**When:** only if Claude has posted nothing for 20 minutes at any point after Disable, the owner has then messaged Claude, and there has been no reply within 10 more minutes. The bot stays disabled throughout.

**Transfer record (owner-owned):**
1. The owner sends the **same transfer text** in **this Claude chat** and in **Codex's task**:
   > ROLLBACK TRANSFER r5 — instance 2026-11-03 mentor release; M0 = <sha>; D = <sha or "none">; new sole operator: Codex (rollback only); inverse 15ed5256…; Claude write and retry authority revoked until I send HANDBACK.

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
1. Read the current owner transfer record, any "CLAUDE SUSPENDED" line, and **every "PUSHING …" record** (§6d) posted in the window.
2. Give each recorded update a disposition by the §6d rules. **Any UNKNOWN update blocks the takeover:** Codex stays read-only and reports UNVERIFIED with the exact missing evidence. Silence, waiting, an unchanged `main` or a SUSPENDED message never resolves it.
3. Only when every update is APPLIED or NOT APPLIED: if `main` is already V0 or V2 → no write; report VERIFIED.
4. If ownership is ambiguous (for example, Claude posts after the marker without "SUSPENDED") → Codex stays read-only and reports UNVERIFIED.

**Codex rollback steps** (its own published steps 1–5):
1. Announce "ROLLBACK TAKEOVER READY". Verify D's scope and eight after-hashes, all pins, protected regions and the inverse hash.
2. Obtain the owner-confirmed state (bot disabled). Run WC, including the J and D-Q rules; drain naturally; re-run the pre-push WC immediately before the push.
3. Prepare R on fresh M with only the inverse: eight paths restored or removed, other code unchanged, data tree unchanged. Record the update (§6d), then push one normal commit, parent M, non-force with expected HEAD M.
4. On a NOT APPLIED disposition: refetch, then re-check ownership, WC, pins, ancestry and changes. At most one retry, and only for data-only advancement. **A lost response is UNKNOWN:** no retry and no VERIFIED until it is positively resolved (§6d).
5. Verify V2, with no UNKNOWN update, and report "VERIFIED V2". The owner alone enables.

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
> 1. **Release:** the unchanged mentor patch `1841837e…` (PR #3 `25a85000`, eight files), released by **Claude (this session) as the sole operator**, using procedure revision 5 (`docs/mentor-release-handoff/PROCEDURE.md`), on Tue 3 Nov 2026. The exact time comes from the running bot job (projected Disable request about 10:32–10:39 Kuwait), and it happens only if every entry condition holds.
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
> 6. **Uncertain writes:** while any update to `main` is UNKNOWN (§6d), nobody retries, takes over or reports VERIFIED, and the bot stays off until it is positively resolved.
> 7. **Residual:** all durations are targets. If no operator can complete a verified state, the bot stays off, and a long outage can let Telegram commands expire.
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
   - Outstanding writes resolved by landed-or-rejected inspection plus a 5-minute settle (**superseded in revision 5 by §6d; see §13**).
   - Codex's rollback-only steps 1–5.
   - **Both operators acknowledge the rule before entry** (§7.2).
5. **§10:** the residual is kept, including Telegram expiry; Codex's capability is evidence only.
6. **§11:** one consolidated approval covering release, revised boundary, historical uncertainty, baseline, conditional rollback authority and residual.
7. **Unchanged:** the patch `1841837e…`, the manifest `13b120e5…`, the inverse `15ed5256…`, the eight-file scope, and the test rule.

## 13. Revision 5: the two narrow corrections from Codex's revision-4 review

Nothing else changed.

1. **Uncertain main-ref writes (new §6d; applied in §8 step 5, §9a and §9b):**
   - Every update is recorded first ("PUSHING <candidate> onto <expected parent>").
   - It is resolved only by positive evidence: **APPLIED** when a fresh read of `main` contains the exact candidate, or **NOT APPLIED** only on a definitive terminal rejection of that exact request. Movement of `main` is not proof of NOT APPLIED; it was removed from revision 5 before confirmation.
   - Anything else, including a lost response or any reading of `main` that lacks the candidate, is UNKNOWN. The "landed or rejected, no third outcome" claim and the 5-minute settle are removed.
   - Any UNKNOWN blocks retries, takeover and every VERIFIED / Enable signal, for Claude's updates and Codex's alike.
2. **Designated bot job J (§6c, §7.6):** at entry and during the drain, J (and the jobless D-Q) are explicitly allowed. The pre-push WC requires J terminal with SUCCESS and save evidence, no executing writer, and no UNKNOWN write.
3. **Labels only:** the rule references change from r4 to r5 (ACK TRANSFER RULE r5, ROLLBACK TRANSFER r5).

## 14. Revision 5.5: communication amendment

**Why:**
- On 3 Nov, "OPERATOR READY" and "CLICK DISABLE NOW" were written mid-turn and stored as hidden reasoning. The owner did not act, and the attempt stopped at step 2 with V0 (PR #3 comment 6598055427).
- Test exchanges then showed that turn-ending messages reach the owner within about a minute.
- This section replaces r5.2–r5.4 §14 and corrects Codex's four findings on `41892f06`.
- **Unchanged:** the patch `1841837e…`, manifest `13b120e5…` and inverse `15ed5256…`; §3 verified states; §4 test rule; §5; §6c writer rule; §6d write ledger; §9b transfer; §10; §11.
- **This section never weakens §6d:** it adds no way to resolve a write, and no exception to its prohibitions.

### 14.1 What the tools can and cannot do (stated limitation)

- **Monitoring is continuous only while one of Claude's turns is active.** Ending a turn creates no timer.
- **Between turns, Claude is woken only by:**
  - (a) a background watcher, started before the turn ends: a shell command polling the authenticated GitHub API (workflow states, writer runs) and `git ls-remote` (`main`) every 30 seconds, exiting on any change or at a stated deadline;
  - (b) a scheduled message at that deadline;
  - (c) any owner message.
- **Evidence:** both read paths were checked on 3 Nov, and wakes (a)–(c) were observed on 2–3 Nov. They are not guaranteed.
- **Consequence:** nothing irreversible happens while Claude is idle. A missed wake costs time, never safety. If wakes fail entirely, the §9b silence rule and the owner's PING are the recovery path.

### 14.2 Visible messages

1. Only a **turn-ending** message counts as delivered. Mid-turn text never carries an instruction, request, decision or VERIFIED result.
2. Every turn-ending message states its send time (UTC and Kuwait), the current state and the next wake deadline.
3. **Owner code words exist only for owner actions:** ACK READY, DONE DISABLE, DONE ENABLE, NOT CLICKED. Claude's checks, aborts and rollback never wait for a reply.
4. **Visible cadence:** while any request, write, drain or block is outstanding, Claude ends a turn with a visible message at least every 15 minutes. During the drain, that means a status at most 15 minutes after DISABLE CONFIRMED, and in any case by E + 7.
5. **The authoritative "PUSHING <candidate> onto <expected parent>" record (§6d) is the PR #3 comment**, which is posted before the push.

### 14.3 One timeline and time budget (relative to the actual E; replaces §6b targets and §8 steps 1–2 and 8)

| Phase | Rule | Budget |
|---|---|---|
| Entry checks | from E − 45 | — |
| OPERATOR READY | turn-ending, E − 30 … E − 20; asks ACK READY | — |
| ACK READY | by **E − 12**, otherwise no Disable request and no attempt | — |
| CLICK DISABLE NOW | turn-ending, E − 15 … E − 12, only after ACK READY; opens **REQ-D** | — |
| Disable cutoff | `bot.yml` must **read** `disabled_manually` by **E − 8** | — |
| Drain | J must end by **E + 10**, otherwise ABORT A | ≤ 18 min, with a visible status in between |
| **Preparation turn** | step-4 log check, fetch M, data-only check, build D, verify after-hashes and all pins, pre-push writer check. Ends with a visible "D READY – PUSH TURN NEXT" and a 1-minute watcher deadline | **≤ 10 min** (J end → D push by **E + 20**) |
| **Push turn** (one active turn) | repeat the writer check and the transfer-marker check, post the PR #3 "PUSHING D" record, push D. **APPLIED → wait for hosted CI until D push + 10.** Pass → verify V1. Fail or no result → ABORT B in the same turn: writer check, "PUSHING R" record, push R, verify V2 | **≤ 15 min** (CI ≤ 10, rollback ≤ 5) |

**Restoration deadlines are conditional, never automatic:**
- The Enable target is E + 45.
- An Enable instruction ("VERIFIED V0 / V1 / V2 – CLICK ENABLE NOW") is sent **only when every one of these holds**, however late that is:
  1. the exact state is freshly verified;
  2. no write is UNKNOWN;
  3. the writer check passes (no writer executing);
  4. REQ-D is reconciled.
- If any condition is unmet at a target time, the target passes and the bot stays disabled. Claude reports which condition is open and continues the visible cadence.

**Write states:**
- **APPLIED-AWAITING-CI:** D is on `main`, confirmed by a fresh read of the exact SHA. This is not UNKNOWN, and the push turn continues to the CI verdict.
- **UNKNOWN:** no definitive outcome for a recorded push. The turn ends with a visible "UNKNOWN: <sha> onto <parent>".
  - **Only §6d evidence resolves it:** APPLIED (`main` contains the exact candidate) or a definitive terminal rejection of that exact request.
  - **The owner's decision does not resolve an UNKNOWN write.** Neither does elapsed time, silence, an unchanged or moved `main`, or Codex's review.
  - While anything is UNKNOWN there is **no retry, no takeover write, no VERIFIED state and no Enable instruction**. Claude re-reads `main` with visible status every 15 minutes or sooner.
  - If the owner switches the workflow themselves, Claude records that as an **owner override outside this procedure**. It does not report the write as resolved or the state as VERIFIED.

**Rollback blocked by another writer (pre-R writer check fails):**
- The push turn ends with a visible "D APPLIED, CI <failed|missing>, ROLLBACK BLOCKED BY <run id>".
- The writer drains with no cancellation. A visible status follows at least every 15 minutes, and R comes in a new active turn once the writer check passes.
- The block is recorded, so V2 may come after D push + 15. Without a recorded block, V2 later than D push + 15 is a procedure violation.

### 14.4 Outstanding owner requests are tracked until reconciled

| Request | Reconciled only by | If not reconciled |
|---|---|---|
| **REQ-D** (Disable) | Claude reading `disabled_manually`, or the owner's explicit NOT CLICKED reply | Claude reads the actual state on every wake until E + 30, then reports **UNVERIFIED: REQ-D outstanding**, with the follow-up (NOT CLICKED, or Enable at once if a click happens later). A deadline never reconciles a request. |
| **REQ-E** (Enable) | Claude reading `bot.yml` `active` (or owner-confirmed, labelled as such) | Re-instructed after 10 minutes; the final report says **UNVERIFIED restoration** until reconciled. |

**Late click** (`disabled_manually` first read after the E − 8 cutoff):
1. **No deployment.**
2. REQ-D is reconciled by that read.
3. **Before any Enable instruction**, Claude verifies V0 again, freshly after the late click: the eight paths in the before-state, all pins, and data-only changes since M0. It also confirms no write is UNKNOWN (none, since no push happened).
4. Only then does Claude send "VERIFIED V0 – CLICK ENABLE NOW". A verification made before the late click does not count.

**Final report states (exact, nothing else):**
- `VERIFIED V0, restored`, `VERIFIED V1, restored` or `VERIFIED V2, restored`. Each requires REQ-E reconciled, no REQ-D outstanding and no UNKNOWN write.
- `NO ATTEMPT, nothing changed`. This requires no REQ-D outstanding and no push.
- `UNVERIFIED: <what is open and the follow-up>`.

**Late replies** never revive an expired window.

### 14.5 Silence and takeover: the original §9b rule, unchanged

- **"Claude silent" = 20 minutes with no visible (turn-ending) message.** The owner then PINGs in this chat. If there is no visible answer within 10 more minutes, the §9b transfer may begin. There is no earlier trigger.
- Normal cadence keeps every gap at 15 minutes or less, so the rule fires only when Claude is actually unreachable.
- Claude answers any owner message first, never gated on a code word. A transfer suspends Claude's write authority at once.
- **Codex, after a transfer, is bound by the same §6d and 14.3 rules:** it cannot treat an UNKNOWN write as resolved, and it gives no VERIFIED state without exact evidence.

### 14.6 Validation: `scenarios-r5.5.py` (procedure and checker together)

**What the checker enforces:**
- Only the exact states `VERIFIED V0|V1|V2` allow an Enable instruction ("UNVERIFIED V0" is rejected).
- Final reports use exact state strings.
- It **exits 1** on any violation in a positive scenario, any missed violation in a negative control, or any failed budget check.
- Run it with `python3 -I scenarios-r5.5.py`.

**Positive scenarios:**

| Scenario | Result |
|---|---|
| S1 normal success | PASS: VERIFIED V1, restored |
| S2 late click, V0 re-verified after the click | PASS: VERIFIED V0, restored |
| S3 missing ACK READY | PASS: NO ATTEMPT, nothing changed |
| S3b no DONE DISABLE, no click | PASS: UNVERIFIED, REQ-D outstanding |
| S3c no click, owner replies NOT CLICKED | PASS: NO ATTEMPT, nothing changed |
| S4 slow CI → rollback (V2 at push + 13) | PASS: VERIFIED V2, restored |
| S5 rollback blocked by a writer (recorded) | PASS: VERIFIED V2, restored (late, block recorded) |
| S6 operator lost after an APPLIED D; Codex verifies V1 | PASS: VERIFIED V1, restored |
| S6b lost push response | PASS: UNVERIFIED, write UNKNOWN; no VERIFIED, no Enable instruction |

**Negative controls (each must be caught; all are):**

| Control | Caught as |
|---|---|
| N1 Enable on "UNVERIFIED V0" | ENABLE_ON_INEXACT_STATE |
| N2 Enable while a write is UNKNOWN | ENABLE_WHILE_UNKNOWN, VERIFY_WHILE_UNKNOWN, RESTORED_WITH_UNKNOWN |
| N3 owner decision "resolves" UNKNOWN | OWNER_RESOLVED_UNKNOWN |
| N4 rollback beyond push + 15 with no recorded block | ROLLBACK_BEYOND_TARGET |
| N5 late click, Enable using a V0 verified before the click | ENABLE_LATE_CLICK_NOT_REVERIFIED |
| N6 "restored" with REQ-D open and no active read | RESTORED_WITH_OPEN_REQ_D, RESTORED_WITHOUT_ACTIVE_READ |
| N7 transfer before 20 + 10 | EARLY_TRANSFER |
| N8 V1 from CI after the cutoff, with a 16-minute gap | V1_WITHOUT_EVIDENCE, VISIBLE_GAP |
| N9 retry while UNKNOWN | PUSH_WHILE_UNKNOWN |
| N10 final report not an exact state | FINAL_NOT_EXACT |

**Budget checks, all PASS:**
- the ACK cutoff is at or before the end of the click window;
- the click window ends before the Disable cutoff;
- J end + 10-minute preparation turn ≤ the D push deadline;
- D push + CI window ≤ E + 30;
- the rollback window fits in the push turn;
- the latest unblocked V2 ≤ the Enable target;
- the push turn and visible cadence are both below the silence trigger.

**Mutation tests:**
- Replacing the exact-state match with a substring search makes N1 fail and the checker exit 1.
- Removing the owner-cannot-resolve rule makes N3 fail and the checker exit 1.

### 14.7 Not changed

- The patch, manifest and inverse.
- No repository, workflow, secret or permission change. The watcher and scheduled message are existing session tools, used only during an approved attempt.
- Before any attempt, the owner approves this revision in writing and sets a date.

