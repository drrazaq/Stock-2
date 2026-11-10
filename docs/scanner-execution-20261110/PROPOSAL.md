# Dependable scanner execution and bounded release verification (PROPOSAL, revision 3; development only, nothing authorized)

Diagnosis: `DIAGNOSIS.md`. This proposal does not change the approved unit `d52499c4` / binding `1a799a15` (28 paths), the approved protocol `d2f76b64`, or production. Every production workflow change, dispatch, cancellation and protocol amendment below needs its own exact owner approval.

## 0. Recorded closure (owner instruction, 10 Nov)

- Claude's PASS 6758155955 on `5ba1606d` closes **J1, T1, R1, C1 and C2**.
- **E1** (the `assessmentRule` copy on each `signals.json` row, about +2.3–2.6 MB) is **deferred**: non-blocking and not a release condition.

## 1. Reconciling the "complete latest market day" prerequisite

| Item | In approved protocol `d2f76b64`? |
|---|---|
| Session A timing band, empty census, T+20 readiness, inverse ≤ 85 min | Yes |
| B: read-only review; **every one of the 16 intraday runs plus the nightly**, each slot reconciled to a run or to an explicit missing/failed result | Yes (§3, F2) |
| A missing, late or failed job stays failed; B cannot make it timely | Yes (§4) |
| "If only a scheduler/provider/evidence outage is established, do not infer a source regression … record FAILED/UNKNOWN and a concrete disposition" | Yes (§4) |
| **Do not start A until one complete market day of scanner runs (the most recent one) has been observed** | **No.** Codex proposed it and I endorsed it with the "most recent day" precision in 6758155955. It is an **additional condition, not part of the owner-approved protocol**. It binds only if the owner approves it as an amendment. |

**Consequence.** Under the approved protocol alone, A is not barred by scheduling. But B would certainly end UNVERIFIED (FAILED/UNKNOWN for scheduler reasons), and the protocol gives no path from there except "a concrete disposition". The baseline condition avoids starting a release that cannot be verified. It also has no end date, because it waits on GitHub. Section 3 replaces that open-ended wait with a bounded, constructive one.

## 2. Remedy: scanner guard (development branch `claude/scanner-guard-20261110`)

**Unit G (5 paths, disjoint from the 28 bound paths):**
- `scanner-guard-core.mjs` (pure decision)
- `scanner-guard.mjs` (runner)
- `test/scanner-guard.test.mjs`
- `.github/workflows/main.yml`
- `.github/workflows/bot.yml`

**Host.** The bot loop (`bot.yml`) runs `scanner-guard.mjs` every 5 minutes, right after the existing `watcher-guard.mjs`. That guard already starts `ignition.yml` the same way; run 42632637138 on 9 Nov was started by it. Workflow dispatch from the job's own token is allowed by GitHub, and `bot.yml` already has `actions: write`.

**Decisions** (bounded; NYSE calendar from `market-session.mjs`; an unknown year means no dispatch):

1. **Nightly.**
   - *Due when:* `data/signals.json.session` is older than the latest completed session L (close + 60 min).
   - *Dispatch:* `main.yml` with `mode=daily`.
   - *Window:* 22:15 UTC on L to 06:00 UTC the next morning, so the 06:00–13:40 UTC band stays free for release Session A.
   - *Guards:* only when no `main.yml` run is queued or running; at most 2 attempts per session, at least 60 minutes apart.
   - *No duplicate ACTIONS:* `daily()` still refuses a session it already has, because the guard never sets `FORCE`.
   - *If the window closes:* one alert, "NIGHTLY SCAN NOT DONE".
2. **Intraday.**
   - *Window:* market open + 10 to close − 10 minutes NY (early closes respected).
   - *Dispatch:* `mode=intraday` when no `main.yml` run was created in the last 40 minutes and none is active.
   - *Limits:* at least 30 minutes between guard starts; at most 14 a day.
3. **Bot successor.** When the current bot loop has under 45 minutes left, it requests the next `bot.yml` run once, so the guard's host no longer depends on the every-30-minutes cron (9 Nov bot gap: 18:10–20:58 UTC). The concurrency group `bot` holds at most one waiting run.

**Safety properties (each tested):**
- *(Revision 1 text, superseded by §2a.)* The attempt is written to `data/scanner-guard.json` as RESERVED **before** the request leaves. Tested by killing the runner while the request is in flight: the record already exists, and no repeat follows inside the gap.
- A timeout, network error or 5xx gives UNCERTAIN. It counts as an attempt and is never retried blindly.
- A 4xx gives REFUSED, with one alert per day.
- If GitHub's run list fails, nothing is decided or written.
- The guard never places orders, never edits owner files, and never touches Telegram offsets.

**`main.yml`:**
- New dispatch inputs `mode` and `slot`. A manual dispatch with empty `mode` keeps today's meaning: a forced daily scan.
- A guard dispatch sets `MODE` from the input and leaves `FORCE` empty.
- A first log line records event, schedule, MODE, FORCE, slot and checkout SHA. This is direct P-code/P-def evidence for every run, including guard-started runs.

**Validation so far:**
- *(Revision 1 validation, superseded by §2a.)* `node --test test/scanner-guard.test.mjs`: 9/9 PASS. The cases cover:
  - the 9 Nov replay (run 42716422194 active, nothing new);
  - summer and winter clocks, weekend, Thanksgiving, an early close and an unknown year;
  - the two-attempt limit, the 06:00 cutoff and one alert only;
  - the intraday limits;
  - the bot successor;
  - the real CLI against a local GitHub/Telegram stub (exact request body; hung request gives UNCERTAIN; 403 gives one alert; failed list writes nothing; reserve-before-request).
- Mutation checks: removing the active-run wait, widening the window, dropping REFUSED, admitting a session before its bars, and reserving after the request each make the tests fail.
- Both workflow files parse as YAML.
- Full root suite: see the receipt on PR #1.

**Residuals:**
- A late *scheduled* daily event that arrives after a guard-completed nightly still loads market data (about 45 minutes) before `daily()` refuses the session. This already happens today with late events. It costs data-provider calls but sends no duplicate message. Avoiding it would need an edit to `scan.mjs`, which is bound, so it is not proposed here.
- If the bot loop is down, the guard is down too. The successor request reduces this risk but does not remove it.

## 2a. Revision 2 (answers Codex review 6758807819, G1–G6)

| Finding | Correction in revision 2 | Regression (`test/scanner-guard.test.mjs`) |
|---|---|---|
| **G1** local rename was not a remote reservation | State moved off `data/` to its own branch `scanner-guard-state` (one file). Every change is a plain, non-force push of a child of the tip just read, so GitHub accepts it only if nobody moved the tip: compare-and-publish. The dispatch request is made **only after** the RESERVED record is confirmed on the remote. An ambiguous push is read back: ours → published; otherwise or unreadable → **no request**. | Real git: bare remote + two clones. The remote shows RESERVED at the moment of the request; another writer racing between read and reservation wins and the loser makes no request; an unreadable remote means no request; the runner is killed after the request |
| **G2** an unknown attempt allowed a new key later | An attempt that is RESERVED, UNCERTAIN, or ACCEPTED without its run **quarantines** its kind for that session or day. Only an exact run-name match (`run-name: Stock scanner guard <key>`) or a definite 4xx refusal resolves it, never a time gap, a new key or time proximity. One "no matching run" alert after 30 min. | Codex's exact reproduction (UNCERTAIN, then +61 min) gives no `nightly:…:2`; an unrelated run 1 s later does not resolve; an exact match does; a killed runner stays quarantined across three later cycles with one alert |
| **G3** malformed inputs became `{}`, `[]` or "current" | Strict schemas: state version/attempts/alerts/log; run list needs `total_count`, valid statuses, ISO times, no future entries, `display_title`. Saved session must be a reviewed open session, not after the latest completed session, generated after it completed. Missing state (no branch) ≠ corrupt state; corrupt bytes are never replaced. | Five corrupt states, eight malformed lists, a 2099 session, a weekend session, generation before close: all give no dispatch; the corrupt remote commit is preserved |
| **G4** any non-empty invalid mode forced a daily | `FORCE` only for **empty** mode (legacy manual). Bash admission before any data: `''`, `daily` or `intraday` without a slot, or a slot matching its mode exactly; everything else exits before `scan.mjs`. | The actual `main.yml` expressions are evaluated (GitHub's case-insensitive `==`) and the actual admission is run in bash for 11 combinations including `dayly`, `DAILY`, `' daily'`, a mismatched slot and an injection-shaped slot |
| **G5** alert marked before an unchecked send | Alerts are delivery records: PENDING is published before the send. ACK needs HTTP 200 + `ok:true` + a positive `message_id`. 400/401/403/404/429 → RETRY (at most 3 sends, then REFUSED). Anything else is UNKNOWN and never resent; a crash leaves PENDING, also never resent. | Outcome table; PENDING/UNKNOWN never resent; RETRY bounded |
| **G6** unbounded successor chain and ambiguous 06:00 | See bounds below. **No dispatch at all** unless `scanner-guard-approval.json` holds a current horizon of at most 14 days, written only by a reviewed, owner-approved commit (the candidate ships none). | No approval / 29-day horizon / before the horizon: nothing; 00:59 UTC start allowed, 01:00 refused with one alert; successor daily cap |

**Bounds (revision 2; all require the owner's separate approval before any use):**
- **Approval horizon:** at most 14 days per approval file. Outside it the guard only reads, reconciles and reports.
- **Nightly:** dispatch **start** window 22:15–01:00 UTC. `main.yml` timeout is 300 min, so a guard nightly **completes by 06:00 UTC** at the latest, keeping 06:00–13:40 UTC free for Session A.
  - At most 2 non-refused starts per session; no start while an earlier one is unresolved.
  - Each start is one daily scan with the same provider calls as the scheduled one. Worst case per session: 1 scheduled + 2 guard daily scans.
- **Intraday:** at most 14 a day (each about 1–3 min of runner time and one intraday check's provider calls); none while one is unresolved.
- **Bot successor:** once per bot run, at most 6 per UTC day, only inside the horizon. The bot concurrency group holds at most one waiting run.
- **Aggregate over a horizon:** at most 14 × (2 + 14 + 6) = 308 dispatches.
- **Storage:** one small JSON file on its own branch. A commit is written only when state changes (no-op cycles write nothing), at most about 4 commits per dispatch or alert. History is pruned to 14 days (unresolved items kept), and the log is capped at 200 entries.
- **Completion, receipt and restoration gates** (for verification) are separate and unchanged: a dispatch is never evidence of execution. Each run is verified from its own log, run-name, P-code and P-def.

## 2b. Revision 3 (answers Codex 6761146322; supersedes the G6 bounds of §2a)

- **No self-renewing successor chain.** Bot-successor dispatch is removed. `bot.yml` only calls `node scanner-guard.mjs`. The guard runs while a bot run is alive, and its absence is reported, never covered by recovery.
- **One-day pilot.** `scanner-guard-approval.json` = `{ "pilotDay": "YYYY-MM-DD" }`. It must be a reviewed open NYSE session and be written only by a reviewed, owner-approved commit; the candidate ships none. Dispatching is possible only from 13:10 UTC that day to 01:00 UTC the next day.
- **Natural + assisted shared slots.** The 16 scheduled slots are 13:10, 13:40, …, 20:40 UTC, each with a window `[slot, slot+30 min)`.
  - The schedule has the first 20 minutes alone. The guard may assist **once per slot**, only if no `main.yml` run was created in the window and none is active.
  - Any non-guard run created in the window covers the slot (NATURAL).
  - A guard run is matched to **its own** slot by run-name, even if it is created late inside another window.
- **Maximum dispatches:** 16 intraday + **1 conditional nightly** = 17, all for the pilot day/session. There is no second nightly. If an executed nightly leaves signals stale, the guard sends an alert instead.
- **Nightly bounds:** start 22:15–01:00 UTC; completion bound 01:00 + 300 min = 06:00 UTC; the 06:00–13:40 UTC band stays clear.
- **Slot classification for verification** (`classifySlots`, pure): each slot is NATURAL, ASSISTED, UNKNOWN (unresolved attempt), MISSED (window ended with no run and no attempt: a scheduler gap, never a source defect and never a PASS) or OPEN.
  - A late natural event is counted where it actually arrived, never backdated.
  - This supports the 16-slot F2 enumeration directly. It does **not** change F2's criterion, and any relabelling (for example "SOURCE-VERIFIED / SCHEDULE-COVERAGE-UNVERIFIED") remains an owner decision.
- **Pilot cost bound:** at most 17 extra `main.yml` runs (each the same work as the scheduled run it replaces: about 1–3 min intraday, about 50 min nightly) and the matching provider calls. State is one JSON file on its own branch, with at most about 4 small commits per dispatch or alert and none on no-op cycles.
- **Regressions:**
  - shared slots: inside the grace nothing happens; at slot + 20 one assisted start; a natural run covers the slot; one per slot; the next slot is its own;
  - a late guard run does not make the next slot look natural;
  - one nightly only;
  - a non-session, holiday or 2099 pilot day is refused, and so is a day outside the pilot;
  - pilot-window edges.

  `test/scanner-guard.test.mjs` passes 13/13. Five revision-3 mutations and three revision-2 mutations re-run, each detected.

## 3. Bounded alternative release verification (protocol amendment; needs owner approval)

**Order:**
1. **Unit G first**, as its own small release:
   - Codex review, then one owner approval of G;
   - one source-only fast-forward push of the 5 paths in a weekday band (at or before 10:30 UTC, empty census);
   - hosted Tests receipt;
   - at most one inverse: restore the 5 paths.
2. **G baseline day (the next market day, old scanner code).** Read-only review of retained evidence:
   - every `main.yml` run, scheduled or guard-started, with its first log line (P-def/P-code);
   - `scanner-guard-state` branch commits (revision 2).

   This **replaces** the open-ended "complete latest day" wait with one specific day. It also records how often the **old code** fails, which is the baseline for the next step.

   G passes when, that day:
   - the nightly executes and completes;
   - executed intraday runs cover all three windows: open 09:40–11:00, mid 11:00–14:00 and late 14:00–15:50 NY;
   - at least 8 intraday runs execute.

   If G fails, nothing else proceeds and the disposition is reported.
3. **Session A for `d52499c4`** on the next feasible weekday, unchanged except that B's F2 rule is amended:

| Slot class | Meaning | Effect |
|---|---|---|
| EXECUTED-OK | a run (scheduled or guard-started) executed with P-def/P-code C′ and completed with its output | counts toward coverage |
| UNDELIVERED | no run was created for the slot, and the guard's log shows why it did not cover it | scheduler. **Never a PASS, never a C′ defect.** |
| EXECUTED-FAIL | a run with C′ failed or produced wrong output | **C′ defect**, unless the identical failure class occurred on old code on the G baseline day (then BASELINE, reported) |

**VERIFIED (F2) requires:**
- the nightly is EXECUTED-OK;
- EXECUTED-OK intraday runs in all three windows, with at least 8 in total;
- zero C′ EXECUTED-FAIL.

Everything else in `d2f76b64` is unchanged: F1, F3–F6, P-code, P-def, complete logs, the 20-hour B bound, one inverse, and no backdating.

**What it costs.** Owner involvement:
1. approve unit G;
2. ask for G's push session;
3. approve this F2 amendment;
4. ask for Session A as already approved.

Earliest realistic sequence: G review → G push morning → one baseline market day → A the following weekday morning. That is about 3 weekdays after G's approval, with no indefinite wait.

**If G is not approved.** The only fallback is a separately approved, one-off owner dispatch of the missing nightly. A manual dispatch is a forced daily scan, which is harmless only when that session's scan is actually missing. Intraday coverage would stay at GitHub's mercy, and the original all-16 F2 would remain unattainable.
