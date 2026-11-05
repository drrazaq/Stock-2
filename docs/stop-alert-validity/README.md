# Stop-alert validity package (findings F1–F5 of 4 Nov 2026): development only, not deployed

Prepared by Claude on branch `claude/stop-alert-validity`, from main `a95af150`. Revision 2, with the documentation reconciled on 5 Nov 2026.

- **What this is:** preparation and synthetic tests only. There was no deployment, live probe, test message or workflow change.
- **Private text:** the owner's messages are not in this repository. Every test uses invented tickers and prices.
- **Deployment:** needs Codex's independent review and a separate owner approval. See "Release package" below.

## What changes

| Finding | Change |
|---|---|
| **Price validity first** | New `priceEvidence()` in `stop-watch.mjs`. A stop crossing is shown as current only when the price meets all of these:<br>• a finite positive **trade** price;<br>• a response bound to **that exact ticker**;<br>• a finite provider timestamp that is known, **not in the future** (no tolerance) and at most `STOP_MAX_AGE_MIN` = 5 minutes old.<br>Anything else (wrong ticker; zero, `NaN`, `Infinity`, string or `null` price; daily bar; missing, future or stale time; a nonfinite clock) is a **STOP CHECK UNKNOWN** line. It goes out once a day per stock and says it "is not a sign the position is safe". A later valid crossing still alerts. A held stock with no price row at all is UNKNOWN, not skipped. |
| Recorded stop not a number | A recorded stop that is not a finite positive number gives one **STOP CHECK UNKNOWN** line ("the recorded stop is not a valid number"). Before, the watcher skipped it silently, and the bot could treat `Infinity` as crossed. A position with no stop recorded is still not checked. |
| F1: duplicates without loss | The live watcher (every minute) is the primary route. The bot's market-hours check sends a stop line **only if** the watcher's delivery record for that stock and kind today is **not** `ACKNOWLEDGED`. That record is `data/watcher-message-state/DAY/sha256('stop:SYM:hit').json`. A missing, UNSENT or UNCERTAIN record means the bot sends, so a failed watcher delivery is never lost. Each route still sends at most once a day. |
| F2: one wording | Both routes use `stopText()`. It reads "STOP LEVEL REACHED … If your broker stop order has filled, you are already out: do not sell again; send `sold SYM FILLPRICE` … If no stop order is working at your broker, decide now whether to sell".<br>• "SELL NOW at market" and "Sell / reassess now" are gone.<br>• The bot sends stops as their own message ("YOUR STOPS …"), with the footer "Stop levels are your own recorded stops. Not financial advice."<br>• That message no longer carries the "Tested signals, not instructions" footer. |
| F3 | The text says "traded at or below your stop". The trigger is unchanged: `price <= stop`. |
| F4 | Every stop line shows the price **source**, the **observation time** with its date, and the **age**. Examples: "(ALPACA IEX, Nov 5 10:30 New York, 20 s old)" or "(FINNHUB, …)". |
| F5 | Catalyst times in `early-alerts.mjs` use a dated New York stamp, for example "Nov 3 16:07 New York". This covers SEC acceptance, headline and older-news items, so the UTC format is gone. `early-alerts.mjs` keeps its own copy of the stamp function, so the radar child's fixed module set is unchanged. A parity test checks that both copies produce the same format. |

**Not changed:**
- stop levels;
- trigger thresholds (at or below; near is within 2%);
- trading rules;
- holdings and financial records;
- Telegram offsets;
- workflows.

**Test helper:** `test/load-scan.mjs` now copies the local modules that `scan.mjs` imports statically. This was needed because `scan.mjs` imports `./stop-watch.mjs`.

## Scope: exactly ten files

- **Production (4):** `stop-watch.mjs`, `ignition-watch.mjs`, `scan.mjs`, `early-alerts.mjs`.
- **Tests (6):**
  - `test/load-scan.mjs`
  - `test/shadow.test.mjs`
  - `test/stop-alert-validity.test.mjs` (new)
  - `test/stop-watch.test.mjs`
  - `test/watcher-resilience.test.mjs`
  - `test/watcher-incident-revision.test.mjs`

## Tests (executed, Node 20, sequential `node "$f"`, external connections blocked)

| Run | Result |
|---|---|
| `test/stop-alert-validity.test.mjs` (new) | **17/17 pass** |
| `test/stop-watch.test.mjs` (updated) | **3/3 pass** |
| `test/watcher-resilience.test.mjs`, with `INCIDENT_WATCHER_SRC=<branch>/ignition-watch.mjs` | **9/9 pass, 0 skipped** |
| `test/watcher-incident-revision.test.mjs`, same setting | **11/11 pass, 0 skipped** |
| Same package tests against the unchanged main code | fail as expected (new exports absent; old wording) |
| Full suite on the branch | **136/136 files pass** |

The two watcher scenario files run their scenarios only when `INCIDENT_WATCHER_SRC` is set. Without it they skip, and a bare run would not count as executed. Both were executed as shown, and re-executed on 5 Nov with the same results.

Their first r2 run found two problems, both fixed in r2:
- one unconverted `STOP HIT NOW` assertion;
- an `early-alerts.mjs` import of `stop-watch.mjs` that the radar child's module set did not contain.

The new tests cover:
- **Bad price evidence:**
  - wrong ticker;
  - a price that is zero, `NaN`, `Infinity`, a string or `null`;
  - a daily bar;
  - a missing timestamp;
  - a future timestamp (10 minutes ahead, and 1 second ahead; the code has no tolerance at all);
  - a nonfinite clock;
  - a stale price (over 5 min), and a price exactly at the limit.
- **Recorded stop not a number:** one UNKNOWN line, and never "crossed".
- **Stale or missing below the stop:** UNKNOWN once, then a hit on a fresh price.
- **Wording:** "at or below" for a price equal to the stop; an order that already filled.
- **Read-only behaviour:** a position already sold produces nothing; stop levels and positions are not mutated.
- **Catalyst dates:** dated output in both summer and winter time, with no UTC, plus the stamp parity check.
- **The actual bot `intraday()` caller, through loopback Telegram and Finnhub stubs:**
  - watcher ACKNOWLEDGED → no repeat;
  - missing, UNSENT or UNCERTAIN → one fallback in the shared wording;
  - once-a-day duplicate prevention across runs;
  - undated, stale, future-dated and nonfinite quotes → UNKNOWN;
  - Telegram offset and stop level unchanged.
- **The actual watcher (`ignition-watch.mjs`) through the scenario harness:** the new stop wording delivered and recorded.
- **Offline:** the blocked-request list is empty.

## Release package (exact)

| Item | Value |
|---|---|
| Reviewed branch commit (code) | `c73cb6a8881f0ab8fef5e64cbabeec0d966a7d8d` |
| Base | `a95af15061569854c89350a5fb0f981e99783822` |
| `production.patch` SHA256 | `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` |
| `rollback.patch` SHA256 | `1a13a44de32db385a330e948d4f354cc399f215f2b4ae75fa8a453e4fcaa0ff9` |
| Files | the ten above, and nothing else |

The patch and rollback are unchanged by this documentation correction. Only README, manifest, verification.json and SHA256SUMS changed.

## Remaining deployment conditions (all open)

1. **Codex independent review** of r2 at the commit and patch hash above, pinned to that commit.
2. **Owner approval** of that exact patch hash. Approval of an earlier package does not carry over.
3. **Main compatibility, rechecked just before deployment.** On 5 Nov, main `0d8f7918` had not changed any of the ten files since the base. The patch applied cleanly, and the full-suite result for main plus the patch is recorded in `verification.json`. Any later change to these files on main requires a new check.
4. **Deploy only at a verified natural boundary:** no bot run active or pending, and outside the watcher's market session (after the watcher has finished, or before it starts). No pause, cancellation or dispatch is part of deployment.
5. **After deployment:** hosted CI all-PASS on the release commit, then a complete-log receipt from Codex. The first real stop line then needs to show source, time and age. No test message is sent to produce one.

## Limits (disclosed)

- **Instrument identity is checked at ticker level only.** The response must be for the exact requested symbol. There is no CUSIP or FIGI security-ID check, because none exists in these feeds.
- **Duplicates are suppressed one way only** (the watcher delivered, so the bot is silent). If the bot sends first, the watcher may still send its own message later. That is accepted as safe, because a duplicate is better than a lost alert.
- **Watcher delivery records reach the bot only after the watcher saves and the bot pulls**, which takes minutes. In that window a duplicate is still possible.
- **The bot's chat mode checks at most 12 held stocks.** This is unchanged.
- **Possible extra messages:** after deployment, thinly traded holdings with old IEX prints may produce one STOP CHECK UNKNOWN line a day. That is intended: unknown is never silently safe.
