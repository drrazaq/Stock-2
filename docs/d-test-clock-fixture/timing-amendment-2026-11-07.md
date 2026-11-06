# Timing-only amendment for Saturday 7 Nov 2026: E band and attendance, from the actual bot chain

**PREPARATION ONLY. Codex focused confirmation pending. Nothing is scheduled, clicked, cancelled or deployed. No approval wording is presented before Codex's PASS.**

## 1. What this changes, and only this

| Item | Approved now (6652184563 / 6657831871) | Amended (proposal) |
|---|---|---|
| E band (E is the end of the actual J) | 10:00–11:30 Kuwait (07:00–08:30 UTC) | **12:00–13:15 Kuwait (09:00–10:15 UTC)**. The original band also stays valid if, unexpectedly, the actual E falls in it. |
| Owner readiness (start of attendance) | 09:15 Kuwait (06:15 UTC) | **11:30 Kuwait (08:30 UTC)** |
| Deadline for every approval (STOP is unchanged; T, S1.2-TD and this amendment are new) | before readiness, 09:15 | **unchanged: before 09:15 Kuwait (06:15 UTC).** It is not moved later along with readiness. |

**Unchanged (byte-for-byte and in substance):**
- **Procedures:** S1.2 (`3af43a09`), S1.2-D (`357a3e32`) and S1.2-TD (`9e956908`).
- **Patches:** every patch and inverse (STOP `c1de39fd…`/`1a13a44d…`, T `fefe0ecf…`/`3a2d2ffd…`, D `6889504c…`/`7a9e1250…`).
- **E rules:**
  - J is the bot `reply` job active at readiness;
  - E = the start of J's loop step + 330 min;
  - the E−45…E+75 writer rules, every relative cutoff (E+20, E+28/E+38 as proposed, E+40, E+50, E+70) and the writer check;
  - P only by exact ID approved at readiness;
  - numbered clicks, UNKNOWN handling and verified restoration.
- **Coverage:** the amendment applies to the STOP-only path and to the STOP→T→D path alike.

**The amendment authorizes no new action.** The owner's existing roles and the "Not authorized" lists stay exactly as written.

## 2. The actual chain (read 6 Nov, 17:46 UTC)

| Run | Event | State | Loop step start (actual) | E = loop + 330 min |
|---|---|---|---|---|
| 42258713266 (owner-approved restart) | workflow_dispatch | in progress | **17:07:50 UTC** (job 128032700427) | **≈ 22:37:50 UTC Fri (01:38 Kuwait Sat)** |
| 42263154687 | schedule | **pending** (created 17:36:15 UTC, held by the `bot` concurrency group) | expected ≈ 22:38 UTC, when the run above ends | **≈ 04:08–04:10 UTC (07:08–07:10 Kuwait)** |
| next scheduled successor (not yet created) | schedule | it has to be created while the run above is active | ≈ 04:09 UTC if it is already pending then | **≈ 09:38–09:41 UTC (12:38–12:41 Kuwait)**. This is the one this amendment targets. |

**Projection:** this run (call it J3) is the bot job that would be active at readiness. With E ≈ 12:38 Kuwait, it falls inside the amended band.

**Uncertainty, stated plainly:**
- On 6 Nov a scheduled successor was never created (15:35 to 17:07 UTC). If that happens again, E moves later by the gap. **The band tolerates up to about 37 minutes of total delay.**
- **If no bot run is active at readiness, there is no J and no attempt.** No dispatch is ever used to create one.

## 3. Eligibility under the reviewed weekend safeguards (S1.2 §2)

At projected E = 09:38 UTC, the window E−45…E+75 is **08:53–10:53 UTC on Saturday**. Across the whole band the window is 08:15–11:30 UTC.

**Checked against the schedules on main `ddc58462`.** Schedules are never writer-check evidence; fresh reads decide.
- **`ignition.yml`, `main.yml`, `opportunity-radar.yml`:** no weekend crons. The weekday bounds (E+75 ≤ 12:30 UTC; after 21:30 UTC) do not apply on Saturday. Fresh reads must still show none of them active, queued or waiting (S1.2 §4).
- **`bot.yml` `*/30`:** this is the J/P mechanism, handled by S1.2 §§3 and 5 unchanged.
- **The only other cron firing in 08:15–11:30 UTC Saturday is `squad26-lab.yml`** (`17 */2 * * *`: 08:17 and 10:17 UTC). It imports none of the patched files (`scan.mjs`, `early-alerts.mjs`, `ignition-watch.mjs`, `stop-watch.mjs` and the others in the STOP, T and D paths). So it is a data writer, not a blocker, and its commits are preserved by the fresh-parent checks.
- **`squad26-watch.yml`:** weekday crons only. It imports no patched file.
- **`movers.yml` 04:00 UTC and `discover.yml` 05:30 UTC:** these finish before the window, and are not blockers in any case.
- **The owner's "Stock-2 daily researcher" scheduled task** fires at **11:37 Kuwait (08:37 UTC) on Saturday**, during readiness. It may push research files and code (for example `research-*.mjs` or a lab workflow) to main.
  - It is not one of the four production consumers, and it is told never to edit `scan.mjs` or the owner files.
  - **However, any non-data commit it makes breaks the readiness non-data identity proof (S1.2-TD §§2.2–2.3).** The suites must then be rerun on the actual parent (about 7 minutes serially), within the existing cutoffs. If that cannot finish in time, the affected unit is SKIPPED.
  - Claude will neither pause nor change that task. The owner may choose to pause it for Saturday; this is listed as an owner option, not a requirement.

**Result:** eligible under the reviewed weekend safeguards, subject to the fresh reads at readiness. Nothing in this amendment relaxes a writer, pin, test, CI or click rule.

## 4. Attendance

**Projected times (E = 12:38 Kuwait); every time moves with the actual E:**

| Kuwait time | Step |
|---|---|
| **by 09:15** | **Every approval complete** (§1). If anything is missing, the session is STOP-only, or there is no attempt if this amendment itself is not approved. |
| **11:30** | **The owner messages Claude; readiness starts.** Claude identifies J, its loop start and E. If E is outside the band, NO ATTEMPT. Then capability, pins, predicted-tree serial suites (about 7 minutes) and the P ID for the owner's separate approval. |
| ≈ 11:53 (E−45) | Window opens; S1.2 entry. |
| ≈ 12:08–12:18 | `OPERATOR READY`, then ACK READY. |
| ≈ 12:23–12:26 | `CLICK DISABLE NOW (REQ-D-1)` (owner click). |
| by ≈ 12:30 (E−8) | Disable VERIFIED. |
| ≈ 12:38 (E) | J ends naturally; save proof; Codex attended from here. |
| by 12:58 / 13:08 | STOP push (E+20) and STOP verdict. |
| by 13:06 / 13:16 | T push (E+28) and T verdict (E+38), as proposed. |
| by 13:28 / 13:40 | D push (E+50) and D verdict. |
| target ≈ 13:48 (E+70) | `CLICK ENABLE NOW (REQ-E-1)` (owner click), conditional. |
| ≈ 14:18 (E+100) | Expected first natural bot restart. Conditional. |

**Attendance windows:**
- **Owner:** from 11:30 Kuwait until restoration is verified. **Plan until about 14:20 Kuwait**, or about 14:55 if E lands at 13:15, and longer if any gate holds.
- **Codex:** from about E−10 (12:28) to the last receipt (about 13:50); later only if a rollback receipt is needed.

**Bot outage:** the bot does not answer Telegram from Disable (≈ 12:25) until its natural restart after Enable.

## 5. Approval sequence

1. **Codex's focused PASS** on this amendment. This is separate from, and in addition to, its PASS on S1.2-TD.
2. **Only then** does Claude present the exact approval wording. It covers this timing amendment, plus T and S1.2-TD if Codex also passed those.
3. **The owner's approval must arrive before 09:15 Kuwait on Saturday.**

**If the timing amendment is not approved:** the existing 10:00–11:30 band applies, and on the projected chain that means NO ATTEMPT on Saturday.
