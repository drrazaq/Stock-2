# Stock-2 engineering audit — 28 October 2026 (development branch)

**Scope:** Initial repository inventory and critical-path review, not a claim that every module or strategy has been audited. No production deployment, no trades, no merge to main.

## Confirmed evidence

- Repository tree at initial inspection: **871 entries**, including many experimental labs, scheduled workflows, tests and data files. Draft PR #1 was open and mergeable at inspection time; it remains a draft pending production acceptance.
- Live watcher for **28 Oct**: GitHub workflow_dispatch run `40694406777` began at **09:13 New York**, as independently recorded in `data/watcher-starts.jsonl`; its watcher job was still in progress at inspection time. The watcher waits until 09:25 before sampling. A later scheduled run was queued behind it, **not** evidence that the first watcher was down.
- Latest fully saved watcher day at inspection: **27 Oct**, first sample **09:49**, last **15:00**, **303 of 330 expected minutes** (91.8%), median 5,280 fresh-price symbols among about 12,737 received (43.4%); **0 approved alerts**. These figures include inactive tickers and should not be interpreted as 56.6% of tradable stocks missing.
- `data/ignition-lab.json` generated **24 Oct**: **48 ignition rule/exit variants, 0 passing** (33 rejected, 15 not proven). Window is **25 Oct 2024–23 Oct 2026**, approximately **two years**, *not* a five-year minute-bar test. **23,913 of 73,864** candidate stock-days had been tested (~32.4%). Results remain incomplete; do not infer a whole-market proof from the partial sample.
- `data/fastmover-lab.json` generated **25 Oct**: **10 five-year DAILY fast-mover rules rejected**. This is a different experiment from the two-year ignition minute-bar test. The 28 Oct daily fast-mover file had **55 paper candidates, 0 approved list entries**.
- `data/health.json` last saved **27 Oct**, with a weekly missed-runner-report warning; the warning is not independently verified as a job failure.

## Root-cause findings

1. **Discovery before the move is weak.** The early-wave observation detector requires a stock to be already up 2–15% and have unusual volume. It does not independently predict future 25%+ moves from prior-day catalysts. `premarket-check.mjs` is a premarket check of the owner's *existing holdings*, not a whole-market opportunity hunter.
2. **Penny-stock research was unnecessarily stale.** The stale-Massive snapshot fallback refreshed Alpaca prices only for stocks whose previous close was at least $1. Thus sub-$1 candidates were excluded from the live-refresh request, even though the observation ledger nominally accepts them. This does not justify automatically allowing sub-$1 trades.
3. **Approved alerts lacked a fresh bid/ask execution gate.** `maybeAlert` checked last-trade freshness and SEC status but did not require a fresh executable spread. A price spike alone is not an executable entry.
4. **The apparent lack of BUY recommendations is not solely over-strict filtering.** Most measured ignition variants lost money in one or both historical halves. Broadly loosening promotion rules without improving strategy quality would likely increase bad trades.
5. **The project needs separate labels for five-year DAILY tests versus two-year minute-bar ignition tests.** Early research text used the phrase '5-year test' for an ignition rule whose recorded test window is only two years.
6. **Data privacy is a separate unresolved workstream.** The repository is public and has tracked personal position/trade data. Do not disclose those contents in reports; complete an authorized privacy migration separately before assuming confidentiality.

## Development-branch changes made during this review

- `live-refresh-universe.mjs` and tests: preserve all >=$1 refresh requests and add up to **250** active $0.10–$1 stocks, ranked by observed dollar volume, **research only**. `ignition-watch.mjs` now uses the bounded selection. The under-$1 BUY restriction remains unchanged. Extra requests and rate limits must be observed in paper operation.
- `approved-quote-gate.mjs` and tests: require a fresh (<=120 s), valid bid/ask quote and provisional spread <=3% below $5 or <=2% at $5+ before an **approved** ignition BUY message. Unproven paper messages remain research only. This is a risk control, **not** proof of profitability or an entry optimization.
- `early-alerts.mjs` and regression tests: replace misleading '5-year test' wording with 'minute-bar history verdict' for ignition. `fastmover-lab.mjs` correctly retains a separate **five-year DAILY** rule label.
- `move-categories.mjs` and tests: candidates in gaps between the owner's four upside categories remain research-visible rather than being silently dropped; still **never** an automatic BUY.
- `.github/workflows/stock2-safety-ci.yml` expanded to cover the new modules and tests.

## Release blockers and next work

1. Confirm **both** the complete test suite and targeted safety CI pass on the final branch SHA. Do not merge while results are pending or failing.
2. Verify a **full** post-change watcher session, including start time, quote freshness, penny-refresh API cost/latency, and no accidental BUY alert from paper or sub-$1 lanes.
3. Build an actual **premarket whole-market candidate** research lane (not just holdings), joining point-in-time SEC acceptance timestamps, news, dilution risk, volume and sector/supply-chain relationships; report research leads without invented certainty.
4. Evaluate early entry and exit with contemporaneous bid/ask, slippage, halt exclusions, matched controls and 1/3/5/10-session outcomes. Use all attempted signals and report losers, not just winners.
5. Confirm ZAD status independently for any proposed trade, validate Telegram message acknowledgment in production, and review privacy before any merge.

**Progress indicator:** Prior overall **~45% subjective maturity estimate retained**. This is not an audited percentage of code complete and says nothing about expected profits. A passing CI run verifies code/test execution only, not live-market trading edge.
