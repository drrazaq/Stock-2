# HISTORY-03 closure checklist

Production source: main `f6a9b1668d0591cf24a734034949b96b241fe35b`. Branch `claude/history-03-claims` (documentation only).

## The acceptance criterion

> Catalogue each user-facing numerical/tested/proven/unseen claim, exact source/selection window, cost/hold basis and coverage. Authenticate/reproduce with separate audited evidence where possible; qualify unsupported claims without rewriting frozen results.

## Status by part

| Part | Status | Evidence |
|---|---|---|
| Catalogue every extracted user-facing claim string | DONE (documentation) | 1212 strings: 115 part of catalogued claims, 989 reviewed acceptable, 108 not a claim, 0 not reviewed (`COVERAGE.md`, `source-inventory-v3.json`) |
| Exact source, selection window, cost/hold basis, coverage per claim | DONE, with gaps listed | 100 records (`claims-catalogue.json`, `all-claims.json`); every MISSING field in `PROVENANCE-REGISTER.md` |
| Qualify unsupported claims | PROPOSED, NOT APPLIED | Proposed wording per finding in `RANKED-FINDINGS-v3.md`; vocabulary in `EVIDENCE-VOCABULARY-v2.md`. Applying it is Codex's runtime work. |
| Authenticate / reproduce with separate audited evidence | NOT DONE (external) | Traced to artifacts only; stored-row checks in `PROVENANCE-REGISTER.md`. No recomputation from raw prices. |
| Frozen results preserved | YES | No frozen result, rule, gate, ledger or data file was changed; every proposal keeps NOT PROVEN / REJECTED as recorded |

## Findings to date

**65 ranked corrections:** GATE_OR_DECISION 12, PROVENANCE_ONLY 7, WORDING_ONLY 46.

**Gate or decision items:** B01, D01, D15, B03, X01, B02, C01, D06, B13, X04, C04, E03.

## Remaining items, by owner

### Owner (decisions, not engineering)

- [ ] **P1:** May a forward PAPER record alone (e.g. 20+ trades positive at 1.5x costs, or 30+ trades positive) trigger a trade suggestion or a BUY wording, before the rule passes its history test?
- [ ] **P2:** May the per-stock "past-trade check" (okEv: 30+ out-of-sample trades on the stock >= +0.4%, or 15+ >= +1.5% and half won) admit engine BUY candidates when focus is off, given that its only test (hunting-lab persistence) was inconclusive and pointed the wrong way?
- [ ] **P3:** May a below-the-luck-bar (NOT PROVEN, tier-2 level) result still produce sell suggestions on real holdings (TAKE PROFIT OPTION: sell, buy back 10% lower), given that TRY SMALL buys were moved to paper on 27 Oct?
- [ ] **P4:** Are the tier-2 CHAIN, DISCOVERED, FOLLOWING and CATALYST RUN-UP lanes and the AUTO-DISCOVERED live-paper rules owner lanes that may print a plain BUY (settings.tier2 is unset, so they are on), or should they be paper like TRY SMALL?
- [ ] Confirm the automatic stop default for new own-pick buys (B13 / D12; the current study choice is 35%).
- [ ] Confirm the `ways` text describes the current plan (W01).

### Codex (runtime; not edited here)

- [ ] **Counting:** split the alert counter (approved vs early paper; sent vs recorded) and fix the radar wording (B01 / D15).
- [ ] **After P3:** gate or re-word the TAKE PROFIT OPTION against the rebuy study verdict (D01).
- [ ] **After P4:** align the tier-2 / AUTO-DISCOVERED BUY lines with the policy (D06).
- [ ] **After P1:** align the early-paper alert body, intraday-radar graduation, octopus and deals wording (B02 / C01 / C04 / X01 / X04 / E03).
- [ ] **Wording repairs** in `RANKED-FINDINGS-v3.md`, in ranked order (W01, A01, D03, W03, W04, W07, B04, D02, E01, W08, A04, B05, D08, A05, S07, W02, A02, D05, D04, W06, S02, W09, A03, W05, B09, B08, X02, X03/B12, X07, C03, B06, W16, B07, E02, S03, D14, E04, W11, W12, C02, D12, A09, A08, W15, A12, A10), each with a test asserting the new wording.
- [ ] **Provenance:** cite or drop the hard-coded figures (B10, B11, D03 "+1.8% / 176", D13, W13). Update library status C-FADE1 ("not yet wired", D07).
- [ ] **Proposal:** store every trade (including `max` and `gone` exits) in `agent-a-tgt-lab.mjs` outputs, so the LEADER DIP numbers become reproducible from stored rows. This is a proposal only; frozen results stay.

### External evidence (separately authorized run)

- [ ] Reproduce, from the 5-year price cache, the numbers the owner acts on:
  - LEADER DIP A-TGT-TGT20-PB12: win 72.7% / 74.6%, worst −55.6%, 3-slot replay per year;
  - Basket 1 (SQ10-SH10): 16.7% vs 12.2% a year;
  - the danger-filing SELL-WARNINGs (SQ29-F4, SQ29-F6);
  - the EARNINGS DRIFT verdict;
  - the rebuy STRETCH / SPIKE LOWER10 results;
  - the insider-study halves.
- [ ] Any claim that cannot be reproduced gets the NOT REPRODUCED qualifier instead of a number.

### Verification after repairs (reviewer)

- [ ] Re-render with `tools/render-messages.mjs`, `render-research.mjs`, `render-decisions.mjs`, `render-radar-alerts.mjs` and `render-sunday-labs.mjs` on the repaired commit.
- [ ] Re-extract with both extractors and rebuild with `build-audit.py`.
- [ ] Confirm that no ranked wording remains and no new unqualified claim was added (exact anchor search).
- [ ] Run the repository test suite on the repaired commit.
- [ ] Then update the HISTORY-03 row of the acceptance closure board. Owner: Codex, with this checklist as the evidence.

## Closure decision

**HISTORY-03 stays OPEN.** The documentation part (catalogue, provenance, ranked corrections, vocabulary) is complete for every extracted string. Closure still needs:
- the owner's policy answers (P1-P4);
- Codex's wording and gate repairs, with tests;
- independent reproduction of the acted-on numbers, or explicit NOT REPRODUCED qualifiers.
