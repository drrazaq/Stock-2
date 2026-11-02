# November 2 watcher incident — bounded review package

**Inactive development preparation. No deployment, workflow installation, dispatch, cancellation, credential use, provider call or real message.** Synthetic tests use local services. Original evidence and frozen results are preserved. This operational correction is not evidence of profitable trading, full-session readiness or broad-universe real-time surveillance.

## Final evidence: two independent runs

The supplied `47a7486` resolves to **47a74865b09fef65cfac0f7ae9585adfdad2a002**, the first watcher's publication commit, not a separate reviewer report. The second publication is **df0c963819abd375f0b98e5aea596c78dc6f60a0**. [Original blob identities and independently counted slots](historical-evidence.json) preserve each run's JSON, progress and shadow archive separately. Completed raw logs and original bytes are also retained locally with private permissions; raw logs are not republished.

| Evidence | First run41456912382 | Second run41463855119 |
|---|---|---|
| Job |125315804349|125505682516|
| Terminal outcome |SUCCESS|SUCCESS|
| Run creation (UTC) |13:53:37|14:38:21|
| Actual job (UTC) |13:53:40–19:39:14|19:39:17–20:01:38|
| Watcher step (UTC) |13:53:53–19:38:57|19:39:28–20:01:20|
| Recorded process start, New York |08:53|14:39|
| Retained heartbeat range, New York |09:28–14:37|14:39–15:00|
| Raw heartbeat rows |299|21|
| Unique configured slots09:30–15:00 inclusive |297/331|21/331|
| Actual executed source recorded by watcher |0fca98b57639cfb7d045be797fff5284b92a6f1e|47a74865b09fef65cfac0f7ae9585adfdad2a002|

The second run's creation/run-level start at09:38 New York was **not** its14:39 job start. It checked out newer source than its originally queued run head; executed-source identity is kept separately.

**Coverage:** the two immutable heartbeat sets contain318/331 configured slots. Missing:09:47,10:15,10:44,11:13,11:41,12:08,12:36,13:01,13:30,13:52,14:16,14:38,14:52. This union is a labelled historical analysis, not a rewritten canonical result or new prospective admission. The opening09:30 slot is retained; a job's duration alone did not establish that. The first legacy `minutesCompletedRate=0.971` is not the full configured-session denominator.

**No canonical overwrite:** `data/ignition-live.json` remains Git blob26846861c6701fafb89bb9cce27fda885567504f, identical to the first publication. The canonical shadow remains blobae157235311eafd04fd5464e8bec8c9ff11a849e. The second log explicitly says the richer existing session was retained and the attempt archived. Both run-specific archives survive. Message-state reports show17 acknowledged outcomes in the first run, zero in the second and6 suppressed in the second; these operational counters do not establish profitable alerts or account activity.

**Separate data quality:** first-run recorded fresh-price share is0.429 (second0.440), not whole-market surveillance coverage. The retained first daily summary reports131 EDGAR polls with14 failures; per-candidate SEC checks are a separate path. Fixing schedules does not establish feed rights, fresh executable quotes, trusted instrument identity, successful SEC coverage or profitable outcomes. Massive Starter delay and unverified broad SIP endpoint/age coverage remain explicit. Existing subscription ownership is confirmed; this package performs no entitlement probe or routing switch.

Both runs are recorded as scheduled. The retained metadata/logs do **not** include their exact `github.event.schedule` strings. Which historical run belonged to which DST cron remains UNKNOWN; creation order is not proof. The old workflow's two cron identities could both run whenever their delayed start happened to enter the accepted clock window. The fix checks the actual event identity, regardless of delay or queue order.

## Causes and bounded corrections

| Requirement | Confirmed source cause | Exact proposed behavior |
|---|---|---|
| Correct guard attribution | Production guard used `run_started_at`/creation and only inspected active runs; queue creation could become a supposed process start. | Read actual watch-job timing. Keep earliest verified day-job identity separately from active job IDs/start times. Explicit non-observation requires admission success plus the observing step skipped. Missing/ambiguous evidence stays UNKNOWN; job timing never proves fresh data. |
| Retain early-stop visibility | Active/queued branches returned before inspecting the earlier completed run. | Check verified earlier job endings first and report the stop once even with an active, queued or subsequently completed duplicate. Stop timing is not called a heartbeat gap without retained observations. Existing short-attempt startup retry policy and no automatic restart after a substantive watch are preserved. |
| Exclude wait from observation budget | `START` preceded the08:53→09:25 wait;345minutes therefore ended the first process near14:38. | Start `RUN_START` after the wait. Keep the existing345-minute process budget and configured15:00 boundary. Source delays can still miss slots; no coverage guarantee. |
| Reject opposite-season queue starts | No check of `github.event.schedule`; delayed wrong-season entries could execute. | Shared admission checks the real cron against America/New_York offset. Opposite/unknown crons exit without data or messages. Late correct-season/guard starts remain explicitly partial and retain existing archive/message protections. No new automatic post-stop recovery. |

## Workflow proposal and limits

This is a **proposed workflow diff**, not an installed change. Summer cron13:10UTC and winter14:10UTC both target09:10 New York. The existing bot guard may request its existing normal09:10 start. There is no new trigger or dispatch path. The six-hour job cap is360minutes; starts before09:10 are refused, the existing09:25 wait is outside the345-minute observation timer, and the configured end remains15:00. This replaces the earlier08:45 scheduled target, which could not fit an on-time start plus waiting and all configured observations into one six-hour hosted job.

Admission occurs before the watcher creates delivery state or requests data. The workflow checks admission before cache/observation/save/notification steps; refused runs do not append nominal observations. Setup or cache delays can make an admitted start late, so the watcher rechecks admission and logs its actual clock. Controlled-clock tests preserve the entire real chronological schedule across DST, early waiting, setup/cache delays, late starts and slow responses. These are synthetic rehearsals, not market evidence. Scheduling/provisioning delays and source work can still prevent a complete session; the timeout is a bound, not a success guarantee.

Guard history reads are limited to24 requests, two pages per list,100 rows per page,30seconds total and10seconds per request. The query uses New York day boundaries, including23/25-hour DST days, rather than lifetime counts. Truncation, exhausted budget, malformed status/identity or unavailable jobs is explicitly incomplete/UNKNOWN and cannot authorize an inferred start or duplicate dispatch. This scope is day-level operational metadata, not proof of global first-ever source ingestion. Guard dispatch remains bounded under its existing attempt policy; acknowledgement is not execution or causal proof.

## Exact package, compatibility and rollback

[Ten-file patch](production.patch), [manifest/dependencies](manifest.json), [code-only inverse](rollback.patch), [verification evidence](verification.json), [whole-tree inverse proof](inverse-proof.json).

Production base:df0c963819abd375f0b98e5aea596c78dc6f60a0. Recheck fresh main and **all** pins before any eventual application. The authoritative manifest lists six runtime/workflow paths and four test paths: **ten files**. No data, financial records, offsets, frozen models, scoring, enrollment, privacy/ZAD policy, provider routes or trading-alert templates are rewritten.

The unchanged B1 publication implementation, B2 research idempotency, per-run archives, canonical selector, instrument safeguards and delivery-dedup modules are dependency-pinned. Tests exercise their actual watcher callers, including concurrent Git writers, publication refusal and interruption. The patch changes only startup admission/runtime timing in the watcher; no BUY gate, signal threshold or frozen exit is altered.

The mentor package remains exactly PR3 head25a85000b076c4da649634606467e71b577bc75c / patch1841837e99f59293cf07c891e7459947c9bc61b2c7b244c43e64dd2de80cb0d7. **No shared patch paths.** Compatibility is checked both before and after that exact package; the test-only loader changes only under the all-eight-path approved-mentor profile. Rollback reverses only these ten paths against fresh main, preserving the mentor and every data byte. No whole-main revert, old-data restoration or offset reset.

Any later deployment requires independent review, exact owner authorization and a verified natural watcher boundary. Stop for unexpected code/dependency drift, unknown publication, active watcher work or new regressions. No pause, cancellation, dispatch or service suppression is authorized by this preparation. After approved deployment, use naturally scheduled runs to inspect actual admission/event identity, job/process/cycle clocks, complete persisted archives, canonical selection and delivery state. Until then operational improvement is **tested offline / not deployed**.

## Reproduction and test disposition

Use a disposable checkout of the pinned production base, apply only `production.patch`, then run Node20 tests. The new actual-caller group is:

```sh
node --test test/watcher-guard.test.mjs test/watcher-nov2-clock.test.mjs test/watcher-nov2-guard.test.mjs
```

The original watcher/workflow/guard fails six of seven baseline defect controls; the repaired ten-file candidate passes38/38 current scheduling/guard cases. Both full production-plus-patch and production-plus-patch-plus-unchanged-mentor suites are recorded separately in `verification.json`. B1/B2 actual-caller controls remain11/11 plus9/9 PASS, using disposable remotes, competing writers, refusal and interruption. No production provider or Telegram endpoint is contacted by these fixtures.

**Known production baseline:** ordinary `test/try-small-audit.test.mjs` is14PASS/2FAIL on both unchanged production and this candidate (cases1/3b). The full-suite runs use the already-preserved, explicitly historical fixture clock only for that file. Ordinary failures are retained separately; the replay is not ordinary current-clock success. No strategy or approved mentor bytes are changed to make it pass.

**Separate development baseline defect found after today's close:** unchanged development and candidate both fail one of11 `tests/market03-discover-price-day.test.mjs` cases, expecting12 samples but receiving10. At20:59UTC the latest completed session is30October and the month10 target is29December2025 (the existing labelled unknown-year weekday path). At21:01UTC it becomes2November and the month10 target is1January2026: a known closed date whose predecessor crosses outside the bounded calendar, returning `CALENDAR_UNKNOWN` instead of entering the unknown-year path. This is reproducible calendar-boundary source behavior, not an unexplained intermittent startup failure. Neither `discover.mjs` nor its test is changed or included in this watcher package. Preserve the failing assertion and give Claude this exact source-contract handoff; do not silently weaken it or claim the full development suite green. The defect does not occur in the pinned production tree, which has a different discovery implementation. Hosted results must be read on the final published SHA, separately from local execution.

## Development-only companions and acceptance

Development also keeps its existing segmented/full-session proposal intact; it is not extracted wholesale. The new exact production tests use deployed15:00 semantics; development tests respect their existing half-open segment boundary. A reducing `IG_WINDOW_END` bound supports those inactive development caller checks without expanding default collection.

The prior frozen D3 no-observation workflow is preserved as a test fixture. The new inactive workflow remains UNKNOWN under the unchanged lineage contract until separately reviewed; no V1 continuity/enrollment rule or V2 policy is adopted. The two old guard-dispatch fixtures now run inside the configured start window; assertions are retained.

REPO-03/ACTIONS-04 operational caller/failure evidence and HISTORY-03 provenance evidence advance. No full acceptance row closes:24/40 accepted,16 open,0 admitted prospective cases. Natural-run verification, data quality, entitlement checks, prospective evidence and owner deployment decisions remain separate. CATALYST-03 stays open. Claude's separate ACTIONS-overlay findings are retained for later work, not bundled here. Mentor preparation/approval remains unchanged and takes its existing release priority; this package is not a new mentor prerequisite.
