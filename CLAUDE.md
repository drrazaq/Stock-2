# Stock-2: system handbook

For the owner, and for any Claude working in this repo. Claude Code reads this file automatically. Updated 28 Oct 2026.

---

## 1. What Stock-2 is

- **Owner:** Abdulrazaq, a dental surgeon in Kuwait (UTC+3). Not a programmer. Wants **short, results-first messages**: "buy this, sell this, target reached, next". He wants to trade and win, not read information.
- **The system:** a halal, long-only **US-stock decision system**.
  - It runs on **GitHub Actions** (repo `drrazaq/Stock-2`, public) and talks to the owner through a **Telegram bot**.
  - **It never places orders.** The owner trades by hand in his broker, **ZAD** (built on Alpaca).
  - The Alpaca account the bot uses is **paper (fake money) only**.
- **Halal is decided only by the owner's ZAD marks:**
  - his own marks are in `data/halal.json`;
  - ZAD's quarterly not-halal list is in `data/zad-list.json`;
  - an unknown stock is never a buy.
- **ZAD costs:** about $3 per stock per order. Whole-number % in ZAD baskets. Options are live in ZAD at $5 a contract, but stay paper here.

## 2. The money plan right now (owner decisions, 27 Oct 2026)

| Part | What | Status |
|---|---|---|
| **Monthly core** | Whole monthly amount into **SPUS 54% + IAUM 46%** (2 orders). The bot reminds him on the first trading day of each month. | REAL |
| **LEADER DIP lane** | His trading lane: up to **3 slots × $1,000** (see 2a). | REAL |
| Basket 1 (halal top 10, Jan/May/Sep) | Switched off at the owner's request; `settings.basket1 = true` turns it back on. | OFF |
| TRY SMALL (9 rules, $1,000 each) | **Paper only** since 27 Oct. The 2-slot account replay did not beat SPY. Picks are shown as PAPER and logged; `settings.trySmallReal = true` turns real buys back on. | PAPER |
| LONGER HOLDS (V15, max 3) | Owner's labelled choice, not proven. Ask him before changing it. | LABELLED |
| Options ($300 / $2,000 lanes) | Long calls only, real ask/bid. | PAPER (from 28 Oct) |
| Alpaca practice account | Tests unproven engines with fake money. A **PRACTICE ACCOUNT** line in ACTIONS shows its total, so nothing looks "hidden". | PRACTICE |

### 2a. The LEADER DIP lane

- **Entry:** a top-300 company makes its first close 12% under its 50-day high while still above its 200-day average. Buy at the next open.
- **Exit:** a **sell limit at +20%** (good-till-cancelled), or sell after **126 sessions** (about 6 months). **No stop** (that is how it was tested).
- **Tested:** 73% / 75% of trades won. As a 3-slot account it was about equal to SPY.
- **Safety brake:** new buys switch off if 10+ finished trades average below 0.
- **In the code:** functions `ldip*` in `scan.mjs`; records in `data/leaderdip-ledger.jsonl`.

### 2b. Current holdings (`data/my-positions.json`, edited only on the owner's instruction)

TTD, RKLB, LLY, RELL, IESC, COHR, SYM, CIEN, APP, CCJ, GRML, TGT.

- **TGT:** a LEADER DIP buy at $149.12 on 27 Oct, target $178.94, time exit about late April 2027.
- **Advised SELL:** GRML (late-filing danger flag) and CIEN.

## 3. What the bot sends (Telegram)

- **ACTIONS** (nightly): sells first, then buys (LEADER DIP), PAPER lines, MARK HALAL FIRST, then the PRACTICE ACCOUNT line.
- **Sell/hold review of every holding.** A SELL reason comes from:
  - a stop hit;
  - a halal fail;
  - **danger filings**: an NT 10-K/10-Q late notice (90 days) or an 8-K 3.01 delisting notice (60 days, merger closings skipped);
  - a TIME EXIT;
  - TARGET REACHED.

  It also warns about earnings within 10 days, dilution, news threats and size over 15%.
- **Health check:** "SYSTEM HEALTH: N problems". The owner forwards it to Claude to fix.
- **EARLY WATCH alerts** (28 Oct, `early-alerts.mjs`, sent by the live watcher): RESEARCH LEAD (trigger EW-ALERT-1, max 5/day) and PAPER SETUP (IG rule hits, max 4/day), always labelled NOT AN APPROVED BUY; hard rules block both. `alerts all|paper|approved|off`. Every candidate's decision and 15:00 result: `data/opp-ledger.jsonl`; daily funnel `data/opp-days.jsonl` (DELIVERY SCORECARD in the after-close radar). Design, gate register and pre-registered success test: `docs/opportunity-pipeline-v5.md`.
- **Phase 1 measurement** (owner approved 28 Oct): `shadow-stream.mjs` records every candidate with each soft gate removed, bid/ask, +1/+30 min prices (`data/shadow/DAY.jsonl.gz`); `shadow-outcomes.mjs` adds 1/5/10-session outcomes and writes `data/shadow-report.json` (scoring pre-registered in `shadow-eval.mjs`); early alerts carry a catalyst check (`classifyCatalyst`). Plan and approvals: `docs/phase1-plan-2026-10-28.md`.
- **Watcher guard** (`watcher-guard.mjs`, every 5 min in `bot.yml`): starts the live watcher if GitHub has not by 9:10 New York; alerts WATCHER LATE / WAITING / STOPPED EARLY / DOWN; real starts in `data/watcher-starts.jsonl`.
- **OPPORTUNITY RADAR** (V3.0, owner approved 28 Oct): a research message at 11:15 New York (sent by `ignition-watch.mjs` via `opportunity-radar.mjs midday`) and one after the close (`opportunity-radar.yml`). Panels: A live research leads, B short setups (PAPER), C approved signals (zero allowed), D runners missed. Every A/B line says NOT AN APPROVED BUY; hard blocks (under $1, NOT HALAL, SEC danger, one-day-jump AVOID) are never leads. Rules and the pre-registered scorecard are in `radar-v3-core.mjs`; ledger `data/radar-v3-ledger.jsonl`. It ignores `quiet` / `opportunitiesOnly` / `focus`; `radar off` stops it. Audit: `docs/v3-opportunity-audit-2026-10-28.md`.
- **Owner commands** (plain words work too):
  - **Buys and sells:**
    - `bought SYM PRICE SHARES`
    - `sold SYM PRICE SHARES`
  - **Halal and stops:**
    - `halal SYM yes|no`
    - `stop SYM PRICE`
  - **Plans and boards:**
    - `basket 1000`
    - `review`
    - `review SYM`
    - `paper` (the practice account)
    - `league`
    - `ways`
  - **Any ticker:** `check SYM`

  The full list is the `HELP` constant in `scan.mjs`.

## 4. How every idea is tested (never lower these)

1. **Pre-register.** Write the rule in the file header **before** any result. **Run once**; the first verdict is frozen as `firstRun`. A genuine bug fix goes into `correctedRun`, with a written reason. Never re-run until something passes, and never tune a live rule on its own live results.
2. **Data:** the whole US market over 5 years (Oct 2021 to Oct 2026), **dead stocks included** (delisted = real loss). Look companies up by SEC CIK as of the date, never by today's tickers. No look-ahead: use acceptance and publication times.
3. **Trading assumptions:**
   - entry at the **next open**;
   - costs 0.8% (stress 1.2%), plus 2% slippage each way for small stocks and 3% in extended hours;
   - the +300% cap applies to the rule and the yardstick alike.
4. **Gates, in both halves (before 2024 / from 2024):**
   - profit after costs;
   - beats the average stock on the same days;
   - beats the same stock on its other days;
   - beats SPY per year;
   - still positive without its 2 best trades;
   - block t ≥ 2.5;
   - n ≥ 20 per half, on 10+ days.

   The league luck bar is about **t 4.07** (about 2,130 tries so far).
5. **Tiers:**
   - **PROVEN** = every gate passed. No rule is proven for real money yet.
   - **TRY SMALL bar** (lower): profit after 1.2% cost in both halves, beats the average stock, survives without the 2 best, 20+ trades and 3+ blocks. Block t and same-stock-other-days are not required. The 9 rules that pass it are rated NOT PROVEN.
   - Anything chosen from past results is **forward paper only**. It needs 30+ resolved trades on 10+ days, positive after cost.
6. **Options:** real option prices only; never infer option returns from a stock chart.

## 5. What 744 tested ideas taught (details: `data/strategy-library.json`)

- **Short-term chart setups lose after costs:** 2–10 day trades, RSI, breakouts, pullbacks, SMC, volume profile, YouTube strategies and copied traders.
- **Chasing runners loses:** under-$5 jumps, small-company deals with giants at any entry speed (Squads 24–26), contract news, and giants' new stakes.
- **Supply-chain drift (Squad 28), odd-lot buyback offers (Squad 27) and machine learning also failed.**
- **What survives** (mostly at the TRY SMALL bar, not proven):
  - large-cap momentum held for months;
  - leader dips;
  - cash-rich quality companies;
  - cap-weighted giant baskets;
  - gold as a diversifier.
- **Warnings beat buy signals.** Late-filing and delisting notices predict falls (Squad 29); both are now live SELL reasons.
- **High win rate is not the goal.** Rules that win 90%+ ("hold until even", "average down") hide losses of 80–100%.

## 6. Research machinery

- **Labs and squads:** `squad1`–`squad29`, `anomaly`, `macro`, `value`, `decoded`, `expert`, `angles`, `tipster`, `research`, `comeback` and others.
  - Each has `*-core.mjs` (pure rules, pre-registered header), `*-lab.mjs`, `.github/workflows/*-lab.yml`, and data files: `data/*-lab.json` (frozen verdicts) and `data/*-today.json` (signals in the format `methods[id] = {name, hold, newSignals: [{sym, close, halal}]}`).
  - `scan.mjs` reads the lab list in `trySmallLines` and `tryQualifies`.
- **Agent league** (`league.mjs`; scores champion picks against SPY after 1 and 3 months):
  - Agent A (Timing, Sundays);
  - Agent B (Value, Tuesdays);
  - Agent C (Crowd, Thursdays).

  Their prompts are in the project doc "Stock-2 - Agent prompts (league)".
- **Daily researcher:** a scheduled task Sat–Thu at 11:37 Kuwait. It checks live paper boards and tests one new idea.
- **Comeback board** (`comeback-core.mjs`): rejected rules that start winning on forward paper.
- **Account replay** (`account-replay-*.mjs`): tests a lane as the real account (slots, $1,000, priority).
- **Queue:** Agent C (Thu 29 Oct) is due to test C-INSQ1 (insider cluster + quality), C-GOV1 (government contracts) and **C-CONG1** (Congress members' trades from official House Clerk reports; data route found 27 Oct).

## 7. Repo map

- **The bot and nightly scan:**
  - `scan.mjs`: one big file, owned by the main session (agents don't edit it).
  - Workflows: `main.yml` (nightly scan, 21:30 UTC weekdays) and `bot.yml` (Telegram replies every 30 min).
  - Live watcher: `ignition.yml` starts at 12:45 / 13:45 UTC (GitHub adds 35-45 min; the script waits for 9:25 New York) so the open and the pre-market record are covered.
- **Health:** `health.mjs` defines every data file's expected age.
- **Owner files** (only edit on the owner's instruction):
  - `data/my-positions.json`
  - `data/settings.json`
  - `data/halal.json` (keep the 1-space indent: `JSON.stringify(x, null, 1)`)
- **Ledgers:**
  - `data/tier2-ledger.jsonl` (TRY SMALL)
  - `data/leaderdip-ledger.jsonl`
  - `data/alpaca-paper.json` (the practice account)
- **Tests:** `node --test test/*.test.mjs`. About 1,034 tests, and all must pass before every push.
- **Workflows:** 74 in `.github/workflows/`. Most labs run nightly or on Sundays. A `run-*-now.txt` push trigger starts a one-shot run.

## 8. Secrets: names only, values live ONLY in GitHub → Settings → Secrets

`TG_TOKEN`, `TG_CHAT`, `ALPACA_KEY`, `ALPACA_SECRET`, `SEC_UA`, `FINNHUB_KEY`, `FMP_KEY`, `MASSIVE_KEY`, `TWELVE_KEY`, `ALPHAVANTAGE_KEY`, `TIPRANKS_KEY`, `YT_KEY`, `ZOYA_KEY`, `HALALTERMINAL_KEY`, `HALALSCREENER_KEY`, `OPENFIGI_KEY`, `ETORO_KEY`, `ETORO_USER_KEY`, `PRIVATE_KEY`.

Never print, paste or commit a key.

## 9. Hard rules for any Claude in this repo

- **No orders and no paid data:**
  - never place real orders; Alpaca stays paper;
  - no scraping, no unofficial APIs, and no paid data without the owner's OK (he declined paying until the system pays for itself).
- **Testing rules** (section 4):
  - never lower a gate, cost or yardstick;
  - never re-run a frozen test until it passes;
  - never present NOT PROVEN as proven.
- **What is shown to the owner:**
  - nothing unproven appears as a plain BUY, except the owner's explicit lanes (LEADER DIP; LONGER HOLDS, labelled);
  - say plainly when nothing passed;
  - never promise profit.
- **Halal and options:** halal = ZAD marks only. Options stay separate; long calls only; never sell options.
- **Git:**
  - run `git pull --rebase --autostash` before every push;
  - commit only your own files, by name;
  - commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Messages to the owner:** short, numbers first, plain English, numbered actions.

## 10. Switching to Claude Code (on your computer)

1. **Install Claude Code** (it needs a paid Claude plan) and **Git**. Then run:
   `git clone https://github.com/drrazaq/Stock-2.git` and `cd Stock-2`, then `claude`.
   Claude Code reads this file automatically.
2. **Nothing moves.**
   - The bot, the nightly scan and all labs run on **GitHub Actions**, not in a chat, so they keep working.
   - Keys stay in GitHub secrets. You don't need them on your computer, except to run a lab locally (optional).
3. **Scheduled research** (Agents A/B/C and the daily researcher) is set up as claude.ai scheduled tasks on your account. They keep running. To run one by hand in Claude Code, say for example: *"Run Agent C (Crowd) using the league prompts"*. The agent prompts are already in the repo: `docs/agent-prompts-league.md` and `docs/agent-prompts-update-22oct.md`.
4. **First message to Claude Code:** *"Read CLAUDE.md, run the tests, and tell me the system health."* Then forward any bot message, such as SYSTEM HEALTH or a question, just like here.

## 11. Open items

- **TRY SMALL replay findings**, to settle before any return to real money:
  - the live 15%/35% stops were never in the tests;
  - B-FCF1 takes both slots;
  - the time exit is 1 session later than tested;
  - the switch-off counts picks shown, not picks bought.
- **LEADER DIP:** the owner should pre-mark halal for the big companies, so picks become BUYs instead of MARK HALAL.
- **Earnings timing:** reports with no time in the Nasdaq calendar can be read one day late (found by Squad 28). Check ANOM-SUE before un-pausing SUESURGE.
- **Agent C results:** Thursday 29 Oct.
