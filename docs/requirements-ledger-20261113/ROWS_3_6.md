# Requirements-to-evidence ledger: rows 3–6 (Claude draft for ALWAYS_ON_CAPABILITY_PLAN.md)

Pins: production main `24f215d9` (Stage 1 release 7db2c83b deployed; Stage 2 NOT deployed, STOPPED 13 Nov).
Columns per row: source/caller + pin | reviewed | default | deployed | authentic operational witness | missing connection | next completion evidence.
"Witness" means a real production run/delivery observed, not a replay, test or synthetic run.

## Row 3: Historical/research path (setup -> causal controls -> forward)

| Item | Source/caller + pin | Reviewed | Default | Deployed | Authentic witness | Missing connection | Next completion evidence |
|---|---|---|---|---|---|---|---|
| 3a Frozen-gate methodology (CLAUDE.md §4: both halves, same-day/same-stock/SPY controls, block t≥2.5, n≥20, costs 0.8/1.2%, slippage) | `*-core.mjs` pre-registered headers + `*-lab.mjs`, `data/*-lab.json` firstRun | yes (repeatedly, HISTORY-03) | n/a | labs run on schedules | frozen `firstRun` verdicts exist per lab | whole-share/no-fill/capital-use realism is in `account-replay-core.mjs` only for replayed lanes, not every lab | each candidate rule that is promoted must carry an account replay (slots, $1,000, whole shares, priority) before any lane change |
| 3b Leader dip PB12 (MID horizon) | `scan.mjs:2509` LDIP_* constants, `ldipLines` 2549, `ldipCloseFlags` 2580; SQ11-PB12 | yes (F1) | ON (owner REAL lane) | yes | nightly ACTIONS delivered 13 Nov (run 43348890678, owner-confirmed); lane emitted its 12 Nov-close signal | F1: tested base 126-session hold +14.3%/+16.6% per trade vs +20% target exit +9.6%/+8.5% (adopt=false). Live exit = target+time; evidence favours fixed hold. Owner decision open | owner decision on F1; then the exit change and a replay of the chosen exit |
| 3c LONGER HOLDS V15 (LONG horizon, labelled) | `scan.mjs:2695–2707` | yes (F7) | ON, labelled NOT PROVEN | yes | appears in ACTIONS lane lines | F7: live 25% stop was never in the test | owner decision on F7 (keep the stop as an untested safeguard vs the tested no-stop) |
| 3d TRY SMALL (9 rules) | `trySmallLines`/`tryQualifies`, `data/tier2-ledger.jsonl` | yes | PAPER (`settings.trySmallReal` false) | yes, paper | paper ledger rows | §11 replay findings (stops untested, B-FCF1 slot capture, time exit +1, switch-off counts shown not bought) | 30+ resolved forward paper trades on 10+ days, positive after cost, before any real-money return |
| 3e E1 earnings drift | `scan.mjs:1385` `peadLive` gate on `earnings-study.json` verdict | yes | OFF (verdict not PROMISING) | gate deployed | gate keeps it off | none; correctly off | none until a new frozen study passes; do not revive under a new name |
| 3f Rejected families (short-term chart setups, runner chasing, RPO/contract/supplier/E1 variants) | `data/strategy-library.json`, comeback board `comeback-core.mjs` | yes | OFF | n/a | frozen adverse verdicts preserved | none | forward-only comeback evidence; never re-run until pass |
| 3g Generic analogs / AI confidence as win probability | none | n/a | must stay absent | not deployed | n/a | must not be built | any "probability" shown must come from a frozen rule's own counted forward/backtest record |

## Row 4: Fast signal/holding path (precomputed evidence + fresh data, existing adopted rules)

| Item | Source/caller + pin | Reviewed | Default | Deployed | Authentic witness | Missing connection | Next completion evidence |
|---|---|---|---|---|---|---|---|
| 4a Protective SELL reasons (stop, halal fail, NT 10-K/10-Q 90d, 8-K 3.01 60d, TIME EXIT, TARGET) | `scan.mjs:34–40` danger filings; `trySmallCloseFlags` 2456; `ldipCloseFlags` 2580; posVerdict build | yes (stop-alert validity package, short-history exit fix 24 Oct) | ON | yes, nightly scan | nightly ACTIONS delivered (13 Nov); a real SELL delivery was not separately established in my review window | exits are evaluated at the close by the nightly scan (21:30 UTC) plus the morning pre-market pass; there is no intraday/after-hours exit evaluation outside watcher hours | a witnessed SELL line for an actual exit condition, or a synthetic-to-real reconciliation over the next exit event; must stay independent of any slow research job |
| 4b Per-horizon policy | SHORT: no proven rule (no live BUY lane). MID: PB12 target/time, no stop (as tested). LONG: V15 labelled + core SPUS 54/IAUM 46 monthly | yes | as stated | yes | ACTIONS lane lines | distinct exit policy per horizon already holds; F1/F7 owner decisions open | none beyond F1/F7 |
| 4c Halal gate at send time | `pb`/`gateLines` (ZAD ok only); F2 `ad78328e` per-attempt `still(now)` recheck | yes | F2 not deployed | partial (send-time recheck not deployed) | n/a | F2 waits for the post-recovery composition | composed-tree suite + owner-approved release |
| 4d Freshness at send | per-attempt send evidence (`telegram(text, buttons, currentEvidence)`), BUY NOW <20 min (R1 rev16) | yes | ON in released paths | yes (Stage 1) | Stage 1 U1/criterion 4 PASS | Stage 2 dependencies not deployed | Stage 2 recovery (GitHub Support case) and separate approval |

## Row 5: Concise owner notifications (inventory: `row5-senders.md`, main `24f215d9`, read-only)

Gate state on main: no gating key is set in `data/settings.json`, so the defaults apply (quiet/opportunitiesOnly/focus/radar/runners ON, alerts=all).

| Class | Rows | Recommendation |
|---|---|---|
| S protective SELL/holding | 6 | KEEP. 3 mixed senders (`scan.mjs:4335` market-hours check, `news-watch.mjs:110` NEWS DECISIONS, `premarket-check.mjs:85`) should push only their SELL/stop lines; HOLD/NO BUY context goes to the report |
| A qualified BUY | 3 | KEEP for approved lanes. The nightly ACTIONS (`scan.mjs:4234`) pushes even on routine NO BUY nights; push only when TODAY'S ACTIONS has a buy/sell or CRITICAL is set; the Tue/Thu/Fri scorecard goes to the report |
| C critical coverage | 5 | KEEP (RUN FAILED for bot/main/ignition/calendar, WATCHDOG, data-load failure, SYSTEM HEALTH when a problem affects plans/holdings) |
| P plan change/expiry | 0 standalone | basket rebalance notice sits inside the basket reminder (KEEP) |
| REPLY to owner commands | 4 | KEEP (not pushes) |
| QUIET, already gated/manual | 23 | KEEP as is |
| QUIET, still pushing | 23 | NEEDS CODE CHANGE: route to stored report |

Highest-volume QUIET pushes under the defaults (verified at source):
1. `intraday-radar.mjs:264` EARLY-WAVE RADAR: BUY, up to 36 runs a weekday. The BUY variant bypasses `QUIET`, and it is not an approved lane.
2. `news-watch.mjs:80` MARKET SHOCK / MARKET NEWS, up to 40 runs a weekday. No switch controls it, and it mostly says "hold everything".
3. `early-alerts.mjs:147` (via `ignition-watch.mjs:203`) RESEARCH LEAD / PAPER SETUP, up to 5+4 a day (alerts default `all`).
4. `ignition-watch.mjs:169` IGNITION ALERT | FAST DAY TRADE, up to 6 a day. It is not an owner lane.
5. Daily repeats: opportunity radar midday and after the close; MORNING ACTIONS `scan.mjs:1944` (a repeat of the nightly ACTIONS); MARKET OPEN CHECK `scan.mjs:4329`; `fastmover-lab.mjs:291`; `octopus.mjs:166`.

Other findings:
- Options entry tickets `scan.mjs:2846` (OPTIONS TRIAL TICKET) and `:2872` (lane ticket) still push real "In ZAD ... BUY CALL" instructions, while CLAUDE.md §2 says options are PAPER from 28 Oct. Already covered by the accepted dev fix (options entry suppression, policy defect), which is not deployed. The real-option SELL notice `scan.mjs:2841` stays KEEP.
- Six weekly study senders get past quiet on PROMISING/changed/warning verdicts. Eleven research workflows push RUN FAILED from `if: failure()`. Both are QUIET; health.mjs already reports stale outputs.
- Sunday scoreboard `scan.mjs:655` and the Friday options message `:4235` have no switch: QUIET.

Next completion evidence: one notification-policy change (a single push classifier at the `telegram()` wrapper `scan.mjs:1044`, plus per-sender routing), with tests asserting that each QUIET sender writes to the report store and does not push, and that every S/C sender still pushes. Development only; no Telegram sends; release under separate approval.

## Row 6: Outcome learning

| Item | Source/caller + pin | Reviewed | Default | Deployed | Authentic witness | Missing connection | Next completion evidence |
|---|---|---|---|---|---|---|---|
| 6a Lane ledgers (calls, fills, exits) | `data/leaderdip-ledger.jsonl`, `data/tier2-ledger.jsonl`, `data/alpaca-paper.json` (paper); `lessons.json` demotion | yes | ON | yes | ledger rows exist | owner fills are recorded only via `bought/sold` commands; no-fills and edits are not captured as separate events; posVerdict is published (P1-H privacy) | add explicit no-fill/edit events to the private ledger; move the owner-derived parts private (Route A) |
| 6b Candidate funnel and missed-opportunity denominator | `data/opp-ledger.jsonl`, `data/opp-days.jsonl`, shadow stream `data/shadow/*.jsonl.gz`, `shadow-eval.mjs`, radar-v3 ledger, Codex `discovery-journal.jsonl` assessment-cycle rows (carrier, not deployed) | yes | ON (shadow), carrier OFF | partly | shadow and radar ledgers written daily | per-source reliability is not computed; the missed-runner denominator exists for the radar only | one source-reliability table keyed by source id and horizon, computed from frozen ledgers |
| 6c Challengers | `rank-models.mjs` A/B/C/D + R/R0 (frozen 28 Oct, verdict after 20 sessions), league (`league.mjs`), comeback board | yes | shadow only | yes | counting since 29 Oct | the verdict is due after 20 sessions, then a separate confirmation period | verdict at session 20; never an automatic promotion |
| 6d No automatic live rule rewrite | policy (CLAUDE.md §4/§9) | yes | enforced by process | n/a | n/a | no code-level guard that blocks a lab from writing a live-lane setting | optional: a test asserting that no lab writes `settings.json` or the lane constants |
