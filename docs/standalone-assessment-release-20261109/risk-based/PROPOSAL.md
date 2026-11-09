# One bounded release protocol — no date, no execution authorization

**Monday9November attempt CLOSED/DEFERRED, no operational action.** All source, binding, composition, inverse and full-validation PASS results remain preserved. This proposal supersedes the dated operating arrangements for future approval purposes; they remain historical records, not an executable fallback.

Exact unchanged unit: **d52499c454d2cdf472993e696d3a2ba8f4f77ef3**,28-path binding SHA256 **1a799a15b06ce6e36c466a37702ba72830552fc9972d8ebd3a96311425da2dd4**, independent source/composition PASS **6737313043**. No feature, source safeguard, verification criterion or inverse is removed. No date is proposed.

## 1. What risk requires which attendance

This code places no orders, but it can influence manual orders. A wrong BUY/SELL/stop message or missed alert can have material financial consequences. Broker-stop placement/adequacy is not established and is not a premise of this proposal. Watcher warnings are useful evidence, not guaranteed outage protection: bot/network or notification failure can also prevent them.

| Work | Attendance actually required | Reason |
|---|---|---|
| Existing source review, tests, composition and inverse proofs | Retained PASS evidence; no replay by default | They concern pinned immutable source. Drift requires only the affected reconciliation/re-review. |
| Prepare a fresh source-only build/current-state evidence | Operator can prepare read-only/local evidence | Preparation makes no production change. |
| Final pre-write verification and every source push/inverse | Current operator **and independent verifier** | Outward writes require verified remote/writer state, exact source/data preservation and a live failure path. |
| Initial complete hosted Tests receipt and immediate initial recovery | Same active paired session | Detects failed initial validation while the pair can still make the one safe inverse. |
| Ordinary scanner/watcher/calendar/nightly jobs running for hours | No continuously watching pair | Complete logs, actual checkout/workflow definitions and committed outputs can prove what occurred retrospectively. Watching does not itself create that proof. |
| Read-only review of those retained results | Independent verifier can work alone; operator can answer asynchronously | No write is made. Complete evidence, timestamps, coverage and result requirements remain mandatory. |
| A later corrective inverse, if independently justified | A new **currently attended paired** recovery session | A production write must not be performed by an absent operator/verifier or from unverified remote state. |
| Post-inverse restoration evidence | Independent read-only review, not a continuous pair | Old-source witnesses and complete logs can be inspected after the ordinary jobs end. No further write is included. |

A lack of live watching is **not** proof of safety or a promise of fast response. The residual exposure and prospective human-deadline amendments below are essential parts of this proposal.

## 2. Session A: one bounded live write/Tests session

Reserve **165minutes maximum**, beginning only when Claude and Codex are actually present with working read/log/post access. This is their active turn, not an owner obligation to keep two chats awake. If either cannot maintain that active session, no initial write starts. No promised wake-up or future attendance substitutes for this check.

Let T be that actual session start. Readiness and the only forward push must finish **by T+20minutes**. Readiness: fresh main;0bound drift; source-only C′;28/0 verification and existing required local inventory; current running/queued census and writer/definition compatibility; preserve all intervening data/newer code. At most one rebuild inside that same cutoff. If not ready, end/defer **before a write**, with no automatic replacement date.

### Mandatory timing band for every source write

Every forward push and every inverse, whether in A or a later recovery session, must occur **at least 30 minutes before the next scheduled trigger of `main.yml`, `ignition.yml` or `calendar.yml` under either the installed or proposed/restored definition**. Immediately before each write, a fresh census must show **no queued or running job of any of those three workflows**. Both conditions are required; a quiet census alone is insufficient. A run using an old workflow definition with new checked-out source is MIXED; an observing MIXED watcher is FAILED, not accepted as C′ evidence.

The pinned definitions have these UTC triggers:

| Workflow | Triggers under either definition |
|---|---|
| `main.yml` | Weekdays 13:10, 13:40, then every half hour through 20:40 (16 intraday triggers), plus 21:30 nightly |
| `ignition.yml` | Weekdays old 12:45 / 13:45 and new 13:10 / 14:10; include opposite-season triggers even when expected to no-op |
| `calendar.yml` | Weekdays 20:45; Sunday 05:30 |

For A, the worst-case inverse is P+85 ≤ T+105. It must still precede the next trigger by 30 minutes, so **T ≤ next trigger − 135 minutes**. With the pinned weekday definitions, the first trigger under either definition is 12:45 UTC: **T ≤ 10:30 UTC**, and T must be after the prior nightly run and all other queued/running jobs of these three workflows have completed. Apply the same conservative T ≤ next trigger − 135 minutes admission band to a later paired recovery session, then recheck the 30-minute write margin and empty census immediately before its inverse. On weekends calculate the next trigger from the union above, including Sunday calendar; do not reuse the weekday cutoff blindly.

This band is arithmetically feasible, not a claim that a particular session is available. If a prior job has not finished by the admission cutoff, either role/access is unavailable, or a fresh census/timing check fails, **the session is infeasible and no write starts**. If a required inverse becomes unsafe after the forward push, do not bypass the band, cancel a job or change a deadline: remain UNVERIFIED and report the unmet recovery condition. No date is nominated.

For actual forward push P:

- Hosted Tests must start≤P+30minutes; complete independent receipt≤job start+25, hence≤P+55.
- If initial validation fails, current remote/writer state and the verified inverse must be established. At most one safe inverse,≤known failure D+30; its Tests must start≤inverse+30 and full receipt≤start+25. Worst case D=P+55 gives inverse Tests≤P+140≤T+160.
- Five minutes remain for the final status. Session A may end earlier only after all its required checks reach a terminal result. This is why a blanket90-minute reservation is insufficient.
- Before any write, both roles reconfirm current presence and access. Unknown publication, incompatible drift or missing proof means no blind retry or inverse. If access is lost after the push and safe recovery cannot be verified, the unit remains UNVERIFIED; no guaranteed autonomous rescue is claimed.
- After successful initial Tests the status is **DEPLOYED—OPERATIONAL VERIFICATION PENDING**, not operational READY/VERIFIED. No other release, policy activation, encryption migration or Enable is bundled in.

All existing job runtime limits, source quote-age/boundary checks, ZAD/entry/exit rules and warning behavior stay unchanged. One forward source-only fast-forward; at most one inverse total; no force push, cancellation, dispatch, pause, probe, retention/settings/key change or new automation.

## 3. Independent retained-evidence review B

Before A, identify the first eligible ordinary daily cycle and a feasible later review window. No date is nominated until the protocol and evidence/access prerequisites pass independent review. Bookings are intent, not a future availability guarantee; the reviewer must be currently present when the review actually begins.

B is a **read-only independent review**, budget≤90minutes. It occurs after the selected cycle's final expected output/cutoff and must **finish within20hours of the earliest mandatory F2–F6 job completing**, and before any actual evidence expiry with at least a two-hour retrieval margin. Include weekends: “next weekday” is not a valid retention guarantee. If no such interval fits, do not start A under this arrangement. If the planned B does not happen or evidence cannot be read, no verification PASS is given and the delay/breach is recorded; no date or clock silently rolls forward.

Review every required component, not merely samples:

- actual workflow/event definition and actual checked-out code, qualifying data-only descendants and relevant unchanged source dependencies; C′ is the actual fresh build, not the historical candidate ancestor;
- **F2: every one of the selected weekday cycle's 16 scheduled `main.yml` intraday runs**, from 13:10 through 20:40 UTC, each with P-def, P-code, full completion/output/error evidence and immutable publication identities; also the selected nightly run. Enumerate all 16 expected trigger slots and reconcile each to its actual run/job or explicit missing/failed result. Do not substitute only the first successful intraday run, omit a later failure, or treat a queued/cancelled/missing run as complete;
- winter watcher admissions, actual heartbeat coverage/denominators, gaps, end and publication. A no-op or partial watch is not complete market coverage;
- fresh guard adoption provenance; state version alone is not proof of all guard functions;
- newly generated calendar result/status and available output evidence;
- natural bot-loop adoption only when actually provable; otherwise explicitly UNKNOWN.

Use **complete** hosted logs, per-run archives/artifacts and immutable Git blobs at identified publication commits. Mutable `ignition-live.json`/status/guard state at current head alone is insufficient. Record event/run/job/checkout/publication identities and original source/run clocks. Redact private content from public receipts; do not duplicate private holdings/messages into public review files.

Evidence feasibility is supported by actual read-only retrieval: historical scanner, calendar and watcher complete logs were fetched; watcher artifacts explicitly expire seven days after creation. This does **not** establish90-day effective repository retention or guarantee future retrieval. Use actual artifact expiry, conservative log age and live retrieval capability. Existing artifacts and existing hosted logs only; no workflow edit or new archive automation is proposed. Missing/expired/truncated evidence stays UNVERIFIED.

The bot redirects/truncates its loop log and pulls source between iterations; checkout/head alone may not prove its later code. Do not invent that missing witness. Preserve the previously reviewed qualified result label when optional bot/guard adoption is UNKNOWN; never claim the entire system is verified.

## 4. Explicit prospective change to HUMAN receipt/response timing

**This is a new proposal requiring explicit approval, not a claim that old deadlines were met.** The former human F2–F6/R2–R6 receipt-posting appointments (+15minutes, fixed calendar/nightly/guard appointments) and between-session immediate recovery promise are replaced prospectively by the finite retained-evidence review arrangement above. Initial forward/inverse Tests retain their live+25receipt rule.

Runtime timeouts and expected market observation windows are unchanged. Their actual success/failure, lateness, source gaps and output publication timestamps are assessed honestly from original records. A historically failed/missing/late job or coverage check remains failed; retrospective review cannot make it timely.

Always preserve separately: fault/event time when known, original missed target, earliest known fault/owner report, discovery, review decision and action. **No reset or backdating.** A next-day receipt is explicitly retrospective. A late conditional remedy must never be described as meeting the former report+30rule.

If B establishes a qualifying regression caused by C′, a **currently paired recovery session** may use the one reviewed source-only inverse, if it has not already been used, under the new prospectively approved response arrangement. Prepare and independently verify the exact current-state inverse first. Its live decision/push/hosted Tests envelope remains≤85minutes; reserve90minutes. The new remedy window is not an assertion that the old failure clock was satisfied. If only a scheduler/provider/evidence outage is established, do not infer a source regression or blindly restore older known defects; record FAILED/UNKNOWN and a concrete disposition. Any write outside the exact inverse requires separate review/approval.

That recovery session must also satisfy §2's timing band and empty-job census; its 90-minute reservation does not waive either. Before A, identify a feasible B window and conditional recovery admission opportunity together. If B cannot finish within its 20-hour/expiry bounds or a conditional paired recovery opportunity cannot fit the write band, the proposed arrangement is infeasible for that cycle: do not begin A. Later attendance is still unconfirmed until actually established. A missed opportunity is disclosed, not silently rolled to another date; no immediate response outside the band is promised.

An owner fault/STOP report between sessions is recorded at its actual timestamp and blocks further release progression when received. **No immediate acknowledgement, reversal or24-hour service is promised outside an active paired turn.** When attended, assess the evidence and disposition; if required access/roles are unavailable, stay UNVERIFIED. Owner urgency/reporting does not authorize an unattended action or a new deadline.

## 5. Restoration review C, only if an inverse was used

Date each required restored component once to its next eligible ordinary cycle, with finite expected start/coverage boundaries; do not keep rolling to a later “first restored run.” Original restored source,355-minute watcher timeout/13:45cron, absent new admission step, old calendar semantics and actual restored test inventory apply. R-A remains expressly disclosed.

The independent reviewer checks **all** required restoration receipts from retained complete evidence under the same age/expiry bounds as B. Budget≤60minutes; no paired operator or further write is needed merely to read and report. Restoration remains **REVERSED—UNVERIFIED** until every required gate passes. A failed/missing receipt does not authorize a second inverse, corrective forward push or manufactured probe.

**R2 includes every one of the restored cycle's 16 scheduled `main.yml` intraday runs, 13:10–20:40 UTC, and the selected nightly run**, with restored P-def, P-code, complete logs, completion/output/error evidence and publication identities for each. Enumerate missing/failed slots as such; no first-run-only or successful-run-only substitution. The B/C review budgets are work limits, not permission to sample or waive failures. If complete review cannot finish within its budget and evidence deadline, publish the incomplete receipt and remain UNVERIFIED; do not silently extend the deadline.

## 6. Explicit residual risks

- Wrong or stale actionable messages, missed alerts and lost market observations can occur before B and influence manual trades. Missed historical coverage cannot be recovered by rollback. No reliance on broker stops or guaranteed notification delivery is made.
- The intended review window limits the planned delay, **not the physical lifetime of a deployed defect**. If no review/session/access occurs, C′ can remain active longer; there is no unattended rollback or enforcement. Any demand for a guaranteed maximum response/exposure interval needs separately established staffed coverage or separately approved automation. Neither is assumed here.
- An inverse preserves data but does not recall sent messages or terminate in-flight C′ processes. Restored source can bring back known older limitations, including the R-A calendar-unit residual. Restoration needs its own evidence.
- Host scheduling, artifact upload/retention, GitHub access and ephemeral session survival can fail. No source write when their required current proofs are unavailable. Missing evidence is never PASS.
- Existing public copies/derived outputs remain the separate R1 data-protection issue. This protocol does not remove them or declare licence/custody clearance.

These are prospective owner decisions in the **one protocol approval**, not acceptance inferred from urgency, silence, U1–U4 or today's closed attempt.

## 7. Owner involvement and unit choice

Owner involvement: **one written approval** of exact unit/protocol, explicit delayed-review/response risks, R-A and existing$0control; then a short request to start A when both agents are actually present, and a later request for B in its pre-agreed evidence window. If an inverse occurs, one further request for C may be needed. The owner need not remain for the agents' work, keep chats alive for16–39hours, or serve as an independent verifier. This is not a promise agents self-start later: no unattended start or guaranteed notification is included.

If a known fault arrives outside a session and prompt response is important, the owner may request a live paired recovery review; its availability is not promised. The approved timing/exposure limitation must be understood before deployment. No new technical setup, accounts, keys or workflow automation is requested.

Keep **the single reviewed28-path combined unit**. The standalone27-path source PASS is preserved, but separating watcher/calendar/scanner/assessment ownership would require newly verified intermediate definitions/imports/data readers and separate inverses/activation cycles. It would not remove the natural-cycle evidence or overnight message risk and would add writes. No split unit is declared deployment-ready by inference. No feature or safeguard is discarded or parked by this sequencing.

**Review status: Claude's independent review 6739680243 passed all other provisions of f383cdaaa and required the two corrections now explicit above: the every-write timing band/census and all-16-run F2/R2 scope. This exact revision is returned for focused acceptance; not owner approval-ready until that verdict is attached. All source reviews remain closed. No date proposed; no operational action authorized.**
