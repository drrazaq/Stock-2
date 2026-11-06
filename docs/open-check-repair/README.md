# Intraday first-check ("MARKET OPEN CHECK") repair: an isolated package for independent review

**This is branch-only publication for review. It is not a deployment approval, and it is NOT applicable to current production `main`.**

- **Prepared:** 6 Nov 2026 by Claude, at the owner's request.
- **Not done:** no deployment, workflow action, dispatch, provider call, real message, rule change or trade-record change.
- **Privacy:** no holdings are published. Every test fixture uses invented tickers and prices.
- **Scope:** outside Saturday's maintenance. The bytes of Saturday's STOP R2, T and D1–D4 patches are unchanged and are not included here.

## Exact expected base and dependencies

The patch applies only to the **expected post-release tree** in which STOP R2 and D1–D4 are both deployed and verified:

| Item | Value |
|---|---|
| Built and tested on | current main `6c61057839bd018322110175e84e0faf5c843997` (non-data identical to `cccfc198`) + STOP R2 `c1de39fdc301b3c89f3d73b9f05cb6004aee0759a7f4328b259bd31e6bc5433b` + T `fefe0ecfd862729b276db82433ae58ea351901e41939dc80f61eeb5b381dd969` + D1–D4 `6889504c6ef67130193b9be0a070a76347bbaec24f83c9b116736c74e2d45bba`, applied verbatim in a local tree only. That synthetic base commit is **not published**. |
| `scan.mjs` before-hash required | `73ad4853340ee5f562618155df92371ab1ff87e62584bf507157d9c84cd276c3` (STOP + D after-hash) |
| `scan.mjs` after-hash | `c7250b0c9897d46c3d3d52562cda1eda0c054025f07a1c1acd15e6d167c3e40c` |
| Depends on STOP R2 | `priceEvidence`, `validStop` and `nyStamp` from `stop-watch.mjs` |
| Depends on D1–D4 | `marketSessionOf` and `nyClockText` in `scan.mjs`, and the reviewed `market-session.mjs` calendar |
| New test (lives at `test/open-check-repair.test.mjs` when applied) | `d0b63606392ce16403831deae4cdc518438f88ad9c75e3863519a23ca404e4cb`. It is copied here as `open-check-repair.test.mjs` and is **not registered** on this branch. |

**Applicability:**
- **Current production `main` (`scan.mjs` `19a5368b…`):** the before-hash does not match, so the patch does not apply.
- **STOP-only main (D skipped):** the patch applies textually, but `marketSessionOf` would be missing at run time. **It must not be used there.** It would need rebasing and a fresh review.

## Defects (from the 6 Nov read-only reconciliation) and repairs

| # | Defect in the first check sent at 22:57 Kuwait | Repair |
|---|---|---|
| 1 | The first check showed **HOLD** for a holding that ACTIONS showed as **SELL** (a leader exit: it closed under its 50-day average). The check read only the stop and the holding review, and deliberately ignored "trend is broken". | **`holdingAction()`**, one resolver in the same order as ACTIONS (`planText`): stop reached → filing sell → target 2 → **last night's exit rule (`sig.posVerdict`, any kind, trend exits included)** → holding-review SELL → target 1 → otherwise UNKNOWN or HOLD. A nightly exit is never replaced by HOLD. A test checks that ACTIONS and the first check agree. |
| 2 | Position prices, "% from your entry" and "SELL NOW: the stop is reached" used a quote with **no source, timestamp or age check**. A holding with no quote was silently left out. | Price claims need STOP R2's `priceEvidence`: the right ticker, a provider timestamp, not in the future, at most 5 minutes old. Otherwise the line shows **STOP STATUS UNKNOWN / current price UNKNOWN (reason)**, never HOLD. Every holding is listed. Buy-list lines need evidence too (20 minutes, the existing BUY NOW gate). |
| 3 | **"PROVEN BUYS TODAY"**; "I will message you the moment one does". | "BUY LIST FROM LAST NIGHT'S SCAN (the rules are NOT PROVEN; a line is a buy only while its price is INSIDE its range)". When it is empty: "New buy candidates are chosen only by the nightly scan, never during the day." |
| 4 | "I check every 30 minutes": on 6 Nov GitHub created only one intraday run, at 19:55 UTC. | "Scheduled every 30 minutes while the market is open, but GitHub can start them late or skip them, so no exact time is promised." |
| 5 | "MARKET OPEN CHECK (22:57 Kuwait)" implied it saw the open. | "TODAY'S FIRST MARKET-HOURS CHECK, run at 2:57 pm New York (22:57 Kuwait)." More than 30 minutes after the actual open, it adds: "LATE: … it did NOT observe the open … 5 h 27 min before this check." |
| 6 | The watcher's 15:00 cutoff could be read as the market close. | "Regular NYSE session today: 9:30 am to 4:00 pm New York … The live watcher's configured window ends at 3:00 pm New York, 60 minutes before the close." Early-close days use 1:00 pm. If the calendar is unreadable, the hours are shown as UNKNOWN. |

**Correction to Claude's 6 Nov watcher report:** the 319 watched minutes were 97.6% of the watcher's **configured 09:30–15:00 window**, not of the trading session, which runs to 16:00 New York.

## Not changed

- **ACTIONS:** `planText` is unchanged.
- **Also unchanged:** the rules and verdicts, the stops, STOP R2's stop route, BUY NOW cards, the "Market hours check" alert lines, the `main.yml` schedule, and the bot chat path.
- **Known limit, for separate review:** ACTIONS' own nightly stop line still uses a price without evidence.

## Tests (Node 20.20.0, non-loopback connections refused, 0 attempted; on the expected base tree)

| Run | Result |
|---|---|
| The new test, through the actual `intraday()` caller. It covers:<br>- conflicting exits, with ACTIONS agreement;<br>- stop precedence;<br>- stale, undated and missing quotes;<br>- delayed startup (2:57 pm) against on time (9:40 am);<br>- labels and promises;<br>- the 16:00 / 13:00 close against the 15:00 cutoff;<br>- an unreadable calendar;<br>- records untouched;<br>- the network guard. | **9/9 PASS** |
| The same test against the pre-repair `scan.mjs` | 8/9 FAIL (only the network guard passes); some failures are on the new wording, by design |
| Full serial suite (141 registered files) | **141/141 PASS** |
| Gated watcher scenarios | 11/11 and 9/9 |
| Patch then `rollback.patch` on a scratch worktree | restores the base exactly |

## Before any use

1. Codex's independent review.
2. STOP R2 **and** D1–D4 deployed and verified, or a rebased, re-reviewed package.
3. Separate owner approval and its own maintenance boundary.
