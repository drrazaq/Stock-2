# Independent guard rev3 review — CORRECTIONS REQUIRED
Exact source: 5e12a654d2ba656e99743d1e918738bd2e6fedb6. Handoff: PR1 comment6761791919.
Review only. No source fix, workflow action, live dispatch/probe, state-branch write, acquisition or production change was performed. Completed packages and validation in6762654742 are untouched.

## Carried evidence and review boundary
Reviewed the exact core, runner, two workflows, tests and proposal. Preserve Claude's13/13 and real-Git/mutation receipts; they do not cover the counterexamples below. Executed unmodified core and runner logic in V8 with explicit JSON-clone/in-memory Git/filesystem/transport adapters. This is NOT a Node/real-Git/live endpoint receipt. See reproductions.json. Initial adapter whitespace/structuredClone limitations were corrected; they were harness issues, not product defects.
Initial reservation publication is now remote and non-force, and unreadable/unconfirmed publication blocks a request. Network-loss/5xx attempts remain quarantined, exact-name reconciliation and durable alert PENDING are material improvements. These do not clear the remaining publication race.

## Required corrections
### R1 — stale-state fast-forward can erase another writer's durable intent
runner L56–57: after publish confirms its own commit, step assigns tip=remoteTip().tip without loading that commit's state.
Actual-runner adapter interleaving: our reservation confirmed; another writer publishes alert PENDING; the second tip read adopts that parent; our outcome commit carries stale JSON and fast-forwards over it; PENDING disappears; the runner sends the same alert and records tries1.
Correction: publish returns its confirmed commit SHA and step keeps that exact parent. A changed tip must reject/stop or be loaded and recomputed. Never adopt an unrelated parent with stale state.
Required real-Git test: two-clone barrier between publish's confirmation and step's second read, plus concurrent outcome/alert commits and ambiguous push-readback. Assert no lost intent and no request from stale authority.

### R2 — natural and assisted executions still have no shared admission
main.yml L42–48 validates strings, then runs scan.mjs. A late natural event after an assist executes too; concurrency only serializes it. A run-list check before reservation is not an execution lock.
Correction: both paths claim/check one reviewed semantic execution slot before provider work. Define actual-start expiry and daily versus intraday identity. GitHub's cron expression does not identify a delayed event's original occurrence; do not backdate an assumed slot.
Test both arrival orders, creation between list-read and POST, delayed queued jobs, cross-window arrivals, and a late natural daily event during an intraday window. Failed admission is not executed coverage.

### R3 — refused requests bypass caps and an intraday retry corrupts its own state
core L160/176 excludes every REFUSED attempt from cap accounting; reserveAttempt L202 appends without duplicate-key refusal.
Actual core:18 consecutive403 nightly requests produce nightly:...:18 despite maxDispatches17. Intraday403 re-offers the same1310 key; reserving it creates duplicate keys that validateState then rejects. nightlyGapMin is referenced but undefined.
Correction: explicitly cap ALL request attempts and distinguish accepted starts/provider work. Preserve refused evidence, validate before publication and prevent duplicate keys; any retry policy must fit the approved finite budget. No implicit extra nightly requests.
Test repeated4xx across cycles, same-slot refusal and state validity, exhausted request/start budgets, and restart without reset.

### R4 — incomplete/incorrect evidence can masquerade as production slot coverage
runner L44 fetches one unfiltered30-row page. validateRuns L57–59 accepts total_count100 with zero rows and drops branch/workflow/conclusion identity. A four-minute-future development run was accepted and suppressed the current assist as NATURAL. State accepts arbitrary scope/key and runId0.
Slot NATURAL/ASSISTED currently means creation/matching only, including manual, failed or cancelled runs; it does not prove intraday execution, loaded code, save or delivery. MISSED cannot by itself prove scheduler causation or rule out an introduced workflow defect.
Correction: bounded complete coverage of the relevant production branch/time interval and active jobs, explicit pagination/completeness provenance, positive run IDs and coherent keyed state. Preserve UNKNOWN for future, truncated or unclassified data. Separate invocation observed, admitted, executed, saved and delivered; F2 still requires its own complete receipts/P-code/P-def.
Official API facts: https://docs.github.com/en/rest/actions/workflow-runs documents branch/status/created filters and pagination (per_page max100). A single30-row response is not proof of absence.

### R5 — time bounds are checked at decision time, not at POST or actual job start
Actual runner: decide00:59:59; reserve publication advances to01:00:01; a nightly POST is still made after the stated01:00 cutoff. No predicate is rechecked at dispatch.
Even an on-time POST can queue; the300min job timeout does not bound dispatch-to-start delay, so completion by06:00 is unproved. Main admission does not enforce the pilot horizon or slot expiry at actual job start.
Correction: recheck approval/slot at every actual outward attempt; record definite local non-send when expired. Enforce actual-start admission and a finite queue/receipt decision. Separate start, completion and complete-receipt deadlines.06:00 remains a proposed protocol amendment, not the approved02:45 bound.
Git execFileSync network operations also have no timeouts; bound them and the total guard cycle without treating an ambiguous push as definitely absent.

### R6 — producer-clock semantics and total pilot costs remain mismatched
latestCompletedSession includes close+60min; validateSignals reuses it for generation validity. A legitimate21:30 generation after the21:00 cash close is rejected as generated before completion. The actual daily producer's generatedAt is ENTRY time, not publication/completion. Invalid2099 signals still permit an intraday dispatch despite the strict whole-decision-fail-closed claim.
Correction: distinguish due/grace policy, source session completed, generation entry and actual publication. State which inputs are required per mode; malformed required evidence cannot become a valid assessment start or coverage proof.
The17 extra-run statement is not a bound on total natural+assisted executions, all requests, guard polling, Git writes, alerts or worst-case provider work. Source remains active for reconciliation/alerts outside the pilot; Git parent history is retained, not pruned by filtering JSON.
Pin finite request, runtime, storage, alert and recovery limits including refusals and delays. Call14days JSON retention what it is; do not add history rewriting/deletion. Preserve bot-absence gaps as uncovered.

## Scope clarifications
The observed generic HTTP408=>REFUSED classification is not, by itself, a proven replay defect. RFC9110 says a408 denotes an incomplete request. After checking that authoritative meaning I am NOT counting it as a separate blocker. Pin documented service error outcomes; transport exceptions/5xx already remain uncertain.
https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.9

G touches bot.yml, now stage2-bound. It must be composed with the corrected successor's save merge and re-reviewed; replacing that workflow wholesale would lose the necessary fix. Keep guard activation and approval-file/state-branch creation separate.
Original all16 F2/deadlines remain unchanged. Latest-complete-day, alternative verification labels and8-run substitution are unapproved proposals. Do not publish a feasible release date from this guard.

## Final-package coordination
Claude6762783851: Stage1 211cf164 SOURCE/RECOVERY PASS; preserve its148-file receipt and all closed earlier reviews. Stage2 6440e576 has B1: dayless UNKNOWN survives reset and suppresses later days. Same-day no-replay must remain, while next-day independent evaluation must be allowed. A reader reset alone is insufficient if merge reimports older delivery.
Preferred minimal correction upgrades the helper only in stage2, filters delivery by each side's matching merged day, and day-resets the reader after validating original shape. Stage1 remains immutable; stage2 moves helper from dependency to write. Actual nightly reset/save/next-day-reader tests must cover both orders and the same-day control.
Claude6762790811 operating proposal needs:3h reservation (20+55+85=160min); non-vacuous runtime evidence; late-phase gate proof separated from normal premarket output/delivery; actual ACK/private receipt evidence. Natural bot adoption needs a finite deadline, explicit ADOPTION-PENDING risk acceptance and exact workflow-blob proof; queue delay is not bounded by two350min job timeouts. Bot disable is not the default because it also removes watcher guard/replies. No operational acceptance or future attendance is implied.
