# Independent review of the B-FCFN1 retained-evidence package 4ba97403 (handoff 6801660623)

- **Reviewer:** Claude.
- **Scope:** the economic and data conclusion, reviewed from retained objects only. No acquisition and no production action.

## Reproduced

`replay.py` at `4ba97403` regenerates `results.json` **byte-identically**. Its internal asserts against `firstRun` (mean, median, stress, no-top-2, edge, day t) pass. I checked the following independently:

- **Concentration.** Top 5% (ceil) gives 122.65% / 83.50%, and the remaining 95% average −0.69% / +0.97%. This matches my earlier 121% / 83%; the difference is floor versus ceil.
- **Cost basis.** The frozen edge is `g - COST - c` (`value-core.mjs:81`), i.e. rule net against control gross. Day t is 3.02 / 1.50. The common-cost basis gives 3.71 / 1.96, labelled as sensitivity only.
- **SPY.** The frozen SPY figure is gross (`spyGate`).
- **Small-stock stress formula.** `(1+net+.008)×0.98/1.02 − 1 − .008` gives −1.19% / +1.40%. The formula is correct and labelled as an all-row stress, not a small-stock mask.
- **Whole-share formula.** `q = floor(997/E)`, `q = 0` means no trade, and P&L = `q(X−E) − 6`. The price grid is labelled SYNTHETIC.
- **Compaction counterexample.** A value history 10→12→10 loses the final 10, because the dedupe key is (start, end, value). This is a real schema limitation, and the number of trades affected is unknown.

## Economic and data conclusion: PASS

- **NOT PROVEN stays.** No actionable setup:
  - newer-half block t is 1.02 over 9 blocks, against the 4.1 bar;
  - it fails the earnings-news control (−0.31 points);
  - in the older half the 95% outside the top 5% have a negative mean;
  - the all-row small-stock stress turns the older half negative.
- **Original-filing point-in-time status and executable whole-share economics are INCONCLUSIVE.** The evidence is missing, not adverse.
- **No 3-slot or 92-day surrogate is presented as account economics.** No ZAD backfill. UNKNOWN is never a BUY.

## Correction (data custody, time-bound)

- **The exact-key cache export has an expiry.** GitHub evicts caches not accessed for 7 days. Every lab restores by prefix (`leaders-study-`, `value-cache-`), and prefix restore takes the newest key.
  - The Sunday 15 Nov studies (from 06:00 UTC) will save a newer `leaders-study-*`. The value lab (Sun 13:17 UTC) will save a newer `value-cache-*`.
  - From then on nothing touches `leaders-study-42455753549` or `value-cache-42811574377`, so both are likely evicted around **22 Nov**, or earlier under the 10 GB repository limit.
- **Required in the report:**
  - the export is time-bound;
  - after eviction the exact replay is permanently INCONCLUSIVE;
  - a later run on newer keys is a different input set, not this firstRun's.

  This is not a request to dispatch anything. Any export still needs its own approval.
