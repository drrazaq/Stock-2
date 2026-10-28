# Stock-2 V3.0 opportunity audit (28 Oct 2026)

Status: audit written 28 Oct 2026. **Owner approved fixes 1, 2 and 3 the same day ("do 1, 2, 3"); they are implemented** in `ignition.yml`, `ignition-watch.mjs`, `radar-v3-core.mjs`, `opportunity-radar.mjs`, `opportunity-radar.yml` and `scan.mjs` (`actionsText`, `radar on/off`), with tests. The rest of this file is the audit as written before the change. Every number below comes from files in this repo, read on 28 Oct 2026. Where a fact could not be checked, it says UNVERIFIED.

---

## Summary

1. **The system does see the movers.** On 27 Oct the live watcher logged all four of your stocks (BRAI, OPENZ, AEYE, OWLS). In the 8 watched days from 16 to 27 Oct it logged 1,711 stocks that rose 15%+ in a day.
2. **What stops them reaching you is mostly the message settings, not a missing strategy.** Three switches are ON by default (none is written in `data/settings.json`, so each defaults to ON):
   - `quiet`: mutes the movers radar, the discovery engine, the early-wave watch cards and FAST MOVERS.
   - `opportunitiesOnly`: mutes RUNNERS NOW and every paper ignition alert. 1,304 paper signals were recorded from 14 to 27 Oct; only 6 alerts went out (19 and 20 Oct), and none since.
   - `focus`: replaces the opportunities board with "send opportunities" and adds the "halal index fund / hold cash" text.

   This is why the messages read as long-term advice.
3. **There is a real timing gap.**
   - The live watcher starts 38 to 49 minutes late every day: GitHub runs it at about 9:38 to 9:49 New York, and on 26 Oct only at 11:10.
   - So the open and the whole pre-market are blind.
   - The "pre-market volume" study that the bot says has been "COLLECTING since 15 Oct" has collected **zero rows**. `data/premarket.jsonl` does not exist, because the job never runs before 9:30.
4. **Seeing a runner is not the same as being able to profit from it.**
   - **After a gap:** stocks that were already up 20%+ when first seen (n=469, $1+) **fell a median 19% from there to the close**. Only 4% closed 2.6%+ above the first-seen price.
   - **Across all quiet-build-up signals:** the unbiased sample (IG8, 973 paper trades, 624 stocks) averaged **−0.7% a trade after costs**, with a 40% win rate.
   - **One positive paper record, on a rejected rule:** IG1 (the opening run rule) has 68 live paper trades at +2.1% a trade after costs (+1.2% at stress cost), over only 8 days. But IG1 was **REJECTED** in its 5-year history test (`data/ignition-lab.json`). It cannot become an approved signal; at most it can earn a place on the comeback board under that board's own bar. (Corrected 28 Oct: an earlier draft called it a near-qualifier.)

---

## Deliverable 1: what actually happens (pipeline map)

| Step | Where in the code | What it does | Is it shown to you? |
|---|---|---|---|
| Whole-market live watch (12,737 symbols, every minute, 9:38–15:00) | `ignition-watch.mjs`, `.github/workflows/ignition.yml` | Logs every mover from the first minute it is seen; paper-logs rules IG1–IG9 | Alerts only for rules that passed history AND live paper (none qualify). Early alerts are blocked by `opp-mode.mjs` `sendAlert` (opportunitiesOnly) |
| 15%+ mover ledger | `missed-runners.mjs` (`MR_LEDGER_ONLY`), `data/ignition-missed-history.jsonl`, `data/ignition-days.jsonl` | Per-stock first-seen time, price age, reason code | Only one line in ACTIONS (`actionsLine`) |
| Gainers heads-up | `scan.mjs` `fastMovers()` (~line 1981) | RUNNERS NOW / FAST MOVERS | RUNNERS NOW needs `opportunitiesOnly === false`; FAST MOVERS needs quiet off. **Both off by default** |
| Early-wave radar (~274–320 prepared uptrend stocks) | `intraday-radar.mjs` lines 264–265 | PRE-WAVE WATCH, BREAKOUT, PULLBACK REVIEW | Watch cards only if not quiet; review cards only if a tested BUY. **Muted** |
| Movers radar + news behind moves | `movers.mjs` line 38 | Day's movers with news, volume build-up watch | `if (!QUIET)`: **muted** |
| Discovery engine | `discover.mjs` line 93 | Small fast-growing companies (SEC check) | `if (!QUIET)`: **muted** |
| ACTIONS (nightly) | `scan.mjs` `actionsText` (~line 2462) | Sells, LEADER DIP, TRY SMALL paper, holds | Shown. Under FOCUS it adds "YARDSTICK: S&P 500 beat every long-term method… halal index fund" and "FOCUS MODE… long-term money in a halal index fund"; the opportunities board is replaced by "send opportunities" (line ~2540) |
| News threats | `news-watch.mjs` | Threat headlines for holdings only | Shown (holdings only, not a discovery tool) |

**The suppression funnel, 8 watched days (16–27 Oct), every stock that rose 15%+ intraday:**

| Reason code | Count | Type |
|---|---|---|
| UNDER_1_USD | 526 | Hard rule (kept) |
| VOLUME_FIGURE_LATE | 471 | Data. **Already fixed 23 Oct** (live SIP volume); now about 5 a day |
| AFTER_11_00 | 230 | Timing rule (the 11:00 cut-off) |
| LOW_VOLUME | 142 | Rule threshold |
| NOT_VISIBLE_LIVE | 141 | Data (no live quote; only 43% of symbols have a fresh price each minute) |
| CAUGHT_RULE_NOT_PASSED | 86 | **Promotion gate**: a rule fired, but on paper only |
| CAUGHT_PAPER_GATE_NOT_MET | 55 | **Promotion gate** |
| GAPPED_AT_OPEN | 44 | Timing (the move happened before the watcher started) |
| VISIBLE_TOO_LATE | 10 | Timing |
| SEC_CHECK_UNAVAILABLE | 5 | Data |
| ALERTED | 1 | Sent |

- 141 movers (86 + 55) were caught by a rule in time but hidden **only** by a promotion gate. Under V3.0 these belong in a labelled research panel, not deleted.
- The 20-session window asked for is not available. The ledger starts 14 Oct; 8 of 10 days have full tallies.

## Deliverable 2: the four runners, 27 Oct 2026 (point-in-time, from the watcher's own log)

Previous closes and prices are from the watcher feed (Massive snapshot + Alpaca SIP). Times are New York. "From first seen" assumes buying at the first price the system saw, with no costs.

| | BRAI | OPENZ | AEYE | OWLS |
|---|---|---|---|---|
| Previous close | $2.12 | under $1 | $7.42 | $2.04 |
| Open gap | **+52%** | **+56%** | +9% | +1% |
| First seen by Stock-2 | 09:49 at +47% (live) | 09:49 at +56% (price 16 min old) | 09:49 at +26% (live) | 09:49 at +3% (price 8 min old); live 09:50 at +1% |
| +5% / +10% reached | before 09:49 | before 09:49 | before 09:49 | 10:06 / **10:18 (live)** |
| Day's high vs previous close | +95% | +74% | +41% | +25% |
| After first seen: best / worst / last | +33% / −3% / +28% | +11% / −22% / −12% | +11% / −3% / +6% | +21% / −2% / +21% |
| Close (nightly scan, 1-day gain) | +56% | n/a | +37% | n/a |
| Paper rules that fired | IG1 09:49 $3.11; IG4; IG5 10:35; IG9 10:39 | none (under $1) | IG9 10:57 $9.68 | none: volume only 0.1× normal; price older than 3 min when it qualified; +20% after 11:00 |
| Why you got nothing | Rules not proven + opportunitiesOnly | Under $1 (hard rule) | Rule not proven + opportunitiesOnly | Timing / volume rules |
| Tips seen beforehand (follow lane) | StockTwits Georgee23 bullish 21:53 on 26 Oct and 09:13; TickerRoom "premarket movers" 07:02 | none | TickerRoom "market runners" 12:33 (after the move) | RedChip (paid investor-relations channel) videos for months; none that day |
| Catalyst | **UNVERIFIED**: SEC and news access is blocked from this session and the paid news tools have no credit. No SEC event in the repo's 10-day file | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED**; no SEC event in the repo file |

**Notes and doubts:**

- **BRAI close:** the watcher's last price (15:00) implies about $3.99 (+88%), but the nightly scan's 1-day gain is +56% (about $3.31). This needs a daily-bar check before any number is quoted.
- **OPENZ:** it looks like a **warrant**, not a common stock. It is very likely Opendoor's "Series Z" warrant (OPEN family: OPENW / OPENL / OPENZ); this is UNVERIFIED. A warrant is not tradable under the Stock-2 rules and is not covered by ZAD halal marks.
- **The four are now on the AVOID list:** BRAI and AEYE now sit on the nightly "lottery" AVOID list (one-day jumps of +56% and +37%). The tested finding behind it is that such stocks lag the market by about 3% a month.

**Was a realistic +2% net trade available after detection?**

- **BRAI and AEYE:** only by chasing gaps that were already +26% to +47%. Across 469 such cases, that bet lost a median 19% by the close. On these two days it happened to work; that is not evidence of an edge.
- **OPENZ:** not tradable (under $1, likely a warrant).
- **OWLS:** this was the one genuinely early sighting (live at +1%, +5% by 10:06). Its remaining gain was real in hindsight (+18% to 21%). But it was thin (0.1× normal volume) and covered by a promoter whose 458 tracked calls averaged −4% at 60 days (median −17%). The unbiased version of "quiet early build-up" (IG8, 973 trades) loses 0.7% a trade.

**Matched failures (controls) from the same ledger:**

- $1+ stocks already up 20%+ at first sight: n=469; 70% closed below the first-seen price; median −19%.
- $1+ stocks that gapped 20%+ at the open: n=301; median −19%.
- Note: the "seen live under +5%" group looks great (median +15%), but it is **hindsight-selected**: those stocks are only in the ledger because they later ran. The fair test is the paper ledger, which logs every signal.

**Minimal change that would have helped visibility:**

1. Start the watcher before the open. Today the cron is 13:05 UTC and GitHub adds 35–45 min.
2. Show rule hits labelled PAPER / NOT AN APPROVED BUY instead of discarding them.

Neither would have guaranteed a winning trade.

## Deliverable 3: data sources actually connected

From the code and workflows; the key values were not seen.

| Source | Used by | Timeliness | Notes |
|---|---|---|---|
| Massive snapshot (`MASSIVE_KEY`) | 62 scripts | 15 min late (Starter) | Main universe and volume |
| Alpaca data (`ALPACA_KEY`, paper) | 15 scripts | Live SIP prices, but only ~43% of symbols have a fresh print each minute | Fixed most volume lag on 23 Oct |
| SEC EDGAR (`SEC_UA`) | 51 scripts | Filing acceptance time | Free, official |
| Finnhub | 11 | News and peers | News watch covers holdings only |
| FMP, Twelve Data, Alpha Vantage, TipRanks | 3–6 each | Various | Alpha Vantage news is a premium endpoint (refused today) |
| YouTube API + StockTwits | `follow-lane.mjs` | Dated calls | 847 sources tracked: 0 FOLLOW, 13 FADE, 151 NO EDGE, 683 not enough calls yet |
| X, Reddit, Discord, TikTok | none | | Not reached: X is paid; Reddit needs an owner app; Discord has no read API |

**The tipsters behind the four stocks:**

| Source | Record |
|---|---|
| RedChip (OWLS) | NO EDGE: 458 calls, −4% average at 60 days |
| TickerRoom (BRAI, AEYE) | 45 calls, 1-day average −4.9%; its BRAI and AEYE posts came the same morning or after the move |
| Georgee23 (BRAI, the night before) | 6 calls, about flat; far too few to judge |

## Deliverable 4: proposed minimal fix (needs your OK; nothing is coded yet)

**Fix 1: the watcher starts on time (timing, 1 workflow line).**

- Change the crons in `ignition.yml` to `45 12 * * 1-5` and `45 13 * * 1-5` (winter time from 2 Nov).
- The script already waits until 9:25 when it starts early (`ignition-watch.mjs` line 37).
- Effect: the open and the 9:25 pre-market record are covered, which also starts the premarket study that is supposed to be collecting.
- No rule changes.

**Fix 2: one DAILY OPPORTUNITY RADAR message (routing; reuses existing files, no new strategy).**

New `opportunity-radar.mjs`, sent twice a day: about 11:15 New York (6:15 pm Kuwait) and after the close. It reads `ignition-live.json`, `ignition-paper.jsonl`, `radar-day.json`, `movers-state.json`, `early-wave-obs.jsonl` and `follow-calls.jsonl`. It has four panels:

- **A. Live research leads:** up to 5. Ticker, time first seen, move when first seen, live/old price, catalyst source or "NO VERIFIED CATALYST", volume vs normal, main risk.
- **B. Short setups (PAPER):** rule hits from IG1–IG9, with the entry price, the rule's own live paper record (n, average after costs), and the gross move needed for +2% net at $1,000 (2.6% + spread).
- **C. Approved signals:** existing tested rules only. "0 today" is allowed.
- **D. Runners we missed:** the top 5 movers with the first blocking reason code.

Every A/B line carries **NOT AN APPROVED BUY**. Hard rules still apply to what is shown: under $1, not halal (ZAD) and SEC danger flags are shown as BLOCKED with the reason, never as a buy.

- **Switch:** a new setting `radar` (on), sent with `radar on/off`. `quiet`, `opportunitiesOnly` and `focus` stay as they are for every other message.

**Fix 3 (optional, your choice): keep long-term text out of the short-term part.**

- Move the YARDSTICK / FOCUS "halal index fund" lines in ACTIONS under a separate "LONG-TERM (separate)" heading.
- No rule or monthly-plan change.

**Not proposed:** no new strategy, no new squad, no lowered gate, no change to LEADER DIP, TRY SMALL, Agent C or Squad 26.

## Deliverable 5: shadow evaluation (pre-registered here, before any result)

Each radar line is logged to `data/radar-v3-ledger.jsonl` with its price at listing, then scored at the same-day close and after 5 sessions:

- after the $6 round trip on $1,000;
- with 1% assumed spread under $5, 0.3% above $5;
- against the same-day average stock.

Report after 10 sessions:

- coverage (share of 15%+ movers listed before +10%);
- lead time;
- false-positive share (listed and closed below the listing price);
- average net result per panel.

No panel becomes a BUY from this. Promotion stays under the existing bar: 30+ trades on 10+ days, positive after costs. The watcher fix is compared with the 16–27 Oct baseline: first minute, GAPPED_AT_OPEN and VISIBLE_TOO_LATE counts, and premarket rows.

## Deliverable 6: decision needed

| # | Change | Files | Tests | Rollback |
|---|---|---|---|---|
| 1 | Watcher starts 8:45 New York | `.github/workflows/ignition.yml` (2 cron lines) | Existing 1,034 tests; check the first minute in `ignition-days.jsonl` the next day | Revert the 2 lines |
| 2 | Daily Opportunity Radar | new `opportunity-radar.mjs`, new workflow, `HELP` line in `scan.mjs` | New tests: labels always present, hard blocks never shown as BUY, empty day prints "0 approved, N leads, top reason" | `radar off` or delete the workflow |
| 3 | Long-term text under its own heading | `scan.mjs` `actionsText` | Snapshot test of ACTIONS | Revert |

**Safety invariants:**

- no order code;
- no gate or cost change;
- halal by ZAD only;
- every unproven line says NOT AN APPROVED BUY;
- all tests must pass before the push.

## What could we be wrong about?

1. **The ledger is selected on winners** (15%+ movers only). Early sightings look great because of that. Only the paper ledger (every signal) is a fair test, and it is negative for most rules.
2. **IG1's +2.1% comes from 8 days in one market mood** (late Oct, small caps running), on a rule its 5-year test rejected. It may vanish.
3. **Catalysts are unverified here.** Sending more leads may mostly send more noise and promoter-driven names. The radar's own scorecard (Deliverable 5) must show whether reading it is worth your time.
