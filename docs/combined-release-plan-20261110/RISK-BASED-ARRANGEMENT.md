# Combined release: risk-based verification arrangement (PROPOSAL for Codex review; no date, nothing authorized)

**Today's attempt (Monday 9 November) is CLOSED.** No push, cancellation, dispatch or workflow action was taken. The plans `ce533a34` and `c714d425` are superseded.

The following PASS results stay closed, unchanged:
- candidate `d52499c4`;
- binding `1a799a15` (28 paths);
- composition and inverse checks (6737313043);
- both single full test runs.

## 1. What the risk actually is

The release changes what the bot **says**, when the watcher **runs**, and how the calendar **labels figures**. It places no orders, and no buy/sell rule, stop or ZAD rule changes. The owner trades by hand, and stops sit at the broker.

The realistic failure modes, and who would see them:

| Component | Realistic failure | Who notices without us | Harm until reversed |
|---|---|---|---|
| Tests (push) | A file fails on hosted CI | Visible immediately | Broken code would be live on main; a reversal is wanted within minutes |
| Watcher / guard | Doesn't start, or stops early | **Owner:** the system's own WATCHER NOT STARTED / DOWN / STOPPED EARLY Telegram alerts | Missed intraday research alerts; nothing traded automatically |
| Intraday open check | Wrong held-stock line | Owner reads it; holdings show UNKNOWN rather than a false HOLD when prices are stale | Possibly misleading text; broker stops are unaffected |
| Assessment cards | Wrong or odd card text | Owner | Information only |
| Calendar | Wrong figures or labels | Owner | Information only |
| Nightly scan | Crash or no ACTIONS message | Owner (missing message; the health line) | One night's message |

**Conclusion:**
- Only the **push** and its **Tests result** carry a risk that needs a response within minutes. A failed hosted Tests run means a defective commit sits on main, and it should be reversed at once.
- Everything else is message-level risk over hours, with no money moved automatically, and the system already reports watcher failures to the owner directly.
- Requiring live paired attendance for 16–39 hours buys almost no extra safety over reviewing the retained evidence the next day.

## 2. Which checks genuinely need paired live attendance, and why

| Check | Live paired? | Why |
|---|---|---|
| Fresh-main census, build `C'`, verify 28/0, local inventory | **Yes (operator live; verifier live)** | It immediately precedes an outward write. The verifier confirms `C'` before the push. |
| The forward push | **Yes** | The only outward write. |
| F1: hosted Tests on `C'` (actual start ≤ push + 30; receipt ≤ start + 25) | **Yes** | A failure means broken code on main, so it must be reversed within minutes. |
| A reversal write, and its Tests receipt (D + 85) | **Yes** | An outward write with the same risk. |
| F2: intraday scanner, F3: watcher, F4: guard adoption, F5: calendar, F6: nightly | **No: retained evidence** | All the proof is retained: job logs (kept 90 days), each run's `head_sha` (P-def), the checkout SHA in the log (P-code), data commits (`ignition-live.json`, `watcher-guard.json`, `calendar-status.json`) and delivered messages. Each job's hard cutoff is still enforced: the evidence must show the job started and finished inside its bound. The cutoff is checked **afterwards**; nobody has to watch it pass. |
| R2–R6 restoration witnesses | **No: retained evidence** | The same reasoning. Restoration allows no further write in any case. |

## 3. Proposed arrangement: two short attended sessions, plus one conditional one

**Session A: push (about 90 minutes; operator + verifier live; owner reachable but not required)**

**When:** it starts **at least 30 minutes after the previous nightly scan job has completed**, and the push happens **at least 30 minutes before the next scheduled `ignition.yml` cron**. A fresh running/queued census at the push decides; MIXED runs are handled as in `ce533a34` §1. Example only, not a proposed date: 07:00–08:30 UTC (10:00–11:30 Kuwait) on a weekday.

Steps, in order:
1. Readiness: fresh `M0` with 0 drift; build `C'`; `verify-unit` 28/0; full local inventory; census.
2. Codex "present now".
3. One fast-forward push, no force.
4. F1, with its complete hosted log.
5. If F1 fails: reversal `R` and its Tests receipt (D + 85) **inside session A**. Session A runs until F1 passes, or until R1 passes or fails.

**Session B: review (about 2 hours; operator + verifier live)**

**When:** the next weekday, after that cycle's nightly scan has completed. Example: about 07:00 UTC (10:00 Kuwait), the morning after.

1. Review F2–F6 from retained evidence against the **original** hard cutoffs (calendar 21:20; nightly 02:45; guard 20:15; no extensions).
2. Assign exactly one label: VERIFIED-COMPLETE, VERIFIED-CORE (with the UNKNOWN items named), FAILED, or UNVERIFIED.
3. If FAILED: one reversal `R`, with D = the observation time in session B and its Tests receipt within D + 85, **inside session B**.

**Session C (only after a reversal): restoration review (about 1 hour; no write)**

**When:** the next weekday morning after the restored code's first full daily cycle.

1. Review R2–R6 from retained evidence: the old watcher's 13:45 run with its 355 + 15 bound, no admission step; the calendar written without `officialSources`; a fresh old-format start line.
2. Label RESTORED or UNVERIFIED, and report. No further write.

**Owner involvement**, in total:
- approve once;
- open sessions A and B (and C if needed), about 3.5–4.5 hours over 2–3 days, at times the owner picks;
- optionally, between sessions, send "STOP RELEASE" if a message looks wrong. That makes the next attended session start with the reversal decision (D = that session's observation time). No one is expected to answer it unattended.

## 4. Explicit residual risks (to be accepted by the owner)

1. **Exposure window.** A defect in F2–F6 that appears after session A is not reversed until session B, roughly 20–24 hours later at worst. The bot could show wrong or odd text during that time, including during one market session. Mitigations:
   - the owner's broker stops are unaffected;
   - nothing trades automatically;
   - the watcher's own failure alerts reach the owner;
   - the repaired open check shows UNKNOWN rather than a false HOLD when a price is stale.
2. **Bot-loop adoption is not bounded.** The guard and bot-loop scanner may remain UNKNOWN. They are reported as such, never claimed.
3. **R-A (after a reversal only).** The old calendar may show some figures without units until a successful TipRanks refresh, or until every affected event is more than 3 days past.
4. **No automatic action between sessions.** If the owner sends STOP, the reversal waits for the next session the owner opens.

## 5. Independently deployable units: considered, not recommended now

Splitting is possible in principle. For example, unit 1 would carry the watcher, guard and schedule files plus `ignition.yml`, and unit 2 the `scan.mjs` repairs, assessment cards and calendar. But:
- composition, binding and inverse are verified **only for the 28-path unit**;
- each split unit would need its own binding, inverse, cross-unit test runs, and rollback compatibility between versions;
- that means two release cycles, and therefore **more** owner sessions, not fewer.

The watcher change, the main timing-sensitive part, is already covered by rollback-compatibility tests (R-B closed). Splitting would reduce no risk that §3 leaves open. Recommendation: keep the single verified unit.

## 6. What stays unchanged

All of the following are kept:
- the source-only fast-forward push, at most one reversal, and data preservation;
- P-code / P-def / complete-log evidence, and the MIXED-run rule;
- the original hard cutoffs;
- the exclusive final labels;
- no dispatch, pause, probe, workflow edit or extension;
- R-A and $0 confirmation by the owner.

No date is proposed. Once Codex accepts this arrangement, the owner picks when to open session A.
