# Ranking experiment, D model, universe audit and the seven questions (28 Oct 2026)

**Owner approvals (28 Oct):**

- A/B/C shadow ranking;
- a D model (fresh company information before the move), defined and frozen before evaluation;
- the historical minute-replay feasibility check;
- a privacy remediation plan.

**Not approved:** any change to live ranking. Live alerts stay first come until the owner approves a model after a separate confirmation period.

**Written:** 04:30 New York, 28 Oct, before today's session. Today is the first live day of all of this, so **no live outcome numbers exist yet.** Every "result" below is either history from 14–27 Oct or says it is pending.

---

## 1. What was built today (shadow only; nothing changes which alert is sent)

| Item | Where |
|---|---|
| Frozen models A, B, C (as approved), D (new), R and R0 (no-skill controls), selection rules, the verdict rule | `rank-models.mjs` (frozen 28 Oct; counting starts 29 Oct) |
| SEC live filing feed (official EDGAR latest-filings feed, free) for D | `edgar-feed.mjs` + `ignition-watch.mjs` `pollEdgar` / `decideFilings` |
| R0 control at 9:45 (10 liquid stocks that have not moved) | `ignition-watch.mjs` `controlSample` |
| Catalyst classes: SOURCE (SEC / issuer wire / aggregator / none / unavailable), DIRECTION (dilution / negative / positive-by-wording / ambiguous / unknown), FRESHNESS (fresh / recycled) | `early-alerts.mjs` `classifyCatalyst` |
| Spread counted once + stress + one-minute delay | `shadow-eval.mjs`. Fixed a double count in `shadow-outcomes.mjs` |
| Streams, models, cap cost, verdicts, D feed reasons | `shadow-outcomes.mjs` -> `data/shadow-report.json`; one line in the after-close radar |
| Tests | `test/rank-models.test.mjs` (5) + catalyst / spread tests. **1,078 pass** |
| Mock session | A full fake day through the real watcher, outcomes job and close radar. D decided a 7:02 pre-market 8-K at the first market minute, excluded a 3.02 financing 8-K, ignored a 2020 filing, and produced A/B/C/D/R/R0 rows and the report |

### The frozen models

| Model | Stream | Picks (max 5 a day, decided at the candidate's own minute) |
|---|---|---|
| A, existing | E: EW-ALERT-1 leads that passed every hard rule | First come (today's live behaviour) |
| B, opportunity-first | E | Catalyst VERIFIED or UNCONFIRMED, spread 1% or less, move +6% or less, 2M USD+ traded |
| C, simple baseline | E | Time-of-day volume pace 3x+, spread 1% or less |
| R, random control | E | Fixed hash (not executable live; the no-skill yardstick) |
| **D, fresh filing before the move** | F: every 8-K / 6-K accepted 4:00–11:00 | No negative item (1.02 1.03 2.04 2.05 2.06 3.01 4.01 4.02); no financing item (2.03 3.02 3.03); not an amendment; −3% to +3% at the first live minute after acceptance (9:30 at the earliest); 1 USD+; 1M USD+ traded the day before; spread 2% or less when a fresh quote exists; NOT HALAL / AVOID / live SEC danger check as for alerts |
| R0, no-information control | N: 10 random liquid 1 USD+ stocks, −3% to +3% at 9:45 | All 10 |

- **Same exits for all:** entry at the ask (or an assumed spread, flagged); exit half a spread under; 0.6% fees. Horizons: 30 min, same day, 1 and 5 sessions. Plus stress-slippage and one-minute-delay versions.
- **Verdict (frozen):** after 20 counted sessions and 50+ picks, a model is PROMISING only if, at the same-day AND 5-session horizons:
  - its average, median and without-2-best are all above A's and R's (for D: above R0's);
  - its average is above zero.

  PROMISING leads only to a **separate 20-session confirmation period**. Today (28 Oct) is shown as a PILOT and never counted.
- **D does not read filings' text.** It knows only the form, the item numbers and the SEC acceptance time. "Fresh company-specific information" here means "the company told the SEC something today that is not one of the known bad or financing items". It does not mean good news.

## 2. Candidate universe audit (item 3)

| Lane | What it can see | Before the move? |
|---|---|---|
| Early-wave (EW-ALERT-1, shadow stream) | +2% to +15% with a volume pace | No: by construction it starts after a move began |
| IG rule triggers | +10% crossings, ORB, pullbacks | No |
| Movers ledger | 15%+ movers | No (and selected on winners) |
| **D (new): SEC live feed** | Every 8-K / 6-K at acceptance, joined to the stock's move at that minute | **Yes**: the first lane that sees company information before price, for the whole market |
| R0 (new) | Random quiet liquid stocks | Control |
| Headlines (Finnhub) | Per stock, only for names already found (60 calls a minute: cannot scan the market) | Explains, does not discover |

**What the existing feeds cannot do:**

- Market-wide headlines in real time: the free Finnhub key is per symbol.
- Bid/ask history: only quotes recorded live from today.
- Pre-market discovery: the watcher can be running from 8:45 at the earliest (a GitHub limit). The D feed pages back to 4:00, but entries are decided at 9:30, because pre-market trading costs about 3% (handbook).

**Matched non-winners:** every stream keeps every candidate, losers included.

- **D:** all decided filings are kept, eligible or not. "Already moved" filers are their own comparison group.
- **E:** R draws randomly from the same eligible set.
- **D vs R0:** a filing against no filing, both "not yet moved" and liquid.

## 3. Alert-cap opportunity cost (item 4)

- **Live today:** the first 5 eligible leads are sent; the rest are logged LIMIT, with catalyst, quote and outcome.
- **`capCost` in the report:** first five vs after-cap vs a hindsight best-five. The hindsight figure is an upper bound nobody could pick live; it only sizes what first-come gives up.
- **History:** on 26–27 Oct about 80 stocks a day met the trigger. With 5 sent, about 94% of eligible leads go unsent, so the cap decides most of the outcome. The data to judge it starts today.

## 4. Spread and cost model check (item 6)

- **Definition:** relative spread s = (ask − bid) / mid. Buying at the ask pays s/2 over mid; selling at the bid pays s/2. A round trip pays s once, plus 0.6% fees.
- **Found and fixed:** the 5-session alert score entered at the ask and still subtracted the full assumed spread, so half the spread was counted twice.
- **The other scorers are consistent:**
  - the radar and the 15:00 ledger use a last-trade entry plus the full assumed spread, once;
  - the shadow scoring uses an ask entry plus the exit half.
- **Not proof of a fill:**
  - quotes are snapshot quotes, with their age recorded; IEX quotes come from one exchange;
  - the close is used as an approximate mid.
- **Reported next to every base figure:** a stress figure (+0.5% slippage each way under $5, +0.1% above) and a one-minute-delay figure.

## 5. Historical minute replay: feasibility (approved check)

- **Data:**
  - the paid Massive plan already serves ~2 years of minute bars (`fastmover-lab.mjs`);
  - about 12,000 calls a Saturday;
  - 23,913 of 73,864 "+10% stock-days" already tested for the IG rules. Only each day's results are kept, not the bars.
- **D replay:**
  - EDGAR quarterly indexes list every 8-K by date;
  - acceptance times need one free SEC request per filing (~10 per second);
  - roughly 300–400 8-Ks a day × 120 sessions ≈ 40,000 filings, about 1.5 hours of SEC calls;
  - with the cheap D checks applied first, the 1 USD+ / liquid / not-moved filters leave perhaps 15–25k stock-days of minute bars: **about 2 Saturdays of the existing budget.** No new spend.
- **E / A-B-C replay:**
  - needs every stock's minute path to know when it met EW-ALERT-1, about 6,000 stocks × 120 days;
  - **not feasible** inside the budget;
  - forward collection is the only honest route.
- **Missing data for any replay:** historical bid/ask (assumed spreads only); historical headlines with reliable times.
- **Proposal (needs approval):** a Saturday D-replay job with D's frozen rules, run once. Its result is reported as a history check, separate from the forward verdict.

## 6. The seven questions, answered with what exists today

1. **Are we discovering earlier?**
   - Not shown yet.
   - Before: the watcher's first minute was 9:38–9:49 (11:10 on 26 Oct), and 0 pre-market days were saved.
   - Today is the first day with the 8:45 schedule, the guard and the SEC feed; the 11:40 and 17:20 New York check-ins will report the real start, pre-market rows and feed readiness.
   - D is the first lane that can see company information before price, but only in shadow.
2. **Ranking intelligently or forwarding the first ones?** Forwarding the first ones. Live alerts are first come, by design until a model earns a change. B, C and D are now measured against A and R on the same candidates, from 29 Oct.
3. **Which filters protect us from losses?**
   - With evidence before today:
     - **chasing extended stocks:** 469 cases already up 20%+ when first seen, median −19% to the close; supports the +8% extension gate;
     - **the one-day-jump AVOID list:** lagged about 3% a month, t −5;
     - **SEC danger filings:** the late-filing and delisting results from Squad 29.
   - Under 1 USD and stale prices are instrument and data rules, not tested for returns.
   - The soft gates of the lead trigger get their first verdict after 10 sessions.
4. **Which soft filters needlessly suppress candidates?**
   - Unknown yet.
   - Suspects being measured: the 11:30 / 11:00 windows (230 of 1,711 movers came after 11:00), and the score and dollar-volume floors.
   - The volume floor that stopped OWLS was real (0.6× normal pace even after a time-of-day correction).
5. **Could the best-ranked candidates be traded after the alert?**
   - In the mock: detection to delivery 1 minute.
   - Live spreads and the one-minute-delay results start today.
   - Under 5 USD, the +2% net hurdle is +3.6% gross with an assumed 1% spread; real spreads may be wider.
6. **Is any ranking model favourable after costs?**
   - No evidence yet; nothing may be claimed.
   - The only live paper record with a positive average, IG1, fails without its 2 best trades.
7. **What still prevents the mission?**
   - (a) No model has evidence of a positive net edge.
   - (b) Live ranking is first come.
   - (c) Discovery of company information before price exists only in shadow (D).
   - (d) Catalysts are classified by item number and headline wording, not meaning.
   - (e) Watcher start reliability is unproven until today's check.
   - (f) Fills are estimated from snapshot quotes.
   - (g) The long record (744 ideas) says short-term edges after costs are rare. The pass marks are set so that "no edge" can be the answer.

## 7. Smallest evidence-backed change proposed now (needs approval)

**Show the real spread and the real +2%-net hurdle in each research lead and paper setup.**

- Since today the watcher records each candidate's bid/ask.
- Today the message shows a hurdle based on an assumed spread (2.9% or 3.6%).
- With the recorded spread, a 2% spread stock would show "needs +4.6% gross"; a 0.1% spread stock, "+2.7%".
- That tells the owner, at the moment of the alert, whether +2% net is even realistic.

It changes no ranking, gate or rule. Every other change waits for the frozen verdicts.

## 8. WHAT COULD WE BE WRONG ABOUT? (independent critique)

**Data**

- The SEC feed's paging (`start=`) and its 100-entry pages are assumed from the feed's documented behaviour, not yet seen live. A busy morning could exceed the backfill (8 pages of 100), so the first morning's D stream may be incomplete. The feed counts are logged daily (`edgar` in `data/ignition-days.jsonl`).
- CIK-to-ticker mapping uses today's SEC ticker file, so share classes and recent ticker changes can mis-map.
- 43% of symbols have a fresh price each minute. D waits for a fresh price, which biases it toward liquid names. That is acceptable, but not "the whole market".

**Timing**

- The watcher may still start late. D entries for pre-market filings are decided at the first live minute, which is late if the watcher is late; `decM` records it.
- Up to 15 SEC checks a minute: on a heavy morning some D decisions slip by minutes, which makes D look worse than it would be live.

**Execution**

- Snapshot quotes are not fills.
- Exits use the close as a mid.
- Under 5 USD real costs can be far worse than assumed; the stress figure only partly covers this.

**Selection bias**

- B and C only see candidates that already met EW-ALERT-1 (+3% to +8%), so they cannot find what that trigger misses.
- D's "−3% to +3%" excludes filers that moved pre-market, so D measures only slow reactions to news.
- R is drawn from the same pool, so a common bias in the pool is invisible to the A/B/C comparison. R0 and D partly check this.

**Conclusions**

- 20 sessions is little. One strong day can carry a model, which is why median and without-2-best must agree.
- Models were frozen by judgment, not fitted. That is good for honesty, but means none may be good.
- Testing six things at once raises the chance one looks good by luck. The confirmation period exists for that.
- "No model beats first-come" is a real possible outcome. If it happens, the honest product is a research radar plus the LEADER DIP lane, not short-term trade calls.
