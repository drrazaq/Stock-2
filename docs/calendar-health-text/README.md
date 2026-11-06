# Calendar exact series, health-text qualification and SEC 404 wording (revision 3): development only, not deployed

## Revision 3: Codex review `68c4bf45` (remaining part of R4) repaired

Codex closed R1, R2, R3, R5 and R6 on r2, and found one remaining R4 case: a cached actual with no retrieval time showed **no** clock at all.
- **Producer** (`econ-series.mjs`): only a parseable retrieval time is kept. A missing or invalid one stays `null`; it is never fabricated or backfilled.
- **Formatter** (`scan.mjs`): any value whose retrieval time is missing or invalid now reads **"retrieval time UNKNOWN"**, with no date, no freshness claim and no before/after-release claim. The "as retrieved" footnote cites only valid fetch dates.
- **Timestamped control:** keeps its real date.
- **Tests:** Codex's harness (`docs/reviews/calendar-health-768883ea/r4-unknown-clock.test.mjs` @ `68c4bf45`) gives **10/10** on r3 (9/10 on r2). The package's own tests add missing-clock, invalid-clock, timestamped-control and provider-unknown-clock cases through the actual job and the `calendar` reply.

The sections below describe r2 and the original r1. Where r1 wording was superseded, it is corrected or marked historical.


## Revision 2: Codex review `046877af` (CHANGES REQUIRED), all six findings repaired

Codex's portable harness (`docs/reviews/calendar-health-166051d4/regressions.test.mjs` on `codex/calendar-health-watcher-review-20261106`) ran against r1 with 7 failures. Against r2 it gives **8/8 PASS**. The same counterexamples are now in this package's own tests, through the actual `calendar.mjs` job and the actual Telegram callers.

| ID | r1 defect | r2 repair |
|---|---|---|
| R1 | A provider September row was relabelled as official October. | The provider's own period hint must agree with the official reference (month or quarter). On disagreement the figures are UNKNOWN ("provider period … does not match the official reference …"). Agreeing hints and rows with no hint stay valid. |
| R2 | Duplicate rows `40 K` / `40 M` kept the first value. | Duplicates are reconciled as full typed claims (value, unit, period), in either order; any difference is UNKNOWN. Equivalent units (`40K` = `0.04M`) are normalized deliberately. |
| R3 | A null cached CPI index became 0, giving −100% CPI. | Actuals use only finite, positive levels for the **exact** required months (found by date, not position). Missing, null, zero or gapped inputs leave the actual absent. A legitimate zero payroll **change** still shows 0. The study's AV parse and `fillAct` are untouched. |
| R4 | Every provider previous was certified "published before the release"; a partial AV refresh freshened other series. | Previous and actual values are labelled `PROVIDER_*_AS_RETRIEVED`, with timing (`RETRIEVED_BEFORE_RELEASE`, `RETRIEVED_AFTER_RELEASE` or `UNKNOWN`) from the actual retrieval time versus the release time. The text never certifies a pre-release vintage. AV now keeps per-series retrieval clocks (`avAtBy`); pre-repair files inherit their old global time. |
| R5 | "189K vs 195K = ABOVE" for claims | ABOVE/BELOW describes the number. The job-market meaning is stated separately ("= BELOW (lower: a stronger job market)"). The strategy sign used for tested reactions is unchanged. |
| R6 | Compaction dropped an actionable message-delivery fault. | The compact watcher line keeps "MESSAGE DELIVERY PROBLEM" and the message-recovery counts (waiting, exhausted, unpublished, uncertain). Complete configured coverage is never presented as healthy delivery. |

**Also addressed (Codex limitation on production readers):** release rows keep the **headline series' provider key** in the legacy `key` field, so `macroNow()` (a production decision input) links a headline surprise to the same exact study key as before. A new caller test checks that a headline surprise reaches `macroNow` and a subsidiary series (private payrolls) never does.

**Unchanged:** the SEC note wording and fallback (`discover.mjs` byte-identical to r1); the study inputs; the package boundary (same 7 files).

**Known limits (from Codex, retained):**
- The plausible bands are heuristics, not authentication; genuine extremes can show UNKNOWN.
- A bare `Fed Funds Rate` name is no longer mapped, because it may be the effective rate. Only explicit decision or upper-bound names map to the target series.
- A Git rollback restores the old behaviour, but does not clean values the old writer may already have saved.

---


- **Prepared:** 6 Nov 2026 by Claude on branch `claude/calendar-health-text`, from main `6cba0806`, at the owner's request.
- **Not done:** no deployment, workflow action, dispatch, provider call, real message or data change.
- **Saturday's approved STOP R2 and D1–D4 packages are unchanged.** This package changes `scan.mjs`, whose before-hash STOP pins (`19a5368b…`). It must therefore deploy **after** STOP and D, under its own owner approval and Codex review. Its patch applies cleanly on top of STOP plus D (checked; see Tests).
- **Source:** the owner's 6 Nov CONTEXT/HEALTH message. All checks were read-only. Official figures come from BLS and DOL releases.

## Defects found in the 6 Nov message

| # | Message said | Official source | Cause in code |
|---|---|---|---|
| C1 | "Jobless claims (Jobless Claims 4-Week Average): forecast 1710K, previous 1701K" | DOL release, 5 Nov. The initial-claims 4-week average was 197,000 before release and 194,750 after; initial claims were 189,000. 1,710,000 and 1,701,000 are **continuing**-claims figures (the 4-week average and the level of the prior week). | Provider row values were shown under a different series' label. |
| C2 | "Jobs report (Nonfarm Productivity QoQ): previous 1.4%" | BLS productivity and costs is a separate release. Q2 was revised to **2.1%** in the 5 Nov release, and Q3 came in at **3.6%**. | `kindOf` puts any "non-farm" name in JOBS; the merge keeps one row per kind and day. |
| C3 | "Jobs report (Nonfarm Payrolls Private): forecast 5, previous 9" | BLS September 2026: private **+46K**, total +29K | A subsidiary row replaced the official empsit row's name; no unit; the headline was lost. |
| H1 | "full cash session 315/390 usable r" | The full text adds "… 15:01–15:59 outside configured window: 0/59 observed (known coverage limit, not a daily fault)". | The health line cut each problem at 170 characters. |
| S1 | discovery `secNote`: "SEC answered HTTP 404 … after 3 retries (the SEC is refusing this server …)" | HTTP 404 means "not found". Only 403 and 429 are retried. | Fixed wording for every non-OK status. |

All 5 release **dates and times** in the message were correct. Consensus forecasts are market estimates and are not independently verifiable from an official source.

## What changes

1. **`econ-series.mjs` (new, pure):**
   - an exact series registry with id, unit, conservative plausible band, reference-period rule and headline/subsidiary role, plus the official release list with its public schedule URL;
   - each provider row maps by **exact name** to one series, or to nothing (UNKNOWN). A value is shown only when its unit is stated and matches the series and the number is inside the band; otherwise it is UNKNOWN with the reason;
   - consensus, previous and actual are separate fields, each with source and retrieval time. (r2/r3) Each value is labelled `PROVIDER_*_AS_RETRIEVED`, with its real retrieval timing versus the release (before / after / UNKNOWN); a missing or invalid retrieval time is shown as UNKNOWN. (r1 used a fixed `PUBLISHED_BEFORE_THIS_RELEASE_MAY_BE_REVISED` label; withdrawn, Codex R4.)
   - conflicting duplicate provider rows become UNKNOWN, never a silent pick;
   - reference periods come from the official schedule's own reference column, the DOL weekly convention for claims (labelled "derived"), or the provider's period suffix. None is invented.
2. **`calendar.mjs`:**
   - BLS schedules now also include Productivity and Costs, and keep the release id, the schedule's reference period and the retrieval time;
   - provider rows are stored separately (`trRows`), so a previously merged file is never re-read as provider data;
   - the merge attaches each provider row only to its exact series. A subsidiary never renames or replaces a headline;
   - Alpha Vantage actuals fill only the exact headline series of the official reference month;
   - the public `calendar-status.json` gains `officialSources` (public BLS/Fed URLs, retrieval time, number of dates). Provider values stay only in the encrypted file (TipRanks licence);
   - **the pre-registered calendar study (`MODE=study`, `C.hist`) and its `kindOf`/`fillAct` rules are unchanged.**
3. **`scan.mjs` (renderers only):**
   - ACTIONS "THIS WEEK" shows each release with its **headline** series, reference period and units, plus one source line ("Consensus and previous figures: TipRanks, as retrieved …; a previous figure can differ from the one finally published and may be revised in the release"; r1 wording withdrawn);
   - the `calendar` command lists every series separately, with UNKNOWN reasons, sources, retrieval dates and vintage;
   - rows saved before the repair show "figures UNKNOWN" until the next calendar run;
   - the health line rebuilds the watcher problem from the saved structured report. It keeps missing minutes **inside** the configured window apart from time **outside** it, and never cuts the qualification. Other long problems end at a clause boundary, with "send health for the full text".
4. **`discover.mjs`:** the SEC note wording only. The fallback and retry behaviour are unchanged.

## Not changed (findings for a separate decision)

- **Calendar study inputs:** `kindOf` still classes "Nonfarm Productivity" as JOBS, and the study history's `fillAct` can fill a private-payrolls row from the total-payrolls series. Changing the study's inputs is a research change and needs its own pre-registration decision.
- **Watcher periodic gaps (5 Nov), read-only:** see the investigation section below. No code change in this package.

## Watcher gaps on 5 Nov: read-only investigation

Single run `42042506576`, one job running continuously from 14:11 to 19:56 UTC. The job log shows **no restart, reconnect, error or rate limit**.

1. **11 single missing minutes, about every 25–31 minutes: CONFIRMED loop timing drift.**
   - In `ignition-watch.mjs`, the 60-second wait (`wait = 60000 - (Date.now() - nowMs)`) is measured from `nowMs`. `nowMs` is taken *after* the snapshot and stop-watch work of each pass, so each pass lasts 60 s plus that work (about 62 s on 5 Nov).
   - Heartbeats are recorded once per pass without conditions (317 passes, 317 heartbeats, none empty), so about one New York minute is never sampled per ~30 passes.
   - The job log's status lines (every 30 passes) are 30 passes but 31 minutes apart, and each such window contains exactly one gap.
   - The same pattern appears on 2, 3 and 4 Nov.
2. **14:56–15:00: CONFIRMED run budget.**
   - `START` is set at process start, at the 09:11 New York early start, and the default `IG_RUN_MIN` is 345. The loop therefore ended at about 14:56 New York, before its 15:00 stop.
   - The final status line (`317 minutes`) follows immediately.

A fix (anchoring the wait to the pass start, and budgeting from the 09:25 start) touches `ignition-watch.mjs`, which Saturday's STOP package also covers. It must follow Saturday as its own reviewed package; nothing is proposed for deployment here.

## Tests (Node 20, external connections blocked; 0 attempted)

**Current (r3):**

| File | Result |
|---|---|
| `test/econ-calendar-exact-series.test.mjs` (actual `calendar.mjs` job against local stand-ins, then the actual `actionsText`, `calendar` command and `macroNow`) | 19/19 |
| `test/health-text-watcher-qualification.test.mjs` (actual `watcherReport`, `healthLine` and `actionsText`) | 7/7 |
| `test/discover-sec-note.test.mjs` (the verbatim `sec()` source against a local server) | 4/4 |

Codex harnesses: `046877af` regressions 8/8; `68c4bf45` R4 harness 10/10.

*Historical (r1, kept for the record):* 7/7, 7/7 and 4/4; on the main code 4, 4 and 3 behaviour tests failed.

Full-suite and compatibility results are in `verification.json`.
