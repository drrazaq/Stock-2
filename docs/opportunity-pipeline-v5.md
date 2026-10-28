# Stock-2 opportunity pipeline: stages 1-2 (owner items 4-7), 28 Oct 2026

Owner instruction (28 Oct): repair and measure the existing discovery-to-alert pipeline before adding strategies, agents or squads. Separate research leads, paper setups and approved buys. Never weaken halal, under-$1, SEC, liquidity or other hard rules. Stages are committed separately so each can be rolled back on its own.

This builds on `docs/v3-opportunity-audit-2026-10-28.md` (fixes 1-3). **Nothing below claims a better trading result.** That can only come from the forward scorecards described in section 8.

---

## 1. What was changed, by stage

**Stage 1: startup reliability and measurement (item 4)**

| File | Change |
|---|---|
| `watcher-guard-core.mjs` (new) | Pure decision. Is the live watcher running by 9:10 New York? If not, start it (up to 3 tries, 15 min apart, until 14:00). Alert once if it is late, queued, stopped early or down. Uses New York time via Intl, so daylight saving is automatic. NYSE holidays 2026-27 are listed. |
| `watcher-guard.mjs` (new) | Runner. Reads GitHub's run list for `ignition.yml`, starts it with `workflow_dispatch`, sends Telegram alerts. Writes `data/watcher-guard.json` and `data/watcher-starts.jsonl` (one measured start per day). |
| `.github/workflows/bot.yml` | `actions: write` permission. The 5-minute loop also runs `node watcher-guard.mjs`. The bot job runs all day, which makes it the most reliable clock available without paid infrastructure. |
| `ignition-watch.mjs` | Records the real process start (`procStart`) in `data/ignition-days.jsonl`. |
| `health.mjs` | New check: the last watched day's first minute must be 9:35 New York or earlier. |
| `test/watcher-guard.test.mjs` (new) | 8 tests, including the 1 Nov 2026 daylight-saving switch. |

**Stage 2: prompt early alerts and the delivery scorecard (items 5 and 7)**

| File | Change |
|---|---|
| `early-alerts.mjs` (new) | Three separate kinds: RESEARCH LEAD, PAPER SETUP and APPROVED (the last unchanged). It holds the hard-rule checks, the level setting, daily caps, delivery logging with latency, and the per-day DELIVERY SCORECARD. |
| `ignition-watch.mjs` | Feeds every early-wave observation and every rule hit to `early-alerts.mjs`. Refreshes the owner's `alerts` level every 10 minutes. Writes `data/opp-ledger.jsonl` (each candidate that met a trigger, with its decision and 15:00 result) and `data/opp-days.jsonl` (the day's funnel). The low-volume reason now names its denominator (see 6). |
| `opportunity-radar.mjs` | The after-close radar ends with the DELIVERY SCORECARD. |
| `scan.mjs` | `alerts all / paper / approved / off` command, its HELP line and command routing. |
| `.github/workflows/ignition.yml` | Saves the two new ledgers. |
| `test/early-alerts.test.mjs` (new) | 9 tests. |

**Tests:** 1,063 pass, 0 fail. That is 1,046 before plus 17 new.

## 2. Suppression-gate register (every place a stock can be stopped)

**Type** is one of: hard safety, data, instrument, promotion (statistical), rule definition, UI (a message setting) or timing.

| # | Gate | Where | Type | Treatment |
|---|---|---|---|---|
| 1 | Under 1 USD | `ignition-watch.mjs` (`prevC >= 1`), `early-alerts.mjs` `hardReason`, `radar-v3-core.mjs` `blockOf` | Instrument (mostly warrants and pennies) | **Keep hard.** Counted, never listed |
| 2 | NOT HALAL (ZAD) | `notHalal`, `halalMap` | Hard safety | **Keep hard** |
| 3 | One-day-jump AVOID list (15%+ in 30 days) | `signals.json` lottery | Hard (tested: lagged ~3%/month, t −5) | **Keep hard** for alerts. The radar shows it as BLOCKED |
| 4 | SEC danger filing (share sale, delisting notice, late report) | `secRisk` | Hard safety | **Keep hard** |
| 5 | SEC check failed | `secRisk` known=false | Hard (unknown = blocked) | **Keep hard.** Logged as its own reason |
| 6 | Stale price (over 3 min) | `isFreshPriceAge` | Data | **Keep** |
| 7 | Rule failed its 5-year test | `maybeAlert` `ruleNotPassed` | Promotion | **Keep for APPROVED.** Now shown as PAPER SETUP (labelled) |
| 8 | Paper record not strong enough | `paperOk` | Promotion | Same as 7 |
| 9 | 11:00 New York window | IG rules `by: 660` | Rule definition (tested that way) | **Keep in rules.** Ablation candidate (stage 3) |
| 10 | Volume ≥ 1.0× a FULL normal day (IG1) | IG rules `rv` | Rule definition | **Keep but fix wording** (done). The research trigger uses time-of-day pace instead |
| 11 | Approved alert cap, 6 a day | `maybeAlert` | Limit | **Keep** |
| 12 | `opportunitiesOnly` (default on) | `opp-mode.mjs`; `scan.mjs` RUNNERS NOW | UI | **Keep** for RUNNERS NOW, which are stocks already up 20%+ (469 cases fell a median 19% to the close). Its other job, early paper alerts, now goes through the labelled PAPER SETUP channel |
| 13 | `quiet` (default on) | `movers.mjs`, `discover.mjs`, `intraday-radar.mjs`, FAST MOVERS | UI | **Keep.** Those lanes are covered by the radar and the early alerts in labelled form. `quiet off` brings the old messages back |
| 14 | `focus` (default on) | ACTIONS | UI / policy | **Keep.** Long-term text is now under LONG-TERM (fix 3) |
| 15 | Watcher start delay | GitHub cron | Timing | **Fixed:** earlier cron + guard + health check + alerts |
| 16 | Massive volume 15 min late | feed | Data | Fixed 23 Oct (live SIP volume) |
| 17 | Early-wave radar universe (~320 prepared stocks) | `intraday-radar.mjs` | Coverage | Not a gate for the new channel: leads come from the whole-market watcher (12,737 symbols) |
| 18 | Top-20 / baskets / S&P yardstick | ACTIONS only | Policy | **Not** applied to short-term discovery anywhere in the watcher or the radar |
| 19 | Telegram delivery | all senders | Delivery | Previously not checked. Early alerts now record OK / SEND FAILED and the latency |
| 20 | Research-lead trigger EW-ALERT-1 | `early-alerts.mjs` `leadSoftReason` | Soft (new) | Pre-registered. Misses are counted by reason |

**Counts from the 8 watched days (16–27 Oct), 1,711 stocks that rose 15%+ in a day:**

| Reason | Count |
|---|---|
| Under 1 USD | 526 |
| Volume figure late (fixed since) | 471 |
| After 11:00 | 230 |
| Low volume | 142 |
| No fresh price | 141 |
| Rule failed its 5-year test (now PAPER SETUP) | 86 |
| Paper gate (now PAPER SETUP) | 55 |
| Gapped at the open | 44 |
| Visible too late | 10 |
| SEC check unavailable | 5 |
| Alerted | 1 |

Paper signals logged 14–27 Oct: 1,304 (check: 12+281+62+97+205+111+115+345+4+72). Approved alerts sent: 6 (19–20 Oct). Source: `data/ignition-days.jsonl`, `data/ignition-paper.jsonl`.

## 3. Settings: which switch controls which message

| Message | `radar` | `alerts` | `quiet` | `opportunitiesOnly` | `focus` | Hard rules |
|---|---|---|---|---|---|---|
| OPPORTUNITY RADAR (11:15 + after close) | on/off | – | – | – | – | Shown as BLOCKED |
| EARLY WATCH: research lead | – | `all` | – | – | – | Never sent |
| EARLY WATCH: paper setup | – | `all` or `paper` | – | – | – | Never sent |
| Approved intraday alert | – | – (unchanged) | – | – | – | Never sent |
| RUNNERS NOW (already +20%) | – | – | must be on | must be false | – | – |
| Movers / discovery / early-wave cards / FAST MOVERS | – | – | must be off | – | – | – |
| ACTIONS trading part | – | – | – | – | focus text | Unchanged |
| ACTIONS LONG-TERM section | – | – | – | – | content | – |

## 4. Candidate states (one ledger row each, `data/opp-ledger.jsonl`)

`SOFT: <reason>` (did not meet the trigger; counted only) → `HARD: <reason>` (blocked) → `MUTED: alerts <level>` → `LIMIT: <cap> a day reached` → `SENT` / `SEND FAILED: <why>`.

Each row carries:

- the minute detected, price and day change;
- the minute sent and latency;
- the 15:00 price and the net result after the $6 round trip on $1,000 and the spread.

Approved alerts keep their existing path and are counted in the day's summary.

## 5. Startup reliability (item 4)

**Measured, before:**

| Day | GitHub run started (UTC) | First watched minute (New York) |
|---|---|---|
| 20 Oct | 13:40 | 09:40 |
| 21 Oct | 13:39 | 09:39 |
| 22 Oct | 13:43 | 09:43 |
| 23 Oct | 13:38 | 09:38 |
| 26 Oct | **15:10** (both crons about 2 h late) | **11:10** |
| 27 Oct | 13:49 | 09:49 |

The cron was 13:05 UTC, so GitHub's delay was 33 min to 2 h 5 min. The pre-market record (9:25) was never captured: `data/premarket.jsonl` does not exist.

**Now:**

1. Cron at 12:45 / 13:45 UTC (8:45 New York in summer / winter).
2. The guard in the always-on bot job starts the watcher itself if it is not running by 9:10.
3. Telegram alerts: STARTED LATE, WAITING, STOPPED EARLY, DOWN.
4. The health check flags any day whose first watched minute is after 9:35.

**Daylight saving:** New York switches to UTC−5 on 1 Nov 2026 (tested). The 12:45 UTC run becomes 7:45 and exits; the 13:45 UTC run watches.

**Limits:**

- The guard itself depends on the bot job being alive. The bot has its own failure alert.
- If GitHub starts the watcher at exactly 8:45, the 345-minute run limit ends the watch at about 14:30.

**If the guard still shows late starts after 10 sessions, the options are:**

- (a) an external scheduler calling GitHub's dispatch API. Free tiers exist, but it needs a fine-grained token stored outside GitHub, which is a security trade-off for the owner to approve.
- (b) a small always-on server, about 5 USD a month (owner decision; he declined paid services until the system pays for itself).

## 6. Owner's examples, forensic notes

**OWLS, 27 Oct, 10:18 New York:**

- The "0.1×" was cumulative volume against a **full** normal day's volume. That is IG1's tested definition ("a normal day's volume already traded"), not a units bug.
- Adjusted for time of day it was about **0.6× normal pace**. By 10:15 the market typically trades 12.9% of a day (`data/vol-curve.json`, median of 6 days), and 0.0816 / 0.129 ≈ 0.63.
- So OWLS really was quieter than normal when it crossed +10%. It would also have failed the new research trigger, which needs a 1.5× pace or half a day's volume.
- The reason text now says "x a FULL normal day … time-of-day pace Nx".
- Spread data: UNVERIFIED (the watcher does not record bid/ask).

## 7. IG1 review (item 6). Data: `data/ignition-results.json` and `data/ignition-paper.jsonl`

**Rule:** crosses +10% before 11:00 New York with at least a full normal day's volume already traded.

**Assumptions in the scoring (`ignition-paper.mjs`, `ignition-core.mjs` `simulate`, `costOf`):**

- **Entry:** the next minute's open. NO FILL if that open is more than 3% above the signal price (10 signals excluded).
- **Exit:** an 8% stop (at the stop, or at the open if it gapped through), else sold at the 15:59 close. Holding: from the signal minute to the stop or the close, the same day. Exit minutes are not stored, so holding-time spread is UNVERIFIED.
- **Costs per round trip:**

  | Price | Cost |
  |---|---|
  | Under $5 | 2.1% |
  | $5–20 | 1.4% |
  | $20+ | 1.2% |

  Each figure includes 0.5% for buying into a fast move, and covers ZAD's $6 on $1,000 (0.6%). The stress case is 1.5× costs.
- **Excluded:** 23 signals whose price was 3.6–59 minutes old, plus 1 with no bars.

**Results (68 trades, 8 days, 15–27 Oct):**

| Measure | Value |
|---|---|
| Average | +2.1% |
| Median | **−1.0%** |
| Win rate | 40% |
| Stress cost | +1.2% |
| 41 losers | average −6.5%, worst −13.2% |
| P&L at $1,000 each | +1,437 USD |
| Max drawdown | −536 USD |
| Without top 1 | +0.5% |
| **Without top 2** | **−0.2%** |
| Without top 3 | −0.9% |
| Without top 5 | −2.0% |

**Where the result comes from:**

- **AIOK, 23 Oct:** +110% from $5.78, held to the close. The 10% trailing-stop version of the same trade made +3.8%. That one trade is most of the result. AIOK's move needs a split and data check (UNVERIFIED).
- **By day:** 23 Oct gave +1.29 of the +1.44 total. Without 23 Oct the average is +0.3% (median −0.9%, without top 2 −1.2%).
- **Delayed starts:** signals fired in the watcher's first 2 minutes (stocks already +10% when first seen, because of the late start) averaged +2.7%. Those that crossed while watched averaged +1.6%; without their top 2, −2.0%.
- **No evidence it survives an on-time start:** the sample was mostly generated under late starts, so an on-time watcher would have produced different, earlier entries.

**Status:** IG1 **fails "positive without its 2 best trades"**, which is part of the existing bar. It also **REJECTED** its 5-year history test, and has fewer than 10 days. It stays NOT PROVEN and is shown only as a PAPER SETUP. The bar was not changed.

## 8. How we will know if this helps (pre-registered, 28 Oct, before any result)

**After 10 sessions with the new code**, data from `data/opp-days.jsonl`, `data/opp-ledger.jsonl`, `data/watcher-starts.jsonl` and `data/radar-v3-ledger.jsonl`:

**1. Timeliness**

| Measure | Bar |
|---|---|
| First watched minute 9:31 or earlier | 9 of 10 days (before: 0 of 8) |
| Pre-market rows saved | 10 days (before: 0) |
| Median detection-to-delivery latency | 2 min or less |

**2. Usefulness, not volume**

- Delivered research leads must show a positive average net at 15:00 after costs.
- And they must beat the average of all eligible leads that met the trigger.
- If they do neither, the lead channel is noise: switch it to `alerts paper` and say so.
- Paper setups are judged the same way.

**3. Coverage**

- Share of eligible 15%+ movers (excluding under $1 and gapped at the open) first delivered before +10%.
- Before: 47 of 254 movers on 27 Oct were visible live before +5%, and none was delivered.

**4. Burden:** messages a day, and the share of delivered leads that closed below their alert price.

**Not success:** more alerts, or naming winners afterwards.

## 9. Not done yet (next stages, each needs the owner's OK)

- **Stage 3, gate ablation in shadow:** for soft gates 9, 10 and 20, replay the same candidate set with each gate changed, scored on winners and matched losers after costs. No production change from it.
- **5-session outcomes for the delivery ledger:** the radar ledger already has them; same method.
- **Catalyst verification inside alerts:** SEC 8-K items are available. Free news timestamps are unreliable, and the paid news tools reachable from this session have no credit.
- **Bid/ask spread recording:** needs a quote snapshot per alert (Alpaca), one call each.
- **An external or always-on scheduler,** if section 5 shows the guard is not enough.

## 10. Public repository review

**This commit adds code, docs and research ledgers:** tickers, prices, decisions, timing. No keys, tokens or account data.

**Already public before this commit (owner decision, not changed here):**

- `data/my-positions.json` (holdings);
- `data/settings.json`, including the owner's 90-day stop-trading decision text;
- `data/halal.json` (ZAD marks);
- `CLAUDE.md` (personal details and the money plan).

Making the repository private would hide them. But GitHub Actions minutes are free only for public repositories: the bot alone runs about 43,000 minutes a month, against 2,000 free for private ones. That trade-off is the owner's.

## 11. What could we be wrong about? (independent challenge)

1. **Early is not the same as predictable.**
   - On 26–27 Oct, about 80 stocks a day met the lead trigger, and their median move from first sighting to the last log was about 0%. Only 4–15% reached the +3.6% gross a +2% net needs.
   - The obvious failure is that the channel delivers 5 coin flips a day, labelled honestly but useless.
   - The scorecard will show this within about 2 weeks. The pre-registered response is to turn it down, not to tune it until it looks good.
2. **Selection by hindsight.** The movers ledger contains only stocks that later ran 15%+, so "seen early" looks great there. Only the full candidate ledger (`opp-ledger.jsonl`, every trigger hit, winners and losers) is a fair test.
3. **Alert fatigue and chasing.** Even labelled NOT AN APPROVED BUY, a prompt message invites a trade. Caps are 5 leads and 4 paper setups a day, and every message says the trigger is unproven.
4. **Paper results are not fills.**
   - Under $5, spreads and halts can erase +2% gross.
   - The 15:00 scoring assumes a fill at the alert price.
   - The real hurdle is +3.6% gross under $5.
5. **The guard can misfire.**
   - A queued run plus a guard start could, in theory, give two watchers. Concurrency prevents two running at once; a queued duplicate starts after 15:00 and exits.
   - A crash is reported, not restarted, because a restart would overwrite the day's record.
6. **IG1's +2.1% came from one stock on one day.** Anyone reading "+2.1%" without "−0.2% without its 2 best" is misled. Every IG1 paper message carries both.
7. **The 15:00 price is the watcher's last quote, not the official close.** Thin stocks may have stale last quotes; the 5-session scores use daily bars.

## 12. Rollback

- **Stage 2:** `alerts off` stops the messages at once. Or revert the stage-2 commit. The ledgers are append-only and can stay.
- **Stage 1:** revert the stage-1 commit. The bot then stops calling the guard, and the cron stays as in fixes 1–3.
- **No setting, rule, gate, cost or halal mark was changed** by either stage.
