# 2 Nov 2026: MORNING ACTIONS defects and watcher-coverage evidence (independent, read-only)

**Reviewer:** Claude. Code: main `scan.mjs` @ `a8bc23e` era (line numbers from main on 2 Nov). Codex owns implementation; nothing here is an edit. **No holdings, symbols or message text are reproduced.** The owner's private message was not available to this reviewer, so each item is traced to the code path that produces it.

## A. MORNING ACTIONS: five defects

| # | Defect | Where | Cause | Suggested direction (Codex decides) |
|---|---|---|---|---|
| A1 | **Two sell times.** The SELL header says "at the open after the first 15 minutes, 5:45 pm Kuwait, unless the line says otherwise"; the lines say "SELL at the next open" (5:30 pm). | `actionsText` (≈2552) uses `K(585)`; `eventSell` (≈49) and verdict lines (≈1651, 2174) say "at the next open". | The header policy and the line wording come from different sources, and every line "says otherwise", so the owner gets two times. | One time per line, taken from the rule's tested exit. Squad 29, leader dip and try small were tested at the next open. No generic override in the header. |
| A2 | **An earlier overdue SELL becomes HOLD without explanation.** | `holdingsText` `mark()` (≈2295) overwrites `lastAct`; `unresolvedSells` (≈2346) only sees the current act. | SELL advice is not latched. A later HOLD replaces "SELL since …" silently. **Leader dip:** if the daily-price fetch fails (`loadDaily` returns null, ≈1762), the target/time-exit reasons vanish unless the nightly `exitFlag` exists. Danger-filing windows (60/90 days) and trend verdicts can also expire. | Keep a withdrawn SELL visible for one message with its reason ("SELL withdrawn: …"). Treat missing price data as UNKNOWN, never as HOLD. |
| A3a | **The focus-off hint invites unproven BUYs.** "ENGINE BUYS PAUSED … focus off shows them as buys." | `actionsText` (≈2604) | With focus off, unproven engine kinds appear as BUY lines in TODAY'S ACTIONS. The handbook allows plain BUYs only for the owner's explicit lanes. | Drop the hint, or keep unproven engine picks under NOT ACTIONABLE / PAPER even when focus is off. |
| A3b | **Unsupported claims in the RESEARCH line.** "LEADERS provisionally promising" and "insider buying works in rising markets (…)". | `actionsText` (≈2634) | `leaders-study.json`: `verdict` **NOT PROVEN** (profit factor 1.11, under 1.2); only `liveVerdict` is shown. `smart-money-study.json`: `verdict` **NOT PROVEN**; "works" is printed from a rising-markets subset with positive averages, with no gates. | Print the frozen verdict first ("NOT PROVEN"). Never use "works" for a subset average. |
| A4 | **Two populations for the record without saying so:** a percentage over 8 sales and cash over 6 sales. | `ladder()` (≈1488) counts every `my-trades.jsonl` row with `pct`. Cash goals exclude sales with an unknown share count (≈3353). | The percentage and dollar figures cover different sales, unlabelled. | Label both ("8 sales with prices; 6 with share counts, 2 excluded until you confirm the quantity"), or show the same population. |
| A5 | **A leader-dip pick waits for its ZAD mark while the lane says "no buy today".** | `ldipLines` (≈ MARK HALAL FIRST branch) and the `actionsText` lane summary | Unmarked picks go to MARK HALAL FIRST, and the summary counts only BUY lines. The signal is valid only for the next open (no late entries). Unmarked picks are also not written by `ldipOfferLog`. | Summary: "1 signal waiting for your ZAD mark (valid for this open only)". Log blocked offers as blocked. |

**Delivery marker:** `st.brief = n.d` is written after `telegram()` whether or not the send succeeded (`telegram()` does not return success; ≈1921). `tg-state.json` showing `brief: 2026-11-02` is **not** proof of delivery. Today's delivery is established by the owner's copy, not by the system record.

## B. 30 Oct historical warning versus 2 Nov coverage

**30 Oct, historical (health.json written 1 Nov 06:11 UTC):**
- The health warning says full-session coverage was **NOT ESTABLISHED**: 1 of 331 configured minutes had retained heartbeat proof, the first retained observation was at 15:00 New York, and 3 duplicate summaries were excluded.
- **The ignition-days summary differs from that retained proof:**
  - a watcher process started at 09:14 (started by the guard; GitHub's scheduled start was late);
  - first minute 09:28, 327 minutes;
  - EDGAR feed 136 polls, 0 failures, first good poll 09:28, median latency 94 s;
  - feed `FULL_SNAPSHOT_PLUS_ALPACA_LIVE`, live rate 0.45.
  - A **second process started at 15:00** with 1 minute and 0 EDGAR polls.
- So the watcher most likely ran all session, but the retained heartbeat archive does not prove it. That is a persistence/archive gap, not proof of an outage. The 15:00 second start needs explaining: a re-dispatch or second schedule.

**Defects that held across 28–30 Oct:**
- **The per-candidate SEC check failed** for 30 / 93, 29 / 133 and **52 / 124** candidates on 28, 29 and 30 Oct ("SEC check failed (blocked until it works)"), while the EDGAR feed reported 0 failures. Two different SEC paths: the blocking one is failing for about 40% of candidates. Fail-closed is correct, but the cause is unresolved.
- **`opp-days.jsonl` has two rows per day** (28, 29 and 30 Oct). The second is the 15:00 process ("after 11:30" for every lead). A daily scorecard that sums rows double-counts detection.
- **Delivery 30 Oct:** 0 early alerts delivered, 0 send failures (none eligible to send).

**2 Nov, today:** **no coverage evidence exists yet**; the market opens at 14:30 UTC.
- `watcher-guard.json` is still dated 1 Nov, and the latest `watcher-starts.jsonl` entry is 30 Oct.
- No 2 Nov `ignition-days`, `shadow/2026-11-02.jsonl.gz` or `opp-days` entries exist yet.
- These can be checked after the session starts. The scheduled 16:30 UTC passive check (unchanged) covers premarket and watcher runs; it should also read: the watcher start time and its starter (schedule vs guard), the EDGAR poll and failure counts, the per-candidate SEC-failure count, heartbeat minutes retained, the shadow archive, the opp-days row count, and delivery counts.
- **A successful job alone is not counted as coverage.**

**Note for that check:** its item "Tests on main still green" will read red. Main's CI fails only the accepted expired TRY SMALL fixture (cases 1 and 3b), which is not a new failure.
