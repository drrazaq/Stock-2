# Stock-2 Squad 32: Pathways Search Results (17 Nov 2026)

Every rule below was written into the code, with its pass tests, **before** its 5-year numbers were seen. The first verdict is frozen.

**Data**
- Prices: 1,247 US market sessions (29 Nov 2021 – 16 Nov 2026), every stock including dead ones.
- Costs: ZAD's ~3 USD per order (0.6% on a 1,000 USD round trip) plus a spread charge by price.
- Halves: entries before and from 1 Mar 2024.

**Pass tests**
- **TRY SMALL (makes money):** 60+ trades, a profit in both halves, t ≥ 2.5, still a profit at 1.5x costs, and still a profit without the 2 best trades.
- **BEATS SPY:** the edge over SPY on the same days is positive in both halves, with a month-clustered t ≥ 2.0.
- **WINNER:** passes both.

## Result: no WINNER among the trading rules; the few-order halal baskets are the best path found (batch 3)

### Batch 0: Connors TPS as one order (code: decoded-lab.mjs, CHECK=TPS1)

DEC2-TPS is marked PROVEN in the library, but only because it adds to losing trades (four buys). As a single 1,000 USD order it fails.

| Rule | Trades (older / newer) | Avg after costs | Edge vs the average stock, block t | Verdict |
|---|---|---|---|---|
| TPS1-A: buy the next open after the signal | 17,345 / 50,423 | −0.60% / −0.39% | −6.6 / −8.2 | NOT PROVEN |
| TPS1-D3: buy after the 2nd lower close | 8,048 / 23,004 | −0.40% / −0.32% | −3.6 / −4.4 | NOT PROVEN |
| TPS1-D4: buy after the 3rd lower close | 5,598 / 15,487 | −0.41% / −0.36% | −3.1 / −3.6 | NOT PROVEN |

The 78% win rate falls to about 56% once the averaging-down is removed. Selling at the next open instead of the close gives the same picture.

### Batch 1: event rules with long holds (squad32-lab.mjs)

| Rule | Trades | Avg after costs (older / newer) | t | vs SPY (older / newer), month t | Verdict |
|---|---|---|---|---|---|
| SPIN-2-126: spin-off, buy day 2, hold 6 months | 62 | −12.3% / −16.6% | −3.64 | −11.2% / −14.6%, −3.30 | REJECTED |
| SPIN-21-126: spin-off, buy day 22, hold 6 months | 33 | −2.9% / −9.8% | −0.74 | −6.1% / −1.6%, −0.69 | TOO FEW (and losing) |
| SPIN-21-252: same, hold 1 year | 33 | −3.5% / −21.3% | −1.10 | −20.8% / −19.2%, −2.41 | TOO FEW (and losing) |
| SPDEL-63: S&P 500 removal, hold 3 months | 55 | −4.6% / +3.2% | 0.11 | −9.4% / +3.2%, −0.76 | TOO FEW |
| SPDEL-126: same, hold 6 months | 55 | −7.6% / +7.6% | 0.04 | −15.3% / +2.4%, −1.33 | TOO FEW |
| **SPADD-RUN: S&P 500 addition, buy after the announcement, sell before it joins** | 64 | −0.7% / +2.4% | 0.74 | **+2.1% / +2.4%, 2.54** | NOT PROVEN |
| SPADD-63: S&P 500 addition, hold 3 months after it joins | 86 | +2.2% / +3.1% | 0.47 | +0.8% / +4.8%, 0.73 | NOT PROVEN |

- **Spin-offs:** 119 SEC Form 10-12B filers. 63 became listed stocks; companies with no current ticker were matched by company ID, so failed spin-offs count. Only 33 qualified for the day-22 entry. Spin-offs lost heavily in this period, so the 1990s "spin-off effect" did not hold.
- **SPADD-RUN:** this was the only rule that beat SPY in both halves. It lost money in absolute terms in 2022, so it does not pass.

### Batch 2: replication of SPADD-RUN

This batch was chosen after seeing batch 1, and that is disclosed. It ran the same rule, unchanged, on a new sample.

| Rule | Trades | Avg after costs (older / newer) | t | vs SPY, month t | Verdict |
|---|---|---|---|---|---|
| MID-ADD-RUN: S&P MidCap 400 additions | 208 | −3.6% / −1.8% | −4.81 | −1.06%, −2.61 | REJECTED |
| SML-ADD-RUN: S&P SmallCap 600 additions | 250 | −2.2% / −0.9% | −3.24 | −0.19%, −0.38 | REJECTED |
| ALL-ADD-RUN: both pooled (primary) | 458 | −2.8% / −1.3% | −4.72 | −0.66%, −1.79 | REJECTED |

The pre-inclusion run did not replicate. Professional traders buy these stocks before the public announcement trade can, so the S&P 500 result (64 trades) is most likely luck.


## Batch 3: few-order halal baskets (squad10-core.mjs, SQ32-EW*)

The owner pointed out that ZAD charges about 3 USD per stock per order and allows at most 1,000 USD per trade.

These four rules were pre-registered on 17 Nov 2026:
- Equal weight, about 1,000 USD per stock.
- The largest US companies passing the Shariah screen proxy.
- Same data, engine and costs as Squad 10: 0.4% per side on the money traded.

| Rule | Name swaps in 5 years | CAGR older / newer half | SPUS older / newer | 5-year total vs SPUS | Max drop vs SPUS | Verdict |
|---|---|---|---|---|---|---|
| SQ32-EW5-Q: top 5, quarterly | **1** | +1.9% / +29.8% | +0.5% / +18.6% | **+119% vs +65%** | −46% vs −28% | NOT PROVEN (block t 0.5 / 1.1) |
| SQ32-EW10-Q: top 10, quarterly | 11 | +1.9% / +24.6% | +0.5% / +18.6% | — | −39% vs −28% | NOT PROVEN (block t 0.6 / 0.8) |
| SQ32-EW10-Y: top 10, yearly | 5 | +1.5% / +31.3% | +0.5% / +18.6% | **+125% vs +65%** | −37% vs −28% | TOO FEW CASES (yearly) |
| SQ32-EW5-Y: top 5, yearly | — | −1.6% / +30.2% | +0.5% / +18.6% | — | −46% vs −28% | TOO FEW CASES |

**Fees in practice**
- SQ32-EW5-Q: 5 buys (about 15 USD) and 1 swap (about 6 USD) in 5 years.
- SQ32-EW10-Y: 10 buys (about 30 USD) and 5 swaps (about 30 USD) in 5 years.
- Only names that change are traded.

**Current members, all marked ok in the owner's ZAD list (data/halal.json)**
- SQ32-EW5-Q: AAPL, AMZN, GOOGL, MSFT, NVDA.
- SQ32-EW10-Y: AAPL, AMZN, AVGO, GOOGL, LLY, META, MSFT, NVDA, TSLA, WMT.

**Honest limits**
- This beat SPUS and SPY in both halves, which no stock-picking rule here has done. It is still not statistically proven: 5 years is too short for portfolio rules.
- It is largely a bet that the biggest companies keep leading, as they did in 2021–2026.
- Its worst drop was much deeper than SPUS's (−46% vs −28% for the top 5).

## What this means

- **Total tested:** about 860 rules, from penny stocks, news and insiders to Congress, momentum, dips, Connors, spin-offs and index changes. Every short-hold stock-picking rule failed after ZAD costs.
- **The cost wall:** at 1,000 USD per trade, 6 USD round-trip fees are 0.6%. Most published edges are smaller than that.
- **Still evidence-backed (not statistically proven):**
  - The halal top-10/20/30 quarterly basket, which beat SPUS in both halves.
  - The GLD 30% sleeve.
  - Monthly SPUS/HLAL buying (the core plan).

## Sources

- SEC EDGAR full index: https://www.sec.gov/Archives/edgar/full-index/
- S&P 500 changes: https://en.wikipedia.org/wiki/Historical_components_of_the_S%26P_500
- S&P 400 changes: https://en.wikipedia.org/wiki/List_of_S%26P_400_companies
- S&P 600 changes: https://en.wikipedia.org/wiki/List_of_S%26P_600_companies

## Repository

- Branch `squad32-pathways`: squad32-core.mjs, squad32-lab.mjs, test/squad32-core.test.mjs, .github/workflows/squad32-lab.yml, and data/squad32-*.json.
- Branch `squad32-tps-single`: CHECK=TPS1 in decoded-lab.mjs, with results in data/decoded-check-tps1.json.
- Neither branch is merged to main.

Research only, not advice. The system never places orders, and halal is decided only by the owner's ZAD marks.
