# HISTORY-03 Batch 4: trading-decision replies (scan.mjs)

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. Same method, fields and defect types as batch 2 (`BATCH2-FINDINGS.md`). Nothing was sent and no provider was called; raw renders stay local.

## D01: holdings review (ACTIONS CURRENT HOLDINGS, review), when-to-sell, sell check: TAKE PROFIT OPTION | GATE_OR_DECISION | **CONFLICTING DECISION GUIDANCE (owner policy P3)**

> <SYM>: TAKE PROFIT OPTION (tested on 5 years of history, not yet confirmed live: your choice, not an order). ...  \|  ... : selling and buying back 10% lower beat holding on 5 years of history (not yet confirmed live)  \|  Tested on 5 years of the whole market: selling here and buying back 10% lower beat holding (...)  \|  [ideas list] Sell a stretched stock, buy back 10% lower: passed on 5 years of history; LIVE PAPER CHECK running ...

| Field | Value |
|---|---|
| Rendered | source read (fires only for a stretched or spiking holding); rebuy reply rendered on committed data |
| Source | scan.mjs:2234 (verdict set when stretch \|\| spike, regardless of the study verdict), :2325, :185, :2235, :223 (hard-coded) |
| Evidence artifact | data/rebuy.json (2022-01-06 to 2026-07-22, 6 versions, tCrit 2.64): STRETCH/LOWER10 and SPIKE/LOWER10 = BELOW THE LEAGUE BAR (+1.9% / +1.8% vs holding); the rebuy reply on the same data ends "DECISION: no switch beat holding. Do not sell to buy back lower"; library A-SWR1 "Switch vs doing nothing: tested: not proven" |
| Population | whole market, stretched (30%+ above 50-day) or spiking (25%+ in 10 sessions) stocks |
| Selection period | 2022-01-06 to 2026-07-22 (4.5 years, not 5) |
| Rule version | STRETCH/LOWER10, SPIKE/LOWER10 |
| Costs | 0.4% per side |
| Holding basis | sell, buy back 10% lower or after 60 sessions |
| Coverage | whole market |

**What the recorded evidence supports:** Both versions beat holding on average in the recorded test, and the option is labelled "not yet confirmed live: your choice, not an order".

**Unsupported wording or missing provenance:** The sell option is raised for every stretched or spiking holding without checking the study verdict, and it says "passed / tested on 5 years" while the same study is BELOW THE LEAGUE BAR (NOT PROVEN) and its own reply tells the owner not to do it. The owner gets opposite guidance from two replies on the same data. Since 27 Oct, below-bar (TRY SMALL tier) buy rules are paper only; whether a below-bar result may still drive sell suggestions on real holdings is not written down.

**Proposed wording:** <SYM>: stretched 30%+ above its 50-day average. A sell-and-buy-back-lower idea exists but is NOT PROVEN (+1.9% vs holding in 2022-2026, below the luck bar). Your stop and exit rules apply.

**Who / what:** Owner answers P3; Codex then aligns the holdings review with the study verdict and wording. Not edited here.

**Owner policy question:** P3

## D02: check SYM (six angles: RESEARCH line) | WORDING_ONLY | **UNSUPPORTED (hard-coded "proven" list)**

> - RESEARCH: buy rules proven live: none yet; proven: stops, trim, switch, avoid rules

| Field | Value |
|---|---|
| Rendered | COMMITTED (check NVDA) |
| Source | scan.mjs:2206 (fallback string) |
| Evidence artifact | data/strategy-library.json: X1 35% disaster stop, X2 no stop for strong stocks, X3 trim over 15%, X5 3-month hold = "tested: in use" (not PROVEN); A-SWR1 switch = "tested: not proven"; M15 lottery AVOID = FAILED DISCOVERY (discovery-stage lag only); rebuy = BELOW THE LEAGUE BAR |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** "buy rules proven live: none yet" is true.

**Unsupported wording or missing provenance:** None of stops, trim, switch or avoid rules is PROVEN in the library; the switch is explicitly not proven.

**Proposed wording:** - RESEARCH: no buy rule is proven. Stops, trim and the AVOID list are risk rules in use (not proven); the switch is NOT PROVEN.

**Who / what:** Codex wording.

## D03: ACTIONS > EARNINGS DRIFT lane BUY card (owner's labelled choice) | WORDING_ONLY | **UNSUPPORTED ("passed its own 5-year test")**

> EARNINGS DRIFT \| horizon: the tested hold \| YOUR CHOICE (21 Oct): passed its own 5-year test; live paper still building: NOT PROVEN live \| permitted today: yes \| 1,000 USD each / Why: ... Shape: about 1 win in 3, winners much bigger than losers (+1.8% a trade over 176 past beats).

| Field | Value |
|---|---|
| Rendered | source read (fires only when an earnings-drift candidate exists; the no-buy line was rendered in ACTIONS) |
| Source | scan.mjs:2596-2600 |
| Evidence artifact | data/earnings-study.json frozen first run 2026-10-23: NOT PROVEN (older half: could be luck t -0.45 vs bar 3.95, not better than the average stock or the S&P 500, loses without its 2 best and at 1.2% cost); the Sunday message says "Earnings drift is NOT offered as a buy". "+1.8% a trade over 176 past beats": no artifact referenced: MISSING |
| Population | earnings beats 10%+ with a strong reaction day |
| Selection period | 2021-10-12 to 2026-10-19 |
| Rule version | earnings-study rule (fixed) |
| Costs | 0.8% / 1.2% |
| Holding basis | close under 20-day average or 40 sessions |
| Coverage | 1,247 stocks with earnings history |

**What the recorded evidence supports:** The lane is the owner's labelled choice (allowed as an action) and the card says "NOT PROVEN live".

**Unsupported wording or missing provenance:** "passed its own 5-year test" is contradicted by the frozen study (NOT PROVEN; fails the older half). The +1.8% / 176 figure has no recorded source.

**Proposed wording:** EARNINGS DRIFT | YOUR LABELLED CHOICE (21 Oct), NOT PROVEN: its 5-year test failed the older half (frozen 23 Oct). ...

**Who / what:** Codex wording (keep the owner lane; correct the evidence words).

## D04: plan cards for earnings / event drift ("expect" line fallback) | WORDING_ONLY | **UNSUPPORTED (fallback text)**

> ... whole-market fair test passed

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:1364, :1369 |
| Evidence artifact | printed when the card has no per-case stats (t.n = 0); earnings-study verdict is NOT PROVEN; no event kind passed (events reply) |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** -

**Unsupported wording or missing provenance:** The fallback asserts a pass that the studies do not record.

**Proposed wording:** no past-case record on file (study verdict: <verdict>)

**Who / what:** Codex wording.

## D05: LEADERS trend-trade card | WORDING_ONLY | **MISLEADING (extends A02)**

> passed the whole-market fair test; live record still building

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:1357 |
| Evidence artifact | data/leaders-study.json: verdict NOT PROVEN (chosen 126-2, PF 1.11 < 1.2); liveVerdict PROVISIONALLY PROMISING (newer half only) |
| Population | whole market |
| Selection period | 2021-10-12 to 2026-10-19 |
| Rule version | leaders 126-3 |
| Costs | 0.8% |
| Holding basis | 126 sessions |
| Coverage | 4,277 stocks |

**What the recorded evidence supports:** -

**Unsupported wording or missing provenance:** "PROVISIONALLY PROMISING" (newer half only) is turned into "passed the whole-market fair test" on a buy card.

**Proposed wording:** NEWER-HALF PASS only on the whole-market fair test (NOT PROVEN); live record still building

**Who / what:** Codex wording.

## D06: ACTIONS buy section: tier-2 CHAIN, DISCOVERED, FOLLOWING, CATALYST RUN-UP and AUTO-DISCOVERED lines | GATE_OR_DECISION | **LATENT GATE vs WRITTEN POLICY (owner policy P4)**

> - BUY <SYM> at the open on <day>, up to <px> ... STOP 15% under your buy (safety stop; the test held without one)  \|  AUTO-DISCOVERED \| rules the system invented, PROVEN ON LIVE PAPER  \|  TRADABLE SMALL is ON: rules that passed their own test (t 2.5+, both halves, higher cost) are shown in their own section

| Field | Value |
|---|---|
| Rendered | source read (none fires on committed data: no tier-2 chain / discovered / follow / catalyst buy today) |
| Source | scan.mjs:2595-2605 (pb for CATALYST RUN-UP, CHAIN, DISCOVERED), :2603 (FOLLOWING), :2629 (AUTO-DISCOVERED), :328 (TIER2_ON defaults to on when settings.tier2 is unset), :2550 (pb pushes BUY lines into S.buys, filtered only by the halal mark) |
| Evidence artifact | CLAUDE.md section 9: "nothing unproven appears as a plain BUY, except the owner's explicit lanes (LEADER DIP; LONGER HOLDS, labelled)"; 27 Oct owner decision moved TRY SMALL (settings.trySmallReal) to paper but no equivalent switch was set for these tier-2 lanes; settings.tier2 is unset (= on) |
| Population | tier-2 (TRADABLE SMALL) and live-paper rules |
| Selection period | - |
| Rule version | tier-2 lanes |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** Each line is labelled tier 2 / below the proof bar.

**Unsupported wording or missing provenance:** If any of these rules fires, ACTIONS prints a plain "- BUY" in the buy section while the rule is NOT PROVEN, and focus mode does not pause them. This conflicts with the written policy unless the owner treats these as his lanes.

**Proposed wording:** (policy first) If not owner lanes: show them as PAPER lines like TRY SMALL. If owner lanes: name them in the policy and label each line YOUR LANE (NOT PROVEN).

**Who / what:** Owner answers P4; Codex aligns. Not edited here.

**Owner policy question:** P4

## D07: plan-card block and check/buy replies: tip-source FADE | PROVENANCE_ONLY | **INCONSISTENT EVIDENCE LABELS**

> NO BUY (paper only): tipped by Reddit crowd, a source whose tips lag (FADE)  \|  ..., a source whose tips lagged the average stock (tested: FADE); avoid for 20 sessions after the tip  \|  [sources reply] Reddit crowd: 92 tips, ... Record: INSUFFICIENT EVIDENCE (under 10 tips or under a month)

| Field | Value |
|---|---|
| Rendered | COMMITTED (when to buy TSM, check NVDA, sources) |
| Source | scan.mjs:1299-1305 (block), :1899 (sources label) |
| Evidence artifact | data/tip-score.json fade list (C-FADE1: t <= -2 on 10+ tips over 5+ days; 19 Oct: Reddit crowd 30 tips on 5 days, edge -3.6%, t -9.2); library C-FADE1 status "AVOID list ... not yet wired into ACTIONS" (stale: it is wired) |
| Population | logged tips |
| Selection period | from 6 Oct 2026 |
| Rule version | C-FADE1 |
| Costs | 0.8% |
| Holding basis | 5 sessions |
| Coverage | tips the bot logged |

**What the recorded evidence supports:** The FADE block follows its pre-registered rule and is conservative (it only removes buys).

**Unsupported wording or missing provenance:** The same source is called a proven laggard (FADE) in one reply and INSUFFICIENT EVIDENCE in another; the library entry still says the block is not wired.

**Proposed wording:** tipped by Reddit crowd: FADE rule (30 tips over 5 days lagged the average stock; short record)

**Who / what:** Codex wording; library status update by its owner.

## D08: check / buy / plan / ADD / BUY NOW / menu wording (per-stock past-trade check called "proven" or "tested") | WORDING_ONLY | **MISLEADING (vocabulary; see EVIDENCE-VOCABULARY.md)**

> "It passed its tests." \| "BUY: a tested setup is open" \| "BUY: a tested rule confirmed an entry" \| "HOLD and ADD 1,000 USD (a winner with a new PROVEN signal ...)" \| "BUY NOW: a proven setup is inside its buy range" \| "fully proven" \| "proven with a safety margin" \| "SELL (TESTED EXIT)" \| "tier2 off = proven-only"

| Field | Value |
|---|---|
| Rendered | COMMITTED (check NVDA) and source read |
| Source | scan.mjs:1906-1909, 1825, 2329, 4161, 1506-1507, 1566-1633, 2179-2181, 1102, 3363 |
| Evidence artifact | okEv per-stock check (scan.mjs:1283); focus mode gates the engine candidates (BUY / ADD / BUY NOW appear only with focus off or a live-proven kind) |
| Population | per stock |
| Selection period | the stock's own history |
| Rule version | okEv |
| Costs | 0.8%-equivalent |
| Holding basis | per rule |
| Coverage | nightly scan |

**What the recorded evidence supports:** Gating is consistent (focus respected).

**Unsupported wording or missing provenance:** The words claim validation the per-stock check does not provide.

**Proposed wording:** Use PAST-TRADE CHECK / BACK-TESTED (<result>) / PAPER RECORD per EVIDENCE-VOCABULARY.md.

**Who / what:** Codex wording.

## D09: lottery AVOID block and the "lottery" explainer (resolves B14 provenance) | NONE | **SUPPORTED_QUALIFIED (discovery-stage evidence only)**

> AVOID: lottery-like (a <x>% one-day jump in the last month); tested 19 Oct: such stocks lagged the average stock by about 3% over the next month (t -5)  \|  Stocks that jumped 15%+ in one day lagged the average stock by 3.2% over the next month: 3,054 cases, 5 years, dead s[tocks included]

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:1297-1298, :3394, :2562 |
| Evidence artifact | data/autolab.json tried["lotHi/h20"] = library M15: discovery stage n 3,054 on 168 days, edge -3.23%, t -5.06; status FAILED DISCOVERY as a buy (validation and vault not run) |
| Population | whole market |
| Selection period | autolab discovery window |
| Rule version | M15 |
| Costs | autolab costs |
| Holding basis | 20 sessions |
| Coverage | whole market incl. dead stocks |

**What the recorded evidence supports:** The numbers match the recorded discovery result; the block is conservative.

**Unsupported wording or missing provenance:** Only the discovery stage exists; "tested" without that qualifier overstates it (minor).

**Proposed wording:** AVOID: lottery-like (a 15%+ one-day jump this month; such stocks lagged the average stock by about 3% a month in one discovery test)

**Who / what:** Codex wording (optional).

## D10: SELL reasons: late-filing (NT 10-K/10-Q) and delisting-notice (8-K 3.01) danger filings | NONE | **SUPPORTED**

> late-filing notice (<form>, <date>): such stocks lagged the average stock by about 12-16% over the next 60 sessions in 5 years of tests (SEC: <url>)  \|  delisting / listing-standard notice (8-K 3.01, <date>): such stocks lagged the average stock heavily in 5 years of tests

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:37-38 |
| Evidence artifact | data/squad29-lab.json firstRun: SQ29-F4-LATEFILE SELL-WARNING (60 sessions: excess -12.5% older n 332 block t -5.8; -16.3% newer n 363 block t -6.2); SQ29-F6-DELISTNOTICE SELL-WARNING (20 sessions: about -33% / -41%) |
| Population | whole market |
| Selection period | 2021-10-12 to 2026-10-26 |
| Rule version | SQ29-F4 / SQ29-F6 (pre-registered) |
| Costs | - |
| Holding basis | 20 / 60 sessions |
| Coverage | EDGAR filings |

**What the recorded evidence supports:** Numbers, period and direction match the frozen SELL-WARNING verdicts; both halves pass the pre-registered bar.

**Unsupported wording or missing provenance:** -

## D11: event-filing SELL warning | NONE | **SUPPORTED_QUALIFIED (conditional)**

> . Tested: after such filings stocks fell <x> on average over 20 sessions (<n> cases)

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:43-49 |
| Evidence artifact | fires only for event kinds the events study records as warnings; the current events study shows "none proven" (no warning kind), so it does not fire today |
| Population | - |
| Selection period | - |
| Rule version | events-study warnings |
| Costs | - |
| Holding basis | 20 sessions |
| Coverage | - |

**What the recorded evidence supports:** Conditional on a recorded warning.

**Unsupported wording or missing provenance:** -

## D12: own-pick stop note (and B13 context) | WORDING_ONLY | **MISLEADING (period)**

> the tested 35% disaster stop for your own picks (stop study, 18 Oct): tighter stops cost money on 5 years of buys

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:1063 |
| Evidence artifact | data/stops.json (committed): recommended ANY = PCT35, STRONG = NONE; 2022-04-19 to 2026-07-22 (4.3 years). (Batch 2's B13 quote came from the synthetic render; production recommends the 35% stop.) |
| Population | any liquid stock |
| Selection period | 4.3 years |
| Rule version | stop study |
| Costs | per stops.mjs |
| Holding basis | 60 sessions |
| Coverage | whole market |

**What the recorded evidence supports:** The 35% choice matches the committed study.

**Unsupported wording or missing provenance:** "5 years" (4.3); "tested" for a risk-preference choice (see B13).

**Proposed wording:** the stop-study choice for your own picks (35% under the buy; 2022-2026)

**Who / what:** Codex wording.

## D13: second opinion ("should I buy after a jump") | PROVENANCE_ONLY | **EVIDENCE NOT RECORDED (static number)**

> ... in 5 sessions: buying after a big jump tested badly (typically -4.9% three days later, 719 cases).

| Field | Value |
|---|---|
| Rendered | source read |
| Source | scan.mjs:2816 |
| Evidence artifact | hard-coded; no artifact referenced: MISSING |
| Population | MISSING |
| Selection period | MISSING |
| Rule version | - |
| Costs | MISSING |
| Holding basis | 3 days |
| Coverage | MISSING |

**What the recorded evidence supports:** Direction is consistent with the rejected chase rules (day trades reply).

**Unsupported wording or missing provenance:** The figure has no stored source.

**Proposed wording:** cite the study or drop the figure

**Who / what:** Codex.

## D14: bought confirmation: FOR / AGAINST notes | WORDING_ONLY | **MISLEADING (tiny sample as an argument)**

> - FOR: Your own picks so far: <n> sold, average <x>%.

| Field | Value |
|---|---|
| Rendered | COMMITTED (bought ZZZQ) |
| Source | scan.mjs (addReply / bought confirmation) |
| Evidence artifact | owner's reported sales (3) |
| Population | 3 trades |
| Selection period | all |
| Rule version | - |
| Costs | modelled |
| Holding basis | actual |
| Coverage | reported trades |

**What the recorded evidence supports:** The number is the owner's record.

**Unsupported wording or missing provenance:** A handful of trades (<n> = 3 in the render) shown as an argument FOR a buy without "too few to judge".

**Proposed wording:** - Your own picks so far: 3 sold (too few to judge).

**Who / what:** Codex wording.

## D15: evidence update to B01 / B02 / C01 (early paper alerts) | GATE_OR_DECISION | **REFINES B01; B02/C01 ARE LATENT UNDER DEFAULT SETTINGS**

> (no new wording)

| Field | Value |
|---|---|
| Rendered | source read |
| Source | opp-mode.mjs:3-4 (sendAlert), ignition-watch.mjs:166-168 |
| Evidence artifact | sendAlert({early}) returns false while opportunitiesOnly is on (default unless settings.opportunitiesOnly === false): early paper alerts are recorded but NOT sent; alerts++ runs before that check |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** Under the committed settings the early paper alert body (with BUY / STOP / EXIT) is not sent.

**Unsupported wording or missing provenance:** The radar still counts these unsent paper alerts as "tested alerts sent today" and "Approved" (B01 remains active). B02 / C01 become live if opportunitiesOnly is turned off.

**Proposed wording:** (B01 correction applies)

**Who / what:** Codex (B01).

**Owner policy question:** P1

## D20: acceptable decision replies (read and rendered) | NONE | **SUPPORTED_QUALIFIED**

> refLine / sellReply exits and time exits; "none on purpose: the target study found no fixed price that beat the tested exit"; LONGER HOLDS evidence line (both halves, including the older-half underperformance); TRY SMALL paper wording; penny / sector / source replies ("No tested rule supports a trade"); check business and fair-value information; LEADER DIP bought confirmation ("No stop by design (tested without one)"); stop and sale confirmations; danger-filing reasons (D10)

| Field | Value |
|---|---|
| Rendered | COMMITTED and source read |
| Source | scan.mjs (sellReply, refLine, buySyms, pennyReply, opinionReply, checkOne, tgCommands) |
| Evidence artifact | A-TGT1 targets study (rejected); V15 evidence in quality data; agent-a-tgt-lab (no stop) |
| Population | - |
| Selection period | - |
| Rule version | - |
| Costs | - |
| Holding basis | - |
| Coverage | - |

**What the recorded evidence supports:** Wording matches the recorded results or carries its limits.

**Unsupported wording or missing provenance:** -

## New owner policy questions (not decided here)

- **P3:** May a below-the-luck-bar (NOT PROVEN, tier-2 level) result still produce sell suggestions on real holdings (TAKE PROFIT OPTION: sell, buy back 10% lower), given that TRY SMALL buys were moved to paper on 27 Oct? Where: scan.mjs holdings review (D01). Not decided here; the two current replies give opposite guidance.
- **P4:** Are the tier-2 CHAIN, DISCOVERED, FOLLOWING and CATALYST RUN-UP lanes and the AUTO-DISCOVERED live-paper rules owner lanes that may print a plain BUY (settings.tier2 is unset, so they are on), or should they be paper like TRY SMALL? Where: scan.mjs ACTIONS buy section (D06). Not decided here; CLAUDE.md section 9 names only LEADER DIP and LONGER HOLDS.
