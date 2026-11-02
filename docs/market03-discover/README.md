# MARKET-03 batch: `discover.mjs` price-day ingress

**Author:** Claude, 2 Nov 2026. **For:** Codex review.

**Branch:** `claude/market03-discover`.
- Cut from r2 (`claude/market03-catalyst03-r2` @ `31b9ff2a`), which stays unchanged during review.
- It depends on r2's `source-contract.mjs`, so if r2 changes in review, this branch is rebased onto the accepted head.
- The ownership claim (`OWNERSHIP.md`) was published before any edit, after checking that Codex had not claimed or changed the file.

**What it is:** offline only. No provider calls, credentials, deployment, collection or messages. The discovery criteria (`CFG`), scoring, SEC / statement / clinical-trial logic and message wording are unchanged.

## Why it matters

`discover.mjs` sets:
- the `session` date of `data/discovery.json`, shown as "STRONG COMPANIES" in ACTIONS and read into `smart-money`'s universe;
- the `session` of `radar-universe.json` and `leaders-universe.json`;
- the date of every `discovery-journal.jsonl` entry, which is later scored against the S&P 500.

## Defects (unmodified code at r2) and fixes

| Defect | Shown by the actual-caller probe | Now |
|---|---|---|
| Every failure (HTTP error, exhausted 429, plan refusal, `{}` / error envelope) returned `[]`, which is indistinguishable from a market holiday, so the code stepped back silently | With the latest completed session (30 Oct) failing, it presented **29 Oct** as the session, exited 0 and recorded no status | Each request keeps its outcome: FAILED, RATE_LIMITED, REFUSED, MALFORMED, EMPTY (authenticated zero rows), INCOMPLETE (a session day with too few rows to be the whole market) or OBSERVED. If the latest completed session is not OBSERVED, the previous list stays as it was, with its own date; `lastAttempt.priceDay` records what happened; the run fails visibly (the existing RUN FAILED notice). **An older day is never presented as current.** |
| The current day started at "today", so an unfinished session counted when the provider returned rows for it | With rows for every date, it presented **today, 2 Nov**, as the session | The current day is the **latest completed session** on the exchange calendar (`market-session.mjs`), here 30 Oct |
| Holidays were inferred from "500 rows or fewer" plus a weekday skip | It requested holidays (for example 3 Jul 2026) | Inside the calendar's years, closed days are never requested. Samples fall back to the previous session only after a recorded failure (`fellBack`, `attempts`). |
| A failed monthly sample silently shortened the momentum samples | — | `priceDay.samples` records target, day, outcome, fallbacks and calendar basis; `samplesComplete` says whether all 12 were read |

**Calendar coverage limit:** `market-session.mjs` covers 2026–2027 only.
- Monthly samples before 2026 use the original weekday walk, labelled `WEEKDAY_WALK_UNVERIFIED`, with every outcome recorded.
- The current-day rule needs the calendar extended before 2028; until then a 2028 run fails visibly as CALENDAR_UNKNOWN rather than guessing. That extension belongs in `market-session.mjs`, which is not edited here.

**Schedule check:** `discover.yml` runs at 05:30 UTC Tuesday–Saturday, hours after the previous session's close, so the latest completed session should already be published. On the day after a holiday the latest completed session has already been processed, so the run exits quietly ("No new session"), as before.

## Regressions

`tests/market03-discover-price-day.test.mjs`: 10 cases, all running the actual `discover.mjs` against a per-date loopback stub.
1. **Current day:** it is the latest completed session, never today's unfinished one; no closed day inside the calendar is requested; all 12 samples are read.
2. **Failures of the latest session (cases 2–7):** HTTP 500, 429 retries exhausted, 403, `{}`, an authenticated zero-row answer and a 100-row partial market. In each case the right status is recorded, no request is made for an older day, the previous list keeps its own date and candidates, and the run fails visibly.
3. **Failed historical sample:** it falls back to the previous session, with the fallback and the failed attempt recorded.
4. **Calendar basis:** samples outside the calendar's years are labelled, and those inside are not.
5. **Already processed:** the same session exits quietly with one request (the existing behaviour).

**Negative control:** the unmodified `discover.mjs` fails 0/10.
