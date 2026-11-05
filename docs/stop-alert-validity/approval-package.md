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

**Proposed attended session: Friday 6 November 2026, about 06:05–08:05 Kuwait time** (03:05–05:05 UTC; 22:05–00:05 New York, Thursday night).

| Kuwait time (projected) | Step |
|---|---|
| ≈ 06:05 (E−45) | Owner and Claude present. Claude does the readiness checks and publishes the waiting-run ID. |
| ≈ 06:20–06:30 | `OPERATOR READY`. Owner replies ACK READY and gives the separate decision on the run ID. |
| ≈ 06:35–06:38 | `CLICK DISABLE NOW (REQ-D-1)`. |
| by ≈ 06:42 (E−8) | Disable must be settled. Otherwise no deployment. |
| ≈ 06:50–07:00 | Bot job ends naturally; save proof checked. Owner activates Codex as verifier. |
| by ≈ 07:10 (E+20) | Release push, or no push. |
| ≈ 07:20 | Codex log receipt; V1, or rollback. |
| target ≈ 07:35 (E+45) | `CLICK ENABLE NOW (REQ-E-1)` if every gate passes. |
| ≈ 08:05 (E+75) | Expected natural bot restart. **Conditional, not guaranteed.** |

**Caveats:**
- These are projections. E is re-derived from the actual job at readiness, and the window is dropped if the chain shifts so the bounds no longer hold.
- GitHub fires schedules late. A late scanner or watcher run that is active at a check blocks the push. It is never paused or cancelled.
- Data jobs (movers 04:00 UTC = 07:00 Kuwait; discover 05:30 UTC) may run. They are not blockers, and their commits are kept.
- If you are unavailable then, the next candidate is roughly 5 h 30 m later (≈ 12:20 Kuwait, E ≈ 09:20 UTC). It is eligible if the chain holds, but it must be re-derived.
- No reminder or wake-up is installed. You start the session by messaging Claude.

## 7. Approval wording (for the owner to send; not granted)

> I approve STOP R2 maintenance under procedure S1.2 at 3af43a092de136aa034b32e84e53ab653981a114 (Codex PASS 6651816688) for the attended session Friday 6 November 2026 from about 06:05 Kuwait, subject to fresh readiness checks and E re-derived from the actual bot job (E−45…E+75 outside scanner/watcher/radar hours; otherwise no attempt). Claude is sole release/rollback operator; Codex is the activated read-only verifier; I perform only the numbered bot.yml Disable and Enable clicks. Stock scanner and all other workflows stay enabled. Release only production patch c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b on the ten listed files; rollback only inverse 1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9 on the same files, preserving all intervening data. Cancellation is limited to one never-started pending bot run whose exact ID I approve separately at readiness. All tests must pass, the five-condition save proof (limited scope) and D's complete hosted-log gate apply, requests settle only by numbered evidence, and UNKNOWN writes block retry and Enable. No guaranteed outage limit, no unconditional Enable, no dispatch, workflow edit, data/offset/financial change, test message, provider probe or broad merge. This does not approve historical setup, rehearsal or audit, or the A pilot.
