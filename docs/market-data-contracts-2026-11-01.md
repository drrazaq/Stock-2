# Market-data contracts: timestamped volume, price roles and freshness (1 Nov 2026)

**Status:** investigation plus an INACTIVE offline module (`market-data-contracts.mjs`, `test/market-data-contracts.test.mjs`).
- No production file imports it; a test enforces this.
- No provider call, purchase, rule change or strategy-input change.
- Kept separate from the feed-integrity patch, which was reviewed and deployed on its own (main `b680988b`). This branch is `claude/market-data-contracts`: one commit on `main` containing only this package's four files.

## 1. Official documentation used (docs.alpaca.markets, read 1 Nov 2026)

| Ref | Page | Fact used |
|---|---|---|
| D1 | Market Data FAQ, "How are bars aggregated?" | Minute bar = trades in [t, t+60 s), stamped at the left edge. Daily bar = New York day. A bar is emitted only if none of o/h/l/c/v is 0, so a minute with no trades, or with only volume-only trades (for example a lone odd-lot `I`), has **no bar**. Extended-hours `T` trades add to minute and daily volume, but not to daily prices. The condition table decides which trades count. |
| D2 | Reference: Historical bars `/v2/stocks/bars` | `timeframe` 1Min…; `start`/`end` inclusive; `end` defaults to now with real-time access. `limit` ≤ 10,000 data points **in total** per page; sorted by symbol then time; `next_page_token`; `feed` sip/iex/boats/otc. |
| D3 | About Market Data API (subscription table) | Algo Trader Plus: all US exchanges real time, unlimited websocket subscriptions, **no historical restriction** (Basic: latest 15 min blocked), **10,000 historical calls/min**. |
| D4 | Real-time stock data (websocket) | `bars` emitted right after each minute mark, including pre- and post-market. `updatedBars` emitted after the half-minute mark when a late trade arrives for the previous minute. `dailyBars` emitted after each minute mark, holding all trades until emission. Trade corrections and cancels are pushed. Trading status: "To enable market data on a production environment please reach out to our sales team." |
| D5 | Reference: Latest quotes `/v2/stocks/quotes/latest` | Best bid/ask; sizes "in shares (round lots prior to November 3, 2025)"; exchanges; condition flags; RFC-3339 ns timestamp; price 0 = no active side; feed sip/iex/delayed_sip/…. |
| D6 | Reference: Snapshot | Latest trade, latest quote, latest minute bar, current daily bar, previous daily bar. The daily bar `t` is the session start; no as-of time for its cumulative volume. |
| D7 | Reference: Historical trades `/v2/stocks/trades` | Individual trades with conditions, size, price, exchange, ns timestamp; `limit` up to 10,000 per page; feed sip. |
| D8 | Historical Stock Data | IEX ≈ 2.5% of market volume (one exchange); SIP = 100% (CTA + UTP). |

## 2. What the current subscription supplies

| Requirement | Endpoint (Algo Trader Plus) | Supplied? | Caveat |
|---|---|---|---|
| Timestamped cumulative volume for time-sensitive gates | `/v2/stocks/bars?timeframe=1Min&feed=sip` with `start`=scope start, `end`=closed minute boundary (D2, D3) | **Yes, by documentation.** Each minute is stamped; the as-of is the boundary we choose. | Gaps can't be explained (see §3); REST settlement time is undocumented. |
| Exact per-minute volume, including volume-only trades | `/v2/stocks/trades?feed=sip` (D7) + the D1 condition table | **Yes, by documentation**, at a much higher data volume | We would apply the condition table ourselves; heavy for broad universes. |
| Streaming cumulative daily volume with emission time | websocket `v2/sip` `dailyBars` + `updatedBars` (D4) | **Yes, by documentation** (unlimited symbols) | Needs a persistent connection inside the watcher (new architecture). The per-account connection limit is not documented for the Trading API. |
| Untimed daily volume | snapshot `dailyBar.v` (D6) | Yes | **No as-of time.** Informational or daily rules only. |
| Consolidated best bid/offer for entry-quote evidence | `/v2/stocks/quotes/latest?feed=sip` or snapshot `latestQuote` (D5) | Yes | "Latest" can be old for illiquid names, so age must be checked. Sizes are round lots before 3 Nov 2025. |
| Pre-market trade price | latest trade / snapshot `latestTrade`, SIP (includes extended hours, D1) | Yes | Informational only (§4). |
| Prior-session close | snapshot `prevDailyBar` (D6) | Yes | Built by the D1 last-sale rules (closing-trade condition `6` updates it; official-close `M` does not). It can differ from the listing exchange's official close; confirm in verification. |
| Halt / LULD status | websocket `statuses` / `lulds` (D4) | **Not established** | The page says production status data needs the sales team. Treat as not in the subscription until confirmed. |

### Exact missing endpoint capabilities

1. **No as-of time** for snapshot daily volume (D6).
2. **No documented REST settlement or revision window** for minute bars. Only the stream's `updatedBars` timing is documented (D4).
3. **Bars can't tell "no trade" from "volume-only trades".** A sum of returned minute bars leaves out the volume of minutes that returned no bar, unless trades are reconciled (D1, D7).
4. **No documented maximum symbols per request** for bars, quotes or snapshots.
5. **Trading-status (halt) feed** isn't documented as part of Algo Trader Plus.

## 3. Timed aggregation method (implemented in `aggregateTimedVolume`)

### Volume classes
- `UNTIMED_DAILY`: the snapshot daily volume (and Massive totals without a usable as-of). Never offered to a time-sensitive gate.
- `RETURNED_BAR_SUM`: the sum of the qualifying SIP 1-minute bars **the API returned**, over a stated scope, through a stated closed minute. It is the only class a time-sensitive gate may be offered (`volumeMeetsGateEvidence`), always with its coverage limits (`COVERAGE_LIMITS`). It is not a complete count of every reported share.

### Rules
- **Source:** SIP 1-minute bars only. IEX is refused.
- **Session scope:** New York local, DST-correct (`nyLocalToUtc`).

  | Scope | Window |
  |---|---|
  | PRE | 04:00–09:30 |
  | REGULAR | 09:30–16:00 |
  | POST | 16:00–20:00 |
  | PRE_AND_REGULAR | 04:00–16:00 |
  | ALL_EXTENDED | 04:00–20:00 |

  A gate must state its scope. Today's strategy inputs don't (see §5).
- **As-of:** a closed minute boundary. A bar counts only if its whole interval lies in [scope start, as-of]. A bar still open at retrieval is never counted and is reported.
- **Revisions:**
  - volume of minutes that ended less than 60 s before retrieval is reported separately as **inside the revision grace**; the rest is **outside the grace**. Neither is a finality guarantee: corrections and cancels (D4) can still change a bar;
  - the 60 s is D4's half-minute late-trade mark plus margin, and must be confirmed (§6);
  - a gate's age check uses the grace boundary; `graceMs` must be an integer from 0 to 15 min;
  - `reconcileRevisions` lists every added, changed or removed minute between two retrievals and never merges silently.
- **Missing intervals:** minutes that returned no bar are listed, and the label is `SOME_MINUTES_RETURNED_NO_BAR` (else `EVERY_MINUTE_RETURNED_A_BAR`). The API does not say whether such a minute had no trades or only volume-only trades. A gate may refuse any minute without a bar.
- **Coverage:**
  - minutes expected vs minutes with bars, plus the trade count;
  - optional reconciliation against a later daily total for the same session: the minute sum may be lower (volume-only minutes) but **never higher**; higher is `CONTRADICTION` and the result is invalid.
- **Validation:** each bar must be minute-aligned and in the same New York session, with no duplicate or out-of-order minutes, positive integer v and n, and positive, consistent o/h/l/c/vw. Any failure makes the result `INVALID`.

### Request budget (`planBarRequests`)
- 300 symbols polled each minute: 2 calls/min (chunks of 200, since the limit is undocumented), 0.02% of 10,000.
- 12,000 symbols: 60 calls/min.
- A 390-minute backfill of 300 symbols: 16 calls.

## 4. Three separate price roles (implemented; never interchangeable)

| Role | Function | Use | Evidence label |
|---|---|---|---|
| Pre-market informational price | `premarketInfo` | Show the last SIP trade with its New York time, age and phase | `informationOnly` |
| Prior-close exit instruction | `priorCloseExit` | Previous session's daily close against the owner's stop, as an instruction for the open | `instructionForTheOpen`; not an order price |
| Entry quote evidence | `entryQuoteEvidence` | Whether a consolidated best bid/offer meets a strategy's stated quote checks at its timestamp | `QUOTE_CHECKS_PASSED_AT_QUOTE_TIME_NOT_A_FILL_GUARANTEE` |

**Entry quote checks** (every limit is required and validated; a missing, NaN, infinite or out-of-range limit is an argument error):
- feed SIP;
- clock present and not in the future;
- age ≤ the strategy's limit;
- both sides active (non-zero) and not crossed;
- spread ≤ the strategy's limit;
- ask size ≥ the strategy's minimum, in shares (quotes before 3 Nov 2025 are refused, because the unit was round lots);
- quote in the required session phase.

## 5. Strategy inputs that are time-sensitive today (no change made)

| Input (production `main`) | Source today | Class today | Time-sensitive? |
|---|---|---|---|
| `rv` = vol / average daily volume, `rvT` = rv / time-of-day curve (`ignition-watch.mjs`) | Massive `min.av` (15-min delayed, clocked) or SIP snapshot `dailyBar.v` (untimed) | Mixed | **Yes.** `rvT` compares against a curve by minute. |
| Line ~313: vol / (avg × elapsed fraction of the session) | Same | Mixed | **Yes** |
| Previous-day dollar volume ≥ 1e6 (model D) | Massive `prevDay` | Daily | No |
| 9:25 pre-market record (`data/premarket.jsonl`) | Massive | Clocked (15-min delayed) | Research record |

**Behavioural change, NOT made:**
- **What it would change:** feeding `rv`, `rvT` and the elapsed-fraction ratio from `RETURNED_BAR_SUM` instead of the current mix changes approved strategy inputs.
- **Silent switch:** must not be done.
- **Validation required** (proposal; needs owner approval and pre-registration):
  1. Record both values side by side (shadow) for 20+ sessions.
  2. Report per-minute differences and the decisions that would have changed.
  3. State the scope: the curve was learned from Massive cumulative totals, whose session scope (pre-market included or not) is not established here. A timed sum with a stated scope may be a different quantity, so the curve must be re-learned on the same scope.
  4. Pre-register acceptance before looking.
  5. Any switch is its own reviewed change.

## 6. Bounded protected verification (owner-run; not run here)

**What it is:** one workflow run with the existing secrets, during one regular session, writing **aggregate statistics only** (no account data, no raw prices kept beyond the run's artifact).

**Calls, in total:**
- **Universe:** 2 liquid ETFs/stocks (for example SPY and AAPL) plus 1 thinly traded listed stock chosen beforehand. Never the owner's holdings (privacy).
- **At T0 (about 11:00 New York):**
  - 1 × `/v2/stocks/bars` 1Min sip (start 04:00, end T0 floored);
  - 1 × `/v2/stocks/quotes/latest` sip;
  - 1 × `/v2/stocks/snapshots` sip.
- **At T0 + 90 s:** repeat the bars call with the same `start`/`end`, to measure revisions.
- **After 20:00 New York:**
  - 1 × bars for the full day;
  - 1 × `/v2/stocks/bars` 1Day;
  - 1 × `/v2/stocks/trades` for the thin stock over one 10-minute window.
- **Budget:** about 7 requests, no retries, a 10 s timeout each, no message, no order.

**Checks (each recorded PASS/FAIL):**
- the account returns real-time SIP (no 403/422 with `end` = now);
- the current minute is absent and the previous minute present;
- the revision count between T0 and T0+90 s, per field, for minutes outside the grace (measures whether the 60 s assumption holds);
- full-day minute sum ≤ daily bar volume, with the unaccounted share;
- the thin stock's gaps explained by `/trades` (volume-only vs none);
- quote sizes are in shares (after 3 Nov 2025);
- `prevDailyBar.c` vs the 1Day close of the prior session;
- the rate-limit headers.

**Not included:** halt status (needs Alpaca sales) and websocket connection limits (needs a separate, approved stream test).

## 7. Freshness: existing thresholds and proposed strategy-specific contracts

**Existing thresholds** (unchanged; approved where noted):

| Threshold | Where | Status |
|---|---|---|
| Signal price age ≤ 3 min (`MAX_SIGNAL_PRICE_AGE_MIN`) | `ignition-gates.mjs`, watcher signals and stop checks | In production |
| Quote age ≤ 120 s and spread < 10% (`MAX_Q_AGE`, `spreadFresh`, early-alert `fresh`) | `shadow-eval.mjs`, `ignition-watch.mjs`, `early-alerts.mjs` | In production |
| SQ15 options lane: max age 15 min, spread ≤ 5% | `squad15b-core.mjs` | In production (paper) |
| Pre-market 30-minute "CURRENT" label | (none) | **Removed; never in production.** I introduced it in feed-integrity revision 2 as a display label (not derived from data or any rule). Revision 3 removed it. The deployed pre-market check (`b680988b`) applies no freshness cut-off: it keeps production's decisions and shows each price's basis, source, New York timestamp and exact age. |

**Proposed contracts** (not active; each needs owner approval; values marked "to measure" must come from the §6 verification and a shadow period, not from a guess):

| Strategy / output | Price role | Proposed contract |
|---|---|---|
| Pre-market check: stop SELL | Pre-market info + prior-close exit | Unchanged rule: a SELL on any today's pre-market trade at or under the stop, or a prior close at or under the stop, always showing the basis and age. No freshness cut-off, because the action happens at the open. |
| Pre-market check: HOLD/WATCH | Pre-market info | Today (deployed): production decisions, exact age shown, no cut-off. Any future freshness label or cut-off would be a new proposal needing approval. It should come from measurement (the distribution of last-trade ages for liquid vs thin stocks at 08:40 over 20 sessions), not from a chosen number. |
| Watcher signals (IG rules, model D) | Signal price (trade) | Keep 3 min (approved). |
| Early alerts / shadow spread | Quote | Keep 120 s and 10% (approved). For any future *approved buy* line, add the entry-quote evidence checks: SIP, two-sided, not crossed, age ≤ 60 s (to confirm), regular-session phase, ask size ≥ the planned shares. |
| LEADER DIP entry (buy at the next open) | Prior-close signal + entry-quote evidence at the open | The signal is daily (close vs 50-day high and 200-day average), so no intraday freshness is needed. Any entry price shown must pass the entry-quote evidence checks in the REGULAR phase; otherwise it shows the prior close as "reference, not a price". |
| Time-sensitive volume gates (`rvT`, elapsed fraction) | Timed volume | `RETURNED_BAR_SUM` only, with its grace boundary ≤ 2 min old (to confirm), its coverage limits shown and a stated scope; the untimed snapshot volume is excluded. This is a behavioural change: §5 validation first. |

## 8. Files

- `market-data-contracts.mjs`: inactive pure functions (§3, §4, the budget).
- `test/market-data-contracts.test.mjs`: 26 offline cases, including one regression per reproduced defect (§9, §10) and "no production import".
- `docs/validation/market-data-contracts.proposal.json`: the capability matrix, verification plan and freshness proposals in machine-readable form.

## 9. Defects found in `d3bf78ba` and fixed (revision 2)

Each defect was reproduced against the published module with a probe script, before any fix. 18 of 20 probes reproduced on `d3bf78ba`; 0 reproduce on revision 2. Each has a regression test.

| # | Defect in `d3bf78ba` | Fix |
|---|---|---|
| 1 | Entry quote passed with `maxSpreadPct` missing (`spread > undefined` is false) | Every limit required: argument error |
| 2 | Entry quote passed with `maxAgeMs` missing | Same |
| 3 | Entry quote passed with `maxSpreadPct` NaN | Finite and range checks |
| 4 | An `Infinity` ask passed (with an infinite spread limit) | `NON_FINITE_PRICE`; spread limit must be in (0, 1) |
| 5 | NaN `nowMs` was reported as a "future quote clock" | Argument error `INVALID_ARGUMENT_NOW_MS` |
| 6 | `minAskShares` 0 or negative accepted | Positive safe integer required |
| 7 | Pre-market information accepted an `Infinity` price | Finite positive price required |
| 8 | Pre-market information accepted a NaN clock | Argument error |
| 9 | Prior-close instruction accepted an `Infinity` close | Finite positive close required |
| 10 | Prior-close instruction silently accepted an invalid stop (NaN) | Stop must be a positive finite number or `null` (no stop) |
| 11 | Negative `graceMs` accepted (NaN already threw, via another check) | Integer from 0 to 15 min |
| 12 | Infinite `dailyVolume` gave a non-invalid result | Safe integer ≥ 0 or `null`, else argument error |
| 13 | Revisions in open, high, low or VWAP were not detected (only v, n, c compared) | All seven bar fields compared; the changed fields are listed |
| 14 | Malformed revision evidence was silently dropped | Reported per side and index; the result is `comparable: false` |
| 15 | A duplicate minute in revision evidence silently collapsed | Reported as `DUPLICATE_MINUTE`; `comparable: false` |
| 16 | Gate eligibility with no `maxAgeMs` accepted any age | Argument error |
| 17 | Gate eligibility with a NaN clock was not an argument error | Argument error |
| 18 | "Settled" and "executable" wording overstated the evidence | Labels now say what was observed: returned-bar sum, inside or outside the revision grace, quote checks passed at the quote's time (not a fill guarantee), information only, instruction for the open |

Also tightened: bars with VWAP outside [low, high], or non-ISO timestamps, are malformed; the scope must be an own key (`'toString'` is refused); and the request planner rejects non-integer arguments.

## 10. Revision 3: calendar-exact timestamps

**Defect (reproduced on `c70040bd`):** `Date.parse` silently normalises impossible dates. For example:
- `2026-02-30T14:35:00Z` was read as 2 March, and an entry quote stamped with it passed its checks;
- a pre-market trade stamped `2026-04-31` was reported as a real trade;
- `nyLocalToUtc('2026-02-30', …)` threw only by accident.

**Fix:**
- `isIso` and `isCalendarDay` (now exported) check every field against the real calendar before `Date.parse` is trusted:
  - month 01–12;
  - day within the month, with Gregorian leap years: 2000 and 2024 yes, 1900 and 2026 no;
  - hour 00–23, minute 00–59, second 00–59 (no leap second);
  - offset hours 00–23 and minutes 00–59.
- **Supported formats:** `YYYY-MM-DDTHH:MM:SS`, an optional fraction of 1–9 digits, then `Z` or `±HH:MM`. Uppercase `T`/`Z` only. No missing offset, no `+HHMM`, no `+HH`.
- **Where the check applies:** bar, quote, trade and prior-close timestamps, and every session-day argument (`aggregateTimedVolume`, `premarketInfo`, `priorCloseExit`, `nyLocalToUtc`).

**Regression tests:** impossible dates, including non-leap 29 Feb and 31st days of 30-day months; valid leap days and month boundaries; the supported timezone formats and rejected variants; and every consumer refusing an impossible date.
