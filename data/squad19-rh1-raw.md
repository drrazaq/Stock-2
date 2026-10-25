# Stock-2 Runner Hunter RH1 — research report

- Version: RH1-2026-10-25
- Status: RESEARCH_ONLY_NOT_A_TRADING_RULE
- Target: next-session high >= 40% above signal-day close; secondary outcome is >=25% upside from next open to high

## Overall results

- Signal rows: 945924
- 40%+ next-session high from prior close: 8990 (0.95%)
- 25%+ remaining upside from next open to high: 14431 (1.53%)
- Mean next-open to close: -0.25%
- Mean net next-open to close at base cost: -1.85%
- Mean net next-open to close at stress cost: -2.65%

## Frozen split

- older: n=457606; 40% target rate=0.73%; 25% remaining-upside rate=1.27%; mean net open-to-close=-1.87%
- newer: n=488318; 40% target rate=1.16%; 25% remaining-upside rate=1.77%; mean net open-to-close=-1.83%

## Feature buckets with highest older-half lift

| Feature | Bucket | n older | 40% rate older | lift older | n newer | 40% rate newer | lift newer | Stable direction |
|---|---|---:|---:|---:|---:|---:|---:|---|
| ret1Band | 15%+ | 14450 | 5.35% | 4.62% | 18396 | 6.75% | 5.58% | yes |
| rvolBand | 4x+ | 25012 | 4.69% | 3.96% | 30998 | 6.99% | 5.83% | yes |
| ret5Band | 20%+ | 36077 | 3.14% | 2.41% | 42534 | 4.39% | 3.23% | yes |
| ret20Band | 50%+ | 27617 | 2.81% | 2.08% | 35843 | 4.12% | 2.96% | yes |
| ret5Band | <-20% | 29174 | 1.97% | 1.25% | 35584 | 3.33% | 2.17% | yes |
| priceBand | 0.10-0.99 | 74573 | 1.87% | 1.15% | 80745 | 2.96% | 1.80% | yes |
| compressionBand | range-expanded | 83288 | 1.55% | 0.83% | 93580 | 2.33% | 1.17% | yes |
| rvolBand | 2-3.99x | 38263 | 1.25% | 0.52% | 39659 | 1.80% | 0.64% | yes |
| ret1Band | <-5% | 78668 | 1.21% | 0.49% | 84300 | 2.18% | 1.02% | yes |
| ret1Band | 5-15% | 58324 | 1.02% | 0.30% | 60184 | 1.49% | 0.33% | yes |
| near20High | within-3%-of-prior-20d-high | 49802 | 1.01% | 0.29% | 56071 | 1.47% | 0.31% | yes |
| ret20Band | <-20% | 113927 | 0.95% | 0.22% | 103739 | 1.83% | 0.67% | yes |
| ret20Band | 20-50% | 44366 | 0.87% | 0.14% | 51121 | 1.22% | 0.06% | yes |
| priceBand | 1.00-1.99 | 109629 | 0.84% | 0.11% | 121752 | 1.20% | 0.04% | yes |
| closeLocationBand | upper-middle | 104044 | 0.78% | 0.06% | 112918 | 1.17% | 0.00% | yes |
| near20High | 10%+-below-prior-20d-high | 328034 | 0.78% | 0.06% | 342419 | 1.30% | 0.14% | yes |
| closeLocationBand | top-quarter | 102953 | 0.73% | 0.00% | 104634 | 1.07% | -0.09% | no |
| ret5Band | 10-20% | 42176 | 0.71% | -0.01% | 45448 | 1.08% | -0.08% | yes |
| closeLocationBand | bottom-quarter | 140245 | 0.71% | -0.01% | 148330 | 1.21% | 0.05% | no |
| closeLocationBand | lower-middle | 110364 | 0.68% | -0.04% | 122436 | 1.18% | 0.02% | no |
| compressionBand | range-compressed | 124939 | 0.57% | -0.16% | 140688 | 0.96% | -0.20% | yes |
| compressionBand | normal-range | 249379 | 0.53% | -0.20% | 254049 | 0.84% | -0.32% | yes |
| rvolBand | 1-1.99x | 131181 | 0.48% | -0.24% | 130510 | 0.62% | -0.54% | yes |
| ret20Band | 0-20% | 107292 | 0.44% | -0.28% | 126697 | 0.61% | -0.55% | yes |
| ret5Band | -20--5% | 134149 | 0.43% | -0.30% | 130232 | 0.73% | -0.43% | yes |
| rvolBand | <1x | 263150 | 0.39% | -0.33% | 287151 | 0.69% | -0.47% | yes |
| ret5Band | 0-10% | 127305 | 0.39% | -0.34% | 139034 | 0.54% | -0.62% | yes |
| ret20Band | -20-0% | 164404 | 0.37% | -0.36% | 170918 | 0.53% | -0.63% | yes |
| priceBand | 2.00-4.99 | 273404 | 0.37% | -0.36% | 285821 | 0.64% | -0.53% | yes |
| ret1Band | 0-5% | 148547 | 0.34% | -0.38% | 159211 | 0.54% | -0.62% | yes |

## Interpretation and limits

- Daily bars cannot reveal the minute a signal became available or the sequence of intraday high and low.
- A high-touch label is not an executable fill or a profitable strategy.
- Only feature buckets with enough observations in both halves should be considered for a later frozen test.
- No catalyst, social, point-in-time float, spread, halt, or order-book information is included in this price/volume-only pass.
- The study must be run on a cache that actually includes sub-$1 securities; source cache filters may otherwise bias coverage.

No bucket is approved as a buy signal by this report. Use the older half only to form a small number of hypotheses; freeze them before judging the newer half. Any eventual candidate needs minute-bar replay, realistic spread/slippage, catalyst timing, dilution checks, halal eligibility and paper tracking.

