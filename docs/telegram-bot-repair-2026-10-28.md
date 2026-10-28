# Telegram bot repair (owner approved, 28 Oct 2026)

**Scope:** the owner's bot repair request (items 1-12), plus three approvals:

1. show the real spread and the gross move needed for +2% net;
2. a Pages workflow that publishes only the website files;
3. move private owner data to a private repository, without breaking workflows, without new billing, and without exposing data.

**Not touched:** the frozen A/B/C/D/R/R0 ranking experiment (`rank-models.mjs`, `shadow-*.mjs`, `edgar-feed.mjs`, `radar-v3-core.mjs`: no diff). The first-come live alert selection is unchanged. No hard trading or halal rule was weakened; one was enforced more strictly (problem 2).

Examples below are taken from the real 28 Oct MORNING ACTIONS, rebuilt offline from the repository data. The owner's holdings and stops are left out of this public file.

## 1. Problems found and their root causes

| # | Problem (28 Oct message) | Root cause | Fix |
|---|---|---|---|
| 1 | "FOCUS MODE: no new trading buys" next to "BUY WST / HQY / MMSI" | `actionsText` pushed every block into one list in code order. Focus mode only replaced the ENGINE buy block, while the owner's LONGER HOLDS lane printed BUYs regardless, and the focus text claimed all buys were off | One POLICY line at the top, from the same flags that decide what is shown: focus pauses ENGINE buys only, and the owner's lanes stay actions, each labelled. Paused engine buys go to NOT ACTIONABLE TODAY, never as a BUY |
| 2 | **WST, HQY, MMSI had no ZAD halal mark but were shown as BUY ("Check ZAD first")** | The LONGER HOLDS filter dropped only NOT HALAL marks, so unknown passed (LEADER DIP and TRY SMALL already required a 'yes'). The handbook says an unknown stock is never a buy | One HALAL GATE for every lane, engine cards included: a stock without the owner's ZAD 'yes' leaves TODAY'S ACTIONS and is listed under NOT ACTIONABLE with its exact command |
| 3 | "HALAL NOT MARKED: TGT ... send halal SYM yes" | Four hard-coded generic strings | `halalAsk()` prints one line per stock: `halal TGT yes   or   halal TGT no` |
| 4 | Index fund, "hold cash" and "best use of your next 1,000 USD" in the trading message, three times | Long-term lines were still inside ACTIONS (moved to the bottom on 28 Oct, not out) | Out of ACTIONS. One pointer line; the content is in the new `longterm` command |
| 5 | Horizons mixed (6-month holds, intraday paper, research, practice account in one stream) | Same as 1 | Fixed sections, in priority order: CRITICAL, TODAY'S ACTIONS (sells, then permitted buys), NOT ACTIONABLE TODAY, APPROVED LANES (status), SHORT-TERM OPPORTUNITIES (research and paper), CURRENT HOLDINGS, RECORDS, CONTEXT, SYSTEM HEALTH, LONGER-TERM pointer. Each BUY lane header states its horizon, approval status and "permitted today" |
| 6 | **A tap on "Bought X (N sh)" recorded a buy at the live price at once** | The callback handler wrote the trade on the first tap | A tap records nothing. It asks: "Record your buy of X? Confirm records N shares at P (the live price now), or send your real fill". Only Confirm, or the owner's own `bought` / `sold` line, records. Same for "I sold all" and the BUY NOW alerts |
| 7 | Buttons offered for buys the message did not permit | Buttons came from the engine candidates, not from the message | Buttons only for the BUY lines under TODAY'S ACTIONS of the same message, plus "I sold all" for held stocks |
| 8 | Kuwait times hard-coded ("4:30 pm", "4:45 pm Kuwait"): an hour wrong from 2 Nov | Fixed strings in 13 places in `scan.mjs`, plus `premarket-check.mjs` and `intraday-radar.mjs` | `kwt(nyMinute, sessionDay)` from the New York calendar (daylight saving switches 1 Nov 2026 and 14 Mar 2027, holidays, weekends). Messages say e.g. "Market opens 5:30 pm Kuwait on 2026-11-02" |
| 9 | Refused Telegram messages were logged and lost; a rate limit (429) was not retried | `telegram()` broke out on any non-OK reply | 429: wait the time Telegram gives, then retry. Any other refusal or a network failure after 3 tries goes to `data/tg-failures.jsonl`, and SYSTEM HEALTH shows "TELEGRAM: N messages NOT delivered in the last 24 h" |
| 10 | Paper records worded as instructions ("STOP using", "keep amounts normal", "If you buy one, use half") under the trading part | The live-record lines were written as advice | In RECORDS, as records: "LOSING on 20+ live paper trades", "POSITIVE SO FAR ... below the full live bar, so engine buys stay paused" |
| 11 | Real trades, forward paper and the practice account side by side without labels | Same as 5 | RECORDS section: YOUR REAL TRADES (what you reported) / FORWARD PAPER RECORD (signals the system logged, not your trades) / PRACTICE ACCOUNT (fake money). Checked: the real-trade total (+11.1% after costs, +17.5% before, on 8 sales) matches `data/my-trades.jsonl`; each row's `pct` already carries the 0.8% cost |
| 12 | `focus on` / `quiet on` confirmations no longer described what they do | Written before the radar and early alerts | They now name the paused lanes and the separate switches (`radar`, `alerts`) |
| 13 | A repeated `bought SYM PRICE` silently replaced the earlier record | No message on overwrite | "CORRECTED SYM: your earlier record (bought A on D) is REPLACED by this one (B). If you bought MORE shares instead, send: added SYM PRICE SHARES" |
| 14 | No company name, no spread or +2%-net hurdle on buy lines | Not built | Names from the SEC ticker file, cached in `data/names.json` (a failed lookup shows the ticker only). Each buy line gives the gross move +2% net needs: overnight signals use an assumed spread and say so; EARLY WATCH alerts use the recorded bid/ask (owner approved) |
| 15 | SYSTEM HEALTH only as a separate message | Not in ACTIONS | One line in ACTIONS: health problems, the live watcher's first minute (LATE if after 9:35 New York), Telegram failures |

## 2. Before and after (28 Oct data; holdings left out)

**Before (excerpt):**

```
HALAL NOT MARKED: TGT. Check each in ZAD, then send  halal SYM yes  or  halal SYM no .
LONGER HOLDS (...TRADABLE SMALL (tier 2)...):
- BUY WST up to 406.26 (2% above the last close), F-score 9/9. STOP 25% under your buy ... Check ZAD first; send  bought WST PRICE .
- BUY HQY up to 102.90 ...
- BUY MMSI up to 95.40 ...
LEADER DIP (your trading lane, 27 Oct: 3 slots of 1,000 USD, sell at +20%)
MARK HALAL FIRST (leader dip picks, no ZAD mark of yours yet): VLO. Check ZAD, send  halal SYM yes  and they can be bought next time.
...
FOCUS MODE (4-week plan from 18 Oct): no new trading buys until an engine shows a positive live record.
...
LONG-TERM (separate from trading ...):
- YARDSTICK ... a halal index fund ...
- BEST USE OF YOUR NEXT 1,000 USD: 1) hold cash, or 2) add to your halal index fund ...
Tap a button below after you act: I record it for you.          (buttons: "Bought X (N sh)" recorded on the first tap)
```

**After (excerpt):**

```
MORNING ACTIONS, 2026-10-28. Market opens 4:30 pm Kuwait.
POLICY TODAY: focus ON: engine buys PAUSED; your own lanes (LEADER DIP, LONGER HOLDS, EARNINGS DRIFT) active. Research and paper are never buys.

TODAY'S ACTIONS
SELL (exits your rules call for; at the open after the first 15 minutes, 4:45 pm Kuwait, unless the line says otherwise):
- [your holdings with a sell signal]

NOT ACTIONABLE TODAY (shown so nothing looks hidden; do not buy these)
- MARK HALAL FIRST (rule picks with no ZAD mark of yours: not a buy until you mark them): WST, HQY, MMSI. Check ZAD, then send one of:
halal WST yes   or   halal WST no
halal HQY yes   or   halal HQY no
halal MMSI yes   or   halal MMSI no
- MARK HALAL FIRST (leader dip picks ...): VLO. ... halal VLO yes   or   halal VLO no
- ENGINE BUYS PAUSED by focus mode (no engine kind proven on live paper yet; logged on paper): none today.  focus off  shows them as buys.

APPROVED LANES (status)
- LONGER HOLDS: no buy today; 3 picks need your ZAD mark first (YOUR LABELLED CHOICE (20 Oct), tier 2 TRADABLE SMALL).
- LEADER DIP: no buy today.
- TRY SMALL: PAPER ONLY (your decision 27 Oct).
- EARNINGS DRIFT: no buy tonight (88 reported; 17 beat by 10%+; 3 passed the reaction-day test; ...).
- ENGINE (swing / quick rules): paused by focus mode until a kind shows a positive live record.

SHORT-TERM OPPORTUNITIES (research and paper: NOT approved buys)
- During the session (4:30 pm to 11 pm Kuwait): EARLY WATCH messages ... and the OPPORTUNITY RADAR at 6:15 pm Kuwait.
...
CURRENT HOLDINGS / RECORDS / SYSTEM HEALTH ...
LONGER-TERM: kept separate (send  longterm ). Your monthly SPUS + IAUM plan is unchanged.
```

Length: 6,811 → 4,812 characters.

**With a ZAD mark**, the same pick is an action with its card:

```
LONGER HOLDS | horizon: hold up to 6 months | YOUR LABELLED CHOICE (20 Oct), tier 2 TRADABLE SMALL: ... NOT PROVEN | permitted today: yes ...
- BUY WST (WEST PHARMACEUTICAL SERVICES INC) up to 406.26 ..., F-score 9/9. STOP 25% under your buy at your broker. spread not recorded
  overnight; +2% net on 1,000 USD needs about +2.9% gross at an assumed 0.3% spread (check the live bid/ask in ZAD). ...
```

**EARLY WATCH lead (owner approved):**

```
Spread now 2.00% (bid $4.95 / ask $5.05, quote 3 s old): +2% net on 1,000 USD needs at least +4.6% gross.
```

## 3. Files changed

| File | Change |
|---|---|
| `scan.mjs` | `actionsText` (sections, policy, halal gate); `longTermLines` / `longTermText` / `longterm` command; `companyNames`; `hurdleText`; `healthLine`; `kwt` / `sessDay` and every Kuwait time; `halalAsk` in 4 places; `tradeButtons` + the callback confirmation flow; BUY NOW buttons; `tgFailed` + 429 retry in `telegram()`; CORRECTED reply; `focus` / `quiet` texts; HELP |
| `early-alerts.mjs` | `spreadHurdle` in research leads and paper setups (display only); `notePaper` takes the quote |
| `ignition-watch.mjs` | Passes the quote and its age to the early alerts (display only) |
| `premarket-check.mjs`, `intraday-radar.mjs` | Kuwait open time from the New York calendar |
| `.github/workflows/pages.yml` (new) | Publishes ONLY `index.html` (a guard fails the run if anything else is in the site). Inert until the owner changes one setting (below) |
| `.github/actions/private-data/action.yml` (new, later replaced) | Replaced the same day by `.github/private-data.sh`; see docs/private-data-migration-2026-10-28.md |
| Tests | `test/bot-actions.test.mjs` (8), `test/bot-commands.test.mjs` (12), added cases in `test/early-alerts.test.mjs`, `test/leader-dip.test.mjs`, `test/focus-per-kind.test.mjs` |

## 4. Tests

**All 1,099 pass** (1,078 before this repair).

**ACTIONS (`test/bot-actions.test.mjs`), integration tests of the real `scan.mjs` on fixture files, no network:**

- the 28 Oct contradiction;
- unmarked picks;
- NOT HALAL picks;
- a quiet day;
- section order with a CRITICAL holding;
- records labelled apart;
- Kuwait times across both clock changes, Thanksgiving, a weekend and Friday after the close;
- a stock in two lanes shown once.

**Commands and buttons (`test/bot-commands.test.mjs`), the real Telegram loop against a local stub:**

- a first tap records nothing; Confirm records the shown shares and price; Cancel records nothing;
- "I sold all" confirms first;
- a tap from another chat is ignored;
- buttons only for TODAY'S ACTIONS buys;
- `alerts all|paper|approved|off`, `radar on|off`, `focus on|off`, `quiet on|off` change only their own setting and say so;
- `radar` alone changes nothing;
- `halal TGT yes|no` writes only TGT and keeps the 1-space format;
- `bought` / `sold` lines; correction by re-sending;
- `opportunities`, `details`, `review TGT`, `paper`, `lab`, `longterm`, `help` answer;
- a 429 is retried; a 400 is recorded and shown in SYSTEM HEALTH.

**Scenarios from the owner's list, and where each is covered:**

| Scenario | Covered by |
|---|---|
| No opportunities | quiet-day test |
| Many opportunities and the alert cap | `test/early-alerts.test.mjs` |
| SEC danger filing | early-alerts, radar and `rank-models` tests |
| Missing halal approval | `bot-actions` |
| Watcher failure | `test/watcher-guard.test.mjs`; SYSTEM HEALTH LATE line |
| Data-provider outage | radar "NO MARKET DATA" test; catalyst UNAVAILABLE tests |
| Wide spreads | `spreadHurdle` test |
| Holidays and daylight saving | `kwt` / `sessDay` test |
| Conflicting focus settings | policy test |
| Failed delivery | the 400 / 429 test |
| Trade recording and correction | `bot-commands` |
| A stock in several lanes | `bot-actions` |

## 5. Confirmations

- **No rule lowered.**
  - Halal: one rule tightened, so an unknown mark is never a BUY in any lane.
  - The under-1 USD, SEC danger, AVOID-list and liquidity rules are unchanged.
  - Stops, gates, costs and lane rules (LEADER DIP, LONGER HOLDS, TRY SMALL, EARNINGS DRIFT) are unchanged.
- **Settings are only read** by ACTIONS, never written. Each switch changes only its own key (tested).
- **The ranking experiment is untouched:** its files have no diff, the first-come live selection is unchanged, and the spread line is display only (the alert decision is tested unchanged).
- **Same side effects as before:** ledgers and paper logs are written in the same order (`tier2Log`, `ldipOfferLog`, the TRY SMALL ledger, the AVOID ledger).

## 6. Rollback

- **Revert this commit:** `git revert <commit>`. All files go back; `data/names.json` and `data/tg-failures.jsonl` are passive and can stay.
- **The website:** leave Settings → Pages on "Deploy from a branch" (today's setting) and `pages.yml` does nothing visible.
- **The private-data action** is not used by any workflow until the owner's two steps are done.

## 7. Decisions for the owner

1. **Mark halal in ZAD** for WST, HQY, MMSI (LONGER HOLDS) and VLO (LEADER DIP). Until then they are correctly not buys.
2. **Website:** Settings → Pages → Build and deployment → Source: **GitHub Actions**. After that only `index.html` is published, and `.../data/my-positions.json` stops being a web page. One setting; undo by switching back.
3. **Private data repository** (approved; two steps only the owner can do):
   1. Create a private repository `stock-2-private-data` (empty is fine).
   2. Create a fine-grained token with Contents read/write on that repository only. Add it to Stock-2 → Settings → Secrets → Actions as `PRIVATE_DATA_TOKEN`.

   Then Claude will:
   - copy the 5 files across;
   - add the pull / push step to every workflow that reads or writes them (halal marks: 61 scripts; settings: 26; positions: 9);
   - run the tests;
   - switch over on a weekend, so stop alerts are never at risk;
   - remove the files from the public repository (`.gitignore`).

   No billing change: workflows keep running in the public repository. Past versions stay in public history unless the owner later approves a history rewrite (plan option 4).
4. **LONGER HOLDS** still logs its picks to its paper ledger (unchanged). Whether unmarked picks should be logged is a choice to keep or change.
