# Feed integrity: SIP/IEX attribution, errors and provider clocks (1 Nov 2026, revision 3)

**Status:** verified offline, then published on the separate branch `claude/feed-integrity`. Not deployed, not merged and not activated. No provider was contacted, and no feed default changed.

**Owner:** Claude, taking over from Codex, whose environment ran out of processes and threads. This is **not** Codex's unpublished candidate (`provider-integrity.patch`, SHA256 `a78e11d1…`). That candidate is on no GitHub ref and could not be verified. This work was rebuilt from published sources only:
- production `main`;
- the published development checkpoint `cfc8550d` (its `alpaca-feed.mjs`, `market-symbol.mjs` and `snapshot-fields.mjs`).

Revision 2 answers Codex's review of `3b91b7a`.

## Alpaca volume timestamp contract (official documentation, read 1 Nov 2026)

| Source | What it says |
|---|---|
| Snapshot reference (`docs.alpaca.markets/us/reference/stocksnapshotsingle`) | "A snapshot provides the latest trade, latest quote, latest minute bar, current daily bar and previous daily bar." Each bar `t` is "Timestamp in RFC-3339 format"; the example `dailyBar.t` is `…T04:00:00Z`. |
| Market Data FAQ, "How are bars aggregated?" | Bars are aggregated from trades. The trade time is truncated "to the day (in New York) for daily bars". "The timestamp of the bar is the left side of the interval." |
| Real-time stock data (websocket) | "Daily bars … contain all trades until the time they were emitted." This describes the **stream**, not the REST snapshot, so it is not used. |

**Contract applied:**
- `dailyBar.t` is the New York **session start**, not an as-of time.
- The REST snapshot states **no as-of time** for the cumulative daily volume.
- The latest minute bar's start is a separate observation and does not show when the daily total was computed.

**Implementation** (`snapshot-fields.mjs`):
- **Observed:** `volumeSessionStart` (dailyBar.t) and `volumeMinuteBarStart` (minuteBar.t).
- **Derived:** none. `vt` stays 0 and `volumeAsOf` is null, so the volume's age is unknown and it is never labelled "live".
- **Label:** `volumeBasis: SIP_DAILY_BAR_ASOF_UNSTATED`.
- **Rejected** (`volumeRejected` gives the reason) when it:
  - is not SIP;
  - has no session timestamp;
  - is a future session or not today's New York session;
  - has a future minute bar, or a minute bar from another session;
  - has a daily total below the minute bar's own volume.
- **Merge:** SIP daily volume replaces a clocked count (for example Massive's 15-minute-delayed total) only if it is not below that earlier count, because a cumulative total cannot shrink. Otherwise the earlier count stays, with `SIP_DAILY_BELOW_EARLIER_CLOCKED_COUNT`.
- **Heartbeat:** the watcher's median volume age (`volAgeP50`) now counts only volumes with an observed as-of time. Revision 1 had stamped SIP volume with the minute-bar start, which made it look about one minute old.
- **Source label:** reads "SIP daily volume (provider states no as-of time) for N".

## Scope (five runtime files)

| File | Change |
|---|---|
| `alpaca-feed.mjs` | Per-response feed label (`snapshotFeed`). SIP 403 is the only IEX downgrade; 422 is a failed request. 429 is not retried, and its pause is capped at 5 min. Network, JSON, unrequested-symbol and error-object answers return nothing. A `null` row drops only that symbol. The base must be the Alpaca data origin or a local test service. 10 s timeout, no redirects. |
| `market-symbol.mjs` | New. Syntax-only symbol check, from the development checkpoint. |
| `snapshot-fields.mjs` | New. Per-field provider clocks. Massive: the price clock follows the price actually used, never the snapshot's `updated` time. Alpaca: the volume contract above. `validateClocks`: a future price, volume or quote clock never vouches for its value. Merges refuse future clocks and crossed quotes. |
| `ignition-watch.mjs` | SIP is judged per response. The top-50 fallback applies the same per-field clock validation (future volume, price and quote clocks are rejected; the newer valid clock wins) and keeps its original field set. The source label names this minute's feeds. The refresh symbol scope and decision tree are unchanged. |
| `premarket-check.mjs` | New York date for "today's" trade. Every line names its price basis (below). The header names the response feed. |

## Pre-market check: production decisions, with evidence on every line (revision 3)

**Revision 3 removes revision 2's 30-minute cut-off.** That cut-off, the CURRENT/STALE labels and the NO CURRENT PRICE section are gone. They had changed decisions (a HOLD/WATCH on a non-current price moved to a new section), and no freshness contract for this message is approved.

**Decisions are production's, unchanged:**
- `px` = today's pre-market trade, otherwise the prior close;
- at or under the stop → SELL at the open;
- the ACTIONS and last-night-scan SELLs;
- within 3% of the stop → WATCH;
- otherwise HOLD (also when no price exists, as before).

The one input correction kept from revision 1: "today" is the New York date, so a 7–8 pm after-hours trade from the previous evening is not today's pre-market trade.

**Evidence on every line:**

| Basis | Shown |
|---|---|
| PREMARKET_TRADE | price, feed (SIP or IEX), New York time to the second, exact age (h/min/s), change vs the prior close |
| PRIOR_CLOSE | price and source: SIP/IEX snapshot previous-day bar with its session date, snapshot daily bar with its session date, or last night's scan with its session |
| NONE | "no price available" (with the feed note) |

- **HOLD/WATCH lines** end with the basis: "Based on the pre-market trade above.", "Based on the prior close, not on a price from today.", or "No price: this is the default, not an assessment."
- **A stop SELL on the prior close** reads "PRIOR-CLOSE INSTRUCTION: the prior close is at or under your stop (no price from today)". It is kept distinct from a stop SELL on a pre-market trade.
- **No wording** calls a price current, fresh or fit for an entry.

**Decision preservation:** an 80-case grid (5 price bases × 4 price levels × 4 instruction types) through production main `c7d95f01` and this branch gives identical SELL/WATCH/HOLD per symbol (60/8/12 each, 0 differences). The after-hours UTC-date case is left out of the grid, because it is a deliberate input correction.

## Defects fixed (each reproduced on production by the tests)

1. **IEX volume read as SIP** under concurrent requests (shared mutable feed label).
2. **422 treated as an entitlement downgrade.**
3. **429 retried immediately.**
4. **Massive daily close** clocked by the snapshot's `updated` time.
5. **Volume clocked by the trade time.**
6. **Top-50 fallback volume:** it discarded same-response SIP volume, and kept future-clocked Massive volume.
7. **Pre-market check:** used the UTC date (from 2 Nov a 7–8 pm New York after-hours trade would have looked like today's pre-market), and showed no source, timestamp, age or price basis.
8. **Source label:** a process-wide guess, now replaced by the feeds actually observed.

## Test repairs (test files only; assertions preserved)

- **`test/bot-actions.test.mjs`:** the `section()` helper ended a section at any capitalised heading. On Sundays the weekly scoreboard adds "THIS WEEK" inside RECORDS, which cut RECORDS before the PRACTICE ACCOUNT line. The helper now ends a section only at the documented top-level headings. The production message was correct throughout.
- **`test/watcher-incident-revision.test.mjs` and `test/watcher-resilience.test.mjs`:** these ran the watcher for `IG_DAY=2026-10-30` with the real `Date.now()`, and the synthetic trade times also used the real clock. On another calendar day (here Sunday 1 Nov) the stop alert did not fire. The watcher process (`--import` clock) and the stub's trade times now share one frozen fixture clock: 30 Oct 15:00 New York (minute 900), advancing in real time, plus the existing retry shift.
- **Correction:** the earlier explanation for these 8 failures ("gated tests run against the wrong watcher") was wrong.
- **Result:** all 9 previously failing cases pass, against both the production watcher and this branch's watcher.

## Remaining limitations

- **Codex's candidate:** `a78e11d1…` is unavailable and unverified.
- **V2 outcomes file:** `sec-proof-ready-outcomes.mjs` (an interrupted write) is UNKNOWN and was not reconstructed.
- **Live behaviour is unverified:**
  - SIP entitlement and endpoint/key mapping;
  - real snapshot field behaviour, BBO ages, sizes and coverage.

  These need the owner's protected checks.
- **SIP daily volume** is used with an unknown age, because the provider states none. Volume rules therefore rest on a figure whose freshness is not established; only consistency checks back it.
- **Massive stays 15 minutes delayed.**
- **One-sided Alpaca quotes** (no bid) no longer replace Massive's quote.
- **A future-clocked price** in the top-50 fallback with no other source is dropped (price 0, so not evaluated).
- **Deployment** needs independent review and owner approval.

## Revision 3 verification (exact patch on production main)

- **Patch:** `docs/validation/feed-integrity.patch` applied with `git apply` to a clean worktree of production main (hash in the manifest). The 12 resulting files are byte-identical to this branch.
- **Full suite with the gated process tests** (`INCIDENT_WATCHER_SRC` set to the exact tree's watcher): 127 files, 1,246 pass, 0 fail, 0 skipped. This includes `watcher-incident-revision` 11/11, `watcher-resilience` 9/9 (8 actual-watcher process cases) and `sec-request-runtime` 10/10.
- **Hosted-CI-equivalent loop** (`node "$f"`, no gated variable): 126 files, 0 failed.
- **Production main baseline:** 124 files, 1,212 pass, 9 fail. These are the 9 failures that the test-only repairs above fix.

**Verification limitation:** these suites, including the `INCIDENT_WATCHER_SRC`-gated actual-watcher process tests, were run only in this Claude session and by hosted GitHub CI. Hosted CI does not set the gated variable, so it does not run the gated process tests. Codex's runtime cannot currently run any of these suites (process and thread exhaustion), so none of this has been independently reproduced by Codex.
