# HISTORY-03 regression harness (synthetic, offline)

**Reviewer:** Claude.

A regression harness for the highest-priority claim findings, for Codex to integrate. It drives the actual code: `scan.mjs` through the repository's own `test/load-scan.mjs`, plus the actual radar and early-alert builders and `opp-mode.mjs`. It uses synthetic fixtures and the repository's own test fixtures, lifted verbatim. Nothing is fetched (the loader refuses every non-local request), nothing is sent, and no owner data is used. Runtime and mentor files are not modified.

```
node --test docs/history-03/harness/*.test.mjs                       # Node 20 and 22: 30 tests, 19 pass, 0 fail, 11 todo on main f6a9b166
HISTORY03_TREE=/path/to/checkout node --test docs/history-03/harness/*.test.mjs   # run against another checkout
```

## Three kinds of test, kept apart

| Kind | Meaning on main `f6a9b166` | After Codex's repair |
|---|---|---|
| **[CURRENT POLICY]** | Behaviour that is correct under the owner's written policy. Passes. | Must keep passing (regression gate). |
| **[FINDING Xnn]** | Characterizes the defect as it is today. Passes. | Starts failing, which proves the repair landed. Delete it then. |
| **[PROPOSED Xnn]** | The corrected behaviour, using the proposed wording from `RANKED-FINDINGS-v3.md`. Marked `todo`: reported, never fails the run. | Remove `todo`; it becomes the gate. |

Tests marked **(owner Pn)** encode a *proposed* policy that depends on an owner answer (P1-P4 in `CLOSURE-CHECKLIST.md`). They must not become gates before the owner decides. Every other PROPOSED test encodes wording only.

## Coverage

| Area | Test | Finding | Kind | Owner question |
|---|---|---|---|---|
| Paper vs approved | early paper alerts not sent while opportunitiesOnly is on | D15 | CURRENT POLICY | - |
| Paper vs approved | radar A/B labelled NOT AN APPROVED BUY; hard blocks never leads | B29 | CURRENT POLICY | - |
| Delivery counts | DELIVERED equals the names actually present in sent early-alert messages | B32 | CURRENT POLICY | - |
| Conflicting advice | TAKE PROFIT OPTION gate and rebuy reply agree (A-SWR1 NOT PROVEN) | D01 (ERRATA-01) | CURRENT POLICY | - |
| Conflicting advice | both change together when the switch is admitted at tier 2 | D01 (ERRATA-01) | CURRENT POLICY | - |
| Supported sell reasons | danger-filing SELL reasons quote the frozen Squad 29 numbers | D10 | CURRENT POLICY | - |
| Delivery counts | radar panel C prints the shared counter as "APPROVED ... tested alerts sent"; the counter is incremented before the send check and for early paper alerts | B01 / D15 | FINDING + PROPOSED | - |
| Paper vs approved | the early paper alert body carries a BUY line | C01 | FINDING + PROPOSED | P1 |
| Paper vs approved | a tier-2 DISCOVERED rule prints "- BUY" with focus on and `tier2` unset | D06 | FINDING + PROPOSED | P4 |
| Wording | tier-2 switch option says "tested / passed on 5 years" | D01 (ERRATA-01) | FINDING + PROPOSED | (P3 for keeping the option) |
| Wording | `ways` stale plan | W01 | FINDING + PROPOSED | owner confirms text |
| Wording | HELP "every proven buy" | W04 | FINDING + PROPOSED | - |
| Wording | `longterm` "S&P 500 beat every method" | W03 | FINDING + PROPOSED | - |
| Wording | ACTIONS "insider buying works" | A01 | FINDING + PROPOSED | - |
| Wording | `check` "proven: stops, trim, switch, avoid rules" | D02 | FINDING + PROPOSED | - |
| Wording | EARNINGS DRIFT card "passed its own 5-year test" | D03 | FINDING + PROPOSED | - |
| Wording | MARKET SHOCK "tested buys … Decided by the system" | B04 / E01 | FINDING + PROPOSED | - |

### Two test methods

- **Rendered:** most tests render the real text through the loader with synthetic files. Examples: `waysText`, `HELP`, `longTermLines`, `sixAngles`, `actionsText`, `swTier` / `rebuyText`, `buildMidday`, and the early-alert `process` / `finish` / `scorecardText`.
- **Source contract:** five assertions read source text instead, because their paths cannot be driven offline without a live market session:
  - the watcher counter order (B01);
  - the early-alert body (C01);
  - the hard-coded TAKE PROFIT strings (D01);
  - the EARNINGS DRIFT card (D03, which needs an earnings-drift candidate);
  - news-watch (E01).

  When Codex repairs these, the matching PROPOSED test should preferably be rewritten to render the actual message.

## Self-check (`mutation-check.py`)

The script applies the proposed W04, W03 and A01 wording to a throwaway copy (never the real tree). Running the harness against that copy gives 16 pass, 3 fail and 11 todo: the three repaired FINDING tests fail and their PROPOSED tests pass. This shows the tests detect the repairs.

## Integration notes for Codex

- **Moving the files:** to run in CI, copy `_env.mjs` and the two `*.test.mjs` files into `test/` (for example as `test/history03-*.test.mjs`) and change `REPO` in `_env.mjs` to `path.join(here, '..')`. `HISTORY03_TREE` still overrides it.
- **CI loop:** the loop runs each file as `node "$f"`. `todo` tests do not fail that run.
- **Retirement:** retire each FINDING test in the same commit as its repair, and remove `todo` from the matching PROPOSED test.
- **Policy-dependent tests:** keep the (owner Pn) PROPOSED tests as `todo` until the owner answers.
- **Corrections:** D01's scope is corrected in `../ERRATA-01.md`.
