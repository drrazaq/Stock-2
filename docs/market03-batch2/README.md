# MARKET-03 ingress batches 2 and 3

**Author:** Claude, 2 Nov 2026. **Integration lead and reviewer:** Codex.

**Branch:** `claude/market03-batch2`, cut from the frozen package `claude/market03-catalyst03` @ `e6a1382c`, which stays unchanged for review. The ownership claim (`OWNERSHIP.md`) was published before any edit.

**What it is:** offline only. No provider calls, collection, credentials, deployment or messages. Thresholds, the Sunday studies and frozen results are unchanged.

## Batch 2: `smart-money.mjs` (live ingress)

Every pick here goes straight into the nightly scan universe (`scan.mjs:821`) and is logged as a scored tip.

| Defect (old code) | Now |
|---|---|
| A failed Finnhub call (`null`) read as "no insider buying" or "no analyst change" | Outcome per call: failed / identity mismatch / malformed / observed / empty, in `sourceStatus` |
| The returned symbol was not checked | Must equal the requested symbol |
| A repeated (amended) row counted twice; one person under two spellings counted as two buyers | Semantic duplicates count once; names are normalised for counting |
| Future-dated or coerced numbers accepted | Strict numbers; future dates are malformed |
| `rec[0]` / `rec[1]` assumed to be the latest two consecutive months | Sorted by period; month-on-month only when consecutive |
| FMP refusal or limit kept only as a free-text note | Bounded read with REFUSED / RATE_LIMITED / MALFORMED statuses; future rows excluded; share classes counted |
| Grouped-price day stepped back by weekday only (no holidays), and the day used was not recorded, although it becomes the tip's starting price | Exchange-calendar day, Massive envelope checked, day / lag / basis recorded; **no tips logged on a stale or missing price day** |

**Effect on identical synthetic answers:**
- **Old code:** 4 insider clusters and a wrong analyst turn. The clusters were FFF (counted with a future-dated row, 150,000 USD), EEE (an answer about another ticker), BBB (inflated by a duplicate) and AAA (one person counted as two); GGG was taken as a gap-month analyst turn, and AAA's real turn was missed.
- **New code:** 1 cluster (FFF, two real buyers, 60,000 USD) and the correct analyst turn (AAA).

## Batch 3: `calendar.mjs` (Massive holidays and dividends)

These feed "MARKET HOLIDAYS" and the ex-dividend lines in ACTIONS.

| Defect (old code) | Now |
|---|---|
| A failed holiday request kept the old list **and reported "ok"** | Status is UNAVAILABLE / REFUSED / MALFORMED. The previous future holidays are kept for display, labelled as such |
| Past holidays were never dropped; rows not validated | Past and malformed rows dropped and counted |
| NYSE and Nasdaq disagreeing on a date was resolved arbitrarily | Kept and labelled `EXCHANGES_DISAGREE` (CONFLICT) |
| No cross-check with the exchange calendar | Each date is compared with `market-session.mjs`; a disagreement is labelled `EXCHANGE_CALENDAR_DISAGREES` |
| Dividend rows were not checked against the held ticker; amounts unvalidated; currency ignored, although ACTIONS says "the price drops by about that much" | Ticker identity, valid ex-date, finite amount; currency kept (non-USD counted); failed lookups counted (nothing shown, as before) |
| — | The public `calendar-status.json` carries **counts only**; held symbols stay in the encrypted file (tested) |

**Still for the main session:** `scan.mjs` should print a non-USD dividend's currency next to the amount. That is a one-line change, which I did not make (`scan.mjs` is not edited here).

## Coverage after these batches

The ingress matrix records 32 of 87 decision-path ingress as reviewed, up from 27. Three are fully covered on every dimension. See `docs/validation/market03-ingress-matrix.json`; the drift guard passes.

## Results

See `RESULTS.md`, written after the exact-commit suite.
