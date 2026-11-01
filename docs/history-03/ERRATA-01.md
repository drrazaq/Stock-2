# HISTORY-03 erratum 01: finding D01 (TAKE PROFIT OPTION)

**Reviewer:** Claude.

**Status:** this erratum supersedes the D01 description in `BATCH4-FINDINGS.md`, `all-claims.json`, `RANKED-FINDINGS-v3.md` and `CLOSURE-CHECKLIST.md` (all at `61d1cf1b`). Those files are left unchanged, to keep the published catalogue stable.

## What was wrong

Batch 4 said the holdings review raises the TAKE PROFIT OPTION "for every stretched or spiking holding … without checking the study verdict", and that "the owner gets opposite guidance from two replies". **That is incorrect.**

## What the code does (main `f6a9b166`)

- **Stretch / spike detection requires the gate.** In `scan.mjs:2233`, `stretch` and `spike` each require `swWins(RBr('STRETCH/LOWER10'))` (or the SPIKE equivalent). `swWins` is `!!swTier(r)` (`scan.mjs:391-404`).
- **The gate is strict.** `swTier` returns a tier only when every one of these holds:
  - the switch study's own A-SWR1 verdict for that trigger is TRADABLE SMALL or PROVEN;
  - tier 2 is on;
  - the rebuy result is BELOW THE LEAGUE BAR, with t at or above the tier-2 bar in both halves, positive results in both halves, and positive results without the 2 best trades;
  - the stress result is positive;
  - neither the tier-2 ledger nor the switch paper record is negative.
- **The rebuy reply uses the same gate.** Its decision line (`scan.mjs:268`) also uses `swWins`. The two replies cannot disagree.
- **On committed data the gate is closed.** `data/agent-a-lab.json` has A-SWR1/STRETCH/LOWER10 = NOT PROVEN and A-SWR1/SPIKE/LOWER10 = NOT PROVEN. So `swTier` returns null for both, no TAKE PROFIT OPTION fires, and the rebuy reply says "no switch beat holding". The harness checks both states: `[CURRENT POLICY] conflicting advice` (two tests).

## Corrected D01

| Field | Corrected value |
|---|---|
| Defect type | WORDING_ONLY (latent), not GATE_OR_DECISION |
| Severity | LOW-MEDIUM, not HIGH |
| What remains | 1. A hard-coded line in the ideas list (`scan.mjs:223`) says "Sell a stretched stock, buy back 10% lower: passed on 5 years of history; LIVE PAPER CHECK running …", which is untrue while A-SWR1 is NOT PROVEN. 2. If the gate opens at tier 2 (still below the luck bar), the option text says "tested on 5 years of history" (`scan.mjs:2325`) and "Tested on 5 years of the whole market … beat holding" (`:2235`). It should say NOT PROVEN (below the luck bar). The study also covers 4.5 years, not 5. |
| Owner question P3 | Still valid as a policy-alignment question (may tier-2, below-bar results drive sell options after TRY SMALL buys went to paper on 27 Oct?), but not urgent: no conflict exists today. |

## Effect on the other files

- **Gate / decision items:** the ranked list now has 11 instead of 12. D01 moves to the wording group.
- **`CLOSURE-CHECKLIST.md`:** the item "After P3: gate or re-word the TAKE PROFIT OPTION" now means: re-word the tier-2 option and the ideas-list line; the gating itself already exists.
- **Harness:** `[FINDING D01]` and `[PROPOSED D01]` in `harness/claims-findings.test.mjs` test the corrected scope.

## How the error happened

I read the line that sets `verdict = 'TAKE PROFIT OPTION'` (`:2234`) without reading the `stretch` / `spike` definitions on the line before it. Building the regression harness exposed this: the conflicting-advice tests have to drive the real gate.
