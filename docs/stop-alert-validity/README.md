# Stop-alert validity package (findings F1–F5 of 4 Nov 2026): development only, not deployed

Prepared by Claude on branch `claude/stop-alert-validity`, from main `a95af150`.

- **What this is:** preparation and synthetic tests only. There was no deployment, live probe, test message or workflow change.
- **Private text:** the owner's messages are not in this repository. Every test uses invented tickers and prices.
- **Deployment:** needs Codex's independent review and a separate owner approval.

## Revision 2 (Codex corrections)

- **Future timestamps:** any future provider timestamp is now **UNKNOWN**. The previous 60-second tolerance is removed, and a nonfinite clock never vouches for freshness.
- **Prices:** a nonfinite, non-numeric or non-positive price (`Infinity`, `NaN`, `"79"`, `null`) is **UNKNOWN**.
- **Recorded stops:** a recorded stop that is not a finite positive number is now one **STOP CHECK UNKNOWN** line ("the recorded stop is not a valid number"). Before, the watcher skipped it silently, and the bot route could treat `Infinity` as crossed. A position with no stop recorded is still not checked.
- **Watcher scenarios now executed** (`INCIDENT_WATCHER_SRC=<branch>/ignition-watch.mjs`):
  - `watcher-resilience`: 9/9 pass.
  - `watcher-incident-revision`: 11/11 pass.
  - The first run exposed one unconverted `STOP HIT NOW` assertion. It also showed that the radar child's fixed module set lacked `stop-watch.mjs`, which `early-alerts.mjs` had started importing. `nyStamp` is now defined locally in `early-alerts.mjs`, and a test checks that both modules produce the same format.
- **Results:**
  - `test/stop-alert-validity.test.mjs`: 17/17 pass, including actual bot-caller cases for future-dated and nonfinite quotes.
  - Full suite: 136/136 pass.

## What changes

| Finding | Change |
|---|---|
| **Price validity first** | New `priceEvidence()` in `stop-watch.mjs`. A stop crossing is shown as current only when the price meets all of these: a positive **trade** price; a response bound to **that exact ticker**; a provider timestamp that is known, not in the future, and at most `STOP_MAX_AGE_MIN` = 5 minutes old. Anything else is a **STOP CHECK UNKNOWN** line, once a day per stock, saying it "is not a sign the position is safe". A later valid crossing still alerts. A held stock with no price row at all is UNKNOWN, not skipped. |
| F1 duplicates without loss | The live watcher (every minute) is the primary route. The bot's market-hours check sends a stop line **only if** the watcher's delivery record for that stock and kind today (`data/watcher-message-state/DAY/sha256('stop:SYM:hit').json`) is **not** `ACKNOWLEDGED`. A missing, UNSENT or UNCERTAIN record means the bot sends, so a failed watcher delivery is never lost. Each route still sends at most once a day. |
| F2 one wording | Both routes use `stopText()`: "STOP LEVEL REACHED … If your broker stop order has filled, you are already out: do not sell again; send `sold SYM FILLPRICE` … If no stop order is working at your broker, decide now whether to sell". "SELL NOW at market" and "Sell / reassess now" are gone. The bot sends stops as their own message ("YOUR STOPS …"), with the footer "Stop levels are your own recorded stops. Not financial advice." It no longer carries the "Tested signals, not instructions" footer. |
| F3 | "traded at or below your stop". The trigger is unchanged: `price <= stop`. |
| F4 | Every stop line shows the price **source**, the **observation time** with its date, and the **age**: "(ALPACA IEX, Nov 5 10:30 New York, 20 s old)" or "(FINNHUB, …)". |
| F5 | Catalyst times in `early-alerts.mjs` use `nyStamp()`, for example "Nov 3 16:07 New York". This applies to SEC acceptance, headline and older-news items, so the UTC format is gone. |

**Not changed:** stop levels, trigger thresholds (at or below; near is within 2%), trading rules, holdings, financial records, Telegram offsets and workflows.

**Test helper:** `test/load-scan.mjs` now copies local modules that `scan.mjs` imports statically. This was needed because `scan.mjs` imports `./stop-watch.mjs`.

## Tests

| Run | Result |
|---|---|
| New `test/stop-alert-validity.test.mjs` | 14/14 pass |
| Updated `test/stop-watch.test.mjs` | 3/3 pass |
| Same files against the unchanged main code | fail (new exports absent; old wording) |
| Full suite on the branch (`node "$f"`, Node 20, sequential) | 136/136 pass |

The new tests cover:
- **Bad price evidence:** wrong ticker, zero price, daily bar, missing timestamp, future timestamp, stale (over 5 min), and exactly at the limit.
- **Stale or missing below the stop:** UNKNOWN once, then a hit on a fresh price.
- **Wording:** "at or below" for a price equal to the stop; an order that already filled.
- **Read-only behaviour:** a position already sold produces nothing; stop levels and positions are not mutated.
- **Catalyst dates:** dated output in both summer and winter time; no UTC.
- **The actual bot `intraday()` caller, through loopback Telegram and Finnhub stubs:**
  - watcher ACKNOWLEDGED → no repeat;
  - missing, UNSENT or UNCERTAIN → one fallback in the shared wording;
  - once-a-day duplicate prevention across runs;
  - undated and stale quotes → UNKNOWN;
  - Telegram offset and stop level unchanged.
- **Offline:** the blocked-request list is empty.

## Limits (disclosed)

- **Instrument identity is checked at ticker level only.** The response must be for the exact requested symbol. There is no CUSIP or FIGI security-ID check, because none exists in these feeds.
- **Duplicates are suppressed one way only** (the watcher delivered, so the bot is silent). If the bot sends first, the watcher may still send its own message later. That is accepted as safe, because a duplicate is better than a lost alert.
- **Watcher delivery records reach the bot only after the watcher saves and the bot pulls**, which takes minutes. In that window a duplicate is still possible.
- **The bot's chat mode checks at most 12 held stocks.** This is unchanged.
- **Where `test/watcher-resilience.test.mjs` stands:** its scenarios run only with `INCIDENT_WATCHER_SRC` set. Its stop assertion was updated to the new wording but was not executed here.
- **Possible extra messages:** after deployment, thinly traded holdings with old IEX prints may produce one STOP CHECK UNKNOWN line a day. That is intended: unknown is never silently safe.
