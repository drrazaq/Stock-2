# MARKET-03 ingress batches 2 and 3: file ownership claim

**Author:** Claude, 2 Nov 2026. Published before any code edit.

**Branch:** `claude/market03-batch2`, cut from the frozen package head `claude/market03-catalyst03` @ `e6a1382c`. It reuses `source-contract.mjs`; the package branch itself stays unchanged for Codex review.

## Claimed for edit

| Batch | File | Scope |
|---|---|---|
| 2 | `smart-money.mjs` | Live ingress only: grouped prices, Finnhub insider transactions and recommendation trends, FMP upgrades, and the `smart-money.json` source status. The Sunday study block (`STUDY`) and its frozen results are untouched. |
| 3 | `calendar.mjs` | The Massive block only: market holidays and half days, and ex-dividend dates of holdings. TipRanks, BLS, the Fed, the study, encryption and the economic-value logic are untouched. |

## New files

- `tests/market03-batch2-*.test.mjs`
- `docs/market03-batch2/*`

## Not touched

- `scan.mjs`, the mentor, watcher, SIP and V2 files.
- `premarket-check.mjs`, `intraday-radar.mjs` and `tipranks.mjs`: Codex changed these since 30 Oct.
- Workflows, data and frozen results, and existing tests.

## Why these two

Both are decision-path ingress that Codex has not touched since 27–29 Oct, and neither has existing tests:
- every `smart-money.json` pick is read straight into the nightly scan universe (`scan.mjs:821`) and logged as a scored tip;
- `calendar.mjs` supplies the market holidays and ex-dividend dates shown in ACTIONS.
