# Early-detection study ED1: pre-registration (written before any result is computed)

Owner mission item 2 (PR #1 comment 6795060933). Research only: no rule, gate, exit or live setting changes. Existing retained inputs only, with no provider requests. Claude is the author and Codex reviews independently.

## Inputs (frozen)

- **Retained watcher archives** `data/ignition-runs/<day>/<run>.json` and `<run>.shadow.jsonl.gz` at main `716b158307a9d09e5ac39b5f562a7f12245f604e`, sessions 2026-11-02, 03, 04, 05, 06, 09 and 10.
- **One primary run per day:** the run whose `heartbeat` is longest. Companion runs are used only for coverage notes.
- **`missed`:** the movers of at least +15% that were not caught, with first sight, price evidence and the reason code, from the same primary run.
- **Shadow rows:** every candidate the watcher recorded (early wave, rule trigger, SEC filing, control), with entry prices and later highs.
- **Filing rows (`src` contains `filing`):** an SEC 8-K/6-K seen by the live EDGAR feed. `f.atM` is the SEC acceptance minute (New York), `f.decM` the decision minute, and `f.form`/`f.items` the filing type.
- **Not used:** `data/catalyst-events.jsonl`, whose last event is 2026-10-21, so it has no November coverage.

## Part A: the missed-mover census (descriptive, no test)

Every missed mover on the 7 days is classified by:
- **reason code**;
- **session of first sight:** before 09:30 New York, or regular;
- **price evidence at first sight:** FRESH (`firstQuoteAgeMin` ≤ 3), STALE (> 3), or NEVER_FRESH (`firstLive` null);
- **liquidity:** the day's shadow-row `dv0` for that symbol, banded ≥ $2M, > 0 and < $2M, or UNKNOWN when there is no shadow row;
- **retained primary catalyst:**
  - FILING_BEFORE_FIRST_SIGHT: a same-day filing row with `f.atM` ≤ the first-sight minute;
  - FILING_AFTER;
  - NO_RETAINED_FILING_RECORD. This is **missing evidence, not proof that no catalyst existed**: the live feed covers 8-K/6-K only, and the archive has no news.
- **Instrument identity** stays UNKNOWN. No symbol-suffix inference.

## Part B: the frozen test

**H1.** Among watcher candidates, those with a same-day primary SEC filing accepted **at or before** the candidate's first-seen minute become +15% runners more often than candidates without a retained filing.

**Population and definitions:**
- **Population:** all shadow rows of the primary runs (one row per symbol per day).
- **Exposure E:** the row has `f` and `f.atM` ≤ `m0`. Rows with a filing accepted after `m0` form a separate group, LATE_FILING, reported but not in the test.
- **Outcome R (runner):** either of
  - the symbol is in that day's `missed` list;
  - max(`hi` over every recorded entry, `last`) / prevClose − 1 ≥ 0.15, where prevClose = `px0` / (1 + `chg0`).
- **Strata:** session of `m0` (before 570, or 570 and later); liquidity band of `dv0` (≥ 2e6, > 0, 0 = unknown); `hard.under1`.

**Statistics.** Runner rate for E and for not-E: pooled, by stratum and by day. Fisher exact test, two-sided.

**Verdict rule, frozen before running:**
- **SIGNAL CANDIDATE (research only)** requires all of:
  - pooled p < 0.01;
  - the same direction on at least 5 of the 7 days;
  - the same direction within the ≥ $2M liquidity stratum.
- **Otherwise NO EVIDENCE.**
- Even a SIGNAL CANDIDATE is **not a buy rule.** It would need its own forward pre-registered test with entry, exit and cost on the existing gates.
- The R0 control rows (the 09:45 no-information sample) are reported as a baseline runner rate.

## Known limits, stated in advance

- Shadow rows exist only for symbols the watcher recorded, so this is not the whole market.
- `hi` is tracked only on live minutes after each entry, so R is a lower bound.
- Caught movers that never became shadow rows are not visible.
- Seven sessions overlap in market regime and are not independent samples.
- Nothing here estimates tradable returns. The B adverse-concentration result (6764028009) is unchanged and is not touched.
