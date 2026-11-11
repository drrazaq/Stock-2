# Independent trace of the 11 Nov radar defects (review baseline; main `ead44d8d`, Stage 2 pin `5fccc6ec`)

- **Reviewer:** Claude.
- **Method:** read-only code and history reading, plus GitHub Actions run metadata.
- **Scope:** no provider requests and no production action.
- The 11 Nov watcher archive is not on main yet (the run is in progress), so the radar text itself is not reproduced here.

## 1. Test security and leveraged / futures funds in panel D ("runners")

| # | Cause | Location |
|---|---|---|
| T1 | **The instrument reference is never configured in production.** `instrumentType()` needs `IG_INSTRUMENT_REFERENCE_FILE` plus a pinned sha256 of a `REVIEWED_OFFICIAL_INSTRUMENT_CAPTURE_V1` file. No workflow sets the variable, on main or at `5fccc6ec`, and no such capture file exists in the repo. Every symbol therefore returns UNKNOWN / `REFERENCE_NOT_CONFIGURED`, and the existing ETF/ETN/warrant policy exclusion can never fire. | `instrument-type.mjs:31-33`; `git grep IG_INSTRUMENT_REFERENCE .github` is empty |
| T2 | **Panel D filters only `UNDER_1_USD`.** `runnerLines()` lists every other code, including `INSTRUMENT_POLICY_EXCLUDED` and `INSTRUMENT_IDENTITY_UNKNOWN`. | `radar-v3-core.mjs:85-86` (same at `5fccc6ec`) |
| T3 | **Instrument flags are set only on the admission path.** `secRisk` runs only for alert or admission candidates. Movers that never reach admission carry no instrument flag, so their code (LOW_VOLUME, GAPPED, …) hides their type. | `ignition-watch.mjs:164,187,193` |
| T4 | **The mover source is unfiltered.** The Alpaca `screener/stocks/movers?top=50` list and the watcher's visible set include ETFs and test symbols. | `ignition-watch.mjs:84,193,353` |
| T5 | **There is no underlying or issuer grouping.** CRWX, CWVX and CRWG appear as three independent movers. The capture schema has no underlying field. Any mapping must come from a reviewed issuer or exchange source, and otherwise stays UNKNOWN. | — |

**Consequence:** even after Stage 2, panel D and the "missed company" counts mix instruments. The existing disclaimer (`opportunity-radar.mjs:17`) is not a fix. **Stage 2 does not cover T1–T5:** `radar-v3-core.mjs`, `instrument-type.mjs` and `early-alerts.mjs` are unchanged in `5fccc6ec`.

## 2. FOSL paired with a Ralph Lauren headline

- `newsFor()` uses Finnhub `company-news?symbol=FOSL`. That feed can return related-company items.
- `classifyCatalyst()` takes the earliest in-window headline **without checking that its headline or summary mentions the issuer name or ticker**, or that the item's `related` field binds it.
- When the SEC filing direction is AMBIGUOUS, the line's direction falls back to `headlineDirection(headline)` keywords. An unrelated positive headline can therefore turn an 8-K line POSITIVE.

Location: `early-alerts.mjs:75-86`. The multi-stock roundup case (YMAT) follows the same path. **Stage 2 does not cover this.**

## 3. The 10:02 watcher start

- **ignition.yml's own crons are delivered hours late on this repo.** Scheduled runs were created at 20:01 and 20:36 UTC on 10 Nov, 22:43 and 23:09 on 9 Nov, and 19:42 and 20:05 on 6 Nov. That is after the close, and those runs exit. From 4 Nov onwards every on-time start was **byGuard** (`data/watcher-starts.jsonl`).
- **The guard lives inside bot.yml.** bot.yml is a 30-minute cron whose runs loop for up to about 5.5 h (`timeout-minutes: 350`), so coverage depends on where the run boundaries fall.
- **On 11 Nov the scheduled bot run 42975970718 ran 06:57 to 12:27 UTC.** The next scheduled run, 43044236679, was not created until **15:01:54 UTC**. Main has no bot commit between 13:03 and 15:02. The guard dispatched ignition 43044342881 at 15:02:32 UTC = **10:02 NY**.
- **Result:** the 09:30–10:02 regular minutes (32) plus the pre-open record are missing.
- **This is a single point of failure.** It is the gap between bot runs, not a guard bug.
- **Stage 2 does not remove it.** At `5fccc6ec`, ignition crons move to 13:10/14:10 UTC, which is still subject to the same late delivery, and the bot.yml loop structure is unchanged apart from the save-merge.
- **Caveat:** only `event=schedule` bot runs were listed. Push or dispatch bot runs may exist, but main's commit history shows none in that gap.

## What a fix must show (for review)

- **Panel D and the missed-company queues:**
  - exclude verified POLICY_EXCLUDED and TEST instruments;
  - list UNKNOWN identity separately, never as company runners;
  - count denominators by class.
- **Identity sources:** a reviewed official reference, with test-symbol lists from the exchange. No suffix guessing. Frozen studies are not rewritten.
- **Catalyst binding:** an issuer name or ticker in the headline, summary or `related` field, otherwise UNVERIFIED. No direction from an unbound headline.
- **Start reliability:**
  - a measured pre-open start that does not depend on the bot run phase;
  - any workflow change is a separately approved release, and nothing is silently added to Stage 1 or Stage 2;
  - a guard alert must state the exact missed regular minutes.
