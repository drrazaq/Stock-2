# One evidence vocabulary (proposed)

Use exactly these terms in owner messages. Every number carries its basis: trades, days, period, cost. Results are never re-worded upward, and NOT PROVEN / REJECTED stay as recorded.

| Term | Meaning | Replaces (current wording) |
|---|---|---|
| **PROVEN** | Every handbook gate passed in both halves (profit after costs, beats the average stock, the same stock on other days and SPY, without its 2 best trades, block t >= 2.5, n >= 20 per half) and beyond the luck bar. Nothing is PROVEN today. | "proven" for any weaker bar; "proof"; "fully proven" |
| **TRY-SMALL BAR** | The lower handbook bar (section 4.5). Still NOT PROVEN. | "made money in both test halves" |
| **NEWER-HALF PASS** | Passed only the newer half (tier 2 "TRADABLE SMALL"). NOT PROVEN. | "provisionally promising"; "passed on the newer half"; "TRADABLE SMALL" without NOT PROVEN |
| **REJECTED** | Failed its frozen test. Kept as recorded. | (unchanged) |
| **NOT PROVEN** | Neither PROVEN nor REJECTED, or too few trades. Kept as recorded. | (unchanged) |
| **PAST-TRADE CHECK** | Per-stock out-of-sample check on that stock's own history (okEv). Not a test of the rule. | "30+ unseen trades"; "tested-rule buys"; "proven buy"; "has proof" |
| **BACK-TESTED** | A historical test was run; always followed by its result word (PROVEN / REJECTED / NOT PROVEN). | bare "tested" ("tested buys", "tested stop", "tested exit", "tested AVOID") |
| **PAPER RECORD** | Forward paper trades after the rule was fixed: always with trades, days and the cost basis; "too early" under 30 trades on 10+ days. | "POSITIVE so far" without counts; "earned it on paper"; "proven on paper" |
| **RESEARCH ONLY** | Not a buy, not an instruction. | "buy day / sell day" on rejected rules; "Ride it" |
| **APPROVED** | Reserved for signals from rules that passed the history test AND whatever the owner's policy requires (P1). Counts must exclude paper alerts. | "tested alerts" counted as approved |
| **YOUR LANE (NOT PROVEN)** | Owner-chosen lanes shown as actions by the owner's decision (LEADER DIP, LONGER HOLDS, EARNINGS DRIFT); always labelled NOT PROVEN. | "tested buys in ACTIONS"; "proven buys" for lane picks |

Applying this vocabulary is a cross-file wording change for Codex (scan.mjs, autolab.mjs, intraday-radar.mjs, news-watch.mjs, radar-v3-core.mjs, ignition-watch.mjs, octopus.mjs, stops.mjs, exits.mjs, horizons.mjs, rebuy.mjs, early-alerts.mjs). It changes no rule, gate or frozen result. APPROVED stays undefined beyond "passed the history test" until the owner answers P1.
