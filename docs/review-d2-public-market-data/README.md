# D2 review: provider market data in the public `Stock-2` repository (review only)

**Prepared by Claude on 8 Nov 2026 at the owner's request.**
- **Scope:** review only. No file was changed, moved or deleted, and no provider was contacted.
- **Snapshot:** `origin/main` `b0d76987` (537 files under `data/`, 126 MiB).
- **Not legal advice:** this reads the providers' public terms. It does not interpret the law.

## 1. What is public

The repository `drrazaq/Stock-2` is **public**, and the bot commits its `data/` folder there several times an hour. The website (`pages.yml`) publishes only `index.html`, but that page **reads its data straight from the repository** (`raw.githubusercontent.com`, e.g. `signals.json`). It therefore also *displays* repository data publicly.

An automated scan (`price-bearing-files.tsv`) found **184 of 537 data files** containing numeric price fields, **24 of them with bid/ask quote fields**.

| Tier | Files | Size | What is in them | Provider (from the writer's own calls and the records' `src`/`mode` fields) |
|---|---:|---:|---|---|
| **T1-a: intraday quotes and prices** | 30 | 7.5 MiB | Per-minute price, bid/ask, spread and +1/+15/+30-minute prices per stock (`data/shadow/*.jsonl.gz`, `ignition-runs/*/*.shadow.jsonl.gz`, `opp-ledger.jsonl`, `early-wave-obs.jsonl`, `ignition-live.json`, `ignition-runs/*/*.json`, `ignition-missed-history.jsonl`, movers/fast-mover state). **`premarket.jsonl` stores a ~4,190-stock pre-market price table every day.** | **Alpaca** SIP live prices (`data.alpaca.markets`; records say "alpaca live prices (SIP feed)") and **Massive** snapshots (`api.massive.com`, "Starter delayed"). Finnhub for some fields. Writers: `ignition-watch.mjs`, `shadow-outcomes.mjs`. |
| **T1-b: options quotes** | 2 | <0.1 MiB | Option bid/ask/spread survey and options paper lane (`options-spread-survey.json`, `options-shadow.json`) | **Alpaca** options data (OPRA-sourced). Writers: `options-survey.mjs`, `scan.mjs`. |
| **T1-c: analyst recommendations** | 2 | <0.1 MiB | Monthly archives of analyst buy/hold/sell counts (`analyst-archive-2026-1*.jsonl.gz`) | **Finnhub** "recommendation" (record field `source`). Writer: `smart-money.mjs`. |
| **T2: end-of-day prices inside signals, paper ledgers and lab results** | 150 | 36.8 MiB | Signal-day closes, entry/exit prices and outcomes per stock (`*-paper.jsonl`, `*-today.json`, `*-lab.json`, `signals.json`, …) | Daily bars from **Massive/Alpaca** (some **Twelve Data/Finnhub/FMP** fallbacks in `scan.mjs`). Mostly isolated points, not full series. |

The provider attribution for T2 is inferred from the writers' code paths, not stored per record. T1 attribution is direct (record fields and writer hosts).

## 2. Applicable public terms (quoted)

- **Alpaca:** Customer Agreement (public file "v25 2026.06"), §30: market data is for **non-professional** customers. *"I agree not to reproduce, distribute, sell or commercially exploit the market data in any manner without written consent from Alpaca."* Non-professional is defined by the Nasdaq/NYSE subscriber agreements as *personal, non-business use*. The owner's newly opened live account makes this agreement clearly applicable.
- **Massive:** Market Data Terms, last updated 3 Nov 2026, §5(c), prohibits: *"Share, redistribute, publish, sell, sublicense or rebrand Information, make it available to anyone else…"*. The licence *"does not permit you to share Information with anyone else"*, and *"You must protect Information against unauthorized access or disclosure."*
- **Finnhub:** Terms of Service: *"You hereby agree to not redistribute or share access to data **or derived results** from the data obtained from Finnhub with anyone or any 3rd party without written approval from Finnhub. All plan … is strictly for personal use."*
- **Exchange subscriber agreements**, incorporated by Alpaca and Massive: e.g. *"Subscriber shall not furnish Market Data to any other person or entity."*

**Reading:** a public repository and a public web page that reads from it make these data **available to anyone**. On the plain wording, T1 conflicts with all three providers' terms. T2 is lower-risk (isolated end-of-day points inside research outputs), but Finnhub's *derived results* wording and Massive's *publish* wording do not clearly exempt it. Nothing here proves a provider objects. The risk is contractual (termination of service or keys), and it **predates** the IG1 work.

## 3. Remedy options (smallest first; none applied)

1. **R1, the smallest practical step: stop new public exposure of T1.**
   - Write the T1 files to the **existing private data repository** (`stock-2-private-data`) instead of `Stock-2`, using the already-built `private-data.sh` and `.github/private-files.txt` mechanism. Code changes are limited to the T1 writers (`ignition-watch.mjs`, `shadow-outcomes.mjs`, `options-survey.mjs`, the options lane in `scan.mjs`, `smart-money.mjs`) and the private-files list.
   - This is a production change. It needs its own package, tests, Codex review and owner approval. The private-data cutover is currently **OFF** and was itself awaiting owner approval, so R1 can either reuse that cutover or be a narrower "T1 only" variant.
2. **R2: decide T2.** Either keep only percentages and outcomes public and move raw prices private, or move whole ledgers. Larger (150 files) and touches `index.html`. Recommended **after** R1, as a separate decision.
3. **R3: history.**
   - Past commits since about 15 Oct remain publicly readable even after R1/R2. Removing them needs a **history rewrite** (it breaks clones and needs a GitHub cache purge), which is disruptive. Recommended only if a provider asks.
   - Making the whole repository **private** would hide the history in one step. **But** private repositories pay for Actions minutes beyond the included allowance (about 2,000 minutes a month on the Free plan), and this repository's bot alone runs about 5.5 h at a time, around the clock. That is far beyond the allowance, and GitHub Pages from a private repository needs a paid plan. **Not practical without spending**, which is not authorized.
4. **R4: ask the providers.** One written question per provider (e.g. "may a non-professional keep derived research results in a public repository?"). It needs separate sending approval; none has been sent.

**Recommendation:** R1 as the next reviewed production package after the current work, then R2 as a separate decision. R3/R4 only if a provider raises it or the owner wants certainty.
