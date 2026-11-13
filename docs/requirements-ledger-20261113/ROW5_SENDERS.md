# Telegram push inventory (origin/main 24f215d9, read-only)

Scope: every non-test `.mjs` file that sends to Telegram, plus the `RUN FAILED` curl steps in workflow YAML. Line numbers are `git show origin/main:<file>` lines. Schedules are UTC cron.

## Summary

Current gate state: `data/settings.json` on main sets none of `quiet`, `opportunitiesOnly`, `focus`, `alerts`, `radar` or `runners`. So the defaults apply:
- quiet = ON
- opportunitiesOnly = ON
- focus = ON
- alerts = `all`
- radar = ON
- runners = ON

Sender rows by primary class (a row whose message mixes classes is counted under its most important class):

| Class | Rows | Notes |
|---|---|---|
| S | 6 | 3 of them mix in HOLD or NO BUY lines that belong in QUIET |
| A | 3 | Nightly ACTIONS also pushes on routine NO BUY nights |
| C | 5 | One row groups 4 workflows |
| P | 0 standalone | The basket rebalance notice is P, inside the A basket row |
| QUIET | 46 | 23 are already suppressed by the defaults or are manual-only (KEEP); 23 still push and need a code change |
| REPLY | 4 | |

Highest-volume QUIET pushes that are still live under the defaults, by how often they are scheduled:

1. **intraday-radar.mjs:264 `EARLY-WAVE RADAR: BUY`**
   - Runs 36 times a weekday (`5,20,35,50 13-21 * * 1-5`).
   - The `BUY` variant skips the quiet gate.
   - These are paper-earned setups, not an approved lane. Capped at 3 review alerts a day.
2. **news-watch.mjs:80 `MARKET SHOCK` / `MARKET NEWS (heads-up)`**
   - Runs 40 times a weekday (`*/15 11-20 * * 1-5`).
   - No settings gate. One push per new S&P move level (up to 4 a day), plus pushes for tier-1 headlines on a 1%+ day.
   - The text mostly says "HOLD everything".
3. **early-alerts.mjs:147 (sent by ignition-watch.mjs:203) `EARLY WATCH: RESEARCH LEAD` (up to 5 a day) and `PAPER SETUP` (up to 4 a day)**
   - The live watcher checks every minute in the session.
   - `alerts` defaults to `all`, so up to 9 research pushes a day.
4. **ignition-watch.mjs:169 `IGNITION ALERT | FAST DAY TRADE`**
   - Minute loop, up to 6 a day.
   - This is not one of the owner's listed approved lanes (monthly core, LEADER DIP, LONGER HOLDS).
5. **The daily repeats, each pushed every weekday:**
   - opportunity-radar.mjs:52 + :62: midday radar plus after-close radar, 2 a day (only `radar off` stops them).
   - scan.mjs:1944 `MORNING ACTIONS`: a daily repeat of the nightly ACTIONS.
   - scan.mjs:4329 `MARKET OPEN CHECK`: daily.
   - fastmover-lab.mjs:291 `DAY-TRADE LIST`: Tue–Sat.
   - octopus.mjs:166 `OCTOPUS DAILY`: Tue–Sat, whenever its 5-year verdict is PROMISING.

Other findings:
- The handbook says options are PAPER from 28 Oct, but scan.mjs:2846 (`OPTIONS TRIAL TICKET`) and :2872 (options lane ticket) still push real "In ZAD: ... BUY CALL" tickets. No settings switch controls them.
- Six weekly study senders bypass quiet whenever a verdict is `PROMISING`, has changed, or carries a warning. These are earnings-study, events-study, fastmover-lab study and intraday modes, hunting-lab, score-study and winners-study.
- Every lab workflow's `if: failure()` step pushes `RUN FAILED`. For research jobs this is not critical. health.mjs already reports stale outputs.

## Table

| file:line | workflow + schedule | message head | class | existing gate | recommendation |
|---|---|---|---|---|---|
| ignition-watch.mjs:292 (send via `tg()` :138-140) | ignition.yml `45 12,13 * * 1-5`, minute loop in session | (stopText from stop-watch.mjs) stop hit / stop unknown | S | Deduplicated per stock and kind per day (MESSAGE_STATE, STOP_SENT) | KEEP: this is the primary stop route |
| scan.mjs:4334 | bot.yml (chat mode, every 5 min) and main.yml `10,40 13-20 * * 1-5` | `YOUR STOPS (bot check; the live watcher had not confirmed these)` | S | Only when the watcher has no acknowledged send; once a day per stock | KEEP: stop fallback |
| scan.mjs:2841 | main.yml `30 21 * * 1-5` (optionsShadow inside daily) | `OPTIONS TRIAL: SELL TO CLOSE your 1 x ...` | S | Once a day per contract (`o.notified`) | KEEP: exit for a contract the owner really holds |
| scan.mjs:4335 | main.yml intraday `10,40 13-20 * * 1-5`; bot.yml chat mode, positions only | `Market hours check` | S (mixed) | Deduplicated per stock and key per day; quiet mode drops paper-trade lines only | NEEDS CODE CHANGE: push only `YOUR POSITION` target lines; QUICK TRADE, LEADER, above/below range and `NOTHING TO DO YET` lines go to the report |
| news-watch.mjs:110 | news.yml `*/15 11-20 * * 1-5` | `NEWS DECISIONS (HH:MM Kuwait)` | S (mixed) | Headlines deduplicated by id; no settings gate | NEEDS CODE CHANGE: push only `SELL NOW` lines (held stock at or under its stop); HOLD and NO BUY TODAY lines go to the report |
| premarket-check.mjs:85 (sendPremarket :62-84) | premarket.yml `40 12 * * 1-5` | `PRE-MARKET CHECK <day> (regular open ... Kuwait)` | S (mixed) | Only in the PRE_MARKET phase, with fresh price evidence; no settings gate | NEEDS CODE CHANGE: push only when stop-observed or exit rows exist; HOLD context goes to the report |
| scan.mjs:4332 | main.yml intraday `10,40 13-20 * * 1-5` | `BUY NOW: a proven setup is inside its buy range` | A | planCands (focus pauses engine buys; ZAD halal 'yes' needed), fresh-quote gate, once per stock per day | KEEP |
| scan.mjs:4234 | main.yml `30 21 * * 1-5` | `ACTIONS FOR THE NEXT SESSION (... close)` | A (mixed A/S/QUIET) | quiet ON chooses this single message (off: scan.mjs:4240/4244/4249) | NEEDS CODE CHANGE: push only when TODAY'S ACTIONS has a buy or sell, or CRITICAL is set; otherwise store. Move the Tue/Thu/Fri `MID-WEEK`/`WEEKLY` scorecard add-on to the report |
| scan.mjs:3257 (basketDue :3250-3252) | bot.yml chat mode, every 5 min | Monthly core reminder / basket rebalance notice | A (monthly) / P (rebalance) | Once a month (`S.monthly`); rebalance only when the formation changes | KEEP |
| scan.mjs:3818 | main.yml `30 21 * * 1-5` | `Stock scanner: could not load market data today` | C | Only when SPY fails to load | KEEP |
| scan.mjs:3097 | bot.yml chat mode, every 5 min | `WATCHDOG` / `The ... for the ... close has not completed` | C | Once per source per expected session | KEEP; check that sourceFreshness lists only sources that feed ACTIONS or holdings |
| watcher-guard.mjs:17 | bot.yml, every 5 min (9:05–15:00 New York) | `WATCHER LATE / WAITING / STOPPED EARLY / DOWN`, `WATCHER GUARD could not start ...` | C | guardDecide state, deduplicated per day | KEEP: the stop route depends on the watcher. Consider pushing only DOWN and could-not-start; LATE and WAITING to the report |
| health.mjs:75 | calendar.yml `45 20 * * 1-5`, `30 5 * * 0` | `SYSTEM HEALTH: N problem(s) (M parts fine)` | C (mixed) | Once a day per distinct problem set, plus a recovery message | NEEDS CODE CHANGE: push only problems in sources that feed ACTIONS, holdings or stops; lab staleness and the recovery message go to the report |
| bot.yml:86, main.yml:66, ignition.yml:64, calendar.yml:62 | as each workflow | `RUN FAILED: <workflow>. ... Send this message to Claude.` | C | `if: failure()` | KEEP: these jobs deliver plans, holdings and stops |
| early-alerts.mjs:147 (text :104, sent by ignition-watch.mjs:203 `tgSend`) | ignition.yml, minute loop | `EARLY WATCH: RESEARCH LEAD(S) (NOT AN APPROVED BUY)` | QUIET | `alerts` level (`all` by default → sent; `paper`/`approved`/`off` mute it), up to 5 a day, hard blocks | NEEDS CODE CHANGE: make the default `approved`, or always store to opp-ledger without a push |
| early-alerts.mjs:147 (text :111) | ignition.yml, minute loop | `EARLY WATCH: PAPER SETUP(S) (NOT AN APPROVED BUY)` | QUIET | `alerts` all or paper → sent, up to 4 a day | NEEDS CODE CHANGE: same as the row above |
| ignition-watch.mjs:169 | ignition.yml, minute loop | `IGNITION ALERT \| FAST DAY TRADE, separate from ...` / `EARLY WAVE ALERT [PAPER, NOT PROVEN]` | QUIET (not a listed approved lane) | EARLY variant blocked by opportunitiesOnly (default ON); approved variant: rule passed, paper record OK, halal not fail, SEC clean, up to 6 a day | NEEDS CODE CHANGE / owner decision: reclassify as A only if the owner names IG day trades an approved lane |
| opportunity-radar.mjs:52 (run by ignition-watch.mjs:257 at about 11:15 New York) | ignition.yml | `OPPORTUNITY RADAR <time> New York ... Research list: nothing ... is an approved buy` | QUIET | only `radar off` (ignores quiet, opportunitiesOnly and focus by design) | NEEDS CODE CHANGE: write to the ledger and report, no push |
| opportunity-radar.mjs:62 | opportunity-radar.yml `40 20 * * 1-5` | `Research ledger view ... OPPORTUNITY RADAR, AFTER THE CLOSE` + scorecards | QUIET | only `radar off` | NEEDS CODE CHANGE: report only |
| intraday-radar.mjs:264 | intraday-radar.yml `5,20,35,50 13-21 * * 1-5` | `EARLY-WAVE RADAR: BUY` / `: REVIEW (paper only)` | QUIET | REVIEW: !quiet. BUY: always pushed. Capped at 3 review alerts a day | NEEDS CODE CHANGE: a paper-earned BUY is not an approved lane; quiet-gate it too |
| intraday-radar.mjs:265 | same | `EARLY-WAVE RADAR: PRE-WAVE WATCH` | QUIET | !quiet | KEEP (already suppressed) |
| intraday-radar.mjs:268 | same, manual dispatch only (FORCE) | `RADAR TEST RUN, MARKET CLOSED` | QUIET | Market-closed runs exit at :23 unless FORCE | KEEP (manual only) |
| intraday-radar.mjs:286 | same | `EARLY-WAVE SCORECARD, <day>` | QUIET | !quiet | KEEP (already suppressed) |
| news-watch.mjs:80 | news.yml `*/15 11-20 * * 1-5` | `MARKET SHOCK: S&P 500 ...` / `MARKET NEWS (heads-up)` | QUIET | Once per move level per day; headline path needs a 1%+ market move; no settings gate | NEEDS CODE CHANGE: report only (it advises HOLD; stops are covered by S routes) |
| scan.mjs:1944 | bot.yml chat mode (4:00–5:00 New York, weekdays) | `MORNING ACTIONS, <day>. Market opens ... Kuwait.` | QUIET (repeat) | Once a day (`st.brief`); this is the quiet-ON path | NEEDS CODE CHANGE: push only if it differs from last night's ACTIONS (then it is P) |
| scan.mjs:1945 | same | `MORNING PLAN, <day>. Market opens ...` | QUIET | quiet OFF only | KEEP (already suppressed) |
| scan.mjs:4329 | main.yml intraday `10,40 13-20 * * 1-5` | `MARKET OPEN CHECK (... Kuwait). The system is running.` | QUIET | Once a day; no settings gate | NEEDS CODE CHANGE: a routine status/NO BUY message; report only |
| scan.mjs:655 | bot.yml chat mode (Sunday, Kuwait 08:00+) | (scoreboardText) Sunday scoreboard | QUIET | Once a Sunday; no settings gate | NEEDS CODE CHANGE: scores/boards go to the report |
| scan.mjs:4235 | main.yml `30 21 * * 5` | (optionsText) weekly options paper message | QUIET | Friday, quiet-ON path; no gate | NEEDS CODE CHANGE: report only |
| scan.mjs:2846 | main.yml `30 21 * * 1-5` | `OPTIONS TRIAL TICKET (separate from your stocks; 1 contract ...)` | QUIET (lane is PAPER per handbook) | At most 1 a night, fewer than 2 real contracts open, ZAD halal ok, ask ≤ $3 per contract (≤ $300) | NEEDS CODE CHANGE: options are PAPER since 28 Oct; add a settings switch (off by default) |
| scan.mjs:2872 | same | (optionsLabTicketText) options lane ticket | QUIET (PAPER lane) | Rule at tier 2 or proven in options-lab; ZAD halal ok; at most 2 open | NEEDS CODE CHANGE: same as :2846 |
| scan.mjs:2062 | bot.yml chat mode | `RUNNERS NOW (heads-up only: already up 20%+ ...)` | QUIET | `runners` ≠ false AND `opportunitiesOnly === false` AND quiet → off by default | KEEP (already suppressed) |
| scan.mjs:2063 | bot.yml chat mode | `FAST MOVERS REQUIRING INVESTIGATION` | QUIET | !quiet | KEEP (already suppressed) |
| scan.mjs:4229 | main.yml `30 21 * * 5` | Friday weekly study (SECTORS, TREND, SIGNALS ...) | QUIET | !quiet | KEEP (already suppressed) |
| scan.mjs:4240 / 4244 / 4249 | main.yml `30 21 * * 1-5` | `PLAN FOR THE NEXT SESSION`, `YOUR STOCKS: what to do ...`, `WEEKLY REVIEW OF YOUR STOCKS` | QUIET (legacy non-quiet path) | quiet OFF only | KEEP (already suppressed; ACTIONS replaces them) |
| fastmover-lab.mjs:291 | movers.yml `0 4 * * 2-6` (MODE=live) | `DAY-TRADE LIST for <day> (rules that passed the 5-year fast-mover test ...)` | QUIET (not an approved lane) | Only when the list is non-empty; no quiet gate | NEEDS CODE CHANGE: not an owner lane; report only |
| fastmover-lab.mjs:179 | fastmover-intraday.yml `0 5 * * 6` (MODE=intraday) | `IGNITION TEST (minute by minute ...)` | QUIET | !quiet OR any PROMISING | NEEDS CODE CHANGE: drop the PROMISING override (study summary) |
| fastmover-lab.mjs:246 | leaders-study.yml `0 6 * * 0` (MODE=study) | Fast-mover study: `DAY-TRADE AND OVERNIGHT RULES ...` | QUIET | !quiet OR pass | NEEDS CODE CHANGE: drop the override |
| octopus.mjs:166 | movers.yml `0 4 * * 2-6` (MODE=daily) | `OCTOPUS DAILY <day> (model trained to ...)` | QUIET | Only when the 5-year verdict is PROMISING; no quiet gate | NEEDS CODE CHANGE: quiet-gate it (live-paper buy list not passed) |
| octopus.mjs:233 | leaders-study.yml `0 6 * * 0` | Octopus study (`WHAT IT LEARNED ...`) | QUIET | !quiet | KEEP |
| hunting-lab.mjs:371 | leaders-study.yml `0 6 * * 0` | Hunting lab study (`SCORE TEST ...`, `ON PAPER ...`) | QUIET | !quiet OR best quick filter / PREDICTS / PROMISING / risingOnly / GRADUATED | NEEDS CODE CHANGE: drop the overrides |
| earnings-study.mjs:199 | Smart-money.yml `20 11 * * 1-5`, `30 9 * * 0`; leaders-study.yml `0 6 * * 0` | `EARNINGS SURPRISE DRIFT, fair test <day>` | QUIET | !quiet OR verdict changed | NEEDS CODE CHANGE: drop the `changed` override |
| events-study.mjs:343 | same as earnings-study | `EVENT STUDY (company news -> what the stock did next)` | QUIET | !quiet OR pass OR warns | NEEDS CODE CHANGE: drop the overrides (danger warnings already reach ACTIONS as SELL reasons) |
| score-study.mjs:93 | leaders-study.yml `0 6 * * 0` | `STOCK SCORE, <day>` | QUIET | !quiet OR PROMISING | NEEDS CODE CHANGE: drop the override |
| winners-study.mjs:146 | leaders-study.yml `0 6 * * 0` | `WINNERS STUDY, <day>` | QUIET | !quiet OR promising | NEEDS CODE CHANGE: drop the override |
| leaders-study.mjs:295 | leaders-study.yml `0 6 * * 0` | `LEADERS FAIR TEST, <day>` | QUIET | !quiet | KEEP |
| autolab.mjs:194 | leaders-study.yml `0 6 * * 0` | `AUTOLAB: the system invented and tested ...` | QUIET | !quiet | KEEP |
| exits.mjs:134 | leaders-study.yml `0 6 * * 0` | `EXIT TEST (when to sell): the same buys sold 10 ways ...` | QUIET | !quiet | KEEP |
| horizons.mjs:92 | leaders-study.yml `0 6 * * 0` | `HORIZONS (mid and long term: 1, 3 and 6 months ...)` | QUIET | !quiet | KEEP |
| quality.mjs:224 | leaders-study.yml `0 6 * * 0`; options-lab.yml `0 12 * * 6` | `QUALITY COMPANIES (long investing ...)` | QUIET | !quiet | KEEP |
| rebalance.mjs:92 | leaders-study.yml `0 6 * * 0` | `REBALANCING TEST (...)` | QUIET | !quiet | KEEP |
| rebuy.mjs:88 | leaders-study.yml `0 6 * * 0` | `SELL NOW, BUY BACK LOWER? (...)` | QUIET | !quiet | KEEP |
| stops.mjs:77 | leaders-study.yml `0 6 * * 0` | `STOP STUDY (where to put the stop on your own buys ...)` | QUIET | !quiet | KEEP |
| deals.mjs:107 | deals.yml `50 11 * * 1-5` | `DEALS AND NEW LISTINGS, <day>` | QUIET | !quiet | KEEP |
| discover.mjs:93 (callers :372, :381) | discover.yml `30 5 * * 2-6` | `Discovery engine, <day>` | QUIET | !quiet (inside the wrapper) | KEEP |
| movers.mjs:38 (callers :254, :276, :359) | movers.yml `0 4 * * 2-6` | `Movers radar, <day>` / flags / `TODAY'S MOVERS, WHY EACH WAS NOT ...` | QUIET | !quiet (inside the wrapper) | KEEP |
| tipranks.mjs:76 (caller :139) | Tiprank.yml `30 22 * * 1,4` | `TipRanks radar` | QUIET | !quiet (inside the wrapper) | KEEP |
| smart-money.mjs:163 | Smart-money.yml `20 11 * * 1-5`, `30 9 * * 0` | `SMART MONEY AND ANALYSTS, <day>` | QUIET | !quiet | KEEP |
| Smart-money.yml:81, Tiprank.yml:40, deals.yml:41, discover.yml:50, fastmover-intraday.yml:61, follow-lane.yml:79, intraday-radar.yml:46, leaders-study.yml:494, movers.yml:74, news.yml:41, opportunity-radar.yml:45 | each workflow's schedule (follow-lane `5 21 * * 1-5`, `0 14 * * 0`) | `RUN FAILED: <workflow>. ... Send this message to Claude.` | QUIET (research jobs) | `if: failure()` only | NEEDS CODE CHANGE: log to the health report (health.mjs already flags stale outputs); keep the push only for bot/main/ignition/calendar |
| private-data-check.yml:37 | manual (workflow_dispatch) | `PRIVATE DATA CONNECTION: PASSED/FAILED ...` | QUIET (manual) | manual run only | KEEP (owner-triggered) |
| scan.mjs:3611 | bot.yml chat mode (every 30 s reply loop) | replies to owner commands (`Your tracked positions:`, HELP, check, etc.) | REPLY | Only for updates from the owner's chat | KEEP |
| scan.mjs:3278 (`ask`) | bot.yml | `Record your buy of ...? Confirm records ...` / `Record that you sold ALL ...?` | REPLY | Callback from the owner's own tap | KEEP |
| scan.mjs:3291 | bot.yml | `Why did you skip ...? (one tap ...)` | REPLY | After a Skipped tap | KEEP |
| scan.mjs:1168 (`sendMenu`, called at :3302 and :3314) | bot.yml | (MENU_TEXT) one-tap menu keyboard | REPLY | On `menu`/`start`, or once after a MENU_V change | KEEP |

Notes:
- scan.mjs:1044 is the body of the `telegram()` wrapper (:1034); every scan.mjs `telegram(` row above goes through it.
- `MODE` for scan.mjs works like this:
  - main.yml cron `10,40 13-20` → `intraday()` (the full watch list);
  - `30 21` → `daily()`;
  - bot.yml → `MODE=chat` → `intraday(true)`, run every 5 min, with `BOT_ONLY` reply passes in between.
- Gating switches found:

  | Switch | Default | Effect |
  |---|---|---|
  | `quiet` (scan.mjs:3006 and each lab's own copy) | ON | Suppresses the lab and research senders marked KEEP above |
  | `opportunitiesOnly` (opp-mode.mjs:3-4) | ON | Blocks EARLY WAVE ALERTs and RUNNERS NOW |
  | `runners` | ON | Must also be on for RUNNERS NOW |
  | `focus` | ON | Pauses engine buys in planCands, so it affects BUY NOW and ACTIONS buys only |
  | `alerts` (early-alerts.mjs:18-19, 93) | `all` | Controls EARLY WATCH leads and paper setups |
  | `radar` (radar-v3-core.mjs:19) | ON | Controls only the opportunity radar |

  No switch controls: news-watch, premarket-check, health, watcher-guard, the options tickets, the fastmover DAY-TRADE LIST, OCTOPUS DAILY, the Sunday scoreboard, MARKET OPEN CHECK or MORNING ACTIONS.
