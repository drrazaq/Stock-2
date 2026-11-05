# STOP R2 bounded maintenance procedure (S1.2): preparation only, Codex focused confirmation pending

**Revision S1.1** applies Codex's findings R1 and R2 on S1 `4891431feeafb481c692a1b23790009337ad35ab` (PR #1 comment 6651214543):
- **R1:** the writer check is narrowed to the four demonstrated production workflows (§§2, 4, 6).
- **R2:** a settlement and withdrawal rule for click requests (§§3, 7, 9).
- It also states the limited scope of the save proof explicitly (§6) and that R's own CI is additional to its push budget (§7).

**Revision S1.2** applies Codex's S1.1 review (PR #1 comment 6651622565), which passed R1:
- **R2, completed properly:** observed workflow state is now kept separate from request settlement. COMPLETED needs definitive evidence tied to the numbered request; a state snapshot is never enough. Withdrawal or replacement never settles a request. A repeat reuses the same number. Unsettled requests block conflicting actions (§3; used in §§7 and 9).
- **Weekend wording:** `bot.yml` keeps its daily */30 schedule until Disable is verified (§2).

The patch, inverse, manifest, `bot.yml` pin and every other S1/S1.1 rule are unchanged.

**PREPARATION ONLY.**
- **Not authorized by this document:** scheduling, reminders, Disable or Enable clicks, cancellation, push, deployment or messages.
- **Quoted instructions** are future templates.
- **No execution date** is proposed or authorized.
- **Basis:** this adapts the reviewed ACTIONS maintenance procedure r4 (`97dd460cf52f0364c170010b2880680c0cd0070b`, §§1–9, with the D1 five-condition save contract and the D2 read-only log handoff) to the ten-file stop patch.
- **Not covered here:** historical setup or rehearsal, and the A pilot. Each needs its own approval.

## 1. Scope, roles, fixed artifacts

| Fixed artifact | SHA256 |
|---|---|
| `production.patch` (reviewed source `c73cb6a8881f0ab8fef5e64cbabeec0d966a7d8d`, docs `d142feb7942aee8b26f077d40f7bef13d85e88a7`) | `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` |
| `rollback.patch` (exact inverse) | `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9` |
| `manifest.json` (10 before/after file hashes) | `010ed6ca3a8332cb7e229047fad96a3e59097a0cb9631ac61ba740a33bb43e40` |
| Pinned `bot.yml` (unchanged since 30 Oct; same bytes as during the ACTIONS release `51b5e349` and health release `c19ef302`) | `2a7a8a66bbf03d02d0732cc44f4973cf534cbef9faffe3aa85b13659e0484e40` |

**The ten files:**
- **Production (runtime):** `stop-watch.mjs`, `ignition-watch.mjs`, `scan.mjs`, `early-alerts.mjs`.
- **Tests:** `test/load-scan.mjs`, `test/shadow.test.mjs`, `test/stop-alert-validity.test.mjs` (added), `test/stop-watch.test.mjs`, `test/watcher-resilience.test.mjs`, `test/watcher-incident-revision.test.mjs`.

**Not changed:** workflows, data, offsets, financial records, stop levels, holdings, settings, secrets and unrelated files. No full-PR or branch merge.

**Roles:**
- **Claude:** sole release and rollback operator. It makes the one approved cancellation, if any.
- **Owner:** performs only the two `bot.yml` clicks, Disable and Enable: [Telegram bot replies](https://github.com/drrazaq/Stock-2/actions/workflows/bot.yml).
- **Codex:** activated **read-only verifier** for the complete hosted log (§8). It has no push, rollback, cancellation or takeover authority. There is no automatic role transfer.

[Stock scanner](https://github.com/drrazaq/Stock-2/actions/workflows/main.yml) **stays enabled** throughout. So do the watcher, the radar, discover, movers and every lab. No workflow file is edited.

**Why the bot must be drained:**
- The bot's loop runs `git pull --rebase` before every iteration and then `node scan.mjs`. A code push during an active bot job would therefore change the code that job runs mid-run.
- The watcher (`ignition-watch.mjs` → `stop-watch.mjs`, `early-alerts.mjs`) and the radar (`opportunity-radar.mjs` → `early-alerts.mjs`) execute patched files too.

So no code is pushed while any of these writers is active (§4).

## 2. Window derived from the actual job (outside watcher hours)

**Capability gate:** at readiness, Claude confirms that its tools still allow:
- read workflow states, runs, attempts, jobs and logs up to 5,000 lines;
- cancel by run ID;
- ordinary non-force push to `main`.

It cannot click Enable or Disable. No capability is "tested" by a production write or a test cancellation. If a required capability is missing, there is no entry.

**State gate:** before the Disable request, read `bot.yml = active` and `main.yml = active`. Otherwise stop. This procedure never enables an already-disabled workflow and never changes scanner state.

**J and E:**
- **J** is the bot `reply` job active at readiness.
- **E** is its projected natural end = the actual start time of J's main loop step (`Run git config …`) **+ 330 min** (the loop's `end=$(( now + 330*60 ))`). Creation or queue time is not used.
- E is a planning time only. Actual SUCCESS and the §6 save proof are what count.

**Window rule** (New York is UTC−5 since 1 Nov; Kuwait is UTC+3). The whole span from **E−45 to E+75** must avoid every patched-file writer:
- **Weekday upper bound:** E+75 ≤ **12:30 UTC**. That is before the `ignition.yml` watcher crons (12:45 and 13:45 UTC Mon–Fri), the `main.yml` scans (13:10–20:40 UTC Mon–Fri) and the watcher-guard deadline (09:10 New York = 14:10 UTC, which runs inside the bot and is off while the bot is disabled).
- **Weekday lower bound:** E−45 must come after `main.yml`'s 21:30 UTC run, `opportunity-radar.yml` (20:40 UTC) and the watcher job are all terminal. That is proven by fresh reads (§4), not by the schedule.
- **Weekends** (Sat and Sun UTC, and Friday night after the 21:30 scan is terminal): the **other three** production consumers (`ignition.yml`, `main.yml`, `opportunity-radar.yml`) have no weekend crons.
- **`bot.yml`** keeps its */30 schedule **every day**. New bot starts stop only after Disable is **verified** (§3). A run already created before that, P, is governed by §5. The bot's starts are therefore never assumed suppressed from the calendar.
- **Data producers keep running and are not blockers** (§4): `movers.yml` 04:00 UTC Tue–Sat and `discover.yml` 05:30 UTC Tue–Sat. They are never suppressed or cancelled; their data commits are preserved by the fresh-parent checks.
- **US holidays:** treated like weekdays unless the actual reads show nothing ran.

**Example from today's data only (not a proposal):** job 127075951793's loop step started at 05:48:52 UTC on 5 Nov, so E ≈ 11:18:52 UTC. E+75 = 12:34 UTC, which **fails** the 12:30 bound. That J would not be eligible. The next J's end depends on the actual handoff and must be re-derived. No date is proposed.

**Attended readiness:** the owner and Claude must both be present. Codex is activated by the owner for §8 before D. No wake-up is promised. Projected service gap: roughly 45–75 minutes from E to the first natural bot restart, **not guaranteed** (§9).

## 3. Visible communication and outstanding clicks

**Messages:**
- Only a **turn-ending** message carries an instruction, request, decision or VERIFIED result. Mid-turn text is not a delivered instruction.
- Each visible message states the send time in UTC and Kuwait, the current state and the next wake deadline.
- Owner code words: **ACK READY, DONE DISABLE, DONE ENABLE, NOT CLICKED.**
- Approval of the one P cancellation is a separate decision naming the exact run ID. It is never inferred from ACK READY.

**Claude's cadence:**
- Owner messages are answered first.
- Claude's reads, aborts and rollback never wait for a code word.
- While a request, drain, write or block is open, Claude ends a turn with visible status at least every 15 minutes: no later than 15 minutes after Disable is confirmed, and by E+7.
- During the authorized window only, a bounded read-only poll may run inside an active turn (30-second polls of state and refs, ending on a change or deadline). Nothing is installed now.

**20-minute silence / 10-minute ping:**
- If 20 minutes pass after Disable with no visible Claude message, the owner PINGs Claude.
- If there is no reply within 10 more minutes, that is an escalation. It is not evidence that a write settled, and not permission for another writer.
- The bot stays disabled until restoration is verified.
- A replacement operator needs a separate explicit owner decision, an exclusive handover and every outstanding write resolved.

**Requests are tracked independently of acknowledgments; actual state is read even when an acknowledgment is missing:**

| Request | Rule |
|---|---|
| **REQ-D (Disable)** | Issued once (§7). On every wake, read the actual `bot.yml` state (`disabled_manually`), with or without DONE DISABLE. A missing or late acknowledgment does not mean the click didn't happen. **Disable is VERIFIED for the deployment path only when REQ-D-n is SETTLED COMPLETED (below) and the API reads `disabled_manually`.** If that has not happened by **E−8**, there is no deployment: REQ-D-n is **withdrawn but stays outstanding until it is settled**. At **E+30** without settlement, report `UNVERIFIED: REQ-D-n outstanding`. No deadline ever settles it. |
| **REQ-E (Enable)** | Issued only after: verified code (V0, V1 or V2); no UNKNOWN write; writer clearance; **every REQ-D SETTLED (the one used for this path COMPLETED)**; no other request outstanding. Read the actual `active` state with or without DONE ENABLE. If the state is still not `active` after 10 minutes, **repeat the same REQ-E-n** visibly, only after refreshing every gate. A repeat is a reminder of the same request, not a new one. Until REQ-E-n is SETTLED COMPLETED **and** the API reads `active`, report `UNVERIFIED restoration`. **There is no unconditional Enable.** |

**Observed state versus request settlement (R2):**

- **Two separate facts:**
  - **Observed workflow state:** the GitHub API state of `bot.yml` and `main.yml`. It is read on every wake, independently of any acknowledgment. It is necessary for every gate, but **it never settles a request**: the state can reflect another click, an earlier request, or a request still in flight.
  - **Request settlement:** whether one numbered request has definitively finished. It is decided only by the evidence listed below.
- **Numbering:**
  - Every click request has one number (REQ-D-1, REQ-E-1, …), quoted in the visible message.
  - **At most one request is ever outstanding.** No new number, of either kind, is issued while an earlier request is unsettled.
  - Reminders repeat the **same** number.

**Sufficient evidence**, all parts required:

| Settlement | Evidence |
|---|---|
| **COMPLETED** | **(1)** The owner's terminal confirmation for that number, given after the click: `DONE DISABLE REQ-D-n` or `DONE ENABLE REQ-E-n`. It confirms that the button was pressed once, the GitHub page then showed the workflow in the requested state, and no other tab, retry or attempt for that number is still open. **(2)** An independent API read taken **after** that confirmation shows the requested state. **(3)** No contradicting read appears between issue and confirmation without explanation. Example of a contradiction: the requested state appeared, then reverted. |
| **NOT SUBMITTED** | **(1)** A visible withdrawal of REQ-x-n was sent. **(2)** After it, the owner replies `NOT CLICKED REQ-x-n`, confirming the button was never pressed for that number and will not be. **(3)** An independent API read shows that the state did not change because of it. |

**Not sufficient on its own:**
- an API snapshot showing the desired state (however fresh or late);
- an acknowledgment without the matching API read;
- a bare DONE or NOT CLICKED without the number;
- elapsed time or a deadline;
- a withdrawal message;
- issuing a reminder or a later request;
- the owner's silence.

**Outstanding / UNKNOWN:** a request that is neither COMPLETED nor NOT SUBMITTED. Two cases need care:
- If the owner's confirmation and the API read disagree, the request stays **UNKNOWN**. It is reported visibly, never resolved by inference.
- If the owner reports a click whose outcome they are unsure of, it stays outstanding until the owner can give the full COMPLETED confirmation.

**Withdrawal never settles a request:**
- `WITHDRAWN: REQ-x-n – DO NOT CLICK` (visible, turn-ending) is sent whenever a request expires or is invalidated: a missed deadline, an abort or retry path, or a change of plan.
- The request then stays outstanding until it reaches COMPLETED or NOT SUBMITTED.

**How unresolved requests block conflicting actions:**

| Outstanding request | Blocks |
|---|---|
| Any **REQ-D** | Issuing any REQ-E; any D push (D needs that REQ-D COMPLETED); a VERIFIED restoration or `NO ATTEMPT` outcome. A late Disable could stop the bot after restoration. |
| Any **REQ-E** | Any D, R or retry push and any cancellation, since a late Enable could start the bot during the mutation; issuing any REQ-D; and a VERIFIED restoration. |
| Either, unresolved | Its own report line in every visible status until it is settled. |

The block holds even if the desired state is currently observed. With the bot enabled, every mutation is excluded anyway: a COMPLETED REQ-E means any later code change needs a new drain.

**Late click** (a click landing after withdrawal or after restoration):
1. Re-read the state.
2. Treat the click as the outcome of that same numbered request, and settle it by the rules above.
3. Repeat the verified-state, writer and restoration checks.
4. If the resulting state conflicts with the verified one, report it, and issue a new numbered request only after the old one is settled.

Restoration is never labelled VERIFIED while any request is outstanding or UNKNOWN.

- **No new controls:** this adds no new workflow control and no new operator authority.

**Late Disable:**
- If Disable is first verified **after E−8**, there is no deployment. First settle that REQ-D (COMPLETED evidence). Then freshly re-verify the original code and pins after that click, resolve every write and clear the writers. Only then send a visible, numbered `VERIFIED V0 – CLICK ENABLE NOW (REQ-E-n)`.
- A late ACK READY or DONE DISABLE never revives an expired window. An expired REQ-D is withdrawn visibly, stays outstanding until it is settled, and a late click is handled by the settlement rule above.
- An independent owner override is recorded as outside the procedure, never as VERIFIED.

## 4. Writer check (WC) and baseline

**When WC runs:** at entry, throughout the drain, immediately before and after **every** D or R push or retry, and before any Enable request.

**What it covers:** complete listings of every status, attempt and job for the **four demonstrated production consumers** of the patched code:
- `bot.yml` `reply` job (runs `scan.mjs` and `watcher-guard.mjs`);
- `main.yml` (`scan.mjs`);
- `ignition.yml` (`ignition-watch.mjs` → `stop-watch.mjs`, and `early-alerts.mjs` directly and via `rank-models.mjs` / `shadow-stream.mjs`; also its midday radar child);
- `opportunity-radar.yml` (`opportunity-radar.mjs` → `early-alerts.mjs`; `shadow-outcomes.mjs` → `rank-models.mjs` → `early-alerts.mjs`).

**Catch-all:** any other run discovered **executing a patched file with production effects**, meaning production writes, delivery or shared-state effects, is also a blocker.

**Not writers under this procedure:**
- fixture-only `tests.yml` runs, including D's and R's own CI;
- the read-only `accounting-preflight` job;
- `discover.yml` and `movers.yml` (with `fastmover-lab.mjs` and `octopus.mjs`). Their scripts import none of the patched modules (checked on main `8a05fb69`) and they don't write the bot's positions or command-offset state. Their data-only commits are recorded and preserved through the fresh-parent and data-movement checks, never treated as blockers. D's still-running CI never blocks ABORT B.

Where needed, check the actual checked-out or executed source; a head SHA alone is not enough. A gap in the listing, or an execution that can't be identified, blocks any mutation. Schedules are never WC evidence.

**At entry and during the drain:** only the designated J may be executing. The designated P (§5) may be pending with zero jobs.

**Before any code mutation, all of these must hold:**
- J terminal SUCCESS with the §6 proof;
- P conclusively cancelled with zero jobs, or no P designated and none present;
- no active, queued or waiting run of any of the four production consumers (or a catch-all production executor);
- no outstanding Enable intent (§3);
- REQ-D-1 SETTLED COMPLETED, no request outstanding, and a fresh read shows the bot disabled and the scanner active;
- no UNKNOWN code write.

A new active or pending scanner, watcher or radar run (or catch-all production executor) blocks the push. It is never paused or cancelled. Data producers, labs and other writers that don't execute patched code with production effects may continue. Their commits are preserved because D and R are built on a fresh immediate parent, with data movement recorded.

**Baseline and compatibility:**
- **M0** is `main` at readiness. **M** is the **immediate pre-release parent**.
- **Pins:** verify both patch hashes and the manifest; verify the 10 before-hashes, plus the 16 manifest/dependency paths in Codex's `current-main-compatibility.json` (`b46f77f4`), against M. Any changed pinned byte stops the procedure for reconciliation. There is no three-way or forced application.
- **Tests:** on M and on M plus the exact patch, run ordinary Node 20 `node "$f"` for **every** registered `test/*.test.mjs`. Also run the two gated watcher scenario files with `INCIDENT_WATCHER_SRC=<tree>/ignition-watch.mjs`; they skip without it. **All candidate tests must PASS. There is no failure allowance.**
- **If M moved only in `data/`:** record proof that the source is identical. Otherwise rebaseline within the preparation deadline, or abort.
- **Latest evidence (5 Nov 05:53 UTC):** main `8a05fb69` with 0 pinned paths changed; patch applies; rollback restores main exactly; candidate **136/136**; gated scenarios 9/9 and 11/11. All of this is re-done at readiness.

## 5. The pending bot run P (at most one, approved by exact ID)

**Why P exists:** `bot.yml` uses concurrency group `bot` without cancelling in-progress runs, on a `*/30` schedule. GitHub keeps one pending successor. Observed on 5 Nov: run 41947731543 was created at 01:19:31 and started its job at 05:48:40, three seconds after its predecessor's job ended at 05:48:37.

**Disabling does not hold P.** A run already pending before Disable may still start when J ends. Disable only stops new schedule triggers.

**Readiness:**
- Publish P's numeric run ID, exact URL, event (`schedule`), attempt list, `pending`/`queued` status and complete zero-job evidence.
- The owner separately approves **that one ID**. No document pre-approves any ID or a replacement.
- If there is no P, no cancellation is needed.
- More than one pending run, a replaced P, a manual-event P or incomplete history means **no entry**.

**Cancellation:**
1. After Disable is verified (REQ-D-1 SETTLED COMPLETED and the API reads `disabled_manually`) and while J is still active, re-read P with all its attempts and jobs.
2. Cancel **only P**, only with the specific approval, and only if P has **never started** (zero jobs). Never J, never an active writer, never another or replacement ID.
3. A submitted cancellation is not proof. Re-read a terminal `cancelled` with zero jobs.
4. If P has gained a job, do not cancel. Abort the deployment and let P finish naturally (it is now the active writer). Then follow verified restoration (ABORT A).
5. An unknown result or a race is reported honestly and blocks deployment. There is no blind retry. An unresolved cancellation remains an outstanding operation that must be reconciled before any Enable request.

## 6. Natural completion and final-save evidence (D1 five-condition contract, unchanged)

J must end **naturally** with SUCCESS. Job success alone is not enough, because `save()` can print its error and still exit 0. All five conditions must hold, read from **executed output** (not the echoed script):

- **(a)** J and its main loop step are terminal SUCCESS.
- **(b)** J's **complete** authentic job log is read: from setup, through the whole loop step, to Post-job cleanup, below the 5,000-line cap with no truncation. A tail alone fails. A larger or incomplete log is UNVERIFIED.
- **(c)** The echoed script and the shell line match pinned `bot.yml` `2a7a8a66…` byte for byte:
  - `bash --noprofile --norc -e -o pipefail`;
  - standalone `save; mirror`;
  - the exact embedded `save()`;
  - unchanged loop and redirection.

  Authoritative data, including the offset file, falls within `git add data`.
- **(d)** There are **zero executed output lines over the entire loop step**. Any `fatal:`, `error:`, rejection, `Error: could not save the data folder to the repository` or other output means **BLOCKED**.
- **(e)** J's checkout SHA and every identified `bot …` save commit from J are ancestors of fresh `main`, with complete history. If that can't be established, the result is UNVERIFIED. No commit is manufactured.

**Stored privately only:** the final persisted data-tree and offset-file blob identities. Never published: raw logs, offsets or identifiers.

**Never done:**
- calling `getUpdates`;
- resetting or replaying offsets;
- fabricating commands or trades;
- claiming queued Telegram commands were processed.

Pending owner messages wait behind the persisted offset. Telegram retention is about 24 hours, so a gap is recorded, not assumed harmless.

**Limited scope of this proof (stated with every report of it):** under the exact pinned shell, the five conditions support only a limited claim: the Git save control flow completed, the saved commits are ancestors of `main`, and the persisted data checkpoint exists. They do **not** prove that every intended command took effect:
- scan, watchdog, reply and mirror output goes to `run.log`;
- failures there can be caught;
- `run.log` is tail-truncated.

Quiet hosted output cannot reconstruct intent or prove every Telegram command was saved. Queued messages are never claimed as processed. A no-change save makes no commit, and none is fabricated.

**Production consumers:** the watcher, radar and scanner do not run in the window. If any runs anyway, it is a §4 blocker, not a save-proof question.

## 7. Timeline, UNKNOWN writes, rollback

| Phase | Mandatory action / deadline |
|---|---|
| Entry from E−45 | Claude confirms capability, J/E, the §2 window bounds, M0 tests and pins, the prepared inverse, both workflow states, P, and Codex availability for §8. |
| E−30…E−20 | Visible turn-ending `OPERATOR READY – STOP R2`: names J, E, P (ID and URL), the next wake time, and asks for **ACK READY** plus a separate decision on the P cancellation. |
| By E−12 | ACK READY is required. Only then, at E−15…E−12, a visible `CLICK DISABLE NOW (REQ-D-1)` with the bot-only link. REQ-D-1 opens; the owner confirms with `DONE DISABLE REQ-D-1` (§3). |
| By E−8 | **Disable VERIFIED**, meaning both: REQ-D-1 SETTLED COMPLETED (owner `DONE DISABLE REQ-D-1` confirmation plus a later API read), and the API reads bot `disabled_manually` and scanner `active`. A state read alone is not enough. Otherwise no deployment: REQ-D-1 is withdrawn visibly and stays outstanding until settled (§3). |
| Before J ends | Claude cancels only the approved, never-started P, and verifies terminal `cancelled` with zero jobs (§5). |
| By E+10 | J has finished naturally, the §6 proof holds and WC passes. Otherwise **ABORT A** with unchanged code. |
| Preparation ≤10 min | Fetch M, prove baseline identity and pins, run the candidate tests, build D and the inverse, take a fresh WC. Visible `D READY – PUSH TURN NEXT`, with a 1-minute wake deadline. |
| D push by E+20 | One active push turn: fresh WC and states; **post on PR #1 `PUSHING D=<sha> ONTO M=<parent>` before the request**; push only the normal isolated D. **No release push after E+20.** |
| D push +10 | Complete hosted all-PASS verdict for exact D (§8) → **V1**. A failure, missing result or late evidence → **ABORT B** in that turn. |
| Push turn ≤15 min | Targets: CI ≤10, rollback ≤5. Targets never override writer, UNKNOWN or compatibility gates. R's own complete hosted all-PASS verification comes **in addition** to its push budget. E+45 and E+75 are therefore conditional, especially if a production consumer blocks R. If blocked, end visibly with the D status, the exact blocker and the next wake. |
| Enable target E+45 | Only fresh **VERIFIED V0, V1 or V2**, no UNKNOWN, WC pass, REQ-D settled COMPLETED and no other request outstanding allow a numbered `VERIFIED Vx – CLICK ENABLE NOW (REQ-E-n)`. Then the API must read bot `active` and scanner `active`. |

**Code states:**
- **V0:** original source and pins (D never applied).
- **V1:** exact D after-hashes on the ten paths, every other byte equal to M.
- **V2:** exact `rollback.patch` applied on a fresh parent, with the ten before-hashes restored.

**D** is a direct child of exact M, changing only the ten paths. It is a normal non-force push: no merge, force or overwrite.

**Write outcomes:** every main-ref request is first recorded on PR #1 (operator, parent, candidate SHA and tree, scope).
- **APPLIED** requires positive evidence of that exact commit on `main`.
- **NOT APPLIED** requires a definitive terminal rejection of that exact request.
- Anything else is **UNKNOWN.** While UNKNOWN: no retry, no takeover, no VERIFIED claim and no Enable request. Report it visibly and re-read. No deadline, silence, owner instruction or later `main` movement settles it.

**ABORT A** (D definitely not applied): freshly verify V0, the pins and the preserved data; settle every click request (§3); restore under REQ-E.

**ABORT B** (D applied, CI failed or unverified):
- Apply R, which is only `rollback.patch` (`1a13a44d…`), to a fresh parent whose ten after-hashes and dependencies match. Every intervening data or unrelated commit is preserved.
- Never revert to an old tree, restore data or offsets, or add fixes.
- Check WC and states before every R mutation.
- At most one retry, only after a definitive NOT APPLIED and only for data-only movement of `main`. UNKNOWN forbids a retry.
- If a writer blocks R, let it drain naturally. Later deadlines become conditional.
- R gets its own ordinary push CI and complete all-PASS verification, giving **V2**.

## 8. Exact-release hosted CI and full-log verification

**The gate:** D's own complete hosted required results.
- Actual checkout SHA = D.
- Workflow, run and job IDs and attempts recorded.
- Complete inventory of registered files and required steps.
- Job and required checks SUCCESS; every required file PASS. Nothing missing, failed, timed out or truncated.
- No failure allowance. A green badge is not a verdict.

**Baseline B (informational only):** the latest `main` Tests run whose non-`data/` tree is byte-identical to M (`git diff --quiet B M -- . ':!data'`, both non-data tree hashes recorded). Otherwise report `NO EQUIVALENT BASELINE PROVEN`. That never weakens D's gate. No dispatch or fake commit is made to create a baseline.

**Codex read-only verifier (D2 handoff):**
- Before D, the owner activates Codex. Codex acknowledges with a current `read-only verifier active`.
- Claude gives Codex D, M, B's identity, the expected run/job IDs, the test inventory and the deadline (D push +10).
- Codex retrieves the **complete** hosted log and posts a sanitized PR #1 receipt: SHAs, IDs and attempts, log hash and byte/line counts, required and covered files, all-PASS or exact failures, limitations.
- **If the verifier is unavailable, D is not pushed.**
- Claude validates the receipt and alone decides V1 or ABORT B.
- Missing, partial, wrong-SHA or late evidence makes D **UNVERIFIED**, which triggers ABORT B.

## 9. Restoration and final outcomes

**Enable conditions:** Enable is requested only when every gate holds, however late. Final restoration requires:
- REQ-E-n SETTLED COMPLETED (§3), **and** bot `active` and scanner `active` by an independent API read;
- every REQ-D and REQ-E settled (§3), none outstanding and none withdrawn but unconfirmed;
- exact verified code (V0, V1 or V2);
- no UNKNOWN write.

**No outage limit is guaranteed.** About 45–75 minutes from E to the first natural bot restart is a target only.
- It can be extended by GitHub queueing, a missing save or CI proof, an UNKNOWN write, or a missing response from the owner or operator.
- If restoration is still open near the watcher-guard deadline (14:10 UTC on a weekday), the bot stays disabled until verified. The watcher's own `ignition.yml` crons still run, and the gap is reported.
- No manual dispatch. The next bot run starts on its natural schedule.

**After restore (passive only):** check the next natural job's actual `scan.mjs` bytes, its saves and offset continuity. Then, as they naturally occur, check the stop lines:
- source, date and age shown;
- UNKNOWN for future, nonfinite, stale or missing prices;
- the bot staying silent when the watcher's record is ACKNOWLEDGED.

There are no test messages, no fabricated holdings and no provider probes. Cases not observed stay pending.

**Final outcomes (only these):**
- `VERIFIED V1, restored`;
- `VERIFIED V2, restored` (rolled back);
- `VERIFIED V0, restored` (no change);
- `NO ATTEMPT, nothing changed`, only with no outstanding click or write;
- `UNVERIFIED: <exact open condition and follow-up>`.

## 10. Owner decision (after Codex review), not granted

> I approve STOP R2 maintenance procedure S1.2 at ⟨reviewed commit⟩ with Claude as sole release/rollback operator, Codex as activated read-only verifier, and myself performing only bot.yml Disable/Enable. Stock scanner, watcher, radar and all other workflows stay enabled. Production patch c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b on exactly the ten listed files; rollback only inverse 1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9 on the same files, preserving every intervening data commit. The window is derived at readiness from the actual bot job (E−45…E+75 outside watcher/scanner/radar hours). Cancellation is limited to one never-started pending bot run whose exact ID I approve separately at readiness. All candidate tests must PASS; D's complete hosted results gate V1; the five-condition save proof (limited scope), numbered click requests settled only by definitive evidence tied to each number (never by a state snapshot, withdrawal or replacement), UNKNOWN handling and verified restoration apply; there is no guaranteed outage limit and no unconditional Enable. No dispatch, workflow edit, data/offset/financial change, test message, provider probe or broad merge. This does not approve historical setup/rehearsal/audit or the A pilot.

A readiness session date is a separate, later owner decision.
