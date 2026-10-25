# Stock-2 Runner Hunter RH1 — research report

- Version: RH1-2026-10-25
- Status: RESEARCH_ONLY_NOT_A_TRADING_RULE
- Target: next-session high >= 40% above signal-day close; secondary outcome is >=25% upside from next open to high

## Overall results

- Signal rows: 557322
- 40%+ next-session high from prior close: 4663 (0.84%)
- 25%+ remaining upside from next open to high: 7396 (1.33%)
- Mean next-open to close: -0.01%
- Mean net next-open to close at base cost: -1.61%
- Mean net next-open to close at stress cost: -2.41%

## Frozen split

- older: n=231745; 40% target rate=0.61%; 25% remaining-upside rate=1.06%; mean net open-to-close=-1.59%
- newer: n=325577; 40% target rate=1.00%; 25% remaining-upside rate=1.52%; mean net open-to-close=-1.62%

## Feature buckets with highest older-half lift

| Feature | Bucket | n older | 40% rate older | lift older | n newer | 40% rate newer | lift newer | Stable direction |
|---|---|---:|---:|---:|---:|---:|---:|---|
| ret1Band | 15%+ | 4970 | 5.13% | 4.52% | 8802 | 6.25% | 5.25% | yes |
| rvolBand | 4x+ | 5469 | 5.08% | 4.47% | 10073 | 8.06% | 7.06% | yes |
| ret5Band | <-20% | 15164 | 3.55% | 2.94% | 23935 | 5.00% | 4.00% | yes |
| priceBand | 0.10-0.99 | 14900 | 2.51% | 1.90% | 27124 | 3.06% | 2.06% | yes |
| ret5Band | 20%+ | 13442 | 2.05% | 1.44% | 21360 | 3.42% | 2.42% | yes |
| rvolBand | 2-3.99x | 13173 | 1.79% | 1.18% | 18368 | 2.15% | 1.15% | yes |
| ret1Band | <-5% | 35979 | 1.56% | 0.95% | 51089 | 2.64% | 1.65% | yes |
| ret20Band | <-20% | 58814 | 1.55% | 0.93% | 75850 | 2.63% | 1.63% | yes |
| ret20Band | 50%+ | 8212 | 1.25% | 0.64% | 14579 | 2.58% | 1.58% | yes |
| compressionBand | range-expanded | 32367 | 1.25% | 0.64% | 47855 | 1.77% | 0.77% | yes |
| priceBand | 1.00-1.99 | 45243 | 0.81% | 0.20% | 79354 | 1.09% | 0.09% | yes |
| ret1Band | 5-15% | 26514 | 0.77% | 0.16% | 36439 | 1.26% | 0.26% | yes |
| near20High | 10%+-below-prior-20d-high | 164751 | 0.76% | 0.15% | 230208 | 1.26% | 0.26% | yes |
| closeLocationBand | upper-middle | 52052 | 0.67% | 0.06% | 74504 | 1.00% | 0.00% | yes |
| closeLocationBand | bottom-quarter | 71255 | 0.60% | -0.01% | 100343 | 1.04% | 0.04% | no |
| closeLocationBand | top-quarter | 54131 | 0.59% | -0.02% | 70672 | 0.92% | -0.08% | yes |
| closeLocationBand | lower-middle | 54307 | 0.59% | -0.02% | 80058 | 1.01% | 0.02% | no |
| compressionBand | range-compressed | 68563 | 0.57% | -0.04% | 101630 | 1.09% | 0.09% | no |
| rvolBand | 1-1.99x | 65005 | 0.50% | -0.11% | 85454 | 0.69% | -0.31% | yes |
| ret5Band | 10-20% | 20163 | 0.48% | -0.13% | 29083 | 0.74% | -0.26% | yes |
| compressionBand | normal-range | 130815 | 0.47% | -0.14% | 176092 | 0.74% | -0.26% | yes |
| ret20Band | 20-50% | 21150 | 0.43% | -0.18% | 32077 | 0.67% | -0.33% | yes |
| priceBand | 2.00-4.99 | 171602 | 0.39% | -0.22% | 219099 | 0.71% | -0.29% | yes |
| near20High | within-3%-of-prior-20d-high | 22873 | 0.39% | -0.22% | 31377 | 0.66% | -0.34% | yes |
| rvolBand | <1x | 148098 | 0.39% | -0.22% | 211682 | 0.69% | -0.31% | yes |
| ret5Band | -20--5% | 68550 | 0.36% | -0.25% | 90226 | 0.58% | -0.41% | yes |
| ret5Band | 0-10% | 67262 | 0.27% | -0.34% | 95156 | 0.39% | -0.61% | yes |
| ret20Band | 0-20% | 56699 | 0.25% | -0.36% | 85791 | 0.34% | -0.66% | yes |
| ret1Band | 0-5% | 78773 | 0.25% | -0.36% | 111068 | 0.38% | -0.61% | yes |
| ret1Band | -5-0% | 85509 | 0.23% | -0.38% | 118179 | 0.39% | -0.61% | yes |

## Interpretation and limits

- Daily bars cannot reveal the minute a signal became available or the sequence of intraday high and low.
- A high-touch label is not an executable fill or a profitable strategy.
- Only feature buckets with enough observations in both halves should be considered for a later frozen test.
- No catalyst, social, point-in-time float, spread, halt, or order-book information is included in this price/volume-only pass.
- The study must be run on a cache that actually includes sub-$1 securities; source cache filters may otherwise bias coverage.

No bucket is approved as a buy signal by this report. Use the older half only to form a small number of hypotheses; freeze them before judging the newer half. Any eventual candidate needs minute-bar replay, realistic spread/slippage, catalyst timing, dilution checks, halal eligibility and paper tracking.

