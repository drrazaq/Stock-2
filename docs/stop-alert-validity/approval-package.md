# STOP R2: consolidated stop-only approval package (not approved; no execution)

- **Procedure:** S1.2, `docs/stop-alert-validity/maintenance-procedure.md` at `3af43a092de136aa034b32e84e53ab653981a114` (SHA256 `d0624dd346fec184cb6f9974f90ccfc473d9b731bf861b97f469344c6a3d8e1f`).
- **Review:** Codex focused PASS, PR #1 comment 6651816688.
- **Status:** nothing is scheduled, clicked, cancelled or deployed. This page is preparation only.

## 1. What would change

| Item | Value |
|---|---|
| Production patch | `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` (reviewed source `c73cb6a8881f0ab8fef5e64cbabeec0d966a7d8d`) |
| Inverse (rollback) | `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9` |
| Manifest | `010ed6ca3a8332cb7e229047fad96a3e59097a0cb9631ac61ba740a33bb43e40` |
| Pinned `bot.yml` | `2a7a8a66bbf03d02d0732cc44f4973cf534cbef9faffe3aa85b13659e0484e40` (unchanged) |
| Files (exactly 10) | `stop-watch.mjs`, `ignition-watch.mjs`, `scan.mjs`, `early-alerts.mjs`, `test/load-scan.mjs`, `test/shadow.test.mjs`, `test/stop-alert-validity.test.mjs` (new), `test/stop-watch.test.mjs`, `test/watcher-resilience.test.mjs`, `test/watcher-incident-revision.test.mjs` |
| Rollback scope | Only the inverse, on the same ten files, applied to a fresh parent. Every data commit made in between is kept. No tree reset, no data or offset restore. |

**Not changed:** workflows, data, Telegram offsets, holdings, stop levels, financial records and settings.

## 2. Roles

| Who | Does | Never does |
|---|---|---|
| **Claude** | Sole release and rollback operator. Runs every check, pushes the one release commit (or the inverse), and cancels at most one approved pending bot run. | Dispatch, workflow edits, cancelling an active run, broad merge, force push. |
| **Owner** | Two clicks on **Telegram bot replies** (`bot.yml`) only: Disable, then later Enable, each when asked by a numbered request. Approves the exact pending-run ID at readiness. | Touching the Stock scanner or any other workflow. |
| **Codex** | Activated by the owner before the push. Read-only verifier of the complete hosted CI log; posts a receipt on PR #1. | Push, rollback, cancellation, takeover. If Codex is unavailable, there is no push. |

## 3. Owner clicks (numbered; settled only by definitive evidence)

1. **Disable.** I send `CLICK DISABLE NOW (REQ-D-1)` with the link. You click once, then reply `DONE DISABLE REQ-D-1`, confirming one press, the page showed it disabled, and nothing else is open.
2. **Enable.** Only after the code is verified, I send `VERIFIED Vx – CLICK ENABLE NOW (REQ-E-1)`. You reply `DONE ENABLE REQ-E-1`.

**Rules for both requests:**
- A request counts as done only when your numbered reply **and** my later independent read of the workflow agree.
- A read alone, a reply without the number, time passing, a withdrawal or a reminder never settles a request.
- If I withdraw a request (`WITHDRAWN: REQ-x-n – DO NOT CLICK`), it stays open until you reply `NOT CLICKED REQ-x-n`, or it is confirmed done.
- One request at a time. An open Disable request blocks Enable and the push. An open Enable request blocks the push, rollback and cancellation.
- Code words: **ACK READY, DONE DISABLE REQ-D-n, DONE ENABLE REQ-E-n, NOT CLICKED REQ-x-n.**

## 4. Cancellation limit

- The bot always has one waiting successor run, and Disable does **not** stop it.
- At readiness I publish its run ID, URL and zero-job proof. You approve **that one ID** separately.
- I cancel it only if it has **never started**, and I confirm the cancelled, zero-job result.
- I never cancel the active bot job, any scanner, watcher or radar run, another ID, or a replacement.
- If the waiting run has already started: no cancellation, no deployment. It runs normally, and the bot is restored with the code unchanged (V0).

## 5. Verification and abort rules

**Before the push, all must hold:**
1. The active bot job ends **naturally** with SUCCESS.
2. Its complete log shows zero executed output lines over the whole loop, including no save error. This proves the saves went through; it does not prove every command's effect.
3. Its saves are on `main`.
4. No scanner, watcher or radar run is active or queued.
5. Disable is settled and the bot reads disabled.
6. No uncertain write is outstanding.
7. Fresh `main` has every pinned file unchanged, and every test passes on `main` plus the patch (full suite and gated watcher scenarios). No failure allowance.

**Push:** one normal commit by E+20, announced on PR #1 before it is sent.

**Release gate:** within about 10 minutes, Codex's complete hosted-log receipt for that exact commit: all PASS, nothing missing.

**Abort paths:**
- **ABORT A:** the push never happened. Code stays V0; restore.
- **ABORT B:** CI fails, results are missing or late, or the log can't be verified. I apply the inverse, which gets its own full CI verification (V2), then restore.
- **Uncertain push:** a push with an uncertain result is UNKNOWN. No retry, no Enable, and the bot stays disabled until the state is proven.
- **Interruption:** if I am interrupted, the state stays UNKNOWN until checked. There is no automatic takeover.

**Restoring service:**
- Enable is requested only when every gate passes. It is never unconditional, and no outage limit is guaranteed.
- About 45–75 minutes from E to the first natural bot restart is a target only.
- Telegram messages sent during the gap wait behind the saved offset and are not claimed as processed.

**Final outcome**, one of:
- `VERIFIED V1, restored`;
- `VERIFIED V2, restored`;
- `VERIFIED V0, restored`;
- `NO ATTEMPT, nothing changed`;
- `UNVERIFIED: <exact open item>`.

## 6. Earliest eligible attended window (proposal only)

**Rule:** the whole span from E−45 to E+75 must avoid the scanner, watcher and radar. On weekdays that means E+75 ≤ 12:30 UTC (15:30 Kuwait). E is the bot job's loop-step start + 330 minutes.

**Projection from the actual chain** (5 Nov). The current job 127075951793's loop started at 05:48:52 UTC. Each job lasts about 5 h 30 m, and the waiting successor starts about 3 s after the previous job ends:

| Bot job ending | E (UTC) | E (Kuwait) | Eligible? |
|---|---|---|---|
| current | Thu 5 Nov 11:19 | 14:19 | **No:** E+75 = 12:34 UTC is past 12:30 |
| next | Thu 16:49 | 19:49 | **No:** US market session (watcher and scanner) |
| next | Thu 22:20 | Fri 01:20 | Rule-eligible only if the scanner's 21:30 UTC run is finished by 21:35 UTC. GitHub fired it at 01:34 UTC today (it ran until 02:24), so it is **likely blocked**. It is also after midnight in Kuwait. |
| **next** | **Fri 6 Nov ≈ 03:50** | **≈ 06:50** | **Yes. Earliest practical window.** |

**Owner availability (updated 5 Nov, 10:11 Kuwait):** Friday 6 Nov from about 09:00 Kuwait, or after 12:30. **Not at 11:30.**

**Actual chain, re-checked at 07:11 UTC:**
- Bot run 41947731543 (job 127075951793) is still active. Its loop started at 05:48:52 UTC.
- Observed hop: 330 min loop + about 17 s handoff, so about 5 h 30 m 27 s.

**Projected E (bot job end):**

| # | E (UTC) | E (Kuwait) | Fits? |
|---|---|---|---|
| 4 | Fri 03:50 | Fri 06:50 | No: before 09:00 arrival (E−45 = 06:05). |
| 5 | Fri 09:20 | Fri 12:20 | **No for both Friday options.** 09:00 arrival: readiness ≈ 11:35 and the session runs to about 13:35, overlapping the time you're unavailable (11:30). 12:30 arrival: needs E ≥ 13:15; 12:20 is too early. |
| 6 | Fri 14:51 | Fri 17:51 | No: US market session (watcher and scanner); fails the weekday bound E+75 ≤ 12:30 UTC. |
| 7 | Fri 20:21 | Fri 23:21 | No: E−45 = 19:36 UTC, before the Friday radar, 21:30 scan and watcher are terminal. |
| 8 | Sat 01:52 | Sat 04:52 | Rule-eligible only if the delayed Friday 21:30 scan has finished. Not proposed (04:07 Kuwait start). |
| **9** | **Sat 07 Nov 07:22** | **Sat 10:22** | **Yes. Next eligible.** Weekend: scanner, watcher and radar have no crons. Friday's late-firing runs (up to about 4 h late seen) end long before 06:37 UTC. |
| 10 | Sat 12:53 | Sat 15:53 | Yes. Alternative afternoon slot. |

**Neither Friday option fits.** For the 12:30 arrival, E would need to fall between 13:15 and 14:15 Kuwait, and no bot job ends then.

**Proposed: Saturday 7 November 2026, arrive 09:15 Kuwait** (06:15 UTC), attend until restoration is verified. The owner must confirm availability; it is not yet confirmed.

| Kuwait time (projected) | Step |
|---|---|
| 09:15 | Owner messages Claude; Claude re-derives E from the actual bot job. |
| ≈ 09:37 (E−45) | Readiness checks; waiting-run ID published. |
| ≈ 09:52–10:02 | `OPERATOR READY` → ACK READY and the separate run-ID decision. |
| ≈ 10:07–10:10 | `CLICK DISABLE NOW (REQ-D-1)`. |
| by ≈ 10:14 (E−8) | Disable settled, or no deployment. |
| **≈ 10:22** | **Bot job ends naturally**; save proof checked; owner activates Codex. |
| by ≈ 10:42 (E+20) | Release push, or no push. |
| ≈ 10:52 | Codex full-log receipt → V1, or rollback. |
| target ≈ 11:07 (E+45) | `CLICK ENABLE NOW (REQ-E-1)` if every gate passes. |
| ≈ 11:37 (E+75) | Expected natural bot restart. **Not guaranteed.** |

**Acceptance band:**
- The attempt proceeds only if, at 09:15, the actual E is between **10:00 and 11:30 Kuwait** (E−45 not before the 09:15 arrival).
- Otherwise: NO ATTEMPT, nothing changed. The chain is 9 hops out, so a missing successor or a late handoff can shift it.

**Afternoon alternative (same rules):** arrive 15:00 Kuwait, E band 15:45–17:00, projected 15:53.

**Recheck before the session:** Claude re-reads the chain on Friday evening when the owner messages, and gives the updated E. No reminder is installed.

**Data jobs:** discover (05:30 UTC Saturday) and movers (04:00 UTC) may run. They are not blockers, and their commits are kept.

## 7. Approval wording (for the owner to send; not granted)

> I approve STOP R2 maintenance under procedure S1.2 at 3af43a092de136aa034b32e84e53ab653981a114 (Codex PASS 6651816688) for one attended session on Saturday 7 November 2026, with owner and Claude present from 09:15 Kuwait time until restoration is verified, for the bot job projected to end at about 10:22 Kuwait (07:22 UTC): readiness at E−45 (about 09:37), target Enable about 11:07, expected bot restart about 11:37 (not guaranteed). E is re-derived from the actual bot job at 09:15; the attempt proceeds only if E is between 10:00 and 11:30 Kuwait (E−45 not before the owner's 09:15 arrival) and E−45…E+75 lies outside scanner/watcher/radar activity confirmed by fresh reads; otherwise NO ATTEMPT, nothing changed. Claude is sole release/rollback operator; Codex is the activated read-only verifier; I perform only the numbered bot.yml Disable and Enable clicks. Stock scanner and all other workflows stay enabled. Release only production patch c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b on the ten listed files; rollback only inverse 1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9 on the same files, preserving all intervening data. Cancellation is limited to one never-started pending bot run whose exact ID I approve separately at readiness. All tests must pass, the five-condition save proof (limited scope) and D's complete hosted-log gate apply, requests settle only by numbered evidence, and UNKNOWN writes block retry and Enable. No guaranteed outage limit, no unconditional Enable, no dispatch, workflow edit, data/offset/financial change, test message, provider probe or broad merge. This does not approve historical setup, rehearsal or audit, or the A pilot.
